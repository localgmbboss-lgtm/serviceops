import { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./AdminSettings.css";

const MODE_LABELS = {
  solo: "Solo",
  team: "Small Team",
  full: "Full Ops",
};

const MODE_DESCRIPTIONS = {
  solo: "Streamlined controls for a single dispatcher handling requests.",
  team: "Collaborative tools for a small dispatch crew with shared duties.",
  full: "Advanced workflows for larger operations with specialized roles.",
};

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/api/settings")
      .then((response) => setS(response.data))
      .catch((error) => {
        setErr(error?.response?.data?.message || "Failed to load settings");
      });
  }, []);

  const save = async () => {
    if (!s) return;
    try {
      setBusy(true);
      const body = {
        mode: s.mode,
        workflow: s.workflow,
        defaults: s.defaults,
        intervals: s.intervals,
        reviews: s.reviews,
        commission: s.commission,
        compliance: s.compliance,
      };
      const { data } = await api.put("/api/settings", body);
      setS(data);
      setErr("");
    } catch (error) {
      setErr(error?.response?.data?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <p>Loading...</p>;

  const setK = (path, val) => {
    setS((prev) => {
      const next = structuredClone(prev);
      const parts = path.split(".");
      let t = next;
      while (parts.length > 1) {
        t = t[parts.shift()];
      }
      t[parts[0]] = val;
      return next;
    });
  };

  const mutateVendorCompliance = (mutator) => {
    setS((prev) => {
      const next = structuredClone(prev);
      if (!next.compliance) next.compliance = {};
      if (!next.compliance.vendor) {
        next.compliance.vendor = {
          enforce: "submission",
          autoSuspendOnExpiry: true,
          documents: [],
        };
      }
      if (!Array.isArray(next.compliance.vendor.documents)) {
        next.compliance.vendor.documents = [];
      }
      mutator(next.compliance.vendor);
      return next;
    });
  };

  const setVendorEnforce = (value) =>
    mutateVendorCompliance((vendor) => {
      vendor.enforce = value;
    });

  const setVendorAutoSuspend = (value) =>
    mutateVendorCompliance((vendor) => {
      vendor.autoSuspendOnExpiry = value;
    });

  const addVendorRequirement = () =>
    mutateVendorCompliance((vendor) => {
      vendor.documents.push({
        key: "new_requirement",
        label: "New Requirement",
        description: "",
        kind: "general",
        required: true,
        accepts: ["pdf", "jpg"],
        expires: false,
        validityDays: null,
      });
    });

  const updateVendorRequirement = (index, field, value) =>
    mutateVendorCompliance((vendor) => {
      if (!vendor.documents[index]) return;
      vendor.documents[index][field] = value;
    });

  const updateVendorRequirementAccepts = (index, value) => {
    const accepts = value
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    updateVendorRequirement(index, "accepts", accepts.length ? accepts : ["pdf"]);
  };

  const removeVendorRequirement = (index) =>
    mutateVendorCompliance((vendor) => {
      vendor.documents.splice(index, 1);
    });

  const splitPct = Math.round((s.defaults?.defaultEarningsSplit ?? 0.6) * 100);
  const vendorCompliance = s.compliance?.vendor || {};
  const vendorDocs = Array.isArray(vendorCompliance.documents)
    ? vendorCompliance.documents
    : [];
  const presetKey = s.mode?.preset || "solo";
  const presetLabel = MODE_LABELS[presetKey] || MODE_LABELS.solo;
  const presetDescription =
    MODE_DESCRIPTIONS[presetKey] || MODE_DESCRIPTIONS.solo;

  return (
    <div className="aset">
      <header className="card aset-header">
        <div className="aset-header-copy">
          <span className="aset-tag">Control center</span>
          <h1>Operations settings</h1>
          <p className="aset-sub">
            Tune your workflow, defaults, and review automation for how your
            team runs day-to-day.
          </p>
        </div>
        <div className="aset-header-actions">
          <div className="aset-mode-preview">
            <span className="aset-mode-pill">{presetLabel}</span>
            <p className="aset-mode-description">{presetDescription}</p>
          </div>
          <button
            className="btn primary aset-save-desktop"
            onClick={save}
            disabled={busy}
          >
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </header>

      {err && <div className="card alert error">{err}</div>}

      <section className="card aset-section">
        <div className="aset-section-head">
          <h2 className="section-title">Mode</h2>
          <p className="section-subtext">
            Pick the preset that best matches your operation. You can still
            fine-tune the details below.
          </p>
        </div>
        <div className="row">
          {[
            ["solo", "Solo"],
            ["team", "Small Team"],
            ["full", "Full Ops"],
          ].map(([value, label]) => (
            <label className="radio" key={value}>
              <input
                type="radio"
                checked={s.mode?.preset === value}
                onChange={() => setK("mode.preset", value)}
              />
              <span>
                <strong>{label}</strong>
                <small>{MODE_DESCRIPTIONS[value]}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card aset-section">
        <div className="aset-section-head">
          <h2 className="section-title">Workflow</h2>
          <p className="section-subtext">
            Toggle the switches that should be visible to dispatchers, drivers,
            and customers.
          </p>
        </div>
        <div className="grid2">
          {[
            ["requireDriverDocs", "Require Driver Docs"],
            ["requireVendorDocs", "Require Vendor Docs"],
            ["showBusinessDocs", "Show Business Docs"],
            ["showLiveDriverMap", "Show Live Driver Map"],
            ["advancedJobWorkflow", "Advanced Job Workflow"],
            ["enableCustomerPaymentScreen", "Customer Payment Screen"],
            ["enableReviewFunnel", "Enable Review Funnel"],
            ["multiServiceMode", "Multi-Service Mode"],
            ["showReportsTab", "Show Reports Tab"],
            ["enableMessaging", "Enable Messaging"],
          ].map(([key, label]) => (
            <label className="chk" key={key}>
              <input
                type="checkbox"
                className="toggle-input"
                checked={!!s.workflow?.[key]}
                onChange={(event) => setK(`workflow.${key}`, event.target.checked)}
              />
              <span className="toggle-bar" aria-hidden="true">
                <span className="toggle-thumb" />
              </span>
              <span className="chk-text">{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card aset-section">
        <div className="aset-section-head">
          <h2 className="section-title">Defaults</h2>
          <p className="section-subtext">
            Set baseline values that will be pre-filled when new jobs or
            vendors are created.
          </p>
        </div>
        <div className="row">
          <label>
            <span>Currency</span>
            <input
              value={s.defaults?.currency || ""}
              onChange={(event) => setK("defaults.currency", event.target.value)}
            />
          </label>
          <label>
            <span>Default City</span>
            <input
              value={s.defaults?.defaultCity || ""}
              onChange={(event) => setK("defaults.defaultCity", event.target.value)}
            />
          </label>
          <label>
            <span>Default Split %</span>
            <input
              type="number"
              min="0"
              max="100"
              value={splitPct}
              onChange={(event) => {
                const pct = Math.max(
                  0,
                  Math.min(100, Number(event.target.value) || 0)
                );
                setK("defaults.defaultEarningsSplit", pct / 100);
              }}
            />
          </label>
        </div>
      </section>

      <section className="card aset-section">
        <div className="aset-section-head">
          <h2 className="section-title">Intervals</h2>
          <p className="section-subtext">
            Control how often real-time data refreshes across the platform.
          </p>
        </div>
        <div className="row">
          <label>
            <span>Vendor Poll (sec)</span>
            <input
              type="number"
              min="3"
              max="60"
              value={
                s.intervals?.vendorPollSec ??
                s.intervals?.pollDriversSec ??
                7
              }
              onChange={(event) =>
                setK("intervals.vendorPollSec", Number(event.target.value) || 7)
              }
            />
          </label>
          <label>
            <span>Vendor Push (sec)</span>
            <input
              type="number"
              min="5"
              max="60"
              value={
                s.intervals?.vendorPushSec ??
                s.intervals?.driverPatchSec ??
                15
              }
              onChange={(event) =>
                setK("intervals.vendorPushSec", Number(event.target.value) || 15)
              }
            />
          </label>
          <label>
            <span>Map Refresh (sec)</span>
            <input
              type="number"
              min="3"
              max="60"
              value={s.intervals?.mapRefreshSec ?? 7}
              onChange={(event) =>
                setK("intervals.mapRefreshSec", Number(event.target.value) || 7)
              }
            />
          </label>
        </div>
      </section>

      <section className="card aset-section">
        <div className="aset-section-head">
          <h2 className="section-title">Vendor compliance</h2>
          <p className="section-subtext">
            Define and enforce the documents vendors must submit before receiving jobs.
          </p>
        </div>
        <div className="aset-compliance">
          <div className="aset-compliance__controls">
            <label>
              <span>Enforcement mode</span>
              <select
                value={vendorCompliance.enforce || "submission"}
                onChange={(event) => setVendorEnforce(event.target.value)}
              >
                <option value="off">Disabled</option>
                <option value="submission">Require submission</option>
                <option value="verified">Require verification</option>
              </select>
            </label>
            <label className="aset-toggle">
              <input
                type="checkbox"
                checked={vendorCompliance.autoSuspendOnExpiry !== false}
                onChange={(event) => setVendorAutoSuspend(event.target.checked)}
              />
              <span>Auto-suspend on expiry</span>
            </label>
            <button
              type="button"
              className="btn ghost"
              onClick={addVendorRequirement}
            >
              Add requirement
            </button>
          </div>
          <div className="aset-compliance__list">
            {vendorDocs.length === 0 ? (
              <p className="muted">No document requirements configured.</p>
            ) : (
              <div className="aset-compliance__grid">
                {vendorDocs.map((doc, index) => (
                  <article key={doc.key || index} className="aset-compliance__item">
                    <header className="aset-compliance__item-head">
                      <input
                        placeholder="Unique key"
                        value={doc.key || ""}
                        onChange={(event) =>
                          updateVendorRequirement(index, "key", event.target.value.trim())
                        }
                      />
                      <button
                        type="button"
                        className="btn-text danger"
                        onClick={() => removeVendorRequirement(index)}
                      >
                        Remove
                      </button>
                    </header>
                    <label>
                      <span>Label</span>
                      <input
                        value={doc.label || ""}
                        onChange={(event) =>
                          updateVendorRequirement(index, "label", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Kind</span>
                      <input
                        value={doc.kind || ""}
                        onChange={(event) =>
                          updateVendorRequirement(index, "kind", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Accepted formats</span>
                      <input
                        value={(doc.accepts || []).join(", ")}
                        onChange={(event) =>
                          updateVendorRequirementAccepts(index, event.target.value)
                        }
                      />
                    </label>
                    <div className="aset-compliance__flags">
                      <label className="aset-inline">
                        <input
                          type="checkbox"
                          checked={doc.required !== false}
                          onChange={(event) =>
                            updateVendorRequirement(index, "required", event.target.checked)
                          }
                        />
                        <span>Required</span>
                      </label>
                      <label className="aset-inline">
                        <input
                          type="checkbox"
                          checked={doc.expires === true}
                          onChange={(event) =>
                            updateVendorRequirement(index, "expires", event.target.checked)
                          }
                        />
                        <span>Expires</span>
                      </label>
                    </div>
                    <label>
                      <span>Validity days</span>
                      <input
                        type="number"
                        min="0"
                        value={doc.validityDays ?? ""}
                        onChange={(event) =>
                          updateVendorRequirement(
                            index,
                            "validityDays",
                            event.target.value ? Number(event.target.value) : null
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>Description</span>
                      <textarea
                        rows={2}
                        value={doc.description || ""}
                        onChange={(event) =>
                          updateVendorRequirement(index, "description", event.target.value)
                        }
                      />
                    </label>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="card aset-section">
        <div className="aset-section-head">
          <h2 className="section-title">Reviews</h2>
          <p className="section-subtext">
            Configure how customer reviews are captured and published.
          </p>
        </div>
        <div className="row">
          <label>
            <span>Public Threshold (stars)</span>
            <input
              type="number"
              min="1"
              max="5"
              value={s.reviews?.publicThreshold ?? 5}
              onChange={(event) =>
                setK("reviews.publicThreshold", Number(event.target.value) || 5)
              }
            />
          </label>
          <label>
            <span>Google Public URL</span>
            <input
              value={s.reviews?.googlePublicUrl || ""}
              onChange={(event) => setK("reviews.googlePublicUrl", event.target.value)}
            />
          </label>
        </div>
      </section>

      <footer className="aset-footer">
        <div className="aset-footer-note">
          <span>Changes apply to every dispatch workspace instantly.</span>
        </div>
        <button
          className="btn primary aset-save-mobile"
          onClick={save}
          disabled={busy}
        >
          {busy ? "Saving..." : "Save changes"}
        </button>
      </footer>
    </div>
  );
}
