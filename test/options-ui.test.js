import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const optionsHtml = readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
const optionsCss = readFileSync(new URL("../src/options.css", import.meta.url), "utf8");
const optionsJs = readFileSync(new URL("../src/options.js", import.meta.url), "utf8");

test("pet import form uses aligned upload cards instead of raw file inputs", () => {
  assert.match(optionsHtml, /class="import-grid"/);
  assert.match(optionsHtml, /class="file-card"/);
  assert.match(optionsHtml, /id="pet-json-name"/);
  assert.match(optionsHtml, /id="pet-sheet-name"/);
  assert.match(optionsHtml, /class="import-actions"/);
  assert.doesNotMatch(optionsHtml, /<label>pet\.json <input/);
});

test("pet import upload cards keep native file inputs visually controlled", () => {
  assert.match(optionsCss, /\.file-input\s+\{[^}]*opacity:\s*0/);
  assert.match(optionsCss, /\.file-card\s+\{[^}]*min-height:\s*108px/);
  assert.match(optionsCss, /\.import-actions\s+\{[^}]*grid-column:\s*1 \/ -1/);
  assert.match(optionsJs, /function renderFileNames\(\)/);
});
