import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { gunzipSync } from "node:zlib";
import { buildNational, determineTargetUfs } from "./build-national.mjs";
import { selectSourcesToFetch } from "./fetch-national.mjs";
import { CHECKSUMS_FILE } from "./sources.js";
import {
  BRAZIL_UFS_MESH_FILE,
  CENSUS_NATIONAL_FILE,
  GDP_NATIONAL_FILE,
  HIERARCHY_FILE,
  UF_CATALOG,
} from "./sources-national.js";

const workDir = await mkdtemp(path.join(tmpdir(), "sp-national-test-"));
after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("fetch-national: selectSourcesToFetch handles core, single UF, list, and all", () => {
  const core = selectSourcesToFetch({
    quality: "intermediaria",
    uf: "",
    all: false,
    coreOnly: true,
  });
  assert.equal(core.length, 4);

  const singleUf = selectSourcesToFetch({
    quality: "intermediaria",
    uf: "35",
    all: false,
    coreOnly: false,
  });
  assert.equal(singleUf.length, 5);
  assert.ok(singleUf.some((s) => s.file === "ibge-malha-35-intermediaria.topo.json"));

  const bySigla = selectSourcesToFetch({
    quality: "minima",
    uf: "sp",
    all: false,
    coreOnly: false,
  });
  assert.equal(bySigla.length, 5);
  assert.ok(bySigla.some((s) => s.file === "ibge-malha-35-minima.topo.json"));

  const multipleUfs = selectSourcesToFetch({
    quality: "intermediaria",
    uf: "35, 33",
    all: false,
    coreOnly: false,
  });
  assert.equal(multipleUfs.length, 6);

  const allUfs = selectSourcesToFetch({
    quality: "intermediaria",
    uf: "",
    all: true,
    coreOnly: false,
  });
  assert.equal(allUfs.length, 31);
});

test("fetch-national: selectSourcesToFetch throws on unknown UF", () => {
  assert.throws(
    () =>
      selectSourcesToFetch({
        quality: "intermediaria",
        uf: "99",
        all: false,
        coreOnly: false,
      }),
    /Unknown UF code or abbreviation/,
  );
});

test("build-national: determineTargetUfs parses UF codes and abbreviations", () => {
  const fromCode = determineTargetUfs({ uf: "35", all: false });
  assert.deepEqual(fromCode, ["35"]);

  const fromSigla = determineTargetUfs({ uf: "sp, rj", all: false });
  assert.deepEqual(fromSigla, ["35", "33"]);

  const fromAll = determineTargetUfs({ uf: "", all: true });
  assert.equal(fromAll.length, 27);
  assert.equal(fromAll[0], "11");
});

test("build-national: builds data/national and data/ufs datasets end-to-end", async () => {
  const rawDir = path.join(workDir, "raw-fixture");
  const dataDir = path.join(workDir, "data-output");
  await mkdir(rawDir, { recursive: true });

  const rawFiles = createNationalFixtureFiles();
  /** @type {Record<string, { sha256: string, retrievedAt: string }>} */
  const checksums = {};
  for (const [fileName, content] of Object.entries(rawFiles)) {
    const bytes = Buffer.from(content, "utf8");
    await writeFile(path.join(rawDir, fileName), bytes);
    checksums[fileName] = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      retrievedAt: "2026-10-29T12:00:00.000Z",
    };
  }
  await writeFile(path.join(rawDir, CHECKSUMS_FILE), JSON.stringify(checksums, null, 2), "utf8");

  const summary = await buildNational({
    rawDir,
    dataDir,
    quality: "intermediaria",
    uf: "35",
  });

  assert.ok(summary.nationalFiles.includes("states.json"));
  assert.ok(summary.nationalFiles.includes("mesh-states.topo.json.gz"));
  assert.ok(summary.ufsBuilt.includes("SP"));

  const statesRaw = await readFile(path.join(dataDir, "national", "states.json"), "utf8");
  const statesDoc = JSON.parse(statesRaw);

  assert.equal(statesDoc.states.length, 27);
  assert.equal(statesDoc.totals.statesCount, 27);
  assert.ok(statesDoc.totals.population > 0);
  assert.ok(statesDoc.totals.areaKm2 > 0);
  assert.ok(statesDoc.totals.gdpThousandBrl > 0);

  const spState = statesDoc.states.find(/** @param {any} s */ (s) => s.code === "35");
  assert.ok(spState);
  assert.equal(spState.sigla, "SP");
  assert.equal(spState.name, "São Paulo");
  assert.equal(spState.municipalitiesCount, 2);
  assert.equal(spState.population, 12500000);

  const nationalGzBytes = await readFile(
    path.join(dataDir, "national", "mesh-states.topo.json.gz"),
  );
  const nationalMeshText = gunzipSync(nationalGzBytes).toString("utf8");
  const nationalMesh = JSON.parse(nationalMeshText);
  assert.equal(nationalMesh.type, "Topology");
  assert.ok(nationalMesh.objects.states);
  assert.equal(nationalMesh.objects.states.geometries.length, 27);
  assert.ok(nationalMesh.transform);

  const mun35Raw = await readFile(path.join(dataDir, "ufs", "35", "municipalities.json"), "utf8");
  const mun35 = JSON.parse(mun35Raw);
  assert.equal(mun35.schemaVersion, 1);
  assert.equal(mun35.rows.length, 2);
  assert.equal(mun35.rows[0][0], "3500105");

  const regions35Raw = await readFile(path.join(dataDir, "ufs", "35", "regions.json"), "utf8");
  const regions35 = JSON.parse(regions35Raw);
  assert.ok(regions35.regions.length > 0);
  assert.ok(regions35.governmentRegions.length > 0);

  const ufMeshGzBytes = await readFile(path.join(dataDir, "ufs", "35", "mesh.topo.json.gz"));
  const ufMesh = JSON.parse(gunzipSync(ufMeshGzBytes).toString("utf8"));
  assert.equal(ufMesh.type, "Topology");
  assert.equal(ufMesh.objects.municipalities.geometries.length, 2);

  const munSpRaw = await readFile(path.join(dataDir, "ufs", "sp", "municipalities.json"), "utf8");
  assert.equal(mun35Raw, munSpRaw);
});

test("build-national: building twice over same raw files gives byte-identical outputs", async () => {
  const rawDir = path.join(workDir, "raw-fixture-det");
  const out1 = path.join(workDir, "data-out-1");
  const out2 = path.join(workDir, "data-out-2");
  await mkdir(rawDir, { recursive: true });

  const rawFiles = createNationalFixtureFiles();
  /** @type {Record<string, { sha256: string, retrievedAt: string }>} */
  const checksums = {};
  for (const [fileName, content] of Object.entries(rawFiles)) {
    const bytes = Buffer.from(content, "utf8");
    await writeFile(path.join(rawDir, fileName), bytes);
    checksums[fileName] = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      retrievedAt: "2026-10-29T12:00:00.000Z",
    };
  }
  await writeFile(path.join(rawDir, CHECKSUMS_FILE), JSON.stringify(checksums, null, 2), "utf8");

  await buildNational({ rawDir, dataDir: out1, quality: "intermediaria", uf: "35" });
  await buildNational({ rawDir, dataDir: out2, quality: "intermediaria", uf: "35" });

  const filesToCheck = [
    path.join("national", "states.json"),
    path.join("national", "mesh-states.topo.json"),
    path.join("ufs", "35", "municipalities.json"),
    path.join("ufs", "35", "regions.json"),
    path.join("ufs", "35", "mesh.topo.json"),
  ];

  for (const rel of filesToCheck) {
    const b1 = await readFile(path.join(out1, rel));
    const b2 = await readFile(path.join(out2, rel));
    assert.equal(b1.compare(b2), 0);
  }
});

test("build-national: builds polo UFs (RJ 33, MG 31, BA 29, RS 43, PR 41) with byte idempotence", async () => {
  const poloRawDir = path.join(workDir, "raw-fixture-polo");
  const poloDataDir1 = path.join(workDir, "data-out-polo-1");
  const poloDataDir2 = path.join(workDir, "data-out-polo-2");
  await mkdir(poloRawDir, { recursive: true });

  const rawFiles = createNationalFixtureFiles();
  /** @type {Record<string, { sha256: string, retrievedAt: string }>} */
  const checksums = {};
  for (const [fileName, content] of Object.entries(rawFiles)) {
    const bytes = Buffer.from(content, "utf8");
    await writeFile(path.join(poloRawDir, fileName), bytes);
    checksums[fileName] = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      retrievedAt: "2026-10-29T12:00:00.000Z",
    };
  }
  await writeFile(
    path.join(poloRawDir, CHECKSUMS_FILE),
    JSON.stringify(checksums, null, 2),
    "utf8",
  );

  const poloCodes = ["33", "31", "29", "43", "41"];
  const summary1 = await buildNational({
    rawDir: poloRawDir,
    dataDir: poloDataDir1,
    quality: "intermediaria",
    uf: poloCodes.join(","),
  });

  const expectedSiglas = ["RJ", "MG", "BA", "RS", "PR"];
  assert.equal(summary1.ufsBuilt.length, 5);
  for (const sigla of expectedSiglas) {
    assert.ok(summary1.ufsBuilt.includes(sigla));
  }

  for (const code of poloCodes) {
    const munRaw = await readFile(
      path.join(poloDataDir1, "ufs", code, "municipalities.json"),
      "utf8",
    );
    const munDoc = JSON.parse(munRaw);
    assert.equal(munDoc.schemaVersion, 1);
    assert.ok(munDoc.rows.length > 0);

    const regionsRaw = await readFile(path.join(poloDataDir1, "ufs", code, "regions.json"), "utf8");
    const regionsDoc = JSON.parse(regionsRaw);
    assert.ok(regionsDoc.regions.length > 0);

    const meshGz = await readFile(path.join(poloDataDir1, "ufs", code, "mesh.topo.json.gz"));
    const mesh = JSON.parse(gunzipSync(meshGz).toString("utf8"));
    assert.equal(mesh.type, "Topology");
    assert.ok(mesh.objects.municipalities);
  }

  await buildNational({
    rawDir: poloRawDir,
    dataDir: poloDataDir2,
    quality: "intermediaria",
    uf: poloCodes.join(","),
  });

  for (const code of poloCodes) {
    for (const file of [
      "municipalities.json",
      "regions.json",
      "mesh.topo.json",
      "mesh.topo.json.gz",
    ]) {
      const b1 = await readFile(path.join(poloDataDir1, "ufs", code, file));
      const b2 = await readFile(path.join(poloDataDir2, "ufs", code, file));
      assert.equal(b1.compare(b2), 0);
    }
  }
});

/**
 * Creates minimal valid national fixtures for all 27 UFs.
 * @returns {Record<string, string>}
 */
function createNationalFixtureFiles() {
  const nationalGeometries = UF_CATALOG.map((uf, idx) => ({
    type: "Polygon",
    arcs: [[idx]],
    properties: { codarea: uf.code },
  }));

  const nationalArcs = UF_CATALOG.map((_, idx) => [
    [idx * 10, idx * 10],
    [5, 0],
    [0, 5],
    [-5, 0],
    [0, -5],
  ]);

  const nationalMesh = {
    type: "Topology",
    transform: {
      scale: [0.001, 0.001],
      translate: [-50, -20],
    },
    objects: {
      BRUF: {
        type: "GeometryCollection",
        geometries: nationalGeometries,
      },
    },
    arcs: nationalArcs,
  };

  const hierarchy = [];
  for (const uf of UF_CATALOG) {
    hierarchy.push({
      "municipio-id": Number(`${uf.code}00105`),
      "municipio-nome": `Municipio 1 de ${uf.sigla}`,
      "microrregiao-id": Number(`${uf.code}001`),
      "microrregiao-nome": `Micro 1 de ${uf.sigla}`,
      "mesorregiao-id": Number(`${uf.code}01`),
      "mesorregiao-nome": `Meso 1 de ${uf.sigla}`,
      "regiao-imediata-id": Number(`${uf.code}0001`),
      "regiao-imediata-nome": `Imediata 1 de ${uf.sigla}`,
      "regiao-intermediaria-id": Number(`${uf.code}01`),
      "regiao-intermediaria-nome": `Intermediaria 1 de ${uf.sigla}`,
      "UF-id": Number(uf.code),
      "UF-sigla": uf.sigla,
      "UF-nome": uf.name,
      "regiao-id": Number(uf.regionCode),
      "regiao-sigla": uf.regionName.slice(0, 1),
      "regiao-nome": uf.regionName,
    });
    if (uf.code === "35") {
      hierarchy.push({
        "municipio-id": 3500204,
        "municipio-nome": "Municipio 2 de SP",
        "microrregiao-id": 35002,
        "microrregiao-nome": "Micro 2 de SP",
        "mesorregiao-id": 3502,
        "mesorregiao-nome": "Meso 2 de SP",
        "regiao-imediata-id": 350002,
        "regiao-imediata-nome": "Imediata 2 de SP",
        "regiao-intermediaria-id": 3502,
        "regiao-intermediaria-nome": "Intermediaria 2 de SP",
        "UF-id": 35,
        "UF-sigla": "SP",
        "UF-nome": "São Paulo",
        "regiao-id": 3,
        "regiao-sigla": "SE",
        "regiao-nome": "Sudeste",
      });
    }
  }

  const censusRows = [{ NC: "Nível", D1C: "Código", D1N: "Nome", D2C: "Variável", V: "Valor" }];
  const gdpRows = [{ NC: "Nível", D1C: "Código", D1N: "Nome", D2C: "Variável", V: "Valor" }];

  for (const mun of hierarchy) {
    const code = String(mun["municipio-id"]);
    let pop = 100000;
    if (code === "3500105") {
      pop = 12000000;
    }
    if (code === "3500204") {
      pop = 500000;
    }

    censusRows.push({
      NC: "6",
      D1C: code,
      D1N: `${mun["municipio-nome"]} - ${mun["UF-sigla"]}`,
      D2C: "93",
      V: String(pop),
    });
    censusRows.push({
      NC: "6",
      D1C: code,
      D1N: `${mun["municipio-nome"]} - ${mun["UF-sigla"]}`,
      D2C: "6318",
      V: "1521.11",
    });

    gdpRows.push({
      NC: "6",
      D1C: code,
      D1N: `${mun["municipio-nome"]} - ${mun["UF-sigla"]}`,
      D2C: "37",
      V: "850000",
    });
  }

  const spMesh = {
    type: "Topology",
    transform: { scale: [0.001, 0.001], translate: [-46.5, -23.5] },
    objects: {
      UF35MU: {
        type: "GeometryCollection",
        geometries: [
          { type: "Polygon", arcs: [[0]], properties: { codarea: "3500105" } },
          { type: "Polygon", arcs: [[1]], properties: { codarea: "3500204" } },
        ],
      },
    },
    arcs: [
      [
        [0, 0],
        [10, 0],
        [0, 10],
        [-10, 0],
        [0, -10],
      ],
      [
        [10, 0],
        [10, 0],
        [0, 10],
        [-10, 0],
        [0, -10],
      ],
    ],
  };

  /** @type {Record<string, string>} */
  const result = {
    [BRAZIL_UFS_MESH_FILE]: JSON.stringify(nationalMesh),
    [HIERARCHY_FILE]: JSON.stringify(hierarchy),
    [CENSUS_NATIONAL_FILE]: JSON.stringify(censusRows),
    [GDP_NATIONAL_FILE]: JSON.stringify(gdpRows),
    "ibge-malha-35-intermediaria.topo.json": JSON.stringify(spMesh),
  };

  const poloCodes = ["33", "31", "29", "43", "41"];
  for (const polo of poloCodes) {
    const mesh = {
      type: "Topology",
      transform: { scale: [0.001, 0.001], translate: [-43.0, -22.0] },
      objects: {
        municipalities: {
          type: "GeometryCollection",
          geometries: [{ type: "Polygon", arcs: [[0]], properties: { codarea: `${polo}00105` } }],
        },
      },
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
    result[`ibge-malha-${polo}-intermediaria.topo.json`] = JSON.stringify(mesh);
  }

  return result;
}
