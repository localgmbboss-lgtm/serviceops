import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import "./PrintReport.css";

export default function PrintReport(){
  const [sp] = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");
  const service = sp.get("service") || "";
  const [data, setData] = useState(null);

  useEffect(()=>{
    (async ()=>{
      const { data } = await api.get("/api/reports/range", { params: { from, to, service }});
      setData(data);
      // auto-open print after load
      setTimeout(()=>window.print(), 300);
    })();
  },[from,to,service]);

  if(!data) return <p style={{padding:16}}>Preparing report...</p>;

  return (
    <div className="print-report">
      <h1>ServiceOps Report</h1>
      <div className="sub">Period: {new Date(data.from).toLocaleDateString()} - {new Date(data.to).toLocaleDateString()} {service ? `(Service: ${service})` : ""}</div>

      <section className="grid3">
        <div className="block"><div className="lbl">Jobs</div><div className="val">{data.totals?.count||0}</div></div>
        <div className="block"><div className="lbl">Completed</div><div className="val">{data.totals?.completed||0}</div></div>
        <div className="block"><div className="lbl">Gross</div><div className="val">${(data.totals?.gross||0).toFixed(2)}</div></div>
      </section>

      <section className="grid2">
        <div>
          <h3>By Service</h3>
          <table>
            <tbody>
            {Object.entries(data.byService||{}).map(([k,v])=>(
              <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>
            ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>By City</h3>
          <table>
            <tbody>
            {Object.entries(data.byCity||{}).map(([k,v])=>(
              <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>
            ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>Top Drivers</h3>
        <table>
          <thead><tr><th>Name</th><th>City</th><th className="num">Jobs</th><th className="num">Revenue ($)</th></tr></thead>
          <tbody>
            {(data.topDrivers||[]).map(d=>(
              <tr key={d.driverId || d.name}>
                <td>{d.name||"-"}</td>
                <td>{d.city||"-"}</td>
                <td className="num">{d.jobs}</td>
                <td className="num">{Math.round(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <footer>Generated on {new Date().toLocaleString()}</footer>
    </div>
  );
}

