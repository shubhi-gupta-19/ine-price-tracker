import { config } from "../config/env.js";
import { scrapeProduct } from "./scraper.js";
import { sendPriceDropAlert, sendBackInStockAlert } from "./alertService.js";
import {
    getProductById,
    updateProduct,
    createScrapeLog,
    createPriceHistory
} from "../db/index.js";

export async function scrapeProductById(productId, options = {}) {
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
            const isStructureChanged = error.message === "PRICE_SELECTOR_NOT_FOUND";

            // Log attempt
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
                error_type: error.name || "ScrapeError",
                error_message: error.message,
                metadata: {
                    attempt,
                    willRetry: !isFinalAttempt
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