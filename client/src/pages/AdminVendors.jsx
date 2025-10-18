import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import "./AdminVendors.css";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});
const ratingFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value) => currency.format(Number.isFinite(value) ? value : 0);
const formatRating = (value) =>
  ratingFormatter.format(Number.isFinite(value) ? value : 0);
const formatPercent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;

const complianceSnapshot = (vendor) => {
  const status = vendor?.complianceStatus || "pending";
  const missing = Array.isArray(vendor?.compliance?.missing)
    ? vendor.compliance.missing
    : [];
  const overrideActive =
    vendor?.complianceOverride === true ||
    vendor?.compliance?.override === true;
  let label = status.replace(/_/g, " ");
  let badgeClass =
    status === "compliant"
      ? "badge ok"
      : status === "non_compliant"
      ? "badge bad"
      : "badge warn";

  if (overrideActive) {
    label = `${label} • override`;
    badgeClass = "badge warn";
  }

  return {
    status,
    label,
    badgeClass,
    missingCount: missing.length,
    missing,
    overrideActive,
  };
};

export default function AdminVendors() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    city: "",
    earningsSplit: "60",
  });
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [overridePending, setOverridePending] = useState(null);

  const load = async ({ keepPage = false } = {}) => {
    try {
      const response = await api.get("/api/admin/vendors/overview");
      setItems(response.data || []);
      setErr("");
      if (!keepPage) {
        setPage(1);
      }
    } catch (error) {
      setErr(error?.response?.data?.message || "Failed to load vendors");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage((prev) => {
      const maxPage = Math.max(1, Math.ceil((items.length || 0) / pageSize));
      return Math.min(prev, maxPage);
    });
  }, [items.length, pageSize]);

  const metrics = useMemo(() => {
    if (!items.length)
      return {
        total: 0,
        revenue: 0,
        payout: 0,
        completed: 0,
        avgRating: 0,
        compliance: 0,
      };

    const aggregate = items.reduce(
      (acc, vendor) => {
        const stats = vendor?.stats || {};
        const docs = vendor?.docs || {};
        acc.revenue += Number(stats.revenue) || 0;
        acc.payout += Number(stats.payoutOwed) || 0;
        acc.completed += Number(stats.completed) || 0;
        acc.ratingSum += Number(stats.avgRating) || 0;
        acc.ratingCount += Number(stats.avgRating) ? 1 : 0;
        acc.docApproved += Number(docs.approved) || 0;
        acc.docTotal += Number(docs.total) || 0;
        return acc;
      },
      {
        revenue: 0,
        payout: 0,
        completed: 0,
        ratingSum: 0,
        ratingCount: 0,
        docApproved: 0,
        docTotal: 0,
      }
    );

    return {
      total: items.length,
      revenue: aggregate.revenue,
      payout: aggregate.payout,
      completed: aggregate.completed,
      avgRating: aggregate.ratingCount
        ? aggregate.ratingSum / aggregate.ratingCount
        : 0,
      compliance: aggregate.docTotal
        ? aggregate.docApproved / aggregate.docTotal
        : 0,
    };
  }, [items]);

  const pagination = useMemo(() => {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = total === 0 ? 0 : (safePage - 1) * pageSize;
    const endIndex = total === 0 ? 0 : Math.min(startIndex + pageSize, total);
    const visible = total === 0 ? [] : items.slice(startIndex, endIndex);

    return {
      total,
      totalPages,
      start: startIndex,
      end: endIndex,
      pageItems: visible,
      page: safePage,
    };
  }, [items, page, pageSize]);

  const set = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      city: form.city.trim(),
      earningsSplit:
        Number(form.earningsSplit) > 1
          ? Number(form.earningsSplit) / 100
          : Number(form.earningsSplit) || 0.6,
    };
    try {
      await api.post("/api/vendors", payload);
      setForm({ name: "", phone: "", city: "", earningsSplit: "60" });
      load();
    } catch (error) {
      setErr(error?.response?.data?.message || "Failed to create vendor");
    }
  };

  const toggleComplianceOverride = async (vendor, enabled) => {
    if (!vendor?._id) return;
    setOverridePending(vendor._id);
    try {
      await api.patch(`/api/admin/vendors/${vendor._id}`, {
        complianceOverride: enabled,
      });
      await load({ keepPage: true });
    } catch (error) {
      setErr(
        error?.response?.data?.message ||
          "Failed to update compliance override"
      );
    } finally {
      setOverridePending(null);
    }
  };

  const handlePageSizeChange = (event) => {
    setPageSize(Number(event.target.value));
  };

  const handlePageSelect = (event) => {
    setPage(Number(event.target.value));
  };

  const handlePrev = () => setPage((prev) => Math.max(1, prev - 1));
  const handleNext = () =>
    setPage((prev) =>
      Math.min(prev + 1, Math.max(1, Math.ceil((items.length || 0) / pageSize)))
    );

  return (
    <div className="avendors">
      {err && (
        <div className="card alert error">
          <p>{err}</p>
        </div>
      )}

      <section className="avendors-header">
        <div>
          <h1 className="title">Vendors</h1>
          <p className="subtitle">
            Monitor marketplace health, compliance, and performance in real time.
          </p>
        </div>
        <div className="avendors-header__metrics">
          <div>
            <span className="eyebrow">Active vendors</span>
            <strong>{metrics.total}</strong>
          </div>
          <div>
            <span className="eyebrow">On-boarding compliance</span>
            <strong>{formatPercent(metrics.compliance)}</strong>
          </div>
          <div>
            <span className="eyebrow">Avg. rating</span>
            <strong>
              {Number.isFinite(metrics.avgRating)
                ? ratingFormatter.format(metrics.avgRating)
                : "0.00"}
            </strong>
          </div>
        </div>
      </section>

      <form className="card form" onSubmit={submit}>
        <div className="form-header">
          <div>
            <h3 className="section-title">Add vendor</h3>
            <p className="section-copy">
              Spin up a new service partner and invite them to the platform.
            </p>
          </div>
          <button className="btn" type="submit" disabled={!form.name.trim()}>
            Save vendor
          </button>
        </div>
        <div className="form-grid">
          <label>
            <span>Name</span>
            <input value={form.name} onChange={set("name")} required />
          </label>
          <label>
            <span>Phone</span>
            <input value={form.phone} onChange={set("phone")} />
          </label>
          <label>
            <span>City</span>
            <input value={form.city} onChange={set("city")} />
          </label>
          <label>
            <span>Split %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.earningsSplit}
              onChange={set("earningsSplit")}
            />
          </label>
        </div>
      </form>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>City</th>
                <th>Phone</th>
                <th>Docs</th>
                <th>Compliance</th>
                <th>Override</th>
                <th>Completed</th>
                <th>Avg Rating</th>
                <th>Revenue</th>
                <th>Payout Owed</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((vendor) => {
                const docs = vendor?.docs || {};
                const stats = vendor?.stats || {};
                const compliance = complianceSnapshot(vendor);
                return (
                  <tr key={vendor._id}>
                    <td>{vendor.name}</td>
                    <td>{vendor.city || "-"}</td>
                    <td>{vendor.phone || "-"}</td>
                    <td>
                      <span className="badge">
                        {docs.approved || 0}/{docs.total || 0}
                      </span>
                      {(docs.expired || 0) > 0 && (
                        <span className="badge bad">exp {docs.expired}</span>
                      )}
                    </td>
                    <td>
                      <span className={compliance.badgeClass}>{compliance.label}</span>
                      {compliance.missingCount > 0 && (
                        <span className="badge warn">
                          {compliance.missingCount} missing
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={
                          "avendors-override-btn" +
                          (vendor.complianceOverride ? " is-enabled" : "")
                        }
                        onClick={() =>
                          toggleComplianceOverride(vendor, !vendor.complianceOverride)
                        }
                        disabled={overridePending === vendor._id}
                        aria-pressed={vendor.complianceOverride ? "true" : "false"}
                      >
                        {overridePending === vendor._id
                          ? "Saving..."
                          : vendor.complianceOverride
                          ? "Revoke override"
                          : "Allow override"}
                      </button>
                    </td>
                    <td>{(stats.completed || 0).toLocaleString()}</td>
                    <td>{formatRating(stats.avgRating)}</td>
                    <td>{formatCurrency(stats.revenue)}</td>
                    <td>{formatCurrency(stats.payoutOwed)}</td>
                  </tr>
                );
              })}
              {pagination.pageItems.length === 0 && (
                <tr>
                  <td colSpan="10" className="muted">
                    No vendors
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="avendors-mobile-list">
          {pagination.pageItems.map((vendor) => {
            const docs = vendor?.docs || {};
            const stats = vendor?.stats || {};
            const compliance = complianceSnapshot(vendor);
            return (
              <article key={vendor._id} className="avendors-mobile-card">
                <header>
                  <h4>{vendor.name}</h4>
                  <span className="avendors-mobile-chip">
                    {formatRating(stats.avgRating)} ★
                  </span>
                </header>
                <dl>
                  <div>
                    <dt>City</dt>
                    <dd>{vendor.city || "-"}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{vendor.phone || "-"}</dd>
                  </div>
                  <div>
                    <dt>Docs</dt>
                    <dd>
                      {docs.approved || 0}/{docs.total || 0}
                      {(docs.expired || 0) > 0 ? ` - exp ${docs.expired}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Compliance</dt>
                    <dd>
                      <span className={compliance.badgeClass}>{compliance.label}</span>
                      {compliance.missingCount > 0 ? ` - ${compliance.missingCount} missing` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Override</dt>
                    <dd>
                      <button
                        type="button"
                        className={
                          "avendors-override-btn" +
                          (vendor.complianceOverride ? " is-enabled" : "")
                        }
                        onClick={() =>
                          toggleComplianceOverride(vendor, !vendor.complianceOverride)
                        }
                        disabled={overridePending === vendor._id}
                        aria-pressed={vendor.complianceOverride ? "true" : "false"}
                      >
                        {overridePending === vendor._id
                          ? "Saving..."
                          : vendor.complianceOverride
                          ? "Revoke override"
                          : "Allow override"}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Completed jobs</dt>
                    <dd>{(stats.completed || 0).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Revenue</dt>
                    <dd>{formatCurrency(stats.revenue)}</dd>
                  </div>
                  <div>
                    <dt>Payout owed</dt>
                    <dd>{formatCurrency(stats.payoutOwed)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
          {pagination.pageItems.length === 0 && (
            <div className="avendors-mobile-card muted">No vendors</div>
          )}
        </div>

        <div className="avendors-pagination">
          <div className="avendors-pagination__info">
            {pagination.total === 0
              ? "No vendor records"
              : `Showing ${pagination.start + 1}-${pagination.end} of ${pagination.total}`}
          </div>
          <div className="avendors-pagination__controls">
            <label>
              Rows per page
              <select value={pageSize} onChange={handlePageSizeChange}>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="avendors-pagination__nav">
            <button
              type="button"
              className="avendors-pagination__button"
              onClick={handlePrev}
              disabled={pagination.page <= 1 || pagination.total === 0}
            >
              Previous
            </button>
            <select
              className="avendors-pagination__page-select"
              value={pagination.page}
              onChange={handlePageSelect}
              disabled={pagination.total === 0}
            >
              {Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map(
                (option) => (
                  <option key={option} value={option}>
                    Page {option}
                  </option>
                )
              )}
            </select>
            <span className="avendors-pagination__total">of {pagination.totalPages}</span>
            <button
              type="button"
              className="avendors-pagination__button"
              onClick={handleNext}
              disabled={
                pagination.page >= pagination.totalPages || pagination.total === 0
              }
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
