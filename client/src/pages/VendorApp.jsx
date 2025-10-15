import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { vendorApi } from "../lib/vendorApi";
import { useNotifications } from "../contexts/NotificationsContext";
import VendorHeroHeader from "../components/vendor/VendorHeroHeader";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { getGoogleMapsKey } from "../config/env.js";
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

const deriveVendorCoordinates = (vendor) => {
  const lat = toFiniteNumber(vendor?.lat ?? vendor?.location?.lat);
  const lng = toFiniteNumber(vendor?.lng ?? vendor?.location?.lng);
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

function normalizeMultiline(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();
}
function extractNote(job) {
  const raw =
    job?.description ||
    job?.notes ||
    job?.customerNote ||
    job?.jobNotes ||
    job?.internalNotes;
  return normalizeMultiline(raw);
}
const GEO_PROMPT_STORAGE_KEY = "va.geoPrompt.dismissed";

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

  const { publish } = useNotifications();

  const nav = useNavigate();
  const pollRef = useRef(null);
  const openJobsSnapshotRef = useRef(new Map());
  const openJobsInitializedRef = useRef(false);
  const assignedSnapshotRef = useRef(new Map());
  const assignedInitializedRef = useRef(false);
  const alertsSnapshotRef = useRef(new Set());
  const [geoPromptDismissed, setGeoPromptDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(GEO_PROMPT_STORAGE_KEY) === "1";
    } catch (error) {
      return false;
    }
  });
  const vendorCoordinates = useMemo(() => deriveVendorCoordinates(me), [me]);
  const [activeTab, setActiveTab] = useState("open");
  const [openPage, setOpenPage] = useState(0);
  const [assignedPage, setAssignedPage] = useState(0);
  const [expandedJobId, setExpandedJobId] = useState(null);
  const [noteTranslations, setNoteTranslations] = useState({});
  const [jobRouteSummaries, setJobRouteSummaries] = useState({});
  const mapsKey = getGoogleMapsKey();
  const hasGoogle = Boolean(mapsKey);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");

  const handleToggleNoteLanguage = async (event, job) => {
    event?.stopPropagation?.();
    const noteText = extractNote(job);
    if (!noteText) return;
    const current = noteTranslations[job._id];
    if (current?.mode === "es") {
      setNoteTranslations((prev) => ({
        ...prev,
        [job._id]: { ...current, mode: "en" },
      }));
      return;
    }
    if (current?.text && current.status === "ready") {
      setNoteTranslations((prev) => ({
        ...prev,
        [job._id]: { ...current, mode: "es" },
      }));
      return;
    }
    setNoteTranslations((prev) => ({
      ...prev,
      [job._id]: { status: "loading", mode: "loading", original: noteText },
    }));
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        noteText
      )}&langpair=en|es`;
      const response = await fetch(url);
      const data = await response.json();
      const translated = data?.responseData?.translatedText;
      if (!translated) throw new Error("Translation unavailable");
      setNoteTranslations((prev) => ({
        ...prev,
        [job._id]: {
          status: "ready",
          mode: "es",
          text: translated,
          original: noteText,
        },
      }));
    } catch (error) {
      setNoteTranslations((prev) => ({
        ...prev,
        [job._id]: {
          status: "error",
          mode: "en",
          error: error?.message || "Translation failed",
          original: noteText,
        },
      }));
    }
  };

  const resolveNoteDisplay = (jobId, original) => {
    const entry = noteTranslations[jobId];
    if (!entry) {
      return { text: original, mode: "en", status: "idle" };
    }
    if (entry.mode === "es" && entry.status === "ready" && entry.text) {
      return { text: entry.text, mode: "es", status: "ready" };
    }
    if (entry.status === "loading") {
      return { text: original, mode: "loading", status: "loading" };
    }
    if (entry.status === "error") {
      return {
        text: original,
        mode: "error",
        status: "error",
        error: entry.error,
      };
    }
    return {
      text: original,
      mode: entry.mode === "es" ? "es" : "en",
      status: entry.status || "idle",
    };
  };

  const load = async () => {
    try {
      setErr("");
      setLoading(true);

      const meReq = vendorApi.get("/api/vendor/auth/me");
      const openReq = vendorApi.get(
        `/api/vendor/feed/open${cityFilter ? "?city=1" : ""}`
      );
      const assignedReq = vendorApi.get("/api/vendor/feed/assigned");
      const alertsReq = vendorApi.get("/api/vendor/feed/alerts");

      const [m, o, a, alertsResp] = await Promise.all([
        meReq,
        openReq,
        assignedReq,
        alertsReq,
      ]);

      const vendorProfile = m?.data?.vendor || {};
      const vendorLat = toFiniteNumber(vendorProfile.lat);
      const vendorLng = toFiniteNumber(vendorProfile.lng);

      setMe(vendorProfile);
      setOpenJobs(enrichJobsWithDistance(o.data || [], vendorLat, vendorLng));
      setAssigned(enrichJobsWithDistance(a.data || [], vendorLat, vendorLng));
      setLastUpdated(new Date());

      const alerts = Array.isArray(alertsResp?.data) ? alertsResp.data : [];
      if (alerts.length > 0) {
        alerts.forEach((alert) => {
          if (!alert || typeof alert !== "object") return;
          const alertId =
            alert.id || alert._id || alert.meta?.dedupeKey || null;
          if (!alertId) return;
          if (alertsSnapshotRef.current.has(alertId)) return;
          alertsSnapshotRef.current.add(alertId);
          if (alertsSnapshotRef.current.size > 200) {
            const trimmed = Array.from(alertsSnapshotRef.current).slice(-120);
            alertsSnapshotRef.current = new Set(trimmed);
          }

          const meta =
            alert.meta && typeof alert.meta === "object"
              ? { ...alert.meta }
              : {};
          if (!meta.role) meta.role = "vendor";
          if (!meta.kind) meta.kind = "ping";
          if (!meta.route) meta.route = "/vendor/app";
          if (!meta.jobId && alert.jobId) meta.jobId = alert.jobId;

          publish({
            id: alertId,
            title: alert.title || "Dispatch alert",
            body: alert.body || "",
            severity: alert.severity || "info",
            createdAt: alert.createdAt || new Date().toISOString(),
            meta,
            dedupeKey:
              typeof meta.dedupeKey === "string"
                ? meta.dedupeKey
                : `vendor:alert:${alertId}`,
          });
        });
      }
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
        const etaLabel =
          job.etaMinutes || job.vendorEtaMinutes || job.suggestedEtaMinutes;
        let body;
        if (job.status === "OnTheWay") {
          body = etaLabel
            ? `You're en route. Target arrival in ${etaLabel} minutes.`
            : "You're marked as en route to the customer.";
        } else if (job.status === "Arrived") {
          body = "Marked on-site with the customer.";
        } else if (job.status === "Completed") {
          body = "Job marked complete. Don't forget to close out paperwork.";
        } else {
          body = job.serviceType
            ? `${job.serviceType} is now ${job.status}.`
            : `Assigned job status changed to ${job.status}.`;
        }
        publish({
          title: `${job.serviceType || "Job"}: ${job.status}`,
          body,
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

  const openPageCount = Math.max(
    1,
    Math.ceil(openJobs.length / OPEN_PAGE_SIZE)
  );
  const assignedPageCount = Math.max(
    1,
    Math.ceil(assigned.length / ASSIGNED_PAGE_SIZE)
  );
  const openSliceStart = openPage * OPEN_PAGE_SIZE;
  const openSliceEnd = Math.min(
    openJobs.length,
    openSliceStart + OPEN_PAGE_SIZE
  );
  const assignedSliceStart = assignedPage * ASSIGNED_PAGE_SIZE;
  const assignedSliceEnd = Math.min(
    assigned.length,
    assignedSliceStart + ASSIGNED_PAGE_SIZE
  );
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
      : `Showing ${assignedSliceStart + 1}-${assignedSliceEnd} of ${
          assigned.length
        }`;

  useEffect(() => {
    setOpenPage((page) => Math.min(page, Math.max(0, openPageCount - 1)));
  }, [openPageCount]);

  useEffect(() => {
    setAssignedPage((page) =>
      Math.min(page, Math.max(0, assignedPageCount - 1))
    );
  }, [assignedPageCount]);

  useEffect(() => {
    setExpandedJobId(null);
    if (activeTab === "open") {
      setAssignedPage(0);
    } else {
      setOpenPage(0);
    }
  }, [activeTab]);

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
  const showGeoPrompt = !hasGeo && !geoPromptDismissed;

  const requestLocationAccess = () => {
    if (requestingLocation) return;
    setLocationError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Location access is not supported in this browser.");
      return;
    }
    setRequestingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        try {
          await vendorApi.patch("/api/vendor/auth/profile", {
            lat,
            lng,
          });
          setLocationError("");
          await load();
        } catch (error) {
          setLocationError(
            error?.response?.data?.message ||
              error?.message ||
              "We couldn't save your location. Try again."
          );
        } finally {
          setRequestingLocation(false);
        }
      },
      (error) => {
        setLocationError(
          error?.message ||
            "We couldn't read your location. Check your permission settings and try again."
        );
        setRequestingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  useEffect(() => {
    if (!hasGeo) {
      return;
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(GEO_PROMPT_STORAGE_KEY);
      } catch (error) {}
    }
    if (geoPromptDismissed) {
      setGeoPromptDismissed(false);
    }
  }, [hasGeo, geoPromptDismissed]);

  const toggleJobExpansion = (jobId) => {
    setExpandedJobId((current) => (current === jobId ? null : jobId));
  };

  const handleJobKeyDown = (event, jobId) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleJobExpansion(jobId);
    }
  };

  const dismissGeoPrompt = () => {
    setGeoPromptDismissed(true);
    setLocationError("");
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(GEO_PROMPT_STORAGE_KEY, "1");
      } catch (error) {}
    }
  };

  const handleJobRouteResult = useCallback((jobId, result) => {
    if (!jobId) return;
    setJobRouteSummaries((prev) => {
      if (!result?.routes?.length) {
        if (!prev[jobId]) return prev;
        const next = { ...prev };
        delete next[jobId];
        return next;
      }
      const leg = result.routes?.[0]?.legs?.[0];
      const nextEntry = {
        distanceText: leg?.distance?.text || null,
        durationText: leg?.duration?.text || null,
        distanceMeters: Number.isFinite(leg?.distance?.value)
          ? leg.distance.value
          : null,
      };
      const prevEntry = prev[jobId];
      if (
        prevEntry &&
        prevEntry.distanceText === nextEntry.distanceText &&
        prevEntry.durationText === nextEntry.durationText &&
        prevEntry.distanceMeters === nextEntry.distanceMeters
      ) {
        return prev;
      }
      return { ...prev, [jobId]: nextEntry };
    });
  }, []);

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

  const lastSyncLabel = lastUpdated ? timeAgo(lastUpdated) : "not yet";

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
      <VendorHeroHeader
        vendorName={me?.name}
        lastSyncLabel={lastSyncLabel}
        showGeoPrompt={showGeoPrompt}
        onDismissGeoPrompt={dismissGeoPrompt}
        onRequestLocation={requestLocationAccess}
        requestingLocation={requestingLocation}
        locationError={locationError}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={setAutoRefresh}
        cityFilter={cityFilter}
        onToggleCityFilter={setCityFilter}
      />

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

      <section className="va-workflows">
        <div className="va-tabs" role="tablist" aria-label="Job views">
          <button
            type="button"
            role="tab"
            id="va-tab-open-btn"
            aria-controls="va-tab-open"
            aria-selected={activeTab === "open"}
            tabIndex={activeTab === "open" ? 0 : -1}
            className={"va-tab" + (activeTab === "open" ? " is-active" : "")}
            onClick={() => setActiveTab("open")}
          >
            Open jobs ({openJobs.length})
          </button>
          <button
            type="button"
            role="tab"
            id="va-tab-assigned-btn"
            aria-controls="va-tab-assigned"
            aria-selected={activeTab === "assigned"}
            tabIndex={activeTab === "assigned" ? 0 : -1}
            className={
              "va-tab" + (activeTab === "assigned" ? " is-active" : "")
            }
            onClick={() => setActiveTab("assigned")}
          >
            Assigned ({assigned.length})
          </button>
        </div>
        <div className="va-tabpanels">
          <div
            className="va-panel card"
            role="tabpanel"
            id="va-tab-open"
            aria-labelledby="va-tab-open-btn"
            hidden={activeTab !== "open"}
          >
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
                    <div
                      className="skeleton"
                      style={{ height: 16, width: "76%" }}
                    />
                    <div
                      className="skeleton"
                      style={{ height: 14, width: "50%" }}
                    />
                  </li>
                ))}
              </ul>
            ) : openJobs.length === 0 ? (
              <div className="va-empty">
                <h4>No open jobs right now</h4>
                <p>
                  Leave the app open and we will refresh automatically for you.
                </p>
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
                    const noteText = extractNote(job);
                    const noteDisplay = noteText
                      ? resolveNoteDisplay(job._id, noteText)
                      : null;
                    const vehicleDetails = [
                      job.vehicleMake,
                      job.vehicleModel,
                      job.vehicleColor,
                    ]
                      .filter(Boolean)
                      .join(" / ");
                    const detailRows = [
                      contactName
                        ? { label: "Contact", value: contactName }
                        : null,
                      contactPhone
                        ? { label: "Phone", value: String(contactPhone).trim() }
                        : null,
                      dropoffAddress
                        ? { label: "Dropoff", value: dropoffAddress }
                        : null,
                      vehicleDetails
                        ? { label: "Vehicle", value: vehicleDetails }
                        : null,
                      noteText
                        ? {
                            label: "Notes",
                            value: noteDisplay?.text || noteText,
                            isNote: true,
                            noteStatus: noteDisplay?.status || "idle",
                            noteMode: noteDisplay?.mode || "en",
                            noteError: noteDisplay?.error,
                          }
                        : null,
                    ].filter(Boolean);
                    return (
                      <li
                        key={job._id}
                        className={
                          "va-job" + (expanded ? " va-job--expanded" : "")
                        }
                        onClick={() => toggleJobExpansion(job._id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        onKeyDown={(event) => handleJobKeyDown(event, job._id)}
                      >
                        <div className="va-job__main">
                          <div className="va-job__header">
                            <div className="va-job__title">
                              {job.serviceType || "Service"}
                            </div>
                            <div className="va-chip-group">
                              {job.heavyDuty && (
                                <span className="va-chip va-chip--heavy">
                                  Heavy duty
                                </span>
                              )}
                              {job.bidMode === "fixed" && (
                                <span
                                  className={`va-chip va-chip--mode ${job.bidMode}`}
                                >
                                  Fixed price
                                </span>
                              )}
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
                                  <span className="va-detail__label">
                                    {row.label}
                                  </span>
                                  <span className="va-detail__value">
                                    {row.value}
                                  </span>
                                  {row.isNote && (
                                    <div className="va-detail__actions">
                                      <button
                                        type="button"
                                        className="va-note-toggle"
                                        onClick={(event) =>
                                          handleToggleNoteLanguage(event, job)
                                        }
                                        disabled={row.noteStatus === "loading"}
                                      >
                                        {row.noteStatus === "loading"
                                          ? "Translating..."
                                          : row.noteMode === "es"
                                          ? "View original"
                                          : "Translate to Spanish"}
                                      </button>
                                      {row.noteStatus === "error" && (
                                        <span className="va-note-error">
                                          {row.noteError || "Translation failed"}
                                        </span>
                                      )}
                                    </div>
                                  )}
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
                      onClick={() =>
                        setOpenPage((page) => Math.max(page - 1, 0))
                      }
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
                        setOpenPage((page) =>
                          Math.min(page + 1, openPageCount - 1)
                        )
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

          <div
            className="va-panel card"
            role="tabpanel"
            id="va-tab-assigned"
            aria-labelledby="va-tab-assigned-btn"
            hidden={activeTab !== "assigned"}
          >
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
                  <div
                    className="skeleton"
                    style={{ height: 16, width: "70%" }}
                  />
                  <div
                    className="skeleton"
                    style={{ height: 14, width: "45%" }}
                  />
                </li>
              </ul>
            ) : assigned.length === 0 ? (
              <div className="va-empty">
                <h4>No jobs assigned yet</h4>
                <p>
                  As soon as a customer selects your bid, you will see it here.
                </p>
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
                    const noteText = extractNote(job);
                    const noteDisplay = noteText
                      ? resolveNoteDisplay(job._id, noteText)
                      : null;
                    const vehicleDetails = [
                      job.vehicleMake,
                      job.vehicleModel,
                      job.vehicleColor,
                    ]
                      .filter(Boolean)
                      .join(" / ");
                    const travelMinutes = estimateTravelMinutes(job.distanceKm);
                    const pickupCoords = derivePickupCoordinates(job);
                    const routeFallbackCopy = !vendorCoordinates
                      ? "Add your base location in your vendor profile to unlock turn-by-turn directions."
                      : !pickupCoords
                      ? "Waiting on the customer to share a precise pickup coordinate."
                      : "Route preview is unavailable right now.";
                    const mapsLink = pickupCoords
                      ? `https://www.google.com/maps/dir/?api=1${
                          vendorCoordinates
                            ? `&origin=${vendorCoordinates.lat},${vendorCoordinates.lng}`
                            : ""
                        }&destination=${pickupCoords.lat},${pickupCoords.lng}`
                      : null;
                    const detailRows = [
                      contactName
                        ? { label: "Contact", value: contactName }
                        : null,
                      contactPhone
                        ? { label: "Phone", value: String(contactPhone).trim() }
                        : null,
                      dropoffAddress
                        ? { label: "Dropoff", value: dropoffAddress }
                        : null,
                      vehicleDetails
                        ? { label: "Vehicle", value: vehicleDetails }
                        : null,
                      noteText
                        ? {
                            label: "Notes",
                            value: noteDisplay?.text || noteText,
                            isNote: true,
                            noteStatus: noteDisplay?.status || "idle",
                            noteMode: noteDisplay?.mode || "en",
                            noteError: noteDisplay?.error,
                          }
                        : null,
                    ].filter(Boolean);
                    const statusLabel =
                      (job.status && String(job.status).trim()) || "Unassigned";
                    const statusClass = statusLabel
                      .toLowerCase()
                      .replace(/\s+/g, "");
                    const jobRouteSummary = jobRouteSummaries[job._id] || null;
                    const routeDistanceText =
                      jobRouteSummary?.distanceText ||
                      (Number.isFinite(job.distanceKm)
                        ? formatDistance(job.distanceKm)
                        : null);
                    const routeDurationText =
                      jobRouteSummary?.durationText ||
                      (travelMinutes ? `${travelMinutes} min` : null);
                    const routeMetaText =
                      routeDistanceText && routeDurationText
                        ? `${routeDistanceText} \u2022 ${routeDurationText}`
                        : routeDistanceText ||
                          routeDurationText ||
                          routeFallbackCopy;
                    return (
                      <li
                        key={job._id}
                        className={
                          "va-job" + (expanded ? " va-job--expanded" : "")
                        }
                        onClick={() => toggleJobExpansion(job._id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        onKeyDown={(event) => handleJobKeyDown(event, job._id)}
                      >
                        <div className="va-job__main">
                          <div className="va-job__header">
                            <div className="va-job__title">
                              {job.serviceType || "Service"}
                            </div>
                            <span
                              className={`va-chip va-chip--status va-chip--${statusClass}`}
                            >
                              {statusLabel}
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
                                  <span className="va-detail__label">
                                    {row.label}
                                  </span>
                                  <span className="va-detail__value">
                                    {row.value}
                                  </span>
                                  {row.isNote && (
                                    <div className="va-detail__actions">
                                      <button
                                        type="button"
                                        className="va-note-toggle"
                                        onClick={(event) =>
                                          handleToggleNoteLanguage(event, job)
                                        }
                                        disabled={row.noteStatus === "loading"}
                                      >
                                        {row.noteStatus === "loading"
                                          ? "Translating..."
                                          : row.noteMode === "es"
                                          ? "View original"
                                          : "Translate to Spanish"}
                                      </button>
                                      {row.noteStatus === "error" && (
                                        <span className="va-note-error">
                                          {row.noteError || "Translation failed"}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {expanded ? (
                            vendorCoordinates && pickupCoords ? (
                              <div className="va-job__map">
                                <div className="va-job__map-meta">
                                  <span>{routeMetaText}</span>
                                  {mapsLink && (
                                    <a
                                      href={mapsLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="va-job__map-button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                      }}
                                    >
                                      Open in Google Maps
                                      <span aria-hidden="true">&rarr;</span>
                                    </a>
                                  )}
                                </div>
                                <div className="va-job__map-canvas">
                                  {hasGoogle ? (
                                    <GMap
                                      vendors={[
                                        {
                                          lat: vendorCoordinates.lat,
                                          lng: vendorCoordinates.lng,
                                          label: "YOU",
                                          name: me?.name || "You",
                                        },
                                      ]}
                                      destination={{
                                        position: pickupCoords,
                                        label: "JOB",
                                        role: "pickup",
                                        title:
                                          job.pickupAddress || "Pickup",
                                        color: "#f97316",
                                        textColor: "#0f172a",
                                      }}
                                      showRoute
                                      zoom={13}
                                      onRouteResult={(result) =>
                                        handleJobRouteResult(job._id, result)
                                      }
                                    />
                                  ) : (
                                    <LiveMap
                                      drivers={[
                                        {
                                          _id: "me",
                                          lat: vendorCoordinates.lat,
                                          lng: vendorCoordinates.lng,
                                          name: me?.name || "You",
                                        },
                                      ]}
                                      destination={pickupCoords}
                                      showRoute
                                      autoFit
                                      routeDistanceMeters={
                                        jobRouteSummary?.distanceMeters ??
                                        (Number.isFinite(job.distanceKm)
                                          ? job.distanceKm * 1000
                                          : null)
                                      }
                                    />
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="va-job__map-placeholder">
                                {routeFallbackCopy}
                              </div>
                            )
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
                          {(job.status === "OnTheWay" ||
                            job.status === "Arrived") && (
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
                      onClick={() =>
                        setAssignedPage((page) => Math.max(page - 1, 0))
                      }
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
                        setAssignedPage((page) =>
                          Math.min(page + 1, assignedPageCount - 1)
                        )
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
        </div>
      </section>

      <footer className="va-support card" role="contentinfo">
        <p className="va-support__title">Need assistance?</p>
        <p className="va-support__copy">
          Call our dispatch team at{" "}
          <a className="va-support__phone" href="tel:+18883623743">
            1 (888) 362-3743
          </a>
        </p>
      </footer>

      {bidSheet?.job && (
        <div className="va-sheet" role="dialog" aria-modal="true">
          <div className="va-sheet__backdrop" onClick={closeBidSheet} />
          <div className="va-sheet__card card">
            <button
              className="va-sheet__close"
              onClick={closeBidSheet}
              aria-label="Close"
            >
              &times;
            </button>
            <p className="va-overline">Submit bid</p>
            <h2 className="va-sheet__title">
              {bidSheet.job.serviceType || "Service"}
            </h2>
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
                      onClick={() =>
                        updateBidField("eta", bidSheet.suggestedEta)
                      }
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
                    onClick={() =>
                      updateBidField("price", bidSheet.suggestedPrice)
                    }
                  >
                    Suggested ${bidSheet.suggestedPrice}
                  </button>
                  <button
                    type="button"
                    className="va-pill"
                    onClick={() =>
                      updateBidField(
                        "price",
                        Math.max(
                          40,
                          Math.round(Number(bidSheet.price || 0) * 1.1)
                        )
                      )
                    }
                  >
                    Add 10%
                  </button>
                </div>
              </div>
            </div>

            {bidError && (
              <div className="va-alert error compact">{bidError}</div>
            )}

            <div className="va-sheet__actions">
              <button
                className="btn ghost"
                onClick={closeBidSheet}
                disabled={bidSubmitting}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={submitBid}
                disabled={bidSubmitting}
              >
                {bidSubmitting ? "Sending..." : "Send bid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}












