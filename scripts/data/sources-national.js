/**
 * Catalog of national sources for all 27 Brazilian federative units (UFs):
 * URLs of IBGE APIs for mesh, hierarchy, Census 2022 (population and area)
 * and GDP 2023.
 *
 * @typedef {Object} RawSource
 * @property {string} file Name of the downloaded file in scripts/data/raw/.
 * @property {string} url Upstream endpoint downloaded by fetch-national.mjs.
 * @property {string} source Human-readable description (pt-BR).
 * @property {number} year Reference year of the data.
 * @property {string} credit Official citation requested by the source.
 * @property {string} licenseCondition Permitted license condition.
 * @property {string} [licenseNotice] Mandatory notice for derived products.
 *
 * @typedef {Object} UfInfo
 * @property {string} code Two-digit IBGE state code (e.g. "35").
 * @property {string} sigla Two-letter state abbreviation (e.g. "SP").
 * @property {string} name State name in Portuguese (e.g. "São Paulo").
 * @property {string} regionCode IBGE macro-region code (1 to 5).
 * @property {string} regionName IBGE macro-region name in Portuguese.
 */

import { LICENSE_CONDITIONS, MESH_LICENSE_NOTICE } from "./sources.js";

export const MESH_YEAR = 2022;
export const CENSUS_YEAR = 2022;
export const GDP_YEAR = 2023;

export const DEFAULT_MESH_QUALITY = "intermediaria";
export const MESH_QUALITIES = Object.freeze(["minima", "intermediaria"]);

/**
 * Validated IBGE API URLs for national coverage.
 */
export const BRAZIL_UFS_MESH_URL =
  "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/json&qualidade=intermediaria&intrarregiao=UF&periodo=2022";

export const UF_MESH_URL_TEMPLATE =
  "https://servicodados.ibge.gov.br/api/v3/malhas/estados/{UF}?formato=application/json&qualidade=intermediaria&intrarregiao=municipio&periodo=2022";

export const HIERARCHY_NIVELADO_URL =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado";

export const CENSUS_2022_NATIONAL_URL =
  "https://apisidra.ibge.gov.br/values/t/4714/n6/all/v/93,6318/p/2022";

export const GDP_2023_NATIONAL_URL =
  "https://apisidra.ibge.gov.br/values/t/5938/n6/all/v/37/p/2023";

/** Raw file names in scripts/data/raw/ */
export const BRAZIL_UFS_MESH_FILE = "ibge-malha-brasil-ufs.topo.json";
export const HIERARCHY_FILE = "ibge-municipios-nivelado.json";
export const CENSUS_NATIONAL_FILE = "sidra-4714-nacional.json";
export const GDP_NATIONAL_FILE = "sidra-5938-nacional.json";

/**
 * Catalog of all 27 Brazilian Federative Units sorted by IBGE code.
 * @type {readonly UfInfo[]}
 */
export const UF_CATALOG = Object.freeze([
  { code: "11", sigla: "RO", name: "Rondônia", regionCode: "1", regionName: "Norte" },
  { code: "12", sigla: "AC", name: "Acre", regionCode: "1", regionName: "Norte" },
  { code: "13", sigla: "AM", name: "Amazonas", regionCode: "1", regionName: "Norte" },
  { code: "14", sigla: "RR", name: "Roraima", regionCode: "1", regionName: "Norte" },
  { code: "15", sigla: "PA", name: "Pará", regionCode: "1", regionName: "Norte" },
  { code: "16", sigla: "AP", name: "Amapá", regionCode: "1", regionName: "Norte" },
  { code: "17", sigla: "TO", name: "Tocantins", regionCode: "1", regionName: "Norte" },
  { code: "21", sigla: "MA", name: "Maranhão", regionCode: "2", regionName: "Nordeste" },
  { code: "22", sigla: "PI", name: "Piauí", regionCode: "2", regionName: "Nordeste" },
  { code: "23", sigla: "CE", name: "Ceará", regionCode: "2", regionName: "Nordeste" },
  { code: "24", sigla: "RN", name: "Rio Grande do Norte", regionCode: "2", regionName: "Nordeste" },
  { code: "25", sigla: "PB", name: "Paraíba", regionCode: "2", regionName: "Nordeste" },
  { code: "26", sigla: "PE", name: "Pernambuco", regionCode: "2", regionName: "Nordeste" },
  { code: "27", sigla: "AL", name: "Alagoas", regionCode: "2", regionName: "Nordeste" },
  { code: "28", sigla: "SE", name: "Sergipe", regionCode: "2", regionName: "Nordeste" },
  { code: "29", sigla: "BA", name: "Bahia", regionCode: "2", regionName: "Nordeste" },
  { code: "31", sigla: "MG", name: "Minas Gerais", regionCode: "3", regionName: "Sudeste" },
  { code: "32", sigla: "ES", name: "Espírito Santo", regionCode: "3", regionName: "Sudeste" },
  { code: "33", sigla: "RJ", name: "Rio de Janeiro", regionCode: "3", regionName: "Sudeste" },
  { code: "35", sigla: "SP", name: "São Paulo", regionCode: "3", regionName: "Sudeste" },
  { code: "41", sigla: "PR", name: "Paraná", regionCode: "4", regionName: "Sul" },
  { code: "42", sigla: "SC", name: "Santa Catarina", regionCode: "4", regionName: "Sul" },
  { code: "43", sigla: "RS", name: "Rio Grande do Sul", regionCode: "4", regionName: "Sul" },
  {
    code: "50",
    sigla: "MS",
    name: "Mato Grosso do Sul",
    regionCode: "5",
    regionName: "Centro-Oeste",
  },
  { code: "51", sigla: "MT", name: "Mato Grosso", regionCode: "5", regionName: "Centro-Oeste" },
  { code: "52", sigla: "GO", name: "Goiás", regionCode: "5", regionName: "Centro-Oeste" },
  {
    code: "53",
    sigla: "DF",
    name: "Distrito Federal",
    regionCode: "5",
    regionName: "Centro-Oeste",
  },
]);

/**
 * Finds UF info by 2-digit code or 2-letter sigla (case-insensitive).
 * @param {string} codeOrSigla
 * @returns {UfInfo | undefined}
 */
export function findUf(codeOrSigla) {
  const normalized = String(codeOrSigla).trim().toUpperCase();
  return UF_CATALOG.find((uf) => uf.code === normalized || uf.sigla === normalized);
}

/**
 * Builds the URL to download a given UF mesh from IBGE.
 * @param {string} uf Code or sigla of the UF.
 * @param {string} [quality="intermediaria"]
 * @returns {string}
 */
export function getUfMeshUrl(uf, quality = DEFAULT_MESH_QUALITY) {
  const info = findUf(uf);
  let identifier = String(uf).trim();
  if (info) {
    identifier = info.code;
  }
  return `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${identifier}?formato=application/json&qualidade=${quality}&intrarregiao=municipio&periodo=${MESH_YEAR}`;
}

/**
 * File name for state mesh raw file.
 * @param {string} uf Code or sigla of the UF.
 * @param {string} [quality="intermediaria"]
 * @returns {string}
 */
export function getUfMeshFileName(uf, quality = DEFAULT_MESH_QUALITY) {
  const info = findUf(uf);
  let identifier = String(uf).trim();
  if (info) {
    identifier = info.code;
  }
  return `ibge-malha-${identifier}-${quality}.topo.json`;
}

/**
 * Creates a RawSource object for a given UF's municipal mesh.
 * @param {string} uf
 * @param {string} [quality="intermediaria"]
 * @returns {Readonly<RawSource>}
 */
export function createUfMeshSource(uf, quality = DEFAULT_MESH_QUALITY) {
  const info = findUf(uf);
  let name = `UF ${uf}`;
  if (info) {
    name = `${info.name} (${info.sigla})`;
  }
  return Object.freeze({
    file: getUfMeshFileName(uf, quality),
    url: getUfMeshUrl(uf, quality),
    source: `IBGE, Malha Municipal ${MESH_YEAR}, ${name}, API v3, qualidade ${quality}`,
    year: MESH_YEAR,
    credit: `IBGE, Malha Municipal, ${MESH_YEAR}`,
    licenseCondition: LICENSE_CONDITIONS.ibgeMesh,
    licenseNotice: MESH_LICENSE_NOTICE,
  });
}

/** @type {Readonly<RawSource>} */
export const BRAZIL_UFS_MESH_SOURCE = Object.freeze({
  file: BRAZIL_UFS_MESH_FILE,
  url: BRAZIL_UFS_MESH_URL,
  source: `IBGE, Malha de Unidades Federativas ${MESH_YEAR}, API de malhas v3, qualidade intermediaria`,
  year: MESH_YEAR,
  credit: `IBGE, Malhas Digitais, ${MESH_YEAR}`,
  licenseCondition: LICENSE_CONDITIONS.ibgeMesh,
  licenseNotice: MESH_LICENSE_NOTICE,
});

/** @type {Readonly<RawSource>} */
export const HIERARCHY_SOURCE = Object.freeze({
  file: HIERARCHY_FILE,
  url: HIERARCHY_NIVELADO_URL,
  source: "IBGE, Estrutura Territorial e Hierarquia de Municípios, API de Localidades",
  year: MESH_YEAR,
  credit: "IBGE, Divisão Territorial Brasileira",
  licenseCondition: LICENSE_CONDITIONS.ibgeMesh,
});

/** @type {Readonly<RawSource>} */
export const CENSUS_NATIONAL_SOURCE = Object.freeze({
  file: CENSUS_NATIONAL_FILE,
  url: CENSUS_2022_NATIONAL_URL,
  source: "IBGE, Censo Demográfico 2022, tabela SIDRA 4714 (Brasil)",
  year: CENSUS_YEAR,
  credit: "IBGE, SIDRA, tabela 4714, 2022",
  licenseCondition: LICENSE_CONDITIONS.ibgeSidra,
});

/** @type {Readonly<RawSource>} */
export const GDP_NATIONAL_SOURCE = Object.freeze({
  file: GDP_NATIONAL_FILE,
  url: GDP_2023_NATIONAL_URL,
  source: "IBGE, Produto Interno Bruto dos Municípios 2023, tabela SIDRA 5938 (Brasil)",
  year: GDP_YEAR,
  credit: "IBGE, SIDRA, tabela 5938, 2023",
  licenseCondition: LICENSE_CONDITIONS.ibgeSidra,
});

/**
 * The 4 core national sources required to build national overview datasets.
 * @type {readonly Readonly<RawSource>[]}
 */
export const NATIONAL_CORE_SOURCES = Object.freeze([
  BRAZIL_UFS_MESH_SOURCE,
  HIERARCHY_SOURCE,
  CENSUS_NATIONAL_SOURCE,
  GDP_NATIONAL_SOURCE,
]);
