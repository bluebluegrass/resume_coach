# LinkedIn Resume Tailor (Sidepanel, Manifest V3)

This extension scores resume-to-job fit for the active LinkedIn job page and can generate a tailored rewrite.

## Architecture
- Runtime UI: `sidepanel.html` + `dist/sidepanel.js`
- Service worker: `dist/background.js`
- Source of truth: `src/*.ts` (compiled to `dist/` via TypeScript)
- LinkedIn extraction + LLM orchestration live in:
  - `src/sidepanel.ts`
  - `src/llm.ts`

## Local setup
1. Install deps: `npm install`
2. Build: `npm run build`
3. Open `chrome://extensions`
4. Enable Developer mode
5. Load unpacked from this folder: `/Users/simona/Documents/GitHub/resume_coach`

## Usage
1. Open a LinkedIn job page: `https://www.linkedin.com/jobs/*`
2. Click the extension action icon (opens sidepanel)
3. Upload `.txt`, `.md`, or `.pdf` resume
4. Click `Score fit`
5. If score is high enough, click `Rewrite resume now`

## Mock vs remote LLM
- In `src/llm.ts`, `DEV_USE_MOCK` currently defaults to `true`.
- With mock on:
  - Fit scoring is generated locally (`buildDynamicMockFit`)
  - Rewrite uses `mock/resume_rewrite_response.json`
- For remote usage:
  - Set `DEV_USE_MOCK` to `false`
  - Replace `LLM_ENDPOINT` with a real endpoint
  - Ensure endpoint returns JSON matching validators in `src/llm.ts`

## Notes
- `dist/` is build output and ignored by git.
- Re-run `npm run build` after TypeScript changes before reloading the extension.
