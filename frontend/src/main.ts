import "./style.css";
import { getApiBase, rewriteResume, scoreFit } from "./api";
import { clearResumeText, loadResumeText, saveResumeText } from "./storage";
import type { FitResponse } from "./types";

const API_KEY_STORAGE_KEY = "resumeFitUserApiKey";
const MODEL_STORAGE_KEY = "resumeFitModel";
const FOLLOWUP_STORAGE_KEY = "resumeFitFollowupAnswers";

const resumeTextEl = document.querySelector<HTMLTextAreaElement>("#resumeText");
const jdTextEl = document.querySelector<HTMLTextAreaElement>("#jdText");
const userApiKeyEl = document.querySelector<HTMLInputElement>("#userApiKey");
const oneTimeApiKeyEl = document.querySelector<HTMLInputElement>("#oneTimeApiKey");
const modelPresetEl = document.querySelector<HTMLSelectElement>("#modelPreset");
const modelInputEl = document.querySelector<HTMLInputElement>("#modelInput");
const modelHintEl = document.querySelector<HTMLParagraphElement>("#modelHint");
const saveApiSettingsBtn = document.querySelector<HTMLButtonElement>("#saveApiSettingsBtn");
const clearApiSettingsBtn = document.querySelector<HTMLButtonElement>("#clearApiSettingsBtn");
const apiSettingsStatusEl = document.querySelector<HTMLParagraphElement>("#apiSettingsStatus");
const resumeFileEl = document.querySelector<HTMLInputElement>("#resumeFile");
const loadResumeFileBtn = document.querySelector<HTMLButtonElement>("#loadResumeFileBtn");
const saveResumeBtn = document.querySelector<HTMLButtonElement>("#saveResumeBtn");
const clearResumeBtn = document.querySelector<HTMLButtonElement>("#clearResumeBtn");
const scoreBtn = document.querySelector<HTMLButtonElement>("#scoreBtn");
const rewriteBtn = document.querySelector<HTMLButtonElement>("#rewriteBtn");
const statusEl = document.querySelector<HTMLSpanElement>("#status");
const storeStatusEl = document.querySelector<HTMLParagraphElement>("#resumeStoreStatus");
const fitSummaryEl = document.querySelector<HTMLDivElement>("#fitSummary");
const followupAnswersEl = document.querySelector<HTMLTextAreaElement>("#followupAnswers");
const fillQuestionsTemplateBtn = document.querySelector<HTMLButtonElement>("#fillQuestionsTemplateBtn");
const clearFollowupBtn = document.querySelector<HTMLButtonElement>("#clearFollowupBtn");
const followupStatusEl = document.querySelector<HTMLParagraphElement>("#followupStatus");
const criteriaEl = document.querySelector<HTMLPreElement>("#criteriaDetails");
const categoryEl = document.querySelector<HTMLPreElement>("#categoryDetails");
const rewriteEl = document.querySelector<HTMLPreElement>("#rewriteOutput");
let latestMissingQuestions: string[] = [];

type ModelPreset = {
  value: string;
  label: string;
  group: "openai" | "anthropic";
};

const MODEL_PRESETS: ModelPreset[] = [
  { value: "gpt-5.2-chat-latest", label: "GPT-5.2 Chat Latest", group: "openai" },
  { value: "gpt-5.2", label: "GPT-5.2", group: "openai" },
  { value: "gpt-5", label: "GPT-5", group: "openai" },
  { value: "gpt-5-mini", label: "GPT-5 Mini", group: "openai" },
  { value: "gpt-5-nano", label: "GPT-5 Nano", group: "openai" },
  { value: "gpt-4.1", label: "GPT-4.1", group: "openai" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini", group: "openai" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano", group: "openai" },
  { value: "gpt-4o", label: "GPT-4o", group: "openai" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", group: "openai" },
  { value: "o4-mini", label: "o4-mini", group: "openai" },
  { value: "o3", label: "o3", group: "openai" },
  { value: "o3-mini", label: "o3-mini", group: "openai" },
  { value: "claude-opus-4-1-20250805", label: "Claude Opus 4.1 (20250805)", group: "anthropic" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4 (20250514)", group: "anthropic" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (20250514)", group: "anthropic" },
  { value: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet Latest", group: "anthropic" },
  { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet Latest", group: "anthropic" },
  { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku Latest", group: "anthropic" },
];

const MODEL_PRESET_VALUES = new Set(MODEL_PRESETS.map((item) => item.value));

function assertElements(): void {
  const all = [
    resumeTextEl,
    jdTextEl,
    userApiKeyEl,
    oneTimeApiKeyEl,
    modelPresetEl,
    modelInputEl,
    modelHintEl,
    saveApiSettingsBtn,
    clearApiSettingsBtn,
    apiSettingsStatusEl,
    resumeFileEl,
    loadResumeFileBtn,
    saveResumeBtn,
    clearResumeBtn,
    scoreBtn,
    rewriteBtn,
    statusEl,
    storeStatusEl,
    fitSummaryEl,
    followupAnswersEl,
    fillQuestionsTemplateBtn,
    clearFollowupBtn,
    followupStatusEl,
    criteriaEl,
    categoryEl,
    rewriteEl,
  ];
  if (all.some((el) => !el)) {
    throw new Error("UI element missing");
  }
}

assertElements();

function buildModelPresetOptions(): void {
  const grouped: Record<ModelPreset["group"], ModelPreset[]> = {
    openai: [],
    anthropic: [],
  };
  for (const item of MODEL_PRESETS) {
    grouped[item.group].push(item);
  }

  modelPresetEl!.innerHTML = "";

  const openAiGroup = document.createElement("optgroup");
  openAiGroup.label = "OpenAI GPT/o 系列";
  for (const item of grouped.openai) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    openAiGroup.appendChild(option);
  }
  modelPresetEl!.appendChild(openAiGroup);

  const claudeGroup = document.createElement("optgroup");
  claudeGroup.label = "Claude 系列（需兼容 provider/key）";
  for (const item of grouped.anthropic) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    claudeGroup.appendChild(option);
  }
  modelPresetEl!.appendChild(claudeGroup);

  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "自定义模型";
  modelPresetEl!.appendChild(customOption);
}

function setStatus(text: string): void {
  statusEl!.textContent = text;
}

function setFollowupStatus(text: string): void {
  followupStatusEl!.textContent = text;
}

function setApiSettingsStatus(text: string): void {
  apiSettingsStatusEl!.textContent = text;
}

function setLoading(loading: boolean): void {
  scoreBtn!.disabled = loading;
  rewriteBtn!.disabled = loading;
}

function normalizeModel(value: string): string {
  return value.trim();
}

function isOneTimeApiKey(): boolean {
  return Boolean(oneTimeApiKeyEl?.checked);
}

function selectedModel(): string {
  return normalizeModel(modelInputEl!.value);
}

function isClaudeModel(model: string): boolean {
  return model.toLowerCase().startsWith("claude");
}

function updateModelHint(): void {
  const model = selectedModel();
  if (!model) {
    modelHintEl!.textContent = "可选 GPT 和 Claude 模型。Claude 需要兼容其模型的 provider/key。";
    return;
  }
  if (isClaudeModel(model)) {
    modelHintEl!.textContent =
      "你选择了 Claude。注意：OpenAI 官方 API Key 不能直接调用 Claude；需使用 Anthropic 或兼容聚合 provider 的 key/base URL。";
    return;
  }
  modelHintEl!.textContent = "当前模型按 OpenAI 兼容 Chat Completions 接口调用。";
}

function getRuntimeSettings(): { apiKey?: string; model?: string } {
  const apiKey = userApiKeyEl!.value.trim();
  const model = normalizeModel(modelInputEl!.value);

  if (model.length > 0 && !/^[A-Za-z0-9._:-]{1,64}$/.test(model)) {
    throw new Error("模型名格式不合法，请只用字母/数字/._:- 且长度不超过 64。");
  }

  return {
    apiKey: apiKey || undefined,
    model: model || undefined,
  };
}

function buildFollowupTemplate(questions: string[]): string {
  return questions.map((question, index) => `Q${index + 1}: ${question}\nA${index + 1}: `).join("\n\n");
}

function loadFollowupFromLocal(): void {
  const saved = localStorage.getItem(FOLLOWUP_STORAGE_KEY) || "";
  followupAnswersEl!.value = saved;
  if (saved.trim()) {
    setFollowupStatus("已恢复上次补充回答。");
  } else {
    setFollowupStatus("可在此补充回答 Missing questions。");
  }
}

function saveFollowupToLocal(): void {
  localStorage.setItem(FOLLOWUP_STORAGE_KEY, followupAnswersEl!.value);
}

function clearFollowup(): void {
  followupAnswersEl!.value = "";
  localStorage.removeItem(FOLLOWUP_STORAGE_KEY);
  setFollowupStatus("已清空补充回答。");
}

function maybeAutoFillFollowupTemplate(): void {
  if (latestMissingQuestions.length === 0) {
    setFollowupStatus("当前没有 Missing questions。");
    return;
  }
  const template = buildFollowupTemplate(latestMissingQuestions);
  followupAnswersEl!.value = template;
  saveFollowupToLocal();
  setFollowupStatus(`已填入 ${latestMissingQuestions.length} 个问题模板。`);
}

function requireInputs(): {
  resumeText: string;
  jdText: string;
  candidateProfile?: { followUpAnswers: string; missingQuestions: string[] };
  apiKey?: string;
  model?: string;
} {
  const resumeText = resumeTextEl!.value.trim();
  const jdText = jdTextEl!.value.trim();
  const settings = getRuntimeSettings();
  const followUpAnswers = followupAnswersEl!.value.trim();

  if (!resumeText || resumeText.length < 30) {
    throw new Error("简历文本太短，请至少输入 30 个字符。");
  }
  if (!jdText || jdText.length < 30) {
    throw new Error("JD 文本太短，请至少输入 30 个字符。");
  }
  if (resumeText.length + jdText.length > 80_000) {
    throw new Error("简历 + JD 总长度超过 80,000 字符，请缩短后重试。");
  }

  return {
    resumeText,
    jdText,
    ...settings,
    candidateProfile: followUpAnswers
      ? {
          followUpAnswers,
          missingQuestions: latestMissingQuestions,
        }
      : undefined,
  };
}

function renderFit(result: FitResponse): void {
  latestMissingQuestions = result.missingDetailsQuestions;
  const missing =
    result.missingDetailsQuestions.length > 0
      ? `<ul>${result.missingDetailsQuestions.map((q) => `<li>${q}</li>`).join("")}</ul>`
      : "<p>无</p>";

  const steps =
    result.tailoringSteps.length > 0
      ? `<ol>${result.tailoringSteps.map((s) => `<li>${s}</li>`).join("")}</ol>`
      : "<p>无</p>";

  fitSummaryEl!.innerHTML = `
    <div class="fit-score">${result.fitScore}/100</div>
    <div><strong>Rationale:</strong> ${result.fitRationale}</div>
    <div><strong>Missing questions:</strong>${missing}</div>
    <div><strong>Tailoring steps:</strong>${steps}</div>
  `;

  criteriaEl!.textContent = JSON.stringify(result.criteriaScores, null, 2);
  categoryEl!.textContent = JSON.stringify(result.categoryScores, null, 2);

  const hasFollowup = followupAnswersEl!.value.trim().length > 0;
  if (!hasFollowup) {
    followupAnswersEl!.placeholder = buildFollowupTemplate(result.missingDetailsQuestions) || "在这里回答问题...";
  }
  setFollowupStatus(
    result.missingDetailsQuestions.length > 0
      ? `已生成 ${result.missingDetailsQuestions.length} 个待补充问题。可在下方作答后重新 Score 或 Rewrite。`
      : "没有缺失问题，可直接继续优化。",
  );
}

async function loadResumeFromLocal(): Promise<void> {
  const text = await loadResumeText();
  if (text) {
    resumeTextEl!.value = text;
    storeStatusEl!.textContent = "已从本地恢复简历（resumeText）。";
  } else {
    storeStatusEl!.textContent = "本地还没有保存简历。";
  }
}

function syncModelPresetUI(): void {
  const model = selectedModel();
  if (MODEL_PRESET_VALUES.has(model)) {
    modelPresetEl!.value = model;
  } else {
    modelPresetEl!.value = "custom";
  }
  updateModelHint();
}

function loadApiSettingsFromLocal(): void {
  const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  const storedModel = localStorage.getItem(MODEL_STORAGE_KEY) || "gpt-4o-mini";
  oneTimeApiKeyEl!.checked = !storedApiKey;
  userApiKeyEl!.value = storedApiKey;
  modelInputEl!.value = storedModel;
  syncModelPresetUI();
  if (storedApiKey) {
    setApiSettingsStatus("已加载本地 API 设置（API Key + 模型）。");
  } else {
    setApiSettingsStatus("未设置 API Key，将走后端默认密钥（如果有）。");
  }
}

function saveApiSettingsToLocal(): void {
  const apiKey = userApiKeyEl!.value.trim();
  const model = selectedModel() || "gpt-4o-mini";

  if (!isOneTimeApiKey() && apiKey) {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }

  localStorage.setItem(MODEL_STORAGE_KEY, model);
  syncModelPresetUI();

  if (isOneTimeApiKey()) {
    setApiSettingsStatus(`已保存模型（${model}）。API Key 仅本次使用，不会保存。`);
  } else {
    setApiSettingsStatus(`API 设置已保存。当前模型：${model}`);
  }
}

function clearApiSettingsFromLocal(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(MODEL_STORAGE_KEY);
  oneTimeApiKeyEl!.checked = true;
  userApiKeyEl!.value = "";
  modelInputEl!.value = "gpt-4o-mini";
  syncModelPresetUI();
  setApiSettingsStatus("已清除 API 设置。");
}

async function handleSaveResume(): Promise<void> {
  const text = resumeTextEl!.value.trim();
  if (!text) {
    throw new Error("请先输入简历文本再保存。");
  }
  const backend = await saveResumeText(text);
  storeStatusEl!.textContent = `已保存到 ${backend}（key: resumeText）。`;
}

async function handleClearResume(): Promise<void> {
  await clearResumeText();
  resumeTextEl!.value = "";
  storeStatusEl!.textContent = "已清除本地简历（resumeText）。";
}

async function handleLoadFromFile(): Promise<void> {
  const file = resumeFileEl!.files?.[0];
  if (!file) {
    throw new Error("请先选择一个简历文件（.txt/.md）。");
  }
  const text = await file.text();
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 30) {
    throw new Error("文件内容太短，无法作为简历文本。");
  }
  resumeTextEl!.value = normalized;
  storeStatusEl!.textContent = `已从文件载入：${file.name}`;
}

async function handleScoreFit(): Promise<void> {
  const input = requireInputs();
  setLoading(true);
  setStatus(`Scoring fit... (${input.model || "backend default model"})`);
  try {
    const result = await scoreFit(input);
    renderFit(result);
    setStatus("Score fit 完成。");
  } finally {
    setLoading(false);
  }
}

async function handleRewrite(): Promise<void> {
  const input = requireInputs();
  setLoading(true);
  setStatus(`Rewriting resume... (${input.model || "backend default model"})`);
  try {
    const result = await rewriteResume(input);
    rewriteEl!.textContent = result.tailoredResume;
    setStatus("Rewrite 完成。");
  } finally {
    setLoading(false);
  }
}

saveResumeBtn!.addEventListener("click", () => {
  handleSaveResume().catch((error) => {
    const msg = error instanceof Error ? error.message : "保存失败";
    setStatus(msg);
  });
});

clearResumeBtn!.addEventListener("click", () => {
  handleClearResume().catch((error) => {
    const msg = error instanceof Error ? error.message : "清除失败";
    setStatus(msg);
  });
});

loadResumeFileBtn!.addEventListener("click", () => {
  handleLoadFromFile().catch((error) => {
    const msg = error instanceof Error ? error.message : "读取文件失败";
    setStatus(msg);
  });
});

scoreBtn!.addEventListener("click", () => {
  handleScoreFit().catch((error) => {
    const msg = error instanceof Error ? error.message : "Score 失败";
    setStatus(msg);
  });
});

rewriteBtn!.addEventListener("click", () => {
  handleRewrite().catch((error) => {
    const msg = error instanceof Error ? error.message : "Rewrite 失败";
    setStatus(msg);
  });
});

modelPresetEl!.addEventListener("change", () => {
  const preset = modelPresetEl!.value;
  if (preset !== "custom") {
    modelInputEl!.value = preset;
  } else if (!modelInputEl!.value.trim()) {
    modelInputEl!.value = "gpt-4o-mini";
  }
  updateModelHint();
});

modelInputEl!.addEventListener("input", () => {
  syncModelPresetUI();
});

saveApiSettingsBtn!.addEventListener("click", () => {
  try {
    getRuntimeSettings();
    saveApiSettingsToLocal();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "保存 API 设置失败";
    setStatus(msg);
  }
});

clearApiSettingsBtn!.addEventListener("click", () => {
  clearApiSettingsFromLocal();
});

fillQuestionsTemplateBtn!.addEventListener("click", () => {
  maybeAutoFillFollowupTemplate();
});

clearFollowupBtn!.addEventListener("click", () => {
  clearFollowup();
});

followupAnswersEl!.addEventListener("input", () => {
  saveFollowupToLocal();
});

oneTimeApiKeyEl!.addEventListener("change", () => {
  if (isOneTimeApiKey()) {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    setApiSettingsStatus("已切换为“仅本次使用”，API Key 不会保存到本地。");
  } else {
    setApiSettingsStatus("已关闭“仅本次使用”，点击“保存 API 设置”后可持久化 API Key。");
  }
});

loadResumeFromLocal().catch(() => {
  storeStatusEl!.textContent = "读取本地简历失败。";
});
buildModelPresetOptions();
loadApiSettingsFromLocal();
loadFollowupFromLocal();

setStatus(`Ready. API: ${getApiBase()}`);
rewriteEl!.textContent = "(点击 Rewrite 后显示结果)";
criteriaEl!.textContent = "(点击 Score Fit 后显示 criteria breakdown)";
categoryEl!.textContent = "(点击 Score Fit 后显示 category scores)";
