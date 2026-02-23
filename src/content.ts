type JobExtraction = {
  title: string;
  company: string;
  location: string;
  description: string;
  sourceUrl: string;
};

type SelectorSet = {
  title: string[];
  company: string[];
  location: string[];
  description: string[];
};

const selectors: SelectorSet = {
  title: [
    ".job-details-jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title",
    "h1.t-24"
  ],
  company: [
    ".job-details-jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name"
  ],
  location: [
    ".job-details-jobs-unified-top-card__bullet",
    ".jobs-unified-top-card__bullet",
    ".jobs-unified-top-card__subtitle-primary-grouping"
  ],
  description: [
    ".jobs-description__content .jobs-box__html-content",
    ".jobs-box__html-content",
    "#job-details"
  ]
};

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function firstTextBySelectors(list: string[]): string {
  for (const selector of list) {
    const el = document.querySelector(selector);
    if (el?.textContent) {
      const text = normalize(el.textContent);
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function extractDescription(): string {
  for (const selector of selectors.description) {
    const el = document.querySelector(selector);
    if (el?.textContent) {
      const text = normalize(el.textContent);
      if (text.length > 80) {
        return text;
      }
    }
  }

  const fallback = Array.from(document.querySelectorAll("section, div"))
    .map((el) => normalize(el.textContent ?? ""))
    .find((text) => text.includes("Responsibilities") && text.length > 250);

  return fallback ?? "";
}

function parseLinkedData(): Partial<JobExtraction> {
  const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
  for (const script of scripts) {
    try {
      const raw = script.textContent?.trim();
      if (!raw) {
        continue;
      }
      const json = JSON.parse(raw) as Record<string, unknown>;
      const description = typeof json.description === "string" ? normalize(json.description) : "";
      const title = typeof json.title === "string" ? normalize(json.title) : "";
      const hiringOrganization = json.hiringOrganization as Record<string, unknown> | undefined;
      const company = typeof hiringOrganization?.name === "string" ? normalize(hiringOrganization.name) : "";
      const jobLocation = json.jobLocation as { address?: { addressLocality?: string } } | undefined;
      const location = normalize(jobLocation?.address?.addressLocality ?? "");
      if (description || title || company || location) {
        return { title, company, location, description } as Partial<JobExtraction>;
      }
    } catch {
      continue;
    }
  }
  return {};
}

function extractFromMeta(property: string): string {
  const el = document.querySelector(`meta[property='${property}']`) as HTMLMetaElement | null;
  return el?.content ? normalize(el.content) : "";
}

function extractJobData(): JobExtraction | null {
  const linkedData = parseLinkedData();

  const title = firstTextBySelectors(selectors.title) || linkedData.title || extractFromMeta("og:title");
  const company = firstTextBySelectors(selectors.company) || linkedData.company || "";
  const location = firstTextBySelectors(selectors.location) || linkedData.location || "";
  const description = extractDescription() || linkedData.description || "";

  if (!title || !description) {
    return null;
  }

  return {
    title,
    company: company || "Unknown company",
    location: location || "Unknown location",
    description,
    sourceUrl: window.location.href
  };
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "POSITIONING_EXTRACT_JOB") {
      return;
    }

    try {
      const job = extractJobData();
      sendResponse({ ok: Boolean(job), job });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown extraction error" });
    }
  });
}
