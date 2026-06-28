import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMemoryPrompt,
  buildMemoryMarkdown,
  buildChatEndpoint,
  ensureJsonResponse,
  getNextPetFrame,
  getPetAnimation,
  getPetMetrics,
  getPetFrame,
  extractPageText,
  parseMemoryResponse,
  sanitizeFileTitle,
  truncateForModel
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

test("getNextPetFrame advances within each state's real frame count", () => {
  assert.deepEqual(getNextPetFrame("idle", 5), { frame: 0, duration: 280 });
  assert.deepEqual(getNextPetFrame("running-right", 7), { frame: 0, duration: 120 });
  assert.deepEqual(getNextPetFrame("waving", 3), { frame: 0, duration: 140 });
});

test("buildChatEndpoint accepts base URLs and full chat completion URLs", () => {
  assert.equal(buildChatEndpoint("https://api.example.com/v1"), "https://api.example.com/v1/chat/completions");
  assert.equal(
    buildChatEndpoint("https://api.example.com/v1/chat/completions"),
    "https://api.example.com/v1/chat/completions"
  );
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
