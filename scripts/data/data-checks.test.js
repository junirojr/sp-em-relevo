import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkGovernmentRegionLabels,
  checkGovernmentRegionMembership,
  checkGroupCodeCollision,
  checkHierarchyStrictness,
  checkMeshTopology,
  checkMeta,
  checkMetropolitanRegionCoincidence,
  checkRecordShape,
  checkRegionLabels,
  checkRegionMembership,
  checkSameCodeSets,
  checkSourceCodes,
  checkStatePopulation,
  checkValues,
  EXPECTED_GOVERNMENT_REGION_CODES,
  EXPECTED_GOVERNMENT_REGION_COUNT,
  EXPECTED_MUNICIPALITY_COUNT,
  EXPECTED_REGION_CODES,
} from "./data-checks.js";
import { LICENSE_CONDITIONS } from "./sources.js";

/**
 * @typedef {import("../../src/domain/topology.js").Topology} Topology
 * @typedef {import("../../src/domain/topology.js").Geometry} Geometry
 * @typedef {{ code: string, regionCode: string | null, regionLabel: string | null }} RegionRow
 */

test("DAD-01 accepts a source with 645 unique seven-digit codes", () => {
  assert.deepEqual(checkSourceCodes("SIDRA 4714", createCodes(EXPECTED_MUNICIPALITY_COUNT)), []);
});

test("DAD-01 fails when a source has 644 codes", () => {
  const problems = checkSourceCodes("SIDRA 4714", createCodes(644));

  assertRule(problems, "DAD-01", /644/);
});

test("DAD-01 fails when a code repeats", () => {
  const codes = createCodes(EXPECTED_MUNICIPALITY_COUNT);
  codes[1] = codes[0];

  assertRule(checkSourceCodes("Seade", codes), "DAD-01", /repeat/);
});

test("DAD-01 fails when a code does not have seven digits", () => {
  const codes = createCodes(EXPECTED_MUNICIPALITY_COUNT);
  codes[0] = "350010";

  assertRule(checkSourceCodes("SIDRA 5938", codes), "DAD-01", /7 digits/);
});

test("DAD-01 fails when two sources disagree on the code set", () => {
  const codes = createCodes(EXPECTED_MUNICIPALITY_COUNT);
  const shifted = [...codes.slice(1), "3599999"];

  const problems = checkSameCodeSets({ "SIDRA 4714": codes, malha: shifted });

  assertRule(problems, "DAD-01", /malha/);
});

test("DAD-02 accepts every municipality in exactly one region with all 16 regions filled", () => {
  const rows = createRegionRows();

  assert.deepEqual(checkRegionMembership(rows), []);
  assert.deepEqual(checkRegionLabels(rows), []);
});

test("DAD-02 fails when a municipality has no region", () => {
  const rows = createRegionRows();
  rows[16] = { ...rows[16], regionCode: null, regionLabel: null };

  assertRule(checkRegionMembership(rows), "DAD-02", /no region/);
});

test("DAD-02 fails when a municipality has more than one region", () => {
  const rows = [...createRegionRows(), { code: "3500101", regionCode: "2", regionLabel: "RA 2" }];

  assertRule(checkRegionMembership(rows), "DAD-02", /more than one region/);
});

test("DAD-02 fails when one of the 16 regions is empty", () => {
  const rows = createRegionRows().map((row) => {
    if (row.regionCode !== "16") return row;
    return { ...row, regionCode: "15", regionLabel: "RA 15" };
  });

  assertRule(checkRegionMembership(rows), "DAD-02", /region 16 is empty/);
});

test("DAD-02 fails when a region carries two labels", () => {
  const rows = createRegionRows();
  rows[0] = { ...rows[0], regionLabel: "Outro rótulo" };

  assertRule(checkRegionLabels(rows), "DAD-02", /more than one label/);
});

test("DAD-03 accepts a region sum equal to the state population", () => {
  const municipalities = [
    { regionCode: "1", population: 100 },
    { regionCode: "2", population: 50 },
  ];

  assert.deepEqual(checkStatePopulation(municipalities, 150), []);
});

test("DAD-03 fails when the region sum differs from the state population by one inhabitant", () => {
  const municipalities = [
    { regionCode: "1", population: 100 },
    { regionCode: "2", population: 50 },
  ];

  assertRule(checkStatePopulation(municipalities, 151), "DAD-03", /150.*151/);
});

test("DAD-03 fails when a population is missing", () => {
  const municipalities = [
    { regionCode: "1", population: 100 },
    { regionCode: "2", population: null },
  ];

  assertRule(checkStatePopulation(municipalities, 100), "DAD-03", /missing/);
});

test("DAD-04 accepts a mesh whose arcs are used by one or two geometries", () => {
  assert.deepEqual(checkMeshTopology(createMesh([{ type: "Polygon", id: "1", arcs: [[0]] }])), []);
});

test("DAD-04 fails when an arc is used by three geometries", () => {
  const mesh = createMesh([
    { type: "Polygon", id: "1", arcs: [[0]] },
    { type: "Polygon", id: "2", arcs: [[0]] },
    { type: "Polygon", id: "3", arcs: [[0]] },
  ]);

  assertRule(checkMeshTopology(mesh), "DAD-04", /max 3/);
});

test("DAD-04 fails when a geometry has no non-empty ring", () => {
  const mesh = createMesh([
    { type: "Polygon", id: "1", arcs: [[0]] },
    { type: "Polygon", id: "2", arcs: [] },
  ]);

  assertRule(checkMeshTopology(mesh), "DAD-04", /empty/);
});

test("DAD-04 fails when a geometry is neither Polygon nor MultiPolygon", () => {
  const mesh = createMesh([{ type: "LineString", id: "1", arcs: [[0]] }]);

  assertRule(checkMeshTopology(mesh), "DAD-04", /LineString/);
});

test("DAD-05 accepts complete meta", () => {
  assert.deepEqual(checkMeta(createMeta()), []);
});

test("DAD-05 fails when meta lacks the license condition", () => {
  const meta = { ...createMeta(), license: { credit: "Fonte: IBGE" } };

  assertRule(checkMeta(meta), "DAD-05", /license/);
});

test("DAD-05 fails when a raw file name carries a folder", () => {
  const meta = { ...createMeta(), rawSha256: { "raw/sidra-4714.json": "a".repeat(64) } };

  assertRule(checkMeta(meta), "DAD-05", /rawSha256/);
});

test("DAD-05 fails when the download date is missing", () => {
  const meta = Object.fromEntries(
    Object.entries(createMeta()).filter(([field]) => field !== "retrievedAt"),
  );

  assertRule(checkMeta(meta), "DAD-05", /retrievedAt/);
});

test("DAD-05 data checks reject a license condition outside the closed vocabulary", () => {
  const pendingMeta = { ...createMeta(), license: { condition: "pending", credit: "Fonte: IBGE" } };
  const invented = {
    ...createMeta(),
    license: { condition: "Uso livre, sem restrições", credit: "Fonte: IBGE" },
  };

  assertRule(checkMeta(pendingMeta), "DAD-05", /license/);
  assertRule(checkMeta(invented), "DAD-05", /license/);
});

test("DAD-05 accepts several known license conditions joined by a semicolon", () => {
  const joined = `${LICENSE_CONDITIONS.ibgeMesh}; ${LICENSE_CONDITIONS.ibgeSidra}`;
  const meta = { ...createMeta(), license: { condition: joined, credit: "Fonte: IBGE" } };

  assert.deepEqual(checkMeta(meta), []);
});

test("DAD-06 accepts null for an absent value", () => {
  assert.deepEqual(checkValues([createMunicipality({ gdpThousandBrl: null })]), []);
});

test("DAD-06 fails on a negative value", () => {
  const problems = checkValues([createMunicipality({ population: -1 })]);

  assertRule(problems, "DAD-06", /negative/);
});

test("DAD-06 fails on NaN", () => {
  const problems = checkValues([createMunicipality({ areaKm2: Number.NaN })]);

  assertRule(problems, "DAD-06", /NaN/);
});

test("DAD-06 fails when an absent value is not null", () => {
  const problems = checkValues([createMunicipality({ gdpThousandBrl: undefined })]);

  assertRule(problems, "DAD-06", /null/);
});

test("DAD-07 accepts the stored municipality fields including government region", () => {
  assert.deepEqual(checkRecordShape([createMunicipality({})]), []);
});

test("DAD-07 fails when a record carries density", () => {
  const problems = checkRecordShape([createMunicipality({ density: 12.5 })]);

  assertRule(problems, "DAD-07", /density/);
});

test("RGV-01 accepts every municipality in exactly one government region with all 43 filled", () => {
  const rows = createGovernmentRegionRows();

  assert.deepEqual(checkGovernmentRegionMembership(rows), []);
  assert.deepEqual(checkGovernmentRegionLabels(rows), []);
});

test("RGV-01 fails when a municipality has no government region", () => {
  const rows = createGovernmentRegionRows();
  rows[0] = { ...rows[0], governmentRegionCode: null, governmentRegionName: null };

  assertRule(checkGovernmentRegionMembership(rows), "RGV-01", /no government region/);
});

test("RGV-01 fails when a municipality has more than one government region", () => {
  const rows = [
    ...createGovernmentRegionRows(),
    {
      code: "3500101",
      governmentRegionCode: "rg-2",
      governmentRegionName: "RG de Andradina",
    },
  ];

  assertRule(checkGovernmentRegionMembership(rows), "RGV-01", /more than one government region/);
});

test("RGV-01 fails when one of the 43 government regions is empty", () => {
  const rows = createGovernmentRegionRows().map((row) => {
    if (row.governmentRegionCode !== "rg-43") return row;
    return { ...row, governmentRegionCode: "rg-42", governmentRegionName: "RG de Tupã" };
  });

  assertRule(checkGovernmentRegionMembership(rows), "RGV-01", /government region rg-43 is empty/);
});

test("RGV-01 fails when a government region carries more than one label", () => {
  const rows = createGovernmentRegionRows();
  rows[0] = { ...rows[0], governmentRegionName: "Outro nome" };

  assertRule(checkGovernmentRegionLabels(rows), "RGV-01", /more than one label/);
});

test("RGV-02 accepts strict hierarchy where each RG is inside exactly one RA", () => {
  const geoseadeRows = [
    { code: "3500101", governmentRegionCode: "rg-1" },
    { code: "3500102", governmentRegionCode: "rg-1" },
    { code: "3500103", governmentRegionCode: "rg-2" },
  ];
  const seadeRows = [
    { code: "3500101", regionCode: "11" },
    { code: "3500102", regionCode: "11" },
    { code: "3500103", regionCode: "10" },
  ];

  assert.deepEqual(checkHierarchyStrictness(geoseadeRows, seadeRows), []);
});

test("RGV-02 fails when an RG is split across multiple RAs", () => {
  const geoseadeRows = [
    { code: "3500101", governmentRegionCode: "rg-1" },
    { code: "3500102", governmentRegionCode: "rg-1" },
  ];
  const seadeRows = [
    { code: "3500101", regionCode: "11" },
    { code: "3500102", regionCode: "12" },
  ];

  const problems = checkHierarchyStrictness(geoseadeRows, seadeRows);
  assertRule(problems, "RGV-02", /split across multiple administrative regions/);
});

test("RGV-02 accepts disjoint group codes across levels", () => {
  const codesByLevel = {
    municipality: ["3500105", "3500204"],
    governmentRegion: ["rg-1", "rg-2"],
    region: ["1", "2"],
  };

  assert.deepEqual(checkGroupCodeCollision(codesByLevel), []);
});

test("RGV-02 fails when group codes collide between levels", () => {
  const codesByLevel = {
    governmentRegion: ["1", "2"],
    region: ["1", "16"],
  };

  const problems = checkGroupCodeCollision(codesByLevel);
  assertRule(problems, "RGV-02", /code collision between levels/);
});

test("RGV-02 accepts territorial coincidence of RM São Paulo and RG de São Paulo", () => {
  const geoseadeRows = [
    { code: "3550308", governmentRegionCode: "rg-40", governmentRegionName: "RG de São Paulo" },
    { code: "3500101", governmentRegionCode: "rg-1", governmentRegionName: "RG de Adamantina" },
  ];
  const seadeRows = [
    { code: "3550308", regionCode: "1" },
    { code: "3500101", regionCode: "11" },
  ];

  assert.deepEqual(checkMetropolitanRegionCoincidence(geoseadeRows, seadeRows), []);
});

test("RGV-02 fails when RM São Paulo and RG de São Paulo diverge", () => {
  const geoseadeRows = [
    { code: "3550308", governmentRegionCode: "rg-40", governmentRegionName: "RG de São Paulo" },
  ];
  const seadeRows = [
    { code: "3550308", regionCode: "1" },
    { code: "3500101", regionCode: "1" },
  ];

  const problems = checkMetropolitanRegionCoincidence(geoseadeRows, seadeRows);
  assertRule(problems, "RGV-02", /do not coincide territorially/);
});

test("DAD-05 accepts CC-BY, CC-BY-4.0, and TSE-Dados-Abertos license conditions", () => {
  const conditions = [
    LICENSE_CONDITIONS.ccBy,
    LICENSE_CONDITIONS.ccBy4,
    LICENSE_CONDITIONS.tseOpenData,
    LICENSE_CONDITIONS.geoseade,
  ];

  for (const condition of conditions) {
    const meta = { ...createMeta(), license: { condition, credit: "Fonte oficial" } };
    assert.deepEqual(checkMeta(meta), []);
  }
});

/**
 * @param {string[]} problems
 * @param {string} ruleId
 * @param {RegExp} detail
 */
function assertRule(problems, ruleId, detail) {
  assert.ok(problems.length > 0, `expected a ${ruleId} problem`);
  assert.ok(
    problems.every((problem) => problem.startsWith(`${ruleId}:`)),
    problems.join("\n"),
  );
  assert.match(problems.join("\n"), detail);
}

/**
 * @param {number} count
 * @returns {string[]}
 */
function createCodes(count) {
  return Array.from({ length: count }, (_, index) => String(3500101 + index));
}

/** @returns {RegionRow[]} */
function createRegionRows() {
  return createCodes(EXPECTED_MUNICIPALITY_COUNT).map((code, index) => {
    const regionCode = EXPECTED_REGION_CODES[index % EXPECTED_REGION_CODES.length];
    return { code, regionCode, regionLabel: `RA ${regionCode}` };
  });
}

/**
 * @returns {{ code: string, governmentRegionCode: string, governmentRegionName: string }[]}
 */
function createGovernmentRegionRows() {
  return createCodes(EXPECTED_MUNICIPALITY_COUNT).map((code, index) => {
    const governmentRegionCode =
      EXPECTED_GOVERNMENT_REGION_CODES[index % EXPECTED_GOVERNMENT_REGION_CODES.length];
    return {
      code,
      governmentRegionCode,
      governmentRegionName: `RG ${governmentRegionCode}`,
    };
  });
}

/**
 * One closed square arc; every geometry in the fixture points to it.
 * @param {Geometry[]} geometries
 * @returns {Topology}
 */
function createMesh(geometries) {
  return {
    type: "Topology",
    transform: { scale: [1, 1], translate: [0, 0] },
    objects: { municipalities: { type: "GeometryCollection", geometries } },
    arcs: [
      [
        [0, 0],
        [10, 0],
        [0, 10],
        [-10, 0],
        [0, -10],
      ],
    ],
  };
}

/** @returns {Record<string, unknown>} */
function createMeta() {
  return {
    source: "IBGE, Censo Demográfico 2022",
    sourceUrl: ["https://apisidra.ibge.gov.br/values/t/4714"],
    year: [2022],
    retrievedAt: "2026-10-16T12:00:00.000Z",
    license: { condition: LICENSE_CONDITIONS.ibgeSidra, credit: "Fonte: IBGE" },
    rawSha256: { "sidra-4714.json": "a".repeat(64) },
  };
}

/**
 * @param {Record<string, unknown>} overrides
 * @returns {Record<string, unknown>}
 */
function createMunicipality(overrides) {
  return {
    code: "3500105",
    name: "Adamantina",
    regionCode: "11",
    governmentRegionCode: "rg-1",
    governmentRegionName: "RG de Adamantina",
    population: 34687,
    areaKm2: 411.987,
    gdpThousandBrl: 1705895,
    ...overrides,
  };
}
