import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRAZIL_UFS_MESH_SOURCE,
  BRAZIL_UFS_MESH_URL,
  CENSUS_2022_NATIONAL_URL,
  CENSUS_NATIONAL_SOURCE,
  createUfMeshSource,
  DEFAULT_MESH_QUALITY,
  findUf,
  GDP_2023_NATIONAL_URL,
  GDP_NATIONAL_SOURCE,
  getUfMeshFileName,
  getUfMeshUrl,
  HIERARCHY_NIVELADO_URL,
  HIERARCHY_SOURCE,
  NATIONAL_CORE_SOURCES,
  UF_CATALOG,
  UF_MESH_URL_TEMPLATE,
} from "./sources-national.js";

test("sources-national: validated IBGE API endpoints match exact requirements", () => {
  assert.equal(
    BRAZIL_UFS_MESH_URL,
    "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/json&qualidade=intermediaria&intrarregiao=UF&periodo=2022",
  );
  assert.equal(
    UF_MESH_URL_TEMPLATE,
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/{UF}?formato=application/json&qualidade=intermediaria&intrarregiao=municipio&periodo=2022",
  );
  assert.equal(
    HIERARCHY_NIVELADO_URL,
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado",
  );
  assert.equal(
    CENSUS_2022_NATIONAL_URL,
    "https://apisidra.ibge.gov.br/values/t/4714/n6/all/v/93,6318/p/2022",
  );
  assert.equal(
    GDP_2023_NATIONAL_URL,
    "https://apisidra.ibge.gov.br/values/t/5938/n6/all/v/37/p/2023",
  );
  assert.equal(DEFAULT_MESH_QUALITY, "intermediaria");
});

test("sources-national: UF_CATALOG contains all 27 Brazilian UFs with valid properties", () => {
  assert.equal(UF_CATALOG.length, 27);

  const codes = new Set(UF_CATALOG.map((u) => u.code));
  const siglas = new Set(UF_CATALOG.map((u) => u.sigla));

  assert.equal(codes.size, 27);
  assert.equal(siglas.size, 27);

  for (const uf of UF_CATALOG) {
    assert.match(uf.code, /^\d{2}$/);
    assert.match(uf.sigla, /^[A-Z]{2}$/);
    assert.ok(uf.name.length > 0);
    assert.match(uf.regionCode, /^[1-5]$/);
    assert.ok(uf.regionName.length > 0);
  }
});

test("sources-national: findUf resolves case-insensitively by code or sigla", () => {
  const byCode = findUf("35");
  assert.ok(byCode);
  if (byCode) {
    assert.equal(byCode.sigla, "SP");
    assert.equal(byCode.name, "São Paulo");
  }

  const bySiglaLower = findUf("sp");
  assert.ok(bySiglaLower);
  if (bySiglaLower) {
    assert.equal(bySiglaLower.code, "35");
  }

  const bySiglaUpper = findUf("RJ");
  assert.ok(bySiglaUpper);
  if (bySiglaUpper) {
    assert.equal(bySiglaUpper.code, "33");
  }

  const unknown = findUf("XX");
  assert.equal(unknown, undefined);
});

test("sources-national: getUfMeshUrl and getUfMeshFileName produce standardized paths", () => {
  const url35 = getUfMeshUrl("35");
  assert.equal(
    url35,
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/35?formato=application/json&qualidade=intermediaria&intrarregiao=municipio&periodo=2022",
  );

  const urlSp = getUfMeshUrl("SP", "minima");
  assert.equal(
    urlSp,
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/35?formato=application/json&qualidade=minima&intrarregiao=municipio&periodo=2022",
  );

  const file35 = getUfMeshFileName("35");
  assert.equal(file35, "ibge-malha-35-intermediaria.topo.json");

  const fileSpMin = getUfMeshFileName("sp", "minima");
  assert.equal(fileSpMin, "ibge-malha-35-minima.topo.json");
});

test("sources-national: createUfMeshSource populates full metadata", () => {
  const source = createUfMeshSource("35");
  assert.equal(source.file, "ibge-malha-35-intermediaria.topo.json");
  assert.equal(source.year, 2022);
  assert.ok(source.source.includes("São Paulo"));
  assert.ok(source.licenseCondition.length > 0);
  assert.ok(source.licenseNotice);
});

test("sources-national: NATIONAL_CORE_SOURCES contains the 4 required base files", () => {
  assert.equal(NATIONAL_CORE_SOURCES.length, 4);
  const files = NATIONAL_CORE_SOURCES.map((s) => s.file);
  assert.ok(files.includes(BRAZIL_UFS_MESH_SOURCE.file));
  assert.ok(files.includes(HIERARCHY_SOURCE.file));
  assert.ok(files.includes(CENSUS_NATIONAL_SOURCE.file));
  assert.ok(files.includes(GDP_NATIONAL_SOURCE.file));
});
