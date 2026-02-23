export type FitCriterionScore = {
  criterionId: string;
  criterionName: string;
  score: number;
  max: number;
  resumeEvidenceQuotes: string[];
  rationale: string;
  missing: boolean;
};

export type FitCategoryScore = {
  categoryId: string;
  score: number;
  max: number;
};

export type FitResponse = {
  fitScore: number;
  fitRationale: string;
  missingDetailsQuestions: string[];
  tailoringSteps: string[];
  criteriaScores: FitCriterionScore[];
  categoryScores: FitCategoryScore[];
  normalizationApplied: string[];
};

export type RewriteResponse = {
  tailoredResume: string;
};

export type ApiErrorResponse = {
  ok?: false;
  code?: string;
  error?: string;
};
