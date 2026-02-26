# LinkedIn Resume Tailor MVP (Sidepanel)

This extension scores resume-to-job fit for the active LinkedIn job page and can generate a tailored rewrite.

## Local setup
1. Install deps: `npm install`
2. Build: `npm run build`
3. Open `chrome://extensions`
4. Enable Developer mode
5. Load unpacked from: `/Users/simona/Documents/job_hunting`

## Usage
1. Open a LinkedIn job page: `https://www.linkedin.com/jobs/*`
2. Click the extension action icon (opens sidepanel)
3. Upload `.txt`, `.md`, or `.pdf` resume
4. Click `Score fit`
5. If score is high enough, click `Rewrite resume now`

## Candidate profile config
- Edit: `/Users/simona/Documents/job_hunting/config/candidate_profile.json`

## Mock vs remote LLM
- In `/Users/simona/Documents/job_hunting/src/llm.ts`, `DEV_USE_MOCK` defaults to `true`.
- With mock on:
  - Fit scoring is generated locally (`buildDynamicMockFit`)
  - Rewrite uses `/Users/simona/Documents/job_hunting/mock/resume_rewrite_response.json`
- For remote usage:
  - Set `DEV_USE_MOCK` to `false`
  - Replace `LLM_ENDPOINT` with real endpoint
  - Keep response JSON aligned with validators in `src/llm.ts`
