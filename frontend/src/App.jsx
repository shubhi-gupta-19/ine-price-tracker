import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [trackedProducts, setTrackedProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [productDetail, setProductDetail] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [scrapeLogs, setScrapeLogs] = useState([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Scrape action loading state
  const [scrapingId, setScrapingId] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    fetchTrackedProducts();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      loadProductDetails(selectedProductId);
    }
  }, [selectedProductId]);

  const showNotice = (msg, type = "info") => {
    setNotice({ msg, type });
    setTimeout(() => setNotice(null), 5000);
  };

  const fetchTrackedProducts = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/dashboard/products`);
      setTrackedProducts(res.data || []);
    } catch (err) {
      console.error("Failed to load tracked products:", err);
      showNotice("Could not load tracked products from API", "error");
    }
  };

  const loadProductDetails = async (id) => {
    try {
      const [prodRes, histRes, logsRes] = await Promise.all([
        axios.get(`${API_URL}/api/dashboard/products/${id}`),
        axios.get(`${API_URL}/api/dashboard/products/${id}/history`),
        axios.get(`${API_URL}/api/dashboard/products/${id}/logs`)
      ]);
      setProductDetail(prodRes.data);
      setPriceHistory(histRes.data || []);
      setScrapeLogs(logsRes.data || []);
    } catch (err) {
      console.error("Failed to load details:", err);
      showNotice("Error loading product details", "error");
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError("");
    try {
      const res = await axios.get(`${API_URL}/api/products/search`, {
        params: { q: searchQuery.trim() }
      });
      setSearchResults(res.data || []);
      if (!res.data || res.data.length === 0) {
        setSearchError("No products found matching your search term.");
      }
    } catch (err) {
      console.error("Search failed:", err);
      setSearchError("Failed to search INE store. Please verify backend is running.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleTrackProduct = async (product) => {
    try {
      await axios.post(`${API_URL}/api/products`, {
        name: product.name,
        url: product.url,
        imageUrl: product.imageUrl || null
      });
      showNotice(`Now tracking "${product.name}"!`, "success");
      await fetchTrackedProducts();
    } catch (err) {
      if (err.response?.status === 409) {
        showNotice(`"${product.name}" is already tracked!`, "info");
      } else {
        showNotice(err.response?.data?.error || "Failed to track product", "error");
      }
    }
  };

  const handleScrapeProduct = async (id, headed = false) => {
    setScrapingId(id);
    showNotice(headed ? "Starting headed scraper with video..." : "Triggering on-demand scrape...", "info");
    try {
      const res = await axios.post(`${API_URL}/api/scrape/${id}`, null, {
        params: headed ? { headed: true } : {}
      });
      if (res.data?.success) {
        showNotice(`Scraped successfully! Price: ₹${res.data.result?.price} (${res.data.result?.responseTime}ms)`, "success");
      } else {
        showNotice("Scrape completed with notice: " + (res.data?.error || "Unknown"), "warning");
      }
      await fetchTrackedProducts();
      if (selectedProductId === id) {
        await loadProductDetails(id);
      }
    } catch (err) {
      console.error("Scrape failed:", err);
      showNotice("Scrape error: " + (err.response?.data?.error || err.message), "error");
    } finally {
      setScrapingId(null);
    }
  };

  const openDetails = (id) => {
    setSelectedProductId(id);
    setActiveTab("detail");
  };

  // Format Recharts data (ensuring finite numbers only)
  const chartData = priceHistory
    .filter(h => typeof h.price === "number" && Number.isFinite(h.price))
    .map(h => ({
      time: new Date(h.scraped_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      fullDate: new Date(h.scraped_at).toLocaleString(),
      price: h.price
    }));

  return (
    <div>
      {/* Navbar */}
      <header className="navbar">
        <div className="brand">
          <div className="brand-icon">◧</div>
          <span>INE Price Tracker</span>
        </div>
        <nav className="nav-links">
          <button
            className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-btn ${activeTab === "search" ? "active" : ""}`}
            onClick={() => setActiveTab("search")}
          >
            🔍 Search Store
          </button>
          <button
            className={`nav-btn ${activeTab === "tracked" ? "active" : ""}`}
            onClick={() => setActiveTab("tracked")}
          >
            📦 Tracked ({trackedProducts.length})
          </button>
          {selectedProductId && (
            <button
              className={`nav-btn ${activeTab === "detail" ? "active" : ""}`}
              onClick={() => setActiveTab("detail")}
            >
              📈 Product Detail
            </button>
          )}
        </nav>
      </header>

      {/* Global Notifications */}
      {notice && (
        <div style={{ padding: "0 2rem", marginTop: "1rem" }}>
          <div
            className={`alert-banner ${
              notice.type === "error"
                ? "alert-danger"
                : notice.type === "warning"
                ? "alert-warning"
                : "alert-banner"
            }`}
            style={{
              backgroundColor: notice.type === "success" ? "#f0fdf4" : undefined,
              borderColor: notice.type === "success" ? "#bbf7d0" : undefined,
              color: notice.type === "success" ? "#15803d" : undefined
            }}
          >
            <span>{notice.msg}</span>
            <button
              style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}
              onClick={() => setNotice(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="container">
        {/* =========================================================
            TAB 1: DASHBOARD
        ========================================================= */}
        {activeTab === "dashboard" && (
          <div>
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="title">Tracked Products</div>
                <div className="value">{trackedProducts.length}</div>
                <div className="subtitle">Real products monitored</div>
              </div>
              <div className="metric-card">
                <div className="title">In Stock Items</div>
                <div className="value">
                  {trackedProducts.filter(p => p.current_stock === true).length}
                </div>
                <div className="subtitle">Currently available</div>
              </div>
              <div className="metric-card">
                <div className="title">Schedule Interval</div>
                <div className="value">2 Hours</div>
                <div className="subtitle">Automated cron-job.org sync</div>
              </div>
              <div className="metric-card">
                <div className="title">Structure Health</div>
                <div className="value" style={{ color: trackedProducts.some(p => p.structure_changed) ? "var(--danger)" : "var(--success)" }}>
                  {trackedProducts.filter(p => p.structure_changed).length === 0 ? "100% OK" : `${trackedProducts.filter(p => p.structure_changed).length} Alert`}
                </div>
                <div className="subtitle">Anti-bot selector status</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 className="section-title">Tracked Products Overview</h2>
              <button className="btn btn-primary btn-sm" onClick={() => setActiveTab("search")}>
                + Find & Track More Products
              </button>
            </div>

            {trackedProducts.length === 0 ? (
              <div className="table-wrapper" style={{ padding: "3rem", textAlign: "center" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "1.1rem" }}>
                  No products are currently being tracked.
                </p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: "1rem" }}
                  onClick={() => setActiveTab("search")}
                >
                  Search INE Store Now
                </button>
              </div>
            ) : (
              <div className="products-grid">
                {trackedProducts.map(p => (
                  <div key={p.id} className="product-card">
                    <div>
                      <div className="product-card-header">
                        <span className="badge badge-secondary">INE Store</span>
                        {p.structure_changed && (
                          <span className="badge badge-danger">Structure Changed</span>
                        )}
                      </div>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="product-title"
                      >
                        {p.name}
                      </a>
                      <div className="product-meta">SKU: {p.url.split("/").pop()}</div>

                      <div className="price-stock-row">
                        <div className="price-display">
                          {p.current_price !== null && p.current_price !== undefined
                            ? `₹${Number(p.current_price).toLocaleString("en-IN")}`
                            : "Pending scrape"}
                        </div>
                        {p.current_stock === true && (
                          <span className="badge badge-success">In Stock</span>
                        )}
                        {p.current_stock === false && (
                          <span className="badge badge-danger">Out of Stock</span>
                        )}
                        {p.current_stock === null && (
                          <span className="badge badge-secondary">Unknown</span>
                        )}
                      </div>

                      <div className="timestamps-info">
                        <div>🕒 Last Checked: {p.last_scraped_at ? new Date(p.last_scraped_at).toLocaleString() : "Never"}</div>
                        <div>⏱ Next Scrape: {p.next_scrape_at ? new Date(p.next_scrape_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "In 2 hrs"}</div>
                      </div>
                    </div>

                    <div className="card-actions">
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => openDetails(p.id)}
                      >
                        View Details
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={scrapingId === p.id}
                        onClick={() => handleScrapeProduct(p.id, false)}
                      >
                        {scrapingId === p.id ? "Scraping..." : "⚡ Scrape"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 2: SEARCH PRODUCTS
        ========================================================= */}
        {activeTab === "search" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Search INE Store</h1>
              <p style={{ color: "var(--text-muted)" }}>
                Search live products from the actual INE catalog. Try "domus", "kettle", "lap", or "phone".
              </p>
            </div>

            <form className="search-box" onSubmit={handleSearch}>
              <input
                type="text"
                className="search-input"
                placeholder="Search products from INE store..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={searchLoading}>
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </form>

            {searchError && (
              <div className="alert-banner alert-warning" style={{ maxWidth: "600px", margin: "0 auto 2rem auto" }}>
                <span>{searchError}</span>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="products-grid">
                {searchResults.map(item => {
                  const isTracked = trackedProducts.some(p => p.url === item.url);
                  return (
                    <div key={item.id} className="product-card">
                      <div>
                        <div className="product-card-header">
                          <span className="badge badge-secondary">{item.category}</span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{item.sku}</span>
                        </div>
                        <h3 className="product-title">{item.name}</h3>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.5rem 0" }}>
                          Brand: <strong>{item.brand}</strong>
                        </p>
                        <p style={{ fontSize: "0.85rem", color: "#475569", margin: "0.5rem 0", lineHeight: "1.4" }}>
                          {item.description}
                        </p>
                      </div>

                      <div className="card-actions" style={{ marginTop: "1rem" }}>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline btn-sm"
                          style={{ flex: 1 }}
                        >
                          Visit Store ↗
                        </a>
                        <button
                          className={`btn btn-sm ${isTracked ? "btn-outline" : "btn-primary"}`}
                          disabled={isTracked}
                          onClick={() => handleTrackProduct(item)}
                        >
                          {isTracked ? "✓ Tracked" : "+ Track Product"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 3: TRACKED PRODUCTS
        ========================================================= */}
        {activeTab === "tracked" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h1 style={{ fontSize: "1.75rem" }}>Tracked Products</h1>
              <button className="btn btn-outline btn-sm" onClick={fetchTrackedProducts}>
                ↻ Refresh List
              </button>
            </div>

            {trackedProducts.length === 0 ? (
              <div className="table-wrapper" style={{ padding: "3rem", textAlign: "center" }}>
                <p>No products tracked yet.</p>
                <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={() => setActiveTab("search")}>
                  Search Store
                </button>
              </div>
            ) : (
              <div className="products-grid">
                {trackedProducts.map(p => (
                  <div key={p.id} className="product-card">
                    <div>
                      <div className="product-card-header">
                        <span className="badge badge-secondary">Tracked</span>
                        {p.structure_changed && (
                          <span className="badge badge-danger">Structure Changed</span>
                        )}
                      </div>
                      <a href={p.url} target="_blank" rel="noreferrer" className="product-title">
                        {p.name}
                      </a>
                      <div className="price-stock-row" style={{ marginTop: "1rem" }}>
                        <div className="price-display">
                          {p.current_price !== null && p.current_price !== undefined
                            ? `₹${Number(p.current_price).toLocaleString("en-IN")}`
                            : "Pending"}
                        </div>
                        {p.current_stock === true && <span className="badge badge-success">In Stock</span>}
                        {p.current_stock === false && <span className="badge badge-danger">Out of Stock</span>}
                        {p.current_stock === null && <span className="badge badge-secondary">Unknown</span>}
                      </div>
                      <div className="timestamps-info">
                        <div>🕒 Last Checked: {p.last_scraped_at ? new Date(p.last_scraped_at).toLocaleString() : "Never"}</div>
                        <div>⏱ Next Scrape: {p.next_scrape_at ? new Date(p.next_scrape_at).toLocaleString() : "Every 2 hrs"}</div>
                      </div>
                    </div>
                    <div className="card-actions" style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => openDetails(p.id)}>
                        Details
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={scrapingId === p.id}
                        onClick={() => handleScrapeProduct(p.id, false)}
                      >
                        {scrapingId === p.id ? "Scraping..." : "⚡ Scrape"}
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        title="Run Headed Scraper (Records Video Proof)"
                        disabled={scrapingId === p.id}
                        onClick={() => handleScrapeProduct(p.id, true)}
                      >
                        🎥
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 4: PRODUCT DETAILS
        ========================================================= */}
        {activeTab === "detail" && productDetail && (
          <div>
            <div style={{ marginBottom: "1rem" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setActiveTab("tracked")}>
                ← Back to Tracked Products
              </button>
            </div>

            {productDetail.structure_changed && (
              <div className="alert-banner alert-danger">
                <div>
                  <strong>⚠️ Structure Change Detected!</strong>
                  <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem" }}>
                    The verified price selector could not be found on the latest scrape attempt. Existing validated price is preserved to protect data integrity.
                  </p>
                </div>
              </div>
            )}

            <div className="detail-header">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <h1 style={{ fontSize: "1.85rem", marginBottom: "0.5rem" }}>{productDetail.name}</h1>
                  <a href={productDetail.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontSize: "0.9rem" }}>
                    {productDetail.url} ↗
                  </a>
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    className="btn btn-primary"
                    disabled={scrapingId === productDetail.id}
                    onClick={() => handleScrapeProduct(productDetail.id, false)}
                  >
                    {scrapingId === productDetail.id ? "Scraping..." : "⚡ Scrape Now"}
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={scrapingId === productDetail.id}
                    onClick={() => handleScrapeProduct(productDetail.id, true)}
                  >
                    🎥 Headed Scrape (Video)
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>CURRENT PRICE</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>
                    {productDetail.current_price !== null
                      ? `₹${Number(productDetail.current_price).toLocaleString("en-IN")}`
                      : "Pending"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>STOCK AVAILABILITY</div>
                  <div style={{ marginTop: "0.25rem" }}>
                    {productDetail.current_stock === true && <span className="badge badge-success">In Stock</span>}
                    {productDetail.current_stock === false && <span className="badge badge-danger">Out of Stock</span>}
                    {productDetail.current_stock === null && <span className="badge badge-secondary">Unknown</span>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>LAST SCRAPED</div>
                  <div style={{ fontSize: "0.95rem", marginTop: "0.25rem" }}>
                    {productDetail.last_scraped_at ? new Date(productDetail.last_scraped_at).toLocaleString() : "Never"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>NEXT SCHEDULED SCRAPE</div>
                  <div style={{ fontSize: "0.95rem", marginTop: "0.25rem" }}>
                    {productDetail.next_scrape_at ? new Date(productDetail.next_scrape_at).toLocaleString() : "In 2 Hours"}
                  </div>
                </div>
              </div>
            </div>

            {/* Price History Chart */}
            <div className="chart-card">
              <h3 className="section-title">Price History Chart</h3>
              {chartData.length < 2 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                  {chartData.length === 1
                    ? `Current recorded price is ₹${chartData[0].price}. Run additional scrapes to visualize trend.`
                    : "No price history records available yet."}
                </div>
              ) : (
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="time" stroke="#64748b" />
                      <YAxis domain={["auto", "auto"]} stroke="#64748b" />
                      <Tooltip
                        formatter={(value) => [`₹${value.toLocaleString("en-IN")}`, "Price"]}
                        labelFormatter={(label, item) => item?.[0]?.payload?.fullDate || label}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={{ r: 5, fill: "#2563eb" }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Stock History */}
            <div className="chart-card">
              <h3 className="section-title">Stock History</h3>
              {priceHistory.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No stock transitions recorded yet.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map(h => (
                        <tr key={h.id}>
                          <td>{new Date(h.scraped_at).toLocaleString()}</td>
                          <td>
                            {h.in_stock ? (
                              <span className="badge badge-success">In Stock</span>
                            ) : (
                              <span className="badge badge-danger">Out of Stock</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Scrape Logs */}
            <div className="chart-card">
              <h3 className="section-title">Scrape Logs ({scrapeLogs.length})</h3>
              {scrapeLogs.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No scrape execution logs found.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Attempt</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Extracted Price</th>
                        <th>Stock</th>
                        <th>Selector Used</th>
                        <th>Error / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scrapeLogs.map(l => (
                        <tr key={l.id}>
                          <td>{new Date(l.timestamp).toLocaleTimeString()}</td>
                          <td>Attempt #{l.attempt_number}</td>
                          <td>
                            {l.status === "success" && <span className="badge badge-success">success</span>}
                            {l.status === "retry" && <span className="badge badge-warning">retry</span>}
                            {l.status === "failed" && <span className="badge badge-danger">failed</span>}
                          </td>
                          <td>{l.response_time_ms ? `${l.response_time_ms} ms` : "-"}</td>
                          <td>{l.price !== null ? `₹${l.price}` : "-"}</td>
                          <td>
                            {l.in_stock === true && "In Stock"}
                            {l.in_stock === false && "Out of Stock"}
                            {l.in_stock === null && "-"}
                          </td>
                          <td style={{ fontSize: "0.85rem" }}>
                            {l.error_type && l.error_type !== "unknown" && (
                              <span className="badge badge-secondary" style={{ marginRight: "0.4rem", fontSize: "0.75rem", textTransform: "none" }}>
                                {l.error_type}
                              </span>
                            )}
                            <span style={{ color: l.error_message ? "var(--danger)" : "var(--text-muted)" }}>
                              {l.error_message || (l.structure_changed ? "Structure changed" : "OK")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}