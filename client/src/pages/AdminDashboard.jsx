// src/pages/AdminDashboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import KPIBlock from "../components/KPIBlock";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { getGoogleMapsKey } from "../config/env.js";
import "./AdminDashboard.css";

// Trim trailing zeros in decimals
function toFixedTrim(val, decimals) {
  const s = Number(val).toFixed(decimals);
  return decimals > 0 ? s.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1") : s;
}

// Abbreviate numbers and optionally prefix with USD
function formatAbbr(num, { currency = false, decimals = 1 } = {}) {
  const n = Number(num || 0);
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);

  const units = [
    { v: 1e12, s: "T" },
    { v: 1e9, s: "B" },
    { v: 1e6, s: "M" },
    { v: 1e3, s: "k" },
  ];

  let out;
  for (const u of units) {
    if (a >= u.v) {
      const q = a / u.v;
      const d = q >= 10 ? 0 : decimals; 
      out = `${toFixedTrim(q, d)}${u.s}`;
      break;
    }
  }
  if (!out) {
    const d = a >= 100 ? 0 : decimals;
    out = toFixedTrim(a, d);
  }
  return `${sign}${currency ? "$" : ""}${out}`;
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [docs, setDocs] = useState([]);
  const [dash, setDash] = useState(null);
  const [err, setErr] = useState("");
  const [slice, setSlice] = useState("month");

  // trigger re-draw of canvases on window resize
  const [viewportW, setViewportW] = useState(
    typeof window !== "undefined" ? window.innerWidth : 0
  );
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const hasGoogle = Boolean(getGoogleMapsKey());

  async function load() {
    try {
      const [s, v, dc, db] = await Promise.all([
        api.get("/api/reports/summary"),
        api.get("/api/admin/vendors"),
        api.get("/api/documents"),
        api.get("/api/reports/dashboard"),
    ]);
    setSummary(s.data);
    setVendors(Array.isArray(v.data) ? v.data : []);
      setDocs(dc.data);
      setDash(db.data);
      setErr("");
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to load dashboard");
    }
  }
  useEffect(() => {
    load();
  }, []);

  const expiring = useMemo(() => {
    const week = 7 * 24 * 3600 * 1000;
    return (docs || [])
      .filter(
        (x) =>
          x.expiresAt && new Date(x.expiresAt).getTime() - Date.now() < week
      )
      .map((x) => ({
        ...x,
        daysLeft: Math.ceil(
          (new Date(x.expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)
        ),
      }))
      .sort((a, b) => (a.daysLeft || 9999) - (b.daysLeft || 9999))
      .slice(0, 6);
  }, [docs]);

  // HiDPI canvas sizing based on CSS height/width
  function sizeCanvas(canvas) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, cssW, cssH };
  }

  // Satisfaction donut chart
  const satCanvasRef = useRef(null);

  // <-- ADDED: city canvas ref to fix the missing-ref runtime error
  const cityCanvasRef = useRef(null);

  useEffect(() => {
    if (!dash?.satisfaction || !satCanvasRef.current) return;
    const { five = 0, private: priv = 0 } = dash.satisfaction;
    const total = Math.max(1, five + priv);
    const angle = (five / total) * Math.PI * 2;

    const canvas = satCanvasRef.current;
    const { ctx, cssW, cssH } = sizeCanvas(canvas);
    ctx.clearRect(0, 0, cssW, cssH);

    const r = Math.min(cssW, cssH) / 2 - 16;
    const cx = cssW / 2;
    const cy = cssH / 2;

    ctx.lineWidth = 28;
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + angle);
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = "600 16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round((five / total) * 100)}%`, cx, cy + 4);
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(`5* vs private`, cx, cy + 22);
  }, [dash, viewportW]);

  // Simple Jobs-by-City bar chart effect (prevents runtime errors when rendering)
  useEffect(() => {
    if (!cityCanvasRef.current) return;
    const canvas = cityCanvasRef.current;
    const { ctx, cssW, cssH } = sizeCanvas(canvas);
    ctx.clearRect(0, 0, cssW, cssH);

    const data = dash?.jobsByCity || dash?.jobs_by_city || []; // tolerate different shapes
    if (!Array.isArray(data) || data.length === 0) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.fillText("No data", cssW / 2, cssH / 2);
      return;
    }

    // Expect data items like { city: "Name", count: 12 } or { city: "X", jobs: 12 }
    const points = data.map((d) => ({
      label: d.city || d.name || "-",
      value: Number(d.count ?? d.jobs ?? 0),
    }));

    const maxV = Math.max(...points.map((p) => p.value), 1);
    const padding = 28;
    const availableW = cssW - padding * 2;
    const gap = 12;
    const barWidth = Math.max(8, (availableW - gap * (points.length - 1)) / points.length);
    const bottomY = cssH - 28;

    // draw labels and bars
    points.forEach((p, i) => {
      const x = padding + i * (barWidth + gap);
      const h = (p.value / maxV) * (cssH - 80);
      // bar
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(x, bottomY - h, barWidth, h);
      // value text
      ctx.fillStyle = "#111827";
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.fillText(p.value.toString(), x + barWidth / 2, bottomY - h - 8);
      // label (wrap/clip)
      ctx.fillStyle = "#6b7280";
      ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText(
        p.label.length > 10 ? p.label.slice(0, 10) + "…" : p.label,
        x + barWidth / 2,
        bottomY + 16
      );
    });
  }, [dash, viewportW]);

  const snap = dash?.revenue?.[slice] || {
    gross: 0,
    payouts: 0,
    expenses: 0,
    net: 0,
  };

  return (
    <div className="admindash">
      <header className="page-head">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-sub">
            Mission control for live ops, revenue, and compliance.
          </p>
        </div>
      </header>

      {err && <div className="card alert error">{err}</div>}

      {/* KPI row - left-aligned, small gap (CSS handles layout) */}
      <section className="kpis">
        <div className="kpi-card">
          <KPIBlock
            label="Completed Jobs"
            value={Number(summary?.completed ?? summary?.completedCount ?? 0)}
            icon=""
            trend={
              summary?.trendJobs > 0
                ? "up"
                : summary?.trendJobs < 0
                ? "down"
                : "neutral"
            }
            trendValue={summary?.trendJobs}
          />
        </div>
        <div className="kpi-card">
          <KPIBlock
            label="Avg Revenue / Job"
            value={formatAbbr(summary?.avgRevenue || 0, { currency: true })}
            icon=""
            trend={
              summary?.trendRevenue > 0
                ? "up"
                : summary?.trendRevenue < 0
                ? "down"
                : "neutral"
            }
            trendValue={summary?.trendRevenue}
          />
        </div>
        <div className="kpi-card">
          <KPIBlock
            label="Avg Rating"
            value={Number(summary?.avgRating || 0).toFixed(2)}
            icon="*"
            trend={
              summary?.trendRating > 0
                ? "up"
                : summary?.trendRating < 0
                ? "down"
                : "neutral"
            }
            trendValue={summary?.trendRating}
          />
        </div>
      </section>

      {/* Revenue snapshot + Satisfaction */}
      <section className="grid2">
        <div className="card revenue-card">
          <div className="card-head space">
            <h3 className="section-title">Revenue Snapshot</h3>
            <div className="seg">
              {["day", "week", "month"].map((k) => (
                <button
                  key={k}
                  className={`segbtn ${slice === k ? "active" : ""}`}
                  onClick={() => setSlice(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className="rev-grid">
            <div className="rev-item">
              <span className="muted">Gross</span>
              <strong className="num">
                {formatAbbr(snap.gross, { currency: true })}
              </strong>
            </div>
            <div className="rev-item">
              <span className="muted">Payouts</span>
              <strong className="num">
                {formatAbbr(snap.payouts, { currency: true })}
              </strong>
            </div>
            <div className="rev-item">
              <span className="muted">Expenses</span>
              <strong className="num">
                {formatAbbr(snap.expenses, { currency: true })}
              </strong>
            </div>
            <div className={`rev-item net ${snap.net >= 0 ? "ok" : "bad"}`}>
              <span className="muted">Net</span>
              <strong className="num">
                {formatAbbr(snap.net, { currency: true })}
              </strong>
            </div>
          </div>
          <p className="muted small tip">Net = Gross - Payouts - Expenses</p>
        </div>

        <div className="card satisfaction-card">
          <div className="card-head">
            <h3 className="section-title">Customer Satisfaction</h3>
          </div>
          <canvas ref={satCanvasRef} className="chart-canvas" />
          <div className="legend">
            <span className="dot green"></span> 5* (
            {dash?.satisfaction?.five || 0})<span className="dot gray"></span>{" "}
            Private ({dash?.satisfaction?.private || 0})
          </div>
        </div>
      </section>

      {/* Live vendors + Expiring docs */}
      <section className="grid2">
        <div className="card vendors-card">
          <div className="card-head">
            <h3 className="section-title">Live Vendors</h3>
            <span className="online-count">
              {vendors.filter((v) => v.active !== false).length} active
            </span>
          </div>
          {hasGoogle ? (
            <GMap vendors={vendors} showRoute={false} />
          ) : (
            <LiveMap vendors={vendors} />
          )}
        </div>
        <div className="card docs-card">
          <div className="card-head">
            <h3 className="section-title">Expiring Documents (7 days)</h3>
            <Link to="/admin/documents" className="small link view-all">
                View all &gt;

            </Link>
          </div>
          <ul className="doc-list">
            {expiring.length === 0 && (
              <li className="muted empty-state">
                All documents are up to date 
              </li>
            )}
            {expiring.map((d) => (
              <li key={d._id} className="doc-item">
                <div className="doc-main">
                  <strong className="doc-title">
                    {d.title || d.type || "Document"}
                  </strong>
                  <span className="doc-owner">
                    {d.ownerType === "vendor"
                      ? d.vendorName || "Vendor"
                      : "Company"}
                  </span>
                </div>
                <div className="doc-meta">
                  <span
                    className={
                      "badge " +
                      (d.daysLeft <= 0
                        ? "bad"
                        : d.daysLeft <= 3
                        ? "warn"
                        : "ok")
                    }
                  >
                    {d.daysLeft <= 0 ? "Expired" : `${d.daysLeft}d`}
                  </span>
                  <span className="muted small">
                    {new Date(d.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Trends & Top performers */}
      <section className="grid2">
        <div className="card trends-card">
          <div className="card-head">
            <h3 className="section-title">Jobs by City (14 days)</h3>
          </div>
          <canvas ref={cityCanvasRef} className="chart-canvas" />
        </div>
        <div className="card performers-card">
          <div className="card-head">
            <h3 className="section-title">Top Performers (30 days)</h3>
          </div>
          <ul className="perf-list">
            {(dash?.topPerformers || []).map((p) => (
              <li key={p.vendorId || p.name} className="perf-item">
                <div className="pf-main">
                  <strong>{p.name}</strong>
                  <span className="muted small">{p.city || "-"}</span>
                </div>
                <div className="pf-metrics">
                  <span className="chip">{p.jobs} jobs</span>
                  <span className="chip num">
                    {formatAbbr(p.revenue || 0, { currency: true })}
                  </span>
                  <span className="chip">
                    {p.avgRating?.toFixed(1) || "-"}*
                  </span>
                </div>
              </li>
            ))}
            {(dash?.topPerformers || []).length === 0 && (
              <li className="muted empty-state">No performance data yet.</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
