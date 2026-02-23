# Worker API (Cloudflare Workers)

## Routes
- `GET /health` -> `{ "ok": true }`
- `POST /fit` -> two-stage pipeline (rubric -> scoring)
- `POST /rewrite` -> two-stage pipeline (outline -> rewrite)

Request payload for `/fit` and `/rewrite` supports optional:
- `apiKey` (string): user-provided provider key, overrides server default for that request
- `model` (string): model name override for that request

## Local dev
1. `cp .dev.vars.example .dev.vars`
2. edit `.dev.vars` and set `OPENAI_API_KEY`
3. `npm install`
4. `npm run dev`

## Deploy
1. `wrangler secret put OPENAI_API_KEY`
2. `npm run deploy`

## Notes
- Logs only include: path, status, durationMs, inputChars, errorCode.
- Logs do **not** include resume/JD raw text.
- Rate limit and body-size/char limits configured in `wrangler.toml`.
