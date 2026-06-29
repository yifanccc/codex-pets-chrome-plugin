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
  assert.match(contentCss, /\.codex-pet-result\s+\{[^}]*margin-top:\s*5px/);
  assert.match(contentJs, /result\.addEventListener\("click"/);
  assert.match(contentJs, /result\.classList\.contains\("is-collapsed"\)/);
  assert.match(contentJs, /setResultCollapsed\(false\)/);
});

test("result drawer header uses only the arrow as the collapse affordance", () => {
  assert.doesNotMatch(contentCss, /\.codex-pet-result\s+\{[^}]*white-space:\s*pre-wrap/);
  assert.match(contentCss, /\.codex-pet-result-content\s+\{[^}]*white-space:\s*pre-wrap/);
  assert.doesNotMatch(contentJs, /codex-pet-result-action/);
  assert.doesNotMatch(contentJs, /折叠<\/span>|展开<\/span>/);
  assert.match(contentJs, /title="切换结果显示"/);
});

test("pet position is clamped again when the viewport changes", () => {
  assert.match(contentJs, /window\.addEventListener\("resize", keepPetInViewport\);/);
  assert.match(contentJs, /function keepPetInViewport\(\)/);
  assert.match(contentJs, /const position = clampViewportPosition\(x, y\);/);
  assert.match(contentJs, /moveTo\(position\.x, position\.y\);/);
});

test("viewport clamping never uses negative maximum coordinates", () => {
  assert.match(contentJs, /function clampViewportPosition\(nextX, nextY\)/);
  assert.match(contentJs, /Math\.max\(8, window\.innerWidth - frameWidth - 8\)/);
  assert.match(contentJs, /Math\.max\(8, window\.innerHeight - frameHeight - 8\)/);
});
