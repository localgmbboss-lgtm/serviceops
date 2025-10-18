import { useCallback, useEffect, useMemo, useState } from "react";
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
        automation: s.automation,
      };
      const { data } = await api.put("/api/settings", body);
      setS(data);
      setErr("");
      // Surface a quick confirmation in the dev console so admins know the payload persisted.
      // eslint-disable-next-line no-console
      console.log("[AdminSettings] Settings successfully updated:", data);
    } catch (error) {
      setErr(error?.response?.data?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const setK = (path, val) => {
    setS((prev) => {
      const next = structuredClone(prev || {});
      const parts = path.split(".");
      let cursor = next;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        if (
          typeof cursor[key] !== "object" ||
          cursor[key] === null ||
          Array.isArray(cursor[key])
        ) {
          cursor[key] = {};
        }
        cursor = cursor[key];
      }
      cursor[parts[parts.length - 1]] = val;
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

  const mutateAutomation = useCallback(
    (mutator) => {
      setS((prev) => {
        const next = structuredClone(prev || {});
        if (!next.automation) next.automation = {};
        mutator(next.automation);
        return next;
      });
    },
    [setS]
  );

  const toggleCustomerChannels = useCallback((enabled) => {
    mutateAutomation((automation) => {
      if (!automation.alerts) automation.alerts = {};
      const customer = automation.alerts.customer || {};
      const channels = { ...(customer.channels || {}) };
      ["sms", "email", "push"].forEach((channel) => {
        channels[channel] = Boolean(enabled);
      });
      customer.channels = channels;
      automation.alerts.customer = customer;
    });
  }, [mutateAutomation]);

  const toggleVendorAlerts = useCallback((enabled) => {
    mutateAutomation((automation) => {
      if (!automation.alerts) automation.alerts = {};
      const vendor = automation.alerts.vendor || {};
      const channels = { ...(vendor.channels || {}) };
      ["sms", "email", "push"].forEach((channel) => {
        channels[channel] = Boolean(enabled);
      });
      vendor.channels = channels;
      vendor.jobAssigned = Boolean(enabled);
      automation.alerts.vendor = vendor;
    });
  }, [mutateAutomation]);

  const toggleDigests = useCallback((enabled) => {
    mutateAutomation((automation) => {
      if (!automation.digests) automation.digests = {};
      ["adminDaily", "adminWeekly", "vendorWeekly"].forEach((key) => {
        const digest = automation.digests[key] || {};
        digest.enabled = Boolean(enabled);
        automation.digests[key] = digest;
      });
    });
  }, [mutateAutomation]);

  const toggleComplianceAutomations = useCallback((enabled) => {
    mutateAutomation((automation) => {
      if (!automation.compliance) automation.compliance = {};
      automation.compliance.autoNotifyMissingDocs = Boolean(enabled);
    });
  }, [mutateAutomation]);

  const customerChannels = s?.automation?.alerts?.customer?.channels || {};
  const vendorChannels = s?.automation?.alerts?.vendor?.channels || {};
  const digestsConfig = s?.automation?.digests || {};
  const complianceAutomation = s?.automation?.compliance || {};

  const customerChannelCount = ["sms", "email", "push"].filter(
    (channel) => customerChannels[channel]
  ).length;
  const vendorChannelCount = ["sms", "email", "push"].filter(
    (channel) => vendorChannels[channel]
  ).length;
  const digestEnabledCount = ["adminDaily", "adminWeekly", "vendorWeekly"].filter(
    (key) => digestsConfig?.[key]?.enabled
  ).length;

  const automationSummary = useMemo(
    () => [
      {
        key: "customer",
        title: "Customer alerts",
        description: "ETA reminders, satisfaction surveys, and check-ins keep customers in the loop.",
        enabled: customerChannelCount > 0,
        statusLabel:
          customerChannelCount > 0
            ? `${customerChannelCount} channel${customerChannelCount === 1 ? "" : "s"} on`
            : "Muted",
        actionLabel: customerChannelCount > 0 ? "Mute all" : "Enable channels",
        onAction: () => toggleCustomerChannels(!(customerChannelCount > 0)),
        meta: [
          `ETA reminder: ${
            (s?.automation?.alerts?.customer?.driverEtaMinutes ?? 0) > 0
              ? `${s?.automation?.alerts?.customer?.driverEtaMinutes} min before`
              : "off"
          }`,
          `Post-service survey: ${
            (s?.automation?.alerts?.customer?.followUpSurveyHours ?? 0) > 0
              ? `${s?.automation?.alerts?.customer?.followUpSurveyHours}h later`
              : "off"
          }`,
          `Re-engagement: ${
            (s?.automation?.alerts?.customer?.reengagementDays ?? 0) > 0
              ? `every ${s?.automation?.alerts?.customer?.reengagementDays} days`
              : "disabled"
          }`,
        ],
      },
      {
        key: "vendor",
        title: "Vendor nudges",
        description: "Automated SMS/email/push nudges to keep vendors responsive and SLA-aware.",
        enabled: vendorChannelCount > 0 && (s?.automation?.alerts?.vendor?.jobAssigned ?? true),
        statusLabel:
          vendorChannelCount > 0
            ? `${vendorChannelCount} channel${vendorChannelCount === 1 ? "" : "s"} on`
            : "Muted",
        actionLabel:
          vendorChannelCount > 0 && (s?.automation?.alerts?.vendor?.jobAssigned ?? true)
            ? "Pause nudges"
            : "Enable nudges",
        onAction: () =>
          toggleVendorAlerts(
            !(
              vendorChannelCount > 0 &&
              (s?.automation?.alerts?.vendor?.jobAssigned ?? true)
            )
          ),
        meta: [
          `Assignment alerts: ${
            s?.automation?.alerts?.vendor?.jobAssigned ?? true ? "on" : "off"
          }`,
          `SLA reminder: ${
            (s?.automation?.alerts?.vendor?.slaReminderMinutes ?? 0) > 0
              ? `${s?.automation?.alerts?.vendor?.slaReminderMinutes} min before`
              : "off"
          }`,
        ],
      },
      {
        key: "digests",
        title: "Scheduled digests",
        description: "Morning briefings and weekly recaps delivered automatically.",
        enabled: digestEnabledCount > 0,
        statusLabel:
          digestEnabledCount > 0
            ? `${digestEnabledCount} digest${digestEnabledCount === 1 ? "" : "s"} active`
            : "All off",
        actionLabel: digestEnabledCount > 0 ? "Disable digests" : "Enable all",
        onAction: () => toggleDigests(!(digestEnabledCount > 0)),
        meta: [
          `Admin daily: ${
            digestsConfig?.adminDaily?.enabled
              ? `@ ${digestsConfig?.adminDaily?.time || "07:30"}`
              : "off"
          }`,
          `Admin weekly: ${
            digestsConfig?.adminWeekly?.enabled
              ? `${digestsConfig?.adminWeekly?.weekday?.toUpperCase?.() || "FRI"} @ ${
                  digestsConfig?.adminWeekly?.time || "09:00"
                }`
              : "off"
          }`,
          `Vendor weekly: ${
            digestsConfig?.vendorWeekly?.enabled
              ? `${digestsConfig?.vendorWeekly?.weekday?.toUpperCase?.() || "FRI"} @ ${
                  digestsConfig?.vendorWeekly?.time || "17:00"
                }`
              : "off"
          }`,
        ],
      },
      {
        key: "compliance",
        title: "Compliance workflows",
        description: "Automatic emails and tasks when vendor paperwork is missing or expiring.",
        enabled: complianceAutomation?.autoNotifyMissingDocs ?? true,
        statusLabel:
          complianceAutomation?.autoNotifyMissingDocs ?? true ? "Notifications on" : "Muted",
        actionLabel:
          complianceAutomation?.autoNotifyMissingDocs ?? true
            ? "Pause notifications"
            : "Resume notifications",
        onAction: () =>
          toggleComplianceAutomations(!(complianceAutomation?.autoNotifyMissingDocs ?? true)),
        meta: [
          `Expiry reminder: ${complianceAutomation?.remindBeforeExpiryDays ?? 7} day${
            (complianceAutomation?.remindBeforeExpiryDays ?? 7) === 1 ? "" : "s"
          } before`,
        ],
      },
    ],
    [
      customerChannelCount,
      vendorChannelCount,
      digestEnabledCount,
      s?.automation?.alerts?.customer?.driverEtaMinutes,
      s?.automation?.alerts?.customer?.followUpSurveyHours,
      s?.automation?.alerts?.customer?.reengagementDays,
      s?.automation?.alerts?.vendor?.jobAssigned,
      s?.automation?.alerts?.vendor?.slaReminderMinutes,
      digestsConfig?.adminDaily?.enabled,
      digestsConfig?.adminDaily?.time,
      digestsConfig?.adminWeekly?.enabled,
      digestsConfig?.adminWeekly?.time,
      digestsConfig?.adminWeekly?.weekday,
      digestsConfig?.vendorWeekly?.enabled,
      digestsConfig?.vendorWeekly?.time,
      digestsConfig?.vendorWeekly?.weekday,
      complianceAutomation?.autoNotifyMissingDocs,
      complianceAutomation?.remindBeforeExpiryDays,
      toggleCustomerChannels,
      toggleVendorAlerts,
      toggleDigests,
      toggleComplianceAutomations,
    ]
  );

  if (!s) return <p>Loading...</p>;

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
          <h2 className="section-title">Alerts & Automations</h2>
          <p className="section-subtext">
            Control proactive notifications, scheduled digests, and compliance nudges that keep
            operators in sync without extra clicks.
          </p>
        </div>
        <div className="aset-automation-summary">
          {automationSummary.map((card) => (
            <article
              key={card.key}
              className={
                "aset-automation-summary__card" + (card.enabled ? " is-active" : "")
              }
            >
              <header className="aset-automation-summary__head">
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </div>
                <span className="aset-automation-summary__status">{card.statusLabel}</span>
              </header>
              {card.meta?.length ? (
                <ul className="aset-automation-summary__meta">
                  {card.meta.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                className="aset-automation-summary__action"
                onClick={card.onAction}
              >
                {card.actionLabel}
              </button>
            </article>
          ))}
        </div>
        <div className="row aset-automation-row">
          <div className="aset-automation-card">
            <h3>Customer touchpoints</h3>
            <label>
              <span>Driver ETA reminder (minutes)</span>
              <input
                type="number"
                min="0"
                value={s.automation?.alerts?.customer?.driverEtaMinutes ?? 10}
                onChange={(event) =>
                  setK(
                    "automation.alerts.customer.driverEtaMinutes",
                    Number(event.target.value) || 0
                  )
                }
              />
            </label>
            <label>
              <span>Post-service survey (hours)</span>
              <input
                type="number"
                min="0"
                value={s.automation?.alerts?.customer?.followUpSurveyHours ?? 1}
                onChange={(event) =>
                  setK(
                    "automation.alerts.customer.followUpSurveyHours",
                    Number(event.target.value) || 0
                  )
                }
              />
            </label>
            <label>
              <span>Re-engagement cadence (days)</span>
              <input
                type="number"
                min="0"
                value={s.automation?.alerts?.customer?.reengagementDays ?? 14}
                onChange={(event) =>
                  setK(
                    "automation.alerts.customer.reengagementDays",
                    Number(event.target.value) || 0
                  )
                }
              />
            </label>
            <div className="aset-toggle-group">
              <span>Channels</span>
              <label className="aset-toggle">
                <input
                  type="checkbox"
                  checked={s.automation?.alerts?.customer?.channels?.sms ?? true}
                  onChange={(event) =>
                    setK("automation.alerts.customer.channels.sms", event.target.checked)
                  }
                />
                SMS
              </label>
              <label className="aset-toggle">
                <input
                  type="checkbox"
                  checked={s.automation?.alerts?.customer?.channels?.email ?? true}
                  onChange={(event) =>
                    setK("automation.alerts.customer.channels.email", event.target.checked)
                  }
                />
                Email
              </label>
              <label className="aset-toggle">
                <input
                  type="checkbox"
                  checked={s.automation?.alerts?.customer?.channels?.push ?? false}
                  onChange={(event) =>
                    setK("automation.alerts.customer.channels.push", event.target.checked)
                  }
                />
                Push
              </label>
            </div>
          </div>

          <div className="aset-automation-card">
            <h3>Vendor nudges</h3>
            <label className="aset-toggle aset-toggle--inline">
              <input
                type="checkbox"
                checked={s.automation?.alerts?.vendor?.jobAssigned ?? true}
                onChange={(event) =>
                  setK("automation.alerts.vendor.jobAssigned", event.target.checked)
                }
              />
              Notify on new assignment
            </label>
            <label>
              <span>SLA reminder (minutes)</span>
              <input
                type="number"
                min="0"
                value={s.automation?.alerts?.vendor?.slaReminderMinutes ?? 20}
                onChange={(event) =>
                  setK(
                    "automation.alerts.vendor.slaReminderMinutes",
                    Number(event.target.value) || 0
                  )
                }
              />
            </label>
            <div className="aset-toggle-group">
              <span>Channels</span>
              <label className="aset-toggle">
                <input
                  type="checkbox"
                  checked={s.automation?.alerts?.vendor?.channels?.sms ?? true}
                  onChange={(event) =>
                    setK("automation.alerts.vendor.channels.sms", event.target.checked)
                  }
                />
                SMS
              </label>
              <label className="aset-toggle">
                <input
                  type="checkbox"
                  checked={s.automation?.alerts?.vendor?.channels?.email ?? false}
                  onChange={(event) =>
                    setK("automation.alerts.vendor.channels.email", event.target.checked)
                  }
                />
                Email
              </label>
              <label className="aset-toggle">
                <input
                  type="checkbox"
                  checked={s.automation?.alerts?.vendor?.channels?.push ?? true}
                  onChange={(event) =>
                    setK("automation.alerts.vendor.channels.push", event.target.checked)
                  }
                />
                Push
              </label>
            </div>
          </div>
        </div>

        <div className="row aset-automation-row">
          <div className="aset-automation-card">
            <h3>Scheduled digests</h3>
            <label className="aset-toggle aset-toggle--inline">
              <input
                type="checkbox"
                checked={s.automation?.digests?.adminDaily?.enabled ?? false}
                onChange={(event) =>
                  setK("automation.digests.adminDaily.enabled", event.target.checked)
                }
              />
              Daily admin snapshot
            </label>
            <label>
              <span>Daily send time</span>
              <input
                type="time"
                value={s.automation?.digests?.adminDaily?.time || "07:30"}
                onChange={(event) =>
                  setK("automation.digests.adminDaily.time", event.target.value)
                }
              />
            </label>
            <label className="aset-toggle aset-toggle--inline">
              <input
                type="checkbox"
                checked={s.automation?.digests?.adminWeekly?.enabled ?? true}
                onChange={(event) =>
                  setK("automation.digests.adminWeekly.enabled", event.target.checked)
                }
              />
              Weekly executive roll-up
            </label>
            <div className="aset-digest-grid">
              <label>
                <span>Day</span>
                <select
                  value={s.automation?.digests?.adminWeekly?.weekday || "mon"}
                  onChange={(event) =>
                    setK("automation.digests.adminWeekly.weekday", event.target.value)
                  }
                >
                  <option value="sun">Sunday</option>
                  <option value="mon">Monday</option>
                  <option value="tue">Tuesday</option>
                  <option value="wed">Wednesday</option>
                  <option value="thu">Thursday</option>
                  <option value="fri">Friday</option>
                  <option value="sat">Saturday</option>
                </select>
              </label>
              <label>
                <span>Time</span>
                <input
                  type="time"
                  value={s.automation?.digests?.adminWeekly?.time || "08:00"}
                  onChange={(event) =>
                    setK("automation.digests.adminWeekly.time", event.target.value)
                  }
                />
              </label>
            </div>
            <div className="aset-toggle-group">
              <span>Vendor weekly</span>
              <label className="aset-toggle aset-toggle--inline">
                <input
                  type="checkbox"
                  checked={s.automation?.digests?.vendorWeekly?.enabled ?? true}
                  onChange={(event) =>
                    setK("automation.digests.vendorWeekly.enabled", event.target.checked)
                  }
                />
                Enabled
              </label>
              <label>
                <span>Send on</span>
                <select
                  value={s.automation?.digests?.vendorWeekly?.weekday || "fri"}
                  onChange={(event) =>
                    setK("automation.digests.vendorWeekly.weekday", event.target.value)
                  }
                >
                  <option value="sun">Sunday</option>
                  <option value="mon">Monday</option>
                  <option value="tue">Tuesday</option>
                  <option value="wed">Wednesday</option>
                  <option value="thu">Thursday</option>
                  <option value="fri">Friday</option>
                  <option value="sat">Saturday</option>
                </select>
              </label>
              <label>
                <span>Time</span>
                <input
                  type="time"
                  value={s.automation?.digests?.vendorWeekly?.time || "17:00"}
                  onChange={(event) =>
                    setK("automation.digests.vendorWeekly.time", event.target.value)
                  }
                />
              </label>
            </div>
          </div>

          <div className="aset-automation-card">
            <h3>Compliance workflows</h3>
            <label className="aset-toggle aset-toggle--inline">
              <input
                type="checkbox"
                checked={s.automation?.compliance?.autoNotifyMissingDocs ?? true}
                onChange={(event) =>
                  setK("automation.compliance.autoNotifyMissingDocs", event.target.checked)
                }
              />
              Auto-notify missing documents
            </label>
            <label>
              <span>Reminder before expiry (days)</span>
              <input
                type="number"
                min="0"
                value={s.automation?.compliance?.remindBeforeExpiryDays ?? 7}
                onChange={(event) =>
                  setK(
                    "automation.compliance.remindBeforeExpiryDays",
                    Number(event.target.value) || 0
                  )
                }
              />
            </label>
            <p className="aset-automation-hint">
              Vendors will receive a warning through the selected channels, and entries will surface
              inside Mission Control until resolved.
            </p>
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

