import { getResumeFit, getResumeRewrite } from "./llm.js";
import type { CandidateProfile, JobExtraction, ResumeFitResponse } from "./types.js";

const statusEl = document.querySelector("#status") as HTMLDivElement;
const scoreResumeBtn = document.querySelector("#scoreResume") as HTMLButtonElement;
const rewriteResumeBtn = document.querySelector("#rewriteResume") as HTMLButtonElement;
const resumeFileInput = document.querySelector("#resumeFile") as HTMLInputElement;
const resumeResultEl = document.querySelector("#resumeResult") as HTMLDivElement;
const rewriteResultEl = document.querySelector("#rewriteResult") as HTMLDivElement;

let latestContext: { job: JobExtraction; profile: CandidateProfile; resumeText: string; fitScore: number } | null = null;

function setStatus(text: string, tone: "info" | "error" = "info"): void {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function list(items: string[]): string {
  if (!items.length) {
    return "<li><em>None</em></li>";
  }
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResumeFit(data: ResumeFitResponse): void {
  const scoreClass = data.fitScore >= 80 ? "score good" : "score bad";

  resumeResultEl.innerHTML = `
    <section>
      <h3>Resume fit score</h3>
      <div class="${scoreClass}">${Math.round(data.fitScore)}/100</div>
      <p>${escapeHtml(data.fitRationale)}</p>
    </section>
    <section>
      <h3>Step-by-step tailoring plan</h3>
      <ol>${data.tailoringSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("") || "<li><em>None</em></li>"}</ol>
    </section>
    <section>
      <h3>Missing details to provide</h3>
      <ul>${list(data.missingDetailsQuestions)}</ul>
    </section>
  `;
}

function renderRewriteResult(tailoredResume: string): void {
  rewriteResultEl.innerHTML = `
    <section>
      <h3>Tailored resume rewrite</h3>
      <pre>${escapeHtml(tailoredResume)}</pre>
    </section>
  `;
}

async function parsePdfResume(file: File): Promise<string> {
  type PdfJsModule = {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (src: { data: Uint8Array }) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNum: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
      }>;
    };
  };

  const pdfjs = (await import(chrome.runtime.getURL("vendor/pdf.min.mjs"))) as PdfJsModule;
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const chunks: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .join(" ");
    chunks.push(pageText);
  }

  return chunks.join("\n");
}

async function loadCandidateProfile(): Promise<CandidateProfile> {
  const response = await fetch(chrome.runtime.getURL("config/candidate_profile.json"));
  if (!response.ok) {
    throw new Error("Could not load candidate_profile.json");
  }
  return (await response.json()) as CandidateProfile;
}

async function extractJobFromActiveTab(): Promise<JobExtraction> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();
      const pick = (selectors: string[]): string => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          const text = el?.textContent ? normalize(el.textContent) : "";
          if (text) return text;
        }
        return "";
      };

      const title =
        pick([
          ".job-details-jobs-unified-top-card__job-title h1",
          ".jobs-unified-top-card__job-title",
          "h1.t-24"
        ]) || normalize((document.querySelector("meta[property='og:title']") as HTMLMetaElement | null)?.content ?? "");
      const company = pick([
        ".job-details-jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name"
      ]);
      const location = pick([
        ".job-details-jobs-unified-top-card__bullet",
        ".jobs-unified-top-card__bullet",
        ".jobs-unified-top-card__subtitle-primary-grouping"
      ]);
      const description = pick([
        ".jobs-description__content .jobs-box__html-content",
        ".jobs-box__html-content",
        "#job-details"
      ]);
      if (!title || !description) return null;
      return {
        title,
        company: company || "Unknown company",
        location: location || "Unknown location",
        description,
        sourceUrl: window.location.href
      };
    }
  });

  if (!result) {
    throw new Error("Extraction failed");
  }

  return result as JobExtraction;
}

async function readResumeInput(): Promise<string> {
  const file = resumeFileInput.files?.[0];
  if (!file) {
    throw new Error("Please upload your resume file first");
  }

  const lower = file.name.toLowerCase();
  const isText = lower.endsWith(".txt") || lower.endsWith(".md") || file.type.startsWith("text/");
  const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf";
  if (!isText && !isPdf) {
    throw new Error("Resume upload currently supports .txt, .md, or .pdf");
  }

  const text = isPdf ? await parsePdfResume(file) : await file.text();
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 80) {
    throw new Error("Resume text is too short or unreadable");
  }
  return normalized;
}

scoreResumeBtn.addEventListener("click", async () => {
  setStatus("Extracting job and reading resume...");
  rewriteResumeBtn.disabled = true;
  latestContext = null;
  resumeResultEl.innerHTML = "";
  rewriteResultEl.innerHTML = "";

  try {
    const [job, profile, resumeText] = await Promise.all([extractJobFromActiveTab(), loadCandidateProfile(), readResumeInput()]);
    setStatus("Scoring resume fit...");

    const data = await getResumeFit(job, profile, resumeText);
    renderResumeFit(data);

    latestContext = { job, profile, resumeText, fitScore: data.fitScore };
    rewriteResumeBtn.disabled = data.fitScore <= 80;

    if (data.fitScore > 80) {
      setStatus("Score complete. If you agree, click 'Rewrite resume now'.");
    } else {
      setStatus("Resume fit complete. Improve details first, then rescore.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("invalid json")) {
      setStatus(`Invalid JSON: ${message}`, "error");
      return;
    }
    if (message.toLowerCase().includes("llm")) {
      setStatus(`LLM failed: ${message}`, "error");
      return;
    }
    if (message.toLowerCase().includes("extract")) {
      setStatus(`Extraction failed: ${message}`, "error");
      return;
    }
    setStatus(message, "error");
  }
});

rewriteResumeBtn.addEventListener("click", async () => {
  if (!latestContext || latestContext.fitScore <= 80) {
    setStatus("Score first. Rewrite is enabled only when fit score is above 80.", "error");
    return;
  }

  setStatus("Rewriting resume...");
  rewriteResultEl.innerHTML = "";

  try {
    const data = await getResumeRewrite(latestContext.job, latestContext.profile, latestContext.resumeText);
    renderRewriteResult(data.tailoredResume);
    setStatus("Rewrite complete.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("invalid json")) {
      setStatus(`Invalid JSON: ${message}`, "error");
      return;
    }
    if (message.toLowerCase().includes("llm")) {
      setStatus(`LLM failed: ${message}`, "error");
      return;
    }
    setStatus(message, "error");
  }
});
