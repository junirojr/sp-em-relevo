import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateIndicator } from "./aggregation.js";
import { describeCompareSide } from "./compare.js";
import { INDICATORS } from "./indicator.js";
import { buildSearchEntries } from "./search.js";
import {
  describeSearchEntry,
  findSearchMatches,
  findSearchResults,
  formatFoundCount,
  highlightMatch,
  RECENT_LIMIT,
  RESULT_LIMIT,
  rememberRecent,
} from "./search-results.js";
import { buildPanelUnits } from "./selection.js";
import { createTerritory } from "./territory.js";

/**
 * @typedef {import("./search.js").SearchEntry} SearchEntry
 * @typedef {import("./search-results.js").SearchFilter} SearchFilter
 */

/**
 * @param {string} code
 * @param {string} name
 * @param {string} regionCode
 * @param {number} population
 */
function municipality(code, name, regionCode, population) {
  return { code, name, regionCode, population, areaKm2: 10, gdpThousandBrl: population * 2 };
}

const RECORDS = [
  municipality("3500001", "Guaraci", "1", 120),
  municipality("3500002", "Guará", "1", 300),
  municipality("3500003", "São José dos Campos", "2", 700),
  municipality("3500004", "Santa Rita", "1", 50),
  municipality("3500005", "Santa Rita", "2", 80),
  municipality("3500006", "Campinas", "3", 900),
  municipality("3500007", "Sumaré", "3", 200),
];

const REGIONS = [
  { code: "1", label: "RA Franca" },
  { code: "2", label: "RA São José dos Campos" },
  { code: "3", label: "RA Campinas" },
];

const TERRITORY = createTerritory({ municipalities: RECORDS, regions: REGIONS });
const ENTRIES = buildSearchEntries(TERRITORY);

/** @type {import("./compare.js").CompareContext} */
const CONTEXT = {
  records: RECORDS,
  territory: TERRITORY,
  indicator: INDICATORS.population,
  isDemoActive: false,
  level: "municipality",
};

/**
 * @param {string} query
 * @param {SearchFilter} [filter]
 */
function searchFor(query, filter = "all") {
  return { entries: ENTRIES, query, filter, context: CONTEXT };
}

/**
 * @param {SearchEntry[]} entries
 */
function labelsOf(entries) {
  return entries.map((entry) => entry.label);
}

/**
 * @param {string} label
 * @returns {SearchEntry}
 */
function entryLabeled(label) {
  const entry = ENTRIES.find((candidate) => candidate.label === label);
  assert.ok(entry, `missing entry ${label}`);
  return entry;
}

test("SEL-14 the name highlights the slice the query finds, ignoring accents and case", () => {
  assert.deepEqual(highlightMatch("São José dos Campos", "jose"), [
    { text: "São ", isMatch: false },
    { text: "José", isMatch: true },
    { text: " dos Campos", isMatch: false },
  ]);
  assert.deepEqual(highlightMatch("São José dos Campos", "  SAO   jo "), [
    { text: "São Jo", isMatch: true },
    { text: "sé dos Campos", isMatch: false },
  ]);
  assert.deepEqual(highlightMatch("Santa Rita (RA Franca)", "rita"), [
    { text: "Santa ", isMatch: false },
    { text: "Rita", isMatch: true },
    { text: " (RA Franca)", isMatch: false },
  ]);
  assert.deepEqual(highlightMatch("Guará", "guara"), [{ text: "Guará", isMatch: true }]);
  assert.deepEqual(highlightMatch("Campinas", "xyz"), [{ text: "Campinas", isMatch: false }]);
  assert.deepEqual(highlightMatch("Campinas", "   "), [{ text: "Campinas", isMatch: false }]);
});

test("SEL-14 the highlight points back to the label even when it is written decomposed", () => {
  const decomposedName = "São Paulo";
  assert.deepEqual(highlightMatch(decomposedName, "o pa"), [
    { text: "Sã", isMatch: false },
    { text: "o Pa", isMatch: true },
    { text: "ulo", isMatch: false },
  ]);
});

test("SEL-14 each result shows the state position, the region or count, the value with unit and the band of the comparison", () => {
  const sumare = entryLabeled("Sumaré");
  const result = describeSearchEntry(sumare, "suma", CONTEXT);
  const [sumareUnit] = buildPanelUnits([sumare.code], TERRITORY);
  const side = describeCompareSide(sumareUnit, CONTEXT);

  assert.equal(result.entry, sumare);
  assert.deepEqual(result.nameParts, [
    { text: "Suma", isMatch: true },
    { text: "ré", isMatch: false },
  ]);
  assert.equal(result.rankLabel, "#4 no Estado");
  assert.equal(result.rankLabel, side.rankLabel);
  assert.equal(result.contextLabel, "RA Campinas");
  assert.equal(result.valueLabel, `${INDICATORS.population.format(200)} habitantes`);
  assert.equal(result.bandIndex, side.bandIndex);

  const region = describeSearchEntry(entryLabeled("RA Campinas"), "", CONTEXT);
  assert.equal(region.contextLabel, "2 municípios");
  assert.equal(region.rankLabel, "#1 no Estado");
  assert.deepEqual(region.nameParts, [{ text: "RA Campinas", isMatch: false }]);
  const regionPopulation = aggregateIndicator(
    INDICATORS.population,
    RECORDS.filter((record) => record.regionCode === "3"),
  ).value;
  assert.equal(region.valueLabel, `${INDICATORS.population.format(regionPopulation)} habitantes`);
});

test("SEL-14 the window counts every match and lists at most the result limit", () => {
  const manyRecords = Array.from({ length: RESULT_LIMIT + 4 }, (_unused, index) =>
    municipality(`35100${String(index).padStart(2, "0")}`, `Vila ${index + 1}`, "9", index + 1),
  );
  const manyTerritory = createTerritory({
    municipalities: manyRecords,
    regions: [{ code: "9", label: "RA Vilas" }],
  });
  const found = findSearchResults({
    entries: buildSearchEntries(manyTerritory),
    query: "vila",
    filter: "all",
    context: { ...CONTEXT, records: manyRecords, territory: manyTerritory },
  });

  assert.equal(found.foundCount, RESULT_LIMIT + 5);
  assert.equal(found.results.length, RESULT_LIMIT);
  assert.equal(formatFoundCount(found.foundCount), `${RESULT_LIMIT + 5} encontrados`);
  assert.equal(formatFoundCount(1), "1 encontrado");
  assert.equal(formatFoundCount(0), "0 encontrados");
});

test("SEL-14 a blank query finds nothing", () => {
  assert.deepEqual(findSearchResults(searchFor("   ")), { foundCount: 0, results: [] });
});

test("SEL-15 the typed name comes first, so Enter without moving picks it", () => {
  assert.deepEqual(labelsOf(findSearchMatches(searchFor("guara"))), ["Guará", "Guaraci"]);
  assert.equal(findSearchMatches(searchFor("GUARACI"))[0].label, "Guaraci");
  assert.equal(findSearchMatches(searchFor("ra campinas"))[0].kind, "region");
});

test("SEL-15 a repeated name typed in full as Nome (região) finds that entry first", () => {
  const [first] = findSearchMatches(searchFor("santa rita (ra sao jose dos campos)"));
  assert.equal(first.code, "3500005");
  assert.equal(first.label, "Santa Rita (RA São José dos Campos)");
});

test("SEL-16 Todos keeps every match and Regiões keeps only the regions", () => {
  assert.deepEqual(labelsOf(findSearchMatches(searchFor("campinas"))), ["Campinas", "RA Campinas"]);
  const regionsOnly = findSearchMatches(searchFor("a", "regions"));
  assert.deepEqual(labelsOf(regionsOnly), ["RA Franca", "RA São José dos Campos", "RA Campinas"]);
  assert.ok(regionsOnly.every((entry) => entry.kind === "region"));
});

test("SEL-16 Mais populosos orders the matches by the population of each unit", () => {
  const ordered = findSearchMatches(searchFor("a", "mostPopulous"));
  const populations = ordered.map((entry) => {
    const records = RECORDS.filter((record) => {
      if (entry.kind === "region") {
        return record.regionCode === entry.code;
      }
      return record.code === entry.code;
    });
    return aggregateIndicator(INDICATORS.population, records).value ?? 0;
  });

  assert.equal(ordered.length, findSearchMatches(searchFor("a")).length);
  assert.equal(ordered[0].label, "RA Campinas");
  assert.deepEqual(
    populations,
    [...populations].sort((first, second) => second - first),
  );
});

test("SEL-16 Recentes keeps up to three picks, the newest first, without repeats", () => {
  const [guaraci, guara, sumare, campinas] = ["Guaraci", "Guará", "Sumaré", "RA Campinas"].map(
    entryLabeled,
  );
  let recents = rememberRecent([], guaraci);
  recents = rememberRecent(recents, guara);
  recents = rememberRecent(recents, guaraci);
  assert.deepEqual(labelsOf(recents), ["Guaraci", "Guará"]);

  recents = rememberRecent(recents, sumare);
  recents = rememberRecent(recents, campinas);
  assert.equal(recents.length, RECENT_LIMIT);
  assert.deepEqual(labelsOf(recents), ["RA Campinas", "Sumaré", "Guaraci"]);
});
