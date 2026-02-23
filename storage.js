const LAST_RESULT_KEY = "lastResult";

export async function saveLastResult(result) {
  await chrome.storage.local.set({ [LAST_RESULT_KEY]: result });
}

export async function loadLastResult() {
  const data = await chrome.storage.local.get(LAST_RESULT_KEY);
  return data[LAST_RESULT_KEY] ?? null;
}

export async function loadApiKey() {
  const data = await chrome.storage.local.get("LLM_API_KEY");
  return data.LLM_API_KEY ?? "";
}

export async function loadMockFlag() {
  const data = await chrome.storage.local.get("USE_MOCK_LLM");
  return data.USE_MOCK_LLM !== false;
}
