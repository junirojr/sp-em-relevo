import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addGovernmentRegion,
  addRegion,
  buildPanelUnits,
  selectByClassIndex,
  toggleGovernmentRegion,
  toggleMunicipality,
  toggleRegion,
} from "./selection.js";
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
    municipality("1", "Alfa", "R1"),
    municipality("2", "Beta", "R1"),
    municipality("3", "Gama", "R2"),
    municipality("4", "Delta", "R2"),
    municipality("5", "Epsilon", "R2"),
  ],
  regions: [
    { code: "R1", label: "RA Um" },
    { code: "R2", label: "RA Dois" },
  ],
});

test("SEL-01 toggleMunicipality adds a code that is not selected", () => {
  assert.deepEqual(toggleMunicipality(["1"], "2"), ["1", "2"]);
});

test("SEL-01 toggleMunicipality removes a code that is selected", () => {
  assert.deepEqual(toggleMunicipality(["1", "2"], "1"), ["2"]);
});

test("SEL-01 toggleMunicipality returns a new array and never mutates the input", () => {
  const current = ["1"];
  const next = toggleMunicipality(current, "2");
  assert.notEqual(next, current);
  assert.deepEqual(current, ["1"]);
});

test("SEL-01 toggleRegion adds every code of the region when some are missing", () => {
  assert.deepEqual(toggleRegion(["3"], territory, "R2"), ["3", "4", "5"]);
});

test("SEL-01 toggleRegion removes every code of the region when all are selected", () => {
  assert.deepEqual(toggleRegion(["1", "3", "4", "5"], territory, "R2"), ["1"]);
});

test("SEL-01 toggleRegion returns the same array for an unknown region", () => {
  const current = ["1"];
  assert.equal(toggleRegion(current, territory, "XX"), current);
});

test("SEL-02 addRegion adds the whole region and keeps existing codes", () => {
  assert.deepEqual(addRegion(["1"], territory, "R2"), ["1", "3", "4", "5"]);
});

test("SEL-02 addRegion returns the same array when the region is already selected", () => {
  const current = ["3", "4", "5"];
  assert.equal(addRegion(current, territory, "R2"), current);
});

test("SEL-03 selectByClassIndex selects exactly the municipalities of that class", () => {
  const classIndexByCode = new Map([
    ["1", 0],
    ["2", 3],
    ["3", 3],
    ["4", 6],
  ]);
  assert.deepEqual(selectByClassIndex([], classIndexByCode, 3), ["2", "3"]);
});

test("SEL-03 selectByClassIndex replaces the previous selection", () => {
  const classIndexByCode = new Map([["1", 2]]);
  assert.deepEqual(selectByClassIndex(["4", "5"], classIndexByCode, 2), ["1"]);
});

test("SEL-03 selectByClassIndex returns the same array when nothing changes", () => {
  const current = ["1"];
  const classIndexByCode = new Map([["1", 2]]);
  assert.equal(selectByClassIndex(current, classIndexByCode, 2), current);
});

test("SEL-03 selectByClassIndex clears the selection when the class has no unit", () => {
  assert.deepEqual(selectByClassIndex(["1"], new Map([["1", 2]]), 5), []);
});

test("SEL-06 buildPanelUnits lists one row per municipality", () => {
  const units = buildPanelUnits(["1", "3"], territory);
  assert.deepEqual(
    units.map((unit) => [unit.kind, unit.code, unit.name]),
    [
      ["municipality", "1", "Alfa"],
      ["municipality", "3", "Gama"],
    ],
  );
});

test("SEL-06 buildPanelUnits collapses a whole region into a single row", () => {
  const units = buildPanelUnits(["3", "4", "5"], territory);
  assert.equal(units.length, 1);
  assert.equal(units[0].kind, "region");
  assert.equal(units[0].code, "R2");
  assert.equal(units[0].name, "RA Dois");
  assert.deepEqual(units[0].codes, ["3", "4", "5"]);
});

test("SEL-06 buildPanelUnits keeps partial regions as municipality rows", () => {
  const units = buildPanelUnits(["1", "3", "4", "5"], territory);
  assert.deepEqual(
    units.map((unit) => [unit.kind, unit.code]),
    [
      ["municipality", "1"],
      ["region", "R2"],
    ],
  );
});

test("SEL-06 buildPanelUnits returns no rows for an empty selection", () => {
  assert.deepEqual(buildPanelUnits([], territory), []);
});

test("SEL-06 buildPanelUnits skips codes unknown to the territory", () => {
  assert.deepEqual(buildPanelUnits(["zz"], territory), []);
});

test("RGV-03 toggleGovernmentRegion and addGovernmentRegion manage full government regions", () => {
  const govTerritory = createTerritory({
    municipalities: [
      {
        code: "1",
        name: "Alfa",
        regionCode: "R1",
        governmentRegionCode: "rg-1",
        governmentRegionName: "RG Um",
        population: 1,
        areaKm2: 1,
        gdpThousandBrl: 1,
      },
      {
        code: "2",
        name: "Beta",
        regionCode: "R1",
        governmentRegionCode: "rg-1",
        governmentRegionName: "RG Um",
        population: 1,
        areaKm2: 1,
        gdpThousandBrl: 1,
      },
      {
        code: "3",
        name: "Gama",
        regionCode: "R2",
        governmentRegionCode: "rg-2",
        governmentRegionName: "RG Dois",
        population: 1,
        areaKm2: 1,
        gdpThousandBrl: 1,
      },
    ],
    regions: [
      { code: "R1", label: "RA Um" },
      { code: "R2", label: "RA Dois" },
    ],
    governmentRegions: [
      { code: "rg-1", label: "RG Um" },
      { code: "rg-2", label: "RG Dois" },
    ],
  });

  assert.deepEqual(toggleGovernmentRegion(["1"], govTerritory, "rg-1"), ["1", "2"]);
  assert.deepEqual(toggleGovernmentRegion(["1", "2"], govTerritory, "rg-1"), []);
  assert.deepEqual(addGovernmentRegion(["3"], govTerritory, "rg-1"), ["3", "1", "2"]);
});

test("RGV-03 buildPanelUnits at governmentRegion level collapses a fully selected government region", () => {
  const govTerritory = createTerritory({
    municipalities: [
      {
        code: "1",
        name: "Alfa",
        regionCode: "R1",
        governmentRegionCode: "rg-1",
        governmentRegionName: "RG Um",
        population: 1,
        areaKm2: 1,
        gdpThousandBrl: 1,
      },
      {
        code: "2",
        name: "Beta",
        regionCode: "R1",
        governmentRegionCode: "rg-1",
        governmentRegionName: "RG Um",
        population: 1,
        areaKm2: 1,
        gdpThousandBrl: 1,
      },
      {
        code: "3",
        name: "Gama",
        regionCode: "R2",
        governmentRegionCode: "rg-2",
        governmentRegionName: "RG Dois",
        population: 1,
        areaKm2: 1,
        gdpThousandBrl: 1,
      },
    ],
    regions: [
      { code: "R1", label: "RA Um" },
      { code: "R2", label: "RA Dois" },
    ],
    governmentRegions: [
      { code: "rg-1", label: "RG Um" },
      { code: "rg-2", label: "RG Dois" },
    ],
  });

  const units = buildPanelUnits(["1", "2", "3"], govTerritory, "governmentRegion");
  assert.equal(units.length, 2);
  assert.equal(units[0].kind, "governmentRegion");
  assert.equal(units[0].code, "rg-1");
  assert.equal(units[0].name, "RG Um");
  assert.deepEqual(units[0].codes, ["1", "2"]);
  assert.equal(units[1].kind, "municipality");
  assert.equal(units[1].code, "3");
});
