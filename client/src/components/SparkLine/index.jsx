import "./styles.css";

/** props: data = [{date, value}], height=48, strokeWidth=2 */
export default function Sparkline({
  data = [],
  height = 48,
  strokeWidth = 2,
  label = "Jobs",
}) {
  if (!data.length) return <div className="sparkline empty">No data</div>;
  const values = data.map((d) => d.value);
  const max = Math.max(1, ...values);
  const w = Math.max(120, data.length * 6);
  const h = height;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * (w - 6) + 3;
      const y = h - (d.value / max) * (h - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="sparkline">
      <svg width={w} height={h}>
        <polyline
          fill="none"
          stroke="#0f62fe"
          strokeWidth={strokeWidth}
          points={points}
        />
      </svg>
      <div className="spark-meta">
        <span className="spark-label">{label}</span>
        <strong className="spark-last">{values[values.length - 1]}</strong>
      </div>
    </div>
  );
}

