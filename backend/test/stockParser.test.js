import test from "node:test";
import assert from "node:assert/strict";
import { determineStock } from "../src/services/scraper.js";

test("Stock Parser: detects in-stock keywords", () => {
    assert.equal(determineStock("In stock · 12 left"), true);
    assert.equal(determineStock("Selling fast — 78 left"), true);
    assert.equal(determineStock("Hurry, just 3 left"), true);
    assert.equal(determineStock("Item Available"), true);
    assert.equal(determineStock("Buy Now"), true);
});

test("Stock Parser: detects out-of-stock keywords", () => {
    assert.equal(determineStock("Out of Stock"), false);
    assert.equal(determineStock("Sold out"), false);
    assert.equal(determineStock("Currently unavailable"), false);
    assert.equal(determineStock("0 left"), false);
});

test("Stock Parser: returns null for unidentifiable text", () => {
    assert.equal(determineStock(null), null);
    assert.equal(determineStock(""), null);
    assert.equal(determineStock("Free shipping on all items"), null);
});
