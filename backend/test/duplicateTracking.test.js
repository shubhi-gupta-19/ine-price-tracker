import test from "node:test";
import assert from "node:assert/strict";

function trackProductRegistry(registry, newProduct) {
    if (registry.some(p => p.url === newProduct.url)) {
        const err = new Error("Product with this URL is already tracked");
        err.code = "DUPLICATE_PRODUCT";
        throw err;
    }
    registry.push(newProduct);
    return newProduct;
}

test("Duplicate Tracking: allows first registration and blocks duplicate URLs", () => {
    const registry = [];
    const prod1 = { id: "1", name: "Domus Kettle Max", url: "https://demo.inelabteamdev.com/product/305" };
    const prod2 = { id: "2", name: "Domus Kettle Max Copy", url: "https://demo.inelabteamdev.com/product/305" };
    const prod3 = { id: "3", name: "Cobalt Skillet", url: "https://demo.inelabteamdev.com/product/147" };

    trackProductRegistry(registry, prod1);
    assert.equal(registry.length, 1);

    assert.throws(() => {
        trackProductRegistry(registry, prod2);
    }, /already tracked/);
    assert.equal(registry.length, 1);

    trackProductRegistry(registry, prod3);
    assert.equal(registry.length, 2);
});
