// client/src/pages/VendorApp.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { vendorApi } from "../lib/vendorApi";
import { useNotifications } from "../contexts/NotificationsContext";
import "./VendorApp.css";

const KM_TO_MI = 0.621371;
const AVERAGE_SPEED_MPH = 34; // blended city/highway assumption
const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const derivePickupCoordinates = (job) => {
  const lat =
    toFiniteNumber(job?.pickupLat) ??
    toFiniteNumber(job?.pickup?.lat) ??
    toFiniteNumber(job?.coordinates?.lat) ??
    toFiniteNumber(job?.vehicleLocation?.lat);
  const lng =
    toFiniteNumber(job?.pickupLng) ??
    toFiniteNumber(job?.pickup?.lng) ??
    toFiniteNumber(job?.coordinates?.lng) ??
    toFiniteNumber(job?.vehicleLocation?.lng);
  return lat !== null && lng !== null ? { lat, lng } : null;
};

const enrichJobsWithDistance = (jobs, vendorLat, vendorLng) => {
  if (!Array.isArray(jobs)) return [];
  return jobs.map((job) => {
    if (Number.isFinite(job?.distanceKm)) return job;
    if (vendorLat === null || vendorLng === null) return job;
    const pickup = derivePickupCoordinates(job);
    if (!pickup) return job;
    const km = haversineKm(vendorLat, vendorLng, pickup.lat, pickup.lng);
    return Number.isFinite(km) ? { ...job, distanceKm: km } : job;
  });
};

function timeAgo(ts) {
  if (!ts) return "just now";
  const d = new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
}

function formatDistance(km) {
  if (!Number.isFinite(km)) return "Distance unavailable";
  const miles = km * KM_TO_MI;
  if (miles < 0.2) return `${Math.round(km * 1000)} m away`;
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}

function estimateTravelMinutes(km) {
  if (!Number.isFinite(km)) return null;
  const miles = km * KM_TO_MI;
  return Math.max(5, Math.ceil((miles / AVERAGE_SPEED_MPH) * 60));
}

function suggestedEta(job) {
  if (Number.isFinite(job?.suggestedEtaMinutes)) return job.suggestedEtaMinutes;
  const travel = estimateTravelMinutes(job?.distanceKm);
  return travel ? Math.max(12, travel + 8) : 30;
}

function suggestedPrice(job) {
  const miles = Number.isFinite(job?.distanceKm)
    ? job.distanceKm * KM_TO_MI
    : null;
  const base = job?.heavyDuty ? 185 : 95;
  const perMile = job?.heavyDuty ? 7.25 : 4.25;
  const buffer = job?.heavyDuty ? 25 : 15;
  const calc = miles ? base + miles * perMile + buffer : base;
  const rounded = Math.ceil(calc / 5) * 5;
  return Math.max(40, rounded);
}

export default function VendorApp() {
  const [me, setMe] = useState(null);
  const [openJobs, setOpenJobs] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [cityFilter, setCityFilter] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [bidSheet, setBidSheet] = useState(null);
  const [bidError, setBidError] = useState("");
  const [bidSubmitting, setBidSubmitting] = useState(false);

  const nav = useNavigate();
  const pollRef = useRef(null);
  const { publish } = useNotifications();
  const openJobsSnapshotRef = useRef(new Map());
  const openJobsInitializedRef = useRef(false);
  const assignedSnapshotRef = useRef(new Map());
  const assignedInitializedRef = useRef(false);
  const [openPage, setOpenPage] = useState(0);
  const [assignedPage, setAssignedPage] = useState(0);
  const [expandedJobId, setExpandedJobId] = useState(null);

  const load = async () => {
    try {
      setErr("");
      setLoading(true);

      const meReq = vendorApi.get("/api/vendor/auth/me");
      const openReq = vendorApi.get(
        `/api/vendor/feed/open${cityFilter ? "?city=1" : ""}`
      );
      const assignedReq = vendorApi.get("/api/vendor/feed/assigned");

      const [m, o, a] = await Promise.all([meReq, openReq, assignedReq]);

      const vendorProfile = m?.data?.vendor || {};
      const vendorLat = toFiniteNumber(vendorProfile.lat);
      const vendorLng = toFiniteNumber(vendorProfile.lng);

      setMe(vendorProfile);
      setOpenJobs(enrichJobsWithDistance(o.data || [], vendorLat, vendorLng));
      setAssigned(enrichJobsWithDistance(a.data || [], vendorLat, vendorLng));
      setLastUpdated(new Date());
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.message || "Failed to load vendor feed";
      setErr(msg);
      if (status === 401) {
        localStorage.removeItem("vendorToken");
        nav("/vendor/login");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityFilter]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden && autoRefresh) load();
    };
    if (autoRefresh && !pollRef.current) {
      pollRef.current = setInterval(tick, 12000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, cityFilter]);

  const OPEN_PAGE_SIZE = 4;
  const ASSIGNED_PAGE_SIZE = 4;

  useEffect(() => {
    const previous = openJobsSnapshotRef.current;
    const next = new Map();
    const isInitial = !openJobsInitializedRef.current;

    (openJobs || []).forEach((job) => {
      if (!job?._id) {
        return;
      }
      next.set(job._id, job);
      if (!previous.has(job._id) && !isInitial) {
        const title = job.serviceType
          ? "New " + job.serviceType + " request"
          : "New job available";
        publish({
          title,
          body: job.pickupAddress
            ? "Pickup near " + job.pickupAddress
            : "A nearby job is open for bidding.",
          severity: "info",
          meta: {
            role: "vendor",
            jobId: job._id,
            kind: "job",
            route: "/vendor/app",
          },
          dedupeKey: "vendor:open:" + job._id,
          createdAt: job.created || new Date().toISOString(),
        });
      }
    });

    openJobsSnapshotRef.current = next;
    if (!openJobsInitializedRef.current && (openJobs || []).length > 0) {
      openJobsInitializedRef.current = true;
    }
  }, [openJobs, publish]);

  useEffect(() => {
    const previous = assignedSnapshotRef.current;
    const next = new Map();
    const isInitial = !assignedInitializedRef.current;

    (assigned || []).forEach((job) => {
      if (!job?._id) {
        return;
      }
      next.set(job._id, job);
      const previousJob = previous.get(job._id);

      if (!previousJob) {
        if (!isInitial) {
          publish({
            title: "Bid accepted",
            body: job.serviceType
              ? "You're assigned to " + job.serviceType + "."
              : "A pending job has been assigned to you.",
            severity: "success",
            meta: {
              role: "vendor",
              jobId: job._id,
              kind: "assignment",
              status: job.status || "Assigned",
              route: "/vendor/app",
            },
            dedupeKey: "vendor:assigned:" + job._id,
            createdAt: job.created || new Date().toISOString(),
          });
        }
        return;
      }

      if (previousJob.status !== job.status && job.status) {
        publish({
          title: "Job status: " + job.status,
          body: job.serviceType
            ? job.serviceType + " is now " + job.status + "."
            : "Assigned job status changed to " + job.status + ".",
          severity: job.status === "Completed" ? "success" : "info",
          meta: {
            role: "vendor",
            jobId: job._id,
            kind: "status",
            status: job.status,
            route: "/vendor/app",
          },
          dedupeKey: "vendor:assigned:" + job._id + ":status:" + job.status,
          createdAt: new Date().toISOString(),
        });
      }
    });

    assignedSnapshotRef.current = next;
    if (!assignedInitializedRef.current && (assigned || []).length > 0) {
      assignedInitializedRef.current = true;
    }
  }, [assigned, publish]);

  const openPageCount = Math.max(1, Math.ceil(openJobs.length / OPEN_PAGE_SIZE));
  const assignedPageCount = Math.max(1, Math.ceil(assigned.length / ASSIGNED_PAGE_SIZE));
  const openSliceStart = openPage * OPEN_PAGE_SIZE;
  const openSliceEnd = Math.min(openJobs.length, openSliceStart + OPEN_PAGE_SIZE);
  const assignedSliceStart = assignedPage * ASSIGNED_PAGE_SIZE;
  const assignedSliceEnd = Math.min(assigned.length, assignedSliceStart + ASSIGNED_PAGE_SIZE);
  const openRangeLabel =
    openJobs.length === 0
      ? "No open jobs"
      : openPageCount === 1
      ? `${openJobs.length} ready for bids`
      : `Showing ${openSliceStart + 1}-${openSliceEnd} of ${openJobs.length}`;
  const assignedRangeLabel =
    assigned.length === 0
      ? "No active jobs"
      : assignedPageCount === 1
      ? `${assigned.length} active`
      : `Showing ${assignedSliceStart + 1}-${assignedSliceEnd} of ${assigned.length}`;

  useEffect(() => {
    setOpenPage((page) => Math.min(page, Math.max(0, openPageCount - 1)));
  }, [openPageCount]);

  useEffect(() => {
    setAssignedPage((page) => Math.min(page, Math.max(0, assignedPageCount - 1)));
  }, [assignedPageCount]);

  useEffect(() => {
    if (!expandedJobId) {
      return;
    }
    const exists =
      openJobs.some((job) => job?._id === expandedJobId) ||
      assigned.some((job) => job?._id === expandedJobId);
    if (!exists) {
      setExpandedJobId(null);
    }
  }, [expandedJobId, openJobs, assigned]);

  const pagedOpenJobs = useMemo(() => {
    const start = openPage * OPEN_PAGE_SIZE;
    return openJobs.slice(start, start + OPEN_PAGE_SIZE);
  }, [openJobs, openPage]);

  const pagedAssignedJobs = useMemo(() => {
    const start = assignedPage * ASSIGNED_PAGE_SIZE;
    return assigned.slice(start, start + ASSIGNED_PAGE_SIZE);
  }, [assigned, assignedPage]);

  const setStatus = async (jobId, status) => {
    try {
      if (
        status === "Completed" &&
        !window.confirm("Mark this job as completed?")
      ) {
        return;
      }
      await vendorApi.patch(`/api/vendor/feed/jobs/${jobId}/status`, {
        status,
      });
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to update status");
    }
  };
  const counts = useMemo(
    () => ({
      open: openJobs.length,
      assigned: assigned.length,
      inProgress: assigned.filter((j) => j.status !== "Completed").length,
    }),
    [openJobs, assigned]
  );

  const hasGeo =
    toFiniteNumber(me?.lat) !== null && toFiniteNumber(me?.lng) !== null;

  const toggleJobExpansion = (jobId) => {
    setExpandedJobId((current) => (current === jobId ? null : jobId));
  };

  const handleJobKeyDown = (event, jobId) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleJobExpansion(jobId);
    }
  };

  const openBidSheet = (job) => {
    const eta = suggestedEta(job);
    const price = suggestedPrice(job);
    setBidSheet({
      job,
      eta,
      price,
      suggestedEta: eta,
      suggestedPrice: price,
    });
    setBidError("");
  };

  const closeBidSheet = () => {
    setBidSheet(null);
    setBidError("");
    setBidSubmitting(false);
  };

  const updateBidField = (field, value) => {
    setBidSheet((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const submitBid = async () => {
    if (!bidSheet?.job) return;
    const eta = Number(bidSheet.eta);
    const price = Number(bidSheet.price);

    if (!Number.isFinite(eta) || eta <= 0) {
      setBidError("Enter a valid ETA in minutes.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setBidError("Enter a valid price.");
      return;
    }

    try {
      setBidSubmitting(true);
      await vendorApi.post("/api/vendor/feed/bid", {
        jobId: bidSheet.job._id,
        etaMinutes: eta,
        price,
      });
      await load();
      closeBidSheet();
    } catch (e) {
      setBidError(e?.response?.data?.message || "Failed to submit bid");
      setBidSubmitting(false);
    }
  };

  const statCards = [
    {
      label: "Open for bids",
      value: counts.open,
      hint: "waiting for a response",
    },
    {
      label: "In progress",
      value: counts.inProgress,
      hint: "jobs on the move",
    },
    {
      label: "Assigned today",
      value: counts.assigned,
      hint: "including upcoming",
    },
  ];

  return (
    <div className="vendor-app fade-up">
      <header className="va-hero card">
        <div className="va-hero__main">
          <p className="va-overline">Welcome back</p>
          <h1>{me?.name ? me.name : "Your vendor dashboard"}</h1>
          <p className="va-subtitle">
            Stay ahead of incoming requests with real-time bidding, distance
            insights, and quick actions.
          </p>
          {!hasGeo && (
            <div className="va-alert info">
              Add your location in the vendor profile to unlock distance-based
              estimates.
            </div>
          )}
        </div>
        <div className="va-hero__meta">
          <div className="va-chip">Last sync {lastUpdated ? timeAgo(lastUpdated) : "not yet"}</div>
          <label className="va-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto refresh
          </label>
          <label className="va-toggle">
            <input
              type="checkbox"
              checked={cityFilter}
              onChange={(e) => setCityFilter(e.target.checked)}
            />
            City filter
          </label>
        </div>
      </header>

      {err && <div className="va-alert error card">{err}</div>}

      <section className="va-stats">
        {statCards.map((card) => (
          <article key={card.label} className="va-stat card">
            <div className="va-stat__value">{card.value}</div>
            <div className="va-stat__label">{card.label}</div>
            <p className="va-stat__hint">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="va-grid">
        <div className="va-panel card">
          <div className="va-panel__head">
            <div>
              <h2>Open jobs</h2>
              <p className="va-panel__hint">
                {loading ? "Refreshing feed..." : openRangeLabel}
              </p>
            </div>
          </div>
          {loading && openJobs.length === 0 ? (
            <ul className="va-list">
              {[1, 2, 3].map((key) => (
                <li key={key} className="va-job va-job--skeleton">
                  <div className="skeleton" style={{ height: 16, width: "76%" }} />
                  <div className="skeleton" style={{ height: 14, width: "50%" }} />
                </li>
              ))}
            </ul>
          ) : openJobs.length === 0 ? (
            <div className="va-empty">
              <h4>No open jobs right now</h4>
              <p>Leave the app open and we will refresh automatically for you.</p>
            </div>
          ) : (
            <>
              <ul className="va-list">
                {pagedOpenJobs.map((job) => {
                  const distanceLabel = formatDistance(job.distanceKm);
                  const travelMinutes = estimateTravelMinutes(job.distanceKm);
                  const hasBid = job.canBid === false;
                  const expanded = expandedJobId === job._id;
                  const contactName =
                    job.contactName ||
                    job.customerName ||
                    job.customer?.name ||
                    job.contact?.name ||
                    job.clientName;
                  const contactPhone =
                    job.contactPhone ||
                    job.customerPhone ||
                    job.phone ||
                    job.contact?.phone;
                  const dropoffAddress =
                    job.dropoffAddress ||
                    job.destination ||
                    job.dropoff?.address;
                  const noteText =
                    job.description ||
                    job.notes ||
                    job.customerNote ||
                    job.jobNotes;
                  const vehicleDetails = [
                    job.vehicleMake,
                    job.vehicleModel,
                    job.vehicleColor,
                  ]
                    .filter(Boolean)
                    .join(" / ");
                  const detailRows = [
                    contactName ? { label: "Contact", value: contactName } : null,
                    contactPhone ? { label: "Phone", value: String(contactPhone).trim() } : null,
                    dropoffAddress ? { label: "Dropoff", value: dropoffAddress } : null,
                    vehicleDetails ? { label: "Vehicle", value: vehicleDetails } : null,
                    noteText ? { label: "Notes", value: noteText } : null,
                  ].filter(Boolean);
                  return (
                    <li
                      key={job._id}
                      className={"va-job" + (expanded ? " va-job--expanded" : "")}
                      onClick={() => toggleJobExpansion(job._id)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onKeyDown={(event) => handleJobKeyDown(event, job._id)}
                    >
                      <div className="va-job__main">
                        <div className="va-job__header">
                          <div className="va-job__title">{job.serviceType || "Service"}</div>
                          <div className="va-chip-group">
                            {job.guestRequest && (
                              <span className="va-chip va-chip--guest">Guest</span>
                            )}
                            {job.heavyDuty && (
                              <span className="va-chip va-chip--heavy">Heavy duty</span>
                            )}
                            <span className={`va-chip va-chip--mode ${job.bidMode}`}>
                              {job.bidMode === "fixed" ? "Fixed price" : "Bid only"}
                            </span>
                            {hasBid && <span className="va-chip va-chip--success">Bid placed</span>}
                          </div>
                        </div>
                        <p className="va-job__address">{job.pickupAddress}</p>
                        <div className="va-job__meta">
                          <span>{distanceLabel}</span>
                          <span>
                            {job.suggestedEtaMinutes
                              ? `Suggested ETA ${job.suggestedEtaMinutes} min`
                              : travelMinutes
                              ? `Travel time ~${travelMinutes} min`
                              : "ETA flexible"}
                          </span>
                        </div>
                        <div className="va-job__meta muted">
                          <span>Posted {timeAgo(job.created)}</span>
                        </div>
                        {expanded && detailRows.length > 0 ? (
                          <div className="va-job__details">
                            {detailRows.map((row) => (
                              <div className="va-detail" key={row.label}>
                                <span className="va-detail__label">{row.label}</span>
                                <span className="va-detail__value">{row.value}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="va-job__cta">
                        <button
                          className="btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            openBidSheet(job);
                          }}
                        >
                          {hasBid ? "Update bid" : "Place bid"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {openPageCount > 1 ? (
                <div className="va-pagination">
                  <button
                    type="button"
                    className="va-pagination__btn"
                    onClick={() => setOpenPage((page) => Math.max(page - 1, 0))}
                    disabled={openPage === 0}
                  >
                    Previous
                  </button>
                  <span className="va-pagination__indicator">
                    Page {openPage + 1} of {openPageCount}
                  </span>
                  <button
                    type="button"
                    className="va-pagination__btn"
                    onClick={() =>
                      setOpenPage((page) => Math.min(page + 1, openPageCount - 1))
                    }
                    disabled={openPage + 1 >= openPageCount}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="va-panel card">
          <div className="va-panel__head">
            <div>
              <h2>Assigned / In progress</h2>
              <p className="va-panel__hint">
                {assigned.length === 0
                  ? "Waiting for selection"
                  : assignedRangeLabel}
              </p>
            </div>
          </div>

          {loading && assigned.length === 0 ? (
            <ul className="va-list">
              <li className="va-job va-job--skeleton">
                <div className="skeleton" style={{ height: 16, width: "70%" }} />
                <div className="skeleton" style={{ height: 14, width: "45%" }} />
              </li>
            </ul>
          ) : assigned.length === 0 ? (
            <div className="va-empty">
              <h4>No jobs assigned yet</h4>
              <p>As soon as a customer selects your bid, you will see it here.</p>
            </div>
          ) : (
            <>
              <ul className="va-list">
                {pagedAssignedJobs.map((job) => {
                  const expanded = expandedJobId === job._id;
                  const contactName =
                    job.contactName ||
                    job.customerName ||
                    job.customer?.name ||
                    job.contact?.name ||
                    job.clientName;
                  const contactPhone =
                    job.contactPhone ||
                    job.customerPhone ||
                    job.phone ||
                    job.contact?.phone;
                  const dropoffAddress =
                    job.dropoffAddress ||
                    job.destination ||
                    job.dropoff?.address;
                  const noteText =
                    job.description ||
                    job.notes ||
                    job.customerNote ||
                    job.jobNotes;
                  const vehicleDetails = [
                    job.vehicleMake,
                    job.vehicleModel,
                    job.vehicleColor,
                  ]
                    .filter(Boolean)
                    .join(" / ");
                  const detailRows = [
                    contactName ? { label: "Contact", value: contactName } : null,
                    contactPhone ? { label: "Phone", value: String(contactPhone).trim() } : null,
                    dropoffAddress ? { label: "Dropoff", value: dropoffAddress } : null,
                    vehicleDetails ? { label: "Vehicle", value: vehicleDetails } : null,
                    noteText ? { label: "Notes", value: noteText } : null,
                  ].filter(Boolean);
                  return (
                    <li
                      key={job._id}
                      className={"va-job" + (expanded ? " va-job--expanded" : "")}
                      onClick={() => toggleJobExpansion(job._id)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onKeyDown={(event) => handleJobKeyDown(event, job._id)}
                    >
                      <div className="va-job__main">
                        <div className="va-job__header">
                          <div className="va-job__title">{job.serviceType || "Service"}</div>
                          <span className={`va-chip va-chip--status va-chip--${(job.status || "Unknown").toLowerCase()}`}>
                            {job.status || "Unknown"}
                          </span>
                        </div>
                        <p className="va-job__address">{job.pickupAddress}</p>
                        <div className="va-job__meta">
                          <span>{formatDistance(job.distanceKm)}</span>
                          <span>Assigned {timeAgo(job.created)}</span>
                        </div>
                        {expanded && detailRows.length > 0 ? (
                          <div className="va-job__details">
                            {detailRows.map((row) => (
                              <div className="va-detail" key={row.label}>
                                <span className="va-detail__label">{row.label}</span>
                                <span className="va-detail__value">{row.value}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="va-job__cta va-job__cta--stack">
                        {job.status === "Assigned" && (
                          <button
                            className="btn ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              setStatus(job._id, "OnTheWay");
                            }}
                          >
                            Mark on the way
                          </button>
                        )}
                        {job.status === "OnTheWay" && (
                          <button
                            className="btn ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              setStatus(job._id, "Arrived");
                            }}
                          >
                            Mark arrived
                          </button>
                        )}
                        {(job.status === "OnTheWay" || job.status === "Arrived") && (
                          <button
                            className="btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              setStatus(job._id, "Completed");
                            }}
                          >
                            Complete job
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {assignedPageCount > 1 ? (
                <div className="va-pagination">
                  <button
                    type="button"
                    className="va-pagination__btn"
                    onClick={() => setAssignedPage((page) => Math.max(page - 1, 0))}
                    disabled={assignedPage === 0}
                  >
                    Previous
                  </button>
                  <span className="va-pagination__indicator">
                    Page {assignedPage + 1} of {assignedPageCount}
                  </span>
                  <button
                    type="button"
                    className="va-pagination__btn"
                    onClick={() =>
                      setAssignedPage((page) => Math.min(page + 1, assignedPageCount - 1))
                    }
                    disabled={assignedPage + 1 >= assignedPageCount}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {bidSheet?.job && (
        <div className="va-sheet" role="dialog" aria-modal="true">
          <div className="va-sheet__backdrop" onClick={closeBidSheet} />
          <div className="va-sheet__card card">
            <button className="va-sheet__close" onClick={closeBidSheet} aria-label="Close">&times;</button>
            <p className="va-overline">Submit bid</p>
            <h2 className="va-sheet__title">{bidSheet.job.serviceType || "Service"}</h2>
            <p className="va-sheet__address">{bidSheet.job.pickupAddress}</p>
            <div className="va-sheet__meta">
              <span>{formatDistance(bidSheet.job.distanceKm)}</span>
              <span>
                Travel time ~
                {estimateTravelMinutes(bidSheet.job.distanceKm) || "n/a"} min
              </span>
            </div>

            <div className="va-sheet__grid">
              <div className="va-field">
                <label htmlFor="bid-eta">ETA to customer</label>
                <div className="va-input-group">
                  <input
                    id="bid-eta"
                    type="number"
                    min="5"
                    value={bidSheet.eta}
                    onChange={(e) => updateBidField("eta", e.target.value)}
                  />
                  <span className="va-input-suffix">minutes</span>
                </div>
                <div className="va-pill-row">
                  {Number.isFinite(bidSheet.suggestedEta) && (
                    <button
                      type="button"
                      className="va-pill"
                      onClick={() => updateBidField("eta", bidSheet.suggestedEta)}
                    >
                      Use suggestion ({bidSheet.suggestedEta}m)
                    </button>
                  )}
                  <button
                    type="button"
                    className="va-pill"
                    onClick={() =>
                      updateBidField(
                        "eta",
                        Math.max(5, Number(bidSheet.eta || 0) + 15)
                      )
                    }
                  >
                    +15 min buffer
                  </button>
                </div>
              </div>

              <div className="va-field">
                <label htmlFor="bid-price">Quote price</label>
                <div className="va-input-group">
                  <span className="va-input-prefix">$</span>
                  <input
                    id="bid-price"
                    type="number"
                    min="0"
                    value={bidSheet.price}
                    onChange={(e) => updateBidField("price", e.target.value)}
                  />
                </div>
                <div className="va-pill-row">
                  <button
                    type="button"
                    className="va-pill"
                    onClick={() => updateBidField("price", bidSheet.suggestedPrice)}
                  >
                    Suggested ${bidSheet.suggestedPrice}
                  </button>
                  <button
                    type="button"
                    className="va-pill"
                    onClick={() =>
                      updateBidField(
                        "price",
                        Math.max(40, Math.round(Number(bidSheet.price || 0) * 1.1))
                      )
                    }
                  >
                    Add 10%
                  </button>
                </div>
              </div>
            </div>

            {bidError && <div className="va-alert error compact">{bidError}</div>}

            <div className="va-sheet__actions">
              <button className="btn ghost" onClick={closeBidSheet} disabled={bidSubmitting}>
                Cancel
              </button>
              <button className="btn" onClick={submitBid} disabled={bidSubmitting}>
                {bidSubmitting ? "Sending..." : "Send bid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
















