import {
  buildChatEndpoint,
  buildCodexLaunchUrl,
  buildGoogleTranslateUrl,
  buildMemoryMarkdown,
  buildMemoryPrompt,
  buildSummaryPrompt,
  ensureJsonResponse,
  parseGoogleTranslateResponse,
  parseMemoryResponse,
  sanitizeFileTitle,
  shouldRetryHttpStatus,
  truncateForModel
} from "./shared/core.js";

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await updateActionState(settings.petEnabled !== false);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await updateActionState(settings.petEnabled !== false);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.petEnabled) {
    updateActionState(changes.petEnabled.newValue !== false);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });
  return true;
});

async function handleMessage(message) {
  if (!message || !message.type) {
    throw new Error("Missing message type.");
  }

  if (message.type === "GET_SETTINGS") {
    return { ok: true, settings: await getSettings() };
  }

  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return { ok: true };
  }

  if (message.type === "SET_ENABLED") {
    await chrome.storage.local.set({ petEnabled: Boolean(message.enabled) });
    await updateActionState(Boolean(message.enabled));
    return { ok: true };
  }

  if (message.type === "TRANSLATE") {
    const text = truncateForModel(message.text || "", 4000);
    const translatedText = await translateToChinese(text);
    return { ok: true, translatedText };
  }

  if (message.type === "SUMMON_CODEX") {
    await chrome.tabs.create({ url: buildCodexLaunchUrl() });
    return { ok: true };
  }

  if (message.type === "SUMMARY") {
    const settings = await getSettings();
    const summary = await summarizePage(settings, message.page);
    return { ok: true, summary };
  }

  if (message.type === "REMEMBER") {
    const settings = await getSettings();
    const result = await rememberPage(settings, message.page);
    return { ok: true, ...result };
  }

  throw new Error(`Unsupported message type: ${message.type}`);
}

async function getSettings() {
  const defaults = {
    pets: [],
    currentPetId: "",
    models: [],
    currentModelId: "",
    petEnabled: true,
    petScale: 1,
    knowledgeBaseFolder: "codex-pets-knowledge"
  };
  return chrome.storage.local.get(defaults);
}

async function updateActionState(enabled) {
  await chrome.action.setTitle({ title: enabled ? "Codex Pets：已打开" : "Codex Pets：已关闭" });
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#3157ff" : "#697386" });
}

function getCurrentModel(settings) {
  const model = settings.models.find((item) => item.id === settings.currentModelId);
  if (!model) {
    throw new Error("请先在扩展配置页添加并选择一个大模型。");
  }
  if (!model.baseUrl || !model.apiKey || !model.model) {
    throw new Error("当前大模型配置缺少 base URL、API key 或 model。");
  }
  return model;
}

async function summarizePage(settings, page = {}) {
  return callChatCompletions(getCurrentModel(settings), [
    { role: "system", content: "你是一个简洁、可靠的中文网页总结助手。" },
    { role: "user", content: buildSummaryPrompt(page) }
  ]);
}

async function rememberPage(settings, page = {}) {
  const modelText = await callChatCompletions(getCurrentModel(settings), [
    { role: "system", content: "Return only valid JSON. No markdown fences." },
    { role: "user", content: buildMemoryPrompt(page) }
  ]);
  const memory = parseMemoryResponse(modelText);
  const markdown = buildMemoryMarkdown({ ...memory, page });
  const folder = sanitizeFileTitle(settings.knowledgeBaseFolder || "codex-pets-knowledge");
  const fileTitle = sanitizeFileTitle(memory.title);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${folder}/${date}-${fileTitle}.md`;
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    conflictAction: "uniquify",
    saveAs: false
  });

  return { filename, title: memory.title };
}

async function callChatCompletions(modelConfig, messages) {
  const endpoint = buildChatEndpoint(modelConfig.baseUrl);
  const response = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: modelConfig.model,
      messages,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const text = await response.text();
    if (shouldRetryHttpStatus(response.status)) {
      throw new Error(`大模型上游服务暂时失败，已自动重试后仍失败: ${response.status} ${text.slice(0, 300)}`);
    }
    throw new Error(`大模型请求失败: ${response.status} ${text.slice(0, 300)}`);
  }

  const text = await response.text();
  ensureJsonResponse(response.headers.get("content-type"), text);

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`大模型响应不是合法 JSON: ${error.message}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("大模型响应缺少 choices[0].message.content。");
  }
  return content;
}

async function translateToChinese(text) {
  if (!String(text || "").trim()) {
    throw new Error("没有可翻译的文本。");
  }

  const response = await fetch(buildGoogleTranslateUrl(text));
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Google 翻译请求失败: ${response.status} ${bodyText.slice(0, 200)}`);
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (error) {
    throw new Error(`Google 翻译响应不是合法 JSON: ${error.message}`);
  }

  return parseGoogleTranslateResponse(data);
}

async function fetchWithRetry(url, options, retries = 2) {
  let lastResponse;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, options);
    if (!shouldRetryHttpStatus(response.status) || attempt === retries) {
      return response;
    }

    lastResponse = response;
    await wait(350 * (attempt + 1));
  }

  return lastResponse;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
