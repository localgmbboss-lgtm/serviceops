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
      .then((r) => setS(r.data))
      .catch((e) => {
        setErr(e?.response?.data?.message || "Failed to load settings");
      });
  }, []);

  const save = async () => {
    if (!s) return;
    try {
      setBusy(true);
      // send only whitelisted sections (matches server route)
      const body = {
        mode: s.mode,
        workflow: s.workflow,
        defaults: s.defaults,
        intervals: s.intervals,
        reviews: s.reviews,
      };
      const { data } = await api.put("/api/settings", body);
      setS(data);
      setErr("");
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <p>Loading...</p>;

  const setK = (path, val) => {
    setS((prev) => {
      const next = structuredClone(prev);
      // simple path setter
      const parts = path.split(".");
      let t = next;
      while (parts.length > 1) {
        t = t[parts.shift()];
      }
      t[parts[0]] = val;
      return next;
    });
  };

  // accept split% as 0-100 in UI but store 0-1
  const splitPct = Math.round((s.defaults?.defaultEarningsSplit ?? 0.6) * 100);
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
          ].map(([k, label]) => (
            <label className="chk" key={k}>
              <input
                type="checkbox"
                className="toggle-input"
                checked={!!s.workflow?.[k]}
                onChange={(e) => setK(`workflow.${k}`, e.target.checked)}
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
              onChange={(e) => setK("defaults.currency", e.target.value)}
            />
          </label>
          <label>
            <span>Default City</span>
            <input
              value={s.defaults?.defaultCity || ""}
              onChange={(e) => setK("defaults.defaultCity", e.target.value)}
            />
          </label>
          <label>
            <span>Default Split %</span>
            <input
              type="number"
              min="0"
              max="100"
              value={splitPct}
              onChange={(e) => {
                const pct = Math.max(
                  0,
                  Math.min(100, Number(e.target.value) || 0)
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
            <span>Driver Poll (sec)</span>
            <input
              type="number"
              min="3"
              max="60"
              value={s.intervals?.pollDriversSec ?? 7}
              onChange={(e) =>
                setK("intervals.pollDriversSec", Number(e.target.value) || 7)
              }
            />
          </label>
          <label>
            <span>Driver Patch (sec)</span>
            <input
              type="number"
              min="5"
              max="60"
              value={s.intervals?.driverPatchSec ?? 15}
              onChange={(e) =>
                setK("intervals.driverPatchSec", Number(e.target.value) || 15)
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
              onChange={(e) =>
                setK("intervals.mapRefreshSec", Number(e.target.value) || 7)
              }
            />
          </label>
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
              onChange={(e) =>
                setK("reviews.publicThreshold", Number(e.target.value) || 5)
              }
            />
          </label>
          <label>
            <span>Google Public URL</span>
            <input
              value={s.reviews?.googlePublicUrl || ""}
              onChange={(e) => setK("reviews.googlePublicUrl", e.target.value)}
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




