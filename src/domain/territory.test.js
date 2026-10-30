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

  const municipalities = rows.map((/** @type {{ [x: string]: any; }} */ row) => ({
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

test("NAT-01 territory supports national levels: country, uf, intermediaria, imediata, municipality", () => {
  const nationalMunicipalities = [
    {
      code: "3550308",
      name: "São Paulo",
      regionCode: "1",
      uf: "SP",
      ufCode: "35",
      ufSigla: "SP",
      ufName: "São Paulo",
      intermediariaCode: "3501",
      intermediariaName: "São Paulo",
      imediataCode: "350001",
      imediataName: "São Paulo",
      countryCode: "BR",
      countryName: "Brasil",
      population: 11451245,
      areaKm2: 1521,
      gdpThousandBrl: 828980608,
    },
    {
      code: "3304557",
      name: "Rio de Janeiro",
      regionCode: "",
      uf: "RJ",
      ufCode: "33",
      ufSigla: "RJ",
      ufName: "Rio de Janeiro",
      intermediariaCode: "3301",
      intermediariaName: "Rio de Janeiro",
      imediataCode: "330001",
      imediataName: "Rio de Janeiro",
      countryCode: "BR",
      countryName: "Brasil",
      population: 6211423,
      areaKm2: 1200,
      gdpThousandBrl: 359634752,
    },
    {
      code: "3106200",
      name: "Belo Horizonte",
      regionCode: "",
      uf: "MG",
      ufCode: "31",
      ufSigla: "MG",
      ufName: "Minas Gerais",
      intermediariaCode: "3101",
      intermediariaName: "Belo Horizonte",
      imediataCode: "310001",
      imediataName: "Belo Horizonte",
      countryCode: "BR",
      countryName: "Brasil",
      population: 2315560,
      areaKm2: 331,
      gdpThousandBrl: 105829672,
    },
  ];

  const territory = createTerritory({
    municipalities: nationalMunicipalities,
  });

  assert.equal(territory.municipalities().length, 3);
  assert.equal(territory.ufs().length, 3);
  assert.equal(territory.intermediarias().length, 3);
  assert.equal(territory.imediatas().length, 3);
  assert.equal(territory.countries().length, 1);

  assert.equal(groupOf("municipality", "3550308", territory), "3550308");
  assert.equal(groupOf("imediata", "3550308", territory), "350001");
  assert.equal(groupOf("intermediaria", "3550308", territory), "3501");
  assert.equal(groupOf("uf", "3550308", territory), "SP");
  assert.equal(groupOf("country", "3550308", territory), "BR");

  assert.equal(groupOf("uf", nationalMunicipalities[1], territory), "RJ");
  assert.equal(groupOf("country", nationalMunicipalities[2], territory), "BR");

  const rjUf = territory.ufOf("3304557");
  assert.equal(rjUf?.code, "RJ");
  assert.equal(rjUf?.label, "Rio de Janeiro");

  const mgIntermediaria = territory.intermediariaOf("3106200");
  assert.equal(mgIntermediaria?.code, "3101");

  const spImediata = territory.imediataOf("3550308");
  assert.equal(spImediata?.code, "350001");

  const country = territory.countryOf("3550308");
  assert.equal(country?.code, "BR");
  assert.equal(country?.label, "Brasil");

  const spMembers = territory.municipalitiesInUf("SP");
  assert.equal(spMembers.length, 1);
  assert.equal(spMembers[0].name, "São Paulo");

  const brMembers = territory.municipalitiesInCountry("BR");
  assert.equal(brMembers.length, 3);
});

test("NAT-02 createTerritory accepts arbitrary collections without SP presumption", () => {
  const customMunicipalities = [
    {
      code: "1100015",
      name: "Alta Floresta D'Oeste",
      regionCode: "",
      ufCode: "11",
      population: 21500,
      areaKm2: 7067,
      gdpThousandBrl: 580000,
    },
    {
      code: "1200013",
      name: "Acrelândia",
      regionCode: "",
      ufCode: "12",
      population: 14000,
      areaKm2: 1800,
      gdpThousandBrl: 320000,
    },
  ];

  const emptyTerritory = createTerritory();
  assert.equal(emptyTerritory.municipalities().length, 0);
  assert.equal(emptyTerritory.regions().length, 0);

  const territory = createTerritory({
    municipalities: customMunicipalities,
  });

  assert.equal(territory.municipalities().length, 2);
  assert.equal(territory.codeByName("Acrelândia"), "1200013");
  assert.equal(territory.nameByCode("1100015"), "Alta Floresta D'Oeste");

  const groups = territory.groupsOfLevel("uf");
  assert.equal(groups.length, 2);
  assert.deepEqual(
    territory.municipalitiesInGroup("uf", "11").map((m) => m.code),
    ["1100015"],
  );

  const groupRecord = territory.groupRecordOf("uf", "1200013");
  assert.equal(groupRecord?.code, "12");
  assert.equal(groupRecord?.label, "Acre");
});
