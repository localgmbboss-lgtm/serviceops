import { useState } from "react";
import { api } from "../../lib/api";
import "./styles.css";

export default function NewDriverForm({ onCreated }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [available, setAvailable] = useState(true);
  const [earningsSplit, setEarningsSplit] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api.post("/api/drivers", { name, phone, city, available, earningsSplit });
      setName(""); setPhone(""); setCity("");
      setAvailable(true); setEarningsSplit(0.7);
      onCreated?.();
    } catch (e) {
      setErr(e?.response?.data?.message || "Could not create driver");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="nf card" onSubmit={submit}>
      <h3 className="nf-title">Add Driver</h3>
      <label><span>Name</span><input value={name} onChange={e=>setName(e.target.value)} required /></label>
      <label><span>Phone</span><input value={phone} onChange={e=>setPhone(e.target.value)} required /></label>
      <label><span>City</span><input value={city} onChange={e=>setCity(e.target.value)} required /></label>
      <div className="row">
        <label className="row"><input type="checkbox" checked={available} onChange={e=>setAvailable(e.target.checked)} /> <span>Available</span></label>
        <label style={{marginLeft:12}}><span>Earnings Split</span>
          <input type="number" step="0.01" min="0" max="1" value={earningsSplit} onChange={e=>setEarningsSplit(Number(e.target.value))} />
        </label>
      </div>
      {err && <p className="nf-error">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : "Save Driver"}</button>
    </form>
  );
}

