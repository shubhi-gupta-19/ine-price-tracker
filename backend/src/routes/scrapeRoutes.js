import express from "express";
import { scrapeProductById } from "../services/scrapeService.js";

const router = express.Router();

// POST /api/scrape/:productId (and /api/scrape/:productId?headed=true)
router.post("/:productId", async (req, res) => {
    try {
        const isHeaded = req.query.headed === "true" || req.query.headed === true;
        const result = await scrapeProductById(req.params.productId, { headed: isHeaded });
        res.json(result);
    } catch (error) {
        console.error("Manual scrape failed:", error.message);
        res.status(500).json({
            success: false,
            error: error.message || "Scraping failed"
        });
    }
});

export default router;