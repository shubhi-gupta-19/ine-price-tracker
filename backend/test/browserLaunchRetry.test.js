import test from "node:test";
import assert from "node:assert/strict";
import { launchBrowserWithRetry } from "../src/services/scraper.js";
import { classifyScrapeError, AsyncQueue } from "../src/services/scrapeService.js";

test("Browser Launch Retry: recovers after transient launch failures", async () => {
    let launchAttempts = 0;
    const mockLauncher = {
        async launch() {
            launchAttempts++;
            if (launchAttempts < 3) {
                throw new Error("Target page, context or browser has been closed");
            }
            return {
                async close() {}
            };
        }
    };

    const browser = await launchBrowserWithRetry({
        maxAttempts: 3,
        initialBackoffMs: 10, // fast for testing
        launcher: mockLauncher
    });

    assert.ok(browser, "Browser should be returned upon recovery");
    assert.equal(launchAttempts, 3, "Should have attempted exactly 3 times before succeeding");
});

test("Browser Launch Retry: fails honestly after 3 attempts with browser_launch_failure", async () => {
    let launchAttempts = 0;
    const mockLauncher = {
        async launch() {
            launchAttempts++;
            throw new Error("Failed to connect ... on UNIX");
        }
    };

    await assert.rejects(
        async () => {
            await launchBrowserWithRetry({
                maxAttempts: 3,
                initialBackoffMs: 10,
                launcher: mockLauncher
            });
        },
        (err) => {
            assert.equal(err.name, "BrowserLaunchError");
            assert.equal(err.code, "browser_launch_failure");
            assert.ok(err.message.includes("Chromium launch failed after 3 attempts"));
            return true;
        }
    );

    assert.equal(launchAttempts, 3, "Must attempt exactly 3 times before giving up");
});

test("Error Classifier: accurately maps all error categories", () => {
    // 1. Browser launch
    assert.equal(classifyScrapeError(new Error("browserType.launch: Target page, context or browser has been closed")), "browser_launch_failure");
    assert.equal(classifyScrapeError(new Error("Failed to connect ... on UNIX")), "browser_launch_failure");
    assert.equal(classifyScrapeError({ code: "browser_launch_failure", message: "Launch failed" }), "browser_launch_failure");

    // 2. Navigation
    assert.equal(classifyScrapeError(new Error("Navigation failed for https://example.com: net::ERR_CONNECTION_REFUSED")), "navigation_failure");
    assert.equal(classifyScrapeError({ code: "navigation_failure", message: "Timeout during page.goto" }), "navigation_failure");

    // 3. Price reveal
    assert.equal(classifyScrapeError({ code: "price_reveal_failure", message: "Price reveal challenge timed out" }), "price_reveal_failure");
    assert.equal(classifyScrapeError(new Error("Interactive challenge failed to reveal price")), "price_reveal_failure");

    // 4. Price parse
    assert.equal(classifyScrapeError(new Error("PRICE_COULD_NOT_BE_PARSED")), "price_parse_failure");
    assert.equal(classifyScrapeError({ code: "price_parse_failure", message: "Invalid price" }), "price_parse_failure");

    // 5. Selector missing / structure changed
    assert.equal(classifyScrapeError(new Error("PRICE_SELECTOR_NOT_FOUND")), "selector_missing");
    assert.equal(classifyScrapeError({ code: "selector_missing", message: "Structure changed" }), "selector_missing");

    // 6. Unknown
    assert.equal(classifyScrapeError(new Error("Unexpected random exception")), "unknown");
    assert.equal(classifyScrapeError(null), "unknown");
});

test("AsyncQueue: strictly enforces sequential concurrency limit of 1", async () => {
    const queue = new AsyncQueue(1);
    let activeWorkers = 0;
    let maxObservedWorkers = 0;
    const executionOrder = [];

    const makeTask = (id, delayMs) => async () => {
        activeWorkers++;
        maxObservedWorkers = Math.max(maxObservedWorkers, activeWorkers);
        executionOrder.push(`start-${id}`);
        await new Promise(r => setTimeout(r, delayMs));
        executionOrder.push(`end-${id}`);
        activeWorkers--;
        return id;
    };

    // Run 3 tasks concurrently through the queue
    const results = await Promise.all([
        queue.run(makeTask(1, 30)),
        queue.run(makeTask(2, 20)),
        queue.run(makeTask(3, 10))
    ]);

    assert.deepEqual(results, [1, 2, 3]);
    assert.equal(maxObservedWorkers, 1, "Concurrency must NEVER exceed 1 worker at any instant");
    assert.deepEqual(executionOrder, [
        "start-1", "end-1",
        "start-2", "end-2",
        "start-3", "end-3"
    ], "Tasks must execute sequentially in strict FIFO order");
});
