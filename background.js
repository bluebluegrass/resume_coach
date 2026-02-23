import { callLLM } from "./llm.js";
import { saveLastResult } from "./storage.js";

function isLinkedInJobUrl(url) {
  return typeof url === "string" && /^https:\/\/www\.linkedin\.com\/jobs\//.test(url);
}

function buildJobText(job) {
  return [
    `Title: ${job.title || ""}`,
    `Company: ${job.company || ""}`,
    `Location: ${job.location || ""}`,
    "Description:",
    job.descriptionText || ""
  ].join("\n");
}

async function extractFromActiveLinkedInTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isLinkedInJobUrl(tab.url || "")) {
    throw new Error("Not on a LinkedIn job page. Open linkedin.com/jobs/* and try again.");
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_LINKEDIN_JOB" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["contentScript.js"]
    });
    response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_LINKEDIN_JOB" });
  }

  if (!response?.ok || !response?.data) {
    throw new Error(response?.error || "JD extraction failed");
  }

  return {
    tab,
    job: response.data
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCORE_FIT") return;

  (async () => {
    try {
      const resumeText = typeof message.resumeText === "string" ? message.resumeText.trim() : "";
      if (resumeText.length < 80) {
        throw new Error("Resume parse failed: resume text is too short.");
      }

      const { tab, job } = await extractFromActiveLinkedInTab();
      const result = await callLLM({ jobText: buildJobText(job), resumeText });

      const payload = {
        createdAt: new Date().toISOString(),
        sourceUrl: tab.url || "",
        job,
        result
      };

      await saveLastResult(payload);
      sendResponse({ ok: true, payload });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Scoring failed" });
    }
  })();

  return true;
});
