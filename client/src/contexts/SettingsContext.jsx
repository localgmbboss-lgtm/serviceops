import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

const DEFAULT_WORKFLOW = Object.freeze({
  requireDriverDocs: true,
  requireVendorDocs: true,
  showBusinessDocs: true,
  showLiveDriverMap: true,
  showLiveVendorMap: true,
  advancedJobWorkflow: false,
  enableCustomerPaymentScreen: false,
  enableReviewFunnel: true,
  multiServiceMode: true,
  showReportsTab: true,
  enableMessaging: false,
});

const DEFAULT_SETTINGS = Object.freeze({
  workflow: DEFAULT_WORKFLOW,
});

const noop = () => {};

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  workflow: DEFAULT_WORKFLOW,
  loading: true,
  error: "",
  refresh: noop,
  setSettings: noop,
});

const mergeWithDefaults = (value) => {
  if (!value || typeof value !== "object") {
    return {
      ...DEFAULT_SETTINGS,
      workflow: { ...DEFAULT_WORKFLOW },
    };
  }
  const incomingWorkflow =
    value.workflow && typeof value.workflow === "object" ? value.workflow : {};
  return {
    ...value,
    workflow: {
      ...DEFAULT_WORKFLOW,
      ...incomingWorkflow,
    },
  };
};

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(() =>
    mergeWithDefaults(DEFAULT_SETTINGS)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const setSettings = useCallback((next) => {
    setSettingsState(mergeWithDefaults(next));
  }, []);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const { data } = await api.get("/api/settings");
      if (requestIdRef.current !== requestId) return;
      setSettings(data);
      setError("");
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load settings."
      );
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [setSettings]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      settings,
      workflow: settings.workflow || DEFAULT_WORKFLOW,
      loading,
      error,
      refresh,
      setSettings,
    }),
    [error, loading, refresh, setSettings, settings]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export function useWorkflow() {
  const { workflow } = useSettings();
  return workflow || DEFAULT_WORKFLOW;
}

export function useWorkflowFlag(flag, fallback = true) {
  const workflow = useWorkflow();
  if (!flag || typeof flag !== "string") return fallback;
  if (Object.prototype.hasOwnProperty.call(workflow, flag)) {
    return Boolean(workflow[flag]);
  }
  return fallback;
}

