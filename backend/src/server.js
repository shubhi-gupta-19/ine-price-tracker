import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import "./config/env.js";
import { config } from "./config/env.js";

import productRoutes from "./routes/productRoutes.js";
import scrapeRoutes from "./routes/scrapeRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import cronRoutes from "./routes/cronRoutes.js";

const app = express();

app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        return callback(null, true);
    },
    credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get("/", (req, res) => {
    res.json({ name: "Product Price Tracker API", status: "running", timestamp: new Date().toISOString() });
});

app.use("/api/products", productRoutes);
app.use("/api/scrape", scrapeRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/cron", cronRoutes);

app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
    console.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal server error" });
});

if (process.env.NODE_ENV !== "test") {
    app.listen(config.port, () => {
        console.log(`Server running on port ${config.port}`);
    });
}

export { app };
export default app;