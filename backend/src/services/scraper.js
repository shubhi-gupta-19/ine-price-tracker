import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import os from "os";
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

async function ensureTempVideoDirectory() {
    const directory = path.join(os.tmpdir(), "ine-price-tracker-videos");
    await fs.mkdir(directory, { recursive: true });
    return directory;
}

async function handleInteractiveChallenge(page) {
    try {
        const priceBlock = page.locator(".price-block").first();
        await priceBlock.waitFor({ state: "attached", timeout: 8000 }).catch(() => { });

        if (await priceBlock.count() === 0) return;

        // Remove cookie overlays or banners if present
        await page.evaluate(() => {
            const overlay = document.querySelector(".cookie-overlay");
            if (overlay) overlay.remove();
            const btns = Array.from(document.querySelectorAll("button"));
            const cookieBtn = btns.find(b => /accept|agree|dismiss/i.test(b.innerText || ""));
            if (cookieBtn) cookieBtn.click();
        }).catch(() => { });

        // If price is already revealed, nothing more needed
        if (await page.locator(".price-block.price-success").count() > 0) {
            return;
        }

        // Scroll price block into view and wait for layout to settle
        await priceBlock.scrollIntoViewIfNeeded().catch(() => { });
        await page.waitForTimeout(300);

        // Target reveal or try-again buttons
        const revealBtn = page.locator("button, [role='button']").filter({ hasText: /reveal|try again/i }).first();

        // Perform mouse wiggle challenge (retry up to 3 times if needed)
        for (let attempt = 0; attempt < 3; attempt++) {
            if (await page.locator(".price-block.price-success").count() > 0) {
                break;
            }

            const box = await priceBlock.boundingBox();
            if (box && (await revealBtn.count() > 0)) {
                // Move to center of price-block to trigger mouseenter
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

                // Move across the box with step intervals >= 60ms to satisfy minMoves & minDwellMs
                for (let i = 0; i < 25; i++) {
                    const targetX = box.x + 20 + ((i * 23) % Math.max(20, Math.floor(box.width - 40)));
                    const targetY = box.y + 15 + ((i * 13) % Math.max(15, Math.floor(box.height - 30)));
                    await page.mouse.move(targetX, targetY);
                    await page.waitForTimeout(70);

                    const disabled = await revealBtn.isDisabled().catch(() => true);
                    if (!disabled) {
                        break;
                    }
                }
            }

            // Click the button once enabled
            if (await revealBtn.count() > 0 && !(await revealBtn.isDisabled().catch(() => true))) {
                await revealBtn.click().catch(() => { });

                // Wait for success or transient error
                try {
                    await page.locator(".price-block.price-success").first().waitFor({ state: "visible", timeout: 8000 });
                    return;
                } catch {
                    const isError = await page.locator(".price-block.price-error").count() > 0;
                    if (isError) {
                        await page.waitForTimeout(500);
                        continue;
                    }
                }
            }
        }

        // Final wait for success state
        await page.locator(".price-block.price-success").first().waitFor({ state: "visible", timeout: 4000 }).catch(() => { });
    } catch (e) {
        logInfo("Interactive challenge notice: " + e.message);
    }
}

export const CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu"
];

export async function launchBrowserWithRetry({
    headless = true,
    args = CHROMIUM_ARGS,
    maxAttempts = 3,
    initialBackoffMs = 1000,
    launcher = chromium
} = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            logInfo(`Launching Chromium browser (attempt ${attempt}/${maxAttempts})...`, { headless });
            const browser = await launcher.launch({
                headless,
                args
            });
            return browser;
        } catch (error) {
            lastError = error;
            logError(`Chromium launch attempt ${attempt}/${maxAttempts} failed: ${error.message}`, {
                error: error.message,
                stack: error.stack,
                attempt
            });

            if (attempt < maxAttempts) {
                const backoffMs = initialBackoffMs * Math.pow(2, attempt - 1);
                logInfo(`Waiting ${backoffMs}ms before retrying Chromium launch...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }
    }

    const launchError = new Error(`Chromium launch failed after ${maxAttempts} attempts: ${lastError?.message || "Unknown error"}`);
    launchError.name = "BrowserLaunchError";
    launchError.code = "browser_launch_failure";
    throw launchError;
}

export async function scrapeProduct(url, options = {}) {
    let browser = null;
    let context = null;
    let page = null;
    try {
        // Enforce headless mode in server environments without DISPLAY (e.g., Linux container on Render)
        const isServerWithoutDisplay = process.platform === "linux" && !process.env.DISPLAY;

        let headless = true;
        if (isServerWithoutDisplay) {
            headless = true;
            logInfo("Headless server environment detected (missing X server or $DISPLAY); forcing headless mode.");
        } else if (process.env.HEADLESS !== undefined) {
            headless = String(process.env.HEADLESS).toLowerCase() !== "false";
        } else if (config && typeof config.headless === "boolean") {
            headless = config.headless;
        }

        // Only allow headed mode if not on a server environment without DISPLAY
        if (!isServerWithoutDisplay && (options.headed === true || String(options.headed).toLowerCase() === "true")) {
            headless = false;
        }

        // Normal headless production scraping must NEVER create a video file or video directory.
        // Only an explicit headed=true local run should create a temporary recording.
        const isHeadedExplicit = options.headed === true || String(options.headed).toLowerCase() === "true";
        const shouldRecord = !isServerWithoutDisplay && (isHeadedExplicit || options.recordVideo === true);
        const videoDirectory = shouldRecord ? await ensureTempVideoDirectory() : undefined;

        browser = await launchBrowserWithRetry({
            headless,
            args: CHROMIUM_ARGS,
            maxAttempts: options.maxLaunchAttempts || 3,
            initialBackoffMs: options.launchRetryDelayMs || 1000
        });

        context = await browser.newContext({
            recordVideo: shouldRecord ? { dir: videoDirectory, size: { width: 1280, height: 720 } } : undefined,
            viewport: { width: 1280, height: 720 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
        });

        page = await context.newPage();
        page.setDefaultTimeout(config.scrapeTimeout || 10000);
        const startTime = Date.now();
        logInfo("Opening product page", { url });

        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.scrapeTimeout || 10000 });
            await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {
                logInfo("networkidle timeout; continuing with DOM inspection");
            });
        } catch (navErr) {
            const navError = new Error(`Navigation failed for ${url}: ${navErr.message}`);
            navError.name = "NavigationError";
            navError.code = "navigation_failure";
            throw navError;
        }

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
            const structError = new Error("PRICE_SELECTOR_NOT_FOUND");
            structError.code = "selector_missing";
            throw structError;
        }

        const price = parsePrice(priceResult.text);
        if (price === null) {
            const parseError = new Error("PRICE_COULD_NOT_BE_PARSED");
            parseError.code = "price_parse_failure";
            throw parseError;
        }

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

        let videoPath = null;
        const video = page.video();
        if (context) {
            await context.close().catch(() => {});
            context = null;
        }

        if (video) {
            try { 
                videoPath = await video.path(); 
                if (videoPath) {
                    console.log(`\n🎥 Headed video recorded at: ${videoPath}\n`);
                    logInfo("Headed video recorded", { videoPath });
                }
            } catch { 
                videoPath = null; 
            }
        }

        return { ...result, videoPath };
    } finally {
        if (context) {
            try { await context.close(); } catch { }
        }
        if (browser) {
            try { await browser.close(); } catch { }
        }
    }
}