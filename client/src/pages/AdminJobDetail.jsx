import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { getGoogleMapsKey } from "../config/env.js";
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

  const job = payload?.job ?? null;
  const customer = payload?.customer ?? null;
  const vendor = payload?.vendor ?? null;
  const timeline = useMemo(() => payload?.timeline ?? {}, [payload]);
  const payment = useMemo(() => payload?.payment ?? {}, [payload]);
  const coordinates = useMemo(() => payload?.coordinates ?? {}, [payload]);
  const links = payload?.links ?? null;
  const nearbyVendors = useMemo(() => payload?.nearbyVendors ?? [], [payload]);

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

  const mapCenter = useMemo(() => {
    if (coordinates?.pickup) {
      return [coordinates.pickup.lat, coordinates.pickup.lng];
    }
    if (coordinates?.dropoff) {
      return [coordinates.dropoff.lat, coordinates.dropoff.lng];
    }
    return null;
  }, [coordinates]);

  const mapVendors = useMemo(() => {
    const list = [];
    if (coordinates?.pickup) {
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
    if (!value) return;
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

  return (
    <div className="admin-job-detail">
      <div className="admin-job-detail__header">
        <button
          type="button"
          className="admin-job-detail__back"
          onClick={() => navigate(-1)}
        >
          &larr; Back to jobs
        </button>
        <div className="admin-job-detail__title-group">
          <h1>{job?.serviceType || "Job detail"}</h1>
          <p className="admin-job-detail__subtitle">
            {subtitle || "No pickup address available"}
          </p>
        </div>
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
      </div>

      {toast ? (
        <div className={`admin-job-detail__toast admin-job-detail__toast--${toast.type}`}>
          {toast.message}
        </div>
      ) : null}

      {error ? (
        <div className="admin-job-detail__alert">{error}</div>
      ) : null}

      {loading && !job ? (
        <div className="admin-job-detail__loading">Loading job details...</div>
      ) : null}

      {!loading && !job ? (
        <div className="admin-job-detail__empty">
          <p>We could not find this job.</p>
        </div>
      ) : null}

      {job ? (
        <>
          <div className="admin-job-detail__grid">
            <section className="admin-job-detail__card">
              <header>
                <h2>Trip overview</h2>
              </header>
              <dl>
                <div>
                  <dt>Job</dt>
                  <dd>{jobLabel}</dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>{job?.serviceType || "Not specified"}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd>
                    {job?.vehicleColor || job?.vehicleMake || job?.vehicleModel
                      ? `${job?.vehicleColor || ""} ${job?.vehicleMake || ""} ${
                          job?.vehicleModel || ""
                        }`
                          .trim()
                          .replace(/\s+/g, " ")
                      : "Unknown vehicle"}
                  </dd>
                </div>
                <div>
                  <dt>Pickup</dt>
                  <dd>{job?.pickupAddress || "Pending"}</dd>
                </div>
                <div>
                  <dt>Drop-off</dt>
                  <dd>{job?.dropoffAddress || "Not provided"}</dd>
                </div>
                <div>
                  <dt>ETA / Duration</dt>
                  <dd>{job?.estimatedDuration || "Calculating"}</dd>
                </div>
              </dl>
            </section>

            <section className="admin-job-detail__card">
              <header>
                <h2>Customer</h2>
              </header>
              {customer ? (
                <dl>
                  <div>
                    <dt>Name</dt>
                    <dd>{customer.name || "-"}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>
                      {customer.phone || "-"}
                      {customer.phone ? (
                        <div className="admin-job-detail__links">
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(customer.phone, "Phone number")
                            }
                          >
                            Copy phone
                          </button>
                          <a
                            href={`tel:${customer.phone}`}
                            className="admin-job-detail__back"
                          >
                            Call
                          </a>
                        </div>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{customer.email || "-"}</dd>
                  </div>
                  <div>
                    <dt>Last request</dt>
                    <dd>
                      {customer.lastServiceRequest
                        ? formatDateTime(customer.lastServiceRequest)
                        : "Not available"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="admin-job-detail__vendor-empty">
                  No customer record attached.
                </p>
              )}
            </section>

            <section className="admin-job-detail__card">
              <header>
                <h2>Assigned vendor</h2>
              </header>
              {vendor ? (
                <dl>
                  <div>
                    <dt>Name</dt>
                    <dd>{vendor.name || "Vendor"}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>
                      {vendor.phone || "-"}
                      {vendor.phone ? (
                        <div className="admin-job-detail__links">
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(vendor.phone, "Vendor phone")
                            }
                          >
                            Copy phone
                          </button>
                          <a
                            href={`tel:${vendor.phone}`}
                            className="admin-job-detail__back"
                          >
                            Call
                          </a>
                        </div>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{vendor.email || "-"}</dd>
                  </div>
                  <div>
                    <dt>Radius (km)</dt>
                    <dd>{vendor.radiusKm ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Services</dt>
                    <dd>
                      {Array.isArray(vendor.services) && vendor.services.length
                        ? vendor.services.join(", ")
                        : "Not listed"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="admin-job-detail__vendor-empty">
                  No vendor assigned yet.
                </p>
              )}
            </section>

            <section className="admin-job-detail__card">
              <header>
                <h2>Timeline</h2>
              </header>
              {timelineItems.length ? (
                <dl>
                  {timelineItems.map((item) => (
                    <div key={item.key}>
                      <dt>{item.label}</dt>
                      <dd>{formatDateTime(item.value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="admin-job-detail__vendor-empty">
                  No status updates yet.
                </p>
              )}
            </section>

            <section className="admin-job-detail__card">
              <header>
                <h2>Payment</h2>
              </header>
              <dl>
                {paymentSummary.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="admin-job-detail__card">
              <header>
                <h2>Share links</h2>
              </header>
              {links ? (
                <div className="admin-job-detail__links">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(links.statusUrl, "Status link")}
                    disabled={!links.statusUrl}
                  >
                    Copy status link
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(links.customerLink, "Customer link")}
                    disabled={!links.customerLink}
                  >
                    Copy customer link
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(links.vendorLink, "Vendor link")}
                    disabled={!links.vendorLink}
                  >
                    Copy vendor link
                  </button>
                </div>
              ) : (
                <p className="admin-job-detail__vendor-empty">
                  Links become available once bidding is opened.
                </p>
              )}
            </section>
          </div>

          {notes ? (
            <section className="admin-job-detail__card">
              <header>
                <h2>Notes</h2>
              </header>
              <p>{notes}</p>
            </section>
          ) : null}

          <section className="admin-job-detail__card admin-job-detail__card--nearby">
            <header>
              <h2>Nearby vendors</h2>
            </header>
            {nearbyList.length ? (
              <>
                <ul>
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
                              {entry.phone ? ` | ${entry.phone}` : ""}
                              {entry.services?.length ? ` | ${entry.services.join(", ")}` : ""}
                            </span>
                          </div>
                        </label>
                        <div className="admin-job-detail__vendor-actions">
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
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="admin-job-detail__links">
                  <button
                    type="button"
                    onClick={handlePingVendors}
                    disabled={pingBusy || !pingSelection.size}
                  >
                    {pingBusy ? "Pinging..." : "Ping selected vendors"}
                  </button>
                </div>
              </>
            ) : (
              <p className="admin-job-detail__vendor-empty">
                No nearby vendors found for this pickup.
              </p>
            )}
          </section>

          <section className="admin-job-detail__map-card">
            <header>
              <h2>Map preview</h2>
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
                    center={
                      mapCenter || [39.7392, -104.9903] /* Denver fallback */
                    }
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
        </>
      ) : null}
    </div>
  );
}








