import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, hostname, tmpdir, userInfo } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { gunzipSync } from "node:zlib";
import { parseMunicipalities } from "../../src/app/data-loader.js";
import { buildData } from "./build-data.mjs";
import { checkMeta } from "./data-checks.js";
import {
  CENSUS_SOURCE,
  CHECKSUMS_FILE,
  GDP_SOURCE,
  GEOSEADE_SOURCE,
  LICENSE_CONDITIONS,
  MESH_LICENSE_NOTICE,
  MESH_SOURCES,
  REGION_SOURCE,
} from "./sources.js";

/**
 * @typedef {{
 *   code: string,
 *   name: string,
 *   regionCode: string,
 *   gidRg: number,
 *   governmentRegionCode: string,
 *   governmentRegionName: string,
 *   population: number,
 *   areaKm2: number,
 *   gdpThousandBrl: number | null
 * }} FixtureMunicipality
 * @typedef {{ municipalities: FixtureMunicipality[], secondaryNames: string[], statePopulation: number }} FixtureOptions
 * @typedef {Record<string, string | Uint8Array>} RawFiles
 */

const OUTPUT_FILES = ["mesh.topo.json", "municipalities.json", "regions.json"];
const RETRIEVED_AT = "2026-10-16T12:00:00.000Z";
const GRID_COLUMNS = 43;
const GRID_ROWS = 15;
const GRID_STEP = 10;
const MUNICIPALITY_WITHOUT_GDP = 2;

const REMAINING_RGS = Array.from({ length: 43 }, (_, i) => i + 1).filter((rg) => rg !== 40);

const workDir = await mkdtemp(path.join(tmpdir(), "sp-data-build-"));
after(() => rm(workDir, { recursive: true, force: true }));

test("DAD-05 building twice over the same raw files gives byte-identical outputs", async () => {
  const rawDir = await writeRawDir(createRawFiles(createFixtureOptions()));
  const firstOut = await createOutDir();
  const secondOut = await createOutDir();

  await buildData({ rawDir, outDir: firstOut });
  await buildData({ rawDir, outDir: secondOut });

  for (const file of OUTPUT_FILES) {
    const first = await readFile(path.join(firstOut, file));
    const second = await readFile(path.join(secondOut, file));
    assert.ok(first.equals(second), `${file} differs between builds`);
  }
});

test("DAD-01 swapping the names of two rows in Seade and SIDRA 5938 leaves the result unchanged", async () => {
  const options = createFixtureOptions();
  const swappedNames = [...options.secondaryNames];
  [swappedNames[0], swappedNames[1]] = [swappedNames[1], swappedNames[0]];
  const originalOut = await buildFixture(options);
  const swappedOut = await createOutDir();
  const swappedRaw = await writeRawDir(
    createRawFiles({ ...options, secondaryNames: swappedNames }),
  );

  const summary = await buildData({ rawDir: swappedRaw, outDir: swappedOut });

  const original = await readOutputs(originalOut);
  const swapped = await readOutputs(swappedOut);
  assert.deepEqual(
    parseMunicipalities(swapped.municipalities),
    parseMunicipalities(original.municipalities),
  );
  assert.deepEqual(swapped.regions.regions, original.regions.regions);
  assert.deepEqual(swapped.regions.governmentRegions, original.regions.governmentRegions);
  assert.deepEqual(swapped.mesh.objects, original.mesh.objects);
  assert.match(summary.warnings.join("\n"), /3500101/);
  assert.match(summary.warnings.join("\n"), /3500102/);
});

test("DAD-06 a SIDRA marker for unavailable data becomes null, never 0", async () => {
  const { municipalities } = await readOutputs(await buildFixture(createFixtureOptions()));

  assert.equal(parseMunicipalities(municipalities)[MUNICIPALITY_WITHOUT_GDP].gdpThousandBrl, null);
  assert.equal(parseMunicipalities(municipalities)[0].gdpThousandBrl, 5000);
});

test("DAD-02 regions.json lists the 16 Seade regions by code with the double space normalized", async () => {
  const { regions } = await readOutputs(await buildFixture(createFixtureOptions()));

  assert.equal(regions.regions.length, 16);
  assert.deepEqual(regions.regions[0], { code: "1", label: "RM Região 1" });
  assert.deepEqual(
    regions.regions.map((/** @type {{ code: string }} */ region) => region.code),
    Array.from({ length: 16 }, (_, index) => String(index + 1)),
  );
});

test("RGV-01 regions.json lists the 43 Geoseade government regions by code", async () => {
  const { regions } = await readOutputs(await buildFixture(createFixtureOptions()));

  assert.equal(regions.governmentRegions.length, 43);
  assert.deepEqual(regions.governmentRegions[0], { code: "rg-1", label: "RG 1" });
  assert.deepEqual(
    regions.governmentRegions.map((/** @type {{ code: string }} */ region) => region.code),
    Array.from({ length: 43 }, (_, index) => `rg-${index + 1}`),
  );
});

test("RGV-02 government regions strictly nest within administrative regions and RM SP coincides with RG SP", async () => {
  const { municipalities } = await readOutputs(await buildFixture(createFixtureOptions()));
  const records = parseMunicipalities(municipalities);

  const spMunicipalities = records.filter(
    (/** @type {{ regionCode: string; }} */ m) => m.regionCode === "1",
  );
  assert.equal(spMunicipalities.length, 39);
  for (const m of spMunicipalities) {
    assert.equal(m.governmentRegionCode, "rg-40");
    assert.equal(m.governmentRegionName, "RG de São Paulo");
  }
});

test("DAD-03 the build fails when the state population differs from the region sum and writes nothing", async () => {
  const options = createFixtureOptions();
  const rawDir = await writeRawDir(
    createRawFiles({ ...options, statePopulation: options.statePopulation + 1 }),
  );
  const outDir = await createOutDir();

  await assert.rejects(buildData({ rawDir, outDir }), /DAD-03/);
  assert.deepEqual(await readdir(outDir), []);
});

test("DAD-05 meta records sources, years, download date, license condition and bare raw file names", async () => {
  const rawFiles = createRawFiles(createFixtureOptions());
  const rawDir = await writeRawDir(rawFiles);
  const outDir = await createOutDir();
  await buildData({ rawDir, outDir });

  const outputs = await readOutputs(outDir);
  const { meta } = outputs.municipalities;
  assert.deepEqual(
    Object.keys(meta.rawSha256),
    [CENSUS_SOURCE.file, REGION_SOURCE.file, GDP_SOURCE.file, GEOSEADE_SOURCE.file].sort(),
  );
  assert.equal(meta.rawSha256[CENSUS_SOURCE.file], sha256(rawFiles[CENSUS_SOURCE.file]));
  assert.equal(meta.rawSha256[GEOSEADE_SOURCE.file], sha256(rawFiles[GEOSEADE_SOURCE.file]));
  assert.equal(meta.retrievedAt, RETRIEVED_AT);
  assert.equal(
    meta.license.condition,
    [
      LICENSE_CONDITIONS.ibgeSidra,
      LICENSE_CONDITIONS.seadeDerived,
      LICENSE_CONDITIONS.geoseade,
    ].join("; "),
  );
  assert.deepEqual(meta.year, [CENSUS_SOURCE.year, GDP_SOURCE.year, REGION_SOURCE.year]);
  for (const output of Object.values(outputs)) {
    assert.deepEqual(checkMeta(output.meta), []);
  }
  for (const file of OUTPUT_FILES) {
    const text = await readFile(path.join(outDir, file), "utf8");
    assert.deepEqual(findLocalTraces(text), [], `${file} leaks details of this machine`);
  }
});

test("DAD-05 only the mesh carries the processing notice in its license", async () => {
  const { mesh, municipalities, regions } = await readOutputs(
    await buildFixture(createFixtureOptions()),
  );

  assert.equal(mesh.meta.license.notice, MESH_LICENSE_NOTICE);
  assert.equal("notice" in municipalities.meta.license, false);
  assert.equal("notice" in regions.meta.license, false);
});

test("DAD-07 municipalities.json stores only the expected fields, ordered by code", async () => {
  const { municipalities } = await readOutputs(await buildFixture(createFixtureOptions()));
  const records = parseMunicipalities(municipalities);
  const codes = records.map((/** @type {{ code: string }} */ record) => record.code);

  assert.equal(records.length, 645);
  assert.deepEqual(Object.keys(records[0]), [
    "code",
    "name",
    "regionCode",
    "governmentRegionCode",
    "governmentRegionName",
    "population",
    "areaKm2",
    "gdpThousandBrl",
  ]);
  assert.deepEqual(records[0], {
    code: "3500101",
    name: "Município 0",
    regionCode: "1",
    governmentRegionCode: "rg-40",
    governmentRegionName: "RG de São Paulo",
    population: 1000,
    areaKm2: 10.5,
    gdpThousandBrl: 5000,
  });
  assert.deepEqual(codes, [...codes].sort());
});

test("DAD-04 the build reports both mesh qualities and writes the chosen one with bare geometries", async () => {
  const rawDir = await writeRawDir(createRawFiles(createFixtureOptions()));
  const outDir = await createOutDir();

  const summary = await buildData({ rawDir, outDir, quality: "minima" });

  const { mesh } = await readOutputs(outDir);
  assert.ok(summary.meshBytes.minima > 0);
  assert.ok(summary.meshBytes.intermediaria > 0);
  assert.deepEqual(Object.keys(mesh.meta.rawSha256), [MESH_SOURCES.minima.file]);
  assert.deepEqual(Object.keys(mesh.objects), ["municipalities"]);
  assert.equal(mesh.objects.municipalities.geometries.length, 645);
  assert.deepEqual(mesh.objects.municipalities.geometries[0], {
    type: "Polygon",
    id: "3500101",
    arcs: [[0, 689, -44, -689]],
  });
});

test("DAD-04 the build rejects an unknown mesh quality", async () => {
  const rawDir = await writeRawDir(createRawFiles(createFixtureOptions()));

  await assert.rejects(
    buildData({ rawDir, outDir: await createOutDir(), quality: "maxima" }),
    /maxima/,
  );
});

/** @returns {FixtureOptions} */
function createFixtureOptions() {
  const municipalities = Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, index) =>
    createFixtureMunicipality(index),
  );
  return {
    municipalities,
    secondaryNames: municipalities.map((municipality) => municipality.name),
    statePopulation: municipalities.reduce(
      (total, municipality) => total + municipality.population,
      0,
    ),
  };
}

/**
 * @param {number} index
 * @returns {FixtureMunicipality}
 */
function createFixtureMunicipality(index) {
  /** @type {number | null} */
  let gdpThousandBrl = 5000 + index;
  if (index === MUNICIPALITY_WITHOUT_GDP) {
    gdpThousandBrl = null;
  }

  if (index < 39) {
    return {
      code: String(3500101 + index),
      name: `Município ${index}`,
      regionCode: "1",
      gidRg: 40,
      governmentRegionCode: "rg-40",
      governmentRegionName: "RG de São Paulo",
      population: 1000 + index,
      areaKm2: 10.5 + index,
      gdpThousandBrl,
    };
  }

  const remainingIndex = index - 39;
  const k = remainingIndex % 42;
  const gidRg = REMAINING_RGS[k];
  const raCode = String(2 + (k % 15));

  return {
    code: String(3500101 + index),
    name: `Município ${index}`,
    regionCode: raCode,
    gidRg,
    governmentRegionCode: `rg-${gidRg}`,
    governmentRegionName: `RG ${gidRg}`,
    population: 1000 + index,
    areaKm2: 10.5 + index,
    gdpThousandBrl,
  };
}

/**
 * @param {FixtureOptions} options
 * @returns {Promise<string>} the output folder
 */
async function buildFixture(options) {
  const rawDir = await writeRawDir(createRawFiles(options));
  const outDir = await createOutDir();
  await buildData({ rawDir, outDir });
  return outDir;
}

/**
 * @param {FixtureOptions} options
 * @returns {RawFiles}
 */
function createRawFiles(options) {
  const mesh = JSON.stringify(createGridMesh(options.municipalities));
  return {
    [CENSUS_SOURCE.file]: JSON.stringify(createCensusRows(options)),
    [GDP_SOURCE.file]: JSON.stringify(createGdpRows(options)),
    [REGION_SOURCE.file]: Buffer.from(createSeadeCsv(options), "latin1"),
    [GEOSEADE_SOURCE.file]: createGeoseadeBuffer(options),
    [MESH_SOURCES.minima.file]: mesh,
    [MESH_SOURCES.intermediaria.file]: mesh,
  };
}

/**
 * Creates a valid DBF buffer representing the Geoseade municipal limits data.
 * @param {FixtureOptions} options
 * @returns {Buffer}
 */
function createGeoseadeBuffer({ municipalities }) {
  const headerLen = 32 + 6 * 32 + 1;
  const recLen = 1 + 7 + 50 + 5 + 50 + 5 + 50;
  const buf = Buffer.alloc(headerLen + municipalities.length * recLen);
  buf.fill(0x20, headerLen);
  buf[0] = 0x03;
  buf.writeUInt32LE(municipalities.length, 4);
  buf.writeUInt16LE(headerLen, 8);
  buf.writeUInt16LE(recLen, 10);

  const fields = [
    { name: "Cod_ibge", len: 7 },
    { name: "Municipio", len: 50 },
    { name: "GID_RG", len: 5 },
    { name: "RG", len: 50 },
    { name: "GID_RA", len: 5 },
    { name: "RA", len: 50 },
  ];
  let off = 32;
  for (const f of fields) {
    buf.write(f.name, off, 11, "ascii");
    buf[off + 11] = 67;
    buf[off + 16] = f.len;
    off += 32;
  }
  buf[off] = 0x0d;

  let rOff = headerLen;
  for (const m of municipalities) {
    buf[rOff] = 0x20;
    rOff += 1;
    buf.write(m.code, rOff, "utf8");
    rOff += 7;
    buf.write(m.name, rOff, "utf8");
    rOff += 50;
    buf.write(String(m.gidRg), rOff, "utf8");
    rOff += 5;
    buf.write(m.governmentRegionName, rOff, "utf8");
    rOff += 50;
    buf.write(m.regionCode, rOff, "utf8");
    rOff += 5;
    buf.write(`RA ${m.regionCode}`, rOff, "utf8");
    rOff += 50;
  }

  return buf;
}

/**
 * @param {RawFiles} files
 * @returns {Promise<string>}
 */
async function writeRawDir(files) {
  const rawDir = await mkdtemp(path.join(workDir, "raw-"));
  /** @type {Record<string, { sha256: string, retrievedAt: string }>} */
  const checksums = {};
  for (const [file, content] of Object.entries(files)) {
    await writeFile(path.join(rawDir, file), content);
    checksums[file] = { sha256: sha256(content), retrievedAt: RETRIEVED_AT };
  }
  await writeFile(path.join(rawDir, CHECKSUMS_FILE), JSON.stringify(checksums, null, 2));
  return rawDir;
}

/** @returns {Promise<string>} */
async function createOutDir() {
  const outDir = path.join(await mkdtemp(path.join(workDir, "out-")), "data");
  await mkdir(outDir);
  return outDir;
}

/**
 * @param {string} outDir
 * @returns {Promise<Record<"mesh" | "municipalities" | "regions", any>>}
 */
async function readOutputs(outDir) {
  return {
    mesh: JSON.parse(await readFile(path.join(outDir, "mesh.topo.json"), "utf8")),
    municipalities: JSON.parse(await readFile(path.join(outDir, "municipalities.json"), "utf8")),
    regions: JSON.parse(await readFile(path.join(outDir, "regions.json"), "utf8")),
  };
}

/**
 * PUB-01: folders, user name and machine name of this machine, as is or escaped inside JSON.
 * @param {string} text
 * @returns {string[]}
 */
function findLocalTraces(text) {
  const traces = [workDir, tmpdir(), homedir(), userInfo().username, hostname()];
  return traces.filter(
    (trace) => text.includes(trace) || text.includes(JSON.stringify(trace).slice(1, -1)),
  );
}

/**
 * @param {string | Uint8Array} content
 * @returns {string}
 */
function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * @param {FixtureOptions} options
 * @returns {Record<string, string>[]}
 */
function createCensusRows({ municipalities, statePopulation }) {
  const stateRow = createSidraRow({
    level: "3",
    code: "35",
    name: "São Paulo",
    variable: "93",
    value: String(statePopulation),
    year: "2022",
  });
  const municipalRows = municipalities.flatMap((municipality) => {
    const base = {
      level: "6",
      code: municipality.code,
      name: `${municipality.name} - SP`,
      year: "2022",
    };
    return [
      createSidraRow({ ...base, variable: "93", value: String(municipality.population) }),
      createSidraRow({ ...base, variable: "6318", value: String(municipality.areaKm2) }),
      createSidraRow({ ...base, variable: "614", value: "1.5" }),
    ];
  });
  return [createSidraHeader(), stateRow, ...municipalRows];
}

/**
 * @param {FixtureOptions} options
 * @returns {Record<string, string>[]}
 */
function createGdpRows({ municipalities, secondaryNames }) {
  const stateRow = createSidraRow({
    level: "3",
    code: "35",
    name: "São Paulo",
    variable: "37",
    value: "1",
    year: "2023",
  });
  const municipalRows = municipalities.map((municipality, index) =>
    createSidraRow({
      level: "6",
      code: municipality.code,
      name: `${secondaryNames[index]} - SP`,
      variable: "37",
      value: formatSidraValue(municipality.gdpThousandBrl),
      year: "2023",
    }),
  );
  return [createSidraHeader(), stateRow, ...municipalRows];
}

/**
 * @param {number | null} value
 * @returns {string}
 */
function formatSidraValue(value) {
  if (value === null) {
    return "...";
  }
  return String(value);
}

/** @returns {Record<string, string>} */
function createSidraHeader() {
  return {
    NC: "Nível Territorial (Código)",
    NN: "Nível Territorial",
    V: "Valor",
    D1C: "Unidade da Federação e Município (Código)",
    D1N: "Unidade da Federação e Município",
    D2C: "Variável (Código)",
    D3C: "Ano (Código)",
  };
}

/**
 * @param {{ level: string, code: string, name: string, variable: string, value: string, year: string }} row
 * @returns {Record<string, string>}
 */
function createSidraRow({ level, code, name, variable, value, year }) {
  return { NC: level, NN: "Nível", V: value, D1C: code, D1N: name, D2C: variable, D3C: year };
}

/**
 * Latin-1 text, semicolons, decimal comma, a state row, the "unspecified" placeholder
 * and a double space in the label of region 1, like the real Seade file.
 * @param {FixtureOptions} options
 * @returns {string}
 */
function createSeadeCsv({ municipalities, secondaryNames }) {
  const header = "cod_ibge;municipio;area_km;cod_ra;ra;cod_rm;rm;cod_drs;drs;cod_r_saude;r_saude";
  const stateRow =
    "35;Estado de São Paulo;248219,48;;Estado de São Paulo;;Estado de São Paulo;;x;;x";
  const placeholderRow =
    "3500000;Sem especificação de município;;;Sem especificação de município;;x;;x;;x";
  const municipalRows = municipalities.map((municipality, index) => {
    const area = String(municipality.areaKm2).replace(".", ",");
    const label = createRegionLabel(municipality.regionCode);
    return `${municipality.code};${secondaryNames[index]};${area};${municipality.regionCode};${label};99;Demais municípios;5;DRS;35091;Saúde`;
  });
  return `${[header, stateRow, placeholderRow, ...municipalRows].join("\r\n")}\r\n`;
}

/**
 * @param {string} regionCode
 * @returns {string}
 */
function createRegionLabel(regionCode) {
  if (regionCode === "1") {
    return "RM  Região 1";
  }
  return `RA Região ${regionCode}`;
}

/**
 * A grid of 43 by 15 square cells, one per municipality, in the shape of the IBGE
 * TopoJSON: quantized, delta-encoded arcs and the code in properties.codarea.
 * @param {FixtureMunicipality[]} municipalities
 */
function createGridMesh(municipalities) {
  const horizontalArcs = Array.from({ length: (GRID_ROWS + 1) * GRID_COLUMNS }, (_, index) => [
    [(index % GRID_COLUMNS) * GRID_STEP, Math.floor(index / GRID_COLUMNS) * GRID_STEP],
    [GRID_STEP, 0],
  ]);
  const verticalArcs = Array.from({ length: GRID_ROWS * (GRID_COLUMNS + 1) }, (_, index) => [
    [(index % (GRID_COLUMNS + 1)) * GRID_STEP, Math.floor(index / (GRID_COLUMNS + 1)) * GRID_STEP],
    [0, GRID_STEP],
  ]);
  const geometries = municipalities.map((municipality, index) => ({
    type: "Polygon",
    arcs: [createCellRing(Math.floor(index / GRID_COLUMNS), index % GRID_COLUMNS)],
    properties: { codarea: municipality.code },
  }));
  return {
    type: "Topology",
    arcs: [...horizontalArcs, ...verticalArcs],
    transform: { scale: [0.01, 0.01], translate: [-53, -25] },
    objects: { UF35MU: { type: "GeometryCollection", geometries } },
  };
}

/**
 * @param {number} row
 * @param {number} column
 * @returns {number[]}
 */
function createCellRing(row, column) {
  const horizontal = (/** @type {number} */ r, /** @type {number} */ c) => r * GRID_COLUMNS + c;
  const vertical = (/** @type {number} */ r, /** @type {number} */ c) =>
    (GRID_ROWS + 1) * GRID_COLUMNS + r * (GRID_COLUMNS + 1) + c;
  return [
    horizontal(row, column),
    vertical(row, column + 1),
    reversed(horizontal(row + 1, column)),
    reversed(vertical(row, column)),
  ];
}

/**
 * @param {number} arcIndex
 * @returns {number}
 */
function reversed(arcIndex) {
  return -arcIndex - 1;
}

test("DAD-03 PUB-08 distributed gzip mesh reconstructs the exact intermediate topology", async () => {
  const compressed = await readFile(new URL("../../data/mesh.topo.json.gz", import.meta.url));
  const source = await readFile(new URL("../../data/mesh.topo.json", import.meta.url));
  assert.deepEqual(gunzipSync(compressed), source);
});
