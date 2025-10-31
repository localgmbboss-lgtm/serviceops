import Settings from "../models/Settings.js";

const DEFAULT_WORKFLOW = Object.freeze({
  requireDriverDocs: true,
  requireVendorDocs: true,
  showBusinessDocs: true,
  showLiveDriverMap: true,
  showLiveVendorMap: true,
  advancedJobWorkflow: false,
  enableCustomerPaymentScreen: false,
  enableReviewFunnel: true,
  multiServiceMode: true,
  showReportsTab: true,
  enableMessaging: false,
});

let cachedWorkflow = DEFAULT_WORKFLOW;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 1000;

export async function getWorkflowSettings({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedWorkflow && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedWorkflow;
  }

  const doc = await Settings.findOne({}, { workflow: 1 }).lean().exec();
  const workflow = {
    ...DEFAULT_WORKFLOW,
    ...(doc?.workflow || {}),
  };

  cachedWorkflow = workflow;
  cacheTimestamp = now;
  return workflow;
}

export async function isMessagingEnabled() {
  const workflow = await getWorkflowSettings();
  return Boolean(workflow.enableMessaging);
}

