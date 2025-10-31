import pino from "pino";

const level = process.env.LOG_LEVEL || "warn";

export const logger = pino({
  level,
  base: {
    service: "serviceops-api",
    env: process.env.NODE_ENV || "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export const childLogger = (bindings) => logger.child(bindings);
