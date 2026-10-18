import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXPECTED_MUNICIPALITY_COUNT,
  EXPECTED_RA_CODES,
  EXPECTED_RG_CODES,
  MAX_FILE_SIZE_BYTES,
  checkCandidateOraclePercentage,
  checkDeputyStructure,
  checkFileSizeCeiling,
  checkMunicipalityCoverage,
  checkPreaggregatedTotals,
  checkValidVotesIntegrity,
  hydrateUnitFromRow,
} from "./first-round-checks.js";

test("TUR-01 checkMunicipalityCoverage approves exactly 645 valid 7-digit IBGE codes starting with 35", () => {
  const validCodes = Array.from({ length: 645 }, (_, i) => {
    const num = String(i + 1).padStart(5, "0");
    return `35${num}`;
  });

  const problems = checkMunicipalityCoverage(validCodes);
  assert.equal(problems.length, 0);
});

test("TUR-01 checkMunicipalityCoverage flags count mismatches, invalid prefixes, and duplicates", () => {
  const shortList = ["3500105", "3500204"];
  const shortProblems = checkMunicipalityCoverage(shortList);
  assert.ok(shortProblems.some((p) => p.includes("Esperados exatamente 645")));

  const invalidPrefix = Array.from({ length: 645 }, (_, i) => {
    if (i === 0) {
      return "3300105"; // Rio de Janeiro code
    }
    const num = String(i + 1).padStart(5, "0");
    return `35${num}`;
  });
  const prefixProblems = checkMunicipalityCoverage(invalidPrefix);
  assert.ok(prefixProblems.some((p) => p.includes("Codigos IBGE invalidos para SP")));

  const duplicateList = Array.from({ length: 645 }, (_, i) => {
    if (i === 1) {
      return "3500001";
    }
    const num = String(i + 1).padStart(5, "0");
    return `35${num}`;
  });
  const dupProblems = checkMunicipalityCoverage(duplicateList);
  assert.ok(dupProblems.some((p) => p.includes("duplicados")));
});

test("TUR-01 checkValidVotesIntegrity verifies nominal votes and flags anomalies", () => {
  const validUnit = {
    code: "3550308",
    validVotes: 1000,
    blankVotes: 50,
    nullVotes: 60,
    demais: 200,
    candidates: [
      { ballotNumber: "22", validVotes: 500 },
      { ballotNumber: "13", validVotes: 300 },
    ],
  };

  const validProblems = checkValidVotesIntegrity(validUnit);
  assert.equal(validProblems.length, 0);

  const brokenUnit = {
    code: "3550308",
    validVotes: 1000,
    demais: 400,
    candidates: [
      { ballotNumber: "22", validVotes: 700 },
      { ballotNumber: "13", validVotes: 400 },
    ],
  };
  const brokenProblems = checkValidVotesIntegrity(brokenUnit);
  assert.ok(brokenProblems.some((p) => p.includes("excede o total valido")));
});

test("TUR-03 checkDeputyStructure enforces maximum 10 candidates, vote ordering, and tenthPlaceVotes", () => {
  const validDeputyUnit = {
    code: "3500105",
    validVotes: 2500,
    demais: 500,
    tenthPlaceVotes: 80,
    candidates: [
      { ballotNumber: "1010", validVotes: 500 },
      { ballotNumber: "1020", validVotes: 400 },
      { ballotNumber: "1030", validVotes: 300 },
      { ballotNumber: "1040", validVotes: 200 },
      { ballotNumber: "1050", validVotes: 150 },
      { ballotNumber: "1060", validVotes: 120 },
      { ballotNumber: "1070", validVotes: 100 },
      { ballotNumber: "1080", validVotes: 90 },
      { ballotNumber: "1090", validVotes: 85 },
      { ballotNumber: "1100", validVotes: 80 },
    ],
  };

  const validProblems = checkDeputyStructure(validDeputyUnit);
  assert.equal(validProblems.length, 0);

  const unorderedUnit = {
    code: "3500105",
    validVotes: 1000,
    demais: 100,
    candidates: [
      { ballotNumber: "1010", validVotes: 200 },
      { ballotNumber: "1020", validVotes: 400 }, // greater than previous!
    ],
  };
  const unorderedProblems = checkDeputyStructure(unorderedUnit);
  assert.ok(unorderedProblems.some((p) => p.includes("nao estao ordenados por votos decrescentes")));

  const tooManyCandidatesUnit = {
    code: "3500105",
    validVotes: 1000,
    demais: 0,
    candidates: Array.from({ length: 11 }, (_, i) => ({
      ballotNumber: String(1000 + i),
      validVotes: 100 - i,
    })),
  };
  const tooManyProblems = checkDeputyStructure(tooManyCandidatesUnit);
  assert.ok(tooManyProblems.some((p) => p.includes("maximo permitido e 10")));
});

test("TUR-03 checkPreaggregatedTotals verifies RA (16), RG (43), and State totals", () => {
  const validStateVotes = 24000;
  const raVotes = Math.floor(validStateVotes / 16);
  const raMap = {};
  for (const ra of EXPECTED_RA_CODES) {
    raMap[ra] = { validVotes: raVotes };
  }
  // Balance remainder into first RA
  raMap["1"].validVotes += validStateVotes - raVotes * 16;

  const rgVotes = Math.floor(validStateVotes / 43);
  const rgMap = {};
  for (const rg of EXPECTED_RG_CODES) {
    rgMap[rg] = { validVotes: rgVotes };
  }
  // Balance remainder into first RG
  rgMap["rg-1"].validVotes += validStateVotes - rgVotes * 43;

  const totals = {
    state: { validVotes: validStateVotes },
    ra: raMap,
    rg: rgMap,
  };

  const problems = checkPreaggregatedTotals(totals);
  assert.equal(problems.length, 0);

  const missingRaTotals = {
    state: { validVotes: validStateVotes },
    ra: { "1": { validVotes: validStateVotes } },
    rg: rgMap,
  };
  const missingRaProblems = checkPreaggregatedTotals(missingRaTotals);
  assert.ok(missingRaProblems.some((p) => p.includes("Regiao Administrativa ausente")));
});

test("PUB-09 checkFileSizeCeiling verifies 120,000 bytes budget limit", () => {
  assert.equal(checkFileSizeCeiling(100000).length, 0);
  assert.equal(checkFileSizeCeiling(MAX_FILE_SIZE_BYTES).length, 0);

  const overflowProblems = checkFileSizeCeiling(120001);
  assert.equal(overflowProblems.length, 1);
  assert.ok(overflowProblems[0].includes("excedeu o teto estrito de 120000 bytes"));
});

test("TUR-02 checkCandidateOraclePercentage checks tolerance bounds", () => {
  const exact = checkCandidateOraclePercentage(51.93, 51.93, "Flavio Bolsonaro");
  assert.equal(exact.length, 0);

  const withinTol = checkCandidateOraclePercentage(51.94, 51.93, "Flavio Bolsonaro", 0.05);
  assert.equal(withinTol.length, 0);

  const outsideTol = checkCandidateOraclePercentage(52.5, 51.93, "Flavio Bolsonaro", 0.05);
  assert.equal(outsideTol.length, 1);
  assert.ok(outsideTol[0].includes("diverge do oraculo"));
});

test("hydrateUnitFromRow transforms compact columnar row into ElectionUnitInput", () => {
  const row = [
    "3550308",
    10000,
    300,
    400,
    2000,
    500,
    [
      ["22", 4500],
      ["13", 3500],
    ],
  ];

  const metaMap = {
    "22": { name: "Flavio Bolsonaro", party: "PL" },
    "13": { name: "Lula", party: "PT" },
  };

  const hydrated = hydrateUnitFromRow(row, metaMap);
  assert.equal(hydrated.code, "3550308");
  assert.equal(hydrated.ibgeCode, "3550308");
  assert.equal(hydrated.totalValidVotes, 10000);
  assert.equal(hydrated.blankVotes, 300);
  assert.equal(hydrated.nullVotes, 400);
  assert.equal(hydrated.otherVotes, 2000);
  assert.equal(hydrated.tenthPlaceVotes, 500);
  assert.equal(hydrated.candidates?.length, 2);
  assert.equal(hydrated.candidates?.[0].ballotNumber, "22");
  assert.equal(hydrated.candidates?.[0].name, "Flavio Bolsonaro");
  assert.equal(hydrated.candidates?.[0].party, "PL");
  assert.equal(hydrated.candidates?.[0].validVotes, 4500);
});
