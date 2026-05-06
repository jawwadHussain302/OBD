import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { randomUUID } from "crypto";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-4o-mini";
const MAX_TOKENS = 512;
const TIMEOUT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 64 * 1024;

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a vehicle diagnostic assistant inside a professional OBD2 tool used by mechanics and workshops.

RULES — follow every rule without exception:
1. Only use evidence in the user message. Do not introduce symptoms, components, or causes not listed there.
2. Do not mention part numbers, prices, labour times, or specific brands.
3. Respond ONLY with a single valid JSON object — no markdown, no text outside the JSON.
4. "primary_issue": when a fault code is present, start with the code: e.g. "P0171 — Lean Condition (Vacuum Leak)". When no code, use the cause title directly. Max 80 chars.
5. "explanation" (20–120 words): open with what the car is actually doing, not the DTC system. Start with "Your engine...", "The fuel mixture...", or similar owner-facing language. Name the fault code if one is present.
6. "evidence": each item must cite a DTC code, a measured signal value, or a verbatim correlation finding. NEVER write generic phrases like "vehicle has a fault" or "fault detected".
7. "confidence": use the primaryCause confidence level. If partial, drop one level (high → medium, medium → low). If no primaryCause, use "low". Always lowercase.
8. "next_steps": workshop-ready actions, ordered Immediate first, then Soon, then Routine. Max 4 items. Never write "check the vehicle" or "consult a garage".
9. Clean diagnosis (no fault codes, no findings): set primary_issue to "No fault detected", confidence "low", first next_step "No immediate action required — monitor and schedule routine service".

SCHEMA:
{
  "primary_issue": "<DTC + short title if applicable, ≤80 chars>",
  "confidence": "high" | "medium" | "low",
  "evidence": ["<DTC code / signal value / finding>", ...],
  "explanation": "<20–120 words, owner-facing language>",
  "next_steps": ["<Immediate action>", "<Soon action>", ...]
}

GOOD EXAMPLE (vacuum leak scenario):
{
  "primary_issue": "P0171 — Lean Condition (Vacuum / Intake Leak)",
  "confidence": "high",
  "evidence": ["P0171: System Too Lean (Bank 1)", "STFT B1 +18% at idle, drops to +4% at 2500 RPM", "Vacuum leak pattern: trims improve at higher RPM"],
  "explanation": "Your engine is pulling in extra unmetered air through a gap in the intake system. The short-term fuel trim is very high at idle but normalises under load, which is the classic signature of a vacuum or intake leak rather than a fuel delivery problem.",
  "next_steps": ["Perform intake smoke test with engine running to locate air leak", "Inspect PCV valve and breather hose for cracks", "Check all intake hoses between air filter and throttle body", "Clear DTC and verify STFT returns to ±5% after repair"]
}`;

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
  confidence: "low" | "medium" | "high";
  explanation: string;
  next_steps: string[];
  warnings: string[];
  evidence: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function buildFallback(requestId: string, warnings: string[]): DiagnosisResponse {
  return {
    requestId,
    primary_issue: "Unable to determine",
    confidence: "low",
    explanation: "Insufficient or unclear data",
    next_steps: ["Check basic conditions", "Retry diagnosis"],
    warnings,
    evidence: [],
  };
}

// ── Input coercion ────────────────────────────────────────────────────────────

function coerceEvidence(raw: Record<string, unknown>): SafeEvidence {
  const dtcArr = Array.isArray(raw["dtcs"]) ? (raw["dtcs"] as unknown[]) : [];
  const dtcs = dtcArr
    .filter(isNonNullObject)
    .map(d => ({
      code:  typeof d["code"]  === "string" ? d["code"].slice(0, 10)  : "",
      title: typeof d["title"] === "string" ? d["title"].slice(0, 80) : "",
      ...(typeof d["severity"] === "string" ? { severity: d["severity"].slice(0, 20) } : {}),
    }))
    .filter(d => d.code.length > 0)
    .slice(0, 10);

  const rawPc = isNonNullObject(raw["primaryCause"]) ? raw["primaryCause"] : null;
  const primaryCause =
    rawPc !== null && typeof rawPc["title"] === "string" && rawPc["title"].trim()
      ? {
          title:       rawPc["title"].trim().slice(0, 100),
          confidence:  typeof rawPc["confidence"]  === "string" ? rawPc["confidence"].slice(0, 20)  : "low",
          explanation: typeof rawPc["explanation"] === "string" ? rawPc["explanation"].slice(0, 400) : "",
        }
      : null;

  const additionalCauses = (
    Array.isArray(raw["additionalCauses"]) ? (raw["additionalCauses"] as unknown[]) : []
  )
    .filter(isNonNullObject)
    .map(c => ({
      title:      typeof c["title"]      === "string" ? c["title"].slice(0, 100)      : "",
      confidence: typeof c["confidence"] === "string" ? c["confidence"].slice(0, 20) : "low",
    }))
    .filter(c => c.title.length > 0)
    .slice(0, 5);

  return {
    severityScore:
      typeof raw["severityScore"] === "number"
        ? Math.min(100, Math.max(0, Math.round(raw["severityScore"])))
        : 0,
    severityLevel:
      typeof raw["severityLevel"] === "string" ? raw["severityLevel"].slice(0, 20) : "Unknown",
    dtcs,
    primaryCause,
    additionalCauses,
    correlationFindings: coerceStringArray(raw["correlationFindings"], 10),
    recommendedChecks:   coerceStringArray(raw["recommendedChecks"],   10),
    fuelTrimNote:
      typeof raw["fuelTrimNote"] === "string" ? raw["fuelTrimNote"].slice(0, 200) : null,
    idleStabilityNote:
      typeof raw["idleStabilityNote"] === "string" ? raw["idleStabilityNote"].slice(0, 200) : null,
    isPartial: raw["isPartial"] === true,
  };
}

function coerceContext(raw: unknown): RequestContext {
  if (!isNonNullObject(raw)) return {};
  return {
    ...(typeof raw["vehicle"] === "string" && raw["vehicle"].trim()
      ? { vehicle: raw["vehicle"].trim().slice(0, 100) } : {}),
    ...(typeof raw["engine"] === "string" && raw["engine"].trim()
      ? { engine: raw["engine"].trim().slice(0, 50) } : {}),
    ...(typeof raw["source"] === "string" && raw["source"].trim()
      ? { source: raw["source"].trim().slice(0, 50) } : {}),
  };
}

// ── Prompt construction ───────────────────────────────────────────────────────

function buildUserMessage(evidence: SafeEvidence, context: RequestContext): string {
  const lines: string[] = ["DIAGNOSIS EVIDENCE:"];

  if (context.vehicle) lines.push(`Vehicle: ${context.vehicle}`);
  if (context.engine)  lines.push(`Engine:  ${context.engine}`);

  lines.push(`Severity: ${evidence.severityLevel} (score ${evidence.severityScore}/100)`);

  if (evidence.isPartial) {
    lines.push("⚠ Partial diagnosis — not all test steps completed. Reduce confidence by one level.");
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
    lines.push('\nPrimary Root Cause: Not identified — use "low" confidence');
  }

  if (evidence.additionalCauses.length) {
    lines.push("\nOther Candidates (lower priority):");
    evidence.additionalCauses.forEach(c => lines.push(`  - ${c.title} [${c.confidence}]`));
  }

  if (evidence.correlationFindings.length) {
    lines.push("\nCorrelation Findings (cite these verbatim in evidence):");
    evidence.correlationFindings.forEach(f => lines.push(`  - ${f}`));
  }

  if (evidence.fuelTrimNote) {
    lines.push(`\nFuel Trim Signal (cite the % values in evidence): ${evidence.fuelTrimNote}`);
  }

  if (evidence.idleStabilityNote) {
    lines.push(`Idle Stability Signal (cite RPM variance in evidence): ${evidence.idleStabilityNote}`);
  }

  if (evidence.recommendedChecks.length) {
    lines.push("\nRecommended Checks — use as basis for next_steps, Immediate priority first:");
    evidence.recommendedChecks.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
  } else if (!evidence.dtcs.length && !evidence.correlationFindings.length) {
    lines.push("\nRecommended Checks: None — vehicle appears clean.");
  }

  lines.push("\nRespond with JSON only. Cite specific DTC codes and signal values in evidence.");
  return lines.join("\n");
}

// ── Response validation ───────────────────────────────────────────────────────

function parseAiResponse(text: string, requestId: string): DiagnosisResponse | null {
  let parsed: unknown;
  try {
    // response_format: json_object means the model should not wrap in fences,
    // but strip them defensively just in case.
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

  const rawConf = typeof obj["confidence"] === "string" ? obj["confidence"].trim().toLowerCase() : "";
  const confidence: "low" | "medium" | "high" =
    rawConf === "high" ? "high" : rawConf === "medium" ? "medium" : "low";

  const evidence   = coerceStringArray(obj["evidence"],   5);
  const next_steps = coerceStringArray(obj["next_steps"], 4);
  const warnings   = coerceStringArray(obj["warnings"],   5);

  // next_steps must have at least one item.
  // evidence may be empty for clean diagnoses (no fault codes / no findings to cite).
  if (!next_steps.length) return null;

  return { requestId, primary_issue, confidence, explanation, next_steps, warnings, evidence };
}

// ── OpenRouter call ───────────────────────────────────────────────────────────

async function callOpenRouter(
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMessage  },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
      const errObj  = errBody["error"];
      // OpenRouter wraps errors as { error: { message, code } }; fall back to plain string.
      const errMsg  = typeof errObj === "string" ? errObj
        : isNonNullObject(errObj) && typeof errObj["message"] === "string" ? errObj["message"]
        : `HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("Empty content from OpenRouter");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const aiDiagnose = onRequest(
  { cors: true },
  async (request, response) => {
    const requestId = randomUUID();

    if (request.method !== "POST") {
      response.status(405).send({ error: "Method not allowed", requestId });
      return;
    }

    // Reject oversized payloads before touching content.
    if (Buffer.byteLength(JSON.stringify(request.body ?? {}), "utf8") > MAX_PAYLOAD_BYTES) {
      logger.warn("Payload too large", { requestId });
      response.status(413).send({ error: "Payload too large", requestId });
      return;
    }

    // Body must be a non-null object (guards against JSON null).
    if (!isNonNullObject(request.body)) {
      response.status(400).send({ error: "Request body must be a JSON object", requestId });
      return;
    }

    const body = request.body as Record<string, unknown>;

    // evidence is required and must be a non-null, non-array object.
    if (!isNonNullObject(body["evidence"])) {
      response.status(400).send({
        error: "evidence is required and must be a non-null object",
        requestId,
      });
      return;
    }

    const evidence = coerceEvidence(body["evidence"] as Record<string, unknown>);
    const context  = coerceContext(body["context"]);

    logger.info("ai-diagnose: request start", {
      requestId,
      dtcCount: evidence.dtcs.length,
      severityLevel: evidence.severityLevel,
      isPartial: evidence.isPartial,
      source: context.source ?? "unknown",
    });

    const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
    if (!apiKey) {
      logger.error("ai-diagnose: OPENROUTER_API_KEY is not set", { requestId });
      response.status(200).send(buildFallback(requestId, ["AI service not configured"]));
      return;
    }

    const userMessage = buildUserMessage(evidence, context);

    try {
      const rawText = await callOpenRouter(apiKey, SYSTEM_PROMPT, userMessage);
      const result  = parseAiResponse(rawText, requestId);

      if (!result) {
        logger.warn("ai-diagnose: response failed schema validation", { requestId });
        response.status(200).send(
          buildFallback(requestId, ["AI response did not match the required format"])
        );
        return;
      }

      logger.info("ai-diagnose: success", { requestId, confidence: result.confidence });
      response.status(200).send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error("ai-diagnose: error", { requestId, reason: msg });
      response.status(200).send(buildFallback(requestId, [`AI service error: ${msg}`]));
    }
  }
);
