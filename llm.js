import { loadApiKey, loadMockFlag } from "./storage.js";

export const PROMPT_TEMPLATE = `You are a strict scoring engine that evaluates fit between a candidate resume and a job description.
You MUST output valid JSON only. No markdown, no commentary, no trailing text.
If information is missing, do not guess; mark it as "not_evidenced" and score accordingly.

STEP A — Build a job-specific rubric from JOB_DESCRIPTION.
Extract 5–8 evaluation dimensions a hiring manager would use for this exact job.
Each dimension must include:
- name
- description
- importance: core|supporting
- weight (sum weights to 1.0)
- what strong evidence looks like (2–4 bullets)

STEP B — Score RESUME against that rubric.
For each dimension:
- score_0_to_10
- evidence_tier: tier_0|tier_1|tier_2|tier_3
- evidence: 1–3 short resume quotes (<=25 words) + why it matters
- missing_or_risky gaps

STEP C — ATS keyword coverage.
Extract 25–40 key terms/phrases from the JOB_DESCRIPTION (tools, concepts, responsibilities).
For each term: covered_strong / covered_weak / missing + resume evidence (quote or empty string).
Compute:
coverage_percent where strong=1, weak=0.5, missing=0.

STEP D — Action plan.
Return:
- overall_score 0–100 (weighted from dimensions)
- matched_terms_count and total_terms_count (based on ATS term list; count strong+weak as matched)
- step_by_step_tailoring_plan: 4–7 steps, ordered by impact
- missing_details_to_provide: 2–6 concrete questions/items that would improve scoring if answered
- highest_leverage_resume_edits: 3–6 items with example bullet rewrites (truthful) and expected score gain

CONSTRAINTS
- Evidence must be explicitly present in RESUME. If not present, mark missing.
- Do not fabricate certifications, employers, or metrics.
- Keep the JSON under 1200 lines.

OUTPUT JSON SCHEMA (STRICT)
{
  "overall_score": 0,
  "overall_summary": {
    "one_liner": "",
    "level_fit": "strong_fit|medium_fit|weak_fit",
    "top_3_strengths": ["", "", ""],
    "top_3_gaps": ["", "", ""]
  },
  "rubric": {
    "dimensions": [
      {
        "name": "",
        "description": "",
        "importance": "core|supporting",
        "weight": 0.0,
        "what_strong_evidence_looks_like": ["", ""]
      }
    ]
  },
  "dimension_scores": [
    {
      "dimension": "",
      "score_0_to_10": 0,
      "evidence_tier": "tier_0|tier_1|tier_2|tier_3",
      "evidence": [
        { "resume_quote": "", "why_it_matters_for_jd": "" }
      ],
      "missing_or_risky": [""]
    }
  ],
  "ats_keyword_coverage": {
    "coverage_percent": 0,
    "matched_terms_count": 0,
    "total_terms_count": 0,
    "keywords": [
      { "term": "", "status": "covered_strong|covered_weak|missing", "resume_evidence": "" }
    ]
  },
  "recommendations": {
    "step_by_step_tailoring_plan": ["", "", ""],
    "missing_details_to_provide": ["", ""],
    "highest_leverage_resume_edits": [
      {
        "edit_title": "",
        "what_to_change": "",
        "example_bullet_rewrite": "",
        "expected_score_gain_points": 0
      }
    ]
  },
  "calibration_notes": {
    "assumptions_made": [],
    "not_evidenced_but_common_in_role": [],
    "confidence_0_to_1": 0.0
  }
}

Now evaluate using:
JOB_DESCRIPTION:
{{JOB_DESCRIPTION}}

RESUME:
{{RESUME}}`;

function buildPrompt({ jobText, resumeText }) {
  return PROMPT_TEMPLATE.replace("{{JOB_DESCRIPTION}}", jobText).replace("{{RESUME}}", resumeText);
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateScoringResponse(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof data.overall_score !== "number" || data.overall_score < 0 || data.overall_score > 100) return false;
  if (!data.ats_keyword_coverage || typeof data.ats_keyword_coverage !== "object") return false;
  if (typeof data.ats_keyword_coverage.matched_terms_count !== "number") return false;
  if (typeof data.ats_keyword_coverage.total_terms_count !== "number") return false;
  if (!data.recommendations || typeof data.recommendations !== "object") return false;
  if (!isStringArray(data.recommendations.step_by_step_tailoring_plan)) return false;
  if (!isStringArray(data.recommendations.missing_details_to_provide)) return false;
  return true;
}

async function readMockScore() {
  const response = await fetch(chrome.runtime.getURL("mock/score_response.json"));
  const data = await response.json();
  if (!validateScoringResponse(data)) {
    throw new Error("Invalid JSON in mock score response");
  }
  return data;
}

function parseAnyJson(payload) {
  if (typeof payload === "string") {
    return JSON.parse(payload);
  }
  if (payload && typeof payload.output_text === "string") {
    return JSON.parse(payload.output_text);
  }
  if (payload && typeof payload.content === "string") {
    return JSON.parse(payload.content);
  }
  return payload;
}

export async function callLLM({ jobText, resumeText }) {
  const useMock = await loadMockFlag();
  if (useMock) {
    return readMockScore();
  }

  const apiKey = await loadApiKey();
  if (!apiKey) {
    throw new Error("Missing API key. Save LLM_API_KEY in chrome.storage.local.");
  }

  const response = await fetch("https://example.com/score", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      prompt: buildPrompt({ jobText, resumeText }),
      temperature: 0
    })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const payload = await response.json();
  const data = parseAnyJson(payload);

  if (!validateScoringResponse(data)) {
    throw new Error("Invalid JSON from API.");
  }

  // TODO: swap endpoint and payload shape when production LLM API is available.
  return data;
}
