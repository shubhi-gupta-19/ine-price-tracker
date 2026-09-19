import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import { config } from "../config/env.js";
import { parsePrice } from "../utils/priceParser.js";
import { logInfo, logError } from "../utils/logger.js";

const PRICE_SELECTORS = [
    ".price-main [class*='pv-']",
    ".price-main > div:not([style*='display: none'])",
    ".price-main [class*='vpg']",
    "[data-testid='price']",
    ".product-price",
    ".sale-price",
    ".current-price",
    ".price-current",
    ".price:not(.price-block):not(.price-status):not(.price-substatus)"
];

const STOCK_SELECTORS = [
    ".stock-badge",
    ".price-facets .stock-badge",
    "[data-testid='stock']",
    ".stock",
    ".availability",
    ".product-stock",
    "[class*='stock']",
    "[class*='Stock']"
];

const TITLE_SELECTORS = [
    ".detail-info h1",
    "h1",
    "[data-testid='product-title']",
    ".product-title",
    ".product-name"
];

async function findVisibleText(page, selectors) {
    for (const selector of selectors) {
        try {
            const locator = page.locator(selector).first();
            const count = await locator.count();
            if (count === 0) continue;

            const visible = await locator.isVisible();
            if (!visible) continue;

            const text = await locator.innerText();
            if (text && text.trim()) {
                return { text: text.trim(), selector };
            }
        } catch { }
    }
    return null;
}

export function determineStock(stockText) {
    if (!stockText) return null;
    const text = stockText.toLowerCase();
    const outOfStockPatterns = ["out of stock", "sold out", "unavailable", "not available", "0 left"];
    const inStockPatterns = ["in stock", "available", "add to cart", "buy now", "left", "selling fast", "hurry"];

    if (outOfStockPatterns.some(pattern => text.includes(pattern))) return false;
    if (inStockPatterns.some(pattern => text.includes(pattern))) return true;
    return null;
}

async function ensureVideoDirectory() {
    const directory = path.resolve("videos");
    await fs.mkdir(directory, { recursive: true });
    return directory;
}

async function handleInteractiveChallenge(page) {
    try {
        // Wait for potential price block to be mounted
        await page.waitForSelector(".price-block", { timeout: 5000 }).catch(() => { });

        // 1. Clear any cookie/interceptor overlays
        await page.evaluate(() => {
            const overlay = document.querySelector(".cookie-overlay");
            if (overlay) overlay.remove();
            const acceptBtn = Array.from(document.querySelectorAll("button")).find(b =>
                b.innerText.toLowerCase().includes("accept") ||
                b.innerText.toLowerCase().includes("agree") ||
                b.innerText.toLowerCase().includes("dismiss")
            );
            if (acceptBtn) acceptBtn.click();
        }).catch(() => { });

        const priceBlock = page.locator(".price-block").first();
        if (await priceBlock.count() > 0) {
            const isIdle = await page.locator(".price-block.price-idle").count() > 0;
            if (isIdle) {
                await priceBlock.scrollIntoViewIfNeeded().catch(() => { });
                const box = await priceBlock.boundingBox();
                const revealBtn = page.locator("button[aria-label='Reveal price']").first();

                // Extended dynamic mouse movement loop with longer fallback timeout
                let enabled = false;
                for (let i = 0; i < 40; i++) {
                    if (box) {
                        await page.mouse.move(box.x + 40 + (i % 8) * 12, box.y + 30 + (i % 5) * 6);
                    }
                    await page.waitForTimeout(100);
                    const disabled = await revealBtn.isDisabled().catch(() => true);
                    if (!disabled) {
                        enabled = true;
                        break;
                    }
                }

                if (await revealBtn.count() > 0) {
                    await revealBtn.click({ force: true }).catch(() => { });
                }

                // Wait for success or price to appear
                await page.locator(".price-block.price-success").first().waitFor({ state: "visible", timeout: 6000 }).catch(() => { });
            }
        } catch (e) {
            logInfo("Interactive challenge notice: " + e.message);
        }
    }

export async function scrapeProduct(url, options = {}) {
        let browser;
        try {
            const isHeaded = options.headed === true || String(options.headed).toLowerCase() === "true";
            const headless = isHeaded ? false : config.headless;
            const shouldRecord = isHeaded || config.recordVideo;
            const videoDirectory = shouldRecord ? await ensureVideoDirectory() : undefined;

            browser = await chromium.launch({ headless });

            const context = await browser.newContext({
                recordVideo: shouldRecord ? { dir: videoDirectory, size: { width: 1280, height: 720 } } : undefined,
                viewport: { width: 1280, height: 720 },
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
            });

            const page = await context.newPage();
            page.setDefaultTimeout(config.scrapeTimeout || 10000);
            const startTime = Date.now();
            logInfo("Opening product page", { url });

            await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.scrapeTimeout || 10000 });
            await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {
                logInfo("networkidle timeout; continuing with DOM inspection");
            });

            // Handle anti-bot / interactive challenges if present
            await handleInteractiveChallenge(page);

            let productElementFound = false;
            for (const selector of [...PRICE_SELECTORS, ...TITLE_SELECTORS]) {
                try {
                    await page.locator(selector).first().waitFor({ state: "visible", timeout: 2000 });
                    productElementFound = true;
                    break;
                } catch { }
            }

            if (!productElementFound) {
                await page.waitForTimeout(1000);
            }

            const titleResult = await findVisibleText(page, TITLE_SELECTORS);
            const priceResult = await findVisibleText(page, PRICE_SELECTORS);
            const stockResult = await findVisibleText(page, STOCK_SELECTORS);

            const structureChanged = !priceResult;
            if (structureChanged) {
                const bodyText = await page.locator("body").innerText().catch(() => "");
                logError("Possible store structure change", { url, bodyPreview: bodyText.slice(0, 500) });
                throw new Error("PRICE_SELECTOR_NOT_FOUND");
            }

            const price = parsePrice(priceResult.text);
            if (price === null) throw new Error("PRICE_COULD_NOT_BE_PARSED");

            const stock = determineStock(stockResult?.text);
            const responseTime = Date.now() - startTime;

            const result = {
                success: true,
                title: titleResult?.text || null,
                price,
                inStock: stock,
                priceSelector: priceResult.selector,
                stockSelector: stockResult?.selector || null,
                structureChanged,
                responseTime,
                finalUrl: page.url()
            };

            logInfo("Product scraped successfully", result);
            await context.close();

            const video = page.video();
            let videoPath = null;
            if (video) {
                try { videoPath = await video.path(); } catch { videoPath = null; }
            }

            return { ...result, videoPath };
        } finally {
            if (browser) await browser.close();
        }
    }