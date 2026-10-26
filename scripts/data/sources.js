/**
 * Catalog of the raw sources behind data/: where each one is downloaded from, the file it is
 * stored as under scripts/data/raw/, its reference year and the credit the source asks for.
 *
 * @typedef {Object} RawSource
 * @property {string} file Name of the downloaded file, relative to scripts/data/raw/.
 * @property {string} url Exact address downloaded by fetch-sources.mjs.
 * @property {string} source Human readable description of the source (pt-BR).
 * @property {number} year Reference year of the data.
 * @property {string} credit Citation the source asks for: source and year (pt-BR).
 * @property {string} licenseCondition One value of LICENSE_CONDITIONS.
 * @property {string} [licenseNotice] Warning the license obliges to give the end user (pt-BR).
 */

export const STATE_CODE = "35";
export const STATE_LEVEL = "3";
export const MUNICIPALITY_LEVEL = "6";

/** SIDRA variables used by the build. */
export const SIDRA_VARIABLES = Object.freeze({
  population: "93",
  areaKm2: "6318",
  density: "614",
  gdpThousandBrl: "37",
});

export const MESH_QUALITIES = Object.freeze(["minima", "intermediaria"]);
export const DEFAULT_MESH_QUALITY = "intermediaria";
export const MESH_YEAR = 2022;

/**
 * Closed vocabulary of license conditions, one per kind of source, as settled in the license
 * gate (docs/plano/licenca-dados.md). The text goes verbatim into meta.license.condition. A
 * value never holds "; ", which is how build-data.mjs joins the conditions of one file.
 */
export const LICENSE_CONDITIONS = Object.freeze({
  ibgeMesh: "Licença compatível com Creative Commons BY 4.0, com crédito ao IBGE",
  ibgeSidra: "Dado aberto do IBGE no SIDRA, com crédito obrigatório",
  seadeDerived:
    "Dado derivado da Fundação Seade, redistribuído com citação da fonte e sem o arquivo bruto",
  geoseade: "Dado público da Fundação Seade (Geoseade), com limites municipais IGC-SP",
  ccBy4: "CC-BY-4.0",
  ccBy: "CC-BY",
  tseOpenData: "TSE-Dados-Abertos",
});

/** The IBGE mesh license obliges the project to tell the end user about the processing. */
export const MESH_LICENSE_NOTICE =
  "Malha processada por este projeto, com projeção e quantização, e diferente da original. Os limites são aproximados e não oficiais.";

export const CHECKSUMS_FILE = "checksums.json";

const SIDRA_API = "https://apisidra.ibge.gov.br/values";
const MESH_API = "https://servicodados.ibge.gov.br/api/v3/malhas/estados";
const STATE_AND_MUNICIPALITIES = `n3/${STATE_CODE}/n6/in%20n3%20${STATE_CODE}`;
const CENSUS_VARIABLES = [
  SIDRA_VARIABLES.population,
  SIDRA_VARIABLES.areaKm2,
  SIDRA_VARIABLES.density,
].join(",");

/** @type {Readonly<RawSource>} */
export const CENSUS_SOURCE = Object.freeze({
  file: "sidra-4714.json",
  url: `${SIDRA_API}/t/4714/${STATE_AND_MUNICIPALITIES}/v/${CENSUS_VARIABLES}/p/2022`,
  source: "IBGE, Censo Demográfico 2022, tabela SIDRA 4714",
  year: 2022,
  credit: "IBGE, SIDRA, tabela 4714, 2022",
  licenseCondition: LICENSE_CONDITIONS.ibgeSidra,
});

/** @type {Readonly<RawSource>} */
export const GDP_SOURCE = Object.freeze({
  file: "sidra-5938.json",
  url: `${SIDRA_API}/t/5938/${STATE_AND_MUNICIPALITIES}/v/${SIDRA_VARIABLES.gdpThousandBrl}/p/2023`,
  source: "IBGE, Produto Interno Bruto dos Municípios 2023, tabela SIDRA 5938",
  year: 2023,
  credit:
    "IBGE, SIDRA, tabela 5938, 2023, em parceria com os Órgãos Estaduais de Estatística, Secretarias Estaduais de Governo e Superintendência da Zona Franca de Manaus - SUFRAMA",
  licenseCondition: LICENSE_CONDITIONS.ibgeSidra,
});

/**
 * Year: the regional division as last published by Seade (resource modified on 2026-05-04).
 * @type {Readonly<RawSource>}
 */
export const REGION_SOURCE = Object.freeze({
  file: "seade-codigos-municipios-regioes.csv",
  url: "https://repositorio.seade.gov.br/dataset/1617c335-f5ab-426c-b175-280d4e41ec1c/resource/1871ac05-7b7f-4c13-9b4a-23c7d41fd988/download/codigos_municipios_regioes.csv",
  source: "Fundação Seade, códigos de municípios e regiões do Estado de São Paulo",
  year: 2026,
  credit: "Fundação Seade, Municípios do Estado de SP, 2026",
  licenseCondition: LICENSE_CONDITIONS.seadeDerived,
});

/**
 * Geoseade municipal limits layer, providing government region (43 RGs) mappings.
 * @type {Readonly<RawSource>}
 */
export const GEOSEADE_SOURCE = Object.freeze({
  file: "limite_municipal.zip",
  url: "https://repositorio.seade.gov.br/dataset/1866da41-fab1-42f1-a5eb-a435a41255ce/resource/1b9212ca-4786-4541-8a38-f66db106d3bf/download/limite_municipal.zip",
  source: "Fundação Seade, Geoseade, Limites e Regiões, camada Limite Municipal",
  year: 2022,
  credit: "Fundação Seade, Geoseade, 2022, limites municipais IGC-SP",
  licenseCondition: LICENSE_CONDITIONS.geoseade,
});

/** @type {Readonly<Record<string, Readonly<RawSource>>>} */
export const MESH_SOURCES = Object.freeze({
  minima: createMeshSource("minima"),
  intermediaria: createMeshSource("intermediaria"),
});

/** Every raw file fetch-sources.mjs downloads, in download order. */
export const RAW_SOURCES = Object.freeze([
  CENSUS_SOURCE,
  GDP_SOURCE,
  REGION_SOURCE,
  GEOSEADE_SOURCE,
  MESH_SOURCES.minima,
  MESH_SOURCES.intermediaria,
]);

/**
 * @param {string} quality IBGE mesh quality: "minima" or "intermediaria".
 * @returns {Readonly<RawSource>}
 */
function createMeshSource(quality) {
  const query = `formato=application/json&qualidade=${quality}&intrarregiao=municipio&periodo=${MESH_YEAR}`;
  return Object.freeze({
    file: `ibge-malha-${STATE_CODE}-${quality}.topo.json`,
    url: `${MESH_API}/${STATE_CODE}?${query}`,
    source: `IBGE, Malha Municipal ${MESH_YEAR}, API de malhas v3, qualidade ${quality}`,
    year: MESH_YEAR,
    credit: `IBGE, Malha Municipal, ${MESH_YEAR}`,
    licenseCondition: LICENSE_CONDITIONS.ibgeMesh,
    licenseNotice: MESH_LICENSE_NOTICE,
  });
}
