import { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./DocumentsHub.css";

export default function DocumentsHub() {
  const [docs, setDocs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [q, setQ] = useState({ ownerType: "driver", driverId: "", status: "" });
  const [form, setForm] = useState({
    ownerType: "driver",
    driverId: "",
    title: "",
    kind: "license",
    url: "",
    status: "pending",
    expiresAt: "",
  });
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const params = new URLSearchParams(
        Object.fromEntries(Object.entries(q).filter(([, v]) => v !== ""))
      );
      const list = await api.get(`/api/documents?${params.toString()}`);
      setDocs(list.data);
    } catch (e) {
      setErr(e?.response?.data?.message || "Load failed");
    }
  };

  useEffect(() => {
    api.get("/api/drivers").then((r) => setDrivers(r.data));
  }, []);
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [q.ownerType, q.driverId, q.status]);

  const create = async () => {
    try {
      const payload = {
        ...form,
        driverId: form.ownerType === "driver" ? form.driverId || null : null,
        expiresAt: form.expiresAt || null,
      };
      await api.post("/api/documents", payload);
      setForm({
        ownerType: "driver",
        driverId: "",
        title: "",
        kind: "license",
        url: "",
        status: "pending",
        expiresAt: "",
      });
      load();
    } catch (e) {
      setErr(e?.response?.data?.message || "Create failed");
    }
  };

  return (
    <div className="docs">
      {err && (
        <div className="card">
          <p className="error">{err}</p>
        </div>
      )}

      <div className="card">
        <h3>Filter</h3>
        <div className="row stack">
          <select
            value={q.ownerType}
            onChange={(e) => setQ((x) => ({ ...x, ownerType: e.target.value }))}
          >
            <option value="driver">Driver</option>
            <option value="company">Company</option>
          </select>
          {q.ownerType === "driver" && (
            <select
              value={q.driverId}
              onChange={(e) =>
                setQ((x) => ({ ...x, driverId: e.target.value }))
              }
            >
              <option value="">All Drivers</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={q.status}
            onChange={(e) => setQ((x) => ({ ...x, status: e.target.value }))}
          >
            <option value="">Any Status</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h3>Add Document</h3>
        <div className="row stack">
          <select
            value={form.ownerType}
            onChange={(e) =>
              setForm((f) => ({ ...f, ownerType: e.target.value }))
            }
          >
            <option value="driver">Driver</option>
            <option value="company">Company</option>
          </select>
          {form.ownerType === "driver" && (
            <select
              value={form.driverId}
              onChange={(e) =>
                setForm((f) => ({ ...f, driverId: e.target.value }))
              }
            >
              <option value="">Select Driver</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <input
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            placeholder="Kind (license/insurance/id)"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          />
          <input
            placeholder="URL"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          />
          <input
            type="date"
            value={form.expiresAt}
            onChange={(e) =>
              setForm((f) => ({ ...f, expiresAt: e.target.value }))
            }
          />
          <button onClick={create}>Create</button>
        </div>
      </div>

      <div className="card">
        <h3>Documents</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Expiry</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d._id}>
                <td>
                  {d.title}
                  <div className="muted">{d.kind}</div>
                </td>
                <td>
                  {d.ownerType === "driver"
                    ? drivers.find((x) => x._id === d.driverId)?.name ||
                      "Driver"
                    : "Company"}
                </td>
                <td>{d.status}</td>
                <td>
                  {d.expiresAt
                    ? new Date(d.expiresAt).toLocaleDateString()
                    : "-"}
                </td>
                <td>
                  <a href={d.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

