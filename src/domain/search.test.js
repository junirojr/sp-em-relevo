import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchEntries, findSuggestions, normalizeName } from "./search.js";
import { createTerritory } from "./territory.js";

/**
 * @param {string} code
 * @param {string} name
 * @param {string} regionCode
 */
function municipality(code, name, regionCode) {
  return { code, name, regionCode, population: 1, areaKm2: 1, gdpThousandBrl: 1 };
}

const territory = createTerritory({
  municipalities: [
    municipality("1", "São José dos Campos", "R1"),
    municipality("2", "Santa Rita", "R1"),
    municipality("3", "Santa Rita", "R2"),
    municipality("4", "Campinas", "R2"),
  ],
  regions: [
    { code: "R1", label: "RA Vale" },
    { code: "R2", label: "RA Campinas" },
  ],
});

const entries = buildSearchEntries(territory);

test("SEL-02 normalizeName drops accents and case", () => {
  assert.equal(normalizeName("São José dos Campos"), "sao jose dos campos");
});

test("SEL-02 normalizeName trims and collapses whitespace", () => {
  assert.equal(normalizeName("  Santa   Rita "), "santa rita");
});

test("SEL-02 findSuggestions matches without accent and without case", () => {
  const found = findSuggestions(entries, "sao jose dos campos");
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "municipality");
  assert.equal(found[0].code, "1");
  assert.equal(found[0].label, "São José dos Campos");
});

test("SEL-02 findSuggestions includes regions marked as region", () => {
  const found = findSuggestions(entries, "ra vale");
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "region");
  assert.equal(found[0].code, "R1");
  assert.equal(found[0].label, "RA Vale");
});

test("SEL-02 buildSearchEntries offers every municipality and every region", () => {
  assert.equal(entries.length, 6);
  assert.equal(entries.filter((entry) => entry.kind === "region").length, 2);
});

test("SEL-02 repeated names appear as Nome (regiao)", () => {
  const found = findSuggestions(entries, "santa rita");
  assert.deepEqual(
    found.map((entry) => [entry.code, entry.label]),
    [
      ["2", "Santa Rita (RA Vale)"],
      ["3", "Santa Rita (RA Campinas)"],
    ],
  );
});

test("SEL-02 unique names keep the plain label", () => {
  const found = findSuggestions(entries, "campinas");
  const labels = found.map((entry) => entry.label);
  assert.ok(labels.includes("Campinas"));
  assert.ok(labels.includes("RA Campinas"));
});

test("SEL-02 findSuggestions ranks prefix matches before inner matches", () => {
  const found = findSuggestions(entries, "campinas");
  assert.equal(found[0].label, "Campinas");
});

test("SEL-02 findSuggestions returns nothing for a blank query", () => {
  assert.deepEqual(findSuggestions(entries, "   "), []);
});

test("SEL-02 findSuggestions honors the limit", () => {
  assert.equal(findSuggestions(entries, "a", 2).length, 2);
});

test("RGV-03 buildSearchEntries includes government regions when present in territory", () => {
  const territoryWithGov = createTerritory({
    municipalities: [
      {
        code: "10",
        name: "Adamantina",
        regionCode: "R1",
        governmentRegionCode: "rg-1",
        governmentRegionName: "RG de Adamantina",
        population: 1,
        areaKm2: 1,
        gdpThousandBrl: 1,
      },
    ],
    regions: [{ code: "R1", label: "RA Presidente Prudente" }],
    governmentRegions: [{ code: "rg-1", label: "RG de Adamantina" }],
  });

  const withGovEntries = buildSearchEntries(territoryWithGov);
  assert.equal(withGovEntries.length, 3);

  const foundGov = findSuggestions(withGovEntries, "adamantina");
  assert.equal(foundGov.length, 2);

  const govEntry = foundGov.find((entry) => entry.kind === "governmentRegion");
  assert.ok(govEntry);
  assert.equal(govEntry?.code, "rg-1");
  assert.equal(govEntry?.label, "RG de Adamantina");
});

test("NAT-03 buildSearchEntries indexes municipality with UF suffix when available", () => {
  const nationalTerritory = createTerritory({
    municipalities: [
      {
        code: "3509502",
        name: "Campinas",
        regionCode: "R2",
        uf: "SP",
        population: 1139047,
        areaKm2: 795,
        gdpThousandBrl: 91968328,
      },
      {
        code: "3550308",
        name: "Santa Rita",
        regionCode: "R1",
        ufSigla: "SP",
        population: 50000,
        areaKm2: 200,
        gdpThousandBrl: 1000000,
      },
      {
        code: "2513703",
        name: "Santa Rita",
        regionCode: "",
        ufSigla: "PB",
        population: 149910,
        areaKm2: 727,
        gdpThousandBrl: 2500000,
      },
    ],
    regions: [{ code: "R1", label: "RA Vale" }],
  });

  const nationalEntries = buildSearchEntries(nationalTerritory);

  const foundCampinas = findSuggestions(nationalEntries, "campinas");
  assert.equal(foundCampinas.length, 1);
  assert.equal(foundCampinas[0].label, "Campinas, SP");

  const foundWithComma = findSuggestions(nationalEntries, "campinas, sp");
  assert.equal(foundWithComma.length, 1);
  assert.equal(foundWithComma[0].label, "Campinas, SP");

  const foundWithSpace = findSuggestions(nationalEntries, "campinas sp");
  assert.equal(foundWithSpace.length, 1);
  assert.equal(foundWithSpace[0].label, "Campinas, SP");

  const foundSantaRita = findSuggestions(nationalEntries, "santa rita");
  assert.deepEqual(
    foundSantaRita.map((entry) => entry.label),
    ["Santa Rita, SP", "Santa Rita, PB"],
  );
});
