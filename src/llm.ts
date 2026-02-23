import type {
  CandidateProfile,
  JobExtraction,
  JobRubricResponse,
  ResumeFitResponse,
  ResumeFitResponseV2,
  ResumeRewriteResponse,
} from "./types.js";

const DEFAULT_USE_MOCK = true;
const LLM_ENDPOINT = "https://example.com/positioning";

const SYSTEM_PROMPT = [
  "You are a strict rubric-based evaluator for resume-job fit.",
  "Return STRICT JSON only. No markdown, no extra keys.",
  "Use evidence present in the resume. If missing, mark missing.",
  "Do not fabricate tools, employers, certifications, ownership, or metrics.",
  "Apply normalization/synonym matching only when semantically equivalent.",
  "Be deterministic, concise, and explicit.",
].join(" ");

type RewriteOutlineResponse = {
  targetHeadline: string;
  summaryDirectives: string[];
  experienceDirectives: string[];
  keywordTargets: string[];
  truthGuardrails: string[];
};

type MockCriterion = {
  id: string;
  name: string;
  max: number;
  strongTerms: string[];
  weakTerms: string[];
  missingQuestion: string;
  tailoringStep: string;
};

const MOCK_CRITERIA: MockCriterion[] = [
  {
    id: "A1",
    name: "SQL depth & analytics queries",
    max: 10,
    strongTerms: ["sql", "window function", "cte", "query optimization"],
    weakTerms: ["query", "analytics"],
    missingQuestion: "Can you add one bullet showing advanced SQL work and measurable impact?",
    tailoringStep: "Add one SQL-heavy bullet with complexity and business outcome.",
  },
  {
    id: "A2",
    name: "Data modeling for analytics",
    max: 10,
    strongTerms: ["data model", "dimensional", "star schema", "fact", "semantic model", "data mart"],
    weakTerms: ["modeling", "schema"],
    missingQuestion: "Which analytics models (facts/dimensions/marts) did you design and own?",
    tailoringStep: "Highlight analytics data modeling ownership in your most recent role.",
  },
  {
    id: "A3",
    name: "dbt hands-on",
    max: 10,
    strongTerms: ["dbt", "dbt cloud", "dbt core", "dbt test"],
    weakTerms: ["transformation framework", "elt modeling"],
    missingQuestion: "Do you have recent dbt usage with tests/macros/packages you can add?",
    tailoringStep: "Explicitly mention dbt implementation details (models, tests, deployment).",
  },
  {
    id: "A4",
    name: "Cloud warehouse match",
    max: 5,
    strongTerms: ["bigquery", "snowflake", "redshift", "databricks sql"],
    weakTerms: ["cloud warehouse", "warehouse"],
    missingQuestion: "Which cloud warehouse did you use in production and at what scale?",
    tailoringStep: "Name the production warehouse platform and workload scale.",
  },
  {
    id: "A5",
    name: "Orchestration",
    max: 5,
    strongTerms: ["airflow", "cloud composer", "dag", "scheduler", "orchestration"],
    weakTerms: ["pipeline scheduling", "workflow"],
    missingQuestion: "Can you add an orchestration example (Airflow/Composer or equivalent)?",
    tailoringStep: "Add one bullet about orchestrating and monitoring production pipelines.",
  },
  {
    id: "B1",
    name: "End-to-end ownership",
    max: 10,
    strongTerms: ["owned end-to-end", "from discovery to production", "intake to production", "productionized"],
    weakTerms: ["owned", "delivered", "led"],
    missingQuestion: "Which projects did you own from intake through production support?",
    tailoringStep: "Show lifecycle ownership from intake/design to production operations.",
  },
  {
    id: "B2",
    name: "Stakeholder KPI translation",
    max: 8,
    strongTerms: ["kpi", "stakeholder", "product partnership", "business metric", "translated requirements"],
    weakTerms: ["cross-functional", "partnered"],
    missingQuestion: "Where did you translate stakeholder goals into data deliverables tied to KPIs?",
    tailoringStep: "Tie data work to stakeholder questions and KPI movement.",
  },
  {
    id: "B3",
    name: "Quality, testing, governance, cost/perf",
    max: 7,
    strongTerms: ["data quality", "tests", "governance", "lineage", "cost optimization", "performance tuning"],
    weakTerms: ["reliability", "quality checks", "monitoring"],
    missingQuestion: "Can you add explicit testing/governance or cost-performance outcomes?",
    tailoringStep: "Add testing/governance details and one cost/performance result.",
  },
  {
    id: "C1",
    name: "Mentoring and team standards",
    max: 10,
    strongTerms: ["mentored", "coached", "code review", "team standards", "hiring loop"],
    weakTerms: ["collaborated", "supported team"],
    missingQuestion: "What mentoring or review responsibilities can you state explicitly?",
    tailoringStep: "Add evidence of mentoring, code reviews, and standards setting.",
  },
  {
    id: "C2",
    name: "Engineering best practices",
    max: 8,
    strongTerms: ["ci/cd", "release process", "conventions", "version control workflow", "automated deployment"],
    weakTerms: ["best practices", "automation"],
    missingQuestion: "Can you include CI/CD or release-governance practices you implemented?",
    tailoringStep: "Call out CI/CD and release practices tied to reliability or speed.",
  },
  {
    id: "C3",
    name: "RCA and incident ownership",
    max: 7,
    strongTerms: ["root cause analysis", "incident", "postmortem", "sla", "on-call"],
    weakTerms: ["troubleshooting", "debugging"],
    missingQuestion: "Add one incident/RCA example with corrective action and outcome.",
    tailoringStep: "Include incident response and postmortem ownership evidence.",
  },
  {
    id: "D1",
    name: "Everything-as-code and automation",
    max: 5,
    strongTerms: ["infrastructure as code", "terraform", "everything as code", "automation"],
    weakTerms: ["iac", "scripts"],
    missingQuestion: "Do you have IaC/automation work you can surface explicitly?",
    tailoringStep: "Add one IaC/automation bullet with measurable operations benefit.",
  },
  {
    id: "D2",
    name: "Semantic/AI analytics alignment",
    max: 5,
    strongTerms: ["semantic layer", "metrics layer", "conversational analytics", "llm analytics", "ai analytics"],
    weakTerms: ["semantic model", "self-serve analytics"],
    missingQuestion: "Any semantic/metrics layer or AI analytics enabling work to highlight?",
    tailoringStep: "Include one semantic or AI analytics enablement example if applicable.",
  },
];

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitEvidenceUnits(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|;\s+|•\s+|\s-\s+/)
    .map((line) => sanitizeText(line))
    .filter((line) => line.length >= 20);
}

function countTermHits(text: string, terms: string[]): number {
  let hits = 0;
  for (const term of terms) {
    if (text.includes(term.toLowerCase())) {
      hits += 1;
    }
  }
  return hits;
}

function extractEvidenceQuotes(
  evidenceUnits: string[],
  strongTerms: string[],
  weakTerms: string[],
): string[] {
  const strong = strongTerms.map((term) => term.toLowerCase());
  const weak = weakTerms.map((term) => term.toLowerCase());
  const strongMatches = evidenceUnits.filter((line) =>
    strong.some((term) => line.toLowerCase().includes(term)),
  );
  if (strongMatches.length > 0) {
    return strongMatches.slice(0, 2);
  }

  const weakMatches = evidenceUnits.filter((line) =>
    weak.some((term) => line.toLowerCase().includes(term)),
  );
  return weakMatches.slice(0, 2);
}

function scoreBySignals(strongHits: number, weakHits: number, max: number): number {
  if (strongHits >= 3) {
    return max;
  }
  if (strongHits === 2) {
    return Math.max(1, Math.round(max * 0.8));
  }
  if (strongHits === 1 && weakHits >= 1) {
    return Math.max(1, Math.round(max * 0.7));
  }
  if (strongHits === 1) {
    return Math.max(1, Math.round(max * 0.6));
  }
  if (weakHits >= 2) {
    return Math.max(1, Math.round(max * 0.45));
  }
  if (weakHits === 1) {
    return Math.max(1, Math.round(max * 0.25));
  }
  return 0;
}

function scoreReasoning(score: number, max: number, criterionName: string): string {
  if (score === 0) {
    return `No direct resume evidence found for ${criterionName}.`;
  }
  if (score <= Math.floor(max * 0.4)) {
    return `Indirect evidence exists for ${criterionName}, but depth and specificity are limited.`;
  }
  if (score < max) {
    return `Clear evidence supports ${criterionName}, with moderate depth relative to the role expectation.`;
  }
  return `Strong, explicit, and repeated evidence aligns well with ${criterionName}.`;
}

function hasImpactMetric(text: string): boolean {
  const lower = text.toLowerCase();
  const actionNearMetric =
    /\b(increased|improved|reduced|decreased|saved|boosted|grew|lowered|cut)\b[^.!?]{0,40}\b(\d+(?:\.\d+)?%|\$?\d+(?:\.\d+)?\s?(k|m|b)?|\d+x)\b/i;
  const metricNearAction =
    /\b(\d+(?:\.\d+)?%|\$?\d+(?:\.\d+)?\s?(k|m|b)?|\d+x)\b[^.!?]{0,40}\b(increased|improved|reduced|decreased|saved|boosted|grew|lowered|cut)\b/i;
  return actionNearMetric.test(lower) || metricNearAction.test(lower);
}

function toResumeFitResponse(v2: ResumeFitResponseV2): ResumeFitResponse {
  return {
    fitScore: v2.fitScore,
    fitRationale: v2.fitRationale,
    missingDetailsQuestions: v2.missingDetailsQuestions,
    tailoringSteps: v2.tailoringSteps,
  };
}

function buildDynamicMockFitV2(job: JobExtraction, resumeText: string): ResumeFitResponseV2 {
  const resumeLower = resumeText.toLowerCase();
  const evidenceUnits = splitEvidenceUnits(resumeText);

  const criteriaScores = MOCK_CRITERIA.map((criterion) => {
    const strongHits = countTermHits(resumeLower, criterion.strongTerms);
    const weakHits = countTermHits(resumeLower, criterion.weakTerms);
    const evidence = extractEvidenceQuotes(evidenceUnits, criterion.strongTerms, criterion.weakTerms);
    const rawScore = evidence.length ? scoreBySignals(strongHits, weakHits, criterion.max) : 0;
    const score = Math.min(criterion.max, Math.max(0, rawScore));
    return {
      criterionId: criterion.id,
      criterionName: criterion.name,
      score,
      max: criterion.max,
      resumeEvidenceQuotes: evidence,
      rationale: scoreReasoning(score, criterion.max, criterion.name),
      missing: score === 0,
    };
  });

  if (!hasImpactMetric(resumeText)) {
    for (const criterion of criteriaScores) {
      if (criterion.criterionId === "B2" || criterion.criterionId === "B3") {
        criterion.score = Math.max(0, criterion.score - 1);
        criterion.rationale = `${criterion.rationale} Quantified impact is limited.`;
      }
    }
  }

  const categoryOrder = ["A", "B", "C", "D"];
  const categoryScores = categoryOrder.map((categoryId) => {
    const items = criteriaScores.filter((item) => item.criterionId.startsWith(categoryId));
    return {
      categoryId,
      score: items.reduce((sum, item) => sum + item.score, 0),
      max: items.reduce((sum, item) => sum + item.max, 0),
    };
  });

  const fitScore = criteriaScores.reduce((sum, item) => sum + item.score, 0);
  const strongest = [...criteriaScores].sort((a, b) => b.score / b.max - a.score / a.max).slice(0, 2);
  const weakest = [...criteriaScores].sort((a, b) => a.score / a.max - b.score / b.max).slice(0, 2);

  const missingDetailsQuestions = criteriaScores
    .filter((item) => item.score <= Math.floor(item.max * 0.4))
    .map((item) => MOCK_CRITERIA.find((criterion) => criterion.id === item.criterionId)?.missingQuestion ?? "")
    .filter((item) => item.length > 0)
    .slice(0, 5);

  if (missingDetailsQuestions.length === 0) {
    missingDetailsQuestions.push("Add one quantified example that maps directly to the top JD requirement.");
  }

  const tailoringSteps = criteriaScores
    .filter((item) => item.score < item.max)
    .sort((a, b) => a.score / a.max - b.score / b.max)
    .map((item) => MOCK_CRITERIA.find((criterion) => criterion.id === item.criterionId)?.tailoringStep ?? "")
    .filter((item) => item.length > 0)
    .slice(0, 5);

  if (tailoringSteps.length === 0) {
    tailoringSteps.push("Keep strongest role-matching bullets at the top and preserve measurable impact language.");
  }

  return {
    fitScore,
    fitRationale: `Scored ${fitScore}/100 using evidence across ${criteriaScores.length} rubric criteria for ${job.title}. Strongest: ${strongest
      .map((item) => item.criterionName)
      .join(", ")}. Weakest: ${weakest.map((item) => item.criterionName).join(", ")}.`,
    categoryScores,
    criteriaScores,
    missingDetailsQuestions,
    tailoringSteps,
    normalizationApplied: [
      "cloud composer -> airflow",
      "gcp data warehouse -> bigquery",
      "elt modeling tool -> dbt",
    ],
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

async function shouldUseMock(): Promise<boolean> {
  try {
    const data = await chrome.storage.local.get("USE_MOCK_LLM");
    if (typeof data.USE_MOCK_LLM === "boolean") {
      return data.USE_MOCK_LLM;
    }
  } catch {
    // Fall through to default.
  }
  return DEFAULT_USE_MOCK;
}

function buildRoleSignalPrompt(job: JobExtraction): string {
  return [
    "Task 1 of 2 for resume fit scoring: generate a JD-specific rubric.",
    "",
    "You are an ATS-grade rubric generator.",
    "Return STRICT JSON only. No markdown. No extra keys.",
    "Do NOT score the resume in this task.",
    "",
    "Rubric rules:",
    "- Extract atomic requirements from the JD (tools, responsibilities, leadership, processes).",
    "- Group into 4–6 categories, each with 3–6 criteria.",
    "- Assign INTEGER weights to criteria that sum to EXACTLY 100.",
    "- Weight higher if repeated, emphasized in Role Purpose/Key Responsibilities, or uses strong language (must/deep/own/lead).",
    "- Weight lower if preferred/nice-to-have/lightly mentioned.",
    "- Include normalizationDictionary with canonical terms and aliases.",
    "",
    "Required JSON schema:",
    JSON.stringify(
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
        normalizationDictionary: [{ canonical: "string", aliases: ["string"] }],
        weightTotalCheck: 100,
      },
      null,
      2,
    ),
    "",
    "Job JSON:",
    JSON.stringify(job, null, 2),
  ].join("\n");
}

function buildResumeFitPrompt(
  job: JobExtraction,
  profile: CandidateProfile,
  resumeText: string,
  rubric: JobRubricResponse,
): string {
  return [
    "Task 2 of 2 for resume fit scoring: score resume against the provided rubric.",
    "",
    "You are an ATS-grade fit scoring engine.",
    "Return STRICT JSON only. No markdown. No extra keys.",
    "Do NOT rewrite the resume.",
    "Never fabricate experience, tools, employers, certifications, or metrics.",
    "",
    "Critical scoring rules:",
    "- Evidence-based: each criterion must include 1–3 resumeEvidenceQuotes OR mark missing=true.",
    "- Apply normalizationDictionary (aliases count as matches to canonical terms).",
    "- Do NOT use keyword overlap as the primary method; match capabilities and responsibility scope.",
    "- Score each criterion with an integer from 0..weight. Sum must equal fitScore.",
    "- categoryScores must exactly match aggregated criteriaScores per category.",
    "",
    "Required JSON schema:",
    JSON.stringify(
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
        normalizationApplied: ["string"],
      },
      null,
      2,
    ),
    "",
    "Rubric JSON:",
    JSON.stringify(rubric, null, 2),
    "",
    "Candidate profile JSON:",
    JSON.stringify(profile, null, 2),
    "",
    "Job snapshot JSON:",
    JSON.stringify(
      {
        title: job.title,
        company: job.company,
        location: job.location,
        sourceUrl: job.sourceUrl,
      },
      null,
      2,
    ),
    "",
    "Resume text:",
    resumeText,
  ].join("\n");
}

function buildRewriteOutlinePrompt(
  job: JobExtraction,
  profile: CandidateProfile,
  resumeText: string,
): string {
  return [
    "Task 1 of 2 for resume rewriting.",
    "Produce a concrete rewrite outline only, not the full rewrite yet.",
    "Preserve truthfulness and prioritize highest-impact role alignment.",
    "Required JSON schema:",
    JSON.stringify(
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
    "Candidate profile JSON:",
    JSON.stringify(profile, null, 2),
    "Job JSON:",
    JSON.stringify(job, null, 2),
    "Current resume text:",
    resumeText,
  ].join("\n\n");
}

function buildResumeRewritePrompt(
  job: JobExtraction,
  profile: CandidateProfile,
  resumeText: string,
  rewriteOutline: RewriteOutlineResponse,
): string {
  return [
    "Task 2 of 2 for resume rewriting.",
    "Use the rewrite outline and produce the full tailored resume.",
    "Keep claims strictly grounded in provided input. No invented metrics or roles.",
    "Required JSON schema:",
    JSON.stringify(
      {
        tailoredResume: "string",
      },
      null,
      2,
    ),
    "Rewrite outline JSON:",
    JSON.stringify(rewriteOutline, null, 2),
    "Candidate profile JSON:",
    JSON.stringify(profile, null, 2),
    "Job JSON:",
    JSON.stringify(job, null, 2),
    "Current resume text:",
    resumeText,
  ].join("\n\n");
}

function validateRewriteOutlineResponse(data: unknown): data is RewriteOutlineResponse {
  const d = data as RewriteOutlineResponse;
  return (
    Boolean(d) &&
    typeof d.targetHeadline === "string" &&
    isStringArray(d.summaryDirectives) &&
    isStringArray(d.experienceDirectives) &&
    isStringArray(d.keywordTargets) &&
    isStringArray(d.truthGuardrails)
  );
}

function validateJobRubricResponse(data: unknown): data is JobRubricResponse {
  const d = data as JobRubricResponse;
  if (!d || typeof d.roleSummary !== "string") {
    return false;
  }
  if (!Array.isArray(d.categories) || d.categories.length < 4 || d.categories.length > 6) {
    return false;
  }
  if (d.weightTotalCheck !== 100) {
    return false;
  }
  if (!Array.isArray(d.normalizationDictionary)) {
    return false;
  }
  for (const entry of d.normalizationDictionary) {
    if (!entry || typeof entry.canonical !== "string" || entry.canonical.trim().length === 0) {
      return false;
    }
    if (!Array.isArray(entry.aliases) || entry.aliases.length === 0) {
      return false;
    }
    if (!entry.aliases.every((alias) => typeof alias === "string" && alias.trim().length > 0)) {
      return false;
    }
  }

  let total = 0;
  for (const category of d.categories) {
    if (!category || typeof category.id !== "string" || typeof category.name !== "string") {
      return false;
    }
    if (!Array.isArray(category.criteria) || category.criteria.length < 3 || category.criteria.length > 6) {
      return false;
    }
    for (const criterion of category.criteria) {
      if (!criterion || typeof criterion.id !== "string" || typeof criterion.name !== "string") {
        return false;
      }
      if (
        typeof criterion.weight !== "number" ||
        !Number.isInteger(criterion.weight) ||
        criterion.weight < 0
      ) {
        return false;
      }
      total += criterion.weight;
      if (typeof criterion.requirementText !== "string") {
        return false;
      }
      if (
        !["tool_specific", "conceptual_skill", "leadership", "domain", "process"].includes(
          criterion.matchType,
        )
      ) {
        return false;
      }
      if (
        !criterion.scoringGuide ||
        typeof criterion.scoringGuide.fullScore !== "string" ||
        typeof criterion.scoringGuide.partialScore !== "string" ||
        typeof criterion.scoringGuide.zeroScore !== "string"
      ) {
        return false;
      }
    }
  }
  return total === 100;
}

export function validateResumeFitResponseV2(data: unknown): data is ResumeFitResponseV2 {
  const d = data as ResumeFitResponseV2;
  if (!d || typeof d !== "object") {
    return false;
  }
  if (
    typeof d.fitScore !== "number" ||
    !Number.isFinite(d.fitScore) ||
    d.fitScore < 0 ||
    d.fitScore > 100 ||
    !Number.isInteger(d.fitScore)
  ) {
    return false;
  }
  if (typeof d.fitRationale !== "string") {
    return false;
  }
  if (!Array.isArray(d.categoryScores) || d.categoryScores.length === 0) {
    return false;
  }
  if (!Array.isArray(d.criteriaScores) || d.criteriaScores.length === 0) {
    return false;
  }

  const criteriaByCategory = new Map<string, { score: number; max: number }>();
  let criteriaScoreSum = 0;
  for (const criterion of d.criteriaScores) {
    if (
      !criterion ||
      typeof criterion.criterionId !== "string" ||
      typeof criterion.criterionName !== "string"
    ) {
      return false;
    }
    if (
      typeof criterion.score !== "number" ||
      typeof criterion.max !== "number" ||
      !Number.isInteger(criterion.score) ||
      !Number.isInteger(criterion.max) ||
      criterion.score < 0 ||
      criterion.max < 0 ||
      criterion.score > criterion.max
    ) {
      return false;
    }
    if (
      !Array.isArray(criterion.resumeEvidenceQuotes) ||
      !criterion.resumeEvidenceQuotes.every((quote) => typeof quote === "string")
    ) {
      return false;
    }
    if (typeof criterion.rationale !== "string" || typeof criterion.missing !== "boolean") {
      return false;
    }

    criteriaScoreSum += criterion.score;
    const categoryId = criterion.criterionId.match(/^[A-Za-z]+/)?.[0] ?? "";
    if (!categoryId) {
      return false;
    }
    const prev = criteriaByCategory.get(categoryId) ?? { score: 0, max: 0 };
    criteriaByCategory.set(categoryId, {
      score: prev.score + criterion.score,
      max: prev.max + criterion.max,
    });
  }

  if (criteriaScoreSum !== d.fitScore) {
    return false;
  }

  let categoryScoreSum = 0;
  let categoryMaxSum = 0;
  for (const category of d.categoryScores) {
    if (
      !category ||
      typeof category.categoryId !== "string" ||
      typeof category.score !== "number" ||
      typeof category.max !== "number" ||
      !Number.isInteger(category.score) ||
      !Number.isInteger(category.max) ||
      category.score < 0 ||
      category.max < 0 ||
      category.score > category.max
    ) {
      return false;
    }
    categoryScoreSum += category.score;
    categoryMaxSum += category.max;
    const expected = criteriaByCategory.get(category.categoryId);
    if (!expected || expected.score !== category.score || expected.max !== category.max) {
      return false;
    }
  }

  if (categoryScoreSum !== d.fitScore || categoryMaxSum !== 100) {
    return false;
  }

  if (
    !Array.isArray(d.missingDetailsQuestions) ||
    !d.missingDetailsQuestions.every((question) => typeof question === "string")
  ) {
    return false;
  }
  if (!Array.isArray(d.tailoringSteps) || !d.tailoringSteps.every((step) => typeof step === "string")) {
    return false;
  }
  if (
    !Array.isArray(d.normalizationApplied) ||
    !d.normalizationApplied.every((entry) => typeof entry === "string")
  ) {
    return false;
  }

  return true;
}

export function validateResumeRewriteResponse(data: unknown): data is ResumeRewriteResponse {
  const d = data as ResumeRewriteResponse;
  return Boolean(d) && typeof d.tailoredResume === "string" && d.tailoredResume.trim().length > 0;
}

async function readMockResponse<T>(
  path: string,
  validator: (value: unknown) => value is T,
): Promise<T> {
  const response = await fetch(chrome.runtime.getURL(path));
  const data = (await response.json()) as unknown;
  if (!validator(data)) {
    throw new Error(`Invalid JSON in ${path}`);
  }
  return data;
}

async function callRemoteLLM<T>(
  userPrompt: string,
  validator: (value: unknown) => value is T,
  stage: string,
): Promise<T> {
  const response = await fetch(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system: SYSTEM_PROMPT,
      user: userPrompt,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM ${stage} request failed (${response.status})`);
  }

  const data = (await response.json()) as unknown;
  if (!validator(data)) {
    throw new Error(`LLM ${stage} returned invalid JSON schema`);
  }

  return data;
}

export async function getResumeFit(
  job: JobExtraction,
  profile: CandidateProfile,
  resumeText: string,
): Promise<ResumeFitResponse> {
  if (await shouldUseMock()) {
    const _ = profile;
    const mockV2 = buildDynamicMockFitV2(job, resumeText);
    return toResumeFitResponse(mockV2);
  }

  const rubric = await callRemoteLLM(
    buildRoleSignalPrompt(job),
    validateJobRubricResponse,
    "rubric_generation",
  );
  const scored = await callRemoteLLM(
    buildResumeFitPrompt(job, profile, resumeText, rubric),
    validateResumeFitResponseV2,
    "fit_scoring",
  );
  return toResumeFitResponse(scored);
}

export async function getResumeRewrite(
  job: JobExtraction,
  profile: CandidateProfile,
  resumeText: string,
): Promise<ResumeRewriteResponse> {
  if (await shouldUseMock()) {
    return readMockResponse(
      "mock/resume_rewrite_response.json",
      validateResumeRewriteResponse,
    );
  }

  const rewriteOutline = await callRemoteLLM(
    buildRewriteOutlinePrompt(job, profile, resumeText),
    validateRewriteOutlineResponse,
    "rewrite_outline",
  );
  return callRemoteLLM(
    buildResumeRewritePrompt(job, profile, resumeText, rewriteOutline),
    validateResumeRewriteResponse,
    "rewrite_generation",
  );
}
