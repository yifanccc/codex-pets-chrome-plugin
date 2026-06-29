import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contentJs = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
const contentCss = readFileSync(new URL("../src/content.css", import.meta.url), "utf8");

test("content action hints use a controlled half-delay tooltip instead of native titles", () => {
  assert.match(contentJs, /const ACTION_HINT_BASE_DELAY_MS = 360;/);
  assert.match(contentJs, /const ACTION_HINT_DELAY_MS = ACTION_HINT_BASE_DELAY_MS \/ 2;/);
  assert.match(contentJs, /class="codex-pet-action-hint"/);
  assert.match(contentJs, /data-hint="把选中文本或页面内容转成中文"/);
  assert.doesNotMatch(contentJs, /data-action="translate" title=/);
});

test("content result area renders as a compact drawer when collapsed", () => {
  assert.match(contentJs, /codex-pet-result-summary/);
  assert.match(contentCss, /\.codex-pet-result\.is-collapsed\s+\{[\s\S]*max-height:\s*38px/);
  assert.match(contentCss, /\.codex-pet-result-content\s+\{[\s\S]*overflow:\s*auto/);
});

test("collapsed result drawer is close to the action bar and fully clickable", () => {
  assert.match(contentCss, /\.codex-pet-result\s+\{[^}]*margin-top:\s*3px/);
  assert.match(contentJs, /result\.addEventListener\("click"/);
  assert.match(contentJs, /result\.classList\.contains\("is-collapsed"\)/);
  assert.match(contentJs, /setResultCollapsed\(false\)/);
});

test("result drawer header stays at the top and exposes an expand affordance", () => {
  assert.doesNotMatch(contentCss, /\.codex-pet-result\s+\{[^}]*white-space:\s*pre-wrap/);
  assert.match(contentCss, /\.codex-pet-result-content\s+\{[^}]*white-space:\s*pre-wrap/);
  assert.match(contentJs, /class="codex-pet-result-action">折叠<\/span>/);
  assert.match(contentJs, /resultAction\.textContent = collapsed \? "展开" : "折叠";/);
});
