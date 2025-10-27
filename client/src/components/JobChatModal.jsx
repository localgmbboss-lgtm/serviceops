import { useMemo } from "react";
import MessagingPanel from "./MessagingPanel";
import { useJobMessaging } from "../hooks/useJobMessaging";

export default function JobChatModal({ job, onClose }) {
  const jobId = job?._id ? String(job._id) : null;
  const jobMedia = Array.isArray(job?.media) ? job.media : [];
  const hasMedia = jobMedia.length > 0;

  const {
    messages,
    participants,
    sendMessage,
    sending,
    loading,
    error,
    canMessage,
    realtimeReady,
    typingIndicators,
    emitTyping,
  } = useJobMessaging({ jobId, role: "admin" });

  const subtitle = useMemo(() => {
    if (!job) return "";
    const service = job.serviceType || "Job";
    const pickup = job.pickupAddress || "No pickup address";
    return `${service} - ${pickup}`;
  }, [job]);

  const fatalError = Boolean(error && !loading && !messages.length);
  const panelError = fatalError ? "" : error;
  const panelCanMessage = fatalError ? false : canMessage;

  if (!jobId) return null;

  return (
    <div
      className="jobtable-followup-overlay jobtable-chat-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`job-chat-${jobId}`}
    >
      <div className="jobtable-followup-backdrop jobtable-chat-backdrop" onClick={onClose} />
      <div
        className="jobtable-chat-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        {hasMedia && (
          <div className="jobtable-chat-media">
            {jobMedia.map((item) => {
              const key = item.key || item.url;
              const isVideo =
                item.kind === "video" || item.mimeType?.startsWith("video/");

              return (
                <figure key={key}>
                  {isVideo ? (
                    <video controls preload="metadata">
                      <source src={item.url} type={item.mimeType || "video/mp4"} />
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      <img
                        src={item.url}
                        alt={item.fileName || "Job attachment"}
                        loading="lazy"
                      />
                    </a>
                  )}
                  {item.fileName ? (
                    <figcaption>{item.fileName}</figcaption>
                  ) : null}
                </figure>
              );
            })}
          </div>
        )}
        {fatalError && (
          <div className="jobtable-chat-error">
            <p>{error}</p>
            <button type="button" className="btn tiny ghost" onClick={onClose}>
              Close
            </button>
          </div>
        )}
        <MessagingPanel
          title="Job chat"
          subtitle={subtitle}
          messages={messages}
          participants={participants}
          actorRole="admin"
          canMessage={panelCanMessage}
          onSend={sendMessage}
          sending={sending}
          loading={loading}
          error={panelError}
          realtimeReady={realtimeReady}
          typingIndicators={typingIndicators}
          onTyping={emitTyping}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

