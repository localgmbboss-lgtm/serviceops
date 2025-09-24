import "./styles.css";

export default function KPIBlock({ label, value, sub }) {
  return (
    <div className="kpi card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
