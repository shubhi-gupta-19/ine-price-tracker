process.env.NODE_ENV = "test";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../src/server.js";
import { config } from "../src/config/env.js";

test("Integration Test Suite: Full API & Scraper Workflow", async (t) => {
    let server;
    let baseUrl;

    await new Promise((resolve) => {
        server = http.createServer(app);
        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });

    t.after(() => {
        if (server) server.close();
    });

    // 1. Health check
    await t.test("GET /api/health returns 200 and running status", async () => {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "ok");
    });

    // 2. Real INE Store Catalog Search
    let discoveredProduct;
    await t.test("GET /api/products/search?q=watch returns real INE products", async () => {
        const res = await fetch(`${baseUrl}/api/products/search?q=watch`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data), "Expected array of products");
        assert.ok(data.length > 0, "Expected at least one product matching 'watch'");
        
        discoveredProduct = data[0];
        assert.ok(discoveredProduct.name, "Product must have name");
        assert.ok(discoveredProduct.url.includes("inelabteamdev.com"), "Product URL must point to INE store");
    });

    // 3. Track Product & Duplicate URL Check
    let trackedProduct;
    await t.test("POST /api/products tracks product and enforces unique URL constraint", async () => {
        // Track the dynamically discovered product
        const uniqueUrl = `https://demo.inelabteamdev.com/product/${discoveredProduct.id || 903}`;
        const createRes = await fetch(`${baseUrl}/api/products`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: discoveredProduct.name,
                url: uniqueUrl
            })
        });

        // 201 Created or 409 Conflict if already present
        if (createRes.status === 201) {
            trackedProduct = await createRes.json();
            assert.equal(trackedProduct.name, discoveredProduct.name);
        } else if (createRes.status === 409) {
            const err = await createRes.json();
            trackedProduct = err.product;
            assert.ok(trackedProduct, "Expected existing product in 409 response");
        } else {
            assert.fail(`Unexpected status tracking product: ${createRes.status}`);
        }

        // Now verify duplicate URL attempt triggers 409 Conflict
        const dupRes = await fetch(`${baseUrl}/api/products`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Duplicate Attempt",
                url: uniqueUrl
            })
        });
        assert.equal(dupRes.status, 409, "Duplicate URL must be rejected with 409 Conflict");
    });

    // 4. Cron Endpoint Security Check
    await t.test("POST /api/cron/scrape enforces x-cron-secret security", async () => {
        // Missing secret
        const noSecretRes = await fetch(`${baseUrl}/api/cron/scrape`, { method: "POST" });
        assert.equal(noSecretRes.status, 401);

        // Wrong secret
        const wrongSecretRes = await fetch(`${baseUrl}/api/cron/scrape`, {
            method: "POST",
            headers: { "x-cron-secret": "invalid-secret" }
        });
        assert.equal(wrongSecretRes.status, 401);

        // Correct secret
        const validSecretRes = await fetch(`${baseUrl}/api/cron/scrape`, {
            method: "POST",
            headers: { "x-cron-secret": config.cronSecret }
        });
        assert.equal(validSecretRes.status, 200);
        const batchData = await validSecretRes.json();
        assert.equal(batchData.success, true);
        assert.ok(Array.isArray(batchData.results));
    });
});
