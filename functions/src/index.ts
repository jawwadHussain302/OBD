import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAiApiKey } from "./config";

// Placeholder for future AI proxy functionality
export const aiProxy = onRequest((request, response) => {
  logger.info("AI Proxy placeholder called!", { structuredData: true });
  response.send({ status: "success", message: "AI Proxy is not yet implemented" });
});

export const aiDiagnose = onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send();
    return;
  }

  const evidence = request.body?.evidence;
  const prompt = request.body?.prompt;

  if (!evidence || !prompt) {
    response.status(400).send();
    return;
  }

  const apiKey = getAiApiKey();
  if (!apiKey) {
    response.status(500).send({
      status: "error",
      code: "missing_ai_key",
      message: "AI API key is not configured"
    });
    return;
  }

  try {
    // Call Gemini AI
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const aiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${prompt}\n\nEvidence:\n${JSON.stringify(evidence)}` }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API failed with status ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const textResponse = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    let result;
    try {
      result = JSON.parse(textResponse || "{}");
    } catch (e) {
      result = {
        primary_issue: "Unknown issue",
        confidence: "Low",
        evidence: [],
        explanation: textResponse || "Failed to parse AI response.",
        next_steps: []
      };
    }

    // Ensure the response matches the required structured format
    const formattedResult = {
      primary_issue: result.primary_issue || "Unknown issue",
      confidence: result.confidence || "Low",
      evidence: Array.isArray(result.evidence) ? result.evidence : [],
      explanation: result.explanation || "No explanation provided.",
      next_steps: Array.isArray(result.next_steps) ? result.next_steps : []
    };

    response.status(200).send({
      status: "ok",
      result: formattedResult
    });
  } catch (error) {
    logger.error("AI API call failed", { error });
    response.status(500).send({
      status: "error",
      code: "ai_api_error",
      message: "Failed to communicate with AI provider"
    });
  }
});
