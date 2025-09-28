// src/pages/Unauthorized.js
import { Link } from "react-router-dom";
import "./Unauthorized.css";

const Unauthorized = () => {
  return (
    <div className="unauthorized-container">
      <div className="unauthorized-card">
        <h1> Access Denied</h1>
        <p>You don't have permission to access this page.</p>
        <Link to="/" className="btn btn-primary">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default Unauthorized;
