import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { vendorApi } from "../lib/vendorApi";
import VendorDocumentUploader from "../components/vendor/VendorDocumentUploader";
import "./VendorProfile.css";

const defaultForm = {
  name: "",
  phone: "",
  city: "",
  baseAddress: "",
  radiusKm: "",
  services: "",
  heavyDuty: false,
  lat: "",
  lng: "",
};

const TABS = ["account", "location", "documents", "wallet"];

const vendorToForm = (vendor) => ({
  name: vendor.name || "",
  phone: vendor.phone || "",
  city: vendor.city || "",
  baseAddress: vendor.baseAddress || "",
  radiusKm:
    vendor.radiusKm === null || vendor.radiusKm === undefined
      ? ""
      : String(vendor.radiusKm),
  services: Array.isArray(vendor.services)
    ? vendor.services.join(", ")
    : vendor.services || "",
  heavyDuty: !!vendor.heavyDuty,
  lat:
    vendor.lat === null || vendor.lat === undefined
      ? ""
      : String(vendor.lat),
  lng:
    vendor.lng === null || vendor.lng === undefined
      ? ""
      : String(vendor.lng),
});

const parseServices = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const humanize = (value) =>
  (value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const requirementStatus = (requirement) => {
  const status = requirement?.status || {};
  if (status.valid) {
    return { label: "Verified", tone: "ok" };
  }
  if (status.uploaded) {
    if (status.reason === "pending_verification") {
      return { label: "Pending review", tone: "warn" };
    }
    return {
      label: humanize(status.reason || "submitted"),
      tone: "warn",
    };
  }
  return {
    label: humanize(status.reason || "missing"),
    tone: "bad",
  };
};

export default function VendorProfile() {
  const [form, setForm] = useState(defaultForm);
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingCompliance, setRefreshingCompliance] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [geoError, setGeoError] = useState("");
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    initialTab && TABS.includes(initialTab) ? initialTab : "account"
  );

  useEffect(() => {
    const param = searchParams.get("tab");
    if (param && TABS.includes(param)) {
      setActiveTab(param);
    } else if (!param) {
      setActiveTab("account");
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await vendorApi.get("/api/vendor/auth/me");
        if (cancelled) return;
        const vendorData = data?.vendor || {};
        setVendor(vendorData);
        setForm(vendorToForm(vendorData));
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
              "We couldn't load your vendor profile."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changeTab = (tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === "account") {
      next.delete("tab");
    } else {
      next.set("tab", tab);
    }
    setSearchParams(next);
  };

  const updateField = (field) => (event) => {
    const value =
      event && event.target
        ? event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value
        : event;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const fillCurrentLocation = () => {
    setGeoError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Your browser does not support location access.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        }));
      },
      (err) => {
        setGeoError(err?.message || "We couldn't read your location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );
  };

  const refreshVendorSilently = async () => {
    try {
      const { data } = await vendorApi.get("/api/vendor/auth/me");
      const vendorData = data?.vendor || {};
      setVendor(vendorData);
      setForm(vendorToForm(vendorData));
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "We couldn't refresh your vendor profile."
      );
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const latValue = form.lat === "" ? null : Number(form.lat);
      const lngValue = form.lng === "" ? null : Number(form.lng);
      if (form.lat && !Number.isFinite(latValue)) {
        throw new Error("Latitude must be a number");
      }
      if (form.lng && !Number.isFinite(lngValue)) {
        throw new Error("Longitude must be a number");
      }
      const radiusValue = form.radiusKm === "" ? null : Number(form.radiusKm);
      if (form.radiusKm && !Number.isFinite(radiusValue)) {
        throw new Error("Service radius must be a number");
      }

      const payload = {
        name: form.name.trim() || undefined,
        city: form.city.trim() || undefined,
        baseAddress: form.baseAddress.trim() || undefined,
        heavyDuty: !!form.heavyDuty,
        services: parseServices(form.services),
        radiusKm: radiusValue === null ? undefined : radiusValue,
        lat: latValue === null ? undefined : latValue,
        lng: lngValue === null ? undefined : lngValue,
      };

      await vendorApi.patch("/api/vendor/auth/profile", payload);
      await refreshVendorSilently();
      setMessage("Profile updated successfully.");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshCompliance = async () => {
    setRefreshingCompliance(true);
    await refreshVendorSilently();
    setRefreshingCompliance(false);
    setMessage("Compliance status refreshed.");
    setError("");
  };
  const handleDocumentUploaded = async (successMessage) => {
    await refreshVendorSilently();
    setMessage(successMessage || "Document uploaded for review.");
    setError("");
  };

  const notes = useMemo(() => {
    const warnings = [];
    if (!form.lat || !form.lng) {
      warnings.push("Add latitude and longitude to unlock map routing.");
    }
    if (!form.baseAddress) {
      warnings.push("Set a base address so customers know where you operate.");
    }
    return warnings;
  }, [form.baseAddress, form.lat, form.lng]);

  const compliance = useMemo(() => {
    if (!vendor) return null;
    const base = vendor.compliance || {};
    return {
      allowed: base.allowed === true,
      status: base.status || vendor.complianceStatus || "pending",
      missing: Array.isArray(base.missing) ? base.missing : [],
      requirements: Array.isArray(base.requirements) ? base.requirements : [],
      enforcement: base.enforcement || "submission",
      lastCheckedAt: base.lastCheckedAt || null,
    };
  }, [vendor]);

  const outstandingCount = compliance ? compliance.missing.length : 0;
  const complianceStatusLabel = humanize(compliance?.status || "pending");
  const complianceTone = compliance?.allowed ? "ok" : "warn";
  const lastCheckedLabel = compliance?.lastCheckedAt
    ? new Date(compliance.lastCheckedAt).toLocaleString()
    : "Not checked yet";

  const requirements = compliance?.requirements || [];
  const missingDocs = compliance?.missing || [];

  const supportEmail = "localgmboss@gmail.com";
  const supportPhoneTel = "+15551234567";
  const supportPhoneLabel = "+1 (555) 123-4567";

  if (loading) {
    return (
      <div className="vendor-profile">
        <div className="vendor-profile__shell card">
          <h1>Loading profile.</h1>
          <p className="muted">Fetching your vendor details.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "account", label: "Account" },
    { id: "location", label: "Location" },
    { id: "documents", label: "Documents" },
    { id: "wallet", label: "Wallet" },
  ];

  return (
    <div className="vendor-profile">
      <div className="vendor-profile__shell card">
        <header className="vendor-profile__header">
          <div>
            <p className="eyebrow">Vendor settings</p>
            <h1>Update your profile</h1>
            <p className="vendor-profile__subtitle">
              Keep your contact info, service coverage, and location up to date so dispatch can route jobs accurately.
            </p>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => nav("/vendor/app")}
          >
            Back to dashboard
          </button>
        </header>

        {(error || message || geoError) && (
          <div className="vendor-profile__alerts">
            {message && <div className="alert success">{message}</div>}
            {error && <div className="alert error">{error}</div>}
            {geoError && <div className="alert warning">{geoError}</div>}
          </div>
        )}

        <nav className="vendor-profile__tabs" role="tablist" aria-label="Profile sections">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`vendor-tab-${tab.id}-btn`}
                aria-controls={`vendor-tab-${tab.id}`}
                aria-selected={isActive}
                className={`vendor-profile__tab${isActive ? " is-active" : ""}`}
                onClick={() => changeTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="vendor-profile__panels">
          <form
            className="vendor-profile__panel"
            role="tabpanel"
            id="vendor-tab-account"
            aria-labelledby="vendor-tab-account-btn"
            hidden={activeTab !== "account"}
            onSubmit={handleSaveProfile}
          >
            <section className="vendor-profile__section">
              <div className="vendor-profile__section-head">
                <h2>Business details</h2>
                <p>Update the name customers see and confirm your contact number.</p>
              </div>
              <div className="grid two">
                <label className="field">
                  <span className="field-label">Business name</span>
                  <input
                    value={form.name}
                    onChange={updateField("name")}
                    placeholder="e.g. Tow Masters"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Phone number</span>
                  <input value={form.phone} readOnly className="field--readonly" />
                  <span className="field-hint">
                    Reach out to support if you need to change your login number.
                  </span>
                </label>
              </div>
            </section>

            <section className="vendor-profile__section">
              <div className="vendor-profile__section-head">
                <h2>Services</h2>
                <p>Tell dispatch what you offer and how far you travel.</p>
              </div>
              <div className="grid two">
                <label className="field">
                  <span className="field-label">Service radius (km)</span>
                  <input
                    value={form.radiusKm}
                    onChange={updateField("radiusKm")}
                    placeholder="25"
                    inputMode="decimal"
                  />
                </label>
                <label className="field field--checkbox">
                  <input
                    type="checkbox"
                    checked={form.heavyDuty}
                    onChange={updateField("heavyDuty")}
                  />
                  <span>We offer heavy-duty service</span>
                </label>
              </div>
              <label className="field">
                <span className="field-label">Services (comma separated)</span>
                <textarea
                  value={form.services}
                  onChange={updateField("services")}
                  rows={3}
                  placeholder="Towing, Jump start, Tire change"
                />
              </label>
            </section>

            <div className="vendor-profile__placeholder-card">
              <h3>Profile photo</h3>
              <p>Profile photos are coming soon. Have a clean logo ready and we will notify you once uploads open.</p>
            </div>

            <div className="vendor-profile__actions">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "Saving..." : "Save account settings"}
              </button>
            </div>
          </form>

          <form
            className="vendor-profile__panel"
            role="tabpanel"
            id="vendor-tab-location"
            aria-labelledby="vendor-tab-location-btn"
            hidden={activeTab !== "location"}
            onSubmit={handleSaveProfile}
          >
            <section className="vendor-profile__section">
              <div className="vendor-profile__section-head vendor-profile__section-head--with-action">
                <div>
                  <h2>Service area</h2>
                  <p>Set where jobs should originate and keep your map location current.</p>
                </div>
                <button type="button" className="btn secondary" onClick={fillCurrentLocation}>
                  Use my current location
                </button>
              </div>
              <div className="grid two">
                <label className="field">
                  <span className="field-label">Primary city</span>
                  <input
                    value={form.city}
                    onChange={updateField("city")}
                    placeholder="Operating city"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Base address</span>
                  <input
                    value={form.baseAddress}
                    onChange={updateField("baseAddress")}
                    placeholder="123 Main St, Springfield"
                  />
                </label>
              </div>
              <div className="grid two">
                <label className="field">
                  <span className="field-label">Latitude</span>
                  <input
                    value={form.lat}
                    onChange={updateField("lat")}
                    placeholder="33.7490"
                    inputMode="decimal"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Longitude</span>
                  <input
                    value={form.lng}
                    onChange={updateField("lng")}
                    placeholder="-84.3880"
                    inputMode="decimal"
                  />
                </label>
              </div>
              {notes.length > 0 && (
                <div className="vendor-profile__notes">
                  {notes.map((note) => (
                    <div key={note} className="note">
                      {note}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="vendor-profile__actions">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "Saving..." : "Save location"}
              </button>
            </div>
          </form>

          <section
            className="vendor-profile__panel vendor-docs"
            role="tabpanel"
            id="vendor-tab-documents"
            aria-labelledby="vendor-tab-documents-btn"
            hidden={activeTab !== "documents"}
          >
            <header className="vendor-profile__section-head">
              <h2>Compliance overview</h2>
              <p>Submit the required documents to keep receiving jobs without interruption.</p>
            </header>
            <div className={`vendor-docs__summary vendor-docs__summary--${complianceTone}`}>
              <span className={`vendor-docs__status vendor-docs__status--${complianceTone}`}>
                {complianceStatusLabel}
              </span>
              <span className="vendor-docs__meta">
                {outstandingCount > 0
                  ? `${outstandingCount} outstanding document${outstandingCount > 1 ? "s" : ""}`
                  : "All required documents are on file"}
              </span>
              <span className="vendor-docs__meta">Enforcement: {humanize(compliance?.enforcement || "submission")}</span>
              <span className="vendor-docs__meta">Last checked: {lastCheckedLabel}</span>
            </div>

            {missingDocs.length > 0 && (
              <div className="vendor-docs__callout">
                <h3>Next steps</h3>
                <ul>
                  {missingDocs.map((doc) => (
                    <li key={doc.key || doc.label}>{humanize(doc.reason || "missing")} - {doc.label || doc.key}</li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="vendor-docs__list">
              {requirements.length === 0 ? (
                <li className="vendor-docs__empty">Compliance requirements will appear here once configured by the admin team.</li>
              ) : (
                requirements.map((req) => {
                  const status = requirementStatus(req);
                  const existingDoc = req.document || null;
                  return (
                    <li key={req.key || req.label} className="vendor-docs__item">
                      <div className="vendor-docs__item-head">
                        <h4>{req.label || humanize(req.key)}</h4>
                        <span className={`vendor-docs__badge vendor-docs__badge--${status.tone}`}>
                          {status.label}
                        </span>
                      </div>
                      {req.description && <p className="vendor-docs__item-copy">{req.description}</p>}
                      <div className="vendor-docs__item-meta">
                        <span>Accepts: {Array.isArray(req.accepts) ? req.accepts.join(", ") : "PDF, JPG, PNG"}</span>
                        {req.expires && req.validityDays ? (
                          <span>Expires every {req.validityDays} days</span>
                        ) : (
                          <span>No expiry</span>
                        )}
                        {existingDoc?.metadata?.documentNumber && (
                          <span>Document #: {existingDoc.metadata.documentNumber}</span>
                        )}
                        {existingDoc?.expiresAt && (
                          <span>Valid until {new Date(existingDoc.expiresAt).toLocaleDateString()}</span>
                        )}
                      </div>
                      <VendorDocumentUploader
                        requirement={req}
                        existingDocument={existingDoc}
                        onUploaded={handleDocumentUploaded}
                      />
                    </li>
                  );
                })
              )}
            </ul>

            <div className="vendor-docs__actions">
              <button
                type="button"
                className="btn secondary"
                onClick={handleRefreshCompliance}
                disabled={refreshingCompliance}
              >
                {refreshingCompliance ? "Refreshing..." : "Refresh status"}
              </button>
              <a className="btn ghost" href={`mailto:${supportEmail}`}>
                Email support
              </a>
            </div>
          </section>

          <section
            className="vendor-profile__panel vendor-wallet"
            role="tabpanel"
            id="vendor-tab-wallet"
            aria-labelledby="vendor-tab-wallet-btn"
            hidden={activeTab !== "wallet"}
          >
            <header className="vendor-profile__section-head">
              <h2>Payout preferences</h2>
              <p>We are rolling out in-app payout management soon.</p>
            </header>
            <div className="vendor-wallet__card">
              <p>
                Until then, reach out to our operations team to link or update your bank details for payouts.
              </p>
              <div className="vendor-wallet__actions">
                <a className="btn secondary" href={`mailto:${supportEmail}`}>
                  Email support
                </a>
                <a className="btn ghost" href={`tel:${supportPhoneTel}`}>
                  Call {supportPhoneLabel}
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}








