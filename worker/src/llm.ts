import { z } from "zod";
import { DEFAULT_MODELS, DEFAULTS, asInt } from "./config";
import {
  jsonRepairPrompt,
  rewriteOutlinePrompt,
  rewritePrompt,
  rubricPrompt,
  scoringPrompt,
} from "./prompts";
import {
  FitResponseV2Schema,
  RewriteOutlineResponseSchema,
  RewriteResponseSchema,
  RubricResponseSchema,
  type FitRequest,
  type FitResponseV2,
  type RewriteRequest,
  type RewriteResponse,
} from "./schemas";

export type LLMEnv = {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL?: string;
  MODEL_FIT?: string;
  MODEL_REWRITE?: string;
  MODEL_REPAIR?: string;
  REQUEST_TIMEOUT_MS?: string;
  REQUEST_TIMEOUT_HEAVY_MS?: string;
  MAX_RETRIES?: string;
};

export class ModelOutputError extends Error {
  readonly code: string;

  constructor(message: string, code = "MODEL_OUTPUT_INVALID") {
    super(message);
    this.code = code;
  }
}

const SCHEMA_HINTS = {
  RubricResponse: JSON.stringify(
    {
      roleSummary: "string",
      categories: [
        {
          id: "A",
          name: "string",
          criteria: [
            {
              id: "A1",
              name: "string",
              weight: 0,
              requirementText: "string",
              matchType: "tool_specific",
              scoringGuide: {
                fullScore: "string",
                partialScore: "string",
                zeroScore: "string",
              },
            },
          ],
        },
      ],
      normalizationDictionary: [{ canonical: "Airflow", aliases: ["Cloud Composer"] }],
      weightTotalCheck: 100,
    },
    null,
    2,
  ),
  FitResponseV2: JSON.stringify(
    {
      fitScore: 0,
      fitRationale: "string",
      categoryScores: [{ categoryId: "A", score: 0, max: 0 }],
      criteriaScores: [
        {
          criterionId: "A1",
          criterionName: "string",
          score: 0,
          max: 0,
          resumeEvidenceQuotes: ["string"],
          rationale: "string",
          missing: false,
        },
      ],
      missingDetailsQuestions: ["string"],
      tailoringSteps: ["string"],
      normalizationApplied: ["alias -> canonical"],
    },
    null,
    2,
  ),
  RewriteOutlineResponse: JSON.stringify(
    {
      targetHeadline: "string",
      summaryDirectives: ["string"],
      experienceDirectives: ["string"],
      keywordTargets: ["string"],
      truthGuardrails: ["string"],
    },
    null,
    2,
  ),
  RewriteResponse: JSON.stringify(
    {
      tailoredResume: "string",
    },
    null,
    2,
  ),
} as const;

function isHeavyModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.startsWith("gpt-5") || normalized.startsWith("claude-opus");
}

function getTimeoutMs(env: LLMEnv, model: string): number {
  const defaultTimeout = asInt(env.REQUEST_TIMEOUT_MS, DEFAULTS.requestTimeoutMs);
  const heavyTimeout = asInt(env.REQUEST_TIMEOUT_HEAVY_MS, DEFAULTS.requestTimeoutHeavyMs);
  return isHeavyModel(model) ? Math.max(defaultTimeout, heavyTimeout) : defaultTimeout;
}

function getMaxRetries(env: LLMEnv): number {
  return Math.max(0, asInt(env.MAX_RETRIES, DEFAULTS.maxRetries));
}

function getModelName(env: LLMEnv, kind: "fit" | "rewrite" | "repair"): string {
  if (kind === "fit") return env.MODEL_FIT || DEFAULT_MODELS.fit;
  if (kind === "rewrite") return env.MODEL_REWRITE || DEFAULT_MODELS.rewrite;
  return env.MODEL_REPAIR || DEFAULT_MODELS.repair;
}

function resolveApiKey(env: LLMEnv, requestApiKey?: string): string {
  const key = requestApiKey?.trim() || env.OPENAI_API_KEY?.trim() || "";
  if (!key) {
    throw new ModelOutputError("Missing API key for model call", "MISSING_API_KEY");
  }
  return key;
}

function resolveModel(env: LLMEnv, kind: "fit" | "rewrite" | "repair", requestModel?: string): string {
  const model = requestModel?.trim() || getModelName(env, kind);
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(model)) {
    throw new ModelOutputError("Invalid model name", "INVALID_MODEL_NAME");
  }
  return model;
}

function isRetriableStatus(status: number): boolean {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

function openAiUrl(env: LLMEnv): string {
  const base = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  return `${base}/chat/completions`;
}

function extractContent(payload: unknown): string {
  const data = payload as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
    if (joined) return joined;
  }

  throw new ModelOutputError("Model response missing text content", "MODEL_EMPTY_CONTENT");
}

async function callModelRaw(input: {
  env: LLMEnv;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  stage: string;
}): Promise<string> {
  const { env, model, apiKey, system, user, stage } = input;
  const timeoutMs = getTimeoutMs(env, model);
  const maxRetries = getMaxRetries(env);

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(openAiUrl(env), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = (await response.text()).slice(0, 800);
        if (response.status === 401 || response.status === 403) {
          throw new ModelOutputError("Invalid API key for model call", "INVALID_API_KEY");
        }
        if (response.status === 400 || response.status === 404) {
          throw new ModelOutputError(
            `Model request failed (${response.status})`,
            "MODEL_OR_PROVIDER_MISMATCH",
          );
        }
        const err = new Error(`Model ${stage} failed (${response.status}): ${bodyText}`);
        if (attempt < maxRetries && isRetriableStatus(response.status)) {
          attempt += 1;
          continue;
        }
        throw err;
      }

      const payload = (await response.json()) as unknown;
      return extractContent(payload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown model error");
      lastError = err;
      const isAbort = err.name === "AbortError";
      if (attempt < maxRetries && isAbort) {
        attempt += 1;
        continue;
      }
      if (isAbort) {
        throw new ModelOutputError(
          `Model ${stage} timed out after ${timeoutMs}ms`,
          "MODEL_TIMEOUT",
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error(`Model ${stage} failed`);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const candidate = raw.slice(first, last + 1);
      return JSON.parse(candidate);
    }
    throw new ModelOutputError("Response is not valid JSON", "MODEL_JSON_PARSE_FAILED");
  }
}

async function parseWithRepair<T>(input: {
  env: LLMEnv;
  apiKey: string;
  model: string;
  stage: string;
  schemaName: string;
  schema: z.ZodType<T>;
  raw: string;
}): Promise<T> {
  const { env, apiKey, model, stage, schemaName, schema, raw } = input;

  const schemaHint = SCHEMA_HINTS[schemaName as keyof typeof SCHEMA_HINTS] || "{}";

  let currentRaw = raw;
  let validationIssues: string[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const parsed = parseJson(currentRaw);
      return schema.parse(parsed);
    } catch (error) {
      const zodError = error instanceof z.ZodError ? error : null;
      validationIssues = zodError
        ? zodError.issues.slice(0, 12).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        : [error instanceof Error ? error.message : "Unknown parsing error"];

      if (attempt >= 2) {
        const message =
          error instanceof Error ? error.message : "Failed to parse repaired JSON";
        throw new ModelOutputError(`${stage} invalid JSON after repair: ${message}`, "MODEL_JSON_REPAIR_FAILED");
      }

      currentRaw = await callModelRaw({
        env,
        model,
        apiKey,
        system: "You are a strict JSON repair engine.",
        user: jsonRepairPrompt({
          rawText: currentRaw,
          schemaName,
          schemaHint,
          validationIssues,
        }),
        stage: `${stage}-repair-${attempt + 1}`,
      });
    }
  }

  throw new ModelOutputError(`${stage} invalid JSON after repair`, "MODEL_JSON_REPAIR_FAILED");
}

function normalizeFitResponse(fit: FitResponseV2): FitResponseV2 {
  const normalizedCriteria = fit.criteriaScores.map((criterion) => {
    const max = Number.isFinite(criterion.max) ? Math.max(0, Math.trunc(criterion.max)) : 0;
    const rawScore = Number.isFinite(criterion.score) ? Math.trunc(criterion.score) : 0;
    const score = Math.max(0, Math.min(max, rawScore));
    const quotes = criterion.resumeEvidenceQuotes.slice(0, 3);
    const missing = score === 0 || criterion.missing;
    return {
      ...criterion,
      max,
      score,
      resumeEvidenceQuotes: quotes,
      missing,
    };
  });

  const categoryMap = new Map<string, { score: number; max: number }>();
  for (const criterion of normalizedCriteria) {
    const categoryId = criterion.criterionId.match(/^[A-Za-z]+/)?.[0] || "A";
    const prev = categoryMap.get(categoryId) || { score: 0, max: 0 };
    categoryMap.set(categoryId, {
      score: prev.score + criterion.score,
      max: prev.max + criterion.max,
    });
  }

  const categoryScores = Array.from(categoryMap.entries()).map(([categoryId, value]) => ({
    categoryId,
    score: value.score,
    max: value.max,
  }));

  const fitScore = normalizedCriteria.reduce((sum, criterion) => sum + criterion.score, 0);
  const clampedFitScore = Math.max(0, Math.min(100, fitScore));

  return {
    ...fit,
    fitScore: clampedFitScore,
    criteriaScores: normalizedCriteria,
    categoryScores,
    missingDetailsQuestions: fit.missingDetailsQuestions.slice(0, 10),
    tailoringSteps: fit.tailoringSteps.slice(0, 12),
    normalizationApplied: fit.normalizationApplied.slice(0, 20),
  };
}

export async function fitPipeline(env: LLMEnv, request: FitRequest): Promise<FitResponseV2> {
  const apiKey = resolveApiKey(env, request.apiKey);
  const fitModel = resolveModel(env, "fit", request.model);
  const repairModel = resolveModel(env, "repair", request.model);

  const rubricRaw = await callModelRaw({
    env,
    model: fitModel,
    apiKey,
    system: "You generate strict scoring rubrics.",
    user: rubricPrompt({ jdText: request.jdText }),
    stage: "fit-rubric",
  });

  const rubric = await parseWithRepair({
    env,
    apiKey,
    model: repairModel,
    stage: "fit-rubric",
    schemaName: "RubricResponse",
    schema: RubricResponseSchema,
    raw: rubricRaw,
  });

  const scoringRaw = await callModelRaw({
    env,
    model: fitModel,
    apiKey,
    system: "You are a strict rubric-based fit scoring engine.",
    user: scoringPrompt({
      jdText: request.jdText,
      resumeText: request.resumeText,
      rubric,
      candidateProfile: request.candidateProfile,
    }),
    stage: "fit-scoring",
  });

  const scored = await parseWithRepair({
    env,
    apiKey,
    model: repairModel,
    stage: "fit-scoring",
    schemaName: "FitResponseV2",
    schema: FitResponseV2Schema,
    raw: scoringRaw,
  });

  return normalizeFitResponse(scored);
}

export async function rewritePipeline(env: LLMEnv, request: RewriteRequest): Promise<RewriteResponse> {
  const apiKey = resolveApiKey(env, request.apiKey);
  const rewriteModel = resolveModel(env, "rewrite", request.model);
  const repairModel = resolveModel(env, "repair", request.model);

  const outlineRaw = await callModelRaw({
    env,
    model: rewriteModel,
    apiKey,
    system: "You generate truthful resume rewrite outlines.",
    user: rewriteOutlinePrompt({
      jdText: request.jdText,
      resumeText: request.resumeText,
      candidateProfile: request.candidateProfile,
    }),
    stage: "rewrite-outline",
  });

  const outline = await parseWithRepair({
    env,
    apiKey,
    model: repairModel,
    stage: "rewrite-outline",
    schemaName: "RewriteOutlineResponse",
    schema: RewriteOutlineResponseSchema,
    raw: outlineRaw,
  });

  const rewriteRaw = await callModelRaw({
    env,
    model: rewriteModel,
    apiKey,
    system: "You rewrite resumes truthfully using provided outline.",
    user: rewritePrompt({
      jdText: request.jdText,
      resumeText: request.resumeText,
      outline,
      candidateProfile: request.candidateProfile,
    }),
    stage: "rewrite-final",
  });

  return parseWithRepair({
    env,
    apiKey,
    model: repairModel,
    stage: "rewrite-final",
    schemaName: "RewriteResponse",
    schema: RewriteResponseSchema,
    raw: rewriteRaw,
  });
}
