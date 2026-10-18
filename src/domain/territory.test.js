import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { createTerritory, groupOf } from "./territory.js";

const sampleMunicipalities = [
  {
    code: "3500001",
    name: "Município Alpha",
    regionCode: "01",
    governmentRegionCode: "rg-1",
    governmentRegionName: "RG de Alpha",
    population: 10000,
    areaKm2: 100,
    gdpThousandBrl: 500000,
  },
  {
    code: "3500002",
    name: "Município Beta",
    regionCode: "01",
    governmentRegionCode: "rg-1",
    governmentRegionName: "RG de Alpha",
    population: 20000,
    areaKm2: 150,
    gdpThousandBrl: 800000,
  },
  {
    code: "3500003",
    name: "Município Gamma",
    regionCode: "02",
    governmentRegionCode: "rg-2",
    governmentRegionName: "RG de Gamma",
    population: 30000,
    areaKm2: 200,
    gdpThousandBrl: 1200000,
  },
];

const sampleRegions = [
  { code: "01", label: "RA Primeira" },
  { code: "02", label: "RA Segunda" },
];

const sampleGovernmentRegions = [
  { code: "rg-1", label: "RG de Alpha" },
  { code: "rg-2", label: "RG de Gamma" },
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
    governmentRegions: sampleGovernmentRegions,
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
    governmentRegions: sampleGovernmentRegions,
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
    governmentRegions: sampleGovernmentRegions,
    boxes: sampleBoxes,
  });

  const box = territory.boxOf("3500001");
  assert.deepEqual(box, { minX: 0, minY: 0, maxX: 10, maxY: 10 });

  const center = territory.centerOf("3500001");
  assert.deepEqual(center, { x: 5, y: 5 });

  const center3 = territory.centerOf("3500003");
  assert.deepEqual(center3, { x: 25, y: 5 });
});

test("RGV-02 groupOf returns municipality code, government region code or administrative region code", () => {
  const territory = createTerritory({
    municipalities: sampleMunicipalities,
    regions: sampleRegions,
    governmentRegions: sampleGovernmentRegions,
    boxes: sampleBoxes,
  });

  assert.equal(groupOf("municipality", "3500001", territory), "3500001");
  assert.equal(groupOf("governmentRegion", "3500001", territory), "rg-1");
  assert.equal(groupOf("region", "3500001", territory), "01");

  assert.equal(territory.groupOf("municipality", "3500003"), "3500003");
  assert.equal(territory.groupOf("governmentRegion", "3500003"), "rg-2");
  assert.equal(territory.groupOf("region", "3500003"), "02");

  const record = sampleMunicipalities[0];
  assert.equal(groupOf("municipality", record), "3500001");
  assert.equal(groupOf("governmentRegion", record), "rg-1");
  assert.equal(groupOf("region", record), "01");
});

test("RGV-02 territory indexes 43 government regions and lists members", () => {
  const territory = createTerritory({
    municipalities: sampleMunicipalities,
    regions: sampleRegions,
    governmentRegions: sampleGovernmentRegions,
  });

  const govRegions = territory.governmentRegions();
  assert.equal(govRegions.length, 2);
  assert.equal(govRegions[0].code, "rg-1");
  assert.equal(govRegions[0].label, "RG de Alpha");

  const membersRg1 = territory.municipalitiesInGovernmentRegion("rg-1");
  assert.deepEqual(
    membersRg1.map((m) => m.code),
    ["3500001", "3500002"],
  );

  const govReg = territory.governmentRegionOf("3500001");
  assert.equal(govReg?.code, "rg-1");
  assert.equal(govReg?.label, "RG de Alpha");
});

test("RGV-02 real data: in each level the sum of groups equals total SP and group codes do not collide", () => {
  const munData = JSON.parse(fs.readFileSync("data/municipalities.json", "utf8"));
  const regData = JSON.parse(fs.readFileSync("data/regions.json", "utf8"));

  const columns = munData.columns;
  const rows = munData.rows;
  const codeIdx = columns.indexOf("code");
  const nameIdx = columns.indexOf("name");
  const regCodeIdx = columns.indexOf("regionCode");
  const govRegCodeIdx = columns.indexOf("governmentRegionCode");
  const govRegNameIdx = columns.indexOf("governmentRegionName");
  const popIdx = columns.indexOf("population");
  const areaIdx = columns.indexOf("areaKm2");
  const gdpIdx = columns.indexOf("gdpThousandBrl");

  const municipalities = rows.map((row) => ({
    code: String(row[codeIdx]),
    name: String(row[nameIdx]),
    regionCode: String(row[regCodeIdx]),
    governmentRegionCode: String(row[govRegCodeIdx]),
    governmentRegionName: String(row[govRegNameIdx]),
    population: Number(row[popIdx]),
    areaKm2: Number(row[areaIdx]),
    gdpThousandBrl: Number(row[gdpIdx]),
  }));

  const territory = createTerritory({
    municipalities,
    regions: regData.regions,
    governmentRegions: regData.governmentRegions,
  });

  assert.equal(territory.regions().length, 16);
  assert.equal(territory.governmentRegions().length, 43);

  let totalMunicipalPop = 0;
  let totalMunicipalArea = 0;
  const municipalCodeSet = new Set();
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    totalMunicipalPop += m.population;
    totalMunicipalArea += m.areaKm2;
    municipalCodeSet.add(m.code);
  }

  let totalGovRegPop = 0;
  let totalGovRegArea = 0;
  const govRegCodeSet = new Set();
  const govRegions = territory.governmentRegions();
  for (let i = 0; i < govRegions.length; i += 1) {
    const rg = govRegions[i];
    govRegCodeSet.add(rg.code);
    const members = territory.municipalitiesInGovernmentRegion(rg.code);
    assert.ok(members.length > 0, `RG ${rg.code} must have at least one member`);
    for (let j = 0; j < members.length; j += 1) {
      totalGovRegPop += members[j].population;
      totalGovRegArea += members[j].areaKm2;
    }
  }

  let totalRegPop = 0;
  let totalRegArea = 0;
  const regCodeSet = new Set();
  const regions = territory.regions();
  for (let i = 0; i < regions.length; i += 1) {
    const ra = regions[i];
    regCodeSet.add(ra.code);
    const members = territory.municipalitiesInRegion(ra.code);
    assert.ok(members.length > 0, `RA ${ra.code} must have at least one member`);
    for (let j = 0; j < members.length; j += 1) {
      totalRegPop += members[j].population;
      totalRegArea += members[j].areaKm2;
    }
  }

  assert.equal(totalGovRegPop, totalMunicipalPop);
  assert.equal(totalRegPop, totalMunicipalPop);
  assert.ok(Math.abs(totalGovRegArea - totalMunicipalArea) < 1e-4);
  assert.ok(Math.abs(totalRegArea - totalMunicipalArea) < 1e-4);

  for (const code of municipalCodeSet) {
    assert.equal(govRegCodeSet.has(code), false, `Code collision: ${code} in municipal and govReg`);
    assert.equal(regCodeSet.has(code), false, `Code collision: ${code} in municipal and reg`);
  }
  for (const code of govRegCodeSet) {
    assert.equal(regCodeSet.has(code), false, `Code collision: ${code} in govReg and reg`);
  }
});
