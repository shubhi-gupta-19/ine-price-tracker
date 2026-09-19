# 📈 Product Price Tracker & Automated Scraper

A robust, full-stack product price monitoring system designed to scrape, track, and analyze live product prices and availability from the [INE Demo Store](https://demo.inelabteamdev.com/). Built with Node.js, Express, Playwright, React, Vite, Recharts, and Supabase.

---

## 🌟 Features

- **Live Store Search:** Real-time search across the entire 1,000-product INE catalog with instant partial matching (`domus`, `kettle`, `lap`, `phone`).
- **Anti-Bot Challenge Defeat:** Automatically wiggles mouse coordinates, satisfies dwell time requirements (`minMoves: 8`, `minDwellMs: 600ms`), clears cookie overlays, and reveals live prices.
- **Bot Trap & Decoy Filter:** Identifies and strips zero-width spaces (`\u200B`), eliminates strikethrough MRPs, and ignores decoy hidden elements (`display: none`).
- **Critical Data Rule:** Guarantees data integrity. Scrape failures never overwrite existing valid prices with `null`, `0`, or `NaN`.
- **Fault-Tolerant Retries:** 3-attempt exponential backoff with granular audit logs (`retry`, `failed`, `success`).
- **Structure Change Detection:** Detects and flags layout shifts (`structure_changed: true`) when selectors disappear.
- **2-Hour Production Scheduling:** Automated cron-job.org integration ensuring reliability even if serverless instances sleep.
- **Interactive Dashboard:** Modern React 19 UI with Recharts price trend charts, stock history timeline, and attempt-by-attempt scrape logs.
- **Headed Mode & Video Recording:** Supports headed execution (`?headed=true`) with WebM video recordings saved to `backend/videos/`.
- **Bonus Features:** Multiple product tracking, SendGrid price-drop and back-in-stock email alerts, and GitHub Actions CI/CD.

---

## 🏗 Architecture & Tech Stack

```
Frontend (React 19 + Vite + Recharts + Axios)
                      │ (REST API)
                      ▼
Backend (Node.js + Express 5 + Playwright)
        │                              │
        ▼ (Catalog API / Browser)      ▼ (PostgreSQL)
INE Demo Store                  Supabase / Resilient Local DB
```

- **Backend:** Node.js v20+, Express v5, Playwright v1.55, SendGrid
- **Frontend:** React 19, Vite, Recharts, Axios, Pure CSS
- **Database:** Supabase PostgreSQL with UUID keys, foreign keys, and indexes
- **Testing:** Node.js native test runner (`node --test`)
- **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`)

---

## 📁 Project Structure

```
product-price-tracker/
├── .github/workflows/ci.yml    # Continuous Integration workflow
├── database/
│   └── schema.sql              # Supabase PostgreSQL schema
├── docs/
│   └── design-note.md          # Architectural & reconnaissance design note
├── backend/
│   ├── .env.example            # Environment template for backend
│   ├── package.json            # Backend scripts and dependencies
│   ├── videos/                 # Proof video recordings (WebM)
│   ├── test/                   # Unit test suite (11 tests)
│   └── src/
│       ├── server.js           # Express app & route mounting
│       ├── config/             # Environment & Supabase configuration
│       ├── db/                 # Database repository (Supabase + local fallback)
│       ├── routes/             # REST endpoints (products, dashboard, scrape, cron)
│       ├── services/           # Scraper, catalog search, alerts, scheduler
│       └── utils/              # Price parser, logger
└── frontend/
    ├── .env.example            # Frontend environment template
    ├── package.json            # Frontend scripts and dependencies
    └── src/
        ├── App.jsx             # Main dashboard UI
        ├── index.css           # Modern design system styles
        └── main.jsx            # React root mount
```

---

## 🔍 INE Store Scraping Approach

The product-selection/search layer uses the mock store's own catalog endpoint (`/api/catalog`) for lightweight discovery, while Playwright is used for the product-detail scrape because the price requires browser interaction.

### Actual Verified Selectors & Behavior
- **Catalog Navigation:** Home page cards (`article.tile`) do not use standard `<a>` links. Navigation occurs by clicking `<button class="tile-cta">View details →</button>`.
- **Title Selector:** `.detail-info h1` (or `h1`).
- **Price Selector:** `.price-main [class*='pv-']` or `.price-main > div:not([style*='display: none'])`.
- **Stock Selector:** `.stock-badge` (or `.price-facets .stock-badge`).
- **Interactive Challenge:** Initial state is `.price-block.price-idle`. The Reveal Price button remains disabled until mouse coordinates move over the element for ≥600ms and ≥8 movements. The scraper wiggles the mouse until `revealBtn.isDisabled() === false` before clicking.

---

## 🛡 Reliability & Retry Strategy

Each scrape execution runs through a 3-attempt controller:
- **Attempt 1:** Executes browser navigation and challenge resolution.
- **Attempt 2:** If attempt 1 times out or encounters network reset, logs `status: "retry"` and backs off for 1 second.
- **Attempt 3:** Final attempt. If it fails, logs `status: "failed"` and leaves the product's valid price untouched.

### Critical Data Rule
```
If previous price = ₹17,066 and subsequent scrape fails:
- current_price = ₹17,066 (PRESERVED)
- current_stock = true (PRESERVED)
- price_history = NO INVALID ENTRY INSERTED
- scrape_logs = Granular failure logged with error message and response time
```

---

## ⏰ Production Scheduling (Every 2 Hours)

Free-tier hosting providers (such as Render) put backend containers into idle sleep when there is no incoming traffic. Therefore:
- Internal `setInterval` or `node-cron` timers will freeze during sleep.
- Production scheduling is driven externally by **[cron-job.org](https://cron-job.org/)**.
- cron-job.org wakes the service and triggers `POST /api/cron/scrape` every 2 hours.
- Protected by header `x-cron-secret: <CRON_SECRET>`.

---

## 🚀 Local Setup & Installation

### 1. Prerequisites
- Node.js v20+ and npm

### 2. Backend Setup
```bash
cd backend
npm install
npx playwright install chromium --with-deps
cp .env.example .env
# Fill in your CRON_SECRET and Supabase credentials in .env
npm run dev
```
Backend runs on `http://localhost:5000`.

### 3. Frontend Setup
```bash
cd ../frontend
npm install
cp .env.example .env
npm run dev
```
Frontend runs on `http://localhost:5173`.

### 4. Run Test Suite
```bash
cd backend
npm test
```
Executes all 11 unit tests covering price parsing, stock extraction, retry engine, data integrity, and cron security.

---

## 🗄 Supabase Setup

1. Open your [Supabase Dashboard](https://supabase.com/).
2. Navigate to the **SQL Editor**.
3. Copy the entire contents of [`database/schema.sql`](./database/schema.sql).
4. Run the script to create:
   - `public.products`
   - `public.scrape_logs`
   - `public.price_history`
5. Copy your **Project URL** and **Service Role Key** into `backend/.env`.

*(Note: The backend includes a resilient local database fallback so it functions immediately even if Supabase is offline).*

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health check and uptime |
| `GET` | `/api/products/search?q=:query` | Live partial search of real INE catalog |
| `POST` | `/api/products` | Track a product (prevents duplicate URLs) |
| `GET` | `/api/dashboard/products` | List all tracked products |
| `GET` | `/api/dashboard/products/:id` | Single product detail |
| `GET` | `/api/dashboard/products/:id/history` | Price history for Recharts chart |
| `GET` | `/api/dashboard/products/:id/logs` | Scrape execution logs |
| `POST` | `/api/scrape/:productId` | Trigger on-demand headless scrape |
| `POST` | `/api/scrape/:productId?headed=true` | Trigger headed scrape with video recording |
| `POST` | `/api/cron/scrape` | 2-hour scheduled batch scrape (Requires `x-cron-secret`) |

---

## 🎥 Headed Run & Video Recording

To run a scrape with a visible browser and record video proof:
1. In the UI: Click the **🎥** button on any tracked product card or on the Product Details screen.
2. Via API:
   ```bash
   curl -X POST http://localhost:5000/api/scrape/<PRODUCT_ID>?headed=true
   ```
3. Recorded WebM video files are automatically saved to `backend/videos/`.

---

## ☁️ Deployment Guide

### Backend on Render
1. Create a new **Web Service** on Render connected to your repository.
2. Set **Root Directory** to `backend`.
3. Set **Build Command** to:
   ```bash
   npm install && npx playwright install chromium --with-deps
   ```
4. Set **Start Command** to:
   ```bash
   node src/server.js
   ```
5. Add Environment Variables:
   - `PORT`: `5000` (Render will override automatically with its assigned port)
   - `STORE_BASE_URL`: `https://demo.inelabteamdev.com`
   - `CRON_SECRET`: `<your_cron_secret>`
   - `SUPABASE_URL`: `<your_supabase_url>`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<your_supabase_service_role_key>`
   - `HEADLESS`: `true`

### Frontend on Vercel
1. Import the repository on Vercel.
2. Set **Root Directory** to `frontend`.
3. Set **Build Command** to: `npm run build`.
4. Set **Output Directory** to: `dist`.
5. Add Environment Variable:
   - `VITE_API_URL`: `https://your-backend-service.onrender.com`

### cron-job.org Setup
1. Create a free account on [cron-job.org](https://cron-job.org/).
2. Create a new Cronjob:
   - **URL:** `https://your-backend-service.onrender.com/api/cron/scrape`
   - **Schedule:** Every 2 hours (`0 */2 * * *`)
   - **Request Method:** `POST`
   - **HTTP Headers:** `x-cron-secret: <your_cron_secret>`
