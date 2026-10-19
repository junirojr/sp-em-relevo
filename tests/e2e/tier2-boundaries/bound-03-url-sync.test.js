import assert from "node:assert/strict";
import test from "node:test";
import { parseUrlState, syncUrlState } from "../../../src/app/url-state.js";
import { createMockWindow } from "../helpers/dom-mock.js";

test("B03-01: parseUrlState with empty string or null returns default indicators tab", () => {
  const resultEmpty = parseUrlState("");
  assert.equal(resultEmpty.tab, "indicators");

  const resultNull = parseUrlState(/** @type {any} */ (null));
  assert.equal(resultNull.tab, "indicators");
});

test("B03-02: parseUrlState with invalid tab and corrupted query params falls back to defaults", () => {
  const result = parseUrlState("?aba=3turno&indicador=@@@&ver=galaxia");
  assert.equal(result.tab, "indicators");
  assert.equal(result.indicatorId, "population");
  assert.equal(result.levelId, "municipality");
});

test("B03-03: syncUrlState preserves unrelated query parameters while updating tab", () => {
  const { windowRef } = createMockWindow("http://localhost:4173/?utm_source=gov&ref=portal");

  syncUrlState(windowRef, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "second-round",
  });

  const url = new URL(windowRef.location.href);
  assert.equal(url.searchParams.get("utm_source"), "gov");
  assert.equal(url.searchParams.get("ref"), "portal");
  assert.equal(url.searchParams.get("aba"), "2turno");
});

test("B03-04: syncUrlState does not crash when history.replaceState is missing", () => {
  const fakeWindow = /** @type {any} */ ({
    location: { href: "http://localhost:4173/" },
  });

  assert.doesNotThrow(() => {
    syncUrlState(fakeWindow, {
      indicatorId: "population",
      levelId: "municipality",
      tab: "second-round",
    });
  });
});

test("B03-05: syncUrlState deletes demo query param if present in initial URL", () => {
  const { windowRef } = createMockWindow("http://localhost:4173/?demo=1&aba=2turno");

  syncUrlState(windowRef, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "second-round",
  });

  const url = new URL(windowRef.location.href);
  assert.equal(url.searchParams.has("demo"), false, "demo param must be stripped");
});
