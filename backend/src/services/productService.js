import { searchStoreProducts } from "./catalogService.js";
import {
    getProductById,
    getProductByUrl,
    listProducts,
    createProduct,
    updateProduct
} from "../db/index.js";

export async function searchProducts(query) {
    return await searchStoreProducts(query);
}

export async function addProduct({ name, url, imageUrl = null, current_price = null, current_stock = null }) {
    if (!url) throw new Error("Product URL is required");
    if (!name) throw new Error("Product name is required");

    return await createProduct({
        name,
        url,
        image_url: imageUrl,
        current_price,
        current_stock
    });
}

export async function getProduct(id) {
    return await getProductById(id);
}

export async function getTrackedProducts() {
    return await listProducts();
}