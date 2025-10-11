const STORAGE_KEY = "serviceops.auditLog";
const MAX_EVENTS = 200;

const hasWindow = typeof window !== "undefined";

const safeParse = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to parse audit log", error);
    return [];
  }
};

const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn("Failed to serialise audit log", error);
    return "[]";
  }
};

const emitUpdate = () => {
  if (!hasWindow) return;
  try {
    window.dispatchEvent(new CustomEvent("audit-log:updated"));
  } catch (error) {
    // ignore dispatch failures
  }
};

export const readAuditLog = () => {
  if (!hasWindow) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return safeParse(raw);
};

export const clearAuditLog = () => {
  if (!hasWindow) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear audit log", error);
  }
  emitUpdate();
};

const generateId = () =>
  `audit_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const normaliseEvent = (event) => {
  if (!event || typeof event !== "object") return null;
  const createdAt = event.createdAt
    ? new Date(event.createdAt).toISOString()
    : new Date().toISOString();
  return {
    id: event.id || generateId(),
    title: event.title || "Event",
    message: event.message || event.body || "",
    type: event.type || "info",
    severity: event.severity || event.type || "info",
    meta: event.meta || {},
    createdAt,
  };
};

export const recordAuditEvent = (event) => {
  if (!hasWindow) return;
  const entry = normaliseEvent(event);
  if (!entry) return;
  try {
    const existing = readAuditLog();
    const next = [entry, ...existing.filter((item) => item.id !== entry.id)].slice(
      0,
      MAX_EVENTS
    );
    window.localStorage.setItem(STORAGE_KEY, safeStringify(next));
  } catch (error) {
    console.warn("Failed to record audit event", error);
  }
  emitUpdate();
};

