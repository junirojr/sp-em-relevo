import { formatAbbreviated, formatValue } from "./format.js";

export const DEFAULT_INDICATOR_ID = "population";

/**
 * @typedef {{ type: "sum", field: string }} SumAggregation
 * @typedef {{ type: "ratio", numerator: string, numeratorScale: number, denominator: string }} RatioAggregation
 * @typedef {SumAggregation | RatioAggregation} Aggregation
 */

/**
 * @typedef {Object} IndicatorDefinition
 * @property {string} id
 * @property {string} label
 * @property {string} unit
 * @property {string} year
 * @property {string} yearDescription
 * @property {string} source
 * @property {string} sourceUrl
 * @property {Aggregation} aggregation
 * @property {(value: number | null | undefined) => string} format
 * @property {(value: number | null | undefined) => string} formatAbbreviated
 * @property {(m: { population: number | null; areaKm2: number | null; gdpThousandBrl: number | null }) => number | null} computeValue
 */

/**
 * @type {Record<string, IndicatorDefinition>}
 */
export const INDICATORS = {
  population: {
    id: "population",
    label: "População",
    unit: "habitantes",
    year: "2022",
    yearDescription: "Censo 2022",
    source: "IBGE, Censo Demográfico",
    sourceUrl: "https://sidra.ibge.gov.br/tabela/4714",
    aggregation: {
      type: "sum",
      field: "population",
    },
    format: (value) => formatValue(value, "population"),
    formatAbbreviated: (value) => formatAbbreviated(value, "population"),
    computeValue: (m) => m.population,
  },
  area: {
    id: "area",
    label: "Área",
    unit: "km²",
    year: "2022",
    yearDescription: "2022",
    source: "IBGE, Censo Demográfico",
    sourceUrl: "https://sidra.ibge.gov.br/tabela/4714",
    aggregation: {
      type: "sum",
      field: "areaKm2",
    },
    format: (value) => formatValue(value, "area"),
    formatAbbreviated: (value) => formatAbbreviated(value, "area"),
    computeValue: (m) => m.areaKm2,
  },
  density: {
    id: "density",
    label: "Densidade demográfica",
    unit: "hab./km²",
    year: "2022",
    yearDescription: "2022",
    source: "IBGE, Censo Demográfico",
    sourceUrl: "https://sidra.ibge.gov.br/tabela/4714",
    aggregation: {
      type: "ratio",
      numerator: "population",
      numeratorScale: 1,
      denominator: "areaKm2",
    },
    format: (value) => formatValue(value, "density"),
    formatAbbreviated: (value) => formatAbbreviated(value, "density"),
    computeValue: (m) => {
      if (m.population === null || m.areaKm2 === null) {
        return null;
      }
      if (m.areaKm2 === 0) {
        return null;
      }
      return m.population / m.areaKm2;
    },
  },
  gdpPerCapita: {
    id: "gdpPerCapita",
    label: "PIB per capita",
    unit: "R$",
    year: "2023 / 2022",
    yearDescription: "PIB 2023 / população 2022",
    source: "IBGE, Produto Interno Bruto dos Municípios e Censo Demográfico",
    sourceUrl: "https://sidra.ibge.gov.br/tabela/5938",
    aggregation: {
      type: "ratio",
      numerator: "gdpThousandBrl",
      numeratorScale: 1000,
      denominator: "population",
    },
    format: (value) => formatValue(value, "gdpPerCapita"),
    formatAbbreviated: (value) => formatAbbreviated(value, "gdpPerCapita"),
    computeValue: (m) => {
      if (m.gdpThousandBrl === null || m.population === null) {
        return null;
      }
      if (m.population === 0) {
        return null;
      }
      return (m.gdpThousandBrl * 1000) / m.population;
    },
  },
};

/**
 * @param {string | null | undefined} id
 * @returns {IndicatorDefinition}
 */
export function findIndicator(id) {
  if (id && Object.hasOwn(INDICATORS, id)) {
    return INDICATORS[id];
  }
  return INDICATORS[DEFAULT_INDICATOR_ID];
}

/**
 * @param {IndicatorDefinition} indicator
 * @param {Array<{ population: number | null; areaKm2: number | null; gdpThousandBrl: number | null }>} municipalities
 * @returns {Float64Array}
 */
export function computeIndicatorValues(indicator, municipalities) {
  const result = new Float64Array(municipalities.length);

  for (let index = 0; index < municipalities.length; index += 1) {
    const rawVal = indicator.computeValue(municipalities[index]);
    if (rawVal === null || rawVal === undefined || Number.isNaN(rawVal)) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = rawVal;
  }

  return result;
}
