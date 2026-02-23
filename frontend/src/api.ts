import type { ApiErrorResponse, FitResponse, RewriteResponse } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");

async function requestJson<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorResponse;

  if (!response.ok) {
    const msg = data?.error || `Request failed with status ${response.status}`;
    throw new Error(msg);
  }

  return data;
}

export async function scoreFit(input: {
  resumeText: string;
  jdText: string;
  candidateProfile?: unknown;
  apiKey?: string;
  model?: string;
}): Promise<FitResponse> {
  return requestJson<FitResponse>("/fit", input);
}

export async function rewriteResume(input: {
  resumeText: string;
  jdText: string;
  candidateProfile?: unknown;
  apiKey?: string;
  model?: string;
}): Promise<RewriteResponse> {
  return requestJson<RewriteResponse>("/rewrite", input);
}

export function getApiBase(): string {
  return API_BASE;
}
