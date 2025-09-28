import "./styles.css";

/**
 * Simple stacked area spark chart for public/private series.
 * props: { data: [{period, public, private}], height=64 }
 */
export default function MiniChart({ data = [], height = 64 }) {
  if (!data.length) return <div className="minichart empty">No feedback yet</div>;

  const padX = 4, padY = 4;
  const w = Math.max(140, data.length * 18);
  const h = height;

  const maxY = Math.max(1, ...data.map(d => (d.public || 0) + (d.private || 0)));

  const x = (i) => padX + (i * (w - 2 * padX)) / Math.max(1, data.length - 1);
  const y = (v) => h - padY - (v * (h - 2 * padY)) / maxY;

  const pathFor = (key) => {
    const up = data.map((d, i) => `${i ? "L" : "M"} ${x(i)} ${y((d.public||0)+(d.private||0))}`);
    const base = data.slice().reverse().map((d, idx) => {
      const i = data.length - 1 - idx;
      const v = key === "public" ? (d.private || 0) : 0;
      return `L ${x(i)} ${y(v)}`;
    });
    return [...up, ...base, "Z"].join(" ");
  };

  const line = data.map((d, i) => `${i ? "L" : "M"} ${x(i)} ${y((d.public||0)+(d.private||0))}`).join(" ");

  return (
    <div className="minichart">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="Feedback trend">
        {/* private area (bottom) */}
        <path d={pathFor("private")} className="mc-area mc-private" />
        {/* public area (top) */}
        <path d={pathFor("public")} className="mc-area mc-public" />
        {/* outline */}
        <path d={line} className="mc-line" />
      </svg>
    </div>
  );
}

