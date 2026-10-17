import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTheme, THEME_DARK, THEME_LIGHT } from "./theme-toggle-view.js";

test("LAY-08 without a pick the theme follows the system", () => {
  assert.equal(resolveTheme(undefined, false), THEME_LIGHT);
  assert.equal(resolveTheme(undefined, true), THEME_DARK);
});

test("LAY-08 a pick in this visit wins over the system", () => {
  assert.equal(resolveTheme(THEME_DARK, false), THEME_DARK);
  assert.equal(resolveTheme(THEME_LIGHT, true), THEME_LIGHT);
});

test("LAY-08 an unknown pick falls back to the system", () => {
  assert.equal(resolveTheme("sepia", true), THEME_DARK);
  assert.equal(resolveTheme("", false), THEME_LIGHT);
});
