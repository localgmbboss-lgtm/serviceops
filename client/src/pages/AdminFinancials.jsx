import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import "./AdminFinancials.css";

export default function AdminFinancials(){
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sum, setSum] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try{
      setBusy(true);
      const params = new URLSearchParams();
      if(from) params.set("from", from);
      if(to) params.set("to", to);
      const { data } = await api.get(`/api/reports/financials?${params.toString()}`);
      setSum(data); setErr("");
    }catch(e){
      setErr(e?.response?.data?.message || "Failed to load financials");
    }finally{ setBusy(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  // Forms
  const [exp, setExp] = useState({ title:"", amount:"", date:"", type:"variable", notes:"" });
  const [pay, setPay] = useState({ jobId:"", amount:"", method:"cash", receivedAt:"", note:"" });

  const submitExpense = async (e)=>{
    e.preventDefault();
    await api.post("/api/expenses", {
      ...exp, amount: Number(exp.amount)||0,
      date: exp.date ? new Date(exp.date) : undefined
    });
    setExp({ title:"", amount:"", date:"", type:"variable", notes:"" });
    load();
  };
  const submitPayment = async (e)=>{
    e.preventDefault();
    await api.post("/api/payments", {
      ...pay, amount: Number(pay.amount)||0,
      receivedAt: pay.receivedAt ? new Date(pay.receivedAt) : undefined
    });
    setPay({ jobId:"", amount:"", method:"cash", receivedAt:"", note:"" });
    load();
  };

  const dl = async (which)=>{
    const params = new URLSearchParams();
    if(from) params.set("from", from);
    if(to) params.set("to", to);
    const url = `/api/exports/${which}.csv?${params.toString()}`;
    const res = await api.get(url, { responseType: "blob" });
    const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = which + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="afin">
      <header className="afin-head">
        <div>
          <h1 className="title">Financials</h1>
          <p className="muted">Track revenue, payouts, expenses and export CSV.</p>
        </div>
        <div className="filters">
          <label>From <input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
          <label>To <input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
          <button className="btn" onClick={load} disabled={busy}>{busy?"Loading...":"Apply"}</button>
        </div>
      </header>

      {err && <div className="card alert error">{err}</div>}

      {/* Summary */}
      <section className="grid4">
        <div className="card metric"><span className="muted">Revenue</span><strong>₦{(sum?.revenue.total||0).toFixed(2)}</strong></div>
        <div className="card metric"><span className="muted">Payouts (accrued)</span><strong>₦{(sum?.payouts.total||0).toFixed(2)}</strong></div>
        <div className="card metric"><span className="muted">Expenses</span><strong>₦{(sum?.expenses.total||0).toFixed(2)}</strong></div>
        <div className={"card metric "+((sum?.net||0)>=0?"ok":"bad")}><span className="muted">Net</span><strong>₦{(sum?.net||0).toFixed(2)}</strong></div>
      </section>

      {/* By city & owed by driver */}
      <section className="grid2">
        <div className="card">
          <h3 className="section-title">Revenue by City</h3>
          <table className="table">
            <thead><tr><th>City</th><th>Total</th></tr></thead>
            <tbody>
              {(sum?.byCity||[]).map(r=>(
                <tr key={r.city}><td>{r.city}</td><td>₦{r.total.toFixed(2)}</td></tr>
              ))}
              {(sum?.byCity||[]).length===0 && <tr><td colSpan="2" className="muted">No data</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 className="section-title">Payouts Owed (by Driver)</h3>
          <table className="table">
            <thead><tr><th>Driver</th><th>City</th><th>Amount</th></tr></thead>
            <tbody>
              {(sum?.payouts?.byDriver||[]).map(d=>(
                <tr key={d.driverId}><td>{d.name}</td><td>{d.city||"—"}</td><td>₦{d.amount.toFixed(2)}</td></tr>
              ))}
              {(sum?.payouts?.byDriver||[]).length===0 && <tr><td colSpan="3" className="muted">No data</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Forms */}
      <section className="grid2">
        <form className="card form" onSubmit={submitPayment}>
          <h3 className="section-title">Add Payment</h3>
          <div className="row">
            <label><span>Job ID</span><input value={pay.jobId} onChange={e=>setPay(p=>({...p, jobId:e.target.value}))} required/></label>
            <label><span>Amount</span><input type="number" min="0" value={pay.amount} onChange={e=>setPay(p=>({...p, amount:e.target.value}))} required/></label>
          </div>
          <div className="row">
            <label><span>Method</span>
              <select value={pay.method} onChange={e=>setPay(p=>({...p, method:e.target.value}))}>
                {["cash","zelle","venmo","square","card","other"].map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label><span>Received At</span><input type="datetime-local" value={pay.receivedAt} onChange={e=>setPay(p=>({...p, receivedAt:e.target.value}))}/></label>
          </div>
          <label><span>Note</span><input value={pay.note} onChange={e=>setPay(p=>({...p, note:e.target.value}))}/></label>
          <div className="row end"><button className="btn" type="submit">Save Payment</button></div>
        </form>

        <form className="card form" onSubmit={submitExpense}>
          <h3 className="section-title">Add Expense</h3>
          <div className="row">
            <label><span>Title</span><input value={exp.title} onChange={e=>setExp(s=>({...s, title:e.target.value}))} required/></label>
            <label><span>Amount</span><input type="number" min="0" value={exp.amount} onChange={e=>setExp(s=>({...s, amount:e.target.value}))} required/></label>
          </div>
          <div className="row">
            <label><span>Date</span><input type="date" value={exp.date} onChange={e=>setExp(s=>({...s, date:e.target.value}))}/></label>
            <label><span>Type</span>
              <select value={exp.type} onChange={e=>setExp(s=>({...s, type:e.target.value}))}>
                <option value="fixed">fixed</option>
                <option value="variable">variable</option>
              </select>
            </label>
          </div>
          <label><span>Notes</span><input value={exp.notes} onChange={e=>setExp(s=>({...s, notes:e.target.value}))}/></label>
          <div className="row end"><button className="btn" type="submit">Save Expense</button></div>
        </form>
      </section>

      {/* Latest lists + exports */}
      <section className="grid2">
        <div className="card">
          <div className="card-head space">
            <h3 className="section-title">Latest Payments</h3>
            <div className="seg">
              <button className="segbtn" onClick={()=>dl("payments")}>Export CSV</button>
            </div>
          </div>
          <table className="table">
            <thead><tr><th>Date</th><th>Job</th><th>Amount</th><th>Method</th><th>Note</th></tr></thead>
            <tbody>
              {(sum?.latest?.payments||[]).map(p=>(
                <tr key={p._id}>
                  <td>{new Date(p.receivedAt).toLocaleString()}</td>
                  <td><code>{p.jobId}</code></td>
                  <td>₦{(p.amount||0).toFixed(2)}</td>
                  <td>{p.method}</td>
                  <td>{p.note||"—"}</td>
                </tr>
              ))}
              {(sum?.latest?.payments||[]).length===0 && <tr><td colSpan="5" className="muted">No payments</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head space">
            <h3 className="section-title">Latest Expenses</h3>
            <div className="seg">
              <button className="segbtn" onClick={()=>dl("expenses")}>Export CSV</button>
            </div>
          </div>
          <table className="table">
            <thead><tr><th>Date</th><th>Title</th><th>Amount</th><th>Type</th><th>Notes</th></tr></thead>
            <tbody>
              {(sum?.latest?.expenses||[]).map(e=>(
                <tr key={e._id}>
                  <td>{new Date(e.date).toLocaleDateString()}</td>
                  <td>{e.title}</td>
                  <td>₦{(e.amount||0).toFixed(2)}</td>
                  <td>{e.type}</td>
                  <td>{e.notes||"—"}</td>
                </tr>
              ))}
              {(sum?.latest?.expenses||[]).length===0 && <tr><td colSpan="5" className="muted">No expenses</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


