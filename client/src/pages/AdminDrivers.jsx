import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import "./AdminDrivers.css";

export default function AdminDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [overview, setOverview] = useState({}); // _id -> {docs, stats,...}
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // form
  const [form, setForm] = useState({
    name: "",
    phone: "",
    city: "",
    earningsSplit: "70", // % in UI
  });

  // filters
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [onlyAvail, setOnlyAvail] = useState(false);

  const load = async () => {
    try {
      setBusy(true);
      const [dres, ores] = await Promise.all([
        api.get("/api/drivers"),
        api.get("/api/admin/drivers/overview").catch(() => ({ data: [] })), // graceful fallback
      ]);
      setDrivers(dres.data || []);
      const map = {};
      (ores.data || []).forEach((o) => (map[o._id] = o));
      setOverview(map);
      setErr("");
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to load");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // create
  const create = async () => {
    try {
      if (!form.name || !form.phone) return;
      const raw = Number(form.earningsSplit);
      const split = isNaN(raw) ? 0.7 : raw > 1 ? raw / 100 : raw; // accept "70" or "0.7"
      await api.post("/api/drivers", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        earningsSplit: split,
      });
      setForm({ name: "", phone: "", city: "", earningsSplit: "70" });
      load();
    } catch (e) {
      setErr(e?.response?.data?.message || "Create failed");
    }
  };

  // availability
  const toggleAvail = async (d) => {
    await api.patch(`/api/drivers/${d._id}`, { available: !d.available });
    load();
  };

  // delete
  const del = async (d) => {
    if (!window.confirm(`Delete ${d.name}?`)) return;
    await api.delete(`/api/drivers/${d._id}`);
    load();
  };

  // filtering
  const cities = useMemo(
    () => [...new Set((drivers || []).map((d) => d.city).filter(Boolean))],
    [drivers]
  );
  const filtered = useMemo(() => {
    return (drivers || []).filter((d) => {
      if (onlyAvail && !d.available) return false;
      if (city && d.city !== city) return false;
      const text = `${d.name} ${d.phone} ${d.city || ""}`.toLowerCase();
      return !q || text.includes(q.toLowerCase());
    });
  }, [drivers, onlyAvail, city, q]);

  return (
    <div className="adrivers">
      <header className="head">
        <h1 className="title">Drivers</h1>
        <div className="filters">
          <input
            className="input"
            placeholder="Search name/phone/city"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="chk">
            <input
              type="checkbox"
              checked={onlyAvail}
              onChange={(e) => setOnlyAvail(e.target.checked)}
            />
            <span>Available only</span>
          </label>
          <button className="btn" onClick={load} disabled={busy}>
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {err && (
        <div className="card alert error">
          <p>{err}</p>
        </div>
      )}

      {/* Create form */}
      <div className="card form">
        <h3 className="section-title">Add Driver</h3>
        <div className="row">
          <label>
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label>
            <span>Phone</span>
            <input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>City</span>
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </label>
          <label>
            <span>Split %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.earningsSplit}
              onChange={(e) =>
                setForm((f) => ({ ...f, earningsSplit: e.target.value }))
              }
            />
          </label>
          <div className="row end">
            <button className="btn" onClick={create}>
              Create
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <h3 className="section-title">All Drivers</h3>
        <div className="table-wrap">
          <table className="table dtable">
            <thead>
              <tr>
                <th>Name</th>
                <th>City</th>
                <th>Available</th>
                <th>Docs</th>
                <th>Completed</th>
                <th>Avg *</th>
                <th>Revenue</th>
                <th>Payout Owed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const ov = overview[d._id];
                const docs = ov?.docs;
                const stats = ov?.stats;

                return (
                  <tr key={d._id}>
                    <td>
                      <div className="main">{d.name}</div>
                      <div className="muted">{d.phone}</div>
                    </td>
                    <td>{d.city || "-"}</td>
                    <td>
                      <button
                        className={"pill " + (d.available ? "ok" : "off")}
                        onClick={() => toggleAvail(d)}
                        title="Toggle availability"
                      >
                        {d.available ? "Yes" : "No"}
                      </button>
                    </td>
                    <td>
                      {docs ? (
                        <>
                          <span className="badge">
                            {docs.approved}/{docs.total}
                          </span>
                          {docs.expired > 0 && (
                            <span className="badge bad">
                              exp {docs.expired}
                            </span>
                          )}
                          <a
                            href={`/admin/documents?driverId=${d._id}`}
                            className="btn-link small"
                          >
                            manage
                          </a>
                        </>
                      ) : (
                        <a
                          href={`/admin/documents?driverId=${d._id}`}
                          className="btn-link small"
                        >
                          view
                        </a>
                      )}
                    </td>
                    <td>{stats ? stats.completed : "-"}</td>
                    <td>{stats ? stats.avgRating.toFixed(2) : "-"}</td>
                    <td>{stats ? `$${stats.revenue.toFixed(2)}` : "-"}</td>
                    <td>{stats ? `$${stats.payoutOwed.toFixed(2)}` : "-"}</td>
                    <td>
                      <button className="danger" onClick={() => del(d)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="9" className="muted">
                    No drivers match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

