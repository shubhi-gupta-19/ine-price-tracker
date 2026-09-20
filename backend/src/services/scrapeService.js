import { config } from "../config/env.js";
import { scrapeProduct } from "./scraper.js";
import { sendPriceDropAlert, sendBackInStockAlert } from "./alertService.js";
import {
    getProductById,
    updateProduct,
    createScrapeLog,
    createPriceHistory
} from "../db/index.js";

export class AsyncQueue {
    constructor(concurrency = 1) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    run(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.processNext();
        });
    }

    async processNext() {
        if (this.running >= this.concurrency || this.queue.length === 0) return;
        this.running++;
        const { fn, resolve, reject } = this.queue.shift();
        try {
            const result = await fn();
            resolve(result);
        } catch (err) {
            reject(err);
        } finally {
            this.running--;
            this.processNext();
        }
    }
}

export const scrapeQueue = new AsyncQueue(1);

export function classifyScrapeError(error) {
    if (!error) return "unknown";
    const code = String(error.code || "").toLowerCase();
    const name = String(error.name || "").toLowerCase();
    const msg = String(error.message || "").toLowerCase();

    // 1. Browser launch failures
    if (
        code === "browser_launch_failure" ||
        name === "browserlauncherror" ||
        msg.includes("browser has been closed") ||
        msg.includes("failed to connect") ||
        msg.includes("chromium launch failed") ||
        msg.includes("missing x server") ||
        msg.includes("display")
    ) {
        return "browser_launch_failure";
    }

    // 2. Navigation failures
    if (
        code === "navigation_failure" ||
        name === "navigationerror" ||
        msg.includes("navigation failed") ||
        msg.includes("net::err") ||
        msg.includes("err_connection") ||
        msg.includes("err_name_not_resolved") ||
        msg.includes("page.goto")
    ) {
        return "navigation_failure";
    }

    // 3. Price reveal challenge failures
    if (
        code === "price_reveal_failure" ||
        name === "pricerevealerror" ||
        msg.includes("price_reveal_timeout") ||
        msg.includes("interactive challenge") ||
        msg.includes("reveal price")
    ) {
        return "price_reveal_failure";
    }

    // 4. Price parse failures
    if (
        code === "price_parse_failure" ||
        msg.includes("price_could_not_be_parsed") ||
        msg.includes("parse price")
    ) {
        return "price_parse_failure";
    }

    // 5. Selector missing / structure changed
    if (
        code === "selector_missing" ||
        msg.includes("price_selector_not_found") ||
        msg.includes("structure changed")
    ) {
        return "selector_missing";
    }

    return "unknown";
}

export async function scrapeProductById(productId, options = {}) {
    return await scrapeQueue.run(() => executeScrapeProductById(productId, options));
}

async function executeScrapeProductById(productId, options = {}) {
    const product = await getProductById(productId);
    if (!product) throw new Error("Product not found");

    const maxAttempts = config.maxAttempts || 3;
    let lastError = null;
    let lastResult = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const startedAt = new Date();
        try {
            // Pass options (e.g. { headed: true }) to scraper
            const result = await scrapeProduct(product.url, options);
            lastResult = result;

            // 1. Create success log
            const logRecord = await createScrapeLog({
                product_id: product.id,
                attempt_number: attempt,
                status: "success",
                timestamp: startedAt.toISOString(),
                response_time_ms: result.responseTime,
                price: result.price,
                in_stock: result.inStock,
                selector_used: result.priceSelector,
                structure_changed: false,
                video_path: result.videoPath || null,
                metadata: {
                    stockSelector: result.stockSelector,
                    title: result.title,
                    finalUrl: result.finalUrl
                }
            });

            // 2. CRITICAL DATA RULE: Only validated finite prices update data & enter price_history
            if (typeof result.price === "number" && Number.isFinite(result.price)) {
                await createPriceHistory({
                    product_id: product.id,
                    price: result.price,
                    in_stock: result.inStock,
                    scraped_at: new Date().toISOString(),
                    scrape_log_id: logRecord?.id || null
                });

                const previousPrice = product.current_price;
                const previousStock = product.current_stock;
                const nextScrapeAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2-hour schedule

                await updateProduct(product.id, {
                    current_price: result.price,
                    current_stock: result.inStock,
                    last_scraped_at: new Date().toISOString(),
                    next_scrape_at: nextScrapeAt,
                    structure_changed: false
                });

                // Alerts for price drop and back-in-stock
                if (previousPrice !== null && result.price < previousPrice) {
                    await sendPriceDropAlert({ product, oldPrice: previousPrice, newPrice: result.price }).catch(e => console.error("Alert error:", e.message));
                }
                if (previousStock === false && result.inStock === true) {
                    await sendBackInStockAlert({ product }).catch(e => console.error("Alert error:", e.message));
                }
            }

            return {
                success: true,
                productId: product.id,
                attempt,
                result
            };

        } catch (error) {
            lastError = error;
            const isFinalAttempt = attempt === maxAttempts;
            const errorType = classifyScrapeError(error);
            const isStructureChanged = errorType === "selector_missing" || error.message === "PRICE_SELECTOR_NOT_FOUND";

            // Log attempt honestly
            await createScrapeLog({
                product_id: product.id,
                attempt_number: attempt,
                status: isFinalAttempt ? "failed" : "retry",
                timestamp: startedAt.toISOString(),
                response_time_ms: Date.now() - startedAt.getTime(),
                price: null,
                in_stock: null,
                selector_used: null,
                structure_changed: isStructureChanged,
                error_type: errorType,
                error_message: error.message,
                metadata: {
                    attempt,
                    willRetry: !isFinalAttempt,
                    errorType
                }
            });

            if (isFinalAttempt) {
                // CRITICAL DATA RULE:
                // NEVER overwrite valid current_price / current_stock with null, 0, or NaN!
                // If selector missing, mark structure_changed = true and reschedule 2 hours
                const nextScrapeAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
                await updateProduct(product.id, {
                    structure_changed: isStructureChanged,
                    next_scrape_at: nextScrapeAt
                });
            } else {
                // Backoff delay before retry
                const delay = 1000 * attempt;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}