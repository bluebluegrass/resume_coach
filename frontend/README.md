# Frontend (Standalone Page)

## Features
- Resume textarea + local save (`resumeText` key)
- IndexedDB preferred, fallback to localStorage
- Top-level API settings: user API key + model selection (saved in browser localStorage)
- Switch: `仅本次使用，不保存 API Key`
- JD textarea
- `Score Fit` / `Rewrite` buttons
- Fit summary + criteria/category breakdown

## Local dev
1. `cp .env.example .env`
2. set `VITE_API_BASE_URL` (default `http://127.0.0.1:8787`)
3. `npm install`
4. `npm run dev`

## Build
- `npm run build`

## Deploy to Cloudflare Pages
- Build command: `npm run build`
- Build output directory: `dist`
- Env var: `VITE_API_BASE_URL=https://<your-worker-domain>`
