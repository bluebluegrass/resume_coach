export type ResumeFitResponse = {
  fitScore: number;
  fitRationale: string;
  missingDetailsQuestions: string[];
  tailoringSteps: string[];
};

export type RubricMatchType =
  | "tool_specific"
  | "conceptual_skill"
  | "leadership"
  | "domain"
  | "process";

export type RubricCriterion = {
  id: string;
  name: string;
  weight: number;
  requirementText: string;
  matchType: RubricMatchType;
  scoringGuide: {
    fullScore: string;
    partialScore: string;
    zeroScore: string;
  };
};

export type RubricCategory = {
  id: string;
  name: string;
  criteria: RubricCriterion[];
};

export type NormalizationEntry = {
  canonical: string;
  aliases: string[];
};

export type JobRubricResponse = {
  roleSummary: string;
  categories: RubricCategory[];
  normalizationDictionary: NormalizationEntry[];
  weightTotalCheck: number;
};

export type ResumeFitCategoryScore = {
  categoryId: string;
  score: number;
  max: number;
};

export type ResumeFitCriterionScore = {
  criterionId: string;
  criterionName: string;
  score: number;
  max: number;
  resumeEvidenceQuotes: string[];
  rationale: string;
  missing: boolean;
};

export type ResumeFitResponseV2 = {
  fitScore: number;
  fitRationale: string;
  categoryScores: ResumeFitCategoryScore[];
  criteriaScores: ResumeFitCriterionScore[];
  missingDetailsQuestions: string[];
  tailoringSteps: string[];
  normalizationApplied: string[];
};

export type ResumeRewriteResponse = {
  tailoredResume: string;
};

export type JobExtraction = {
  title: string;
  company: string;
  location: string;
  description: string;
  sourceUrl: string;
};

export type CandidateProfile = {
  name: string;
  headline: string;
  strengths: string[];
  wins: string[];
  preferredRoles: string[];
  constraints: string[];
};
