import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// Placeholder for future AI proxy functionality
export const aiProxy = onRequest((request, response) => {
  logger.info("AI Proxy placeholder called!", { structuredData: true });
  response.send({ status: "success", message: "AI Proxy is not yet implemented" });
});
