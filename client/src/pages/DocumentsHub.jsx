import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../lib/api";
import "./DocumentsHub.css";

const OWNER_OPTIONS = [
  { value: "vendor", label: "Vendor" },
  { value: "company", label: "Company" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Any Status" },
  { value: "pending", label: "Pending" },
  { value: "submitted", label: "Submitted" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

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

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : "-");
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

export default function DocumentsHub() {
  const [docs, setDocs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [filters, setFilters] = useState({ ownerType: "vendor", vendorId: "", status: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});

  useEffect(() => {
    api
      .get("/api/vendors")
      .then((response) => setVendors(response.data || []))
      .catch(() => setError("Failed to load vendor directory"));
  }, []);

  const loadDocuments = useCallback(async (nextFilters) => {
        setLoading(true);
        setError("");
        try {
          const params = new URLSearchParams();
          if (nextFilters.ownerType) params.set("ownerType", nextFilters.ownerType);
          if (nextFilters.status) params.set("status", nextFilters.status);
          if (nextFilters.ownerType === "vendor" && nextFilters.vendorId) {
            params.set("vendorId", nextFilters.vendorId);
          }
          const url = params.toString()
            ? `/api/documents?${params.toString()}`
            : "/api/documents";
          const { data } = await api.get(url);
          setDocs(Array.isArray(data) ? data : []);
        } catch (err) {
          setError(err?.response?.data?.message || "Failed to load documents");
        } finally {
          setLoading(false);
        }
      }, []);

  useEffect(() => {
    loadDocuments(filters);
  }, [filters, loadDocuments]);

  const ownerLookup = useMemo(
    () => new Map(vendors.map((vendor) => [String(vendor._id), vendor.name])),
    [vendors]
  );

  const handleStatusChange = async (docId, status) => {
    setBusy((prev) => ({ ...prev, [docId]: status }));
    try {
      await api.patch(`/api/documents/${docId}`, { status });
      setDocs((prev) =>
        prev.map((doc) =>
          doc._id === docId
            ? { ...doc, status, statusUpdatedAt: new Date().toISOString() }
            : doc
        )
      );
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to update document");
    } finally {
      setBusy((prev) => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
    }
  };

  const resetFilters = () => setFilters({ ownerType: "vendor", vendorId: "", status: "" });

  return (
    <div className="docs">
      <header className="docs__header card">
        <div className="docs__filters">
          <label>
            <span>Owner type</span>
            <select
              value={filters.ownerType}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, ownerType: event.target.value, vendorId: "" }))
              }
            >
              {OWNER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {filters.ownerType === "vendor" && (
            <label>
              <span>Vendor</span>
              <select
                value={filters.vendorId}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, vendorId: event.target.value }))
                }
              >
                <option value="">All vendors</option>
                {vendors.map((vendor) => (
                  <option key={vendor._id} value={vendor._id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span>Status</span>
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
          </label>

          <button type="button" className="btn ghost" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
        {error && <p className="docs__error">{error}</p>}
      </header>

      <div className="card">
        {loading ? (
          <p className="muted">Loading documents�</p>
        ) : (
          <table className="docs__table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Requirement</th>
                <th>Expires</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const ownerName =
                  doc.ownerType === "vendor"
                    ? ownerLookup.get(String(doc.vendorId)) || "Vendor"
                    : "Company";
                const busyAction = busy[doc._id];
                return (
                  <tr key={doc._id}>
                    <td>
                      <div className="main">{doc.title || "Document"}</div>
                      <div className="muted small">{doc.kind || "-"}</div>
                    </td>
                    <td>{ownerName}</td>
                    <td>
                      <span className={statusClass(doc.status)}>{doc.status}</span>
                    </td>
                    <td>{doc.requirementKey || "-"}</td>
                    <td>{formatDate(doc.expiresAt)}</td>
                    <td>{formatDateTime(doc.uploadedAt)}</td>
                    <td>
                      <div className="docs__actions">
                        <a href={doc.url} target="_blank" rel="noreferrer" className="btn sm ghost">
                          Open
                        </a>
                        <button
                          type="button"
                          className="btn sm primary"
                          disabled={busyAction === "verified"}
                          onClick={() => handleStatusChange(doc._id, "verified")}
                        >
                          {busyAction === "verified" ? "Verifying�" : "Mark verified"}
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          disabled={busyAction === "submitted"}
                          onClick={() => handleStatusChange(doc._id, "submitted")}
                        >
                          {busyAction === "submitted" ? "Updating�" : "Back to review"}
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost"
                          disabled={busyAction === "rejected"}
                          onClick={() => handleStatusChange(doc._id, "rejected")}
                        >
                          {busyAction === "rejected" ? "Rejecting�" : "Reject"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {docs.length === 0 && (
                <tr>
                  <td colSpan="7" className="muted">
                    No documents found for your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

