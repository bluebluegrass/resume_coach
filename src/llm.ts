import type { CandidateProfile, JobExtraction, ResumeFitResponse, ResumeRewriteResponse } from "./types.js";

const DEV_USE_MOCK = true;
const LLM_ENDPOINT = "https://example.com/positioning";

const SYSTEM_PROMPT = [
  "You are an expert resume strategist.",
  "Return STRICT JSON only. No markdown, no extra keys.",
  "Score fit to the provided role and provide practical tailoring guidance.",
  "Be concise and specific."
].join(" ");

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "you",
  "your",
  "that",
  "from",
  "are",
  "have",
  "will",
  "this",
  "our",
  "not",
  "but",
  "job",
  "role",
  "data",
  "work"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function buildDynamicMockFit(job: JobExtraction, resumeText: string): ResumeFitResponse {
  const jobTokens = tokenize(`${job.title} ${job.description}`);
  const resumeTokens = new Set(tokenize(resumeText));

  const uniqueJobTokens = Array.from(new Set(jobTokens)).slice(0, 180);
  const matched = uniqueJobTokens.filter((token) => resumeTokens.has(token));
  const coverage = uniqueJobTokens.length ? matched.length / uniqueJobTokens.length : 0;

  const fitScore = Math.max(35, Math.min(96, Math.round(35 + coverage * 65)));

  const hasMetrics = /\b\d+%|\b\d+\+?\b/.test(resumeText);
  const mentionsOwnership = /\bowned\b|\bled\b|\bmanaged\b|\bdelivered\b/i.test(resumeText);
  const mentionsStack = /\bsnowflake\b|\bdbt\b|\bdagster\b|\bairflow\b|\bbigquery\b/i.test(resumeText);

  const missingDetailsQuestions: string[] = [];
  if (!hasMetrics) {
    missingDetailsQuestions.push("Can you add quantified outcomes (percent, time saved, revenue, incidents reduced) for key bullets?");
  }
  if (!mentionsOwnership) {
    missingDetailsQuestions.push("Which projects did you directly own end-to-end, and what was the business impact?");
  }
  if (!mentionsStack) {
    missingDetailsQuestions.push("Which exact tools in the target stack have you used recently, and in what production context?");
  }
  if (!missingDetailsQuestions.length) {
    missingDetailsQuestions.push("Add one high-impact example that best matches the top requirement in this job posting.");
  }

  return {
    fitScore,
    fitRationale: `Matched ${matched.length} of ${uniqueJobTokens.length} key role terms from the current posting.`,
    missingDetailsQuestions,
    tailoringSteps: [
      "Rewrite your summary using the role's exact priorities and keywords.",
      "Move your strongest relevant impact bullet to the top of your latest role.",
      "Add measurable outcomes to at least 3 bullets.",
      "Mirror the job stack terminology where your experience is equivalent and truthful.",
      "Trim lower-relevance bullets so the first page is role-focused."
    ]
  };
}

function buildResumeFitPrompt(job: JobExtraction, profile: CandidateProfile, resumeText: string): string {
  return [
    "Score resume-to-role fit from 0-100.",
    "Provide a step-by-step tailoring plan.",
    "Do not rewrite the resume in this step.",
    "If missing details prevent strong tailoring, ask specific questions.",
    "Required JSON schema:",
    JSON.stringify(
      {
        fitScore: 0,
        fitRationale: "string",
        missingDetailsQuestions: ["string"],
        tailoringSteps: ["string"]
      },
      null,
      2
    ),
    "Candidate profile JSON:",
    JSON.stringify(profile, null, 2),
    "Job JSON:",
    JSON.stringify(job, null, 2),
    "Resume text:",
    resumeText
  ].join("\n\n");
}

function buildResumeRewritePrompt(job: JobExtraction, profile: CandidateProfile, resumeText: string): string {
  return [
    "Rewrite the resume to best match the role while staying truthful.",
    "Required JSON schema:",
    JSON.stringify(
      {
        tailoredResume: "string"
      },
      null,
      2
    ),
    "Candidate profile JSON:",
    JSON.stringify(profile, null, 2),
    "Job JSON:",
    JSON.stringify(job, null, 2),
    "Current resume text:",
    resumeText
  ].join("\n\n");
}

export function validateResumeFitResponse(data: unknown): data is ResumeFitResponse {
  const d = data as ResumeFitResponse;
  const scoreOk = typeof d.fitScore === "number" && Number.isFinite(d.fitScore) && d.fitScore >= 0 && d.fitScore <= 100;
  return (
    Boolean(d) &&
    scoreOk &&
    typeof d.fitRationale === "string" &&
    Array.isArray(d.missingDetailsQuestions) &&
    d.missingDetailsQuestions.every((q) => typeof q === "string") &&
    Array.isArray(d.tailoringSteps) &&
    d.tailoringSteps.every((s) => typeof s === "string")
  );
}

export function validateResumeRewriteResponse(data: unknown): data is ResumeRewriteResponse {
  const d = data as ResumeRewriteResponse;
  return Boolean(d) && typeof d.tailoredResume === "string" && d.tailoredResume.trim().length > 0;
}

async function readMockResponse<T>(path: string, validator: (value: unknown) => value is T): Promise<T> {
  const response = await fetch(chrome.runtime.getURL(path));
  const data = (await response.json()) as unknown;
  if (!validator(data)) {
    throw new Error(`Invalid JSON in ${path}`);
  }
  return data;
}

async function callRemoteLLM<T>(userPrompt: string, validator: (value: unknown) => value is T): Promise<T> {
  const response = await fetch(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system: SYSTEM_PROMPT,
      user: userPrompt
    })
  });

  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status})`);
  }

  const data = (await response.json()) as unknown;
  if (!validator(data)) {
    throw new Error("LLM returned invalid JSON schema");
  }

  return data;
}

export async function getResumeFit(
  job: JobExtraction,
  profile: CandidateProfile,
  resumeText: string
): Promise<ResumeFitResponse> {
  if (DEV_USE_MOCK) {
    const _ = profile;
    return buildDynamicMockFit(job, resumeText);
  }

  return callRemoteLLM(buildResumeFitPrompt(job, profile, resumeText), validateResumeFitResponse);
}

export async function getResumeRewrite(
  job: JobExtraction,
  profile: CandidateProfile,
  resumeText: string
): Promise<ResumeRewriteResponse> {
  if (DEV_USE_MOCK) {
    return readMockResponse("mock/resume_rewrite_response.json", validateResumeRewriteResponse);
  }

  return callRemoteLLM(buildResumeRewritePrompt(job, profile, resumeText), validateResumeRewriteResponse);
}
