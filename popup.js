import { loadLastResult } from "./storage.js";

const statusEl = document.getElementById("status");
const scoreFitBtn = document.getElementById("scoreFitBtn");
const rewriteBtn = document.getElementById("rewriteBtn");
const resumeFileInput = document.getElementById("resumeFile");

const scoreCard = document.getElementById("scoreCard");
const planCard = document.getElementById("planCard");
const missingCard = document.getElementById("missingCard");

const scoreBadge = document.getElementById("scoreBadge");
const scoreSummary = document.getElementById("scoreSummary");
const planList = document.getElementById("planList");
const missingList = document.getElementById("missingList");

function setStatus(text, tone = "info") {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showCards() {
  scoreCard.classList.remove("hidden");
  planCard.classList.remove("hidden");
  missingCard.classList.remove("hidden");
}

function renderList(element, items, tag = "li") {
  const safe = Array.isArray(items) ? items : [];
  if (!safe.length) {
    element.innerHTML = `<${tag}><em>None</em></${tag}>`;
    return;
  }
  element.innerHTML = safe.map((item) => `<${tag}>${escapeHtml(item)}</${tag}>`).join("");
}

function renderScoringPayload(payload) {
  const score = Math.round(payload.result.overall_score || 0);
  const matched = payload.result.ats_keyword_coverage?.matched_terms_count ?? 0;
  const total = payload.result.ats_keyword_coverage?.total_terms_count ?? 0;

  scoreBadge.textContent = `${score}/100`;
  scoreBadge.className = `score ${score >= 70 ? "good" : "bad"}`;

  const oneLiner = payload.result.overall_summary?.one_liner || "";
  scoreSummary.textContent = `Matched ${matched} of ${total} key role terms from the current posting. ${oneLiner}`.trim();

  renderList(planList, payload.result.recommendations?.step_by_step_tailoring_plan || [], "li");
  renderList(missingList, payload.result.recommendations?.missing_details_to_provide || [], "li");

  showCards();
  rewriteBtn.disabled = false;
}

async function parsePdf(file) {
  const pdfjs = await import(chrome.runtime.getURL("lib/pdfjs/pdf.min.mjs"));
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.mjs");

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const chunks = [];

  for (let page = 1; page <= doc.numPages; page += 1) {
    const p = await doc.getPage(page);
    const tc = await p.getTextContent();
    chunks.push(tc.items.map((item) => (typeof item.str === "string" ? item.str : "")).join(" "));
  }

  return chunks.join("\n");
}

async function parseResumeFile(file) {
  const lower = file.name.toLowerCase();
  const isText = lower.endsWith(".txt") || lower.endsWith(".md") || file.type.startsWith("text/");
  const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf";

  if (isText) {
    return file.text();
  }

  if (isPdf) {
    return parsePdf(file);
  }

  throw new Error("Resume parse failed: supported types are .txt, .md, .pdf.");
}

async function scoreFit() {
  const file = resumeFileInput.files?.[0];
  if (!file) {
    throw new Error("Resume parse failed: upload a resume first.");
  }

  const rawText = await parseResumeFile(file);
  const resumeText = String(rawText).replace(/\s+/g, " ").trim();
  if (resumeText.length < 80) {
    throw new Error("Resume parse failed: extracted text is too short.");
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "SCORE_FIT", resumeText }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Scoring failed"));
        return;
      }
      resolve(response.payload);
    });
  });
}

scoreFitBtn.addEventListener("click", async () => {
  try {
    scoreFitBtn.disabled = true;
    rewriteBtn.disabled = true;
    setStatus("Scoring...");
    const payload = await scoreFit();
    renderScoringPayload(payload);
    setStatus("Resume fit complete. Improve details first, then rescore.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Scoring failed", "error");
  } finally {
    scoreFitBtn.disabled = false;
  }
});

rewriteBtn.addEventListener("click", () => {
  setStatus("Rewrite resume is the next milestone. Scoring flow is active now.");
});

(async function rehydrate() {
  const last = await loadLastResult();
  if (!last) return;
  renderScoringPayload(last);
  setStatus("Loaded last scoring result.");
})();
