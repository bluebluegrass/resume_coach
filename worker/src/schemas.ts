import { z } from "zod";

const MatchTypeSchema = z.enum([
  "tool_specific",
  "conceptual_skill",
  "leadership",
  "domain",
  "process",
]);

export const RubricCriterionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    weight: z.number().int().min(0),
    requirementText: z.string().min(1),
    matchType: MatchTypeSchema,
    scoringGuide: z
      .object({
        fullScore: z.string().min(1),
        partialScore: z.string().min(1),
        zeroScore: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const RubricCategorySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    criteria: z.array(RubricCriterionSchema).min(1).max(10),
  })
  .strict();

export const NormalizationEntrySchema = z
  .object({
    canonical: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const RubricResponseSchema = z
  .object({
    roleSummary: z.string().min(1),
    categories: z.array(RubricCategorySchema).min(1).max(10),
    normalizationDictionary: z.array(NormalizationEntrySchema),
    weightTotalCheck: z.literal(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    const total = value.categories
      .flatMap((category) => category.criteria)
      .reduce((sum, criterion) => sum + criterion.weight, 0);
    if (total !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Weights must sum to 100, got ${total}`,
      });
    }
  });

export const FitCategoryScoreSchema = z
  .object({
    categoryId: z.string().min(1),
    score: z.number().int().min(0),
    max: z.number().int().min(0),
  })
  .strict();

export const FitCriterionScoreSchema = z
  .object({
    criterionId: z.string().min(1),
    criterionName: z.string().min(1),
    score: z.number().int().min(0),
    max: z.number().int().min(0),
    resumeEvidenceQuotes: z.array(z.string().min(1)).min(0).max(3),
    rationale: z.string().min(1),
    missing: z.boolean(),
  })
  .strict();

export const FitResponseV2Schema = z
  .object({
    fitScore: z.number().int().min(0).max(100),
    fitRationale: z.string().min(1),
    categoryScores: z.array(FitCategoryScoreSchema).min(1),
    criteriaScores: z.array(FitCriterionScoreSchema).min(1),
    missingDetailsQuestions: z.array(z.string().min(1)).max(10),
    tailoringSteps: z.array(z.string().min(1)).max(12),
    normalizationApplied: z.array(z.string().min(1)).max(20),
  })
  .strict();

export const RewriteOutlineResponseSchema = z
  .object({
    targetHeadline: z.string().min(1),
    summaryDirectives: z.array(z.string().min(1)).min(1),
    experienceDirectives: z.array(z.string().min(1)).min(1),
    keywordTargets: z.array(z.string().min(1)).min(1),
    truthGuardrails: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const RewriteResponseSchema = z
  .object({
    tailoredResume: z.string().min(20),
  })
  .strict();

export const FitRequestSchema = z
  .object({
    resumeText: z.string().min(30),
    jdText: z.string().min(30),
    candidateProfile: z.unknown().optional(),
    apiKey: z.string().min(20).optional(),
    model: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/).optional(),
  })
  .strict();

export const RewriteRequestSchema = z
  .object({
    resumeText: z.string().min(30),
    jdText: z.string().min(30),
    candidateProfile: z.unknown().optional(),
    apiKey: z.string().min(20).optional(),
    model: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/).optional(),
  })
  .strict();

export type JobRubricResponse = z.infer<typeof RubricResponseSchema>;
export type FitResponseV2 = z.infer<typeof FitResponseV2Schema>;
export type RewriteOutlineResponse = z.infer<typeof RewriteOutlineResponseSchema>;
export type RewriteResponse = z.infer<typeof RewriteResponseSchema>;
export type FitRequest = z.infer<typeof FitRequestSchema>;
export type RewriteRequest = z.infer<typeof RewriteRequestSchema>;
