import { Link } from "react-router-dom";
import "./Landing.css";

export default function Landing() {
  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero card">
        <div className="hero-left">
          <h1 className="hero-title">
            Get help on the road, <br /> fast and hassle-free
          </h1>
          <p className="hero-sub">
            Request service in seconds, compare live bids, track progress in
            real time.
          </p>

          <div className="hero-ctas">
            <Link className="btn primary hero-btn" to="/guest/request">
              Request as guest
            </Link>
            <Link className="btn ghost hero-btn" to="/customer/login">
              Sign in / Create account
            </Link>
          </div>
          <p className="muted tiny">Dispatch team? Use your private admin link.</p>

          <div className="hero-bullets">
            <span className="pill">24/7 dispatch</span>
            <span className="pill">Real-time tracking</span>
            <span className="pill">Transparent pricing</span>
          </div>
        </div>

        <div className="hero-right">
          {/* Phone mock / artwork */}
          <div className="phone">
            <div className="phone-top" />
            <div className="phone-screen">
              <div className="screen-card">
                <div className="row between">
                  <strong>Pickup</strong>
                  <span className="badge">ETA 8 min</span>
                </div>
                <p className="muted small">Broadway &amp; W 29th St</p>
              </div>
              <div className="screen-card">
                <div className="row between">
                  <strong>Bids</strong>
                  <span className="muted small">3 available</span>
                </div>
                <div className="mini-bids">
                  <span className="chip">$85</span>
                  <span className="chip">$92</span>
                  <span className="chip">$99</span>
                </div>
              </div>
              <div className="track-bar">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
            <div className="phone-bottom" />
          </div>
        </div>
      </section>

      {/* Quick entry cards (three-up) */}
      <section className="entry-grid">
        <Link className="entry card" to="/customer/login">
          <div className="entry-icon">CUS</div>
          <h3>Customer sign in</h3>
          <p className="muted">
            Save addresses, view history, manage payments, and track jobs.
          </p>
        </Link>

        <Link className="entry card" to="/vendor/login">
          <div className="entry-icon">VEN</div>
          <h3>Vendor portal</h3>
          <p className="muted">Get jobs, bid live, update status, get paid.</p>
        </Link>

        <Link className="entry card" to="/guest/request">
          <div className="entry-icon">GST</div>
          <h3>Request as guest</h3>
          <p className="muted">No account needed. Submit a one-time service request.</p>
        </Link>
      </section>

      {/* Features */}
      <section className="features card">
        <div className="feat">
          <div className="feat-icon">*</div>
          <div>
            <h4>Live map tracking</h4>
            <p className="muted">See your driver's ETA and route in real time.</p>
          </div>
        </div>
        <div className="feat">
          <div className="feat-icon">*</div>
          <div>
            <h4>Clear pricing</h4>
            <p className="muted">Compare bids before you choose. No surprises.</p>
          </div>
        </div>
        <div className="feat">
          <div className="feat-icon">*</div>
          <div>
            <h4>Trusted providers</h4>
            <p className="muted">Verified vendors with ratings and on-time records.</p>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="final-cta card">
        <div className="final-left">
          <h2>On the road? We have you covered.</h2>
          <p className="muted">
            Create a request as a guest or sign in to keep everything in one
            place.
          </p>
        </div>
        <div className="final-right">
          <Link className="btn ghost" to="/guest/request">
            Request as guest
          </Link>
          <Link className="btn primary" to="/customer/login">
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
