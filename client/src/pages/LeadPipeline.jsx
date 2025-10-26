import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useNotifications } from "../contexts/NotificationsContext";
import "./LeadPipeline.css";

const STAGE_LABELS = {
  inbox: "Inbound",
  nurturing: "Nurturing",
  negotiation: "Negotiation",
  won: "Converted",
  lost: "Lost",
};

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

const STAGE_ORDER = ["inbox", "nurturing", "negotiation", "won", "lost"];

export default function LeadPipeline() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [showComposer, setShowComposer] = useState(true);
  const [form, setForm] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    source: "",
    notes: "",
  });
  const { publish } = useNotifications();

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const params = filter === "all" ? {} : { stage: filter };
      const { data } = await api.get("/api/crm/leads", { params });
      setLeads(data?.results || []);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to load leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const grouped = useMemo(() => {
    const buckets = new Map();
    STAGE_ORDER.forEach((stage) => buckets.set(stage, []));
    for (const lead of leads) {
      const stage = STAGE_ORDER.includes(lead.pipelineStage)
        ? lead.pipelineStage
        : "inbox";
      buckets.get(stage).push(lead);
    }
    return buckets;
  }, [leads]);

  const metrics = useMemo(() => {
    const total = leads.length;
    const won = leads.filter((lead) => lead.pipelineStage === "won").length;
    const lost = leads.filter((lead) => lead.pipelineStage === "lost").length;
    const active = Math.max(0, total - won - lost);
    const conversion = total ? Math.round((won / total) * 100) : 0;
    const newestTimestamp = leads.reduce((latest, lead) => {
      const stamp = lead.updatedAt || lead.createdAt;
      if (!stamp) return latest;
      const time = new Date(stamp).getTime();
      return time > latest ? time : latest;
    }, 0);
    return {
      total,
      active,
      conversion,
      newest: newestTimestamp ? new Date(newestTimestamp) : null,
    };
  }, [leads]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    try {
      setCreating(true);
      await api.post("/api/crm/leads", form);
      setForm({
        name: "",
        company: "",
        phone: "",
        email: "",
        source: "",
        notes: "",
      });
      publish({
        title: "Lead created",
        body: "Added to the inbound pipeline.",
        severity: "success",
      });
      fetchLeads();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create lead");
    } finally {
      setCreating(false);
    }
  };

  const updateLead = async (leadId, payload, message) => {
    try {
      await api.patch(`/api/crm/leads/${leadId}`, payload);
      if (message) {
        publish({ title: "Lead updated", body: message, severity: "info" });
      }
      fetchLeads();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update lead");
    }
  };

  const convertLead = async (leadId) => {
    try {
      await api.post(`/api/crm/leads/${leadId}/convert`);
      publish({
        title: "Lead converted",
        body: "Marked as won. Create a job to dispatch the work.",
        severity: "success",
      });
      fetchLeads();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to convert lead");
    }
  };

  const lastUpdatedDate = metrics.newest
    ? metrics.newest.toLocaleDateString()
    : "Awaiting activity";
  const lastUpdatedTime = metrics.newest
    ? metrics.newest.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="lp">
      <header className="lp-hero">
        <div className="lp-hero__intro">
          <div>
            <span className="lp-eyebrow">Sales ops</span>
            <h1>Lead Pipeline</h1>
            <p>
              Capture inbound calls and web forms, nurture conversations, and convert wins directly
              into jobs.
            </p>
          </div>
          <div className="lp-hero__actions">
            <button
              type="button"
              className="btn primary lp-hero__cta"
              onClick={() => setShowComposer((prev) => !prev)}
            >
              {showComposer ? "Hide form" : "New lead"}
            </button>
          </div>
        </div>
        <div className="lp-hero__controls">
          <label className="lp-stage-filter">
            <span>Stage filter</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">All stages</option>
              {STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="lp-hero__metrics">
          <div className="lp-metric">
            <span className="lp-metric__label">Total leads</span>
            <strong className="lp-metric__value">{metrics.total}</strong>
            <span className="lp-metric__hint">All time</span>
          </div>
          <div className="lp-metric">
            <span className="lp-metric__label">Active pipeline</span>
            <strong className="lp-metric__value">{metrics.active}</strong>
            <span className="lp-metric__hint">Currently working</span>
          </div>
          <div className="lp-metric">
            <span className="lp-metric__label">Conversion rate</span>
            <strong className="lp-metric__value">{metrics.conversion}%</strong>
            <span className="lp-metric__hint">Won vs. total leads</span>
          </div>
          <div className="lp-metric">
            <span className="lp-metric__label">Last update</span>
            <strong className="lp-metric__value">{lastUpdatedDate}</strong>
            <span className="lp-metric__hint">{lastUpdatedTime || "No recent touches"}</span>
          </div>
        </div>
      </header>

      {error ? <div className="lp-banner lp-banner--error">{error}</div> : null}

      {showComposer ? (
        <section className="lp-composer-card">
          <form onSubmit={handleCreate}>
            <div className="lp-create__grid">
              <label>
                <span>Name *</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Company</span>
                <input
                  value={form.company}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, company: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Phone</span>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Source</span>
                <input
                  value={form.source}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, source: event.target.value }))
                  }
                />
              </label>
            </div>
            <label className="lp-create__notes">
              <span>Notes</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Context to help the next follow-up (optional)"
              />
            </label>
            <div className="lp-create__actions">
              <button type="submit" className="btn primary lp-create__submit" disabled={creating}>
                {creating ? "Saving…" : "Add lead"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="lp-board">
        {STAGE_ORDER.map((stage) => {
          const items = grouped.get(stage) || [];
          return (
            <div className="lp-stage" key={stage}>
              <header className="lp-stage__header">
                <div>
                  <span className="lp-stage__eyebrow">Stage</span>
                  <h2>{STAGE_LABELS[stage]}</h2>
                </div>
                <span className="lp-stage__count">{items.length}</span>
              </header>
              <div className="lp-stage__body">
                {loading ? (
                  <p className="lp-empty">Loading pipeline…</p>
                ) : items.length === 0 ? (
                  <p className="lp-empty">No leads in this stage.</p>
                ) : (
                  items.map((lead) => (
                    <article className="lp-card" key={lead._id}>
                      <header className="lp-card__header">
                        <div className="lp-card__title">
                          <strong>{lead.name}</strong>
                          <span>{lead.company || "—"}</span>
                        </div>
                        <button
                          type="button"
                          className="lp-card__convert"
                          onClick={() => convertLead(lead._id)}
                          disabled={lead.status === "converted"}
                        >
                          {lead.status === "converted" ? "Won" : "Convert"}
                        </button>
                      </header>
                      <ul className="lp-card__meta">
                        {lead.phone ? <li>{lead.phone}</li> : null}
                        {lead.email ? <li>{lead.email}</li> : null}
                        {lead.source ? <li>Source · {lead.source}</li> : null}
                        {lead.lastContactedAt ? (
                          <li>
                            Last touch · {new Date(lead.lastContactedAt).toLocaleDateString()}
                          </li>
                        ) : null}
                      </ul>
                      {lead.notes ? <p className="lp-card__notes">{lead.notes}</p> : null}
                      <footer className="lp-card__footer">
                        <label className="lp-card__field">
                          <span>Status</span>
                          <select
                            value={lead.status}
                            onChange={(event) =>
                              updateLead(
                                lead._id,
                                { status: event.target.value },
                                "Status updated"
                              )
                            }
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="lp-card__field">
                          <span>Next follow-up</span>
                          <input
                            type="datetime-local"
                            value={
                              lead.nextFollowUp?.at
                                ? new Date(lead.nextFollowUp.at).toISOString().slice(0, 16)
                                : ""
                            }
                            onChange={(event) =>
                              updateLead(
                                lead._id,
                                {
                                  nextFollowUp: event.target.value
                                    ? {
                                        at: event.target.value,
                                        channel: lead.nextFollowUp?.channel || "call",
                                        note: lead.nextFollowUp?.note || "",
                                      }
                                    : null,
                                },
                                "Follow-up updated"
                              )
                            }
                          />
                        </label>
                      </footer>
                    </article>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

