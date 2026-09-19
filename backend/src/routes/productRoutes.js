import express from "express";
import { searchProducts, addProduct, getProduct, getTrackedProducts } from "../services/productService.js";

const router = express.Router();

// GET /api/products/search?q=
router.get("/search", async (req, res) => {
    try {
        const query = req.query.q?.trim() || "";
        if (!query) return res.json([]);
        const products = await searchProducts(query);
        res.json(products);
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({ error: "Failed to search products" });
    }
});

// POST /api/products
router.post("/", async (req, res) => {
    try {
        const { name, url, imageUrl, current_price, current_stock } = req.body;
        if (!name || !url) {
            return res.status(400).json({ error: "name and url are required" });
        }
        const product = await addProduct({ name, url, imageUrl, current_price, current_stock });
        res.status(201).json(product);
    } catch (error) {
        if (error.code === "DUPLICATE_PRODUCT") {
            return res.status(409).json({
                error: "Product with this URL is already tracked",
                product: error.existing
            });
        }
        console.error("Add product error:", error);
        res.status(500).json({ error: error.message || "Failed to add product" });
    }
});

// GET /api/products
router.get("/", async (req, res) => {
    try {
        const products = await getTrackedProducts();
        res.json(products);
    } catch (error) {
        console.error("Get products error:", error);
        res.status(500).json({ error: "Failed to load products" });
    }
});

// GET /api/products/:id
router.get("/:id", async (req, res) => {
    try {
        const product = await getProduct(req.params.id);
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json(product);
    } catch (error) {
        console.error("Get product error:", error);
        res.status(500).json({ error: "Failed to load product" });
    }
});

export default router;