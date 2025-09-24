import { Link } from "react-router-dom";

export default function NotFound(){
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <h2 style={{ marginTop: 0 }}>Page not found</h2>
      <p className="muted">We couldn’t find that route.</p>
      <Link to="/" className="btn-link">Go to Admin</Link>
    </div>
  );
}
