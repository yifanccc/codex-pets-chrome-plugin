export const MAX_MODEL_TEXT_LENGTH = 10000;
export const BASE_FRAME_WIDTH = 96;
export const BASE_FRAME_HEIGHT = 104;
export const PET_STATES = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review"
];
export const PET_ANIMATIONS = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  "running-right": { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  "running-left": { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, durations: [140, 140, 140, 280] },
  jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280] }
};

const TRUNCATION_NOTE = "\n\n[Content truncated for model input]";

export function truncateForModel(text, maxLength = MAX_MODEL_TEXT_LENGTH) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliceLength = Math.max(0, maxLength - TRUNCATION_NOTE.length);
  return normalized.slice(0, sliceLength).trimEnd() + TRUNCATION_NOTE;
}

export function sanitizeFileTitle(title) {
  const cleaned = String(title || "page-summary")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "page-summary";
}

export function parseMemoryResponse(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(String(rawText || "").trim());
  } catch (error) {
    throw new Error("Model response must be valid JSON.");
  }

  if (!parsed || typeof parsed.title !== "string" || !parsed.title.trim()) {
    throw new Error("Model response must include a non-empty title.");
  }

  if (!parsed || typeof parsed.markdown !== "string" || !parsed.markdown.trim()) {
    throw new Error("Model response must include non-empty markdown.");
  }

  return {
    title: parsed.title.trim(),
    markdown: parsed.markdown.trim()
  };
}

export function buildMemoryMarkdown({ title, markdown, page }) {
  const safeTitle = String(title || page?.title || "页面摘要").trim();
  const sourceTitle = String(page?.title || "").trim();
  const sourceUrl = String(page?.url || "").trim();
  const body = String(markdown || "").trim().replace(/^# .+\n+/, "");

  return [
    `# ${safeTitle}`,
    "",
    `原始标题: ${sourceTitle || safeTitle}`,
    `原始链接: ${sourceUrl}`,
    `生成时间: ${new Date().toISOString()}`,
    "",
    body
  ].join("\n");
}

export function buildMemoryPrompt(page) {
  const title = String(page?.title || "Untitled page").trim();
  const url = String(page?.url || "").trim();
  const text = truncateForModel(page?.text || "");

  return [
    "You are preparing a local knowledge-base note from a web page.",
    "Return only valid JSON. Do not wrap it in markdown fences.",
    "The JSON object must have exactly these fields:",
    '- "title": a concise file title in Chinese, 8 to 28 characters, safe for a filename.',
    '- "markdown": a Chinese Markdown summary with sections for overview, key points, useful details, and follow-up questions.',
    "The markdown must mention the original URL and must not invent facts that are not in the page text.",
    "",
    `Page title: ${title}`,
    `Page original URL: ${url}`,
    "",
    "Page text:",
    text
  ].join("\n");
}

export function extractPageText(documentLike = document) {
  const text = documentLike?.body?.innerText || "";
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function getPetFrame(state, frameIndex) {
  const animation = getPetAnimation(state);
  const row = animation.row;
  const column = Math.abs(Number(frameIndex) || 0) % animation.frameCount;
  return { row, column };
}

export function getPetAnimation(state) {
  const animation = PET_ANIMATIONS[state] || PET_ANIMATIONS.idle;
  return {
    row: animation.row,
    frameCount: animation.durations.length,
    durations: [...animation.durations]
  };
}

export function getNextPetFrame(state, frameIndex) {
  const animation = getPetAnimation(state);
  const frame = (Math.abs(Number(frameIndex) || 0) + 1) % animation.frameCount;
  return {
    frame,
    duration: animation.durations[frame]
  };
}

export function buildChatEndpoint(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("模型 Base URL 不能为空。");
  }
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

export function shouldRetryHttpStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(Number(status));
}

export function buildCodexLaunchUrl() {
  return "codex://";
}

export function buildGoogleTranslateUrl(text) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: "zh-CN",
    dt: "t",
    q: String(text || "")
  });
  return `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
}

export function parseGoogleTranslateResponse(data) {
  if (!Array.isArray(data?.[0])) {
    throw new Error("Google 翻译响应格式不正确。");
  }

  const translated = data[0]
    .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
    .filter(Boolean)
    .join("");

  if (!translated.trim()) {
    throw new Error("Google 翻译没有返回结果。");
  }

  return translated;
}

export function ensureJsonResponse(contentType, bodyText) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("application/json")) {
    return;
  }

  const preview = String(bodyText || "").trim().slice(0, 120);
  if (preview.toLowerCase().startsWith("<!doctype") || preview.toLowerCase().startsWith("<html")) {
    throw new Error("模型接口返回了 HTML，请检查 Base URL 是否是 OpenAI 兼容 API 地址，而不是网页地址。");
  }

  throw new Error(`模型接口返回的 Content-Type 不是 JSON: ${contentType || "unknown"}`);
}

export function normalizePetScale(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1.8, Math.max(0.6, Math.round(value * 100) / 100));
}

export function getPetMetrics(scale = 1) {
  const normalizedScale = normalizePetScale(scale);
  const frameWidth = Math.round(BASE_FRAME_WIDTH * normalizedScale);
  const frameHeight = Math.round(BASE_FRAME_HEIGHT * normalizedScale);
  return {
    frameWidth,
    frameHeight,
    atlasWidth: frameWidth * 8,
    atlasHeight: frameHeight * 9,
    scale: normalizedScale
  };
}

export function upsertById(items, nextItem) {
  const list = Array.isArray(items) ? items : [];
  if (!nextItem?.id) {
    return [...list];
  }

  if (!list.some((item) => item.id === nextItem.id)) {
    return [...list, nextItem];
  }

  return list.map((item) => (item.id === nextItem.id ? nextItem : item));
}
