import PropTypes from "prop-types";

export default function VendorHeroHeader({
  vendorName,
  lastSyncLabel,
  showGeoPrompt,
  onDismissGeoPrompt,
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
              Add your location in the vendor profile to unlock distance-based
              estimates.
            </div>
            <button
              type="button"
              className="va-alert__dismiss"
              onClick={onDismissGeoPrompt}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="va-hero__meta">
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
  autoRefresh: PropTypes.bool,
  onToggleAutoRefresh: PropTypes.func,
  cityFilter: PropTypes.bool,
  onToggleCityFilter: PropTypes.func,
};

VendorHeroHeader.defaultProps = {
  vendorName: "",
  showGeoPrompt: false,
  onDismissGeoPrompt: undefined,
  autoRefresh: true,
  onToggleAutoRefresh: undefined,
  cityFilter: false,
  onToggleCityFilter: undefined,
};
