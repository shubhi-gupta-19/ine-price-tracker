import express from "express";
import { config } from "../config/env.js";
import { getDueProducts } from "../db/index.js";
import { scrapeProductById } from "../services/scrapeService.js";

const router = express.Router();

async function handleCronScrape(req, res) {
    try {
        const incomingSecret = req.headers["x-cron-secret"];
        const expectedSecret = config.cronSecret || process.env.CRON_SECRET;

        if (!expectedSecret || incomingSecret !== expectedSecret) {
            return res.status(401).json({ error: "Unauthorized: Invalid or missing x-cron-secret" });
        }

        const now = new Date().toISOString();
        const dueProducts = await getDueProducts(now);

        console.log(`[CRON] Found ${dueProducts.length} products due for scraping at ${now}`);

        const results = [];
        for (const product of dueProducts) {
            try {
                console.log(`[CRON] Processing product: ${product.name} (${product.id})`);
                const result = await scrapeProductById(product.id);
                results.push({
                    productId: product.id,
                    name: product.name,
                    status: "success",
                    price: result.result?.price,
                    inStock: result.result?.inStock,
                    attempt: result.attempt
                });
            } catch (error) {
                console.error(`[CRON] Failed scraping product ${product.id}:`, error.message);
                // Continue processing remaining products
                results.push({
                    productId: product.id,
                    name: product.name,
                    status: "failed",
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            timestamp: now,
            dueCount: dueProducts.length,
            processedCount: results.length,
            results
        });
    } catch (error) {
        console.error("[CRON] General failure:", error);
        res.status(500).json({ error: "Cron execution failed", details: error.message });
    }
}

// POST /api/cron/scrape (and backward-compatible /scrape-due)
router.post("/scrape", handleCronScrape);
router.post("/scrape-due", handleCronScrape);

export default router;