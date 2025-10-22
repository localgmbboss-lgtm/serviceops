import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import "./styles.css";

const SERVICE_SUGGESTIONS = [
  "Towing",
  "Jump Start",
  "Flat Tire",
  "Lockout",
  "Fuel Delivery",
  "Winching",
  "Heavy Duty",
  "Battery Replacement",
  "Roadside Assistance",
];

const AI_SECTIONS = [
  { key: "recommendedVendorActions", label: "Vendor actions" },
  { key: "customerCommunication", label: "Customer messaging" },
  { key: "riskFlags", label: "Risks & blockers" },
  { key: "dataGaps", label: "Missing info" },
  { key: "suggestedAddOns", label: "Upsell ideas" },
];

const INITIAL_FORM = {
  custName: "",
  custPhone: "",
  pickupAddress: "",
  dropoffAddress: "",
  serviceType: "",
  quotedPrice: "",
  notes: "",
  bidMode: "open",
  fulfillment: "market",
  openBidding: true,
  vendorId: "",
};

const MAX_MEDIA_IMAGES = 3;
const MAX_MEDIA_VIDEOS = 1;
const MAX_MEDIA_FILES = MAX_MEDIA_IMAGES + MAX_MEDIA_VIDEOS;
const MAX_MEDIA_SIZE = 25 * 1024 * 1024; // 25 MB
const MEDIA_ACCEPT = "image/*,video/*";

export default function JobCreate({ onCreated }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsError, setVendorsError] = useState("");
  const [aiAvailable, setAiAvailable] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiAdvice, setAiAdvice] = useState(null);
  const [vendorAiBusy, setVendorAiBusy] = useState(false);
  const [vendorAiError, setVendorAiError] = useState("");
  const [vendorAiSuggestions, setVendorAiSuggestions] = useState([]);
  const [vendorAiNotes, setVendorAiNotes] = useState([]);
  const [vendorAiCandidates, setVendorAiCandidates] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchVendors = async () => {
      setVendorsLoading(true);
      setVendorsError("");
      try {
        const { data } = await api.get("/api/admin/vendors");
        if (!cancelled) {
          setVendors(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setVendorsError(
            "Unable to load vendors. You can still create an open marketplace job."
          );
        }
      } finally {
        if (!cancelled) {
          setVendorsLoading(false);
        }
      }
    };

    fetchVendors();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      form.fulfillment === "broker" &&
      !form.vendorId &&
      vendors.length > 0
    ) {
      setForm((prev) => ({ ...prev, vendorId: vendors[0]._id }));
    }
  }, [form.fulfillment, form.vendorId, vendors]);

  useEffect(() => {
    let cancelled = false;

    const checkAiStatus = async () => {
      try {
        const { data } = await api.get("/api/ai/status");
        if (!cancelled) {
          setAiAvailable(Boolean(data?.enabled));
        }
      } catch {
        if (!cancelled) {
          setAiAvailable(false);
        }
      }
    };

    checkAiStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes)) return "";
    if (bytes >= 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const describeFileKind = (file) => {
    if (file.type?.startsWith("video/")) return "video";
    if (file.type?.startsWith("image/")) return "image";
    return null;
  };

  const handleMediaChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const currentImages = attachments.filter((item) => item.kind === "image").length;
    const currentVideos = attachments.filter((item) => item.kind === "video").length;
    const availableSlots = MAX_MEDIA_FILES - attachments.length;

    if (availableSlots <= 0) {
      setAttachmentError(
        `You can attach up to ${MAX_MEDIA_IMAGES} images and ${MAX_MEDIA_VIDEOS} video.`
      );
      event.target.value = "";
      return;
    }

    const allowed = [];
    const messages = [];
    let nextImages = currentImages;
    let nextVideos = currentVideos;

    files.forEach((file, index) => {
      if (index >= availableSlots) return;
      const kind = describeFileKind(file);
      if (!kind) {
        messages.push(`${file.name} must be an image or video file.`);
        return;
      }
      if (file.size > MAX_MEDIA_SIZE) {
        messages.push(`${file.name} exceeds the 25 MB limit.`);
        return;
      }
      if (kind === "video") {
        if (nextVideos >= MAX_MEDIA_VIDEOS) {
          messages.push("You can upload only 1 video per job.");
          return;
        }
        nextVideos += 1;
      } else if (kind === "image") {
        if (nextImages >= MAX_MEDIA_IMAGES) {
          messages.push("You can upload up to 3 images per job.");
          return;
        }
        nextImages += 1;
      }
      allowed.push({ file, kind });
    });

    if (files.length > availableSlots) {
      messages.push(
        `Only ${availableSlots} more ${
          availableSlots === 1 ? "file fits" : "files fit"
        }; remove an attachment to add more.`
      );
    }

    if (allowed.length) {
      setAttachments((prev) => [...prev, ...allowed]);
    }

    setAttachmentError(messages.length ? messages.join(" ") : "");
    event.target.value = "";
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setAttachmentError("");
  };

  const selectedVendor = useMemo(
    () => vendors.find((v) => v._id === form.vendorId) || null,
    [vendors, form.vendorId]
  );

  const vendorMap = useMemo(() => {
    const map = new Map();
    vendors.forEach((vendor) => {
      if (vendor?._id) map.set(vendor._id, vendor);
    });
    return map;
  }, [vendors]);

  const vendorCandidateMap = useMemo(() => {
    const map = new Map();
    vendorAiCandidates.forEach((candidate) => {
      if (candidate?.id) map.set(candidate.id, candidate);
    });
    return map;
  }, [vendorAiCandidates]);

  const canRequestAi = useMemo(
    () =>
      Boolean(
        aiAvailable &&
          form.serviceType.trim() &&
          form.pickupAddress.trim()
      ),
    [aiAvailable, form.serviceType, form.pickupAddress]
  );

  const canRequestVendorAi = useMemo(
    () =>
      Boolean(
        aiAvailable &&
          vendors.length > 0 &&
          form.serviceType.trim() &&
          form.pickupAddress.trim()
      ),
    [aiAvailable, vendors.length, form.serviceType, form.pickupAddress]
  );

  const handleFulfillmentChange = (mode) => {
    setForm((prev) => {
      if (prev.fulfillment === mode) return prev;
      const next = { ...prev, fulfillment: mode };
      if (mode === "broker") {
        next.bidMode = "fixed";
        next.openBidding = false;
        if (!prev.vendorId && vendors.length) {
          next.vendorId = vendors[0]._id;
        }
      } else {
        next.openBidding = true;
      }
      return next;
    });
  };

  const reset = () => {
    setForm({ ...INITIAL_FORM });
    setAttachments([]);
    setAttachmentError("");
  };

  const formatAdviceForCopy = (advice) => {
    if (!advice) return "";
    const sections = [];
    if (advice.summary) {
      sections.push(`Summary: ${advice.summary}`);
    }
    AI_SECTIONS.forEach(({ key, label }) => {
      const items = Array.isArray(advice?.[key])
        ? advice[key].filter(Boolean)
        : [];
      if (items.length) {
        sections.push(`${label}:\n- ${items.join("\n- ")}`);
      }
    });
    return sections.join("\n\n");
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore clipboard errors silently
    }
  };

  const applySuggestedVendor = (vendorId) => {
    if (!vendorId) return;
    setForm((prev) => ({
      ...prev,
      fulfillment: "broker",
      bidMode: "fixed",
      openBidding: false,
      vendorId,
    }));
  };

  const requestAiAdvice = async () => {
    if (!canRequestAi || aiBusy) return;
    setAiBusy(true);
    setAiError("");
    setAiAdvice(null);
    try {
      const quoted = Number(form.quotedPrice);
      const payload = {
        job: {
          serviceType: form.serviceType.trim(),
          pickupAddress: form.pickupAddress.trim(),
          dropoffAddress: form.dropoffAddress.trim(),
          notes: form.notes.trim(),
          quotedPrice: Number.isFinite(quoted) ? quoted : null,
          currency: "USD",
          customerName: form.custName.trim(),
          customerPhone: form.custPhone.trim(),
          priority: form.fulfillment === "broker" ? "scheduled" : "normal",
          bidMode: form.bidMode,
          fulfillment: form.fulfillment,
          openBidding: form.openBidding,
        },
      };
      const { data } = await api.post("/api/ai/jobs/suggestions", payload);
      setAiAdvice(data?.advice || null);
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        "The AI assistant could not generate suggestions. Try again shortly.";
      setAiError(message);
    } finally {
      setAiBusy(false);
    }
  };

  const requestVendorSuggestions = async () => {
    if (!canRequestVendorAi || vendorAiBusy) return;
    setVendorAiBusy(true);
    setVendorAiError("");
    setVendorAiSuggestions([]);
    setVendorAiNotes([]);
    setVendorAiCandidates([]);
    try {
      const quoted = Number(form.quotedPrice);
      const inferredPriority =
        form.fulfillment === "broker"
          ? "brokered"
          : form.bidMode === "fixed"
          ? "fixed_market"
          : "market";
      const payload = {
        job: {
          serviceType: form.serviceType.trim(),
          pickupAddress: form.pickupAddress.trim(),
          dropoffAddress: form.dropoffAddress.trim(),
          notes: form.notes.trim(),
          priority: inferredPriority,
          bidMode: form.bidMode,
          fulfillment: form.fulfillment,
          quotedPrice: Number.isFinite(quoted) ? quoted : null,
          heavyDuty: /heavy/i.test(form.serviceType),
          openBidding: form.openBidding,
          customerName: form.custName.trim(),
          customerPhone: form.custPhone.trim(),
        },
        limit: 5,
      };

      const { data } = await api.post(
        "/api/ai/vendors/recommendations",
        payload
      );
      setVendorAiSuggestions(
        Array.isArray(data?.recommended) ? data.recommended : []
      );
      setVendorAiNotes(Array.isArray(data?.notes) ? data.notes : []);
      setVendorAiCandidates(
        Array.isArray(data?.candidates) ? data.candidates : []
      );
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        "Could not generate vendor recommendations. Try again later.";
      setVendorAiError(message);
    } finally {
      setVendorAiBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setSuccess(null);

    const serviceType = form.serviceType.trim();

    if (
      !form.custName.trim() ||
      !form.custPhone.trim() ||
      !form.pickupAddress.trim()
    ) {
      setBusy(false);
      return setErr("Please fill customer name, phone, and pickup address.");
    }

    if (!serviceType) {
      setBusy(false);
      return setErr("Please enter a service type.");
    }

    const needsPrice =
      form.fulfillment === "broker" || form.bidMode === "fixed";
    if (needsPrice && !(Number(form.quotedPrice) > 0)) {
      setBusy(false);
      return setErr("Enter a payout amount for this job.");
    }

    if (form.fulfillment === "broker" && !form.vendorId) {
      setBusy(false);
      return setErr("Select a vendor to broker this job.");
    }

    try {
      const { data: cust } = await api.post("/api/customers", {
        name: form.custName.trim(),
        phone: form.custPhone.trim(),
      });

      const payload = {
        customerId: cust._id,
        pickupAddress: form.pickupAddress.trim(),
        dropoffAddress: form.dropoffAddress.trim() || undefined,
        serviceType,
        quotedPrice: Number(form.quotedPrice) || 0,
        notes: form.notes.trim(),
        bidMode: form.fulfillment === "broker" ? "fixed" : form.bidMode,
      };

      if (form.fulfillment === "broker") {
        payload.vendorId = form.vendorId;
        payload.finalPrice = Number(form.quotedPrice) || 0;
      }

      let jobResponse;
      if (attachments.length) {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          formData.append(
            key,
            typeof value === "number" ? String(value) : value
          );
        });
        attachments.forEach(({ file }) => formData.append("media", file));
        jobResponse = await api.post("/api/jobs", formData);
      } else {
        jobResponse = await api.post("/api/jobs", payload);
      }

      const { data: job } = jobResponse;

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      let links = {
        statusUrl: origin ? `${origin}/status/${job._id}` : null,
        vendorLink: null,
        customerLink: null,
      };

      if (form.fulfillment === "market" && form.openBidding) {
        try {
          const r = await api.post(`/api/jobs/${job._id}/open-bidding`);
          links = {
            statusUrl: r.data?.statusUrl || links.statusUrl,
            vendorLink: r.data?.vendorLink || null,
            customerLink: r.data?.customerLink || null,
          };
        } catch (openErr) {
          console.error("Failed to open bidding", openErr);
          if (!links.statusUrl) {
            links.statusUrl = `${origin}/status/${job._id}`;
          }
        }
      }

      setSuccess({
        jobId: job._id,
        ...links,
        fulfillment: form.fulfillment,
        vendorName: selectedVendor?.name || null,
        vendorPhone: selectedVendor?.phone || null,
      });
      reset();
      onCreated?.();
    } catch (submissionError) {
      setErr(
        submissionError?.response?.data?.message || "Failed to create job"
      );
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = busy
    ? "Creating..."
    : form.fulfillment === "broker"
    ? "Create & Assign Vendor"
    : form.openBidding
    ? "Create & Open Bidding"
    : "Create Job";

  const canUseBroker = vendorsLoading || vendors.length > 0;

  return (
    <form className="jobcreate" onSubmit={submit}>
      <h3>Create job</h3>

      {err && <div className="jobcreate-alert error">{err}</div>}
      {vendorsError && (
        <div className="jobcreate-alert error">{vendorsError}</div>
      )}
      {success && (
        <div className="jobcreate-alert success">
          <p>
            Job created!
            {success.statusUrl && (
              <button
                type="button"
                className="link"
                onClick={() => copy(success.statusUrl)}
              >
                Copy status link
              </button>
            )}
          </p>
          {success.fulfillment === "broker" && success.vendorName && (
            <p className="jobcreate-alert-note">
              Assigned to <strong>{success.vendorName}</strong>.
              Share the status link with the customer so they can track the job.
            </p>
          )}
          {success.fulfillment === "market" && (
            <p className="jobcreate-alert-note">
              Vendors can now review the job. Use the links below as needed.
            </p>
          )}
          <ul className="jobcreate-links">
            {success.statusUrl && (
              <li>
                <strong>Status</strong>
                <code>{success.statusUrl}</code>
                <button
                  className="btn tiny ghost"
                  type="button"
                  onClick={() => copy(success.statusUrl)}
                >
                  Copy
                </button>
              </li>
            )}
            {success.vendorLink && (
              <li>
                <strong>Vendor</strong>
                <code>{success.vendorLink}</code>
                <button
                  className="btn tiny ghost"
                  type="button"
                  onClick={() => copy(success.vendorLink)}
                >
                  Copy
                </button>
              </li>
            )}
            {success.customerLink && (
              <li>
                <strong>Customer</strong>
                <code>{success.customerLink}</code>
                <button
                  className="btn tiny ghost"
                  type="button"
                  onClick={() => copy(success.customerLink)}
                >
                  Copy
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="row">
        <label>
          <span>Customer name</span>
          <input value={form.custName} onChange={setField("custName")} required />
        </label>
        <label>
          <span>Customer phone</span>
          <input
            type="tel"
            value={form.custPhone}
            onChange={setField("custPhone")}
            required
          />
        </label>
      </div>

      <label>
        <span>Pickup address</span>
        <input
          value={form.pickupAddress}
          onChange={setField("pickupAddress")}
          required
          placeholder="123 Main St, City"
        />
      </label>

      <label>
        <span>Drop-off address (optional)</span>
        <input
          value={form.dropoffAddress}
          onChange={setField("dropoffAddress")}
          placeholder="Destination..."
        />
      </label>

      <fieldset className="jobcreate-section">
        <legend>Fulfillment method</legend>
        <div className="jobcreate-mode-options">
          <button
            type="button"
            className={`jobcreate-mode-option ${
              form.fulfillment === "market" ? "active" : ""
            }`}
            onClick={() => handleFulfillmentChange("market")}
          >
            Send to marketplace
          </button>
          <button
            type="button"
            className={`jobcreate-mode-option ${
              form.fulfillment === "broker" ? "active" : ""
            }`}
            onClick={() => handleFulfillmentChange("broker")}
            disabled={!canUseBroker && form.fulfillment !== "broker"}
            title={
              !canUseBroker
                ? "Add at least one vendor to broker a job."
                : undefined
            }
          >
            Brokered deal (assign vendor)
          </button>
        </div>
        <p className="jobcreate-mode-hint">
          {form.fulfillment === "broker"
            ? "Assign the job directly to a vendor at your negotiated rate. Vendors will not see bidding."
            : "Publish this request to vetted vendors so they can respond."}
        </p>
      </fieldset>

      {form.fulfillment === "broker" && (
        <div className="jobcreate-broker">
          <label>
            <span>Select vendor</span>
            <select
              value={form.vendorId}
              onChange={setField("vendorId")}
              disabled={vendorsLoading || vendors.length === 0}
            >
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name} {v.city ? `(${v.city})` : ""}
                </option>
              ))}
            </select>
            {vendorsLoading ? (
              <small className="jobcreate-hint">Loading vendors</small>
            ) : vendors.length === 0 ? (
              <small className="jobcreate-hint jobcreate-hint-error">
                Add a vendor before brokering a job.
              </small>
            ) : (
              <small className="jobcreate-hint">
                The selected vendor will see this job immediately with the fixed payout.
              </small>
            )}
          </label>
        </div>
      )}

      {form.fulfillment === "market" && (
        <fieldset className="jobcreate-mode">
          <legend>Vendor response type</legend>
          <div className="jobcreate-mode-options">
            <button
              type="button"
              className={`jobcreate-mode-option ${
                form.bidMode === "fixed" ? "active" : ""
              }`}
              onClick={() => setForm((f) => ({ ...f, bidMode: "fixed" }))}
            >
              Fixed price (ETA only)
            </button>
            <button
              type="button"
              className={`jobcreate-mode-option ${
                form.bidMode === "open" ? "active" : ""
              }`}
              onClick={() => setForm((f) => ({ ...f, bidMode: "open" }))}
            >
              Bid only (price + ETA)
            </button>
          </div>
          <p className="jobcreate-mode-hint">
            {form.bidMode === "fixed"
              ? "Vendors confirm with an ETA. Price is locked."
              : "Vendors can propose their price and ETA."}
          </p>
          <label className="jobcreate-checkbox">
            <input
              type="checkbox"
              checked={form.openBidding}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  openBidding: event.target.checked,
                }))
              }
            />
            <span>Open vendor bidding immediately</span>
          </label>
        </fieldset>
      )}

      <section className="jobcreate-section jobcreate-ai">
        <div className="jobcreate-ai-header">
          <div>
            <h4>AI dispatch assist</h4>
            <p className="jobcreate-ai-meta">
              {aiAvailable === false
                ? "Unavailable"
                : "Generate quick recommendations before you publish."}
            </p>
          </div>
          <div className="jobcreate-ai-actions">
            <button
              type="button"
              className="btn ghost tiny"
              onClick={requestAiAdvice}
              disabled={!canRequestAi || aiBusy}
            >
              {aiBusy ? "Thinking…" : "Ask AI"}
            </button>
            {aiAdvice && (
              <button
                type="button"
                className="btn tiny"
                onClick={() => copy(formatAdviceForCopy(aiAdvice))}
              >
                Copy summary
              </button>
            )}
          </div>
        </div>

        {aiAvailable === false && (
          <p className="jobcreate-ai-hint jobcreate-hint-error">
            AI assistant is disabled. Confirm the server OpenAI configuration.
          </p>
        )}

        {aiAvailable && !aiBusy && !canRequestAi && (
          <p className="jobcreate-ai-hint">
            Add at least a service type and pickup address to enable the
            assistant.
          </p>
        )}

        {aiBusy && (
          <p className="jobcreate-ai-hint">Generating recommendations…</p>
        )}

        {aiError && (
          <p className="jobcreate-ai-hint jobcreate-hint-error">{aiError}</p>
        )}

        {aiAdvice && (
          <div className="jobcreate-ai-result">
            {aiAdvice.summary && (
              <p className="jobcreate-ai-summary">{aiAdvice.summary}</p>
            )}
            <div className="jobcreate-ai-grid">
              {AI_SECTIONS.map(({ key, label }) => {
                const items = Array.isArray(aiAdvice[key])
                  ? aiAdvice[key].filter(Boolean)
                  : [];
                if (!items.length) return null;
                return (
                  <div key={key} className="jobcreate-ai-section">
                    <h5>{label}</h5>
                    <ul>
                      {items.map((item, index) => (
                        <li key={`${key}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="jobcreate-section jobcreate-vendor-ai">
        <div className="jobcreate-ai-header">
          <div>
            <h4>Vendor recommendations</h4>
            <p className="jobcreate-ai-meta">
              {aiAvailable === false
                ? "Unavailable – enable OpenAI to use this tool."
                : "Let the assistant rank trusted vendors for this job."}
            </p>
          </div>
          <div className="jobcreate-ai-actions">
            <button
              type="button"
              className="btn ghost tiny"
              onClick={requestVendorSuggestions}
              disabled={!canRequestVendorAi || vendorAiBusy}
            >
              {vendorAiBusy ? "Analyzing…" : "Suggest vendors"}
            </button>
          </div>
        </div>

        {aiAvailable && !canRequestVendorAi && !vendorAiSuggestions.length && (
          <p className="jobcreate-ai-hint">
            Add a service type and pickup address to enable vendor
            recommendations.
          </p>
        )}

        {vendorAiBusy && (
          <p className="jobcreate-ai-hint">Evaluating vendor roster…</p>
        )}

        {vendorAiError && (
          <p className="jobcreate-ai-hint jobcreate-hint-error">
            {vendorAiError}
          </p>
        )}

        {vendorAiNotes.length > 0 && (
          <ul className="jobcreate-ai-notes">
            {vendorAiNotes.map((note, index) => (
              <li key={`vendor-note-${index}`}>{note}</li>
            ))}
          </ul>
        )}

        {vendorAiSuggestions.length > 0 && (
          <ul className="jobcreate-vendor-list">
            {vendorAiSuggestions.map((suggestion, index) => {
              const vendor =
                vendorMap.get(suggestion.vendorId) ||
                vendorCandidateMap.get(suggestion.vendorId) ||
                null;
              const displayName = vendor?.name || "Vendor";
              const cityLabel = vendor?.city ? ` · ${vendor.city}` : "";
              const scoreLabel =
                typeof suggestion.score === "number"
                  ? `${suggestion.score.toFixed(0)}`
                  : null;
              return (
                <li key={`vendor-suggestion-${suggestion.vendorId}-${index}`}>
                  <div className="jobcreate-vendor-card">
                    <div className="jobcreate-vendor-meta">
                      <div className="jobcreate-vendor-title">
                        <span>{displayName}</span>
                        <span className="jobcreate-vendor-city">
                          {cityLabel}
                        </span>
                      </div>
                      <div className="jobcreate-vendor-tags">
                        <span className="jobcreate-tag">
                          {suggestion.priority === "backup"
                            ? "Backup"
                            : "Primary"}
                        </span>
                        {scoreLabel && (
                          <span className="jobcreate-tag score">
                            Score {scoreLabel}
                          </span>
                        )}
                        {vendor?.services?.length ? (
                          <span className="jobcreate-tag muted">
                            {vendor.services.slice(0, 2).join(", ")}
                            {vendor.services.length > 2 ? " +" : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {suggestion.reason && (
                      <p className="jobcreate-vendor-reason">
                        {suggestion.reason}
                      </p>
                    )}
                    <div className="jobcreate-vendor-actions">
                      <button
                        type="button"
                        className="btn tiny"
                        onClick={() =>
                          applySuggestedVendor(suggestion.vendorId)
                        }
                      >
                        Assign vendor
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="row">
        <label>
          <span>Service type</span>
          <input
            value={form.serviceType}
            onChange={setField("serviceType")}
            placeholder="e.g. Towing, Winch out"
            list="jobcreate-service-options"
            required
          />
          <datalist id="jobcreate-service-options">
            {SERVICE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label>
          <span>
            {form.fulfillment === "broker" ? "Vendor payout" : "Quoted price"}
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={form.quotedPrice}
            onChange={setField("quotedPrice")}
            placeholder="0"
            required={
              form.fulfillment === "broker" || form.bidMode === "fixed"
            }
          />
          <small className="jobcreate-hint">
            {form.fulfillment === "broker"
              ? "We will show this amount to the assigned vendor as the fixed payout."
              : form.bidMode === "fixed"
              ? "Required for fixed jobs. Vendors only submit their ETA."
              : "Optional reference when requesting bids."}
          </small>
        </label>
      </div>

      <section className="jobcreate-media">
        <label className="jobcreate-media-label">
          <span>Upload photos or video</span>
          <input
            type="file"
            accept={MEDIA_ACCEPT}
            multiple
            onChange={handleMediaChange}
          />
        </label>
        {attachmentError ? (
          <p className="jobcreate-hint-error">{attachmentError}</p>
        ) : (
          !attachments.length && (
            <p className="jobcreate-hint">
              Attach up to 3 images and 1 short video (25 MB max each).
            </p>
          )
        )}
        {attachments.length > 0 && (
          <ul className="jobcreate-media-list">
            {attachments.map((attachment, index) => (
              <li key={`${attachment.file.name}-${index}`}>
                <div>
                  <span className="jobcreate-media-name">{attachment.file.name}</span>
                  <span className="jobcreate-media-meta">
                    {attachment.kind === "video" ? "Video · " : ""}
                    {formatFileSize(attachment.file.size)}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn tiny ghost"
                  onClick={() => removeAttachment(index)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <label>
        <span>Notes</span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={setField("notes")}
          placeholder="Gate code, vehicle color, etc."
        />
      </label>

      <div className="row end">
        <button className="btn" type="submit" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
