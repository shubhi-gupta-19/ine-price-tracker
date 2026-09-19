import test from "node:test";
import assert from "node:assert/strict";

function verifyCronHeader(headerValue, expectedSecret) {
    if (!expectedSecret || headerValue !== expectedSecret) {
        return { authorized: false, status: 401 };
    }
    return { authorized: true, status: 200 };
}

test("Cron Auth: rejects missing or invalid x-cron-secret", () => {
    const SECRET = "secret-token-12345";

    assert.deepEqual(verifyCronHeader(undefined, SECRET), { authorized: false, status: 401 });
    assert.deepEqual(verifyCronHeader("wrong-token", SECRET), { authorized: false, status: 401 });
    assert.deepEqual(verifyCronHeader("", SECRET), { authorized: false, status: 401 });
});

test("Cron Auth: accepts valid x-cron-secret", () => {
    const SECRET = "secret-token-12345";
    assert.deepEqual(verifyCronHeader("secret-token-12345", SECRET), { authorized: true, status: 200 });
});
