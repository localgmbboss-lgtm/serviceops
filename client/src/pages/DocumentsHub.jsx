import { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useWorkflow } from "../contexts/SettingsContext";
import "./DocumentsHub.css";

const OWNER_OPTIONS = [
  { value: "vendor", label: "Vendor" },
  { value: "driver", label: "Driver" },
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

const STATUS_LABEL_MAP = new Map(
  STATUS_OPTIONS.filter((option) => option.value).map((option) => [
    option.value,
    option.label,
  ])
);

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

const labelForStatus = (status) =>
  STATUS_LABEL_MAP.get(status) || (status ? status : "Unknown");

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString() : "-";

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const display =
    size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1);
  return `${display} ${units[unitIndex]}`;
};

const deriveExpiry = (value) => {
  if (!value) {
    return { tone: "idle", note: "No expiry date", dateLabel: "-" };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { tone: "idle", note: "Invalid date", dateLabel: "-" };
  }
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 0) {
    return {
      tone: "bad",
      note: `Expired ${Math.abs(diffDays)}d ago`,
      dateLabel: date.toLocaleDateString(),
    };
  }
  if (diffDays === 0) {
    return {
      tone: "warn",
      note: "Expires today",
      dateLabel: date.toLocaleDateString(),
    };
  }
  if (diffDays <= 7) {
    return {
      tone: "warn",
      note: `${diffDays}d remaining`,
      dateLabel: date.toLocaleDateString(),
    };
  }
  return {
    tone: "ok",
    note: `${diffDays}d remaining`,
    dateLabel: date.toLocaleDateString(),
  };
};

const summaryTone = (status) => {
  switch (status) {
    case "verified":
      return "ok";
    case "pending":
    case "submitted":
      return "warn";
    case "rejected":
    case "expired":
      return "bad";
    default:
      return "muted";
  }
};

export default function DocumentsHub() {
  const workflow = useWorkflow();
  const allowVendorDocs = workflow.requireVendorDocs !== false;
  const allowDriverDocs = workflow.requireDriverDocs !== false;
  const allowBusinessDocs = workflow.showBusinessDocs !== false;
  const allowDocs = allowVendorDocs || allowDriverDocs || allowBusinessDocs;
  if (!allowDocs) {
    return <Navigate to="/admin" replace />;
  }
  const defaultOwnerType = allowVendorDocs
    ? "vendor"
    : allowDriverDocs
    ? "driver"
    : "company";
  return (
    <DocumentsHubContent
      allowVendorDocs={allowVendorDocs}
      allowDriverDocs={allowDriverDocs}
      allowBusinessDocs={allowBusinessDocs}
      defaultOwnerType={defaultOwnerType}
    />
  );
}

function DocumentsHubContent({
  allowVendorDocs,
  allowDriverDocs,
  allowBusinessDocs,
  defaultOwnerType,
}) {
  const [docs, setDocs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [filters, setFilters] = useState({
    ownerType: defaultOwnerType,
    vendorId: "",
    status: "",
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [vendorError, setVendorError] = useState("");
  const [busy, setBusy] = useState({});
  const [lastRefresh, setLastRefresh] = useState("");

  const ownerOptions = useMemo(
    () =>
      OWNER_OPTIONS.filter((option) => {
        if (option.value === "vendor") return allowVendorDocs;
        if (option.value === "driver") return allowDriverDocs;
        if (option.value === "company") return allowBusinessDocs;
        return false;
      }),
    [allowBusinessDocs, allowDriverDocs, allowVendorDocs]
  );

  useEffect(() => {
    if (!ownerOptions.length) return;
    setFilters((prev) => {
      if (ownerOptions.some((option) => option.value === prev.ownerType)) {
        return prev;
      }
      return {
        ...prev,
        ownerType: ownerOptions[0].value,
        vendorId: "",
      };
    });
  }, [ownerOptions]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await api.get("/api/vendors");
        if (ignore) return;
        setVendors(response.data || []);
        setVendorError("");
      } catch (err) {
        if (!ignore) setVendorError("Failed to load vendor directory");
      }
    })();
    return () => {
      ignore = true;
    };
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
      setLastRefresh(new Date().toISOString());
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

  const decoratedDocs = useMemo(
    () =>
      docs.map((doc) => {
        let ownerName = "Company";
        if (doc.ownerType === "vendor") {
          ownerName =
            ownerLookup.get(String(doc.vendorId)) ||
            doc.vendorName ||
            "Vendor";
        } else if (doc.ownerType === "driver") {
          ownerName = doc.driverName || "Driver";
        } else if (doc.ownerType === "company") {
          ownerName = doc.companyName || "Company";
        } else if (doc.ownerType) {
          ownerName = doc.ownerType;
        }
        return {
          ...doc,
          ownerName,
          statusUpdatedAt:
            doc.statusUpdatedAt ||
            doc.reviewedAt ||
            doc.updatedAt ||
            doc.uploadedAt,
        };
      }),
    [docs, ownerLookup]
  );

  const filteredDocs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return decoratedDocs;
    return decoratedDocs.filter((doc) => {
      const fields = [
        doc.title,
        doc.kind,
        doc.requirementKey,
        doc.status,
        doc.ownerName,
        doc.notes,
        doc.mimeType,
      ];
      return fields.some(
        (field) =>
          field && String(field).toLowerCase().includes(term)
      );
    });
  }, [decoratedDocs, search]);

  const summary = useMemo(() => {
    const counts = new Map();
    const now = Date.now();
    const soonThreshold = 7 * 24 * 60 * 60 * 1000;
    let expiringSoon = 0;
    let pastDue = 0;

    decoratedDocs.forEach((doc) => {
      counts.set(doc.status, (counts.get(doc.status) || 0) + 1);
      if (doc.expiresAt) {
        const stamp = new Date(doc.expiresAt).getTime();
        if (Number.isNaN(stamp)) return;
        if (stamp < now) {
          pastDue += 1;
        } else if (stamp - now <= soonThreshold) {
          expiringSoon += 1;
        }
      }
    });

    return {
      total: decoratedDocs.length,
      statusCounts: STATUS_OPTIONS.filter((option) => option.value).map(
        (option) => ({
          key: option.value,
          label: option.label,
          count: counts.get(option.value) || 0,
        })
      ),
      expiringSoon,
      pastDue,
    };
  }, [decoratedDocs]);

  const expiringSoonList = useMemo(() => {
    const now = Date.now();
    const soonThreshold = 7 * 24 * 60 * 60 * 1000;
    return filteredDocs
      .filter((doc) => {
        if (!doc.expiresAt) return false;
        const stamp = new Date(doc.expiresAt).getTime();
        if (Number.isNaN(stamp)) return false;
        return stamp >= now && stamp - now <= soonThreshold;
      })
      .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
      .slice(0, 5);
  }, [filteredDocs]);

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

  const resetFilters = () => {
    setFilters({ ownerType: "vendor", vendorId: "", status: "" });
    setSearch("");
  };

  const handleRefresh = () => {
    if (!loading) {
      loadDocuments(filters);
    }
  };

  const hasSearch = search.trim().length > 0;
  const lastRefreshLabel = lastRefresh
    ? formatDateTime(lastRefresh)
    : "Not loaded yet";

  return (
    <div className="docs">
      <header className="docs__header card">
        <div className="docs__intro">
          <div className="docs__title">
            <h1>Documents hub</h1>
            <p className="muted">
              Monitor compliance statuses, expirations, and review your files in one place.
            </p>
          </div>
          <div className="docs__refresh">
            <div>
              <span className="docs__refresh-label">Last refreshed</span>
              <span className="docs__refresh-value">{lastRefreshLabel}</span>
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="docs__summary">
          <div className="docs__stat">
            <span className="docs__stat-label">Total</span>
            <span className="docs__stat-value">{summary.total}</span>
          </div>
          <div className="docs__stat docs__stat--warn">
            <span className="docs__stat-label">Expiring soon</span>
            <span className="docs__stat-value">{summary.expiringSoon}</span>
          </div>
          <div className="docs__stat docs__stat--bad">
            <span className="docs__stat-label">Past due</span>
            <span className="docs__stat-value">{summary.pastDue}</span>
          </div>
          {summary.statusCounts.map((item) => (
            <div
              key={item.key}
              className={`docs__stat docs__stat--${summaryTone(item.key)}`}
            >
              <span className="docs__stat-label">{item.label}</span>
              <span className="docs__stat-value">{item.count}</span>
            </div>
          ))}
        </div>

        <div className="docs__filters">
          <label>
            <span>Owner type</span>
            <select
              value={filters.ownerType}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  ownerType: event.target.value,
                  vendorId: "",
                }))
              }
            >
              {ownerOptions.map((option) => (
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
            </label>
          )}

          <label>
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  status: event.target.value,
                }))
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="docs__search">
            <span>Search</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, requirement, owner, notes"
            />
          </label>

          <button
            type="button"
            className="btn ghost docs__reset"
            onClick={resetFilters}
          >
            Reset filters
          </button>
        </div>

        {(error || vendorError) && (
          <div className="docs__error">
            {error ? <p>{error}</p> : null}
            {vendorError ? <p>{vendorError}</p> : null}
          </div>
        )}
      </header>

      <section className="card docs__table-card">
        <div className="docs__table-head">
          <span>
            Showing {filteredDocs.length} of {decoratedDocs.length} document
            {decoratedDocs.length === 1 ? "" : "s"}
            {hasSearch ? " (search filtered)" : ""}
          </span>
          {summary.expiringSoon > 0 && (
            <span className="docs__highlight">
              {summary.expiringSoon} expiring within 7 days
            </span>
          )}
        </div>

        {loading ? (
          <p className="muted">Loading documents...</p>
        ) : filteredDocs.length === 0 ? (
          <div className="docs__empty">
            <p>No documents matched your filters.</p>
          </div>
        ) : (
          <table className="docs__table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Expiry</th>
                <th>File</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const busyAction = busy[doc._id];
                const expiryInfo = deriveExpiry(doc.expiresAt);
                const fileSize = formatBytes(doc.sizeBytes);
                const vendorId =
                  doc.ownerType === "vendor" && doc.vendorId
                    ? String(doc.vendorId)
                    : "";
                const note = (doc.notes || "").trim();

                return (
                  <tr key={doc._id}>
                    <td>
                      <div className="docs__title-block">
                        <span className="docs__title-main">
                          {doc.title || "Document"}
                        </span>
                        <span className="docs__subtitle">
                          {doc.kind || "-"}
                        </span>
                      </div>
                      <div className="docs__meta">
                        {doc.requirementKey ? (
                          <div>
                            <span className="label">Requirement</span>
                            <code>{doc.requirementKey}</code>
                          </div>
                        ) : null}
                        <div>
                          <span className="label">Uploaded</span>
                          <span>{formatDateTime(doc.uploadedAt)}</span>
                        </div>
                      </div>
                      {note && <p className="docs__note">{note}</p>}
                    </td>
                    <td>
                      <div className="docs__owner">
                        <strong>{doc.ownerName}</strong>
                        <span className="muted small">
                          {doc.ownerType === "vendor"
                            ? "Vendor"
                            : doc.ownerType === "company"
                            ? "Company"
                            : doc.ownerType === "driver"
                            ? "Driver"
                            : "Owner"}
                        </span>
                        {vendorId ? (
                          <span className="muted small">
                            ID {vendorId.slice(-6).toUpperCase()}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="docs__status">
                        <span className={statusClass(doc.status)}>
                          {labelForStatus(doc.status)}
                        </span>
                        <div className="docs__status-meta">
                          {doc.reviewedBy ? (
                            <span>By {doc.reviewedBy}</span>
                          ) : null}
                          {doc.statusUpdatedAt ? (
                            <span>
                              Updated {formatDateTime(doc.statusUpdatedAt)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div
                        className={`docs__expiry docs__expiry--${expiryInfo.tone}`}
                      >
                        <span className="docs__expiry-date">
                          {expiryInfo.dateLabel}
                        </span>
                        <span className="docs__expiry-note">
                          {expiryInfo.note}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="docs__file">
                        <span>{fileSize || "Unknown size"}</span>
                        <span>{doc.mimeType || "Unknown type"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="docs__actions">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn sm ghost"
                        >
                          Open
                        </a>
                        <button
                          type="button"
                          className="btn sm primary"
                          disabled={busyAction === "verified"}
                          onClick={() => handleStatusChange(doc._id, "verified")}
                        >
                          {busyAction === "verified"
                            ? "Verifying..."
                            : "Mark verified"}
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          disabled={busyAction === "submitted"}
                          onClick={() => handleStatusChange(doc._id, "submitted")}
                        >
                          {busyAction === "submitted"
                            ? "Updating..."
                            : "Back to review"}
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost"
                          disabled={busyAction === "rejected"}
                          onClick={() => handleStatusChange(doc._id, "rejected")}
                        >
                          {busyAction === "rejected"
                            ? "Rejecting..."
                            : "Reject"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {expiringSoonList.length > 0 && (
          <div className="docs__expiring">
            <div className="docs__expiring-head">
              <h3>Expiring within 7 days</h3>
              <span className="muted small">
                {expiringSoonList.length} matching document
                {expiringSoonList.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="docs__expiring-list">
              {expiringSoonList.map((doc) => {
                const expiryInfo = deriveExpiry(doc.expiresAt);
                return (
                  <li key={`expiring-${doc._id}`}>
                    <div>
                      <strong>{doc.title || "Document"}</strong>
                      <span className="muted small">{doc.ownerName}</span>
                    </div>
                    <div
                      className={`docs__expiry docs__expiry--${expiryInfo.tone}`}
                    >
                      <span className="docs__expiry-date">
                        {expiryInfo.dateLabel}
                      </span>
                      <span className="docs__expiry-note">
                        {expiryInfo.note}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
