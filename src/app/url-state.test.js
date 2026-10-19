import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  DEFAULT_STATUS,
  loadStatus,
  normalizeStatus,
  validateStatusSchema,
} from "./data-loader.js";
import { parseUrlState, resolveDefaultTabForDate, syncUrlState } from "./url-state.js";

test("IND-07 parseUrlState with empty input returns defaults", () => {
  const result = parseUrlState("", { now: "2026-10-17T15:00:00-03:00" });
  assert.equal(result.indicatorId, "population");
  assert.equal(result.levelId, "municipality");
  assert.equal(result.tab, "indicators");
});

test("IND-07 parseUrlState parses valid indicator and level from query string", () => {
  const result = parseUrlState("?indicador=density&ver=region", {
    now: "2026-10-17T15:00:00-03:00",
  });
  assert.equal(result.indicatorId, "density");
  assert.equal(result.levelId, "region");
  assert.equal(result.tab, "indicators");
});

test("IND-07 parseUrlState falls back to default on invalid indicator without error", () => {
  const result = parseUrlState("?indicador=invalido_123&ver=region", {
    now: "2026-10-17T15:00:00-03:00",
  });
  assert.equal(result.indicatorId, "population");
  assert.equal(result.levelId, "region");
});

test("IND-07 parseUrlState falls back to default on invalid level without error", () => {
  const result = parseUrlState("?indicador=gdpPerCapita&ver=planeta", {
    now: "2026-10-17T15:00:00-03:00",
  });
  assert.equal(result.indicatorId, "gdpPerCapita");
  assert.equal(result.levelId, "municipality");
});

test("IND-07 syncUrlState invokes history.replaceState and excludes demo param", () => {
  let replacedUrl = "";
  const fakeWindow = /** @type {any} */ ({
    location: {
      href: "http://localhost:4173/?demo=1",
      pathname: "/",
      search: "?demo=1",
      hash: "",
    },
    history: {
      replaceState(
        /** @type {any} */ _state,
        /** @type {any} */ _title,
        /** @type {string} */ url,
      ) {
        replacedUrl = url;
      },
    },
  });

  syncUrlState(fakeWindow, {
    indicatorId: "area",
    levelId: "region",
    isDemoActive: true,
  });

  assert.ok(replacedUrl.includes("indicador=area"), "Should set indicator=area");
  assert.ok(replacedUrl.includes("ver=region"), "Should set ver=region");
  assert.equal(replacedUrl.includes("demo="), false, "Must not include demo in URL");
});

test("ELE-20 parseUrlState resolves ?aba=1turno and ?aba=2turno and falls back to indicators on invalid value", () => {
  const firstRound = parseUrlState("?aba=1turno", { now: "2026-10-17T15:00:00-03:00" });
  assert.equal(firstRound.tab, "first-round");

  const secondRound = parseUrlState("?aba=2turno", { now: "2026-10-17T15:00:00-03:00" });
  assert.equal(secondRound.tab, "second-round");

  const invalidOnElectionDay = parseUrlState("?aba=3turno", {
    now: "2026-10-25T15:00:00-03:00",
  });
  assert.equal(invalidOnElectionDay.tab, "indicators");
});

test("ELE-20 default tab without ?aba= is second-round on 2026-10-25 (America/Sao_Paulo) and indicators on other dates", () => {
  assert.equal(resolveDefaultTabForDate("2026-10-24T23:59:59-03:00"), "indicators");
  assert.equal(resolveDefaultTabForDate("2026-10-25T00:00:01-03:00"), "second-round");
  assert.equal(resolveDefaultTabForDate("2026-10-25T23:59:59-03:00"), "second-round");
  assert.equal(resolveDefaultTabForDate("2026-10-26T00:00:01-03:00"), "indicators");

  const withoutParamOnVoteDay = parseUrlState("", { now: "2026-10-25T18:00:00-03:00" });
  assert.equal(withoutParamOnVoteDay.tab, "second-round");

  const withoutParamAfterVoteDay = parseUrlState("", { now: "2026-10-26T10:00:00-03:00" });
  assert.equal(withoutParamAfterVoteDay.tab, "indicators");
});

test("ELE-20 syncUrlState writes ?aba=1turno or ?aba=2turno and removes aba when tab is indicators via replaceState", () => {
  /** @type {string[]} */
  const calls = [];
  const fakeWindow = /** @type {any} */ ({
    location: {
      href: "http://localhost:4173/",
      pathname: "/",
      search: "",
      hash: "",
    },
    history: {
      replaceState(
        /** @type {any} */ _state,
        /** @type {any} */ _title,
        /** @type {string} */ url,
      ) {
        calls.push(url);
        fakeWindow.location.href = `http://localhost:4173${url}`;
      },
    },
  });

  syncUrlState(fakeWindow, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "first-round",
  });
  assert.equal(calls.at(-1)?.includes("aba=1turno"), true);

  syncUrlState(fakeWindow, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "second-round",
  });
  assert.equal(calls.at(-1)?.includes("aba=2turno"), true);

  syncUrlState(fakeWindow, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "indicators",
  });
  assert.equal(calls.at(-1)?.includes("aba="), false);
});

test("FLG-02 missing or invalid status.json falls back to safe default and valid status.json passes schema check", async () => {
  const onDisk = JSON.parse(fs.readFileSync("data/status.json", "utf8"));
  assert.deepEqual(validateStatusSchema(onDisk), []);

  const invalidErrors = validateStatusSchema({ mode: "unknown", Features: null });
  assert.ok(invalidErrors.length > 0);

  const fallbackFromNull = normalizeStatus(null);
  assert.deepEqual(fallbackFromNull, DEFAULT_STATUS);

  const fallbackFromFetchError = await loadStatus(async () => {
    throw new Error("network error");
  });
  assert.deepEqual(fallbackFromFetchError, DEFAULT_STATUS);

  const fallbackFrom404 = await loadStatus(
    /** @type {any} */ (async () => ({ ok: false, status: 404 })),
  );
  assert.deepEqual(fallbackFrom404, DEFAULT_STATUS);

  const disabledStatus = normalizeStatus({
    mode: "disabled",
    Features: { election: false, electionSecondRound: false },
  });
  const parsedWithDisabled = parseUrlState("?aba=2turno", {
    now: "2026-10-25T18:00:00-03:00",
    status: disabledStatus,
  });
  assert.equal(parsedWithDisabled.tab, "indicators");
});

test("ELE-20 / IND-07 parseUrlState strips URL hash fragment before parsing parameters", () => {
  const fullUrlWithHash = parseUrlState(
    "http://localhost:4173/?aba=2turno#alt-table-slot",
    { now: "2026-10-17T15:00:00-03:00" },
  );
  assert.equal(fullUrlWithHash.tab, "second-round");

  const queryWithHash = parseUrlState("?aba=1turno#top", {
    now: "2026-10-17T15:00:00-03:00",
  });
  assert.equal(queryWithHash.tab, "first-round");

  const indicatorWithHash = parseUrlState(
    "?indicador=density&ver=region#alt-table-slot",
    { now: "2026-10-17T15:00:00-03:00" },
  );
  assert.equal(indicatorWithHash.indicatorId, "density");
  assert.equal(indicatorWithHash.levelId, "region");

  const rawParamsWithHash = parseUrlState("aba=2turno#alt-table-slot", {
    now: "2026-10-17T15:00:00-03:00",
  });
  assert.equal(rawParamsWithHash.tab, "second-round");
});

