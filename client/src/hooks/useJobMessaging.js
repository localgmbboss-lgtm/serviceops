import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { vendorApi } from "../lib/vendorApi";
import { getSocket } from "../lib/socket";
import { useAuth } from "../contexts/AuthContext";

const ROLE_PROPERTY = {
  customer: "readByCustomer",
  vendor: "readByVendor",
};

const MAX_ATTACHMENTS = 6;

const normalizeFiles = (files) => {
  if (!files) return [];
  if (Array.isArray(files)) return files.filter(Boolean);
  return Array.from(files);
};

export function useJobMessaging({ jobId, role }) {
  const { token } = useAuth();
  const httpClient = role === "vendor" ? vendorApi : api;

  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState({ customer: null, vendor: null });
  const [actor, setActor] = useState({ role, id: null });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [canMessage, setCanMessage] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);

  const jobIdRef = useRef(jobId);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  const resetState = useCallback(() => {
    if (!mountedRef.current) return;
    setMessages([]);
    setParticipants({ customer: null, vendor: null });
    setCanMessage(false);
    setRealtimeReady(false);
    setError("");
  }, []);

  const loadMessages = useCallback(async () => {
    if (!jobId || !token) {
      resetState();
      return;
    }
    setLoading(true);
    try {
      const { data } = await httpClient.get(`/api/messages/job/${jobId}`);
      if (!mountedRef.current || jobIdRef.current !== jobId) return;
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setParticipants(data?.participants || { customer: null, vendor: null });
      if (data?.actor?.role) {
        setActor({
          role: data.actor.role,
          id: data.actor.id || null,
        });
      } else {
        setActor((prev) => ({
          ...prev,
          role: prev.role || role,
        }));
      }
      setCanMessage(Boolean(data?.canMessage));
      setError("");
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load conversation."
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [httpClient, jobId, resetState, role, token]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!jobId || !token) return undefined;
    const socket = getSocket();

    const handleNewMessage = (payload) => {
      if (!payload || payload.jobId !== String(jobIdRef.current)) return;
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === payload.id)) {
          return prev.map((msg) => (msg.id === payload.id ? payload : msg));
        }
        return [...prev, payload];
      });
    };

    const handleReadReceipt = (payload) => {
      if (!payload || payload.jobId !== String(jobIdRef.current)) return;
      const property =
        payload.readerRole === "customer"
          ? "readByCustomer"
          : payload.readerRole === "vendor"
          ? "readByVendor"
          : null;
      if (!property) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg[property]
            ? msg
            : {
                ...msg,
                [property]: true,
              }
        )
      );
    };

    const handleDisconnect = () => {
      setRealtimeReady(false);
    };

    socket.on("messages:new", handleNewMessage);
    socket.on("messages:read", handleReadReceipt);
    socket.on("disconnect", handleDisconnect);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("messages:join", { token, jobId }, (ack) => {
      if (!mountedRef.current || jobIdRef.current !== jobId) {
        return;
      }
      if (!ack || ack.ok) {
        setRealtimeReady(true);
      } else {
        setRealtimeReady(false);
        setError(ack.error || "Live updates unavailable.");
      }
    });

    return () => {
      socket.emit("messages:leave", { jobId });
      socket.off("messages:new", handleNewMessage);
      socket.off("messages:read", handleReadReceipt);
      socket.off("disconnect", handleDisconnect);
    };
  }, [jobId, token]);

  const sendMessage = useCallback(
    async ({ body, files }) => {
      if (!jobId) {
        throw new Error("Missing jobId");
      }
      const attachments = normalizeFiles(files).slice(0, MAX_ATTACHMENTS);
      if (!body && attachments.length === 0) {
        throw new Error("Enter a message or add images.");
      }

      const form = new FormData();
      if (body) form.append("body", body);
      attachments.forEach((file) => form.append("attachments", file));
      setSending(true);
      try {
        const { data } = await httpClient.post(
          `/api/messages/job/${jobId}`,
          form,
          {
            headers: { "Content-Type": "multipart/form-data" },
          }
        );
        const message = data?.message;
        if (message) {
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === message.id)) return prev;
            return [...prev, message];
          });
        }
        setError("");
        return message;
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to send message."
        );
        throw err;
      } finally {
        setSending(false);
      }
    },
    [httpClient, jobId]
  );

  const markConversationRead = useCallback(async () => {
    if (!jobId) return;
    try {
      await httpClient.post(`/api/messages/job/${jobId}/read`);
    } catch {
      /* ignore */
    }
  }, [httpClient, jobId]);

  const needsReadReceipt = useMemo(() => {
    if (!messages.length) return false;
    const prop = ROLE_PROPERTY[actor?.role] || null;
    if (!prop) return false;
    return messages.some(
      (msg) => msg.senderRole !== actor.role && !msg[prop]
    );
  }, [actor?.role, messages]);

  useEffect(() => {
    if (needsReadReceipt) {
      markConversationRead();
    }
  }, [markConversationRead, needsReadReceipt]);

  const lastMessage = useMemo(() => {
    if (!messages.length) return null;
    return messages[messages.length - 1];
  }, [messages]);

  const incomingCount = useMemo(() => {
    if (!messages.length) return 0;
    return messages.filter((msg) => msg.senderRole !== actor.role).length;
  }, [actor.role, messages]);

  return {
    messages,
    participants,
    actor,
    loading,
    sending,
    error,
    canMessage,
    realtimeReady,
    sendMessage,
    reload: loadMessages,
    markConversationRead,
    lastMessage,
    incomingCount,
  };
}
