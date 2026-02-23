import type { JobRubricResponse } from "./schemas";

type PromptInput = {
  jdText: string;
  resumeText?: string;
  candidateProfile?: unknown;
};

function maybeProfile(profile: unknown): string {
  if (!profile) return "{}";
  try {
    return JSON.stringify(profile, null, 2);
  } catch {
    return "{}";
  }
}

export function rubricPrompt({ jdText }: PromptInput): string {
  return [
    "You are an ATS-grade rubric generator for resume-job fit scoring.",
    "STRICT JSON ONLY. No markdown. No extra keys.",
    "Do not score the resume in this task.",
    "",
    "Requirements:",
    "- Build 4-6 categories.",
    "- Each category has 3-6 criteria.",
    "- Each criterion has integer weight.",
    "- All criterion weights must sum exactly to 100.",
    "- Include normalizationDictionary with canonical term + aliases.",
    "- Focus on capabilities and responsibility scope, not raw keyword overlap.",
    "",
    "Output JSON shape:",
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
        normalizationDictionary: [
          {
            canonical: "Airflow",
            aliases: ["Cloud Composer", "workflow orchestration"],
          },
        ],
        weightTotalCheck: 100,
      },
      null,
      2,
    ),
    "",
    "JD:",
    jdText,
  ].join("\n");
}

export function scoringPrompt(input: {
  jdText: string;
  resumeText: string;
  rubric: JobRubricResponse;
  candidateProfile?: unknown;
}): string {
  return [
    "You are an ATS-grade fit scoring engine.",
    "STRICT JSON ONLY. No markdown. No extra keys.",
    "Do not rewrite the resume in this task.",
    "Do not fabricate tools, ownership, certifications, or metrics.",
    "",
    "Scoring rules:",
    "- For every criterion: score must be integer in [0..criterion.weight].",
    "- Every criterion must include 1-3 resumeEvidenceQuotes, OR missing=true if no evidence.",
    "- Use normalizationDictionary for synonyms/equivalents.",
    "- Penalize only truly missing capability.",
    "- categoryScores must exactly equal aggregate of criteriaScores by category.",
    "- fitScore must equal sum(criteriaScores.score).",
    "- This is evidence-based capability matching, NOT keyword counting.",
    "",
    "Output JSON shape:",
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
            resumeEvidenceQuotes: ["quote"],
            rationale: "string",
            missing: false,
          },
        ],
        missingDetailsQuestions: ["string"],
        tailoringSteps: ["string"],
        normalizationApplied: ["Cloud Composer -> Airflow"],
      },
      null,
      2,
    ),
    "",
    "Rubric:",
    JSON.stringify(input.rubric, null, 2),
    "",
    "Candidate profile:",
    maybeProfile(input.candidateProfile),
    "",
    "JD:",
    input.jdText,
    "",
    "Resume:",
    input.resumeText,
  ].join("\n");
}

export function rewriteOutlinePrompt({ jdText, resumeText, candidateProfile }: PromptInput): string {
  return [
    "You are a resume rewrite planner.",
    "STRICT JSON ONLY. No markdown. No extra keys.",
    "Generate only an outline. Do not return final resume yet.",
    "Do not fabricate any experience or metric.",
    "",
    "Output JSON shape:",
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
    "",
    "Candidate profile:",
    maybeProfile(candidateProfile),
    "",
    "JD:",
    jdText,
    "",
    "Resume:",
    resumeText,
  ].join("\n");
}

export function rewritePrompt(input: {
  jdText: string;
  resumeText: string;
  outline: {
    targetHeadline: string;
    summaryDirectives: string[];
    experienceDirectives: string[];
    keywordTargets: string[];
    truthGuardrails: string[];
  };
  candidateProfile?: unknown;
}): string {
  return [
    "You are a truthful resume rewriter.",
    "STRICT JSON ONLY. No markdown. No extra keys.",
    "Use the provided outline.",
    "Do not invent employers, tools, or quantified outcomes.",
    "",
    "Output JSON shape:",
    JSON.stringify(
      {
        tailoredResume: "string",
      },
      null,
      2,
    ),
    "",
    "Outline:",
    JSON.stringify(input.outline, null, 2),
    "",
    "Candidate profile:",
    maybeProfile(input.candidateProfile),
    "",
    "JD:",
    input.jdText,
    "",
    "Resume:",
    input.resumeText,
  ].join("\n");
}

export function jsonRepairPrompt(input: {
  rawText: string;
  schemaName: string;
  schemaHint: string;
  validationIssues: string[];
}): string {
  const issues =
    input.validationIssues.length > 0
      ? input.validationIssues.map((line, idx) => `${idx + 1}. ${line}`).join("\n")
      : "None provided";

  return [
    "Repair the following model output into valid strict JSON.",
    "Output JSON only. No markdown.",
    `Target schema name: ${input.schemaName}`,
    "Target JSON shape hint:",
    input.schemaHint,
    "Validation issues to fix:",
    issues,
    "Rules:",
    "- Keep only the required JSON object.",
    "- Remove unknown keys.",
    "- Fill missing required keys with safe defaults.",
    "- Preserve semantic meaning.",
    "",
    "Broken output:",
    input.rawText,
  ].join("\n");
}
