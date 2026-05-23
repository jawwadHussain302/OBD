import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { randomUUID } from "crypto";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-4o-mini";
const MAX_TOKENS = 512;
const DTC_MAX_TOKENS = 600;
const TIMEOUT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 64 * 1024;

const DTC_COLLECTION = "dtc_definitions";
const VEHICLE_PROFILES_COLLECTION = "vehicle_profiles";
// DTC code: letter (P/B/C/U) followed by exactly 4 hex digits
const DTC_CODE_PATTERN = /^[PBCU][0-9A-F]{4}$/;

// ── aiDiagnose system prompt ──────────────────────────────────────────────────
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

// ── lookupDtc system prompt ───────────────────────────────────────────────────
const DTC_LOOKUP_SYSTEM_PROMPT = `You are an automotive diagnostic expert providing structured DTC definitions for a professional workshop tool.

RULES — follow every rule without exception:
1. Return ONLY a single valid JSON object. No markdown, no text outside the JSON.
2. For manufacturer-specific codes (P1xxx, P2xxx, P3xxx, Bxxxx, Cxxxx, Uxxxx with OEM variation) or unfamiliar codes, set confidence to "low" or "medium".
3. severity "high" means the vehicle should not be driven; "medium" means drive-with-caution; "low" means monitor.
4. safeToDrive must be false for any code involving brakes, steering, airbags, fuel leaks, fire risk, or any "high" severity.
5. description: max 200 characters, mechanic-facing language, explain what is happening in the system.
6. commonCauses: 3–5 most likely causes, ordered most probable first.
7. recommendedChecks: 3–5 specific, actionable workshop steps.
8. title: max 80 characters, concise name for the fault.

SCHEMA:
{
  "title": "<concise fault name, ≤80 chars>",
  "severity": "low" | "medium" | "high",
  "description": "<what is happening, ≤200 chars>",
  "commonCauses": ["<cause 1>", "<cause 2>", ...],
  "recommendedChecks": ["<check 1>", "<check 2>", ...],
  "safeToDrive": true | false,
  "confidence": "low" | "medium" | "high"
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

interface DtcDefinitionDoc {
  code: string;
  title: string;
  severity: "low" | "medium" | "high";
  description: string;
  commonCauses: string[];
  recommendedChecks: string[];
  safeToDrive: boolean;
  confidence: "low" | "medium" | "high";
  source: "local" | "firebase" | "ai_generated";
  reviewStatus: "verified" | "pending_review" | "rejected" | "needs_research";
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  vehicleContext?: {
    make?: string;
    model?: string;
    year?: string;
    engine?: string;
    vin?: string;
  };
}

interface DtcLookupResponse {
  code: string;
  title: string;
  severity: "low" | "medium" | "high";
  description: string;
  commonCauses: string[];
  recommendedChecks: string[];
  safeToDrive: boolean;
  confidence: "low" | "medium" | "high";
  source: "firebase" | "ai_generated";
  reviewStatus: "verified" | "pending_review" | "rejected" | "needs_research";
}

interface DtcVehicleContext {
  make?: string;
  model?: string;
  year?: string;
  engine?: string;
  vin?: string;
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

function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]")
    .slice(0, 300);
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

function coerceDtcVehicleContext(raw: unknown): DtcVehicleContext {
  if (!isNonNullObject(raw)) return {};
  const str = (key: string, max: number): Record<string, string> =>
    typeof raw[key] === "string" && (raw[key] as string).trim()
      ? { [key]: (raw[key] as string).trim().slice(0, max) }
      : {};
  return {
    ...str("make", 50),
    ...str("model", 50),
    ...str("year", 10),
    ...str("engine", 50),
    ...str("vin", 17),
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

function buildDtcUserMessage(code: string, ctx: DtcVehicleContext): string {
  const lines: string[] = [`Provide a definition for OBD-II DTC code: ${code}`];
  const vehicle = [ctx.year, ctx.make, ctx.model].filter(Boolean).join(" ");
  if (vehicle) lines.push(`Vehicle: ${vehicle}`);
  if (ctx.engine) lines.push(`Engine: ${ctx.engine}`);
  if (ctx.vin)    lines.push(`VIN: ${ctx.vin}`);
  lines.push("Respond with JSON only.");
  return lines.join("\n");
}

// ── Response validation ───────────────────────────────────────────────────────

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

  const rawConf = typeof obj["confidence"] === "string" ? obj["confidence"].trim().toLowerCase() : "";
  const confidence: "low" | "medium" | "high" =
    rawConf === "high" ? "high" : rawConf === "medium" ? "medium" : "low";

  const evidence   = coerceStringArray(obj["evidence"],   5);
  const next_steps = coerceStringArray(obj["next_steps"], 4);
  const warnings: string[] = [];

  if (!next_steps.length) return null;

  return { requestId, primary_issue, confidence, explanation, next_steps, warnings, evidence };
}

function parseDtcAiResponse(
  code: string,
  text: string,
): Omit<DtcDefinitionDoc, "source" | "reviewStatus" | "createdAt" | "updatedAt"> | null {
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

  const title = typeof obj["title"] === "string" && obj["title"].trim()
    ? obj["title"].trim().slice(0, 80) : null;
  const description = typeof obj["description"] === "string" && obj["description"].trim()
    ? obj["description"].trim().slice(0, 200) : null;

  if (!title || !description) return null;

  const rawSev = typeof obj["severity"] === "string" ? obj["severity"].trim().toLowerCase() : "";
  const severity: "low" | "medium" | "high" =
    rawSev === "high" ? "high" : rawSev === "medium" ? "medium" : "low";

  const rawConf = typeof obj["confidence"] === "string" ? obj["confidence"].trim().toLowerCase() : "";
  const confidence: "low" | "medium" | "high" =
    rawConf === "high" ? "high" : rawConf === "medium" ? "medium" : "low";

  const safeToDrive = obj["safeToDrive"] === true;
  const commonCauses = coerceStringArray(obj["commonCauses"], 6, 150);
  const recommendedChecks = coerceStringArray(obj["recommendedChecks"], 6, 150);

  if (!commonCauses.length || !recommendedChecks.length) return null;

  return { code, title, severity, description, commonCauses, recommendedChecks, safeToDrive, confidence };
}

// ── OpenRouter call ───────────────────────────────────────────────────────────

async function callOpenRouter(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = MAX_TOKENS,
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
        max_tokens: maxTokens,
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

// ── aiDiagnose handler ────────────────────────────────────────────────────────

export const aiDiagnose = onRequest(
  { cors: true },
  async (request, response) => {
    const requestId = randomUUID();

    if (request.method !== "POST") {
      response.status(405).send({ error: "Method not allowed", requestId });
      return;
    }

    if (Buffer.byteLength(JSON.stringify(request.body ?? {}), "utf8") > MAX_PAYLOAD_BYTES) {
      logger.warn("Payload too large", { requestId });
      response.status(413).send({ error: "Payload too large", requestId });
      return;
    }

    if (!isNonNullObject(request.body)) {
      response.status(400).send({ error: "Request body must be a JSON object", requestId });
      return;
    }

    const body = request.body as Record<string, unknown>;

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
      logger.error("ai-diagnose: error", { requestId, reason: redactSecrets(msg) });
      response.status(200).send(buildFallback(requestId, ["AI service unavailable"]));
    }
  }
);

// ── lookupDtc handler ─────────────────────────────────────────────────────────

export const lookupDtc = onRequest(
  { cors: true },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send({ error: "Method not allowed" });
      return;
    }

    if (!isNonNullObject(request.body)) {
      response.status(400).send({ error: "Request body must be a JSON object" });
      return;
    }

    const body = request.body as Record<string, unknown>;
    const rawCode =
      typeof body["code"] === "string" ? body["code"].trim().toUpperCase() : "";

    if (!DTC_CODE_PATTERN.test(rawCode)) {
      response.status(400).send({ error: "Invalid DTC code format" });
      return;
    }

    // ── Step 1: Firestore cache ───────────────────────────────────────────────
    try {
      const snap = await db.collection(DTC_COLLECTION).doc(rawCode).get();
      if (snap.exists) {
        const data = snap.data() as DtcDefinitionDoc;
        logger.info("dtc-lookup: firestore hit", { code: rawCode, source: data.source });
        const resp: DtcLookupResponse = {
          code: rawCode,
          title: data.title,
          severity: data.severity,
          description: data.description,
          commonCauses: data.commonCauses ?? [],
          recommendedChecks: data.recommendedChecks ?? [],
          safeToDrive: data.safeToDrive,
          confidence: data.confidence,
          source: data.source === "local" ? "firebase" : (data.source as "firebase" | "ai_generated"),
          reviewStatus: data.reviewStatus,
        };
        response.status(200).send(resp);
        return;
      }
    } catch (firestoreErr) {
      logger.warn("dtc-lookup: firestore read error", { code: rawCode, firestoreErr });
    }

    // ── Step 2: AI lookup ─────────────────────────────────────────────────────
    const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
    if (!apiKey) {
      logger.error("dtc-lookup: OPENROUTER_API_KEY not set");
      response.status(200).send({ error: "AI lookup unavailable" });
      return;
    }

    const vehicleContext = coerceDtcVehicleContext(body["vehicleContext"]);
    const userMessage = buildDtcUserMessage(rawCode, vehicleContext);

    try {
      const rawText = await callOpenRouter(
        apiKey, DTC_LOOKUP_SYSTEM_PROMPT, userMessage, DTC_MAX_TOKENS,
      );
      const aiResult = parseDtcAiResponse(rawCode, rawText);

      if (!aiResult) {
        logger.warn("dtc-lookup: AI response invalid", { code: rawCode });
        response.status(200).send({ error: "AI lookup unavailable" });
        return;
      }

      // ── Step 3: Save to Firestore — awaited so the cache write is durable ───
      const now = new Date().toISOString();
      const docData: DtcDefinitionDoc = {
        ...aiResult,
        source: "ai_generated",
        reviewStatus: "pending_review",
        createdAt: now,
        updatedAt: now,
      };
      try {
        await db.collection(DTC_COLLECTION).doc(rawCode).set(docData);
      } catch (writeErr) {
        logger.warn("dtc-lookup: firestore write error", { code: rawCode, writeErr });
      }

      logger.info("dtc-lookup: ai success", { code: rawCode, confidence: aiResult.confidence });
      const resp: DtcLookupResponse = {
        code: rawCode,
        title: aiResult.title,
        severity: aiResult.severity,
        description: aiResult.description,
        commonCauses: aiResult.commonCauses,
        recommendedChecks: aiResult.recommendedChecks,
        safeToDrive: aiResult.safeToDrive,
        confidence: aiResult.confidence,
        source: "ai_generated",
        reviewStatus: "pending_review",
      };
      response.status(200).send(resp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error("dtc-lookup: ai call failed", { code: rawCode, reason: redactSecrets(msg) });
      response.status(200).send({ error: "AI lookup unavailable" });
    }
  }
);

interface DtcReviewUpdateRequest {
  code: string;
  action: "approve" | "reject" | "needs_research";
  rejectionReason?: string;
  updates?: Partial<Pick<DtcDefinitionDoc,
    "title" | "severity" | "description" | "commonCauses" | "recommendedChecks" | "safeToDrive">>;
}

export const listPendingDtcDefinitions = onRequest(
  { cors: true },
  async (request, response) => {
    if (request.method !== "GET") {
      response.status(405).send({ error: "Method not allowed" });
      return;
    }

    try {
      const snap = await db
        .collection(DTC_COLLECTION)
        .where("reviewStatus", "==", "pending_review")
        .orderBy("createdAt", "desc")
        .get();
      const items = snap.docs.map(doc => doc.data() as DtcDefinitionDoc);
      response.status(200).send({ items });
    } catch (err) {
      logger.error("dtc-review: list pending failed", { err });
      response.status(500).send({ error: "Unable to load DTC review queue" });
    }
  }
);

export const reviewDtcDefinition = onRequest(
  { cors: true },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send({ error: "Method not allowed" });
      return;
    }
    if (!isNonNullObject(request.body)) {
      response.status(400).send({ error: "Request body must be a JSON object" });
      return;
    }

    const body = request.body as Record<string, unknown>;
    const payload: DtcReviewUpdateRequest = {
      code: typeof body["code"] === "string" ? body["code"].trim().toUpperCase() : "",
      action: body["action"] as DtcReviewUpdateRequest["action"],
      rejectionReason: typeof body["rejectionReason"] === "string" ? body["rejectionReason"].trim().slice(0, 500) : undefined,
      updates: isNonNullObject(body["updates"]) ? body["updates"] as DtcReviewUpdateRequest["updates"] : undefined,
    };

    if (!DTC_CODE_PATTERN.test(payload.code)) {
      response.status(400).send({ error: "Invalid DTC code format" });
      return;
    }
    if (!["approve", "reject", "needs_research"].includes(payload.action)) {
      response.status(400).send({ error: "Invalid action" });
      return;
    }

    const now = new Date().toISOString();
    // TODO: Replace with verified Firebase Auth + admin role identity.
    let actor = "local_admin";
    const authHeader = typeof request.headers["authorization"] === "string"
      ? request.headers["authorization"] : "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        if (decoded.uid) actor = decoded.uid;
      } catch {
        // Fall back to local_admin when no verified auth context is available.
      }
    }
    const docRef = db.collection(DTC_COLLECTION).doc(payload.code);

    try {
      const current = await docRef.get();
      if (!current.exists) {
        response.status(404).send({ error: "DTC definition not found" });
        return;
      }
      const currentData = current.data() as Partial<DtcDefinitionDoc> | undefined;
      if (currentData?.reviewStatus !== "pending_review") {
        response.status(409).send({ error: "DTC definition is not pending review" });
        return;
      }

      const updateDoc: Partial<DtcDefinitionDoc> = { updatedAt: now };

      if (payload.updates) {
        if (typeof payload.updates.title === "string" && payload.updates.title.trim()) {
          updateDoc.title = payload.updates.title.trim().slice(0, 80);
        }
        if (payload.updates.severity === "low" || payload.updates.severity === "medium" || payload.updates.severity === "high") {
          updateDoc.severity = payload.updates.severity;
        }
        if (typeof payload.updates.description === "string" && payload.updates.description.trim()) {
          updateDoc.description = payload.updates.description.trim().slice(0, 200);
        }
        if (Array.isArray(payload.updates.commonCauses)) {
          updateDoc.commonCauses = coerceStringArray(payload.updates.commonCauses, 6, 150);
        }
        if (Array.isArray(payload.updates.recommendedChecks)) {
          updateDoc.recommendedChecks = coerceStringArray(payload.updates.recommendedChecks, 6, 150);
        }
        if (typeof payload.updates.safeToDrive === "boolean") {
          updateDoc.safeToDrive = payload.updates.safeToDrive;
        }
      }

      if (payload.action === "approve") {
        updateDoc.reviewStatus = "verified";
        updateDoc.reviewedAt = now;
        updateDoc.reviewedBy = actor;
      } else if (payload.action === "reject") {
        updateDoc.reviewStatus = "rejected";
        updateDoc.rejectedAt = now;
        updateDoc.rejectedBy = actor;
        updateDoc.rejectionReason = payload.rejectionReason || "Rejected by admin";
      } else {
        updateDoc.reviewStatus = "needs_research";
        updateDoc.reviewedAt = now;
        updateDoc.reviewedBy = actor;
      }

      await docRef.set(updateDoc, { merge: true });
      response.status(200).send({ ok: true });
    } catch (err) {
      logger.error("dtc-review: update failed", { code: payload.code, action: payload.action, err });
      response.status(500).send({ error: "Failed to update DTC definition" });
    }
  }
);

// ── vehicleProfileLookup handler ──────────────────────────────────────────────

interface VehicleIntelligenceProfile {
  vin?: string;
  vinHash?: string;
  vinPattern?: string;
  make: string;
  model: string;
  year?: number;
  engine?: string;
  fuelType?: "petrol" | "diesel" | "hybrid" | "ev" | "unknown";
  protocol?: string;
  supportedPids?: string[];
  source: "local" | "user_confirmed" | "ai_generated";
  reviewStatus: "verified" | "pending_review" | "rejected" | "needs_research";
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

interface VehicleReviewUpdateRequest {
  id: string;
  action: "approve" | "reject" | "needs_research";
  rejectionReason?: string;
  updates?: Partial<Pick<VehicleIntelligenceProfile,
    "make" | "model" | "year" | "engine" | "fuelType" | "protocol">>;
}

export const vehicleProfileLookup = onRequest(
  { cors: true },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send({ error: "Method not allowed" });
      return;
    }

    if (!isNonNullObject(request.body)) {
      response.status(400).send({ error: "Request body must be a JSON object" });
      return;
    }

    const body = request.body as Record<string, unknown>;
    const action = typeof body["action"] === "string" ? body["action"] : "";

    // ── getByVin ────────────────────────────────────────────────────────────
    if (action === "getByVin") {
      const vin = typeof body["vin"] === "string" ? body["vin"].trim().toUpperCase() : "";
      if (!vin) {
        response.status(400).send({ error: "vin is required" });
        return;
      }

      try {
        const snap = await db
          .collection(VEHICLE_PROFILES_COLLECTION)
          .where("vin", "==", vin)
          .limit(1)
          .get();

        if (!snap.empty) {
          logger.info("vehicle-profile: vin hit", { vin });
          response.status(200).send({ profile: snap.docs[0].data() as VehicleIntelligenceProfile });
          return;
        }

        response.status(200).send({ profile: null });
      } catch (err) {
        logger.error("vehicle-profile: getByVin error", { vin, err });
        response.status(200).send({ profile: null });
      }
      return;
    }

    // ── getByVinPattern ─────────────────────────────────────────────────────
    if (action === "getByVinPattern") {
      const vinPattern = typeof body["vinPattern"] === "string" ? body["vinPattern"].trim().toUpperCase() : "";
      if (!vinPattern) {
        response.status(400).send({ error: "vinPattern is required" });
        return;
      }

      try {
        const snap = await db
          .collection(VEHICLE_PROFILES_COLLECTION)
          .where("vinPattern", "==", vinPattern)
          .limit(1)
          .get();

        if (!snap.empty) {
          logger.info("vehicle-profile: vinPattern hit", { vinPattern });
          response.status(200).send({ profile: snap.docs[0].data() as VehicleIntelligenceProfile });
          return;
        }

        response.status(200).send({ profile: null });
      } catch (err) {
        logger.error("vehicle-profile: getByVinPattern error", { vinPattern, err });
        response.status(200).send({ profile: null });
      }
      return;
    }

    // ── save ────────────────────────────────────────────────────────────────
    if (action === "save") {
      // Require a valid Firebase ID token — prevents unauthenticated data poisoning.
      const authHeader = typeof request.headers["authorization"] === "string"
        ? request.headers["authorization"] : "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (!idToken) {
        response.status(401).send({ error: "Unauthorized" });
        return;
      }
      try {
        await admin.auth().verifyIdToken(idToken);
      } catch {
        response.status(401).send({ error: "Unauthorized" });
        return;
      }

      const raw = isNonNullObject(body["profile"]) ? body["profile"] as Record<string, unknown> : null;
      if (!raw) {
        response.status(400).send({ error: "profile is required" });
        return;
      }

      const make  = typeof raw["make"]  === "string" && raw["make"].trim()  ? raw["make"].trim().slice(0, 100)  : "";
      const model = typeof raw["model"] === "string" && raw["model"].trim() ? raw["model"].trim().slice(0, 100) : "";

      if (!make || !model) {
        response.status(400).send({ error: "profile.make and profile.model are required" });
        return;
      }

      const now = new Date().toISOString();
      const doc: VehicleIntelligenceProfile = {
        make,
        model,
        source: "user_confirmed",
        reviewStatus: "verified",
        createdAt: now,
        updatedAt: now,
      };

      if (typeof raw["vin"]         === "string" && raw["vin"].trim())         doc.vin         = raw["vin"].trim().toUpperCase().slice(0, 17);
      if (typeof raw["vinHash"]     === "string" && raw["vinHash"].trim())     doc.vinHash     = raw["vinHash"].trim().slice(0, 64);
      if (typeof raw["vinPattern"]  === "string" && raw["vinPattern"].trim())  doc.vinPattern  = raw["vinPattern"].trim().toUpperCase().slice(0, 11);
      if (typeof raw["year"]        === "number")                              doc.year        = Math.floor(raw["year"]);
      if (typeof raw["engine"]      === "string" && raw["engine"].trim())      doc.engine      = raw["engine"].trim().slice(0, 100);
      if (typeof raw["protocol"]    === "string" && raw["protocol"].trim())    doc.protocol    = raw["protocol"].trim().slice(0, 50);

      const validFuelTypes = ["petrol", "diesel", "hybrid", "ev", "unknown"];
      if (typeof raw["fuelType"] === "string" && validFuelTypes.includes(raw["fuelType"])) {
        doc.fuelType = raw["fuelType"] as VehicleIntelligenceProfile["fuelType"];
      }

      if (Array.isArray(raw["supportedPids"])) {
        doc.supportedPids = (raw["supportedPids"] as unknown[])
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
          .map(p => p.trim().slice(0, 10))
          .slice(0, 100);
      }

      // Deterministic doc ID so repeated confirmations upsert rather than
      // accumulate duplicates: prefer VIN, then VIN pattern, then make+model+year.
      const docId = doc.vin
        ? `vin_${doc.vin}`
        : doc.vinPattern
          ? `vp_${doc.vinPattern}`
          : `mm_${make}_${model}_${doc.year ?? "unknown"}`.replace(/\s+/g, "_").toLowerCase();

      try {
        const ref = db.collection(VEHICLE_PROFILES_COLLECTION).doc(docId);
        const existing = await ref.get();
        // Preserve the original createdAt on update.
        if (existing.exists) {
          const prev = existing.data() as VehicleIntelligenceProfile;
          doc.createdAt = prev.createdAt;
        }
        await ref.set(doc);
        logger.info("vehicle-profile: upserted", { docId, make, model });
        response.status(200).send({ profile: doc });
      } catch (err) {
        logger.error("vehicle-profile: save error", { make, model, err });
        response.status(500).send({ error: "Failed to save profile" });
      }
      return;
    }

    response.status(400).send({ error: `Unknown action: ${action}` });
  }
);

export const listPendingVehicleProfiles = onRequest(
  { cors: true },
  async (request, response) => {
    if (request.method !== "GET") {
      response.status(405).send({ error: "Method not allowed" });
      return;
    }

    try {
      const snap = await db
        .collection(VEHICLE_PROFILES_COLLECTION)
        .where("reviewStatus", "==", "pending_review")
        .orderBy("createdAt", "desc")
        .get();
      const items = snap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as VehicleIntelligenceProfile),
      }));
      response.status(200).send({ items });
    } catch (err) {
      logger.error("vehicle-review: list pending failed", { err });
      response.status(500).send({ error: "Unable to load vehicle profile review queue" });
    }
  }
);

export const reviewVehicleProfile = onRequest(
  { cors: true },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send({ error: "Method not allowed" });
      return;
    }
    if (!isNonNullObject(request.body)) {
      response.status(400).send({ error: "Request body must be a JSON object" });
      return;
    }

    const body = request.body as Record<string, unknown>;
    const payload: VehicleReviewUpdateRequest = {
      id: typeof body["id"] === "string" ? body["id"].trim() : "",
      action: body["action"] as VehicleReviewUpdateRequest["action"],
      rejectionReason: typeof body["rejectionReason"] === "string" ? body["rejectionReason"].trim().slice(0, 500) : undefined,
      updates: isNonNullObject(body["updates"]) ? body["updates"] as VehicleReviewUpdateRequest["updates"] : undefined,
    };

    if (!payload.id) {
      response.status(400).send({ error: "id is required" });
      return;
    }
    if (!["approve", "reject", "needs_research"].includes(payload.action)) {
      response.status(400).send({ error: "Invalid action" });
      return;
    }

    const now = new Date().toISOString();
    // TODO: Replace with verified Firebase Auth + admin role identity.
    let actor = "local_admin";
    const authHeader = typeof request.headers["authorization"] === "string"
      ? request.headers["authorization"] : "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        if (decoded.uid) actor = decoded.uid;
      } catch {
        // Fall back to local_admin when no verified auth context is available.
      }
    }

    const docRef = db.collection(VEHICLE_PROFILES_COLLECTION).doc(payload.id);

    try {
      const current = await docRef.get();
      if (!current.exists) {
        response.status(404).send({ error: "Vehicle profile not found" });
        return;
      }
      const currentData = current.data() as Partial<VehicleIntelligenceProfile> | undefined;
      if (currentData?.reviewStatus !== "pending_review") {
        response.status(409).send({ error: "Vehicle profile is not pending review" });
        return;
      }

      const updateDoc: Partial<VehicleIntelligenceProfile> = { updatedAt: now };

      if (payload.updates) {
        if (typeof payload.updates.make === "string" && payload.updates.make.trim()) {
          updateDoc.make = payload.updates.make.trim().slice(0, 100);
        }
        if (typeof payload.updates.model === "string" && payload.updates.model.trim()) {
          updateDoc.model = payload.updates.model.trim().slice(0, 100);
        }
        if (typeof payload.updates.year === "number" && Number.isFinite(payload.updates.year)) {
          updateDoc.year = Math.floor(payload.updates.year);
        }
        if (typeof payload.updates.engine === "string" && payload.updates.engine.trim()) {
          updateDoc.engine = payload.updates.engine.trim().slice(0, 100);
        }
        if (
          payload.updates.fuelType === "petrol" ||
          payload.updates.fuelType === "diesel" ||
          payload.updates.fuelType === "hybrid" ||
          payload.updates.fuelType === "ev" ||
          payload.updates.fuelType === "unknown"
        ) {
          updateDoc.fuelType = payload.updates.fuelType;
        }
        if (typeof payload.updates.protocol === "string" && payload.updates.protocol.trim()) {
          updateDoc.protocol = payload.updates.protocol.trim().slice(0, 50);
        }
      }

      if (payload.action === "approve") {
        updateDoc.reviewStatus = "verified";
        updateDoc.reviewedAt = now;
        updateDoc.reviewedBy = actor;
      } else if (payload.action === "reject") {
        updateDoc.reviewStatus = "rejected";
        updateDoc.rejectedAt = now;
        updateDoc.rejectedBy = actor;
        updateDoc.rejectionReason = payload.rejectionReason || "Rejected by admin";
      } else {
        updateDoc.reviewStatus = "needs_research";
        updateDoc.reviewedAt = now;
        updateDoc.reviewedBy = actor;
      }

      await docRef.set(updateDoc, { merge: true });
      response.status(200).send({ ok: true });
    } catch (err) {
      logger.error("vehicle-review: update failed", { id: payload.id, action: payload.action, err });
      response.status(500).send({ error: "Failed to update vehicle profile" });
    }
  }
);
