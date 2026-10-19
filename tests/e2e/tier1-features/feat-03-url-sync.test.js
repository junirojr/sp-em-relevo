import assert from "node:assert/strict";
import test from "node:test";
import { parseUrlState, syncUrlState } from "../../../src/app/url-state.js";
import { createMockWindow } from "../helpers/dom-mock.js";

test("F03-01: syncUrlState updates URL search with ?aba=2turno for second-round tab", () => {
  const { windowRef } = createMockWindow("http://localhost:4173/");

  syncUrlState(windowRef, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "second-round",
  });

  const url = new URL(windowRef.location.href);
  assert.equal(url.searchParams.get("aba"), "2turno", "URL must include ?aba=2turno");
});

test("F03-02: syncUrlState updates URL search with ?aba=1turno for first-round tab", () => {
  const { windowRef } = createMockWindow("http://localhost:4173/");

  syncUrlState(windowRef, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "first-round",
  });

  const url = new URL(windowRef.location.href);
  assert.equal(url.searchParams.get("aba"), "1turno", "URL must include ?aba=1turno");
});

test("F03-03: syncUrlState clears aba parameter when switching back to indicators", () => {
  const { windowRef } = createMockWindow("http://localhost:4173/?aba=2turno");

  syncUrlState(windowRef, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "indicators",
  });

  const url = new URL(windowRef.location.href);
  assert.equal(url.searchParams.has("aba"), false, "aba param must be deleted for indicators mode");
});

test("F03-04: parseUrlState parses ?aba=2turno into second-round tab", () => {
  const parsed = parseUrlState("?aba=2turno");
  assert.equal(parsed.tab, "second-round", "should resolve second-round");
});

test("F03-05: parseUrlState parses ?aba=1turno into first-round tab", () => {
  const parsed = parseUrlState("?aba=1turno");
  assert.equal(parsed.tab, "first-round", "should resolve first-round");
});
