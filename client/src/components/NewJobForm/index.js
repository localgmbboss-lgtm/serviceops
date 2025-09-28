import { useState } from "react";
import { api } from "../../lib/api";
import "./styles.css";

export default function NewJobForm({ drivers = [], onCreated }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [quotedPrice, setQuotedPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [driverId, setDriverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      // 1) create customer
      const c = await api.post("/api/customers", { name: customerName, phone: customerPhone });
      const customerId = c.data._id;

      // 2) create job
      const payload = {
        customerId,
        pickupAddress,
        serviceType: serviceType || undefined,
        quotedPrice: quotedPrice ? Number(quotedPrice) : 0,
        notes: notes || undefined,
      };
      if (driverId) { payload.driverId = driverId; payload.status = "Assigned"; }
      await api.post("/api/jobs", payload);

      // reset form
      setCustomerName(""); setCustomerPhone(""); setPickupAddress("");
      setServiceType(""); setQuotedPrice(""); setNotes(""); setDriverId("");

      onCreated?.();
    } catch (e) {
      setErr(e?.response?.data?.message || "Could not create job");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="jf card" onSubmit={submit}>
      <h3 className="jf-title">Create Job</h3>

      <div className="jf-grid">
        <div>
          <label><span>Customer Name</span><input value={customerName} onChange={e=>setCustomerName(e.target.value)} required /></label>
        </div>
        <div>
          <label><span>Customer Phone</span><input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} required /></label>
        </div>
        <div className="full">
          <label><span>Pickup Address</span><input value={pickupAddress} onChange={e=>setPickupAddress(e.target.value)} required /></label>
        </div>
        <div>
          <label><span>Service Type</span><input value={serviceType} onChange={e=>setServiceType(e.target.value)} placeholder="delivery / install / ..." /></label>
        </div>
        <div>
          <label><span>Quoted Price</span><input type="number" value={quotedPrice} onChange={e=>setQuotedPrice(e.target.value)} /></label>
        </div>
        <div className="full">
          <label><span>Notes (optional)</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} /></label>
        </div>
        <div>
          <label><span>Assign Driver (optional)</span>
            <select value={driverId} onChange={e=>setDriverId(e.target.value)}>
              <option value="">- unassigned -</option>
              {drivers.map(d => <option key={d._id} value={d._id}>{d.name} ({d.city})</option>)}
            </select>
          </label>
        </div>
      </div>

      {err && <p className="jf-error">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Creating..." : "Create Job"}</button>
    </form>
  );
}
