import { useEffect, useMemo, useRef, useState } from "react";
import { LuX } from "react-icons/lu";
import "./MessagingPanel.css";

const MAX_MESSAGE_LENGTH = 2000;

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

const roleLabel = (role, viewerLabel) => {
  if (viewerLabel && role !== "system") return viewerLabel;
  if (role === "customer") return "You";
  if (role === "vendor") return "Vendor";
  return "System";
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
    return "You";
  }, [actorRole, participants.customer?.name, participants.vendor?.name]);

const otherParticipant = useMemo(
  () =>
    actorRole === "customer"
      ? participants.vendor
      : participants.customer,
  [actorRole, participants.customer, participants.vendor]
);

  const composerPlaceholder = useMemo(() => {
    if (!canMessage) return "Messaging is unavailable for this job.";
    if (actorRole === "customer" && !participants?.vendor) {
      return "Type a message for the ServiceOps team...";
    }
    if (actorRole === "vendor" && !participants?.customer) {
      return "Type a message for dispatch...";
    }
    return "Type a message...";
  }, [actorRole, canMessage, participants?.customer, participants?.vendor]);

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
    const vendorName = participants.vendor?.name;
    if (vendorName) {
      return `Chat with ${vendorName}`;
    }
    if (!canMessage) {
      return "We’ll unlock chat once your vendor is assigned.";
    }
    return "";
  }, [canMessage, participants.vendor?.name, subtitle]);

  const othersTyping = useMemo(() => {
    const indicator =
      actorRole === "customer"
        ? typingIndicators?.vendor
        : typingIndicators?.customer;
    return Boolean(indicator);
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
              const mine = msg.senderRole === actorRole;
              const avatarInitials = mine
                ? initialsFor(viewerLabel)
                : initialsFor(
                    otherParticipant?.name || msg.senderName || ""
                  );
              const label = mine
                ? "You"
                : roleLabel(
                    msg.senderRole,
                    otherParticipant?.name || msg.senderName
                  );

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
                    {Array.isArray(msg.attachments) &&
                    msg.attachments.length > 0 ? (
                      <div className="message-panel__attachments">
                        {msg.attachments.map((file) => (
                          <a
                            key={file.key || file.url}
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={file.url}
                              alt={file.fileName || "Vehicle photo"}
                              loading="lazy"
                            />
                          </a>
                        ))}
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
                    ×
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
