import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import "./DocumentsHub.css";

const OWNER_OPTIONS = [
  { value: "vendor", label: "Vendor" },
  { value: "company", label: "Company" },
  { value: "driver", label: "Driver (legacy)" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Any Status" },
  { value: "pending", label: "Pending" },
  { value: "submitted", label: "Submitted" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

const defaultForm = {
  ownerType: "vendor",
  vendorId: "",
  driverId: "",
  title: "",
  kind: "identity",
  requirementKey: "",
  url: "",
  status: "submitted",
  expiresAt: "",
  notes: "",
};

const defaultFilters = {
  ownerType: "vendor",
  vendorId: "",
  driverId: "",
  status: "",
};

const statusLabels = {
  pending: "pending",
  submitted: "submitted",
  verified: "verified",
  rejected: "rejected",
  expired: "expired",
};

const statusClass = (status) => {
  switch (status) {
    case "verified":
      return "status-badge ok";
    case "submitted":
    case "pending":
      return "status-badge warn";
    case "rejected":
    case "expired":
      return "status-badge bad";
    default:
      return "status-badge";
  }
};

const formatOwner = (doc, { vendors, drivers }) => {
  if (doc.ownerType === "vendor") {
    const vendor = vendors.find((v) => v._id === doc.vendorId);
    return vendor ? vendor.name : "Vendor";
  }
  if (doc.ownerType === "driver") {
    const driver = drivers.find((d) => d._id === doc.driverId);
    return driver ? driver.name : "Driver";
  }
  return "Company";
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString() : "-";

export default function DocumentsHub() {
  const [docs, setDocs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [form, setForm] = useState(defaultForm);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDocuments = async (nextFilters) => {
    const params = new URLSearchParams();
    if (nextFilters.ownerType) params.set("ownerType", nextFilters.ownerType);
    if (nextFilters.status) params.set("status", nextFilters.status);

    if (nextFilters.ownerType === "vendor" && nextFilters.vendorId) {
      params.set("vendorId", nextFilters.vendorId);
    }
    if (nextFilters.ownerType === "driver" && nextFilters.driverId) {
      params.set("driverId", nextFilters.driverId);
    }

    const url = params.toString()
      ? `/api/documents?${params.toString()}`
      : "/api/documents";
    const list = await api.get(url);
    setDocs(list.data || []);
  };

  useEffect(() => {
    setBusy(true);
    Promise.all([
      api.get("/api/vendors").catch(() => ({ data: [] })),
      api.get("/api/drivers").catch(() => ({ data: [] })),
    ])
      .then(([vendorRes, driverRes]) => {
        setVendors(vendorRes.data || []);
        setDrivers(driverRes.data || []);
      })
      .catch(() => {
        setErr("Failed to load vendor/driver directories");
      })
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    loadDocuments(filters).catch((error) => {
      setErr(error?.response?.data?.message || "Load failed");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.ownerType, filters.status, filters.vendorId, filters.driverId]);

  const createDocument = async () => {
    try {
      if (!form.title || !form.kind || !form.url) {
        setErr("Title, type, and URL are required");
        return;
      }
      const payload = {
        ownerType: form.ownerType,
        vendorId: form.ownerType === "vendor" ? form.vendorId || null : null,
        driverId: form.ownerType === "driver" ? form.driverId || null : null,
        title: form.title,
        kind: form.kind,
        requirementKey: form.requirementKey || undefined,
        url: form.url,
        status: form.status,
        expiresAt: form.expiresAt || null,
        notes: form.notes || undefined,
      };
      await api.post("/api/documents", payload);
      setForm(defaultForm);
      loadDocuments(filters);
      setErr("");
    } catch (error) {
      setErr(error?.response?.data?.message || "Create failed");
    }
  };

  const resetFormField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const ownerNameLookup = useMemo(
    () => ({ vendors, drivers }),
    [vendors, drivers]
  );

  return (
    <div className="docs">
      {err && (
        <div className="card alert error">
          <p>{err}</p>
        </div>
      )}

      <div className="card">
        <h3>Filter</h3>
        <div className="row stack">
          <select
            value={filters.ownerType}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                ownerType: event.target.value,
                vendorId: "",
                driverId: "",
              }))
            }
          >
            {OWNER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {filters.ownerType === "vendor" && (
            <select
              value={filters.vendorId}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  vendorId: event.target.value,
                }))
              }
            >
              <option value="">All vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor._id} value={vendor._id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          )}

          {filters.ownerType === "driver" && (
            <select
              value={filters.driverId}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  driverId: event.target.value,
                }))
              }
            >
              <option value="">All drivers</option>
              {drivers.map((driver) => (
                <option key={driver._id} value={driver._id}>
                  {driver.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, status: event.target.value }))
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h3>Add Document</h3>
        <div className="row stack">
          <select
            value={form.ownerType}
            onChange={(event) => {
              const ownerType = event.target.value;
              setForm((prev) => ({
                ...defaultForm,
                ownerType,
              }));
            }}
          >
            {OWNER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {form.ownerType === "vendor" && (
            <select
              value={form.vendorId}
              onChange={(event) => resetFormField("vendorId", event.target.value)}
            >
              <option value="">Select vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor._id} value={vendor._id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          )}

          {form.ownerType === "driver" && (
            <select
              value={form.driverId}
              onChange={(event) => resetFormField("driverId", event.target.value)}
            >
              <option value="">Select driver</option>
              {drivers.map((driver) => (
                <option key={driver._id} value={driver._id}>
                  {driver.name}
                </option>
              ))}
            </select>
          )}

          <input
            placeholder="Title"
            value={form.title}
            onChange={(event) => resetFormField("title", event.target.value)}
          />
          <input
            placeholder="Kind (insurance/license/tax)"
            value={form.kind}
            onChange={(event) => resetFormField("kind", event.target.value)}
          />
          <input
            placeholder="Requirement key (optional)"
            value={form.requirementKey}
            onChange={(event) =>
              resetFormField("requirementKey", event.target.value)
            }
          />
          <input
            placeholder="Document URL"
            value={form.url}
            onChange={(event) => resetFormField("url", event.target.value)}
          />
          <input
            type="date"
            value={form.expiresAt}
            onChange={(event) => resetFormField("expiresAt", event.target.value)}
          />
          <select
            value={form.status}
            onChange={(event) => resetFormField("status", event.target.value)}
          >
            {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(event) => resetFormField("notes", event.target.value)}
          />
          <button className="btn" onClick={createDocument} disabled={busy}>
            {busy ? "Saving..." : "Add document"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Documents</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Requirement</th>
                <th>Expiry</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc._id}>
                  <td>
                    <div className="main">{doc.title}</div>
                    <div className="muted">{doc.kind}</div>
                  </td>
                  <td>{formatOwner(doc, ownerNameLookup)}</td>
                  <td>
                    <span className={statusClass(doc.status)}>
                      {statusLabels[doc.status] || doc.status || "-"}
                    </span>
                  </td>
                  <td>
                    {doc.requirementKey ? (
                      <span className="chip">{doc.requirementKey}</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>{formatDate(doc.expiresAt)}</td>
                  <td>
                    <a href={doc.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan="6" className="muted">
                    No documents match your filters.
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
