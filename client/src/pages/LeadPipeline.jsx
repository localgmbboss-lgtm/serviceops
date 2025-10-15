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

  return (
    <div className="lp">
      <header className="lp-header">
        <div>
          <h1>Lead Pipeline</h1>
          <p>
            Capture inbound calls and web forms, nurture conversations, and convert wins directly
            into jobs.
          </p>
        </div>
        <div className="lp-filters">
          <label>
            <span>Stage</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">All</option>
              {STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="lp-create">
        <form onSubmit={handleCreate}>
          <div className="lp-create__grid">
            <div>
              <label>
                <span>Name *</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
            </div>
            <div>
              <label>
                <span>Company</span>
                <input
                  value={form.company}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, company: event.target.value }))
                  }
                />
              </label>
            </div>
            <div>
              <label>
                <span>Phone</span>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </label>
            </div>
            <div>
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
            </div>
            <div>
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
          </div>
          <label className="lp-create__notes">
            <span>Notes</span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
          <div className="lp-create__actions">
            <button type="submit" className="btn primary" disabled={creating}>
              {creating ? "Saving…" : "Add lead"}
            </button>
          </div>
        </form>
      </section>

      {error ? <div className="lp-error">{error}</div> : null}

      <section className="lp-board">
        {STAGE_ORDER.map((stage) => {
          const items = grouped.get(stage) || [];
          return (
            <div className="lp-column" key={stage}>
              <header className="lp-column__header">
                <h2>{STAGE_LABELS[stage]}</h2>
                <span className="lp-count">{items.length}</span>
              </header>
              <div className="lp-column__body">
                {loading ? (
                  <p className="muted">Loading…</p>
                ) : items.length === 0 ? (
                  <p className="muted">No leads in this stage.</p>
                ) : (
                  items.map((lead) => (
                    <article className="lp-card" key={lead._id}>
                      <header>
                        <div>
                          <strong>{lead.name}</strong>
                          <span className="muted">{lead.company || "—"}</span>
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
                        {lead.source ? <li>Source: {lead.source}</li> : null}
                        {lead.lastContactedAt ? (
                          <li>
                            Last touch: {new Date(lead.lastContactedAt).toLocaleDateString()}
                          </li>
                        ) : null}
                      </ul>
                      {lead.notes ? <p className="lp-card__notes">{lead.notes}</p> : null}
                      <footer>
                        <label>
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
                        <label>
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
