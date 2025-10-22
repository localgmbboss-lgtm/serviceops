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

const formatCount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  try {
    return new Intl.NumberFormat().format(num);
  } catch (error) {
    return String(num);
  }
};

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [docs, setDocs] = useState([]);
  const [dash, setDash] = useState(null);
  const [err, setErr] = useState("");
  const [slice, setSlice] = useState("month");
  const [reviewRange, setReviewRange] = useState("30");
  const [reviewCategory, setReviewCategory] = useState("all");

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

  // Satisfaction gauge canvas
  const satCanvasRef = useRef(null);
  const satAnimationStateRef = useRef({
    phaseA: Math.random() * Math.PI * 2,
    phaseB: Math.random() * Math.PI * 2,
    speedA: 0.018 + Math.random() * 0.008,
    speedB: 0.022 + Math.random() * 0.01,
    targetSpeedA: 0.018 + Math.random() * 0.008,
    targetSpeedB: 0.022 + Math.random() * 0.01,
    freqA: 1.7 + Math.random() * 0.9,
    freqB: 2.8 + Math.random() * 1.2,
    targetFreqA: 1.7 + Math.random() * 0.9,
    targetFreqB: 2.8 + Math.random() * 1.2,
    ampA: 0.08,
    ampB: 0.05,
    targetAmpA: 0.08,
    targetAmpB: 0.05,
    jitter: 0,
    targetJitter: 0,
  });
  const satisfaction = dash?.satisfaction || {};
  const positiveReviews = Number(satisfaction.five || 0);
  const privateReviews = Number(satisfaction.private || 0);
  const totalReviews = positiveReviews + privateReviews;
  const satisfactionRatio = totalReviews ? positiveReviews / totalReviews : 0;
  const satisfactionScore10 = satisfactionRatio * 10;
  const satisfactionScorePercent = Math.round(satisfactionRatio * 100);
  const reviewRangeLabel =
    reviewRange === "7"
      ? "last 7 days"
      : reviewRange === "30"
      ? "last 30 days"
      : "last 90 days";

  // Work vs revenue trend canvas
  const workCanvasRef = useRef(null);

  useEffect(() => {
    const canvas = satCanvasRef.current;
    if (!canvas) return;

    const state = satAnimationStateRef.current;
    let rafId = null;

    const drawWaveGauge = () => {
      const { ctx, cssW, cssH } = sizeCanvas(canvas);
      ctx.clearRect(0, 0, cssW, cssH);

      const cx = cssW / 2;
      const radius = Math.min(cssW, cssH) / 2.4;
      const cy = cssH / 2 + 12;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius + radius * 0.12, 0, Math.PI * 2);
      ctx.closePath();
      const ringGradient = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
      ringGradient.addColorStop(0, "rgba(56, 189, 248, 0.04)");
      ringGradient.addColorStop(1, "rgba(129, 140, 248, 0.08)");
      ctx.fillStyle = ringGradient;
      ctx.fill();
      ctx.restore();

      ctx.lineWidth = radius * 0.12;
      ctx.strokeStyle = "rgba(30, 64, 175, 0.35)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius + ctx.lineWidth / 2.2, 0, Math.PI * 2);
      ctx.stroke();

      const outerGlow = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
      outerGlow.addColorStop(0, "rgba(59, 130, 246, 0.45)");
      outerGlow.addColorStop(1, "rgba(99, 102, 241, 0.4)");
      ctx.lineWidth = 3;
      ctx.strokeStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (!totalReviews) {
        ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
        ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
        ctx.textAlign = "center";
        ctx.fillText("No review data yet", cx, cy + 4);
        rafId = requestAnimationFrame(drawWaveGauge);
        return;
      }

      state.phaseA += state.speedA;
      state.phaseB += state.speedB;
      if (Math.random() < 0.006) state.targetSpeedA = 0.014 + Math.random() * 0.01;
      if (Math.random() < 0.006) state.targetSpeedB = 0.018 + Math.random() * 0.012;
      if (Math.random() < 0.008) state.targetAmpA = 0.06 + Math.random() * 0.04;
      if (Math.random() < 0.008) state.targetAmpB = 0.04 + Math.random() * 0.035;
      if (Math.random() < 0.007) state.targetFreqA = 1.4 + Math.random() * 1.1;
      if (Math.random() < 0.007) state.targetFreqB = 2.2 + Math.random() * 1.4;
      if (Math.random() < 0.01) state.targetJitter = (Math.random() - 0.5) * 0.05;

      state.speedA += (state.targetSpeedA - state.speedA) * 0.04;
      state.speedB += (state.targetSpeedB - state.speedB) * 0.04;
      state.ampA += (state.targetAmpA - state.ampA) * 0.08;
      state.ampB += (state.targetAmpB - state.ampB) * 0.08;
      state.freqA += (state.targetFreqA - state.freqA) * 0.05;
      state.freqB += (state.targetFreqB - state.freqB) * 0.05;
      state.jitter += (state.targetJitter - state.jitter) * 0.05;

      const positiveRatio = satisfactionRatio;
      const baseLevel = cy + radius - positiveRatio * (radius * 1.95);
      const amplitudeA = radius * state.ampA;
      const amplitudeB = radius * state.ampB;
      const jitter = state.jitter * radius;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      const topGradient = ctx.createLinearGradient(cx, cy - radius, cx, cy);
      topGradient.addColorStop(0, "#20d4ff");
      topGradient.addColorStop(1, "#1ba7f0");
      ctx.fillStyle = topGradient;
      ctx.fillRect(cx - radius - 8, cy - radius - 8, radius * 2 + 16, radius * 2 + 16);

      const bottomGradient = ctx.createLinearGradient(cx, cy, cx, cy + radius);
      bottomGradient.addColorStop(0, "#ff7ad9");
      bottomGradient.addColorStop(1, "#ff5ca8");

      const startX = cx - radius - 8;
      const endX = cx + radius + 8;
      const span = endX - startX;
      const step = span / 160;

      const waveY = (x) => {
        const rel = (x - startX) / span;
        const angleA = rel * Math.PI * state.freqA + state.phaseA;
        const angleB = rel * Math.PI * state.freqB + state.phaseB;
        const y =
          baseLevel +
          jitter +
          Math.sin(angleA) * amplitudeA +
          Math.sin(angleB) * amplitudeB;
        const minY = cy - radius + 4;
        const maxY = cy + radius - 4;
        return Math.max(minY, Math.min(maxY, y));
      };

      ctx.beginPath();
      ctx.moveTo(startX, cy + radius + 12);
      ctx.lineTo(startX, waveY(startX));
      for (let x = startX; x <= endX; x += step) {
        ctx.lineTo(x, waveY(x));
      }
      ctx.lineTo(endX, cy + radius + 12);
      ctx.closePath();
      ctx.fillStyle = bottomGradient;
      ctx.fill();

      const highlightGradient = ctx.createRadialGradient(
        cx,
        cy - radius * 0.9,
        radius * 0.1,
        cx,
        cy - radius * 0.9,
        radius * 1.1
      );
      highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.35)");
      highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = highlightGradient;
      ctx.beginPath();
      ctx.arc(cx, cy - radius * 0.35, radius * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      ctx.restore();

      ctx.fillStyle = "#f8fafc";
      ctx.font = `600 ${Math.round(radius * 0.28)}px system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(positiveRatio * 100)}%`, cx, cy - radius * 0.4);
      ctx.fillStyle = "rgba(248, 250, 252, 0.85)";
      ctx.fillText(`${Math.round((1 - positiveRatio) * 100)}%`, cx, cy + radius * 0.45);

      rafId = requestAnimationFrame(drawWaveGauge);
    };

    drawWaveGauge();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [satisfactionRatio, totalReviews, viewportW]);

  // Work vs revenue dual line chart (14-day window)
  useEffect(() => {
    if (!workCanvasRef.current) return;
    const trend = dash?.workVsRevenue;
    const canvas = workCanvasRef.current;
    const { ctx, cssW, cssH } = sizeCanvas(canvas);
    ctx.clearRect(0, 0, cssW, cssH);

    const labels = Array.isArray(trend?.labels) ? trend.labels : [];
    const jobsRaw = Array.isArray(trend?.jobs) ? trend.jobs : [];
    const revenueRaw = Array.isArray(trend?.revenue) ? trend.revenue : [];

    if (labels.length === 0 || jobsRaw.length === 0 || revenueRaw.length === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.fillText("No trend data yet", cssW / 2, cssH / 2);
      return;
    }

    const padding = { top: 28, right: 60, bottom: 40, left: 60 };
    const chartW = Math.max(0, cssW - padding.left - padding.right);
    const chartH = Math.max(0, cssH - padding.top - padding.bottom);
    if (chartW === 0 || chartH === 0) return;

    const jobs = labels.map((_, idx) => Number(jobsRaw[idx] || 0));
    const revenueK = labels.map((_, idx) => Number(revenueRaw[idx] || 0) / 1000);

    const rawMax = Math.max(...jobs, ...revenueK, 1);
    const maxScale = rawMax * 1.12;
    const stepX = labels.length > 1 ? chartW / (labels.length - 1) : 0;

    // Axes
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.stroke();

    // Y ticks & grid
    const ticks = 4;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillStyle = "#cbd5f5";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= ticks; i++) {
      const value = (maxScale / ticks) * i;
      const displayValue =
        maxScale <= 6
          ? parseFloat(value.toFixed(1)).toString()
          : Math.round(value).toString();
      const y = padding.top + chartH - (value / maxScale) * chartH;
      ctx.fillText(displayValue, padding.left - 10, y);
      if (i !== 0) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();
      }
    }

    // X labels (adaptive skipping)
    const labelSkip = labels.length > 7 ? Math.ceil(labels.length / 7) : 1;
    ctx.fillStyle = "#cbd5f5";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    });
    labels.forEach((label, idx) => {
      if (idx % labelSkip !== 0 && idx !== labels.length - 1) return;
      const x = padding.left + stepX * idx;
      const [yy, mm, dd] = label.split("-").map((s) => parseInt(s, 10));
      const dateObj = new Date(yy, (mm || 1) - 1, dd || 1);
      ctx.fillText(formatter.format(dateObj), x, padding.top + chartH + 10);
    });

    const toPoints = (series) =>
      series.map((value, idx) => {
        const x = padding.left + stepX * idx;
        const y = padding.top + chartH - (value / maxScale) * chartH;
        return { x, y };
      });

    const buildSmoothPath = (points, smoothness = 0.4) => {
      if (points.length < 2) return [];
      const commands = [];
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        const cp1x = p1.x + ((p2.x - p0.x) * smoothness) / 6;
        const cp1y = p1.y + ((p2.y - p0.y) * smoothness) / 6;
        const cp2x = p2.x - ((p3.x - p1.x) * smoothness) / 6;
        const cp2y = p2.y - ((p3.y - p1.y) * smoothness) / 6;

        commands.push({
          cp1x,
          cp1y,
          cp2x,
          cp2y,
          x: p2.x,
          y: p2.y,
        });
      }
      return commands;
    };

    const drawSeries = (series, color, options = {}) => {
      const { fill } = options;
      if (!series.length) return;
      const points = toPoints(series);
      if (points.length < 2) return;
      const commands = buildSmoothPath(points);

      ctx.lineWidth = 2.75;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      commands.forEach((cmd) => {
        ctx.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
      });
      ctx.stroke();

      if (fill) {
        const gradient = ctx.createLinearGradient(
          0,
          padding.top,
          0,
          padding.top + chartH
        );
        gradient.addColorStop(0, fill);
        gradient.addColorStop(1, "rgba(255,255,255,0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(points[0].x, padding.top + chartH);
        ctx.lineTo(points[0].x, points[0].y);
        commands.forEach((cmd) => {
          ctx.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
        });
        ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = color;
      points.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    drawSeries(revenueK, "rgba(37, 99, 235, 1)", {
      fill: "rgba(37, 99, 235, 0.16)",
    });
    drawSeries(jobs, "rgba(34, 197, 94, 1)");
  }, [dash, viewportW]);

  const snap = dash?.revenue?.[slice] || {
    gross: 0,
    payouts: 0,
    expenses: 0,
    net: 0,
  };

  const onlineVendors = useMemo(
    () => vendors.filter((vendor) => vendor && vendor.active !== false).length,
    [vendors]
  );

  const refreshedAtLabel = useMemo(() => {
    const stamp =
      dash?.generatedAt ||
      dash?.refreshedAt ||
      summary?.generatedAt ||
      summary?.updatedAt ||
      null;
    if (!stamp) return "";
    try {
      return new Date(stamp).toLocaleString();
    } catch (error) {
      return "";
    }
  }, [dash, summary]);

  const heroStats = useMemo(
    () => [
      {
        id: "jobs",
        label: "Active jobs",
        value: formatCount(
          summary?.activeJobs ??
            summary?.active ??
            summary?.inProgress ??
            summary?.open ??
            0
        ),
      },
      {
        id: "net",
        label: "Net today",
        value: formatAbbr(
          dash?.revenue?.day?.net ?? dash?.revenue?.day?.gross ?? 0,
          { currency: true }
        ),
      },
      {
        id: "vendors",
        label: "Vendors online",
        value: formatCount(onlineVendors),
      },
      {
        id: "alerts",
        label: "Docs expiring",
        value: formatCount(expiring.length),
      },
    ],
    [dash, expiring.length, onlineVendors, summary]
  );

  return (
    <div className="admindash">
      <section className="admindash-hero">
        <div className="admindash-hero__primary">
          <p className="admindash-eyebrow">Operations control</p>
          <h1 className="admindash-hero__title">Dispatch HQ</h1>
          <p className="admindash-hero__subtitle">
            Mission control for live ops, revenue, and compliance.
          </p>
          <div className="admindash-hero__cta">
            <Link to="/jobs" className="admindash-hero__btn">
              Open jobs board
            </Link>
            <Link
              to="/admin/vendors"
              className="admindash-hero__btn admindash-hero__btn--ghost"
            >
              Manage vendors
            </Link>
          </div>
          <span className="admindash-hero__updated">
            {refreshedAtLabel
              ? `Updated ${refreshedAtLabel}`
              : "Live telemetry active"}
          </span>
        </div>
        <div className="admindash-hero__stats">
          {heroStats.map((metric) => (
            <article key={metric.id} className="admindash-hero__stat">
              <span className="admindash-hero__stat-label">
                {metric.label}
              </span>
              <strong className="admindash-hero__stat-value">
                {metric.value}
              </strong>
            </article>
          ))}
        </div>
      </section>

      {err ? (
        <div className="admindash-alert" role="alert">
          {err}
        </div>
      ) : null}

      <div className="admindash-shell">
        <section className="admindash-panel admindash-panel--kpis">
          <header className="admindash-panel__head">
            <h2>Performance pulse</h2>
            <p>Track today&apos;s core metrics at a glance.</p>
          </header>
          <div className="kpis">
            <div className="kpi-card">
              <KPIBlock
                label="Completed Jobs"
                value={Number(
                  summary?.completed ?? summary?.completedCount ?? 0
                )}
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
                value={formatAbbr(summary?.avgRevenue || 0, {
                  currency: true,
                })}
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
          </div>
        </section>

        <section className="admindash-panel">
          <div className="admindash-panel__grid">
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
              <p className="muted small tip">
                Net = Gross - Payouts - Expenses
              </p>
            </div>

            <div className="card satisfaction-card">
              <div className="satisfaction-card__header">
                <div>
                  <h3 className="section-title">Summary data</h3>
                  <p className="muted small">
                    Customer sentiment across the selected filters.
                  </p>
                </div>
                <div className="satisfaction-card__filters">
                  <select
                    value={reviewRange}
                    onChange={(event) => setReviewRange(event.target.value)}
                    aria-label="Review range"
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                  <select
                    value={reviewCategory}
                    onChange={(event) => setReviewCategory(event.target.value)}
                    aria-label="Review category"
                  >
                    <option value="all">All categories</option>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>
              </div>
              <div className="satisfaction-card__body">
                <div className="satisfaction-card__gauge">
                  <span className="satisfaction-card__glow satisfaction-card__glow--left" />
                  <span className="satisfaction-card__glow satisfaction-card__glow--right" />
                  <canvas ref={satCanvasRef} className="gauge-canvas" />
                </div>
                <div className="satisfaction-card__info">
                  <div className="satisfaction-card__score">
                    <span className="score-main">
                      {totalReviews ? satisfactionScore10.toFixed(1) : "--"}
                    </span>
                    <span className="score-sub">
                      Avg rating /10{" "}
                      {totalReviews ? `(${satisfactionScorePercent}% positive)` : ""}
                    </span>
                  </div>
                  <Link to="/admin/crm/reviews" className="satisfaction-card__cta">
                    MORE DETAILED
                  </Link>
                  <p className="muted small">
                    {totalReviews
                      ? `${positiveReviews} of ${totalReviews} reviews were 5* in the ${reviewRangeLabel}.`
                      : "We'll show review insights once feedback starts coming in."}
                  </p>
                  <div className="satisfaction-card__segments">
                    <span className="segment positive">
                      5* <strong>{positiveReviews}</strong>
                    </span>
                    <span className="segment neutral">
                      Private <strong>{privateReviews}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="admindash-panel">
          <div className="admindash-panel__grid">
            <div className="card vendors-card">
              <div className="card-head">
                <h3 className="section-title">Live Vendors</h3>
                <span className="online-count">{onlineVendors} active</span>
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
          </div>
        </section>

        <section className="admindash-panel">
          <div className="admindash-panel__grid">
            <div className="card trends-card">
              <div className="card-head">
                <h3 className="section-title">Work vs Revenue (14 days)</h3>
              </div>
              <canvas ref={workCanvasRef} className="chart-canvas" />
              <div className="legend">
                <span className="dot blue"></span> Revenue ($k)
                <span className="dot green"></span> Completed Jobs
              </div>
              <p className="muted small tip">
                Revenue plotted in thousands for a shared scale.
              </p>
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
                  <li className="muted empty-state">
                    No performance data yet.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
