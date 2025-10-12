import { Link } from "react-router-dom";
import PropTypes from "prop-types";

export default function VendorHeroHeader({
  vendorName,
  lastSyncLabel,
  showGeoPrompt,
  onDismissGeoPrompt,
  onRequestLocation,
  requestingLocation,
  locationError,
  autoRefresh,
  onToggleAutoRefresh,
  cityFilter,
  onToggleCityFilter,
}) {
  return (
    <header className="va-hero card">
      <div className="va-hero__main">
        <p className="va-overline">Welcome back</p>
        <h1>{vendorName ? vendorName : "Your vendor dashboard"}</h1>
        <p className="va-subtitle">
          Stay ahead of incoming requests with real-time bidding, distance
          insights, and quick actions.
        </p>
        {showGeoPrompt && (
          <div className="va-alert info va-alert--dismissible" role="status">
            <div className="va-alert__body">
              <strong>Enable location</strong> to unlock distance estimates,
              smarter ETAs, and nearby job sorting.
              {locationError ? (
                <p className="va-alert__caption" role="alert">
                  {locationError}
                </p>
              ) : (
                <p className="va-alert__caption">
                  We only store your base coordinates to improve dispatch
                  matching.
                </p>
              )}
            </div>
            <div className="va-alert__actions">
              {onRequestLocation ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={onRequestLocation}
                  disabled={requestingLocation}
                >
                  {requestingLocation ? "Requesting..." : "Enable location"}
                </button>
              ) : null}
              <button
                type="button"
                className="va-alert__dismiss"
                onClick={onDismissGeoPrompt}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="va-hero__meta">
        <Link className="btn ghost" to="/vendor/profile">
          Update profile
        </Link>
        <div className="va-chip">Last sync {lastSyncLabel}</div>
        <label className="va-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => onToggleAutoRefresh?.(event.target.checked)}
          />
          Auto refresh
        </label>
        <label className="va-toggle">
          <input
            type="checkbox"
            checked={cityFilter}
            onChange={(event) => onToggleCityFilter?.(event.target.checked)}
          />
          City filter
        </label>
      </div>
    </header>
  );
}

VendorHeroHeader.propTypes = {
  vendorName: PropTypes.string,
  lastSyncLabel: PropTypes.string.isRequired,
  showGeoPrompt: PropTypes.bool,
  onDismissGeoPrompt: PropTypes.func,
  onRequestLocation: PropTypes.func,
  requestingLocation: PropTypes.bool,
  locationError: PropTypes.string,
  autoRefresh: PropTypes.bool,
  onToggleAutoRefresh: PropTypes.func,
  cityFilter: PropTypes.bool,
  onToggleCityFilter: PropTypes.func,
};

VendorHeroHeader.defaultProps = {
  vendorName: "",
  showGeoPrompt: false,
  onDismissGeoPrompt: undefined,
  onRequestLocation: undefined,
  requestingLocation: false,
  locationError: "",
  autoRefresh: true,
  onToggleAutoRefresh: undefined,
  cityFilter: false,
  onToggleCityFilter: undefined,
};

