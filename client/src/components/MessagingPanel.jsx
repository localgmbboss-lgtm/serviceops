import { useEffect, useMemo, useRef, useState } from "react";
import "./MessagingPanel.css";

const MAX_MESSAGE_LENGTH = 2000;

const formatTimestamp = (iso) => {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
};

const roleLabel = (role) => {
  if (role === "customer") return "You";
  if (role === "vendor") return "Vendor";
  return "System";
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

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, sending]);

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

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
  };

  const removeFileAt = (index) => {
    const nextFiles = files.filter((_, i) => i !== index);
    const nextPreviews = previews.filter((_, i) => i !== index);
    const removed = previews[index];
    if (removed) URL.revokeObjectURL(removed.url);
    setFiles(nextFiles);
    setPreviews(nextPreviews);
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

  return (
    <section className="message-panel card">
      <header className="message-panel__header">
        <div>
          <h3>{title}</h3>
          {composedSubtitle ? (
            <p className="message-panel__subtitle">{composedSubtitle}</p>
          ) : null}
        </div>
        <div className="message-panel__status">
          <span
            className={`message-panel__dot ${
              realtimeReady ? "online" : "offline"
            }`}
            aria-hidden="true"
          />
          <span>{realtimeReady ? "Live" : "Offline"}</span>
        </div>
      </header>

      <div className="message-panel__body">
        {loading ? (
          <div className="message-panel__empty">
            <div className="spinner" aria-hidden="true" />
            <p>Loading conversation…</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="message-panel__empty">
            <p>
              {canMessage
                ? "No messages yet. Share details or photos once you're ready."
                : "Messaging will open automatically once a vendor is assigned."}
            </p>
          </div>
        ) : (
          <ul className="message-panel__thread" ref={listRef}>
            {messages.map((msg) => {
              const mine = msg.senderRole === actorRole;
              const alignClass = mine ? "outgoing" : "incoming";
              const label = mine
                ? viewerLabel
                : participants[msg.senderRole]?.name ||
                  roleLabel(msg.senderRole);
              return (
                <li
                  key={msg.id}
                  className={`message-panel__item ${alignClass}`}
                >
                  <div className="message-panel__bubble">
                    <header>
                      <span className="message-panel__sender">{label}</span>
                      <time className="message-panel__time">
                        {formatTimestamp(msg.createdAt)}
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
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="message-panel__composer">
        {error || localError ? (
          <div className="message-panel__error">
            {error || localError || "Something went wrong."}
          </div>
        ) : null}
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="message-draft">
            Message
          </label>
          <textarea
            id="message-draft"
            value={draft}
            onChange={(event) =>
              setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))
            }
            placeholder={
              canMessage
                ? "Type a message for your vendor…"
                : "Messaging is locked until your vendor is assigned."
            }
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
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </form>
      </footer>
    </section>
  );
}
