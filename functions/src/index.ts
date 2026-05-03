import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// Placeholder for future AI proxy functionality
export const aiProxy = onRequest((request, response) => {
  logger.info("AI Proxy placeholder called!", { structuredData: true });
  response.send({ status: "success", message: "AI Proxy is not yet implemented" });
});

export const aiDiagnose = onRequest((request, response) => {
  if (request.method !== "POST") {
    response.status(405).send({ error: "Method Not Allowed" });
    return;
  }

  const evidence = request.body?.evidence;

  if (!evidence) {
    response.status(400).send({ error: "Missing evidence in request body" });
    return;
  }

  response.status(200).send({
    status: "ok",
    message: "AI diagnose endpoint ready",
    receivedEvidence: true
  });
});
