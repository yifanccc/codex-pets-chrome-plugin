import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMemoryPrompt,
  buildSummaryPrompt,
  buildMemoryMarkdown,
  buildChatEndpoint,
  buildCodexLaunchUrl,
  buildGoogleTranslateUrl,
  ensureJsonResponse,
  getNextPetFrame,
  getPetAnimation,
  getPetMetrics,
  getPetFrame,
  resolvePetPreviewState,
  extractPageText,
  parseMemoryResponse,
  sanitizeFileTitle,
  shouldRetryHttpStatus,
  parseGoogleTranslateResponse,
  markdownToSafeHtml,
  truncateForModel,
  upsertById
} from "../src/shared/core.js";

test("truncateForModel limits text to 10000 characters with an omission note", () => {
  const source = "a".repeat(10050);

  const result = truncateForModel(source);

  assert.equal(result.length, 10000);
  assert.ok(result.endsWith("\n\n[Content truncated for model input]"));
});

test("sanitizeFileTitle keeps readable Chinese title and removes unsafe filename characters", () => {
  const result = sanitizeFileTitle("  洛克/王国: 页面*摘要?  ");

  assert.equal(result, "洛克-王国-页面-摘要");
});

test("parseMemoryResponse requires model to provide both title and markdown", () => {
  const result = parseMemoryResponse(
    JSON.stringify({
      title: "页面摘要",
      markdown: "# 页面摘要\n\n- 来源完整保留"
    })
  );

  assert.deepEqual(result, {
    title: "页面摘要",
    markdown: "# 页面摘要\n\n- 来源完整保留"
  });
});

test("parseMemoryResponse rejects responses without title", () => {
  assert.throws(
    () => parseMemoryResponse(JSON.stringify({ markdown: "# 缺少标题" })),
    /title/
  );
});

test("buildMemoryMarkdown includes source url even when model markdown omits it", () => {
  const result = buildMemoryMarkdown({
    title: "测试页面",
    markdown: "## 摘要\n\n这是摘要。",
    page: {
      title: "原页面标题",
      url: "https://example.com/a?b=1"
    }
  });

  assert.match(result, /^# 测试页面/);
  assert.match(result, /原始链接: https:\/\/example\.com\/a\?b=1/);
  assert.match(result, /## 摘要/);
});

test("buildMemoryPrompt strongly constrains title and markdown JSON output", () => {
  const prompt = buildMemoryPrompt({
    title: "页面标题",
    url: "https://example.com",
    text: "正文"
  });

  assert.match(prompt, /Return only valid JSON/);
  assert.match(prompt, /"title"/);
  assert.match(prompt, /"markdown"/);
  assert.match(prompt, /original URL/);
});

test("buildSummaryPrompt constrains page summary markdown and model input length", () => {
  const prompt = buildSummaryPrompt({
    title: "页面标题",
    url: "https://example.com",
    text: "正文".repeat(6000)
  });

  assert.match(prompt, /# 页面总结/);
  assert.match(prompt, /## 核心内容/);
  assert.match(prompt, /不要编造/);
  assert.ok(prompt.length < 10300);
});

test("extractPageText removes script and style text while preserving visible content", () => {
  const documentLike = {
    body: {
      innerText: "标题\n正文内容\n\n更多内容"
    }
  };

  assert.equal(extractPageText(documentLike), "标题\n正文内容\n更多内容");
});

test("getPetFrame maps Codex pet states to the expected atlas row and column", () => {
  assert.deepEqual(getPetFrame("idle", 0), { row: 0, column: 0 });
  assert.deepEqual(getPetFrame("running-right", 7), { row: 1, column: 7 });
  assert.deepEqual(getPetFrame("running-left", 9), { row: 2, column: 1 });
  assert.deepEqual(getPetFrame("failed", 3), { row: 5, column: 3 });
});

test("getPetFrame wraps states by their used columns instead of all 8 atlas columns", () => {
  assert.deepEqual(getPetFrame("idle", 6), { row: 0, column: 0 });
  assert.deepEqual(getPetFrame("waving", 4), { row: 3, column: 0 });
  assert.deepEqual(getPetFrame("jumping", 5), { row: 4, column: 0 });
  assert.deepEqual(getPetFrame("running", 6), { row: 7, column: 0 });
});

test("getPetAnimation exposes Codex row-specific frame durations", () => {
  assert.deepEqual(getPetAnimation("waving"), {
    row: 3,
    frameCount: 4,
    durations: [140, 140, 140, 280]
  });
});

test("resolvePetPreviewState defaults the large preview to idle and accepts known states", () => {
  assert.equal(resolvePetPreviewState(""), "idle");
  assert.equal(resolvePetPreviewState("unknown"), "idle");
  assert.equal(resolvePetPreviewState("failed"), "failed");
});

test("getNextPetFrame advances within each state's real frame count", () => {
  assert.deepEqual(getNextPetFrame("idle", 5), { frame: 0, duration: 280 });
  assert.deepEqual(getNextPetFrame("running-right", 7), { frame: 0, duration: 120 });
  assert.deepEqual(getNextPetFrame("waving", 3), { frame: 0, duration: 140 });
});

test("buildChatEndpoint accepts base URLs and full chat completion URLs", () => {
  assert.equal(buildChatEndpoint("https://api.example.com"), "https://api.example.com/v1/chat/completions");
  assert.equal(buildChatEndpoint("https://api.example.com/v1"), "https://api.example.com/v1/chat/completions");
  assert.equal(
    buildChatEndpoint("https://api.example.com/v1/chat/completions"),
    "https://api.example.com/v1/chat/completions"
  );
});

test("shouldRetryHttpStatus retries transient upstream model failures", () => {
  assert.equal(shouldRetryHttpStatus(502), true);
  assert.equal(shouldRetryHttpStatus(503), true);
  assert.equal(shouldRetryHttpStatus(429), true);
  assert.equal(shouldRetryHttpStatus(401), false);
  assert.equal(shouldRetryHttpStatus(400), false);
});

test("buildCodexLaunchUrl opens a new Codex thread with prompt and source url", () => {
  const url = buildCodexLaunchUrl({
    prompt: "请阅读这个页面",
    originUrl: "https://example.com/a?b=1"
  });

  assert.match(url, /^codex:\/\/new\?/);
  assert.match(url, /prompt=%E8%AF%B7%E9%98%85%E8%AF%BB%E8%BF%99%E4%B8%AA%E9%A1%B5%E9%9D%A2/);
  assert.match(url, /originUrl=https%3A%2F%2Fexample\.com%2Fa%3Fb%3D1/);
});

test("buildGoogleTranslateUrl targets Chinese inline translation", () => {
  const url = buildGoogleTranslateUrl("hello world");

  assert.match(url, /^https:\/\/translate\.googleapis\.com\/translate_a\/single\?/);
  assert.match(url, /tl=zh-CN/);
  assert.match(url, /q=hello\+world|q=hello%20world/);
});

test("parseGoogleTranslateResponse combines translated segments", () => {
  const response = [[["你好", "hello"], ["世界", "world"]], null, "en"];

  assert.equal(parseGoogleTranslateResponse(response), "你好世界");
});

test("markdownToSafeHtml renders common markdown and escapes html", () => {
  const result = markdownToSafeHtml("# 标题\n\n- 第一项\n- <script>alert(1)</script>\n\n正文 **重点**");

  assert.match(result, /<h1>标题<\/h1>/);
  assert.match(result, /<li>第一项<\/li>/);
  assert.match(result, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(result, /<strong>重点<\/strong>/);
});

test("ensureJsonResponse rejects HTML model responses with a clear configuration hint", () => {
  assert.throws(
    () => ensureJsonResponse("text/html; charset=utf-8", "<!doctype html><html></html>"),
    /返回了 HTML/
  );
});

test("getPetMetrics scales the visible pet and atlas background together", () => {
  assert.deepEqual(getPetMetrics(1.25), {
    frameWidth: 120,
    frameHeight: 130,
    atlasWidth: 960,
    atlasHeight: 1170,
    scale: 1.25
  });
});

test("upsertById replaces an existing item instead of appending a duplicate", () => {
  const result = upsertById(
    [
      { id: "a", name: "旧模型" },
      { id: "b", name: "其他模型" }
    ],
    { id: "a", name: "新模型" }
  );

  assert.deepEqual(result, [
    { id: "a", name: "新模型" },
    { id: "b", name: "其他模型" }
  ]);
});
