import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { vendorApi } from "../lib/vendorApi";
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

const parseServices = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export default function VendorProfile() {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [geoError, setGeoError] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await vendorApi.get("/api/vendor/auth/me");
        if (cancelled) return;
        const vendor = data?.vendor || {};
        setForm({
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
        setError("");
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            "We couldn't load your vendor profile."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const updateField = (field) => (event) => {
    const value =
      event && event.target ? (event.target.type === "checkbox" ? event.target.checked : event.target.value) : event;
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

  const handleSubmit = async (event) => {
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
      setMessage("Profile updated successfully.");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="vendor-profile">
        <div className="vendor-profile__shell card">
          <h1>Loading profile…</h1>
          <p className="muted">Fetching your vendor details.</p>
        </div>
      </div>
    );
  }

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
          <button type="button" className="btn ghost" onClick={() => nav("/vendor/app")}>Back to dashboard</button>
        </header>

        {(error || message || geoError) && (
          <div className="vendor-profile__alerts">
            {message && <div className="alert success">{message}</div>}
            {error && <div className="alert error">{error}</div>}
            {geoError && <div className="alert warning">{geoError}</div>}
          </div>
        )}

        {notes.length > 0 && (
          <div className="vendor-profile__notes">
            {notes.map((note) => (
              <div key={note} className="note">
                {note}
              </div>
            ))}
          </div>
        )}

        <form className="vendor-profile__form" onSubmit={handleSubmit}>
          <section>
            <h2>Contact</h2>
            <div className="grid two">
              <label className="field">
                <span className="field-label">Business name</span>
                <input value={form.name} onChange={updateField("name") } placeholder="e.g. Tow Masters" />
              </label>
              <label className="field">
                <span className="field-label">Phone number</span>
                <input value={form.phone} readOnly className="field--readonly" />
                <span className="field-hint">Reach out to support to change your login number.</span>
              </label>
            </div>
            <div className="grid two">
              <label className="field">
                <span className="field-label">City</span>
                <input value={form.city} onChange={updateField("city")} placeholder="Operating city" />
              </label>
              <label className="field">
                <span className="field-label">Base address</span>
                <input value={form.baseAddress} onChange={updateField("baseAddress")} placeholder="123 Main St, Springfield" />
              </label>
            </div>
          </section>

          <section>
            <h2>Coverage & services</h2>
            <div className="grid two">
              <label className="field">
                <span className="field-label">Service radius (km)</span>
                <input value={form.radiusKm} onChange={updateField("radiusKm")} placeholder="25" inputMode="decimal" />
              </label>
              <label className="field field--checkbox">
                <input type="checkbox" checked={form.heavyDuty} onChange={updateField("heavyDuty")} />
                <span>We offer heavy-duty service</span>
              </label>
            </div>
            <label className="field">
              <span className="field-label">Services (comma separated)</span>
              <textarea value={form.services} onChange={updateField("services")} rows={3} placeholder="Towing, Jump start, Tire change" />
            </label>
          </section>

          <section>
            <div className="section-header">
              <h2>Map location</h2>
              <button type="button" className="btn secondary" onClick={fillCurrentLocation}>
                Use my current location
              </button>
            </div>
            <p className="muted small">
              We use latitude and longitude to calculate distance to jobs and show turn-by-turn routes in your dashboard.
            </p>
            <div className="grid two">
              <label className="field">
                <span className="field-label">Latitude</span>
                <input value={form.lat} onChange={updateField("lat")} placeholder="33.7490" inputMode="decimal" />
              </label>
              <label className="field">
                <span className="field-label">Longitude</span>
                <input value={form.lng} onChange={updateField("lng")} placeholder="-84.3880" inputMode="decimal" />
              </label>
            </div>
          </section>

          <div className="vendor-profile__footer">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
