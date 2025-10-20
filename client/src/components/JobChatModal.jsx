import { useMemo } from "react";
import MessagingPanel from "./MessagingPanel";
import { useJobMessaging } from "../hooks/useJobMessaging";

export default function JobChatModal({ job, onClose }) {
  const jobId = job?._id ? String(job._id) : null;

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
      className="jobtable-followup-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`job-chat-${jobId}`}
    >
      <div className="jobtable-followup-backdrop" onClick={onClose} />
      <div
        className="jobtable-chat-dialog"
        onClick={(event) => event.stopPropagation()}
      >
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
