export const DEFAULT_MODELS = {
  fit: "gpt-4o-mini",
  rewrite: "gpt-4o-mini",
  repair: "gpt-4o-mini",
} as const;

export const DEFAULTS = {
  requestTimeoutMs: 120_000,
  requestTimeoutHeavyMs: 240_000,
  maxRetries: 1,
  rateLimitPerMin: 30,
  maxCharsTotal: 80_000,
  maxBodyBytes: 250_000,
} as const;

export function asInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
