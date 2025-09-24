import { useState } from "react";
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

export default function JobCreate({ onCreated }) {
  const [form, setForm] = useState({
    custName: "",
    custPhone: "",
    pickupAddress: "",
    dropoffAddress: "",
    serviceType: "",
    quotedPrice: "",
    notes: "",
    bidMode: "open",
    openBidding: true,
  });

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(null); // { jobId, statusUrl, vendorLink?, customerLink? }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const reset = () =>
    setForm({
      custName: "",
      custPhone: "",
      pickupAddress: "",
      dropoffAddress: "",
      serviceType: "",
      quotedPrice: "",
      notes: "",
      bidMode: "open",
      openBidding: true,
    });

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
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

    if (form.bidMode === "fixed" && !(Number(form.quotedPrice) > 0)) {
      setBusy(false);
      return setErr("Enter a quoted price for fixed jobs.");
    }

    try {
      const { data: cust } = await api.post("/api/customers", {
        name: form.custName.trim(),
        phone: form.custPhone.trim(),
      });

      const { data: job } = await api.post("/api/jobs", {
        customerId: cust._id,
        pickupAddress: form.pickupAddress.trim(),
        dropoffAddress: form.dropoffAddress.trim() || undefined,
        serviceType,
        quotedPrice: Number(form.quotedPrice) || 0,
        notes: form.notes.trim(),
        bidMode: form.bidMode,
      });

      let links = { statusUrl: null, vendorLink: null, customerLink: null };
      if (form.openBidding) {
        try {
          const r = await api.post(`/api/jobs/${job._id}/open-bidding`);
          links = {
            statusUrl: r.data?.statusUrl || null,
            vendorLink: r.data?.vendorLink || null,
            customerLink: r.data?.customerLink || null,
          };
        } catch (eOpen) {
          links = { statusUrl: `${window.location.origin}/status/${job._id}` };
        }
      } else {
        links = { statusUrl: `${window.location.origin}/status/${job._id}` };
      }

      setSuccess({ jobId: job._id, ...links });
      reset();
      onCreated?.();
    } catch (e2) {
      setErr(e2?.response?.data?.message || "Failed to create job");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="jobcreate" onSubmit={submit}>
      <h3>Create job</h3>

      {err && <div className="jobcreate-alert error">{err}</div>}
      {success && (
        <div className="jobcreate-alert success">
          <p>
            Job created!
            <button
              type="button"
              className="link"
              onClick={() => copy(success.statusUrl)}
            >
              Copy status link
            </button>
          </p>
          <ul className="jobcreate-links">
            {success.statusUrl && (
              <li>
                <strong>Status:</strong> <code>{success.statusUrl}</code>
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
                <strong>Vendor:</strong> <code>{success.vendorLink}</code>
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
                <strong>Customer:</strong> <code>{success.customerLink}</code>
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
          <input value={form.custName} onChange={set("custName")} required />
        </label>
        <label>
          <span>Customer phone</span>
          <input
            type="tel"
            value={form.custPhone}
            onChange={set("custPhone")}
            required
          />
        </label>
      </div>

      <label>
        <span>Pickup address</span>
        <input
          value={form.pickupAddress}
          onChange={set("pickupAddress")}
          required
          placeholder="123 Main St, City"
        />
      </label>

      <label>
        <span>Drop-off address (optional)</span>
        <input
          value={form.dropoffAddress}
          onChange={set("dropoffAddress")}
          placeholder="Destination..."
        />
      </label>

      <fieldset className="jobcreate-mode">
        <legend>Vendor response type</legend>
        <div className="jobcreate-mode-options">
          <button
            type="button"
            className={`jobcreate-mode-option ${form.bidMode === "fixed" ? "active" : ""}`}
            onClick={() => setForm((f) => ({ ...f, bidMode: "fixed" }))}
          >
            Fixed price (ETA only)
          </button>
          <button
            type="button"
            className={`jobcreate-mode-option ${form.bidMode === "open" ? "active" : ""}`}
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
      </fieldset>

      <div className="row">
        <label>
          <span>Service type</span>
          <input
            value={form.serviceType}
            onChange={set("serviceType")}
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
          <span>Quoted price</span>
          <input
            type="number"
            min="0"
            step="1"
            value={form.quotedPrice}
            onChange={set("quotedPrice")}
            placeholder="0"
            required={form.bidMode === "fixed"}
          />
          <small className="jobcreate-hint">
            {form.bidMode === "fixed"
              ? "Required for fixed jobs. Vendors only submit their ETA."
              : "Optional reference when requesting bids."}
          </small>
        </label>
      </div>

      <label>
        <span>Notes</span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={set("notes")}
          placeholder="Gate code, vehicle color, etc."
        />
      </label>

      <div className="row end">
        <button className="btn" type="submit" disabled={busy}>
          {busy
            ? "Creating..."
            : form.openBidding
            ? "Create & Open Bidding"
            : "Create Job"}
        </button>
      </div>
    </form>
  );
}










