import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { findIndicator } from "../domain/indicator.js";
import { parseMunicipalities } from "./data-loader.js";
import {
  buildHeaderStats,
  buildMapMetrics,
  mountHeaderStats,
  SYNTHETIC_METRIC_TEXT,
} from "./header-stats.js";

const SYNTHETIC_LABEL = "Dado sintético";

/** @returns {Array<Record<string, any>>} */
function loadMunicipalities() {
  const content = fs.readFileSync("data/municipalities.json", "utf8");
  return parseMunicipalities(JSON.parse(content));
}

test("LAY-07 header stats count the loaded municipalities and sum the population", () => {
  const municipalities = loadMunicipalities();
  let expectedTotal = 0;
  for (const municipality of municipalities) {
    expectedTotal += municipality.population;
  }

  const stats = buildHeaderStats({ municipalities, isDemoActive: false, syntheticLabel: "" });

  assert.equal(stats.municipalities.value, municipalities.length.toLocaleString("pt-BR"));
  assert.equal(stats.municipalities.label, "municípios");
  assert.ok(stats.population);
  assert.equal(stats.population.value, findIndicator("population").format(expectedTotal));
  assert.equal(stats.population.label, "habitantes");
  assert.equal(stats.population.isSynthetic, false);
});

test("LAY-07 header stats follow the records, with no number written by hand", () => {
  const records = [
    { code: "1", population: 10 },
    { code: "2", population: 32 },
  ];

  const stats = buildHeaderStats({
    municipalities: records,
    isDemoActive: false,
    syntheticLabel: "",
  });

  assert.equal(stats.municipalities.value, "2");
  assert.equal(stats.population?.value, "42");
});

test("LAY-07 header stats say município for a single record", () => {
  const stats = buildHeaderStats({
    municipalities: [{ code: "1", population: 5 }],
    isDemoActive: false,
    syntheticLabel: "",
  });

  assert.equal(stats.municipalities.label, "município");
});

test("LAY-07 header stats never show the real population as synthetic data", () => {
  const municipalities = loadMunicipalities();

  const stats = buildHeaderStats({
    municipalities,
    isDemoActive: true,
    syntheticLabel: SYNTHETIC_LABEL,
  });

  assert.equal(stats.municipalities.value, municipalities.length.toLocaleString("pt-BR"));
  assert.ok(stats.population);
  assert.equal(stats.population.value, SYNTHETIC_LABEL);
  assert.equal(stats.population.isSynthetic, true);
  assert.equal(stats.population.label, "");
});

test("LAY-07 header stats hide the population when no record has it", () => {
  const stats = buildHeaderStats({
    municipalities: [{ code: "1", population: null }],
    isDemoActive: false,
    syntheticLabel: "",
  });

  assert.equal(stats.population, null);
});

test("LAY-09 map metrics give the state sum, the city count and the mean per municipality", () => {
  const definition = findIndicator("population");
  const records = [
    { code: "1", population: 1000 },
    { code: "2", population: 3000 },
    { code: "3", population: null },
  ];

  const metrics = buildMapMetrics({ definition, records, isDemoActive: false });

  assert.deepEqual(metrics.items, [
    { label: "Estado", value: definition.formatAbbreviated(4000) },
    { label: "Cidades", value: "2" },
    { label: "Média por município", value: definition.formatAbbreviated(2000) },
  ]);
});

test("LAY-09 map metrics use the ratio of sums for the state density", () => {
  const definition = findIndicator("density");
  const records = [
    { code: "1", population: 100, areaKm2: 10 },
    { code: "2", population: 300, areaKm2: 10 },
  ];

  const metrics = buildMapMetrics({ definition, records, isDemoActive: false });

  assert.equal(metrics.items[0].value, definition.formatAbbreviated(20));
  assert.equal(metrics.items[2].value, definition.formatAbbreviated(20));
});

test("LAY-09 map metrics show only the count while the demo is on", () => {
  const definition = findIndicator("population");
  const records = [{ code: "1", population: 1000 }];

  const metrics = buildMapMetrics({ definition, records, isDemoActive: true });

  assert.deepEqual(
    metrics.items.map((metric) => metric.value),
    [SYNTHETIC_METRIC_TEXT, "1", SYNTHETIC_METRIC_TEXT],
  );
});

test("LAY-09 map metrics say there is no data for an empty list", () => {
  const definition = findIndicator("population");

  const metrics = buildMapMetrics({ definition, records: [], isDemoActive: false });

  assert.deepEqual(
    metrics.items.map((metric) => metric.value),
    ["Sem dado", "0", "Sem dado"],
  );
});

test("LAY-09 with a selection the card shows the selection, its city count and the state", () => {
  const definition = findIndicator("population");
  const records = [
    { code: "1", population: 1000 },
    { code: "2", population: 3000 },
    { code: "3", population: 6000 },
  ];

  const metrics = buildMapMetrics({
    definition,
    records,
    isDemoActive: false,
    selectedCodes: ["1", "3"],
  });

  assert.deepEqual(metrics.items, [
    { label: "Seleção", value: definition.formatAbbreviated(7000) },
    { label: "Cidades", value: "2" },
    { label: "Estado", value: definition.formatAbbreviated(10000) },
  ]);
});

test("LAY-09 with a selection a ratio indicator divides the sums of the selection", () => {
  const definition = findIndicator("density");
  const records = [
    { code: "1", population: 100, areaKm2: 10 },
    { code: "2", population: 900, areaKm2: 10 },
    { code: "3", population: 500, areaKm2: 50 },
  ];

  const metrics = buildMapMetrics({
    definition,
    records,
    isDemoActive: false,
    selectedCodes: ["1", "2"],
  });

  assert.equal(metrics.items[0].value, definition.formatAbbreviated(50));
  assert.equal(metrics.items[2].value, definition.formatAbbreviated(1500 / 70));
});

test("LAY-09 with a selection and the demo on only the selected count is a number", () => {
  const definition = findIndicator("population");
  const records = [
    { code: "1", population: 1000 },
    { code: "2", population: 3000 },
  ];

  const metrics = buildMapMetrics({
    definition,
    records,
    isDemoActive: true,
    selectedCodes: ["2"],
  });

  assert.deepEqual(metrics.items, [
    { label: "Seleção", value: SYNTHETIC_METRIC_TEXT },
    { label: "Cidades", value: "1" },
    { label: "Estado", value: SYNTHETIC_METRIC_TEXT },
  ]);
});

test("LAY-07 mountHeaderStats renders one chip per stat and marks the synthetic one", () => {
  const container = createFakeElement("div");
  const documentRef = /** @type {any} */ ({
    createElement: (/** @type {string} */ tag) => createFakeElement(tag),
    createTextNode: (/** @type {string} */ text) => ({ textContent: text }),
  });
  const view = mountHeaderStats(documentRef, /** @type {any} */ (container));

  view.update({
    municipalities: { value: "645", label: "municípios", isSynthetic: false },
    population: { value: SYNTHETIC_LABEL, label: "", isSynthetic: true },
  });

  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].className, "header-stat");
  assert.equal(container.children[0].children[0].textContent, "645");
  assert.equal(container.children[0].children[1].textContent, " municípios");
  assert.equal(container.children[1].className, "header-stat header-stat-synthetic");
  assert.equal(container.children[1].children.length, 1);

  view.update({
    municipalities: { value: "645", label: "municípios", isSynthetic: false },
    population: null,
  });

  assert.equal(container.children.length, 1);
});

/**
 * @param {string} tag
 * @returns {any}
 */
function createFakeElement(tag) {
  /** @type {any[]} */
  const children = [];
  return {
    tagName: tag.toUpperCase(),
    className: "",
    textContent: "",
    children,
    append(/** @type {any[]} */ ...nodes) {
      children.push(...nodes);
    },
    replaceChildren(/** @type {any[]} */ ...nodes) {
      children.length = 0;
      children.push(...nodes);
    },
  };
}
