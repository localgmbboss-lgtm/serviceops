import client from "prom-client";

client.collectDefaultMetrics({
  prefix: "serviceops_",
  timeout: 10000,
});

export const metricsRegistry = client.register;

export const bidSubmissionCounter = new client.Counter({
  name: "serviceops_bid_submissions_total",
  help: "Count of bid submissions processed",
  labelNames: ["status"],
});

export const bidSelectionCounter = new client.Counter({
  name: "serviceops_bid_selections_total",
  help: "Count of bid selections processed",
  labelNames: ["status"],
});

export const publicJobCounter = new client.Counter({
  name: "serviceops_public_job_intake_total",
  help: "Count of public job intake attempts",
  labelNames: ["status"],
});

export const publicJobDuration = new client.Histogram({
  name: "serviceops_public_job_intake_duration_seconds",
  help: "Duration of public job intake processing in seconds",
  buckets: [0.1, 0.25, 0.5, 1, 2, 4, 8, 16],
});

export const bidSubmissionDuration = new client.Histogram({
  name: "serviceops_bid_submission_duration_seconds",
  help: "Duration of bid submission processing in seconds",
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

export const bidSelectionDuration = new client.Histogram({
  name: "serviceops_bid_selection_duration_seconds",
  help: "Duration of bid selection processing in seconds",
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});
