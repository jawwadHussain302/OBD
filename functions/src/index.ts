import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// Minimal health check endpoint
export const health = onRequest((request, response) => {
  response.status(200).send({ status: "ok" });
});

// Placeholder for future AI proxy functionality
export const aiProxy = onRequest((request, response) => {
  logger.info("AI Proxy placeholder called!", { structuredData: true });
  response.send({ status: "success", message: "AI Proxy is not yet implemented" });
});
