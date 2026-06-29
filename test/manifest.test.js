import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const expectedIcons = {
  16: "assets/icons/icon16.png",
  32: "assets/icons/icon32.png",
  48: "assets/icons/icon48.png",
  128: "assets/icons/icon128.png"
};

test("manifest declares chrome extension icons in standard sizes", () => {
  assert.deepEqual(manifest.icons, expectedIcons);
  assert.deepEqual(manifest.action.default_icon, expectedIcons);
});

test("declared chrome extension icon files exist", () => {
  for (const iconPath of Object.values(expectedIcons)) {
    assert.equal(existsSync(join(root, iconPath)), true, `${iconPath} should exist`);
  }
});
