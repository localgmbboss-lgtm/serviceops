import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import MessagingPanel from "../components/MessagingPanel";
import { getGoogleMapsKey } from "../config/env.js";
import { useJobMessaging } from "../hooks/useJobMessaging";
import "./AdminJobDetail.css";

const MILES_PER_KM = 0.621371;

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString() : "-";

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString() : "-";

const formatCurrency = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  } catch (error) {
    return `$${num.toFixed(2)}`;
  }
};

const formatDistance = (km) => {
  const num = Number(km);
  if (!Number.isFinite(num) || num <= 0) return null;
  const miles = num * MILES_PER_KM;
  if (miles < 1) return `${Math.round(miles * 10) / 10} mi`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
};

const toSentenceCase = (value) => {
  if (!value) return "";
  const str = String(value).toLowerCase();
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const formatWindowLabel = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? `${value}` : date.toLocaleString();
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(" to ");
  }
  if (typeof value === "object") {
    const start =
      value.start ||
      value.from ||
      value.begin ||
      value.opens ||
      value.windowStart ||
      value.time ||
      value.date;
    const end =
      value.end ||
      value.to ||
      value.finish ||
      value.closes ||
      value.windowEnd ||
      value.until;
    if (start || end) return [start, end].filter(Boolean).join(" to ");
  }
  return `${value}`;
};

const isValidUrl = (value) => {
  if (!value || typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};

const toStatusClass = (status) =>
  `admin-job-detail__status admin-job-detail__status--${String(
    status || ""
  ).toLowerCase()}`;

const TIMELINE_LABELS = {
  created: "Created",
  assignedAt: "Assigned",
  onTheWayAt: "On the way",
  arrivedAt: "Arrived",
  completedAt: "Completed",
  escalatedAt: "Escalated",
};

export default function AdminJobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const hasGoogleMaps = Boolean(getGoogleMapsKey());

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [pingBusy, setPingBusy] = useState(false);
  const [pingSelection, setPingSelection] = useState(() => new Set());
  const [activeTab, setActiveTab] = useState("overview");

  const {
    messages: chatMessages,
    participants: chatParticipants,
    sendMessage: sendChatMessage,
    sending: chatSending,
    loading: chatLoading,
    error: chatError,
    canMessage: chatEnabled,
    realtimeReady: chatRealtimeReady,
    typingIndicators: chatTypingIndicators,
    emitTyping: chatEmitTyping,
    markConversationRead,
    reload: reloadChat,
  } = useJobMessaging({ jobId, role: "admin" });

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/api/jobs/${jobId}`);
      setPayload(data || null);
      setPingSelection(new Set());
    } catch (err) {
      setPayload(null);
      setError(err?.response?.data?.message || "Unable to load job details.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (activeTab === "conversation") {
      markConversationRead?.();
    }
  }, [activeTab, markConversationRead]);

  const job = payload?.job ?? null;
  const customer = payload?.customer ?? null;
  const vendor = payload?.vendor ?? null;
  const timeline = useMemo(() => payload?.timeline ?? {}, [payload]);
  const payment = useMemo(() => payload?.payment ?? {}, [payload]);
  const coordinates = useMemo(() => payload?.coordinates ?? {}, [payload]);
  const links = payload?.links ?? null;
  const nearbyVendors = useMemo(() => payload?.nearbyVendors ?? [], [payload]);
  const pickupWindowLabel = useMemo(
    () =>
      formatWindowLabel(
        job?.pickupWindow ||
          job?.pickupTime ||
          job?.pickupEta ||
          job?.scheduledAt ||
          job?.pickupWindowStart ||
          job?.pickupScheduledFor
      ),
    [
      job?.pickupEta,
      job?.pickupScheduledFor,
      job?.pickupTime,
      job?.pickupWindow,
      job?.pickupWindowStart,
      job?.scheduledAt,
    ]
  );
  const dropoffWindowLabel = useMemo(
    () =>
      formatWindowLabel(
        job?.dropoffWindow ||
          job?.dropoffTime ||
          job?.dropoffEta ||
          job?.dropoffWindowStart ||
          job?.dropoffScheduledFor
      ),
    [
      job?.dropoffEta,
      job?.dropoffScheduledFor,
      job?.dropoffTime,
      job?.dropoffWindow,
      job?.dropoffWindowStart,
    ]
  );
  const distanceLabel = useMemo(
    () => formatDistance(job?.distanceKm || job?.distanceMiles || job?.distance),
    [job?.distance, job?.distanceKm, job?.distanceMiles]
  );

  const jobLabel = useMemo(() => {
    if (!job?._id) return "-";
    return `#${String(job._id).slice(-6).toUpperCase()}`;
  }, [job?._id]);

  const subtitle = useMemo(() => {
    const created = job?.createdAt || job?.created;
    const pickup = job?.pickupAddress;
    const parts = [];
    if (created) parts.push(formatDateTime(created));
    if (pickup) parts.push(pickup);
    return parts.join(" | ");
  }, [job?.created, job?.createdAt, job?.pickupAddress]);

  const notes = job?.notes ? String(job.notes).trim() : "";

  const timelineItems = useMemo(
    () =>
      Object.entries(TIMELINE_LABELS)
        .map(([key, label]) => ({
          key,
          label,
          value: timeline?.[key] || null,
        }))
        .filter((item) => item.value),
    [timeline]
  );

  const paymentSummary = useMemo(
    () => [
      { label: "Status", value: payment?.status || "pending" },
      { label: "Method", value: payment?.method || "-" },
      { label: "Quoted", value: formatCurrency(payment?.quotedPrice) },
      { label: "Final", value: formatCurrency(payment?.finalPrice) },
      {
        label: "Commission",
        value:
          payment?.commission !== null && payment?.commission !== undefined
            ? formatCurrency(payment.commission)
            : "-",
      },
      { label: "Payment date", value: formatDate(payment?.paymentDate) },
    ],
    [payment]
  );

  const nearbyList = useMemo(
    () =>
      (nearbyVendors || []).map((entry, index) => ({
        ...entry,
        _id:
          entry?._id ||
          entry?.id ||
          entry?.vendorId ||
          entry?.phone ||
          `vendor-${index}`,
        distanceLabel: formatDistance(entry?.distanceKm),
      })),
    [nearbyVendors]
  );

  const hasLocation =
    Boolean(coordinates?.pickup) || Boolean(coordinates?.dropoff);

  const tabs = useMemo(() => {
    const list = [{ id: "overview", label: "Overview" }];
    if (hasLocation) {
      list.push({ id: "map", label: "Live map" });
    }
    list.push({ id: "conversation", label: "Conversation" });
    return list;
  }, [hasLocation]);

  const heroFinancials = useMemo(() => {
    const priority = paymentSummary.filter(
      (item) => item.label === "Final" || item.label === "Quoted"
    );
    const source = priority.length ? priority : paymentSummary;
    return source.slice(0, 2);
  }, [paymentSummary]);

  const heroTitle = job?.serviceType || "Job detail";
  const heroSubtitle =
    subtitle || job?.pickupAddress || "Awaiting pickup information";
  const heroMeta = useMemo(() => {
    if (!job) return [];
    return [
      {
        label: "Status",
        value: job.status ? toSentenceCase(job.status) : "Unassigned",
      },
      {
        label: "Priority",
        value: job.priority ? toSentenceCase(job.priority) : null,
      },
      {
        label: "Created",
        value: formatDateTime(job.createdAt || job.created),
      },
      {
        label: "Vendor",
        value: vendor?.name || job.vendorName || null,
      },
    ].filter((item) => item.value);
  }, [job, vendor]);
  const overviewSummary = useMemo(
    () => [
      {
        label: "Service type",
        value: job?.serviceType || "Not specified",
      },
      {
        label: "Reference ID",
        value: jobLabel,
      },
      {
        label: "Job status",
        value: job?.status ? toSentenceCase(job.status) : "Unassigned",
      },
      {
        label: "Priority",
        value: job?.priority ? toSentenceCase(job.priority) : "Standard",
      },
      {
        label: "Created",
        value: formatDateTime(job?.createdAt || job?.created),
      },
      {
        label: "Scheduled",
        value: pickupWindowLabel || "-",
      },
    ],
    [job?.created, job?.createdAt, job?.priority, job?.serviceType, job?.status, jobLabel, pickupWindowLabel]
  );
  const logisticsSummary = useMemo(
    () => [
      {
        label: "Pickup",
        value: job?.pickupAddress || "",
        hint: pickupWindowLabel,
      },
      {
        label: "Drop-off",
        value: job?.dropoffAddress || "",
        hint: dropoffWindowLabel,
      },
      {
        label: "Distance",
        value: distanceLabel || "",
      },
      {
        label: "Vehicle / equipment",
        value: job?.vehicleType || job?.equipmentNeeded || "",
      },
    ],
    [distanceLabel, dropoffWindowLabel, job?.dropoffAddress, job?.equipmentNeeded, job?.pickupAddress, job?.vehicleType, pickupWindowLabel]
  );
  const customerDetails = useMemo(
    () => [
      {
        label: "Name",
        value:
          customer?.name ||
          job?.customerName ||
          job?.customerCompany ||
          job?.customerEmail ||
          "",
      },
      {
        label: "Email",
        value: customer?.email || job?.customerEmail || "",
      },
      {
        label: "Phone",
        value: customer?.phone || job?.customerPhone || "",
      },
      {
        label: "Instructions",
        value: job?.customerNotes || customer?.notes || "",
      },
    ],
    [
      customer?.email,
      customer?.name,
      customer?.notes,
      customer?.phone,
      job?.customerCompany,
      job?.customerEmail,
      job?.customerName,
      job?.customerNotes,
      job?.customerPhone,
    ]
  );
  const vendorDetails = useMemo(
    () => [
      {
        label: "Name",
        value: vendor?.name || job?.vendorName || "",
      },
      {
        label: "Email",
        value: vendor?.email || job?.vendorEmail || "",
      },
      {
        label: "Phone",
        value: vendor?.phone || job?.vendorPhone || "",
      },
      {
        label: "Location",
        value: vendor?.city
          ? [vendor.city, vendor.state].filter(Boolean).join(", ")
          : job?.vendorCity || "",
      },
    ],
    [
      job?.vendorCity,
      job?.vendorEmail,
      job?.vendorName,
      job?.vendorPhone,
      vendor?.city,
      vendor?.email,
      vendor?.name,
      vendor?.phone,
      vendor?.state,
    ]
  );
  const customerInstructions = useMemo(
    () =>
      customerDetails.find(
        (item) => item.label === "Instructions" && item.value
      )?.value || "",
    [customerDetails]
  );
  const shareableLinks = useMemo(() => {
    if (!links) return [];
    return [
      {
        id: "status",
        label: "Copy status link",
        value: links.statusUrl,
      },
      {
        id: "customer",
        label: "Copy customer link",
        value: links.customerLink,
      },
      {
        id: "vendor",
        label: "Copy vendor link",
        value: links.vendorLink,
      },
    ].filter((item) => isValidUrl(item.value));
  }, [links]);
  const hasShareableLinks = shareableLinks.length > 0;

  const chatSubtitle = useMemo(() => {
    if (!job) return "";
    const vendorName = vendor?.name || job.vendorName;
    const customerName =
      customer?.name || job.customerName || job.customerEmail || "";
    if (vendorName && customerName) {
      return `${vendorName} <> ${customerName}`;
    }
    if (vendorName) return `Chat with ${vendorName}`;
    if (customerName) return `Chat with ${customerName}`;
    return job.pickupAddress || jobLabel;
  }, [customer, job, jobLabel, vendor]);

  const chatFatalError = useMemo(
    () => Boolean(chatError && !chatLoading && !chatMessages.length),
    [chatError, chatLoading, chatMessages.length]
  );

  const chatPanelError = chatFatalError ? "" : chatError;
  const chatPanelCanMessage = chatFatalError ? false : chatEnabled;

  const timelineItemsSorted = timelineItems;

  const mapCenter = useMemo(() => {
    const pickup = coordinates?.pickup;
    if (pickup?.lat && pickup?.lng) return [pickup.lat, pickup.lng];
    if (vendor?.lat && vendor?.lng) return [vendor.lat, vendor.lng];
    if (coordinates?.dropoff?.lat && coordinates?.dropoff?.lng) {
      return [coordinates.dropoff.lat, coordinates.dropoff.lng];
    }
    return null;
  }, [coordinates?.dropoff, coordinates?.pickup, vendor?.lat, vendor?.lng]);

  const mapVendors = useMemo(() => {
    const list = [];
    if (coordinates?.pickup?.lat && coordinates?.pickup?.lng) {
      list.push({
        _id: "pickup",
        name: "Pickup",
        lat: coordinates.pickup.lat,
        lng: coordinates.pickup.lng,
        label: "PICK",
        active: true,
      });
    }
    if (vendor?.lat && vendor?.lng) {
      list.push({
        _id: vendor._id || "assigned",
        name: vendor.name || "Assigned vendor",
        lat: vendor.lat,
        lng: vendor.lng,
        label: "VEND",
        lastSeenAt: vendor.lastSeenAt || null,
        active: vendor.active !== false,
      });
    }
    return list;
  }, [coordinates, vendor]);

  const handleRefresh = () => {
    if (!loading) load();
  };

  const copyToClipboard = async (value, label) => {
    if (!value || typeof value !== "string") return;
    try {
      await navigator.clipboard.writeText(value);
      setToast({ type: "success", message: `${label} copied to clipboard.` });
    } catch (err) {
      setToast({
        type: "error",
        message: "Unable to copy to clipboard on this browser.",
      });
    }
  };

  const toggleVendorSelection = (vendorId) => {
    if (!vendorId) return;
    setPingSelection((prev) => {
      const next = new Set(prev);
      const key = String(vendorId);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handlePingVendors = async () => {
    const vendorIds = Array.from(pingSelection);
    if (!vendorIds.length) {
      setToast({ type: "error", message: "Select at least one vendor to ping." });
      return;
    }
    setPingBusy(true);
    setToast({ type: "loading", message: "Notifying selected vendors..." });
    try {
      const { data } = await api.post(`/api/jobs/${jobId}/ping-vendors`, {
        vendorIds,
      });
      const count = data?.count ?? vendorIds.length;
      setToast({
        type: "success",
        message: `Pinged ${count} vendor${count === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      setToast({
        type: "error",
        message:
          err?.response?.data?.message || "Unable to notify vendors right now.",
      });
    } finally {
      setPingBusy(false);
    }
  };

  const primaryStatus = job?.status;

  const statusClassName = primaryStatus ? toStatusClass(primaryStatus) : "";

  return (
    <div className="admin-job-detail">
      <header className="admin-job-detail__header">
        <button
          type="button"
          className="admin-job-detail__back"
          onClick={() => navigate("/jobs")}
        >
          &larr; Back to jobs
        </button>
        <div className="admin-job-detail__header-actions">
          {primaryStatus ? (
            <span className={statusClassName}>{primaryStatus}</span>
          ) : null}
          <button
            type="button"
            className="admin-job-detail__refresh"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <section className="admin-job-detail__hero">
        <div className="admin-job-detail__hero-content">
          <span className="admin-job-detail__tag">{jobLabel}</span>
          <h1>{heroTitle}</h1>
          <p className="admin-job-detail__subtitle">{heroSubtitle}</p>
          {heroMeta.length ? (
            <dl className="admin-job-detail__hero-meta">
              {heroMeta.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        {heroFinancials.length ? (
          <div className="admin-job-detail__hero-metrics">
            {heroFinancials.map((item) => (
              <div className="admin-job-detail__metric-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {toast ? (
        <div
          className={`admin-job-detail__toast admin-job-detail__toast--${toast.type}`}
        >
          {toast.message}
        </div>
      ) : null}

      {error ? (
        <div className="admin-job-detail__alert">{error}</div>
      ) : null}

      {loading && !job ? (
        <div className="admin-job-detail__loading">
          Loading job details...
        </div>
      ) : null}

      {!loading && !job ? (
        <div className="admin-job-detail__empty">
          <p>We could not find this job.</p>
        </div>
      ) : null}

      {job ? (
        <>
          <nav className="admin-job-detail__tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`admin-job-detail__tab${
                  activeTab === tab.id ? " is-active" : ""
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="admin-job-detail__panels">
            {activeTab === "overview" ? (
              <div className="admin-job-detail__panel admin-job-detail__panel--overview">
                <div className="admin-job-detail__layout">
                  <div className="admin-job-detail__column admin-job-detail__column--main">
                    <section className="admin-job-detail__card">
                      <header>
                        <h2>Job summary</h2>
                      </header>
                      <dl className="admin-job-detail__data-grid">
                        {overviewSummary.map((item) => (
                          <div key={item.label}>
                            <dt>{item.label}</dt>
                            <dd>{item.value || "-"}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>

                    <section className="admin-job-detail__card">
                      <header>
                        <h2>Logistics</h2>
                      </header>
                      <dl className="admin-job-detail__data-grid">
                        {logisticsSummary.map((item) => (
                          <div key={item.label}>
                            <dt>{item.label}</dt>
                            <dd>
                              {item.value || "-"}
                              {item.hint ? (
                                <span className="admin-job-detail__hint">{item.hint}</span>
                              ) : null}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>

                    {timelineItemsSorted.length ? (
                      <section className="admin-job-detail__card">
                        <header>
                          <h2>Timeline</h2>
                        </header>
                        <ol className="admin-job-detail__timeline">
                          {timelineItemsSorted.map((item) => (
                            <li key={item.key}>
                              <span className="admin-job-detail__timeline-dot" />
                              <div>
                                <p className="admin-job-detail__timeline-label">
                                  {item.label}
                                </p>
                                <p className="admin-job-detail__timeline-date">
                                  {formatDateTime(item.value)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ) : null}

                    <section className="admin-job-detail__card">
                      <header>
                        <h2>Payment</h2>
                      </header>
                      <dl className="admin-job-detail__data-grid admin-job-detail__data-grid--compact">
                        {paymentSummary.map((item) => (
                          <div key={item.label}>
                            <dt>{item.label}</dt>
                            <dd>{item.value || "-"}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>

                    {notes ? (
                      <section className="admin-job-detail__card">
                        <header>
                          <h2>Notes</h2>
                        </header>
                        <p className="admin-job-detail__notes">{notes}</p>
                      </section>
                    ) : null}
                  </div>

                  <aside className="admin-job-detail__column admin-job-detail__column--sidebar">
                    <section className="admin-job-detail__card">
                      <header>
                        <h2>Customer</h2>
                      </header>
                      {customerDetails.some((item) => item.value) ? (
                        <>
                          <dl className="admin-job-detail__detail-list">
                            {customerDetails
                              .filter((item) => item.label !== "Instructions")
                              .map((item) => (
                                <div key={item.label}>
                                  <dt>{item.label}</dt>
                                  <dd>{item.value || "-"}</dd>
                                </div>
                              ))}
                          </dl>
                          {customerInstructions ? (
                            <p className="admin-job-detail__hint-block">
                              {customerInstructions}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="admin-job-detail__empty">
                          Customer record not available.
                        </p>
                      )}
                    </section>

                    <section className="admin-job-detail__card">
                      <header>
                        <h2>Vendor</h2>
                      </header>
                      {vendorDetails.some((item) => item.value) ? (
                        <dl className="admin-job-detail__detail-list">
                          {vendorDetails.map((item) => (
                            <div key={item.label}>
                              <dt>{item.label}</dt>
                              <dd>{item.value || "-"}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="admin-job-detail__empty">No vendor assigned yet.</p>
                      )}
                    </section>

                    <section className="admin-job-detail__card">
                      <header>
                        <h2>Shareable links</h2>
                      </header>
                      {hasShareableLinks ? (
                        <div className="admin-job-detail__button-stack">
                          {shareableLinks.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => copyToClipboard(item.value, item.label)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="admin-job-detail__empty">
                          Shareable links will appear automatically once they are ready.
                        </p>
                      )}
                    </section>

                    <section className="admin-job-detail__card admin-job-detail__card--nearby">
                      <header>
                        <h2>Nearby vendors</h2>
                      </header>
                      {nearbyList.length ? (
                        <>
                          <ul className="admin-job-detail__vendor-list">
                            {nearbyList.map((entry) => {
                              const key = String(entry._id);
                              return (
                                <li key={key}>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={pingSelection.has(key)}
                                      onChange={() => toggleVendorSelection(key)}
                                    />
                                    <div>
                                      <span className="admin-job-detail__vendor-name">
                                        {entry.name || "Vendor"}
                                      </span>
                                      <span className="admin-job-detail__vendor-meta">
                                        {entry.distanceLabel
                                          ? `${entry.distanceLabel} away`
                                          : "Distance unavailable"}
                                        {entry.phone ? ` • ${entry.phone}` : ""}
                                        {entry.services?.length
                                          ? ` • ${entry.services.join(", ")}`
                                          : ""}
                                      </span>
                                    </div>
                                  </label>
                                  {entry.phone ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        copyToClipboard(entry.phone, "Vendor phone")
                                      }
                                    >
                                      Copy phone
                                    </button>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                          <button
                            type="button"
                            className="admin-job-detail__primary-action"
                            onClick={handlePingVendors}
                            disabled={pingBusy || !pingSelection.size}
                          >
                            {pingBusy ? "Pinging vendors..." : "Ping selected vendors"}
                          </button>
                        </>
                      ) : (
                        <p className="admin-job-detail__empty">
                          No nearby vendors found for this pickup.
                        </p>
                      )}
                    </section>
                  </aside>
                </div>
              </div>
            ) : null}

            {activeTab === "map" ? (
              <div className="admin-job-detail__panel admin-job-detail__panel--map">
                <section className="admin-job-detail__map-card">
                  <header>
                    <h2>Live map</h2>
                  </header>
                  <div className="admin-job-detail__map">
                    {hasLocation ? (
                      hasGoogleMaps ? (
                        <GMap
                          vendors={mapVendors}
                          center={
                            mapCenter
                              ? { lat: mapCenter[0], lng: mapCenter[1] }
                              : undefined
                          }
                          destination={
                            coordinates?.dropoff
                              ? {
                                  lat: coordinates.dropoff.lat,
                                  lng: coordinates.dropoff.lng,
                                  label: "Drop-off",
                                  title: job?.dropoffAddress || "Drop-off",
                                }
                              : null
                          }
                          showRoute={Boolean(
                            coordinates?.pickup && coordinates?.dropoff
                          )}
                          landmarks={
                            coordinates?.pickup
                              ? [
                                  {
                                    lat: coordinates.pickup.lat,
                                    lng: coordinates.pickup.lng,
                                    label: "Pickup",
                                    title: job?.pickupAddress || "Pickup",
                                    color: "#1d4ed8",
                                  },
                                ]
                              : []
                          }
                        />
                      ) : (
                        <LiveMap
                          vendors={mapVendors}
                          center={mapCenter || [39.7392, -104.9903]}
                          destination={
                            coordinates?.dropoff
                              ? {
                                  lat: coordinates.dropoff.lat,
                                  lng: coordinates.dropoff.lng,
                                }
                              : null
                          }
                        />
                      )
                    ) : (
                      <p className="admin-job-detail__vendor-empty">
                        Location coordinates are not available for this job.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "conversation" ? (
              <div className="admin-job-detail__panel admin-job-detail__panel--chat">
                {chatFatalError ? (
                  <div className="admin-job-detail__chat-error">
                    <p>{chatError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        reloadChat?.();
                        load();
                      }}
                    >
                      Reload
                    </button>
                  </div>
                ) : null}
                <MessagingPanel
                  title="Job conversation"
                  subtitle={chatSubtitle}
                  messages={chatMessages}
                  participants={chatParticipants}
                  actorRole="admin"
                  canMessage={chatPanelCanMessage}
                  onSend={sendChatMessage}
                  sending={chatSending}
                  loading={chatLoading}
                  error={chatPanelError}
                  realtimeReady={chatRealtimeReady}
                  typingIndicators={chatTypingIndicators}
                  onTyping={chatEmitTyping}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
