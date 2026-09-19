import test from "node:test";
import assert from "node:assert/strict";

async function simulateScrapeEngine({ maxAttempts = 3, attemptsBehavior, product }) {
    let currentProduct = { ...product };
    const logs = [];
    const history = [];
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const startedAt = new Date().toISOString();
        const behavior = attemptsBehavior[attempt - 1];

        if (behavior.error) {
            lastError = new Error(behavior.error);
            const isFinal = attempt === maxAttempts;
            logs.push({
                attempt,
                status: isFinal ? "failed" : "retry",
                error: behavior.error
            });

            if (isFinal) {
                // Critical Data Rule: Do NOT overwrite valid current_price on failure
                // Structure changed flag updated if selector missing
                if (behavior.error === "PRICE_SELECTOR_NOT_FOUND") {
                    currentProduct.structure_changed = true;
                }
            }
        } else {
            logs.push({
                attempt,
                status: "success",
                price: behavior.price
            });

            currentProduct.current_price = behavior.price;
            currentProduct.current_stock = behavior.inStock;
            history.push({
                price: behavior.price,
                in_stock: behavior.inStock
            });
            return { success: true, product: currentProduct, logs, history };
        }
    }

    return { success: false, error: lastError?.message, product: currentProduct, logs, history };
}

test("Retry Engine: recovers on Attempt 3 after 2 transient failures", async () => {
    const baseProduct = {
        id: "p1",
        current_price: 15000,
        current_stock: true,
        structure_changed: false
    };

    const res = await simulateScrapeEngine({
        maxAttempts: 3,
        product: baseProduct,
        attemptsBehavior: [
            { error: "Navigation timeout" },
            { error: "Socket hang up" },
            { price: 17066, inStock: true }
        ]
    });

    assert.equal(res.success, true);
    assert.equal(res.logs.length, 3);
    assert.equal(res.logs[0].status, "retry");
    assert.equal(res.logs[1].status, "retry");
    assert.equal(res.logs[2].status, "success");
    assert.equal(res.product.current_price, 17066);
    assert.equal(res.history.length, 1);
});

test("Retry Engine & Critical Data Rule: 3 failures log as retry -> retry -> failed without data corruption", async () => {
    const baseProduct = {
        id: "p2",
        current_price: 17066,
        current_stock: true,
        structure_changed: false
    };

    const res = await simulateScrapeEngine({
        maxAttempts: 3,
        product: baseProduct,
        attemptsBehavior: [
            { error: "Navigation timeout" },
            { error: "Gateway Timeout 504" },
            { error: "PRICE_SELECTOR_NOT_FOUND" }
        ]
    });

    assert.equal(res.success, false);
    assert.equal(res.logs.length, 3);
    assert.equal(res.logs[0].status, "retry");
    assert.equal(res.logs[1].status, "retry");
    assert.equal(res.logs[2].status, "failed");

    // Critical Data Rule verifications:
    assert.equal(res.product.current_price, 17066); // Preserved!
    assert.equal(res.product.current_stock, true);   // Preserved!
    assert.equal(res.product.structure_changed, true); // Flagged!
    assert.equal(res.history.length, 0); // No invalid history inserted!
});
