import { useEffect, useMemo, useState } from "react";
import { LuMessageCircle } from "react-icons/lu";
import MessagingPanel from "./MessagingPanel";
import "./ChatOverlay.css";

export default function ChatOverlay({
  title,
  subtitle,
  messages,
  participants,
  actorRole,
  canMessage,
  onSend,
  sending,
  loading,
  error,
  realtimeReady,
  typingIndicators,
  onTyping,
  unreadCount = 0,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
      onTyping?.(false);
    }
  }, [defaultOpen, onTyping]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        onTyping?.(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onTyping]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const { body } = document;
    if (!body) return undefined;

    if (!open) {
      body.classList.remove("chat-overlay-open");
      return undefined;
    }

    const previousOverflow = body.style.overflow;
    body.classList.add("chat-overlay-open");
    body.style.overflow = "hidden";

    return () => {
      body.classList.remove("chat-overlay-open");
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  const badgeLabel = useMemo(() => {
    if (!unreadCount) return null;
    return unreadCount > 9 ? "9+" : String(unreadCount);
  }, [unreadCount]);

  return (
    <>
      <button
        type="button"
        className={`chat-overlay__fab${open ? " is-open" : ""}`}
        onClick={() => {
          setOpen(true);
          onTyping?.(false);
        }}
        aria-expanded={open}
        aria-label="Open messaging"
      >
        <LuMessageCircle aria-hidden="true" />
        {badgeLabel ? (
          <span className="chat-overlay__badge" aria-live="polite">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="chat-overlay__backdrop"
          onClick={() => {
            setOpen(false);
            onTyping?.(false);
          }}
        >
          <div
            className="chat-overlay__modal"
            onClick={(event) => event.stopPropagation()}
          >
            <MessagingPanel
              title={title}
              subtitle={subtitle}
              messages={messages}
              participants={participants}
              actorRole={actorRole}
              canMessage={canMessage}
              onSend={onSend}
              sending={sending}
              loading={loading}
              error={error}
              realtimeReady={realtimeReady}
              typingIndicators={typingIndicators}
              onTyping={onTyping}
              onClose={() => {
                setOpen(false);
                onTyping?.(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
