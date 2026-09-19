import { config } from "../config/env.js";

let catalogCache = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

export async function fetchStoreCatalog(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && catalogCache && (now - lastFetchedAt < CACHE_TTL_MS)) {
        return catalogCache;
    }

    const baseUrl = config.storeBaseUrl || "https://demo.inelabteamdev.com";
    try {
        // First get page 1 to check total and pageSize
        const firstRes = await fetch(`${baseUrl}/api/catalog?page=1&pageSize=60`);
        if (!firstRes.ok) throw new Error(`Failed to fetch catalog: ${firstRes.statusText}`);
        const firstData = await firstRes.json();
        const total = firstData.total || 1000;
        const pageSize = firstData.pageSize || 60;
        const totalPages = Math.ceil(total / pageSize);

        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
            pagePromises.push(
                fetch(`${baseUrl}/api/catalog?page=${p}&pageSize=${pageSize}`)
                    .then(r => r.ok ? r.json() : { items: [] })
                    .catch(() => ({ items: [] }))
            );
        }

        const remainingPages = await Promise.all(pagePromises);
        const allItems = [
            ...(firstData.items || []),
            ...remainingPages.flatMap(d => d.items || [])
        ];

        // Format items with canonical store URL
        catalogCache = allItems.map(item => ({
            id: item.id,
            slug: item.slug,
            name: item.name,
            brand: item.brand,
            category: item.category,
            sku: item.sku,
            description: item.description,
            url: `${baseUrl}/product/${item.id}`,
            imageUrl: null
        }));

        lastFetchedAt = now;
        return catalogCache;
    } catch (error) {
        console.error("Error fetching catalog from store:", error.message);
        if (catalogCache) return catalogCache;
        return [];
    }
}

export async function searchStoreProducts(query) {
    if (!query || !query.trim()) return [];
    const normalized = query.trim().toLowerCase();
    const catalog = await fetchStoreCatalog();
    if (!catalog || catalog.length === 0) {
        throw new Error("Unable to retrieve catalog from INE store");
    }

    // Partial search matching name, brand, category, sku, or description
    return catalog.filter(product => {
        const name = (product.name || "").toLowerCase();
        const brand = (product.brand || "").toLowerCase();
        const category = (product.category || "").toLowerCase();
        const sku = (product.sku || "").toLowerCase();
        const desc = (product.description || "").toLowerCase();

        return (
            name.includes(normalized) ||
            brand.includes(normalized) ||
            category.includes(normalized) ||
            sku.includes(normalized) ||
            desc.includes(normalized)
        );
    }).slice(0, 50); // limit to top 50 matches
}
