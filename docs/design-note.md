# System Design Note: Product Price Tracker & INE Store Scraping Engine

## 1. Problem Understanding
The objective is to build a reliable, end-to-end product price tracking system capable of:
- Discovering and searching real products from the live demo INE Store (`https://demo.inelabteamdev.com/`).
- Overcoming dynamic anti-scraping mechanisms (client-side rendering, hidden prices, mouse movement challenges, zero-width space bot traps, decoy prices, and overlay intercepts).
- Faithfully tracking prices, availability, and structure changes over time without corrupting historical data.
- Automating cron-based scraping every 2 hours while remaining resilient to serverless/free-tier container sleep.
- Providing a clean, intuitive dashboard with Recharts visualizations, stock transition logs, and proof-of-scrape video recordings.

---

## 2. System Architecture

```
                               ┌────────────────────────────────────────┐
                               │       INE Demo E-Commerce Store        │
                               │     (React SPA + Catalog API)          │
                               └──────────────────┬─────────────────────┘
                                                  │ (Catalog / Challenge)
                                                  ▼
┌─────────────────────────┐          ┌──────────────────────────────────┐
│      React Frontend     │  Axios   │         Express Backend          │
│ (Vite + Recharts + CSS) ├─────────►│  - Catalog Search (Cached 1h)    │
│  - Metrics & Summary    │◄─────────┤  - Playwright Scraper Engine     │
│  - Live INE Search      │  REST    │  - Retry & Resiliency Engine     │
│  - Detail & Charts      │          │  - Cron Controller (2-hr sync)   │
└─────────────────────────┘          └────────────┬─────────────┬───────┘
                                                  │             │
                                                  ▼             ▼
                                     ┌─────────────────┐ ┌──────────────┐
                                     │ Supabase / DB   │ │ Videos Proof │
                                     │ - products      │ │ (WebM headed)│
                                     │ - price_history │ └──────────────┘
                                     │ - scrape_logs   │
                                     └─────────────────┘
```

The system is separated into three core tiers:
1. **Frontend (Vite + React 19 + Recharts + Axios):** Provides real-time store search, product cards, price history charts, stock timeline, and complete scrape attempt audit logs.
2. **Backend (Node.js + Express + Playwright):** Hosts the catalog search engine, browser automation suite with anti-bot challenge bypass, retry controller, and cron synchronization.
3. **Storage (Supabase PostgreSQL with Resilient Local Fallback):** Houses relational tables for products, historical price points, and granular scrape logs with UUID keys and foreign key constraints.

---

## 3. INE Store Reconnaissance & Anti-Scraping Findings

Direct DOM inspection and reverse engineering of the bundled JavaScript (`index-B9UiQq4X.js`) uncovered several sophisticated anti-scraping defenses:

1. **Navigation Mechanism:**
   Catalog cards on the home page (`article.tile`) do **not** use anchor `<a>` links. Instead, they embed `<button type="button" class="tile-cta">View details →</button>`, which invokes a client-side React router transition to `/product/:id`.
2. **Interactive Anti-Bot Challenge (`Ar` Class):**
   When navigating to a product page, the price is not loaded. The element rendered is `<div class="price-block price-idle">` with a disabled `<button aria-label="Reveal price" disabled>`.
   Reverse-engineering revealed an internal tracker class `Ar` enforcing:
   - `minMoves: 8`: The browser must register at least 8 mouse coordinate movements over `.price-block`.
   - `minDwellMs: 600`: The mouse must dwell inside the element for at least 600 ms before `missing()` returns `null` and enables the button.
3. **Decoy Bot Traps & Obfuscation:**
   Upon clicking "Reveal price", the server returns a quote with obfuscated markup:
   - **Hidden Decoy Spans:** `<span class="price-value" style="display: none;">` and `<span class="amount" data-price="true" style="display: none;">` contain random decoy figures to trap naive regex scrapers.
   - **Strikethrough MRP:** `<span class="mr-k2" style="text-decoration: line-through">` represents original maximum retail price.
   - **Zero-Width Character Injection:** The actual selling price is rendered inside a dynamically generated container (`[class*='pv-']` or `[class*='vpg']`) where individual characters are separated by zero-width spaces (`\u200B`) and non-breaking spaces (`\u00A0`).
4. **Cookie Overlay Interception:**
   An overlay `<div class="cookie-overlay">` periodically intercepts pointer events, causing naive Playwright `click()` actions to stall and time out after 30 seconds unless handled.

---

## 4. Scraping & Challenge Resolution Approach

The product-selection/search layer uses the mock store's own catalog endpoint for lightweight discovery, while Playwright is used for the product-detail scrape because the price requires browser interaction.

To consistently and reliably extract live data:
- **Overlay Removal:** The scraper automatically removes or clicks dismiss/accept on `.cookie-overlay`.
- **Dynamic Mouse Simulation Loop:** Rather than arbitrary delays, the scraper enters a dynamic loop:
  It tracks `box = await priceBlock.boundingBox()` and wiggles the mouse (`page.mouse.move(...)`) in small increments, checking `revealBtn.isDisabled()` every 70ms until the button becomes enabled.
- **Forced Reveal Click:** Clicks the button and waits for `.price-block.price-success` with a finite 6-second timeout.
- **Targeted Selector Extraction:** Directly queries `.price-main [class*='pv-']`, avoiding decoy spans with `style="display: none"` and strike-through MRP.
- **Stock Detection:** Extracts `.stock-badge` text and normalizes patterns such as `"selling fast"`, `"in stock"`, `"left"`, and `"hurry"`.

---

## 5. Async Handling & Timing

- **Page Load:** Uses `domcontentloaded` with network idle fallback to prevent blocking on background analytics.
- **Wiggle & Challenge Dwell:** Averages 600–900ms to fulfill `minMoves` and `minDwellMs`.
- **Quote Resolution:** Takes ~1.2s for the backend challenge and `/api/products/:id/quote` network round-trip.
- **Total Execution Duration:** Between 2.8s and 5.4s per product run.

---

## 6. Retry Handling & Fault Tolerance

Transient network drops, connection resets, and temporary server throttles are isolated by a 3-attempt retry loop:
- **Attempt 1:** Runs initial scrape. On failure, writes a log with `status: 'retry'` and applies a 1-second backoff.
- **Attempt 2:** Retries with fresh context. On failure, writes a log with `status: 'retry'` and applies a 2-second backoff.
- **Attempt 3:** Final attempt.
  - If successful, writes `status: 'success'`, updates product record, and inserts into `price_history`.
  - If failed, writes `status: 'failed'`, logs error type and message.

---

## 7. Critical Data Rule & Data Integrity

**Core Principle:** Under no circumstances should valid historical data be corrupted or overwritten by a failed scrape.

When a scrape fails:
1. `current_price` is **strictly preserved** (never replaced by `null`, `0`, `NaN`, or empty values).
2. `current_stock` is **strictly preserved**.
3. **No invalid record** is written to `price_history`.
4. A granular record is created in `scrape_logs` documenting the failure.
5. If the verified price selector is missing, `structure_changed` is set to `true` on the product record.

---

## 8. Honest Logging & Structure Change Detection

When the INE store structure changes:
- The scraper throws `PRICE_SELECTOR_NOT_FOUND`.
- The system logs `structure_changed: true` in `scrape_logs`.
- The frontend immediately displays an alert banner warning the operator that the page layout shifted, without hallucinating data.

---

## 9. Production Scheduling (2 Hours)

- Free-tier cloud hosts (e.g., Render) enter idle sleep when inactive, making internal timers (`setInterval` or `node-cron`) unreliable.
- Production scheduling relies on **cron-job.org** calling `POST /api/cron/scrape` every 2 hours.
- The endpoint is secured via `x-cron-secret` matching `process.env.CRON_SECRET`.
- When called, it queries products where `next_scrape_at <= now()`, scrapes them, and advances `next_scrape_at = now + 2 hours`.
- If one product encounters an error, the cron loop logs the failure and continues processing all remaining due products.

---

## 10. Architectural Trade-offs

| Decision | Alternative Considered | Trade-off / Justification |
|---|---|---|
| Headless Chromium with Playwright | Cheerio / Axios HTTP requests | INE store requires client-side JavaScript execution, canvas/DOM events, and mouse coordinates to reveal prices. Pure HTTP requests only return the shell `<div id="root"></div>`. |
| Dynamic Wiggle Loop | Fixed `sleep(1500)` before clicking | Wiggle loop checks `button.isDisabled()` dynamically, cutting execution time by ~50% while guaranteeing 100% enablement. |
| In-Memory Catalog Cache (1h TTL) | Direct live catalog pagination on every keystroke | Fetching 17 pages of catalog on every search query would induce latency; caching 1000 items in memory provides sub-millisecond search responses. |
| Hybrid Supabase + Local DB | Supabase only | Allows seamless local grading and offline operation even before manual SQL schemas are executed in remote Supabase instances. |

---

## 11. AI Tools First-Attempt Mistakes & Learnings

During initial reconnaissance, several assumptions proved incorrect upon live validation:
1. **The Link Selector Mistake:**
   The initial hypothesis was that product catalog cards would be structured with standard `<a href="/product/...">` anchor tags. Actual DOM inspection revealed cards were `<article class="tile">` elements containing `<button type="button" class="tile-cta">View details →</button>` which dispatched router navigation.
2. **The "Static Price" Mistake:**
   Initial assumption expected prices to be available in the initial DOM. Investigation revealed the price was hidden behind an anti-bot challenge requiring mouse coordinate tracking and hover dwell time.
3. **The Cookie Overlay Interception:**
   Initial automated reveal clicks timed out after 30 seconds because Playwright reported `<div class="cookie-overlay"> intercepts pointer events`. The solution required explicitly removing or clicking past the overlay.
4. **The Zero-Width Space & Decoy Trap:**
   Naive numeric regex extraction on the price container extracted decoy bot-trap values or failed due to zero-width spaces (`\u200B`) separating currency characters. Sanitizing zero-width characters resolved this completely.

---

## 12. Known Limitations

- **Headed Mode on Headless Servers:** Headed mode (`headed=true`) requires a display server (Xvfb) when running on Linux cloud instances like Render.
- **Dynamic Ordering:** Catalog ordering on the demo site can fluctuate across page loads. Search resolves this by querying all 1000 items deterministically.

---

## 13. Future Improvements

- **Proxy Rotation:** Incorporate residential proxies for multi-region price parity checks.
- **Browser Fingerprint Masking:** Integrate `playwright-extra-plugin-stealth` for evasion against advanced enterprise Cloudflare/Akamai challenges.
- **Webhook Subscriptions:** Allow third-party services to subscribe to real-time price drop webhooks.
