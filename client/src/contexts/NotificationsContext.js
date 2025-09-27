import React from "react";
import { useAuth } from "./AuthContext";

const NotificationsContext = React.createContext({
  notifications: [],
  unreadCount: 0,
  publish: () => {},
  publishMany: () => {},
  markRead: () => {},
  markAllRead: () => {},
  clearAll: () => {},
});

const STORAGE_PREFIX = "serviceops.notifications";
const MAX_NOTIFICATIONS = 80;

const emptyState = Object.freeze({
  notifications: [],
  seenKeys: {},
});

const fallbackId = () => `ntf_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const cloneMeta = (meta) => {
  if (!meta || typeof meta !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch (e) {
    return {};
  }
};

const normalizeNotification = (input) => {
  const now = new Date();
  let createdAt = input?.createdAt ? new Date(input.createdAt) : now;
  if (Number.isNaN(createdAt.getTime())) createdAt = now;
  const meta = cloneMeta(input?.meta);
  const dedupeKey =
    input?.dedupeKey || (typeof meta?.dedupeKey === "string" ? meta.dedupeKey : undefined);
  const id =
    input?.id ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : fallbackId());

  return {
    id,
    title: input?.title || "Notification",
    body: input?.body || "",
    type: input?.type || "info",
    severity: input?.severity || "info",
    createdAt: createdAt.toISOString(),
    read: Boolean(input?.read) && input.read === true ? true : false,
    meta,
    dedupeKey,
  };
};

const applyNotification = (state, incoming) => {
  if (!incoming) return state;
  const entry = normalizeNotification(incoming);

  if (entry.dedupeKey && state.seenKeys[entry.dedupeKey]) {
    return state;
  }

  const nextSeen = entry.dedupeKey
    ? { ...state.seenKeys, [entry.dedupeKey]: entry.createdAt }
    : state.seenKeys;

  const filtered = state.notifications.filter((n) => n.id !== entry.id);
  const nextList = [{ ...entry, read: false }, ...filtered].slice(0, MAX_NOTIFICATIONS);

  return {
    notifications: nextList,
    seenKeys: nextSeen,
  };
};

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const storageKey = React.useMemo(() => {
    const role = user?.role || "guest";
    const id = user?._id || "anon";
    return `${STORAGE_PREFIX}:${role}:${id}`;
  }, [user?._id, user?.role]);

  const [store, setStore] = React.useState(emptyState);
  const [hydratedKey, setHydratedKey] = React.useState(storageKey);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          Array.isArray(parsed.notifications) &&
          typeof parsed.seenKeys === "object" &&
          parsed.seenKeys !== null
        ) {
          setStore({
            notifications: parsed.notifications.map((n) => normalizeNotification(n)),
            seenKeys: parsed.seenKeys,
          });
          setHydratedKey(storageKey);
          return;
        }
      }
    } catch (e) {
      // Ignore hydration errors
    }
    setStore(emptyState);
    setHydratedKey(storageKey);
  }, [storageKey]);

  React.useEffect(() => {
    if (hydratedKey !== storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          notifications: store.notifications,
          seenKeys: store.seenKeys,
        })
      );
    } catch (e) {
      // Best-effort persistence
    }
  }, [store, storageKey, hydratedKey]);

  const publish = React.useCallback((notification) => {
    if (!notification) return;
    setStore((prev) => applyNotification(prev, notification));
  }, []);

  const publishMany = React.useCallback((list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    setStore((prev) => list.reduce((acc, item) => applyNotification(acc, item), prev));
  }, []);

  const markAllRead = React.useCallback(() => {
    setStore((prev) => {
      if (prev.notifications.every((n) => n.read)) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n) => ({ ...n, read: true })),
      };
    });
  }, []);

  const markRead = React.useCallback((id) => {
    if (!id) return;
    setStore((prev) => {
      const idx = prev.notifications.findIndex((n) => n.id === id);
      if (idx === -1 || prev.notifications[idx].read) return prev;
      const next = [...prev.notifications];
      next[idx] = { ...next[idx], read: true };
      return { ...prev, notifications: next };
    });
  }, []);

  const clearAll = React.useCallback(() => {
    setStore(emptyState);
  }, []);

  const unreadCount = React.useMemo(
    () => store.notifications.filter((n) => !n.read).length,
    [store.notifications]
  );

  const value = React.useMemo(
    () => ({
      notifications: store.notifications,
      unreadCount,
      publish,
      publishMany,
      markRead,
      markAllRead,
      clearAll,
    }),
    [store.notifications, unreadCount, publish, publishMany, markRead, markAllRead, clearAll]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => React.useContext(NotificationsContext);
