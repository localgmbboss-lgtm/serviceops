import Outbox from "../models/Outbox.js";

let twilioClient = null;
const { TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM } = process.env;
if (TWILIO_SID && TWILIO_TOKEN) {
  const twilio = await import("twilio");
  twilioClient = twilio.default(TWILIO_SID, TWILIO_TOKEN);
}

/**
 * Send SMS if Twilio creds exist, else queue in Outbox.
 * Returns { ok, queuedId? } or throws.
 */
export async function notifySMS(to, body, jobId = null) {
  if (!to || !body) throw new Error("Missing to/body");

  if (twilioClient && TWILIO_FROM) {
    try {
      await twilioClient.messages.create({ from: TWILIO_FROM, to, body });
      return { ok: true };
    } catch (e) {
      // fall back to queue if Twilio fails
      const rec = await Outbox.create({
        kind: "sms",
        to,
        body,
        jobId,
        status: "failed",
        error: e.message,
      });
      return { ok: false, queuedId: rec._id };
    }
  }

  // No Twilio → queue for later
  const rec = await Outbox.create({
    kind: "sms",
    to,
    body,
    jobId,
    status: "queued",
  });
  return { ok: true, queuedId: rec._id };
}
