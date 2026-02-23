# LinkedIn Resume Tailor MVP (Manifest V3)

## Files
- `/Users/simona/Documents/job_hunting/manifest.json`
- `/Users/simona/Documents/job_hunting/popup.html`
- `/Users/simona/Documents/job_hunting/popup.js`
- `/Users/simona/Documents/job_hunting/popup.css`
- `/Users/simona/Documents/job_hunting/background.js`
- `/Users/simona/Documents/job_hunting/contentScript.js`
- `/Users/simona/Documents/job_hunting/llm.js`
- `/Users/simona/Documents/job_hunting/storage.js`
- `/Users/simona/Documents/job_hunting/lib/pdfjs/pdf.min.mjs`
- `/Users/simona/Documents/job_hunting/lib/pdfjs/pdf.worker.min.mjs`
- `/Users/simona/Documents/job_hunting/mock/score_response.json`

## Permissions (minimal)
- `activeTab`: access current tab only when user interacts with extension.
- `scripting`: inject content script fallback if listener is unavailable.
- `storage`: persist `lastResult` and optional `LLM_API_KEY`.
- `tabs`: find active tab URL/id.
- `host_permissions`: only `https://www.linkedin.com/*` for JD extraction.

## How to run
1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked: `/Users/simona/Documents/job_hunting`.

## How to test on LinkedIn
1. Open a job detail page: `https://www.linkedin.com/jobs/*`.
2. Open popup from extension icon.
3. Upload `.txt`, `.md`, or `.pdf` resume.
4. Click `Score fit`.
5. Verify UI shows:
   - `NN/100` score
   - `Matched X of Y key role terms...`
   - step-by-step tailoring plan
   - missing details list
6. Close and reopen popup; last result should rehydrate.

## Mock vs real API
- Default: mock mode enabled (`USE_MOCK_LLM` defaults to true if unset).
- Mock payload file: `/Users/simona/Documents/job_hunting/mock/score_response.json`.
- To use real endpoint later:
  1. Set `USE_MOCK_LLM=false` in `chrome.storage.local`.
  2. Set `LLM_API_KEY` in `chrome.storage.local`.
  3. Replace endpoint/payload handling in `/Users/simona/Documents/job_hunting/llm.js` (`TODO` marked).

## Candidate profile
Current score flow does not require candidate profile file. It can be reintroduced in next milestone.
