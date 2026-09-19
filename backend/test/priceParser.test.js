import test from "node:test";
import assert from "node:assert/strict";
import { parsePrice } from "../src/utils/priceParser.js";

test("Price Parser: parses plain formatted numbers", () => {
    assert.equal(parsePrice("18,512"), 18512);
    assert.equal(parsePrice("17066.50"), 17066.5);
    assert.equal(parsePrice("₹ 24,683"), 24683);
});

test("Price Parser: parses real INE store formatted text with zero-width characters", () => {
    const inePrice1 = "₹\u200B1\u200B7\u200B,\u200B0\u200B6\u200B6";
    assert.equal(parsePrice(inePrice1), 17066);

    const inePrice2 = "₹\u200B1\u200B8\u200B,\u200B5\u200B1\u200B2";
    assert.equal(parsePrice(inePrice2), 18512);

    const inePriceFull = "₹\u200B1\u200B8\u200B,\u200B5\u200B1\u200B2/- (incl. of all taxes)";
    assert.equal(parsePrice(inePriceFull), 18512);
});

test("Price Parser: rejects invalid, negative, NaN, and malformed inputs", () => {
    assert.equal(parsePrice(null), null);
    assert.equal(parsePrice(undefined), null);
    assert.equal(parsePrice(""), null);
    assert.equal(parsePrice("   "), null);
    assert.equal(parsePrice("Price hidden"), null);
    assert.equal(parsePrice("Hold on — checking availability…"), null);
    assert.equal(parsePrice("Out of Stock"), null);
    assert.equal(parsePrice("-100"), null);
    assert.equal(parsePrice("-₹17066"), null);
    assert.equal(parsePrice("0"), null);
    assert.equal(parsePrice("NaN"), null);
    assert.equal(parsePrice("Infinity"), null);
});
