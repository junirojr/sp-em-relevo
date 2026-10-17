import assert from "node:assert/strict";
import test from "node:test";
import { parseUrlState, syncUrlState } from "./url-state.js";

test("IND-07 parseUrlState with empty input returns defaults", () => {
  const result = parseUrlState("");
  assert.equal(result.indicatorId, "population");
  assert.equal(result.levelId, "municipality");
});

test("IND-07 parseUrlState parses valid indicator and level from query string", () => {
  const result = parseUrlState("?indicador=density&ver=region");
  assert.equal(result.indicatorId, "density");
  assert.equal(result.levelId, "region");
});

test("IND-07 parseUrlState falls back to default on invalid indicator without error", () => {
  const result = parseUrlState("?indicador=invalido_123&ver=region");
  assert.equal(result.indicatorId, "population");
  assert.equal(result.levelId, "region");
});

test("IND-07 parseUrlState falls back to default on invalid level without error", () => {
  const result = parseUrlState("?indicador=gdpPerCapita&ver=planeta");
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
