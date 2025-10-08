import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import KPIBlock from "../components/KPIBlock";
import "./AdminReports.css";

const VENDORS_PER_PAGE = 4;

const SERVICES = [
  "Towing service",
  "Jumpstart",
  "Flat tire",
  "Lockout",
  "Fuel delivery",
  "Heavy duty",
  "Custom",
];

const defaultFromDate = () =>
  new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
const defaultToDate = () => new Date().toISOString().slice(0, 10);

export default function AdminReports() {
  const defaultDatesRef = useRef(null);
  if (!defaultDatesRef.current) {
    defaultDatesRef.current = {
      from: defaultFromDate(),
      to: defaultToDate(),
    };
  }

  const [from, setFrom] = useState(defaultDatesRef.current.from);
  const [to, setTo] = useState(defaultDatesRef.current.to);
  const [service, setService] = useState("");
  const [city, setCity] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [vendorPage, setVendorPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const { data } = await api.get("/api/reports/range", {
        params: { from, to, service, city },
      });
      setData(data);
      setVendorPage(1);
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [from, to, service, city]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const total = Math.max(
      1,
      Math.ceil((data.topVendors?.length || 0) / VENDORS_PER_PAGE)
    );
    setVendorPage((prev) => Math.min(prev, total));
  }, [data]);

  const resetFilters = () => {
    setFrom(defaultDatesRef.current.from);
    setTo(defaultDatesRef.current.to);
    setService("");
    setCity("");
  };

  const filtersDirty = useMemo(
    () =>
      Boolean(
        service ||
          city ||
          from !== defaultDatesRef.current.from ||
          to !== defaultDatesRef.current.to
      ),
    [service, city, from, to]
  );

  const qs = new URLSearchParams({ from, to });
  if (service) qs.set("service", service);
  if (city) qs.set("city", city);

  const exportUrl = `${api.defaults.baseURL || ""}/api/exports/jobs.csv?${qs}`;
  const cityParam = city ? `&city=${encodeURIComponent(city)}` : "";
  const printUrl = `/api/reports/print?from=${from}&to=${to}${
    service ? `&service=${encodeURIComponent(service)}` : ""
  }${cityParam}`;

  const insights = useMemo(() => {
    if (!data) return [];
    const topCity = Object.entries(data.byCity || {}).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];
    const topService = Object.entries(data.byService || {}).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];
    const td = data.topVendors?.[0];
    return [
      topCity ? `Most jobs by city: ${topCity}` : null,
      topService ? `Most requested service: ${topService}` : null,
      td
        ? `Top vendor: ${td.name || "N/A"} (${td.jobs} jobs, $${Math.round(
            td.revenue
          )})`
        : null,
      `Completion rate: ${
        data.totals?.count
          ? Math.round(100 * (data.totals.completed / data.totals.count))
          : 0
      }%`,
    ].filter(Boolean);
  }, [data]);

  const vendorCount = data?.topVendors?.length || 0;
  const totalVendorPages = Math.max(
    1,
    Math.ceil(vendorCount / VENDORS_PER_PAGE)
  );
  const pagedVendors = useMemo(() => {
    if (!data?.topVendors) return [];
    const start = (vendorPage - 1) * VENDORS_PER_PAGE;
    return data.topVendors.slice(start, start + VENDORS_PER_PAGE);
  }, [data, vendorPage]);
  const showingStart = vendorCount === 0
    ? 0
    : (vendorPage - 1) * VENDORS_PER_PAGE + 1;
  const showingEnd = vendorCount === 0
    ? 0
    : Math.min(vendorPage * VENDORS_PER_PAGE, vendorCount);
  const canPrev = vendorPage > 1;
  const canNext = vendorPage < totalVendorPages;

  return (
    <div className="reports-page">
      <header className="card r-head">
        <div className="r-head-top">
          <div className="r-head-copy">
            <span className="r-tag">Insights</span>
            <h1 className="title">Reports</h1>
            <p className="r-sub">
              Monitor job volume, revenue, and performance across your network.
            </p>
          </div>
          <div className="r-head-actions">
            <a className="btn ghost" href={exportUrl} target="_blank" rel="noreferrer">
              Export CSV
            </a>
            <a className="btn primary" href={printUrl} target="_blank" rel="noreferrer">
              Print PDF
            </a>
          </div>
        </div>

        <div className="r-filters">
          <div className="filter-grid">
            <label className="filter-field">
              <span>From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="filter-field">
              <span>To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label className="filter-field">
              <span>Service</span>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                <option value="">All services</option>
                {SERVICES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>City</span>
              <input
                type="text"
                placeholder="Any"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
          </div>
          <div className="r-filter-actions">
            <span
              className={`r-filter-status ${loading ? "is-loading" : filtersDirty ? "is-active" : ""}`}
            >
              {loading ? "Refreshing..." : filtersDirty ? "Custom filters" : "Last 7 days"}
            </span>
            <button
              type="button"
              className="reports-reset"
              onClick={resetFilters}
              disabled={!filtersDirty}
            >
              Reset filters
            </button>
          </div>
        </div>
        {err && <div className="alert error">{err}</div>}
      </header>

      {!data ? (
        <p>Loading...</p>
      ) : (
        <>
          <section className="kpis">
            <KPIBlock label="Jobs" value={data.totals?.count || 0} />
            <KPIBlock label="Completed" value={data.totals?.completed || 0} />
            <KPIBlock
              label="Gross ($)"
              value={(data.totals?.gross || 0).toFixed(2)}
            />
          </section>

          <section className="grid2">
            <div className="card">
              <h3 className="section-title">By Service</h3>
              <ul className="list">
                {Object.entries(data.byService || {}).map(([k, v]) => (
                  <li key={k}>
                    <strong>{k}</strong> <span className="muted">({v})</span>
                  </li>
                ))}
                {Object.keys(data.byService || {}).length === 0 && (
                  <li className="muted">No data</li>
                )}
              </ul>
            </div>
            <div className="card">
              <h3 className="section-title">By City</h3>
              <ul className="list">
                {Object.entries(data.byCity || {}).map(([k, v]) => (
                  <li key={k}>
                    <strong>{k}</strong> <span className="muted">({v})</span>
                  </li>
                ))}
                {Object.keys(data.byCity || {}).length === 0 && (
                  <li className="muted">No data</li>
                )}
              </ul>
            </div>
          </section>

          <section className="card">
            <h3 className="section-title">Top Vendors</h3>
            <div className="table-wrap">
              <table className="table rtable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>City</th>
                    <th>Jobs</th>
                    <th>Revenue ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedVendors.map((d) => (
                    <tr key={d.vendorId || d.name}>
                      <td>{d.name || "N/A"}</td>
                      <td>{d.city || "N/A"}</td>
                      <td>{d.jobs}</td>
                      <td>{Math.round(d.revenue)}</td>
                    </tr>
                  ))}
                  {vendorCount === 0 && (
                    <tr>
                      <td colSpan="4" className="muted">
                        No data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {vendorCount > 0 && (
              <div className="pager">
                <span className="pager-meta">
                  Showing {showingStart}-{showingEnd} of {vendorCount}
                </span>
                {vendorCount > VENDORS_PER_PAGE && (
                  <div className="pager-controls">
                    <button
                      type="button"
                      className="pager-btn"
                      onClick={() => setVendorPage((prev) => Math.max(1, prev - 1))}
                      disabled={!canPrev}
                    >
                      &lt; Prev
                    </button>
                    <button
                      type="button"
                      className="pager-btn"
                      onClick={() => setVendorPage((prev) => Math.min(totalVendorPages, prev + 1))}
                      disabled={!canNext}
                    >
                      Next &gt;
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="card">
            <h3 className="section-title">Insights</h3>
            <ul className="list bullets">
              {insights.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <p className="muted small">Rule-based highlights (no AI).</p>
          </section>
        </>
      )}
    </div>
  );
}


