import {
  buildChatEndpoint,
  buildMemoryMarkdown,
  buildMemoryPrompt,
  ensureJsonResponse,
  parseMemoryResponse,
  sanitizeFileTitle,
  truncateForModel
} from "./shared/core.js";

chrome.action.onClicked.addListener(async () => {
  const settings = await getSettings();
  const nextEnabled = settings.petEnabled === false;
  await chrome.storage.local.set({ petEnabled: nextEnabled });
  await updateActionState(nextEnabled);
});

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
    const url = `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeURIComponent(text)}&op=translate`;
    await chrome.tabs.create({ url });
    return { ok: true };
  }

  if (message.type === "CHAT") {
    const settings = await getSettings();
    const answer = await chatWithPage(settings, message);
    return { ok: true, answer };
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
  await chrome.action.setTitle({ title: enabled ? "关闭 Codex Pet" : "打开 Codex Pet" });
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

async function chatWithPage(settings, message) {
  const page = message.page || {};
  const userText = String(message.userText || "").trim();
  if (!userText) {
    throw new Error("请输入要问宠物的问题。");
  }

  const prompt = [
    "你是一个陪用户浏览网页的 Codex 桌宠。请基于网页内容用中文回答。",
    "如果网页内容不足以回答，请明确说无法从当前页面判断，不要编造。",
    "",
    `页面标题: ${page.title || ""}`,
    `页面链接: ${page.url || ""}`,
    "",
    "网页内容:",
    truncateForModel(page.text || ""),
    "",
    `用户问题: ${userText}`
  ].join("\n");

  return callChatCompletions(getCurrentModel(settings), [
    { role: "system", content: "你是一个简洁、可靠的中文网页阅读助手。" },
    { role: "user", content: prompt }
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
  const response = await fetch(endpoint, {
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
