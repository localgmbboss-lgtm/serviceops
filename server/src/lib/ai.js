import OpenAI from "openai";

let cachedClient = null;

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || "";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const sanitize = (value) => {
  if (!value) return "";
  return String(value).trim();
};

export function isAIEnabled() {
  return Boolean(OPENAI_API_KEY && OPENAI_API_KEY.trim());
}

export function getOpenAIClient() {
  if (!isAIEnabled()) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }
  return cachedClient;
}

export async function getJobCreationAdvice(payload = {}) {
  if (!isAIEnabled()) {
    throw new Error("AI assistance is disabled until OPENAI_API_KEY is configured.");
  }

  const client = getOpenAIClient();
  const model = sanitize(DEFAULT_MODEL);
  const job = payload.job || {};
  const company = payload.company || {};

  const summary = {
    serviceType: sanitize(job.serviceType),
    pickupAddress: sanitize(job.pickupAddress),
    dropoffAddress: sanitize(job.dropoffAddress),
    priority: sanitize(job.priority),
    notes: sanitize(job.notes),
    customerName: sanitize(job.customerName),
    customerPhone: sanitize(job.customerPhone),
    urgency: sanitize(job.urgency),
    pricing: {
      quotedPrice: Number.isFinite(Number(job.quotedPrice))
        ? Number(job.quotedPrice)
        : null,
      currency: sanitize(job.currency || "USD"),
    },
  };

  const org = {
    name: sanitize(company.name) || "ServiceOps Admin",
    region: sanitize(company.region),
    services: Array.isArray(company.services) ? company.services.slice(0, 10) : [],
  };

  const prompt = `
You are ServiceOps Copilot, an operations assistant for roadside dispatchers.
Provide concise, actionable help for new job entries. Use bullet lists where helpful.

Job context:
- Service type: ${summary.serviceType || "Unknown"}
- Pickup: ${summary.pickupAddress || "Unknown"}
- Drop-off: ${summary.dropoffAddress || "N/A"}
- Priority: ${summary.priority || "normal"}
- Urgency notes: ${summary.urgency || "not provided"}
- Quoted price: ${summary.pricing.quotedPrice ?? "unknown"} ${summary.pricing.currency}
- Additional notes: ${summary.notes || "none"}
- Customer: ${summary.customerName || "n/a"} (${summary.customerPhone || "n/a"})

Organization info:
- Name: ${org.name}
- Region: ${org.region || "unspecified"}
- Services offered: ${org.services.length ? org.services.join(", ") : "general roadside assistance"}

Return a JSON object with:
{
  "summary": "single sentence highlighting key details",
  "recommendedVendorActions": ["..."],
  "customerCommunication": ["..."],
  "riskFlags": ["..."],
  "dataGaps": ["..."],
  "suggestedAddOns": ["..."]
}

Make each array concise (max 3 entries) and omit empty lists (return []).
`;

  const response = await client.chat.completions.create({
    model: model || "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are a concise operations assistant for the ServiceOps platform.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const raw = response?.choices?.[0]?.message?.content || "";
  if (!raw) {
    throw new Error("OpenAI returned an empty response.");
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      summary: sanitize(parsed.summary),
      recommendedVendorActions: Array.isArray(parsed.recommendedVendorActions)
        ? parsed.recommendedVendorActions.map(sanitize).filter(Boolean)
        : [],
      customerCommunication: Array.isArray(parsed.customerCommunication)
        ? parsed.customerCommunication.map(sanitize).filter(Boolean)
        : [],
      riskFlags: Array.isArray(parsed.riskFlags)
        ? parsed.riskFlags.map(sanitize).filter(Boolean)
        : [],
      dataGaps: Array.isArray(parsed.dataGaps)
        ? parsed.dataGaps.map(sanitize).filter(Boolean)
        : [],
      suggestedAddOns: Array.isArray(parsed.suggestedAddOns)
        ? parsed.suggestedAddOns.map(sanitize).filter(Boolean)
        : [],
      raw,
    };
  } catch (error) {
    return {
      summary: sanitize(raw),
      recommendedVendorActions: [],
      customerCommunication: [],
      riskFlags: [],
      dataGaps: [],
      suggestedAddOns: [],
      raw,
      parseError: error.message,
    };
  }
}

export async function getVendorRecommendations(payload = {}) {
  if (!isAIEnabled()) {
    throw new Error("AI assistance is disabled until OPENAI_API_KEY is configured.");
  }

  const client = getOpenAIClient();
  const model = sanitize(DEFAULT_MODEL);
  const job = payload.job || {};
  const vendors = Array.isArray(payload.vendors) ? payload.vendors : [];

  if (!vendors.length) {
    throw new Error("No vendor profiles supplied for recommendation.");
  }

  const jobSummary = {
    serviceType: sanitize(job.serviceType),
    pickupAddress: sanitize(job.pickupAddress),
    dropoffAddress: sanitize(job.dropoffAddress),
    notes: sanitize(job.notes),
    priority: sanitize(job.priority || "normal"),
    bidMode: sanitize(job.bidMode || "open"),
    fulfillment: sanitize(job.fulfillment || "market"),
    quotedPrice: Number.isFinite(Number(job.quotedPrice))
      ? Number(job.quotedPrice)
      : null,
    heavyDuty: Boolean(job.heavyDuty),
    openBidding: Boolean(job.openBidding),
    hasCustomer: Boolean(job.customerName || job.customerPhone),
  };

  const truncatedVendors = vendors.slice(0, 12).map((vendor) => ({
    id: sanitize(vendor.id),
    name: sanitize(vendor.name),
    city: sanitize(vendor.city),
    services: Array.isArray(vendor.services)
      ? vendor.services.slice(0, 6).map(sanitize)
      : [],
    heavyDuty: Boolean(vendor.heavyDuty),
    radiusKm: Number.isFinite(Number(vendor.radiusKm))
      ? Number(vendor.radiusKm)
      : null,
    complianceStatus: sanitize(vendor.complianceStatus || "pending"),
    updatesPaused: Boolean(vendor.updatesPaused),
    active: vendor.active !== false,
    lastSeenMinutesAgo: Number.isFinite(Number(vendor.lastSeenMinutesAgo))
      ? Number(vendor.lastSeenMinutesAgo)
      : null,
    stats: {
      totalAssigned: Number.isFinite(Number(vendor?.stats?.totalAssigned))
        ? Number(vendor.stats.totalAssigned)
        : 0,
      completed: Number.isFinite(Number(vendor?.stats?.completed))
        ? Number(vendor.stats.completed)
        : 0,
      completedLast30: Number.isFinite(Number(vendor?.stats?.completedLast30))
        ? Number(vendor.stats.completedLast30)
        : 0,
      openJobs: Number.isFinite(Number(vendor?.stats?.openJobs))
        ? Number(vendor.stats.openJobs)
        : 0,
      avgArrivalMinutes: Number.isFinite(
        Number(vendor?.stats?.avgArrivalMinutes)
      )
        ? Number(vendor.stats.avgArrivalMinutes)
        : null,
      avgCompletionMinutes: Number.isFinite(
        Number(vendor?.stats?.avgCompletionMinutes)
      )
        ? Number(vendor.stats.avgCompletionMinutes)
        : null,
    },
  }));

  const prompt = `
You are ServiceOps Copilot, helping dispatchers decide which vendor to assign to a job.

Job details (JSON):
${JSON.stringify(jobSummary, null, 2)}

Candidate vendors (JSON array):
${JSON.stringify(truncatedVendors, null, 2)}

Task:
- Rank the top 3 vendors (less if fewer suitable) that best fit the job.
- Consider service fit, heavy duty capability, compliance, responsiveness (stats), and availability.
- Avoid vendors with updates paused or compliance issues unless no alternatives.
- Include at least one backup option when possible.

Return strict JSON:
{
  "recommended": [
    {
      "vendorId": "ID from input",
      "score": 0-100,
      "priority": "primary" | "backup",
      "reason": "short explanation"
    }
  ],
  "notes": ["..."] // optional additional tips
}
`;

  const response = await client.chat.completions.create({
    model: model || "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are a cautious dispatch assistant focused on safe, reliable vendor assignments.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const raw = response?.choices?.[0]?.message?.content || "";
  if (!raw) {
    throw new Error("OpenAI returned an empty response.");
  }

  try {
    const parsed = JSON.parse(raw);
    const recommended = Array.isArray(parsed.recommended)
      ? parsed.recommended
          .map((entry) => ({
            vendorId: sanitize(entry.vendorId),
            score: Number.isFinite(Number(entry.score))
              ? Number(entry.score)
              : null,
            priority:
              entry.priority === "primary" || entry.priority === "backup"
                ? entry.priority
                : "primary",
            reason: sanitize(entry.reason),
          }))
          .filter((entry) => entry.vendorId)
      : [];

    return {
      recommended,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.map(sanitize).filter(Boolean)
        : [],
      raw,
    };
  } catch (error) {
    return {
      recommended: [],
      notes: [],
      raw,
      parseError: error.message,
    };
  }
}

export async function getOperationsDigest(payload = {}) {
  if (!isAIEnabled()) {
    throw new Error("AI assistance is disabled until OPENAI_API_KEY is configured.");
  }

  const client = getOpenAIClient();
  const model = sanitize(DEFAULT_MODEL);

  const rangeLabel = sanitize(payload.rangeLabel || "Daily");
  const metrics = payload.metrics || {};
  const highlights = Array.isArray(payload.highlights) ? payload.highlights : [];
  const blockers = Array.isArray(payload.blockers) ? payload.blockers : [];
  const escalations = Array.isArray(payload.escalations) ? payload.escalations : [];
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const notes = Array.isArray(payload.notes) ? payload.notes : [];

  const prompt = `
You are ServiceOps Copilot. Build a concise ${rangeLabel.toLowerCase()} operations digest for the admin team.
Use short bullet lists. Highlight wins, risks, and recommended actions.

Key metrics (JSON):
${JSON.stringify(metrics, null, 2)}

Highlights (array of strings):
${JSON.stringify(highlights, null, 2)}

Risks/blockers (array of strings):
${JSON.stringify(blockers, null, 2)}

Escalations needing follow-up (array of strings):
${JSON.stringify(escalations, null, 2)}

Notable chat snippets (array of { jobLabel, speaker, body }):
${JSON.stringify(messages, null, 2)}

Additional notes:
${JSON.stringify(notes, null, 2)}

Return strict JSON:
{
  "summary": "2-3 sentence recap",
  "wins": ["bullet items"],
  "risks": ["bullet items"],
  "nextActions": ["action items with owners if possible"],
  "followUps": ["specific follow-ups (job references, vendor/customer)"],
  "tone": "Encouraging note to team"
}
If a section would be empty, return an empty array.
`;

  const response = await client.chat.completions.create({
    model: model || "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are an operations chief of staff. Produce structured, actionable summaries.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const raw = response?.choices?.[0]?.message?.content || "";
  if (!raw) {
    throw new Error("OpenAI returned an empty response.");
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      summary: sanitize(parsed.summary),
      wins: Array.isArray(parsed.wins) ? parsed.wins.map(sanitize).filter(Boolean) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(sanitize).filter(Boolean) : [],
      nextActions: Array.isArray(parsed.nextActions)
        ? parsed.nextActions.map(sanitize).filter(Boolean)
        : [],
      followUps: Array.isArray(parsed.followUps)
        ? parsed.followUps.map(sanitize).filter(Boolean)
        : [],
      tone: sanitize(parsed.tone),
      raw,
    };
  } catch (error) {
    return {
      summary: sanitize(raw),
      wins: [],
      risks: [],
      nextActions: [],
      followUps: [],
      tone: "",
      raw,
      parseError: error.message,
    };
  }
}

export async function getFollowupDraft(payload = {}) {
  if (!isAIEnabled()) {
    throw new Error("AI assistance is disabled until OPENAI_API_KEY is configured.");
  }

  const client = getOpenAIClient();
  const model = sanitize(DEFAULT_MODEL);

  const job = payload.job || {};
  const recipient = payload.recipient || {};
  const context = payload.context || {};

  const prompt = `
You are ServiceOps Copilot. Draft a concise in-app chat message that keeps a job moving.

Job details:
${JSON.stringify(job, null, 2)}

Recipient:
${JSON.stringify(recipient, null, 2)}

Context:
${JSON.stringify(context, null, 2)}

Return strict JSON:
{
  "message": "chat-ready message with greeting and signature",
  "internalNotes": ["short dispatcher reminders"]
}

Guidelines:
- Keep tone proactive, respectful, and human.
- Mention missing details tactfully when needed.
- Close with the exact signature block:

Best regards,
Customer Service Team
ServiceOps
1 (888) 362-3743
`;

  const response = await client.chat.completions.create({
    model: model || "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You help dispatchers communicate quickly inside the ServiceOps chat. Keep messages human, calm, and action-focused.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const raw = response?.choices?.[0]?.message?.content || "";
  if (!raw) {
    throw new Error("OpenAI returned an empty response.");
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      message: sanitize(parsed.message),
      internalNotes: Array.isArray(parsed.internalNotes)
        ? parsed.internalNotes.map(sanitize).filter(Boolean)
        : [],
      raw,
    };
  } catch (error) {
    return {
      message: sanitize(raw),
      internalNotes: [],
      raw,
      parseError: error.message,
    };
  }
}
