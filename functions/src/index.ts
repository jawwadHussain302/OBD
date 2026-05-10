import { onRequest, Request } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as https from "https";
import type { Response } from "express";

// ── Secret ────────────────────────────────────────────────────────────────────
// Set via: firebase functions:secrets:set OPENROUTER_API_KEY
const OPENROUTER_API_KEY = defineSecret("OPENROUTER_API_KEY");

// ── CORS origins ──────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:4200",
  "https://obd-dashboard.web.app",
  "https://obd-dashboard.firebaseapp.com",
];

// ── Evidence and request types ────────────────────────────────────────────────

interface DtcEntry {
  code: string;
  title: string;
  severity?: string;
}

interface AiEvidence {
  severityScore?: number;
  severityLevel?: string;
  dtcs?: DtcEntry[];
  primaryCause?: { title: string; confidence: string; explanation: string } | null;
  additionalCauses?: { title: string; confidence: string }[];
  correlationFindings?: string[];
  recommendedChecks?: string[];
  fuelTrimNote?: string | null;
  idleStabilityNote?: string | null;
  isPartial?: boolean;
}

interface AiContext {
  vehicle?: string;
  engine?: string;
  source?: string;
}

interface AiRequest {
  evidence: AiEvidence;
  context?: AiContext;
}

// ── Response type ─────────────────────────────────────────────────────────────

interface AiResponse {
  requestId: string;
  primary_issue: string;
  confidence: "low" | "medium" | "high";
  explanation: string;
  next_steps: string[];
  warnings: string[];
  evidence: string[];
}

// ── System prompt (backend-only — never sent from frontend) ───────────────────

const SYSTEM_PROMPT = `You are a vehicle diagnostic assistant inside a professional OBD2 tool used by mechanics and workshops.

RULES — follow every rule without exception:
1. Only use evidence in the user message. Do not introduce symptoms, components, or causes not listed there.
2. Do not mention part numbers, prices, labour times, or specific brands.
3. Respond ONLY with a single valid JSON object — no markdown, no text outside the JSON.
4. "primary_issue": when a fault code is present, start with the code: e.g. "P0171 — Lean Condition (Vacuum Leak)". When no code, use the cause title directly. Max 80 chars.
5. "explanation" (20–120 words): open with what the car is actually doing, not the DTC system. Start with "Your engine...", "The fuel mixture...", or similar owner-facing language.
6. "evidence": each item must cite a DTC code, a measured signal value, or a verbatim correlation finding. NEVER write generic phrases like "vehicle has a fault".
7. "confidence": use "high", "medium", or "low" (lowercase). If the diagnosis is partial, drop one level. If no primaryCause, use "low".
8. "next_steps": workshop-ready actions, ordered Immediate first. Max 4 items.
9. "warnings": any safety-critical observations. Empty array if none.
10. Clean diagnosis (no fault codes, no findings): set primary_issue to "No fault detected", confidence "low".

SCHEMA — respond with exactly this JSON structure:
{
  "primary_issue": "<string, ≤80 chars>",
  "confidence": "high" | "medium" | "low",
  "evidence": ["<string>", ...],
  "explanation": "<20–120 words>",
  "next_steps": ["<string>", ...],
  "warnings": ["<string>", ...]
}`;

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildUserMessage(evidence: AiEvidence, context?: AiContext): string {
  const lines: string[] = ["DIAGNOSIS EVIDENCE:"];

  if (context?.vehicle) lines.push(`Vehicle: ${context.vehicle}`);
  if (context?.engine) lines.push(`Engine: ${context.engine}`);

  const severity = evidence.severityLevel ?? "Unknown";
  const score    = evidence.severityScore ?? 0;
  lines.push(`Severity: ${severity} (score ${score}/100)`);

  if (evidence.isPartial) {
    lines.push("⚠ Partial diagnosis — not all test steps completed. Reduce confidence by one level.");
  }

  const dtcs = evidence.dtcs ?? [];
  if (dtcs.length) {
    lines.push(`\nFault Codes (${dtcs.length}):`);
    dtcs.forEach(d => lines.push(`  - ${d.code}: ${d.title}${d.severity ? ` [${d.severity}]` : ""}`));
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

  const addl = evidence.additionalCauses ?? [];
  if (addl.length) {
    lines.push("\nOther Candidates (lower priority):");
    addl.forEach(c => lines.push(`  - ${c.title} [${c.confidence}]`));
  }

  const correlations = evidence.correlationFindings ?? [];
  if (correlations.length) {
    lines.push("\nCorrelation Findings (cite these verbatim in evidence):");
    correlations.forEach(f => lines.push(`  - ${f}`));
  }

  if (evidence.fuelTrimNote) {
    lines.push(`\nFuel Trim Signal (cite the % values in evidence): ${evidence.fuelTrimNote}`);
  }

  if (evidence.idleStabilityNote) {
    lines.push(`Idle Stability Signal (cite RPM variance in evidence): ${evidence.idleStabilityNote}`);
  }

  const checks = evidence.recommendedChecks ?? [];
  if (checks.length) {
    lines.push("\nRecommended Checks — use as basis for next_steps, Immediate priority first:");
    checks.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
  }

  lines.push("\nRespond with JSON only. Cite specific DTC codes and signal values in evidence.");
  return lines.join("\n");
}

// ── Fallback response ─────────────────────────────────────────────────────────

function buildFallback(requestId: string, evidence: AiEvidence, reason: string): AiResponse {
  const dtcs  = evidence.dtcs ?? [];
  const cause = evidence.primaryCause;

  const primary_issue = cause
    ? `${dtcs[0] ? dtcs[0].code + " — " : ""}${cause.title}`.slice(0, 80)
    : dtcs.length
      ? `${dtcs[0].code} — ${dtcs[0].title}`.slice(0, 80)
      : "No fault detected";

  const confidence: AiResponse["confidence"] =
    (evidence.severityLevel === "Critical" || evidence.severityLevel === "High") ? "medium" : "low";

  const evidenceItems: string[] = [];
  dtcs.slice(0, 3).forEach(d => evidenceItems.push(`${d.code}: ${d.title}`));
  if (evidence.fuelTrimNote) evidenceItems.push(`Fuel trim: ${evidence.fuelTrimNote}`);
  if (!evidenceItems.length) evidenceItems.push("No fault codes or significant anomalies detected");

  const explanation = cause
    ? `Your vehicle shows ${evidence.severityLevel?.toLowerCase() ?? "unknown"}-severity diagnostic findings. ${cause.explanation}`.slice(0, 500)
    : dtcs.length
      ? `Your vehicle has ${dtcs.length} stored fault code${dtcs.length > 1 ? "s" : ""}: ${dtcs.map(d => d.code).join(", ")}.`
      : "Your vehicle passed the diagnostic scan with no fault codes detected.";

  const next_steps = (evidence.recommendedChecks ?? []).slice(0, 4);
  if (!next_steps.length) next_steps.push("Schedule routine service and monitoring");

  return {
    requestId,
    primary_issue,
    confidence,
    explanation,
    evidence: evidenceItems,
    next_steps,
    warnings: [],
  };
}

// ── OpenRouter API call ───────────────────────────────────────────────────────

function callOpenRouter(apiKey: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "anthropic/claude-haiku-4-5",
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userMessage },
      ],
    });

    const options = {
      hostname: "openrouter.ai",
      path: "/api/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://obd-dashboard.web.app",
        "X-Title": "OBD Dashboard",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`OpenRouter error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.choices?.[0]?.message?.content;
          if (!text) reject(new Error("Empty response from OpenRouter"));
          else resolve(text as string);
        } catch (e) {
          reject(new Error(`Failed to parse OpenRouter response: ${e}`));
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("OpenRouter request timed out"));
    });
    req.write(body);
    req.end();
  });
}

// ── Response validator ────────────────────────────────────────────────────────

function parseAndValidate(raw: string): Partial<AiResponse> | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.primary_issue !== "string") return null;
    if (!["high", "medium", "low"].includes(obj.confidence as string)) return null;
    if (!Array.isArray(obj.next_steps)) return null;
    return obj as Partial<AiResponse>;
  } catch {
    return null;
  }
}

// ── CORS helper ───────────────────────────────────────────────────────────────

function setCorsHeaders(req: Request, res: Response): boolean {
  const origin = req.headers.origin as string | undefined;
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.set("Access-Control-Allow-Origin", allowed);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

// ── Cloud Function: aiDiagnose ────────────────────────────────────────────────

export const aiDiagnose = onRequest(
  {
    secrets: [OPENROUTER_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB",
    region: "us-central1",
  },
  async (req, res) => {
    if (setCorsHeaders(req, res)) return;

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[${requestId}] aiDiagnose start — method=${req.method}`);

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // ── Parse request ────────────────────────────────────────────────────────
    const body = req.body as AiRequest | undefined;
    if (!body?.evidence) {
      res.status(400).json({ error: "Missing evidence in request body" });
      return;
    }

    const { evidence, context } = body;

    // ── Check API key ────────────────────────────────────────────────────────
    const apiKey = OPENROUTER_API_KEY.value();
    if (!apiKey) {
      console.warn(`[${requestId}] OPENROUTER_API_KEY not set — returning fallback`);
      res.status(200).json(buildFallback(requestId, evidence, "API key not configured"));
      return;
    }

    // ── Call AI ──────────────────────────────────────────────────────────────
    try {
      const userMessage = buildUserMessage(evidence, context);
      const raw = await callOpenRouter(apiKey, userMessage);
      const parsed = parseAndValidate(raw);

      if (parsed) {
        console.log(`[${requestId}] aiDiagnose success — confidence=${parsed.confidence}`);
        res.status(200).json({
          requestId,
          ...parsed,
          warnings: parsed.warnings ?? [],
        });
      } else {
        console.warn(`[${requestId}] aiDiagnose response failed validation — using fallback`);
        res.status(200).json(buildFallback(requestId, evidence, "Response validation failed"));
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[${requestId}] aiDiagnose error — ${reason}`);
      res.status(200).json(buildFallback(requestId, evidence, reason));
    }
  }
);
