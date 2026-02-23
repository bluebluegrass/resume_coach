import { DEFAULTS, asInt } from "./config";
import { ModelOutputError, fitPipeline, rewritePipeline, type LLMEnv } from "./llm";
import { FitRequestSchema, RewriteRequestSchema } from "./schemas";

type Env = LLMEnv & {
  ALLOWED_ORIGIN?: string;
  RATE_LIMIT_PER_MIN?: string;
  MAX_CHARS_TOTAL?: string;
  MAX_BODY_BYTES?: string;
};

type RateBucket = {
  resetAt: number;
  count: number;
};

const rateMap = new Map<string, RateBucket>();

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getRateLimit(env: Env): number {
  return asInt(env.RATE_LIMIT_PER_MIN, DEFAULTS.rateLimitPerMin);
}

function getMaxCharsTotal(env: Env): number {
  return asInt(env.MAX_CHARS_TOTAL, DEFAULTS.maxCharsTotal);
}

function getMaxBodyBytes(env: Env): number {
  return asInt(env.MAX_BODY_BYTES, DEFAULTS.maxBodyBytes);
}

function getClientIp(request: Request): string {
  const direct = request.headers.get("CF-Connecting-IP");
  if (direct) return direct;

  const fwd = request.headers.get("X-Forwarded-For");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";

  return "unknown";
}

function checkRateLimit(request: Request, env: Env): void {
  const limit = getRateLimit(env);
  const now = Date.now();
  const key = getClientIp(request);
  const current = rateMap.get(key);

  if (!current || now >= current.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }

  if (current.count >= limit) {
    throw new HttpError(429, "RATE_LIMITED", "Too many requests. Please retry shortly.");
  }

  current.count += 1;
  rateMap.set(key, current);
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") || "*";
  const allowed = env.ALLOWED_ORIGIN?.trim();
  const allowOrigin = !allowed || allowed === "*" ? "*" : origin === allowed ? origin : allowed;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request: Request, env: Env, status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readJsonBody(request: Request, env: Env): Promise<unknown> {
  const raw = await request.text();
  if (raw.length === 0) {
    throw new HttpError(400, "EMPTY_BODY", "Request body is required.");
  }
  if (raw.length > getMaxBodyBytes(env)) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds size limit.");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

function validateInputLengths(resumeText: string, jdText: string, env: Env): number {
  const total = resumeText.length + jdText.length;
  if (total > getMaxCharsTotal(env)) {
    throw new HttpError(413, "TEXT_TOO_LONG", `resumeText + jdText exceeds ${getMaxCharsTotal(env)} chars.`);
  }
  return total;
}

function logEvent(input: {
  path: string;
  status: number;
  durationMs: number;
  inputChars: number;
  errorCode?: string;
}): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      path: input.path,
      status: input.status,
      durationMs: input.durationMs,
      inputChars: input.inputChars,
      errorCode: input.errorCode ?? null,
    }),
  );
}

async function handleFit(request: Request, env: Env): Promise<Response> {
  const startedAt = Date.now();
  let inputChars = 0;

  try {
    checkRateLimit(request, env);

    const payload = await readJsonBody(request, env);
    const parsed = FitRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message || "Invalid /fit payload");
    }

    inputChars = validateInputLengths(parsed.data.resumeText, parsed.data.jdText, env);
    const fit = await fitPipeline(env, parsed.data);

    const response = {
      fitScore: fit.fitScore,
      fitRationale: fit.fitRationale,
      missingDetailsQuestions: fit.missingDetailsQuestions,
      tailoringSteps: fit.tailoringSteps,
      criteriaScores: fit.criteriaScores,
      categoryScores: fit.categoryScores,
      normalizationApplied: fit.normalizationApplied,
    };

    const durationMs = Date.now() - startedAt;
    logEvent({ path: "/fit", status: 200, durationMs, inputChars });
    return jsonResponse(request, env, 200, response);
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error instanceof HttpError) {
      logEvent({ path: "/fit", status: error.status, durationMs, inputChars, errorCode: error.code });
      return jsonResponse(request, env, error.status, { ok: false, code: error.code, error: error.message });
    }

    if (error instanceof ModelOutputError) {
      const status =
        error.code === "MISSING_API_KEY" || error.code === "INVALID_MODEL_NAME"
          ? 400
          : error.code === "INVALID_API_KEY"
            ? 401
            : error.code === "MODEL_OR_PROVIDER_MISMATCH"
              ? 400
              : error.code === "MODEL_TIMEOUT"
                ? 504
            : 422;
      const message =
        error.code === "MISSING_API_KEY"
          ? "Missing API key. Set OPENAI_API_KEY on server or provide apiKey in request."
          : error.code === "INVALID_MODEL_NAME"
            ? "Invalid model name format."
            : error.code === "INVALID_API_KEY"
              ? "Invalid API key. Please check your key and try again."
              : error.code === "MODEL_OR_PROVIDER_MISMATCH"
                ? "Selected model is not available for the current provider/key. Check model name and provider compatibility."
                : error.code === "MODEL_TIMEOUT"
                  ? "Model request timed out. Retry, shorten input, or use a faster model (for example gpt-5-mini / gpt-4o-mini)."
            : "Model output validation failed. Please retry.";
      logEvent({ path: "/fit", status, durationMs, inputChars, errorCode: error.code });
      return jsonResponse(request, env, status, {
        ok: false,
        code: error.code,
        error: message,
      });
    }

    const message = error instanceof Error ? error.message : "Unexpected server error";
    logEvent({ path: "/fit", status: 500, durationMs, inputChars, errorCode: "INTERNAL_ERROR" });
    return jsonResponse(request, env, 500, { ok: false, code: "INTERNAL_ERROR", error: message });
  }
}

async function handleRewrite(request: Request, env: Env): Promise<Response> {
  const startedAt = Date.now();
  let inputChars = 0;

  try {
    checkRateLimit(request, env);

    const payload = await readJsonBody(request, env);
    const parsed = RewriteRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message || "Invalid /rewrite payload");
    }

    inputChars = validateInputLengths(parsed.data.resumeText, parsed.data.jdText, env);
    const rewrite = await rewritePipeline(env, parsed.data);

    const durationMs = Date.now() - startedAt;
    logEvent({ path: "/rewrite", status: 200, durationMs, inputChars });
    return jsonResponse(request, env, 200, rewrite);
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error instanceof HttpError) {
      logEvent({ path: "/rewrite", status: error.status, durationMs, inputChars, errorCode: error.code });
      return jsonResponse(request, env, error.status, { ok: false, code: error.code, error: error.message });
    }

    if (error instanceof ModelOutputError) {
      const status =
        error.code === "MISSING_API_KEY" || error.code === "INVALID_MODEL_NAME"
          ? 400
          : error.code === "INVALID_API_KEY"
            ? 401
            : error.code === "MODEL_OR_PROVIDER_MISMATCH"
              ? 400
              : error.code === "MODEL_TIMEOUT"
                ? 504
            : 422;
      const message =
        error.code === "MISSING_API_KEY"
          ? "Missing API key. Set OPENAI_API_KEY on server or provide apiKey in request."
          : error.code === "INVALID_MODEL_NAME"
            ? "Invalid model name format."
            : error.code === "INVALID_API_KEY"
              ? "Invalid API key. Please check your key and try again."
              : error.code === "MODEL_OR_PROVIDER_MISMATCH"
                ? "Selected model is not available for the current provider/key. Check model name and provider compatibility."
                : error.code === "MODEL_TIMEOUT"
                  ? "Model request timed out. Retry, shorten input, or use a faster model (for example gpt-5-mini / gpt-4o-mini)."
            : "Model output validation failed. Please retry.";
      logEvent({ path: "/rewrite", status, durationMs, inputChars, errorCode: error.code });
      return jsonResponse(request, env, status, {
        ok: false,
        code: error.code,
        error: message,
      });
    }

    const message = error instanceof Error ? error.message : "Unexpected server error";
    logEvent({ path: "/rewrite", status: 500, durationMs, inputChars, errorCode: "INTERNAL_ERROR" });
    return jsonResponse(request, env, 500, { ok: false, code: "INTERNAL_ERROR", error: message });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(request, env, 200, { ok: true });
    }

    if (request.method === "POST" && url.pathname === "/fit") {
      return handleFit(request, env);
    }

    if (request.method === "POST" && url.pathname === "/rewrite") {
      return handleRewrite(request, env);
    }

    return jsonResponse(request, env, 404, { ok: false, code: "NOT_FOUND", error: "Route not found." });
  },
};
