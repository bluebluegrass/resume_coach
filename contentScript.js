function normalize(text) {
  return (text || "")
    .replace(/\bShow more\b|\bShow less\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstText(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = normalize(el?.textContent || "");
    if (text) return text;
  }
  return "";
}

function visibleTextFromContainer(container) {
  if (!container) return "";

  const blacklistTags = new Set(["NAV", "HEADER", "FOOTER", "ASIDE", "BUTTON", "SVG", "SCRIPT", "STYLE"]);
  const pieces = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node;
      if (!(el instanceof HTMLElement)) return NodeFilter.FILTER_SKIP;
      if (blacklistTags.has(el.tagName)) return NodeFilter.FILTER_REJECT;
      const cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return NodeFilter.FILTER_SKIP;
      if (el.childElementCount > 0) return NodeFilter.FILTER_SKIP;
      const text = normalize(el.innerText || el.textContent || "");
      if (!text) return NodeFilter.FILTER_SKIP;
      if (text.length < 3) return NodeFilter.FILTER_SKIP;
      if (/^\d+\s+applicants?$/i.test(text)) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const el = walker.currentNode;
    if (el instanceof HTMLElement) {
      const text = normalize(el.innerText || el.textContent || "");
      if (text) pieces.push(text);
    }
  }

  const deduped = Array.from(new Set(pieces));
  return normalize(deduped.join("\n"));
}

function extractDescription() {
  const primarySelectors = [
    ".jobs-description__content .jobs-box__html-content",
    ".jobs-box__html-content",
    ".jobs-description-content__text",
    "#job-details",
    ".job-view-layout .jobs-description"
  ];

  for (const selector of primarySelectors) {
    const el = document.querySelector(selector);
    const text = normalize(el?.innerText || el?.textContent || "");
    if (text.length > 200) return text;
  }

  const mainCandidates = [
    document.querySelector("main .jobs-search__job-details--container"),
    document.querySelector("main .job-view-layout"),
    document.querySelector("main")
  ];

  for (const container of mainCandidates) {
    const text = visibleTextFromContainer(container);
    if (text.length > 250) return text;
  }

  return "";
}

function removeNavNoise(text) {
  return normalize(
    text
      .replace(/Skip to main content/gi, " ")
      .replace(/Join now|Sign in/gi, " ")
      .replace(/Report this job/gi, " ")
      .replace(/Save\s+Easy Apply/gi, " ")
  );
}

function extractJobData() {
  const title = firstText([
    ".job-details-jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title",
    "h1.t-24"
  ]);

  const company = firstText([
    ".job-details-jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name",
    ".job-details-jobs-unified-top-card__primary-description"
  ]);

  const location = firstText([
    ".job-details-jobs-unified-top-card__bullet",
    ".jobs-unified-top-card__bullet",
    ".jobs-unified-top-card__subtitle-primary-grouping"
  ]);

  const descriptionText = removeNavNoise(extractDescription());

  if (!descriptionText || descriptionText.length < 180) {
    return null;
  }

  return {
    title: title || "Unknown title",
    company: company || "Unknown company",
    location: location || "Unknown location",
    descriptionText
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXTRACT_LINKEDIN_JOB") return;

  try {
    const data = extractJobData();
    if (!data) {
      sendResponse({ ok: false, error: "JD extraction failed" });
      return;
    }
    sendResponse({ ok: true, data });
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "JD extraction failed" });
  }
});
