import express from "express";
import {
    listProducts,
    getProductById,
    getPriceHistoryByProductId,
    getScrapeLogsByProductId
} from "../db/index.js";

const router = express.Router();

// GET /api/dashboard/products
router.get("/products", async (req, res) => {
    try {
        const products = await listProducts();
        res.json(products);
    } catch (error) {
        console.error("Dashboard list error:", error);
        res.status(500).json({ error: "Failed to load tracked products" });
    }
});

// GET /api/dashboard/products/:id
router.get("/products/:id", async (req, res) => {
    try {
        const product = await getProductById(req.params.id);
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json(product);
    } catch (error) {
        console.error("Dashboard get product error:", error);
        res.status(500).json({ error: "Failed to load product details" });
    }
});

// GET /api/dashboard/products/:id/history
router.get("/products/:id/history", async (req, res) => {
    try {
        const history = await getPriceHistoryByProductId(req.params.id);
        res.json(history);
    } catch (error) {
        console.error("Dashboard history error:", error);
        res.status(500).json({ error: "Failed to load price history" });
    }
});

// GET /api/dashboard/products/:id/logs
router.get("/products/:id/logs", async (req, res) => {
    try {
        const logs = await getScrapeLogsByProductId(req.params.id);
        res.json(logs);
    } catch (error) {
        console.error("Dashboard logs error:", error);
        res.status(500).json({ error: "Failed to load scrape logs" });
    }
});

export default router;