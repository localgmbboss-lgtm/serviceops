import { useEffect, useMemo, useRef, useState } from "react";
import { LuX } from "react-icons/lu";
import { API_BASE_URL, APP_BASE_URL } from "../config/env.js";
import "./MessagingPanel.css";

const MAX_MESSAGE_LENGTH = 2000;

const API_PREFIX =
  typeof API_BASE_URL === "string"
    ? API_BASE_URL.replace(/\/+$/, "")
    : "";
const APP_PREFIX =
  typeof APP_BASE_URL === "string"
    ? APP_BASE_URL.replace(/\/+$/, "")
    : "";
const API_PREFIX_NO_API = API_PREFIX.replace(/\/api(?:\/|$)/i, "");

const joinUrl = (base, path) => {
  if (!path) return "";
  if (!base) return path;
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const resolveAttachmentUrl = (value = "") => {
  if (!value) return "";
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  const sanitized = value.startsWith("/") ? value : `/${value}`;
  if (sanitized.startsWith("/uploads/") || sanitized.startsWith("/media/")) {
    const candidate =
      joinUrl(API_PREFIX_NO_API, sanitized) ||
      joinUrl(APP_PREFIX, sanitized) ||
      joinUrl(API_PREFIX, sanitized);
    return candidate || sanitized;
  }
  if (!API_PREFIX) return sanitized;
  return `${API_PREFIX}${sanitized}`;
};

const formatTimestamp = (iso) => {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const roleLabel = (role, preferred) => {
  if (role === "customer") return preferred || "Customer";
  if (role === "vendor") return preferred || "Vendor";
  if (role === "admin") return preferred || "Dispatch";
  if (role === "system") return preferred || "Dispatch";
  return preferred || "Participant";
};

const initialsFor = (name = "") => {
  const pieces = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!pieces.length) return "?";
  if (pieces.length === 1) return pieces[0].slice(0, 2).toUpperCase();
  return `${pieces[0][0]}${pieces[pieces.length - 1][0]}`.toUpperCase();
};

const ensureUploadPath = (key = "") => {
  if (!key) return "";
  const raw = String(key).replace(/^\/+/, "");
  if (!raw) return "";
  if (raw.startsWith("uploads/")) return `/${raw}`;
  if (raw.startsWith("messages/")) return `/uploads/${raw}`;
  return `/uploads/messages/${raw}`;
};

const collectMessageAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : [];
  const media = Array.isArray(message?.media) ? message.media : [];
  return [...attachments, ...media].filter(
    (entry) => entry !== null && entry !== undefined
  );
};

const looksLikeVideo = (mime = "", url = "") => {
  const normalizedMime = String(mime).toLowerCase();
  if (normalizedMime.startsWith("video/")) return true;
  const extension = String(url)
    .split("?")[0]
    .split(".")
    .pop()
    ?.toLowerCase();
  return ["mp4", "mov", "webm", "m4v"].includes(extension);
};

export default function MessagingPanel({
  title = "Messages",
  subtitle = "",
  messages = [],
  participants = {},
  actorRole = "customer",
  canMessage = false,
  onSend,
  sending = false,
  loading = false,
  error = "",
  realtimeReady = false,
  typingIndicators = {},
  onTyping,
  onClose,
}) {
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [localError, setLocalError] = useState("");

  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  const viewerLabel = useMemo(() => {
    if (actorRole === "customer") {
      return participants.customer?.name || "You";
    }
    if (actorRole === "vendor") {
      return participants.vendor?.name || "You";
    }
    if (actorRole === "admin") {
      return participants.admin?.name || "You";
    }
    return "You";
  }, [
    actorRole,
    participants.admin?.name,
    participants.customer?.name,
    participants.vendor?.name,
  ]);

  const otherParticipant = useMemo(() => {
    if (actorRole === "customer") return participants.vendor;
    if (actorRole === "vendor") return participants.customer;
    if (actorRole === "admin") return participants.vendor || participants.customer;
    return null;
  }, [
    actorRole,
    participants.customer,
    participants.vendor,
  ]);

  const composerPlaceholder = useMemo(() => {
    if (!canMessage) return "Messaging is unavailable for this job.";
    if (actorRole === "customer" && !participants?.vendor) {
      return "Type a message for the ServiceOps team...";
    }
    if (actorRole === "vendor" && !participants?.customer) {
      return "Type a message for dispatch...";
    }
    if (actorRole === "admin") {
      return "Share an update with your customer or vendor...";
    }
    return "Type a message...";
  }, [
    actorRole,
    canMessage,
    participants?.customer,
    participants?.vendor,
  ]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, sending]);

  useEffect(
    () => () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    },
    [previews]
  );

  const handleFileChange = (event) => {
    const incoming = Array.from(event.target.files || []).slice(0, 6);
    const nextPreviews = incoming.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    setFiles(incoming);
    setPreviews(nextPreviews);
    setLocalError("");
    onTyping?.(true);
  };

  const removeFileAt = (index) => {
    const nextFiles = files.filter((_, i) => i !== index);
    const nextPreviews = previews.filter((_, i) => i !== index);
    const removed = previews[index];
    if (removed) URL.revokeObjectURL(removed.url);
    setFiles(nextFiles);
    setPreviews(nextPreviews);
  };

  const handleDraftChange = (event) => {
    const value = event.target.value.slice(0, MAX_MESSAGE_LENGTH);
    setDraft(value);
    onTyping?.(Boolean(value));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canMessage || sending) return;
    if (!onSend) return;
    const trimmed = draft.trim();
    if (!trimmed && files.length === 0) {
      setLocalError("Type a message or attach images.");
      return;
    }
    try {
      await onSend({ body: trimmed, files });
      setDraft("");
      setFiles([]);
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
      setPreviews([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setLocalError("");
      onTyping?.(false);
    } catch (err) {
      setLocalError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to send your message right now."
      );
    }
  };

  const composedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;

    if (actorRole === "customer") {
      const vendorName = participants.vendor?.name;
      if (vendorName) return `Chat with ${vendorName}`;
      if (!canMessage) return "We'll unlock chat once your vendor is assigned.";
      return "";
    }

    if (actorRole === "vendor") {
      const customerName = participants.customer?.name;
      if (customerName) return `Chat with ${customerName}`;
      return "";
    }

    if (actorRole === "admin") {
      if (participants.vendor?.name) return `Chat with ${participants.vendor.name}`;
      if (participants.customer?.name) return `Chat with ${participants.customer.name}`;
      return "Message participants directly from dispatch.";
    }

    if (!canMessage) {
      return "We'll unlock chat once your vendor is assigned.";
    }
    return "";
  }, [
    actorRole,
    canMessage,
    participants.customer?.name,
    participants.vendor?.name,
    subtitle,
  ]);

  const othersTyping = useMemo(() => {
    if (actorRole === "customer") {
      return Boolean(typingIndicators?.vendor || typingIndicators?.admin);
    }
    if (actorRole === "vendor") {
      return Boolean(typingIndicators?.customer || typingIndicators?.admin);
    }
    if (actorRole === "admin") {
      return Boolean(typingIndicators?.vendor || typingIndicators?.customer);
    }
    return Object.values(typingIndicators || {}).some(Boolean);
  }, [actorRole, typingIndicators]);

  return (
    <section className="message-panel">
      <header className="message-panel__header">
        <div>
          <h3>{title}</h3>
          {composedSubtitle ? (
            <p className="message-panel__subtitle">{composedSubtitle}</p>
          ) : null}
        </div>
        <div className="message-panel__header-actions">
          <span
            className={`message-panel__status ${
              realtimeReady ? "online" : "offline"
            }`}
          >
            <span className="message-panel__dot" aria-hidden="true" />
            {realtimeReady ? "Live" : "Offline"}
          </span>
          {onClose ? (
            <button
              type="button"
              className="message-panel__close"
              onClick={() => {
                onTyping?.(false);
                onClose();
              }}
              aria-label="Close conversation"
            >
              <LuX aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      <div className="message-panel__body">
        {loading ? (
          <div className="message-panel__empty">
            <div className="spinner" aria-hidden="true" />
            <p>Loading conversation...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="message-panel__empty">
            <p>
            {canMessage
              ? "No messages yet. Share details or photos once you're ready."
              : "Messaging is unavailable for this job."}
            </p>
          </div>
        ) : (
          <ul className="message-panel__list" ref={listRef}>
            {messages.map((msg) => {
              const mine =
                msg.senderRole === actorRole ||
                (actorRole === "admin" && msg.senderRole === "system");

              const nameHint =
                msg.senderName ||
                (msg.senderRole === "customer"
                  ? participants.customer?.name
                  : msg.senderRole === "vendor"
                  ? participants.vendor?.name
                  : msg.senderRole === "admin"
                  ? participants.admin?.name
                  : null) ||
                otherParticipant?.name ||
                "";

              const avatarInitials = mine
                ? initialsFor(viewerLabel)
                : initialsFor(nameHint);

              const label = mine ? "You" : roleLabel(msg.senderRole, nameHint);
              const attachments = collectMessageAttachments(msg);

              return (
                <li
                  key={msg.id}
                  className={`message-panel__item ${
                    mine ? "outgoing" : "incoming"
                  }`}
                >
                  {!mine ? (
                    <div className="message-panel__avatar" aria-hidden="true">
                      {avatarInitials}
                    </div>
                  ) : null}
                  <div className="message-panel__bubble">
                    <header className="message-panel__meta">
                      <span className="message-panel__sender">{label}</span>
                      <time className="message-panel__time">
                        {formatTimestamp(
                          msg.createdAt || msg.updatedAt || msg.sentAt
                        )}
                      </time>
                    </header>
                    {msg.body ? (
                      <p className="message-panel__text">{msg.body}</p>
                    ) : null}
                    {attachments.length > 0 ? (
                      <div className="message-panel__attachments">
                        {attachments.map((file, index) => {
                          const rawUrl = (() => {
                            if (typeof file === "string") return file;
                            return (
                              file?.url ||
                              file?.downloadUrl ||
                              file?.path ||
                              file?.href ||
                              file?.location ||
                              file?.previewUrl ||
                              ""
                            );
                          })();
                          const keyFallback =
                            typeof file === "object"
                              ? ensureUploadPath(
                                  file?.key ||
                                    file?.fileKey ||
                                    file?.filename ||
                                    file?.id
                                )
                              : "";
                          const resolvedUrl = resolveAttachmentUrl(
                            rawUrl || keyFallback
                          );
                          if (!resolvedUrl) return null;
                          const key = file?.key || resolvedUrl || index;
                          const displayName =
                            file?.fileName ||
                            file?.name ||
                            file?.filename ||
                            "Attachment";
                          const mime = file?.mimeType || file?.type || "";
                          const isVideo =
                            file?.kind === "video" ||
                            looksLikeVideo(mime, resolvedUrl);

                          if (isVideo) {
                            return (
                              <div
                                className="message-panel__attachment message-panel__attachment--video"
                                key={key}
                              >
                                <video controls preload="metadata">
                                  <source
                                    src={resolvedUrl}
                                    type={mime || "video/mp4"}
                                  />
                                  Your browser does not support the video tag.
                                </video>
                                <a
                                  className="message-panel__attachment-link"
                                  href={resolvedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {displayName ? `Open ${displayName}` : "Open video"}
                                </a>
                              </div>
                            );
                          }

                          return (
                            <a
                              key={key}
                              className="message-panel__attachment"
                              href={resolvedUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={resolvedUrl}
                                alt={displayName}
                                loading="lazy"
                              />
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {othersTyping ? (
              <li className="message-panel__typing">
                <span
                  className="message-panel__typing-avatar"
                  aria-hidden="true"
                >
                  {initialsFor(otherParticipant?.name || "...")}
                </span>
                <span
                  className="message-panel__typing-dots"
                  aria-live="polite"
                >
                  <span />
                  <span />
                  <span />
                </span>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {(error || localError) && (
        <div className="message-panel__error">
          {error || localError || "Something went wrong."}
        </div>
      )}

      <footer className="message-panel__composer">
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="message-draft">
            Message
          </label>
          <textarea
            id="message-draft"
            value={draft}
            onChange={handleDraftChange}
            placeholder={composerPlaceholder}
            disabled={!canMessage || sending}
            rows={3}
          />
          <div className="message-panel__controls">
            <div className="message-panel__attachments-preview">
              {previews.map((preview, index) => (
                <div key={preview.url} className="message-panel__chip">
                  <button
                    type="button"
                    onClick={() => removeFileAt(index)}
                    aria-label="Remove attachment"
                  >
                    x
                  </button>
                  <img src={preview.url} alt="Selected attachment" />
                </div>
              ))}
            </div>
            <div className="message-panel__actions">
              <label className="message-panel__upload">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={!canMessage || sending}
                  onChange={handleFileChange}
                />
                Add photos
              </label>
              <button
                type="submit"
                className="message-panel__submit"
                disabled={
                  sending ||
                  !canMessage ||
                  (draft.trim().length === 0 && files.length === 0)
                }
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </form>
      </footer>
    </section>
  );
}
