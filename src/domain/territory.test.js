import assert from "node:assert/strict";
import { test } from "node:test";
import { createTerritory } from "./territory.js";

const sampleMunicipalities = [
  {
    code: "3500001",
    name: "Município Alpha",
    regionCode: "01",
    population: 10000,
    areaKm2: 100,
    gdpThousandBrl: 500000,
  },
  {
    code: "3500002",
    name: "Município Beta",
    regionCode: "01",
    population: 20000,
    areaKm2: 150,
    gdpThousandBrl: 800000,
  },
  {
    code: "3500003",
    name: "Município Gamma",
    regionCode: "02",
    population: 30000,
    areaKm2: 200,
    gdpThousandBrl: 1200000,
  },
];

const sampleRegions = [
  { code: "01", label: "RA Primeira" },
  { code: "02", label: "RA Segunda" },
];

const sampleBoxes = new Map([
  ["3500001", { minX: 0, minY: 0, maxX: 10, maxY: 10 }],
  ["3500002", { minX: 10, minY: 0, maxX: 20, maxY: 10 }],
  ["3500003", { minX: 20, minY: 0, maxX: 30, maxY: 10 }],
]);

test("DAD-04 territory indexes municipalities by code and provides name lookups", () => {
  const territory = createTerritory({
    municipalities: sampleMunicipalities,
    regions: sampleRegions,
    boxes: sampleBoxes,
  });

  const mun1 = territory.municipalityByCode("3500001");
  assert.equal(mun1?.name, "Município Alpha");
  assert.equal(mun1?.regionCode, "01");

  assert.equal(territory.codeByName("Município Beta"), "3500002");
  assert.equal(territory.nameByCode("3500003"), "Município Gamma");
});

test("NIV-07 territory indexes regions and lists member municipalities", () => {
  const territory = createTerritory({
    municipalities: sampleMunicipalities,
    regions: sampleRegions,
    boxes: sampleBoxes,
  });

  const regions = territory.regions();
  assert.equal(regions.length, 2);
  assert.equal(regions[0].label, "RA Primeira");

  const members01 = territory.municipalitiesInRegion("01");
  assert.deepEqual(
    members01.map((m) => m.code),
    ["3500001", "3500002"],
  );

  assert.equal(territory.regionOf("3500003")?.code, "02");
});

test("DAD-04 territory provides bounding box and center coordinates", () => {
  const territory = createTerritory({
    municipalities: sampleMunicipalities,
    regions: sampleRegions,
    boxes: sampleBoxes,
  });

  const box = territory.boxOf("3500001");
  assert.deepEqual(box, { minX: 0, minY: 0, maxX: 10, maxY: 10 });

  const center = territory.centerOf("3500001");
  assert.deepEqual(center, { x: 5, y: 5 });

  const center3 = territory.centerOf("3500003");
  assert.deepEqual(center3, { x: 25, y: 5 });
});
