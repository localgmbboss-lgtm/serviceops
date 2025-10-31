// server/src/index.js
import "dotenv/config";
import { createServer } from "http";
import { connectDB } from "./lib/db.js";
import { initRealtime } from "./realtime/index.js";
import { startUnbidMonitor } from "./automation/unbidMonitor.js";
import { logger } from "./lib/logger.js";
import { app, allowedOrigins, allowAllOrigins } from "./app.js";

const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB(process.env.MONGO_URI);

  const realtime = initRealtime(httpServer, {
    allowedOrigins: [...allowedOrigins],
    allowAllOrigins,
  });
  app.locals.io = realtime;

  startUnbidMonitor();

  httpServer.listen(PORT, () => {
    const env = process.env.NODE_ENV || "development";
    logger.info({ port: PORT, env }, "API listening");

    const externalUrl =
      process.env.RENDER_EXTERNAL_URL ||
      process.env.PUBLIC_URL ||
      process.env.APP_BASE_URL;

    if (externalUrl) {
      logger.info({ externalUrl }, "External URL configured");
    }
  });
})();
