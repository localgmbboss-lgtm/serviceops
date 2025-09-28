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

export default function JobCreate({ onCreated }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsError, setVendorsError] = useState("");

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

  const setField = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const selectedVendor = useMemo(
    () => vendors.find((v) => v._id === form.vendorId) || null,
    [vendors, form.vendorId]
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

  const reset = () => setForm({ ...INITIAL_FORM });

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore clipboard errors silently
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

      const { data: job } = await api.post("/api/jobs", payload);

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
