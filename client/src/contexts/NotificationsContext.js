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
  const audioCtxRef = React.useRef(null);

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

  const playChime = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new Ctx();
      } catch (error) {
        return;
      }
    }
    const ctx = audioCtxRef.current;
    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + 0.01;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.start(start);
      osc.stop(start + 0.42);
    } catch (error) {
      // ignore audio playback failures
    }
  }, []);

  const triggerSystemNotification = React.useCallback(
    (entry) => {
      if (
        !entry ||
        typeof window === "undefined" ||
        !("Notification" in window)
      ) {
        return;
      }

      const showNotification = () => {
        try {
          const notification = new Notification(entry.title || "ServiceOps", {
            body: entry.body || "",
            tag: entry.dedupeKey || entry.id,
          });
          playChime();
          window.setTimeout(() => {
            try {
              notification.close();
            } catch (error) {
              // ignore
            }
          }, 8000);
        } catch (error) {
          // permission denied or other browser limitation
        }
      };

      if (Notification.permission === "granted") {
        showNotification();
      } else if (Notification.permission === "default") {
        Notification.requestPermission()
          .then((permission) => {
            if (permission === "granted") {
              showNotification();
            }
          })
          .catch(() => {});
      }
    },
    [playChime]
  );

  const addNotification = React.useCallback(
    (incoming) => {
      if (!incoming) return null;
      const entry = normalizeNotification(incoming);
      let added = false;
      setStore((prev) => {
        const next = applyNotification(prev, entry);
        if (next === prev) return prev;
        added = true;
        return next;
      });
      return added ? entry : null;
    },
    []
  );

  const publish = React.useCallback(
    (notification) => {
      const entry = addNotification(notification);
      if (entry) {
        triggerSystemNotification(entry);
      }
    },
    [addNotification, triggerSystemNotification]
  );

  const publishMany = React.useCallback(
    (list) => {
      if (!Array.isArray(list) || list.length === 0) return;
      const added = [];
      list.forEach((item) => {
        const entry = addNotification(item);
        if (entry) added.push(entry);
      });
      added.forEach((entry) => triggerSystemNotification(entry));
    },
    [addNotification, triggerSystemNotification]
  );

  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      typeof navigator.serviceWorker.addEventListener !== "function"
    ) {
      return undefined;
    }

    const handleMessage = (event) => {
      const { data } = event;
      if (!data || typeof data !== "object") return;
      if (data.type === "PUSH_NOTIFICATION" && data.payload) {
        const payload = data.payload;
        addNotification({
          title: payload.title,
          body: payload.body,
          severity: payload.meta?.severity || payload.severity || "info",
          meta: payload.meta,
          dedupeKey:
            payload.meta?.dedupeKey ||
            payload.meta?.notificationId ||
            payload.dedupeKey,
          createdAt: payload.createdAt,
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [addNotification]);

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
