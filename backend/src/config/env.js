import dotenv from "dotenv";
dotenv.config();

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STORE_BASE_URL", "CRON_SECRET"];
for (const variable of required) {
    if (!process.env[variable]) {
        throw new Error(`Missing required environment variable: ${variable}`);
    }
}

export const config = {
    port: Number(process.env.PORT || 5000),
    storeBaseUrl: process.env.STORE_BASE_URL,
    maxAttempts: Number(process.env.MAX_SCRAPE_ATTEMPTS || 3),
    scrapeTimeout: Number(process.env.SCRAPE_TIMEOUT_MS || 30000),
    selectorTimeout: Number(process.env.SELECTOR_WAIT_TIMEOUT_MS || 15000),
    headless: String(process.env.HEADLESS).toLowerCase() !== "false",
    recordVideo: String(process.env.RECORD_VIDEO).toLowerCase() === "true",
    cronSecret: process.env.CRON_SECRET,
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173"
};