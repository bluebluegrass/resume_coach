export type ResumeFitResponse = {
  fitScore: number;
  fitRationale: string;
  missingDetailsQuestions: string[];
  tailoringSteps: string[];
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
