import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

const MODEL = "claude-haiku-4-5-20251001";

// Reject any payload larger than 64 KB — real evidence objects are well under 4 KB.
const MAX_PAYLOAD_BYTES = 64 * 1024;

// ── System prompt (v3 — must stay in sync with AiPromptService) ───────────────
const SYSTEM_PROMPT = `You are a vehicle diagnostic assistant inside a professional OBD2 tool used by mechanics and workshops.

RULES — follow every rule without exception:
1. Only use evidence in the user message. Do not introduce symptoms, components, or causes not listed there.
2. Do not mention part numbers, prices, labour times, or specific brands.
3. Respond ONLY with a single valid JSON object — no markdown, no text outside the JSON.
4. "primary_issue": when a fault code is present, start with the code: e.g. "P0171 — Lean Condition (Vacuum Leak)". When no code, use the cause title directly. Max 80 chars.
5. "explanation" (20–120 words): open with what the car is actually doing, not the DTC system. Start with "Your engine...", "The fuel mixture...", or similar owner-facing language. Name the fault code if one is present.
6. "evidence": each item must cite a DTC code, a measured signal value, or a verbatim correlation finding. NEVER write generic phrases like "vehicle has a fault" or "fault detected".
7. "confidence": use the primaryCause confidence exactly. If the diagnosis is partial, drop one level (High → Medium, Medium → Low). If no primaryCause, use "Low".
8. "next_steps": workshop-ready actions, ordered Immediate first, then Soon, then Routine. Max 4 items. Never write "check the vehicle" or "consult a garage".
9. Clean diagnosis (no fault codes, no findings): set primary_issue to "No fault detected", confidence "Low", first next_step "No immediate action required — monitor and schedule routine service".

SCHEMA:
{
  "primary_issue": "<DTC + short title if applicable, ≤80 chars>",
  "confidence": "High" | "Medium" | "Low",
  "evidence": ["<DTC code / signal value / finding>", ...],
  "explanation": "<20–120 words, owner-facing language>",
  "next_steps": ["<Immediate action>", "<Soon action>", ...]
}

GOOD EXAMPLE (vacuum leak scenario):
{
  "primary_issue": "P0171 — Lean Condition (Vacuum / Intake Leak)",
  "confidence": "High",
  "evidence": ["P0171: System Too Lean (Bank 1)", "STFT B1 +18% at idle, drops to +4% at 2500 RPM", "Vacuum leak pattern: trims improve at higher RPM"],
  "explanation": "Your engine is pulling in extra unmetered air through a gap in the intake system. The short-term fuel trim is very high at idle but normalises under load, which is the classic signature of a vacuum or intake leak rather than a fuel delivery problem.",
  "next_steps": ["Perform intake smoke test with engine running to locate air leak", "Inspect PCV valve and breather hose for cracks", "Check all intake hoses between air filter and throttle body", "Clear DTC and verify STFT returns to ±5% after repair"]
}

NEGATIVE EXAMPLES — never produce:
  BAD evidence:    "The vehicle shows signs of a fault"     → GENERIC
  BAD next_step:   "Check the car at a garage"             → VAGUE
  BAD explanation: "The engine management system has detected P0171..." → TEXTBOOK
  BAD primary_issue: "Engine fault detected"               → NOT SPECIFIC`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SafeEvidence {
  severityScore: number;
  severityLevel: string;
  dtcs: { code: string; title: string; severity?: string }[];
  primaryCause: { title: string; confidence: string; explanation: string } | null;
  additionalCauses: { title: string; confidence: string }[];
  correlationFindings: string[];
  recommendedChecks: string[];
  fuelTrimNote: string | null;
  idleStabilityNote: string | null;
  isPartial: boolean;
}

interface RequestContext {
  vehicle?: string;
  engine?: string;
  source?: string;
}

interface DiagnosisResponse {
  requestId: string;
  primary_issue: string;
  confidence: "High" | "Medium" | "Low";
  explanation: string;
  next_steps: string[];
  warnings: string[];
  evidence: string[];
}

// ── Input validation & coercion ───────────────────────────────────────────────

function isNonNullObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function coerceStringArray(val: unknown, max: number, maxItemLen = 200): string[] {
  if (!Array.isArray(val)) return [];
  return (val as unknown[])
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map(v => v.trim().slice(0, maxItemLen))
    .slice(0, max);
}

function coerceEvidence(raw: Record<string, unknown>): SafeEvidence {
  const dtcArr = Array.isArray(raw["dtcs"]) ? (raw["dtcs"] as unknown[]) : [];
  const dtcs = dtcArr
    .filter(isNonNullObject)
    .map(d => ({
      code: typeof d["code"] === "string" ? d["code"].slice(0, 10) : "",
      title: typeof d["title"] === "string" ? d["title"].slice(0, 80) : "",
      ...(typeof d["severity"] === "string" ? { severity: d["severity"].slice(0, 20) } : {}),
    }))
    .filter(d => d.code.length > 0)
    .slice(0, 10);

  const rawPc = isNonNullObject(raw["primaryCause"]) ? raw["primaryCause"] : null;
  const primaryCause =
    rawPc !== null && typeof rawPc["title"] === "string" && rawPc["title"].trim()
      ? {
          title: rawPc["title"].trim().slice(0, 100),
          confidence:
            typeof rawPc["confidence"] === "string"
              ? rawPc["confidence"].slice(0, 20)
              : "Low",
          explanation:
            typeof rawPc["explanation"] === "string"
              ? rawPc["explanation"].slice(0, 400)
              : "",
        }
      : null;

  const additionalCauses = (
    Array.isArray(raw["additionalCauses"]) ? (raw["additionalCauses"] as unknown[]) : []
  )
    .filter(isNonNullObject)
    .map(c => ({
      title:
        typeof c["title"] === "string" ? c["title"].slice(0, 100) : "",
      confidence:
        typeof c["confidence"] === "string" ? c["confidence"].slice(0, 20) : "Low",
    }))
    .filter(c => c.title.length > 0)
    .slice(0, 5);

  return {
    severityScore:
      typeof raw["severityScore"] === "number"
        ? Math.min(100, Math.max(0, Math.round(raw["severityScore"])))
        : 0,
    severityLevel:
      typeof raw["severityLevel"] === "string"
        ? raw["severityLevel"].slice(0, 20)
        : "Unknown",
    dtcs,
    primaryCause,
    additionalCauses,
    correlationFindings: coerceStringArray(raw["correlationFindings"], 10),
    recommendedChecks: coerceStringArray(raw["recommendedChecks"], 10),
    fuelTrimNote:
      typeof raw["fuelTrimNote"] === "string"
        ? raw["fuelTrimNote"].slice(0, 200)
        : null,
    idleStabilityNote:
      typeof raw["idleStabilityNote"] === "string"
        ? raw["idleStabilityNote"].slice(0, 200)
        : null,
    isPartial: raw["isPartial"] === true,
  };
}

function coerceContext(raw: unknown): RequestContext {
  if (!isNonNullObject(raw)) return {};
  return {
    ...(typeof raw["vehicle"] === "string" && raw["vehicle"].trim()
      ? { vehicle: raw["vehicle"].trim().slice(0, 100) }
      : {}),
    ...(typeof raw["engine"] === "string" && raw["engine"].trim()
      ? { engine: raw["engine"].trim().slice(0, 50) }
      : {}),
    ...(typeof raw["source"] === "string" && raw["source"].trim()
      ? { source: raw["source"].trim().slice(0, 50) }
      : {}),
  };
}

// ── Prompt construction ───────────────────────────────────────────────────────

function buildUserMessage(evidence: SafeEvidence, context: RequestContext): string {
  const lines: string[] = ["DIAGNOSIS EVIDENCE:"];

  if (context.vehicle) lines.push(`Vehicle: ${context.vehicle}`);
  if (context.engine)  lines.push(`Engine:  ${context.engine}`);

  lines.push(`Severity: ${evidence.severityLevel} (score ${evidence.severityScore}/100)`);

  if (evidence.isPartial) {
    lines.push(
      "⚠ Partial diagnosis — not all test steps completed. Reduce confidence by one level."
    );
  }

  if (evidence.dtcs.length) {
    lines.push(`\nFault Codes (${evidence.dtcs.length}):`);
    evidence.dtcs.forEach(d =>
      lines.push(`  - ${d.code}: ${d.title}${d.severity ? ` [${d.severity}]` : ""}`)
    );
  } else {
    lines.push("\nFault Codes: None detected");
  }

  if (evidence.primaryCause) {
    lines.push(`\nPrimary Root Cause (${evidence.primaryCause.confidence} confidence):`);
    lines.push(`  Title: ${evidence.primaryCause.title}`);
    lines.push(`  Detail: ${evidence.primaryCause.explanation}`);
  } else {
    lines.push('\nPrimary Root Cause: Not identified — use "Low" confidence');
  }

  if (evidence.additionalCauses.length) {
    lines.push("\nOther Candidates (lower priority):");
    evidence.additionalCauses.forEach(c =>
      lines.push(`  - ${c.title} [${c.confidence}]`)
    );
  }

  if (evidence.correlationFindings.length) {
    lines.push("\nCorrelation Findings (cite these verbatim in evidence):");
    evidence.correlationFindings.forEach(f => lines.push(`  - ${f}`));
  }

  if (evidence.fuelTrimNote) {
    lines.push(
      `\nFuel Trim Signal (cite the % values in evidence): ${evidence.fuelTrimNote}`
    );
  }

  if (evidence.idleStabilityNote) {
    lines.push(
      `Idle Stability Signal (cite RPM variance in evidence): ${evidence.idleStabilityNote}`
    );
  }

  if (evidence.recommendedChecks.length) {
    lines.push(
      "\nRecommended Checks — use as basis for next_steps, Immediate priority first:"
    );
    evidence.recommendedChecks.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
  } else if (!evidence.dtcs.length && !evidence.correlationFindings.length) {
    lines.push("\nRecommended Checks: None — vehicle appears clean.");
  }

  lines.push("\nRespond with JSON only. Cite specific DTC codes and signal values in evidence.");
  return lines.join("\n");
}

// ── Response parsing & validation ─────────────────────────────────────────────

function buildFallback(requestId: string, warnings: string[]): DiagnosisResponse {
  return {
    requestId,
    primary_issue: "Diagnostic analysis unavailable",
    confidence: "Low",
    explanation:
      "The AI diagnostic service is temporarily unavailable. Please review the diagnostic data manually or try again later.",
    next_steps: [
      "Review any stored fault codes manually",
      "Consult a qualified mechanic if fault codes are present",
      "Retry the AI analysis when the service is available",
    ],
    warnings,
    evidence: [],
  };
}

function parseAiResponse(text: string, requestId: string): DiagnosisResponse | null {
  let parsed: unknown;
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!isNonNullObject(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const primary_issue =
    typeof obj["primary_issue"] === "string" && obj["primary_issue"].trim()
      ? obj["primary_issue"].trim().slice(0, 120)
      : null;
  const explanation =
    typeof obj["explanation"] === "string" && obj["explanation"].trim()
      ? obj["explanation"].trim().slice(0, 800)
      : null;

  if (!primary_issue || !explanation) return null;

  // Normalize confidence: accept any casing from the model, return title case.
  const rawConf =
    typeof obj["confidence"] === "string" ? obj["confidence"].trim().toLowerCase() : "";
  const confidence: "High" | "Medium" | "Low" =
    rawConf === "high" ? "High" : rawConf === "medium" ? "Medium" : "Low";

  const evidence   = coerceStringArray(obj["evidence"],   5);
  const next_steps = coerceStringArray(obj["next_steps"], 4);
  const warnings   = coerceStringArray(obj["warnings"],   5);

  // Both fields must have at least one item to be considered a valid response.
  if (!evidence.length || !next_steps.length) return null;

  return { requestId, primary_issue, confidence, explanation, next_steps, warnings, evidence };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const aiDiagnose = onRequest({ cors: true }, async (request, response) => {
  const requestId = randomUUID();

  if (request.method !== "POST") {
    response.status(405).send({ error: "Method not allowed", requestId });
    return;
  }

  // Guard against oversized payloads before touching any content.
  const rawBody = JSON.stringify(request.body ?? {});
  if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
    logger.warn("Payload too large", { requestId });
    response.status(413).send({ error: "Payload too large", requestId });
    return;
  }

  const body = request.body as Record<string, unknown>;

  // evidence: required, non-null, non-array object.
  if (!isNonNullObject(body["evidence"])) {
    response.status(400).send({
      error: "evidence is required and must be a non-null object",
      requestId,
    });
    return;
  }

  const evidence = coerceEvidence(body["evidence"] as Record<string, unknown>);
  const context  = coerceContext(body["context"]);

  logger.info("ai-diagnose request received", {
    requestId,
    dtcCount: evidence.dtcs.length,
    severityLevel: evidence.severityLevel,
    isPartial: evidence.isPartial,
    source: context.source ?? "unknown",
  });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    logger.error("ANTHROPIC_API_KEY is not configured", { requestId });
    response.status(200).send(buildFallback(requestId, ["AI service not configured"]));
    return;
  }

  const userMessage = buildUserMessage(evidence, context);

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = message.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn("No text block in Anthropic response", { requestId });
      response.status(200).send(buildFallback(requestId, ["AI returned an empty response"]));
      return;
    }

    const result = parseAiResponse(textBlock.text, requestId);
    if (!result) {
      logger.warn("AI response failed schema validation", { requestId });
      response
        .status(200)
        .send(buildFallback(requestId, ["AI response did not match the required format"]));
      return;
    }

    logger.info("ai-diagnose completed", { requestId, confidence: result.confidence });
    response.status(200).send(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("Anthropic API call failed", { requestId, message: msg });
    response.status(200).send(buildFallback(requestId, [`AI service error: ${msg}`]));
  }
});
