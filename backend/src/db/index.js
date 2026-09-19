import { supabase } from "../config/supabase.js";

// Test mock is strictly active ONLY when NODE_ENV is "test" or USE_TEST_MOCK_DB is "true"
// In all other environments (production / development), real Supabase PostgreSQL is required.
const isTestMock = process.env.NODE_ENV === "test" || process.env.USE_TEST_MOCK_DB === "true";

// In-memory store ONLY used if explicitly in test mock mode
const testStore = {
    products: [],
    price_history: [],
    scrape_logs: []
};

export async function getProductById(id) {
    if (isTestMock) {
        return testStore.products.find(p => p.id === id) || null;
    }
    const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (error) {
        throw new Error(`Supabase error fetching product by ID: ${error.message}`);
    }
    return data;
}

export async function getProductByUrl(url) {
    if (isTestMock) {
        return testStore.products.find(p => p.url === url) || null;
    }
    const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("url", url)
        .maybeSingle();

    if (error) {
        throw new Error(`Supabase error fetching product by URL: ${error.message}`);
    }
    return data;
}

export async function listProducts() {
    if (isTestMock) {
        return [...testStore.products].sort(
            (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
        );
    }
    const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("updated_at", { ascending: false });

    if (error) {
        throw new Error(`Supabase error listing products: ${error.message}`);
    }
    return data || [];
}

export async function createProduct({
    name,
    url,
    image_url = null,
    current_price = null,
    current_stock = null,
    next_scrape_at = null
}) {
    // 1. Enforce unique product URL
    const existing = await getProductByUrl(url);
    if (existing) {
        const error = new Error("Product with this URL is already tracked");
        error.code = "DUPLICATE_PRODUCT";
        error.existing = existing;
        throw error;
    }

    const nextScrape = next_scrape_at || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const productRecord = {
        name,
        url,
        image_url,
        current_price,
        current_stock,
        last_scraped_at: current_price !== null ? now : null,
        next_scrape_at: nextScrape,
        structure_changed: false,
        created_at: now,
        updated_at: now
    };

    if (isTestMock) {
        const mockRecord = { id: "test-" + Math.random().toString(36).slice(2, 9), ...productRecord };
        testStore.products.push(mockRecord);
        return mockRecord;
    }

    const { data, error } = await supabase
        .from("products")
        .insert(productRecord)
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            const err = new Error("Product with this URL is already tracked");
            err.code = "DUPLICATE_PRODUCT";
            throw err;
        }
        throw new Error(`Supabase error creating product: ${error.message}`);
    }
    return data;
}

export async function updateProduct(id, updates) {
    const now = new Date().toISOString();
    const safeUpdates = { ...updates, updated_at: now };

    if (isTestMock) {
        const idx = testStore.products.findIndex(p => p.id === id);
        if (idx !== -1) {
            testStore.products[idx] = { ...testStore.products[idx], ...safeUpdates };
            return testStore.products[idx];
        }
        return null;
    }

    const { data, error } = await supabase
        .from("products")
        .update(safeUpdates)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        throw new Error(`Supabase error updating product: ${error.message}`);
    }
    return data;
}

export async function createScrapeLog(logData) {
    const logRecord = {
        timestamp: new Date().toISOString(),
        metadata: {},
        structure_changed: false,
        ...logData
    };

    if (isTestMock) {
        const mockLog = { id: "log-" + Math.random().toString(36).slice(2, 9), ...logRecord };
        testStore.scrape_logs.push(mockLog);
        return mockLog;
    }

    const { data, error } = await supabase
        .from("scrape_logs")
        .insert(logRecord)
        .select()
        .single();

    if (error) {
        throw new Error(`Supabase error writing scrape log: ${error.message}`);
    }
    return data;
}

export async function getScrapeLogsByProductId(productId, limit = 100) {
    if (isTestMock) {
        return testStore.scrape_logs
            .filter(l => l.product_id === productId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    const { data, error } = await supabase
        .from("scrape_logs")
        .select("*")
        .eq("product_id", productId)
        .order("timestamp", { ascending: false })
        .limit(limit);

    if (error) {
        throw new Error(`Supabase error loading scrape logs: ${error.message}`);
    }
    return data || [];
}

export async function createPriceHistory(historyData) {
    const record = {
        scraped_at: new Date().toISOString(),
        ...historyData
    };

    if (isTestMock) {
        const mockHist = { id: "hist-" + Math.random().toString(36).slice(2, 9), ...record };
        testStore.price_history.push(mockHist);
        return mockHist;
    }

    const { data, error } = await supabase
        .from("price_history")
        .insert(record)
        .select()
        .single();

    if (error) {
        throw new Error(`Supabase error writing price history: ${error.message}`);
    }
    return data;
}

export async function getPriceHistoryByProductId(productId) {
    if (isTestMock) {
        return testStore.price_history
            .filter(h => h.product_id === productId)
            .sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));
    }

    const { data, error } = await supabase
        .from("price_history")
        .select("id, product_id, price, in_stock, scraped_at, scrape_log_id")
        .eq("product_id", productId)
        .order("scraped_at", { ascending: true });

    if (error) {
        throw new Error(`Supabase error loading price history: ${error.message}`);
    }
    return data || [];
}

export async function getDueProducts(currentTime) {
    const checkTime = currentTime || new Date().toISOString();

    if (isTestMock) {
        return testStore.products.filter(
            p => !p.next_scrape_at || new Date(p.next_scrape_at) <= new Date(checkTime)
        );
    }

    const { data, error } = await supabase
        .from("products")
        .select("*")
        .lte("next_scrape_at", checkTime)
        .order("next_scrape_at", { ascending: true });

    if (error) {
        throw new Error(`Supabase error loading due products: ${error.message}`);
    }
    return data || [];
}
