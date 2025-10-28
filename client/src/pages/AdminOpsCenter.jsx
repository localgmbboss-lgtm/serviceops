import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import "./AdminOpsCenter.css";

const STATUS_LABEL = {
  Unassigned: "Matching",
  Assigned: "Assigned",
  OnTheWay: "En route",
  Arrived: "On site",
};

const URGENCY_LABEL = {
  emergency: "Emergency",
  urgent: "Urgent",
  standard: "Standard",
};

const QUEUE_PAGE_SIZE = 8;
const COMPLIANCE_PAGE_SIZE = 6;
const SCORECARD_PAGE_SIZE = 6;

function Pagination({ total, page, pageSize, onChange, label }) {
  if (total <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, start + pageSize - 1);
  const goTo = (next) => {
    const clamped = Math.min(totalPages, Math.max(1, next));
    if (clamped !== page) onChange(clamped);
  };
  return (
    <div className="ops-pagination" role="navigation" aria-label={label}>
      <span className="ops-pagination__meta">
        Showing {start}-{end} of {total}
      </span>
      <div className="ops-pagination__controls">
        <button
          type="button"
          className="ops-pagination__btn"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          Prev
        </button>
        <span className="ops-pagination__summary" aria-hidden="true">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="ops-pagination__btn"
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function useMissionControl() {
  const [state, setState] = useState({
    queue: [],
    escalations: [],
    vendorScorecards: [],
    complianceTasks: [],
    generatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/ops/mission-control");
      setState(data || {});
      setError("");
    } catch (err) {
      setError(
        err?.response?.data?.message || "Failed to load mission control"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, loading, error, reload: load };
}

function QueueRow({ item }) {
  const atRisk = item.atRisk || item.severe;
  const minutesRemaining = item.minutesRemaining;
  const badge =
    minutesRemaining > 0
      ? `-${minutesRemaining}m`
      : minutesRemaining === 0
      ? "Due"
      : `+${Math.abs(minutesRemaining)}m`;

  return (
    <tr
      className={
        atRisk ? "ops-queue__row ops-queue__row--risk" : "ops-queue__row"
      }
    >
      <td data-col="Job">
        <span className="ops-chip">
          {String(item.jobId).slice(-6).toUpperCase()}
        </span>
        <div className="ops-queue__meta">
          <strong>{item.serviceType}</strong>
          <span>{item.pickupAddress || "No pickup listed"}</span>
        </div>
      </td>
      <td data-col="Priority">
        <span className={`ops-pill ops-pill--${item.priority}`}>
          {URGENCY_LABEL[item.urgency] || "Standard"}
        </span>
      </td>
      <td data-col="Status">
        <span className="ops-queue__status">
          {STATUS_LABEL[item.status] || item.status}
        </span>
        <span className="ops-queue__timer">
          Open <strong>{item.openMinutes}m</strong>
        </span>
      </td>
      <td data-col="SLA">
        <div className="ops-queue__sla">
          <span className="ops-badge">{badge}</span>
          <span className="ops-queue__sla-caption">SLA {item.slaMinutes}m</span>
        </div>
      </td>
      <td data-col="Vendor">
        {item.vendorName ? (
          <div className="ops-queue__vendor">
            <strong>{item.vendorName}</strong>
            <span>{item.sinceAssignedMinutes || 0}m since assign</span>
          </div>
        ) : (
          <span className="muted">Unassigned</span>
        )}
      </td>
    </tr>
  );
}

function VendorScorecard({ card }) {
  return (
    <article className="ops-scorecard">
      <header>
        <div>
          <h3>{card.name}</h3>
          <span className="muted">{card.city || ""}</span>
        </div>
        <span
          className={`ops-badge ops-badge--${
            card.stats.slaHitRate >= 80 ? "good" : "warn"
          }`}
        >
          {card.stats.slaHitRate != null
            ? `${card.stats.slaHitRate}% SLA`
            : "No data"}
        </span>
      </header>
      <div className="ops-scorecard__grid">
        <div>
          <span className="ops-label">Completed (45d)</span>
          <strong>{card.stats.completed}</strong>
        </div>
        <div>
          <span className="ops-label">Avg arrival</span>
          <strong>
            {card.stats.avgArrivalMinutes != null
              ? `${card.stats.avgArrivalMinutes}m`
              : ""}
          </strong>
        </div>
        <div>
          <span className="ops-label">Avg rating</span>
          <strong>
            {card.stats.avgRating != null ? card.stats.avgRating : ""}
          </strong>
        </div>
        <div>
          <span className="ops-label">Gross</span>
          <strong>${Math.round(card.stats.gross || 0).toLocaleString()}</strong>
        </div>
      </div>
      {Array.isArray(card.compliance?.issues) &&
      card.compliance.issues.length > 0 ? (
        <div className="ops-scorecard__issues">
          <span className="ops-label">Compliance</span>
          <ul>
            {card.compliance.issues.map((issue) => (
              <li key={issue.key || issue.label}>{issue.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export default function AdminOpsCenter() {
  const { state, loading, error, reload } = useMissionControl();

  const [queuePage, setQueuePage] = useState(1);
  const [compliancePage, setCompliancePage] = useState(1);
  const [scorecardPage, setScorecardPage] = useState(1);

  const queueItems = useMemo(() => state.queue ?? [], [state.queue]);
  const complianceItems = useMemo(
    () => state.complianceTasks ?? [],
    [state.complianceTasks]
  );
  const scorecardItems = useMemo(
    () => state.vendorScorecards ?? [],
    [state.vendorScorecards]
  );

  const queueTotal = queueItems.length;
  const complianceTotal = complianceItems.length;
  const scorecardTotal = scorecardItems.length;

  useEffect(() => setQueuePage(1), [queueTotal]);
  useEffect(() => setCompliancePage(1), [complianceTotal]);
  useEffect(() => setScorecardPage(1), [scorecardTotal]);

  const pagedQueueItems = useMemo(
    () =>
      queueItems.slice(
        (queuePage - 1) * QUEUE_PAGE_SIZE,
        queuePage * QUEUE_PAGE_SIZE
      ),
    [queueItems, queuePage]
  );

  const pagedCompliance = useMemo(
    () =>
      complianceItems.slice(
        (compliancePage - 1) * COMPLIANCE_PAGE_SIZE,
        compliancePage * COMPLIANCE_PAGE_SIZE
      ),
    [complianceItems, compliancePage]
  );

  const pagedScorecards = useMemo(
    () =>
      scorecardItems.slice(
        (scorecardPage - 1) * SCORECARD_PAGE_SIZE,
        scorecardPage * SCORECARD_PAGE_SIZE
      ),
    [scorecardItems, scorecardPage]
  );

  const atRiskCount = useMemo(
    () => queueItems.filter((item) => item.atRisk).length,
    [queueItems]
  );

  const queueAtRiskPercent = queueTotal
    ? Math.round((atRiskCount / queueTotal) * 100)
    : 0;
  const escalationTotal = Array.isArray(state.escalations)
    ? state.escalations.length
    : 0;
  const lastUpdatedStamp = state.generatedAt
    ? new Date(state.generatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--";

  const queueStatClass = `ops-stat ${
    atRiskCount > 0 ? "ops-stat--risk" : "ops-stat--info"
  }`;
  const escalationStatClass = `ops-stat ${
    escalationTotal > 0 ? "ops-stat--warn" : "ops-stat--calm"
  }`;
  const complianceStatClass = `ops-stat ${
    complianceTotal > 0 ? "ops-stat--warn" : "ops-stat--calm"
  }`;

  return (
    <div className="ops">
      <header className="ops-header">
        <div>
          <h1>Mission Control</h1>
          <p>
            Real-time health of your field ops: dispatch queue, escalations, and
            compliance exceptions.
          </p>
        </div>
        <div className="ops-header__meta">
          <button
            className="btn ghost ops-header__refresh"
            type="button"
            onClick={reload}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <span className="ops-header__stamp">
            <span
              className={`ops-dot ${loading ? "ops-dot--pulse" : ""}`}
              aria-hidden="true"
            />
            {loading ? "Syncing mission data..." : `Updated ${lastUpdatedStamp}`}
          </span>
        </div>
      </header>

      <section className="ops-stats" aria-label="Operations summary">
        <article className={queueStatClass}>
          <span className="ops-stat__label">Active queue</span>
          <strong>{queueTotal}</strong>
          <span className="ops-stat__note">
            {queueTotal === 0
              ? "All clear"
              : `${atRiskCount} at risk (${queueAtRiskPercent}%)`}
          </span>
        </article>
        <article className={escalationStatClass}>
          <span className="ops-stat__label">Escalations</span>
          <strong>{escalationTotal}</strong>
          <span className="ops-stat__note">
            {escalationTotal > 0 ? "Requires follow-up" : "None open"}
          </span>
        </article>
        <article className={complianceStatClass}>
          <span className="ops-stat__label">Compliance tasks</span>
          <strong>{complianceTotal}</strong>
          <span className="ops-stat__note">
            {complianceTotal > 0 ? "Docs to review" : "Fully compliant"}
          </span>
        </article>
      </section>

      {error ? <div className="ops-error">{error}</div> : null}
      <section className="ops-grid">
        <article className="ops-card ops-card--wide">
          <header>
            <div>
              <h2>Dispatch Queue</h2>
              <p>
                {queueTotal} active jobs | {atRiskCount} at risk
              </p>
            </div>
            <span className="ops-badge">{loading ? "Syncing..." : "Live"}</span>
          </header>
          <div className="ops-table-wrap">
            <table className="ops-queue" aria-label="Dispatch queue">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>SLA</th>
                  <th>Vendor</th>
                </tr>
              </thead>
              <tbody>
                {queueTotal === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      All clear - no active jobs in queue.
                    </td>
                  </tr>
                ) : (
                  pagedQueueItems.map((item) => (
                    <QueueRow key={item.jobId} item={item} />
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            total={queueTotal}
            page={queuePage}
            pageSize={QUEUE_PAGE_SIZE}
            onChange={setQueuePage}
            label="Dispatch queue pages"
          />
        </article>

        <article className="ops-card">
          <header>
            <div>
              <h2>Compliance Tasks</h2>
              <p>Expiring docs and missing requirements that block dispatch.</p>
            </div>
          </header>
          {complianceTotal === 0 ? (
            <p className="muted">No compliance follow-ups pending.</p>
          ) : (
            <>
              <ul className="ops-compliance" aria-label="Compliance tasks">
                {pagedCompliance.map((task, index) => (
                  <li
                    key={`${task.type}-${task.vendorId || "vendor"}-${index}`}
                  >
                    <div>
                      <strong>{task.vendorName || "Vendor"}</strong>
                      <span className="muted">
                        {task.type === "expiry"
                          ? `Expiring ${new Date(
                              task.expiresAt
                            ).toLocaleDateString()}`
                          : "Missing documentation"}
                      </span>
                    </div>
                    <span>{task.title || task.label || "Document"}</span>
                  </li>
                ))}
              </ul>
              <Pagination
                total={complianceTotal}
                page={compliancePage}
                pageSize={COMPLIANCE_PAGE_SIZE}
                onChange={setCompliancePage}
                label="Compliance tasks pages"
              />
            </>
          )}
        </article>
      </section>

      <section className="ops-card ops-card--scorecards">
        <header>
          <div>
            <h2>Vendor Scorecards (45 days)</h2>
            <p>
              Arrival performance, SLA compliance, and customer feedback at a
              glance.
            </p>
          </div>
        </header>
        {scorecardTotal === 0 ? (
          <p className="muted">
            We need more job history to build meaningful scorecards.
          </p>
        ) : (
          <>
            <div className="ops-scorecards">
              {pagedScorecards.map((card) => (
                <VendorScorecard key={card.vendorId || card.name} card={card} />
              ))}
            </div>
            <Pagination
              total={scorecardTotal}
              page={scorecardPage}
              pageSize={SCORECARD_PAGE_SIZE}
              onChange={setScorecardPage}
              label="Vendor scorecard pages"
            />
          </>
        )}
      </section>
    </div>
  );
}


