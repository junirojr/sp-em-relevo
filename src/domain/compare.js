import { aggregateIndicator } from "./aggregation.js";
import { classify, computeBreaks } from "./classification.js";
import { INDICATORS } from "./indicator.js";
import { memoizeLast } from "./memo.js";
import { buildPanelUnits } from "./selection.js";

/**
 * Side by side comparison of exactly two selection units. Follows SEL-11, SEL-12 and SEL-13.
 *
 * @typedef {import("./selection.js").PanelUnit} PanelUnit
 * @typedef {import("./territory.js").TerritoryIndex} TerritoryIndex
 * @typedef {import("./territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("./indicator.js").IndicatorDefinition} IndicatorDefinition
 * @typedef {import("./classification.js").TerritorialLevel | "governmentRegion"} TerritorialLevel
 *
 * @typedef {[PanelUnit, PanelUnit]} ComparedPair the first panel row is A, the second is B.
 *
 * @typedef {{
 *   records: MunicipalityRecord[],
 *   territory: TerritoryIndex,
 *   indicator: IndicatorDefinition,
 *   isDemoActive: boolean,
 *   level: TerritorialLevel
 * }} CompareContext
 *   `records` are the active ones: with the demo on they carry the synthetic value and
 *   `indicator` is the synthetic one.
 *
 * @typedef {{
 *   unit: PanelUnit,
 *   rankLabel: string,
 *   contextLabel: string,
 *   bandIndex: number,
 *   valueLabel: string
 * }} CompareSide
 *   `bandIndex` is the band of the active legend, 0 to 6, or NO_BAND without a value.
 *
 * @typedef {{ value: number | null, text: string }} CompareValue
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   unitLabel: string,
 *   values: [CompareValue, CompareValue],
 *   shareOfFirst: number | null,
 *   difference: string
 * }} CompareMetric
 *   `unitLabel` is empty when the formatted values already carry the unit. `shareOfFirst` is the
 *   percent of the first value in the sum of both, or null when it cannot be split.
 *
 * @typedef {{
 *   pairKey: string,
 *   title: string,
 *   countLabel: string,
 *   sides: [CompareSide, CompareSide],
 *   metrics: CompareMetric[]
 * }} CompareModel
 *
 * @typedef {{ code: string, name: string, value: number | null }} StandingEntry
 * @typedef {{ name: string, value: number | null }} NamedValue
 * @typedef {{ name: string, value: number }} MeasuredValue
 *
 * @typedef {{
 *   recordsByCode: Map<string, MunicipalityRecord>,
 *   municipalities: StandingEntry[],
 *   regions: StandingEntry[],
 *   breaks: number[]
 * }} Standings
 */

export const NO_BAND = -1;

const COMPARED_INDICATOR_IDS = ["population", "density", "gdpPerCapita", "area"];
const MISSING_VALUE_TEXT = "Sem dado";
const MISSING_DIFFERENCE_TEXT = "Sem dado";
const EQUAL_DIFFERENCE_TEXT = "Iguais";
const MISSING_POSITION_TEXT = "Sem posição";
const MUNICIPALITY_TITLE = "Comparativo de Municípios";
const REGION_TITLE = "Comparativo de Regiões";
const MIXED_TITLE = "Comparativo";

// Both sides of a pair, and every line of the search window, describe a unit against the same
// context, so the standings of the whole state are built once for it.
const readStandings = memoizeLast(buildStandings);

/**
 * The comparison the stage shows for the selection, or null unless it has exactly two units.
 *
 * @param {readonly string[]} selectedCodes
 * @param {CompareContext} context
 * @returns {CompareModel | null}
 */
export function readSelectionComparison(selectedCodes, context) {
  const pair = readComparedPair(selectedCodes, context.territory, context.level);
  if (pair === null) {
    return null;
  }
  return buildCompareModel(pair, context);
}

/**
 * The two units to compare: exactly two panel rows, a whole region counting as one (R13).
 *
 * @param {readonly string[]} selectedCodes
 * @param {TerritoryIndex} territory
 * @param {string} [level]
 * @returns {ComparedPair | null} null with 0, 1, 3 or more units.
 */
export function readComparedPair(selectedCodes, territory, level = "region") {
  const units = buildPanelUnits([...selectedCodes], territory, level);
  if (units.length !== 2) {
    return null;
  }
  return [units[0], units[1]];
}

/**
 * Builds the comparison of A and B. Every value comes from the domain aggregation over the
 * municipalities of each unit.
 *
 * @param {ComparedPair} pair
 * @param {CompareContext} context
 * @returns {CompareModel}
 */
export function buildCompareModel(pair, context) {
  const { recordsByCode } = readStandings(context);
  const [first, second] = pair;
  return {
    pairKey: `${readUnitKey(first)}|${readUnitKey(second)}`,
    title: readCompareTitle(pair),
    countLabel: `${pair.length} selecionados`,
    sides: [describeCompareSide(first, context), describeCompareSide(second, context)],
    metrics: readComparedIndicators(context).map((indicator) =>
      buildMetric(indicator, pair, recordsByCode),
    ),
  };
}

/**
 * One side of a comparison: the unit with its state position, context, band and value. They depend
 * on the unit and the context only, never on the other side, so the search window describes each
 * of its lines with the same rule.
 *
 * @param {PanelUnit} unit
 * @param {CompareContext} context
 * @returns {CompareSide}
 */
export function describeCompareSide(unit, context) {
  const standings = readStandings(context);
  const value = readAggregateValue(
    context.indicator,
    readUnitRecords(unit.codes, standings.recordsByCode),
  );
  const target = { code: unit.code, name: unit.name, value };
  return {
    unit,
    rankLabel: formatStatePosition(readStatePosition(readEntriesOfKind(unit, standings), target)),
    contextLabel: readContextLabel(unit, context.territory),
    bandIndex: readBandIndex(value, standings.breaks),
    valueLabel: formatWithUnit(context.indicator, value),
  };
}

/**
 * The same comparison with A and B in swapped places. Differences name the larger unit, so they
 * stay as they are.
 *
 * @param {CompareModel} model
 * @returns {CompareModel}
 */
export function swapCompareSides(model) {
  return {
    ...model,
    sides: [model.sides[1], model.sides[0]],
    metrics: model.metrics.map(swapMetricValues),
  };
}

/**
 * Relative difference "+N,N% <larger name>", or "Iguais", or "Sem dado" when a value is missing
 * or the smaller one is not positive.
 *
 * @param {NamedValue} first
 * @param {NamedValue} second
 * @returns {string}
 */
export function describeDifference(first, second) {
  const firstValue = first.value;
  const secondValue = second.value;
  const hasBothValues = isFiniteNumber(firstValue) && isFiniteNumber(secondValue);
  if (!hasBothValues) {
    return MISSING_DIFFERENCE_TEXT;
  }
  if (firstValue === secondValue) {
    return EQUAL_DIFFERENCE_TEXT;
  }

  const { larger, smaller } = orderByValue(
    { name: first.name, value: firstValue },
    { name: second.name, value: secondValue },
  );
  if (smaller.value <= 0) {
    return MISSING_DIFFERENCE_TEXT;
  }

  const percent = (larger.value / smaller.value - 1) * 100;
  return `+${formatOneDecimal(percent)}% ${larger.name}`;
}

/**
 * The value formatted by its indicator, with the unit when the format does not carry it.
 *
 * @param {IndicatorDefinition} indicator
 * @param {number | null} value
 * @returns {string}
 */
export function formatWithUnit(indicator, value) {
  if (!isFiniteNumber(value)) {
    return MISSING_VALUE_TEXT;
  }
  const text = indicator.format(value);
  if (text.includes(indicator.unit)) {
    return text;
  }
  return `${text} ${indicator.unit}`;
}

/**
 * @param {CompareContext} context
 * @returns {Standings}
 */
function buildStandings(context) {
  const recordsByCode = new Map(context.records.map((record) => [record.code, record]));
  const municipalities = context.records.map((record) => ({
    code: record.code,
    name: record.name,
    value: readAggregateValue(context.indicator, [record]),
  }));
  const regions = context.territory.regions().map((region) => ({
    code: region.code,
    name: region.label,
    value: readAggregateValue(
      context.indicator,
      readUnitRecords(readRegionCodes(context.territory, region.code), recordsByCode),
    ),
  }));
  const governmentRegions = readGovernmentRegionStandings(context, recordsByCode);
  return {
    recordsByCode,
    municipalities,
    regions,
    governmentRegions,
    breaks: computeLegendBreaks(context.level, municipalities, regions, governmentRegions),
  };
}

/**
 * The breaks of the active legend, built from the same values the map classifies.
 *
 * @param {TerritorialLevel} level
 * @param {StandingEntry[]} municipalities
 * @param {StandingEntry[]} regions
 * @param {StandingEntry[]} [governmentRegions]
 * @returns {number[]}
 */
function computeLegendBreaks(level, municipalities, regions, governmentRegions = []) {
  if (level === "region") {
    return computeBreaks(readDistinctPositiveValues(regions), "region");
  }
  if (level === "governmentRegion") {
    return computeBreaks(readDistinctPositiveValues(governmentRegions), "municipality");
  }
  return computeBreaks(
    municipalities.map((entry) => entry.value),
    "municipality",
  );
}

/**
 * @param {CompareContext} context
 * @param {Map<string, MunicipalityRecord>} recordsByCode
 * @returns {StandingEntry[]}
 */
function readGovernmentRegionStandings(context, recordsByCode) {
  if (typeof context.territory.governmentRegions !== "function") {
    return [];
  }
  return context.territory.governmentRegions().map((region) => ({
    code: region.code,
    name: region.label,
    value: readAggregateValue(
      context.indicator,
      readUnitRecords(readGovernmentRegionCodes(context.territory, region.code), recordsByCode),
    ),
  }));
}

/**
 * @param {TerritoryIndex} territory
 * @param {string} code
 * @returns {string[]}
 */
function readGovernmentRegionCodes(territory, code) {
  if (typeof territory.municipalitiesInGovernmentRegion !== "function") {
    return [];
  }
  return territory.municipalitiesInGovernmentRegion(code).map((record) => record.code);
}

/**
 * Position among the units of the same kind: decreasing value, ties broken by name in pt-BR,
 * as the SEL-08 ranking.
 *
 * @param {StandingEntry[]} entries
 * @param {StandingEntry} target
 * @returns {number | null} null when the unit has no value.
 */
function readStatePosition(entries, target) {
  if (!isFiniteNumber(target.value)) {
    return null;
  }
  const entriesAhead = entries.filter((entry) => isRankedAhead(entry, target));
  return entriesAhead.length + 1;
}

/**
 * @param {StandingEntry} entry
 * @param {StandingEntry} target
 * @returns {boolean}
 */
function isRankedAhead(entry, target) {
  if (entry.code === target.code) {
    return false;
  }
  const entryValue = entry.value;
  const targetValue = target.value;
  const hasBothValues = isFiniteNumber(entryValue) && isFiniteNumber(targetValue);
  if (!hasBothValues) {
    return false;
  }
  if (entryValue !== targetValue) {
    return entryValue > targetValue;
  }
  return entry.name.localeCompare(target.name, "pt-BR") < 0;
}

/**
 * @param {number | null} position
 * @returns {string}
 */
function formatStatePosition(position) {
  if (position === null) {
    return MISSING_POSITION_TEXT;
  }
  return `#${position} no Estado`;
}

/**
 * @param {PanelUnit} unit
 * @param {Standings} standings
 * @returns {StandingEntry[]}
 */
function readEntriesOfKind(unit, standings) {
  if (unit.kind === "region") {
    return standings.regions;
  }
  if (unit.kind === "governmentRegion") {
    return standings.governmentRegions ?? [];
  }
  return standings.municipalities;
}

/**
 * The administrative region of a municipality, or the municipality count of a region.
 *
 * @param {PanelUnit} unit
 * @param {TerritoryIndex} territory
 * @returns {string}
 */
function readContextLabel(unit, territory) {
  if (unit.kind === "governmentRegion") {
    if (unit.code === "rg-40" || unit.name.includes("São Paulo")) {
      return "igual à região administrativa";
    }
    return formatMunicipalityCount(unit.codes.length);
  }
  if (unit.kind === "region") {
    return formatMunicipalityCount(unit.codes.length);
  }
  return territory.regionOf(unit.code)?.label ?? "";
}

/**
 * @param {number} count
 * @returns {string}
 */
function formatMunicipalityCount(count) {
  if (count === 1) {
    return "1 município";
  }
  return `${count} municípios`;
}

/**
 * A value of zero sits in the lowest band, as the map paints it.
 *
 * @param {number | null} value
 * @param {number[]} breaks
 * @returns {number}
 */
function readBandIndex(value, breaks) {
  if (!isFiniteNumber(value)) {
    return NO_BAND;
  }
  return Math.max(classify(value, breaks), 0);
}

/**
 * @param {ComparedPair} pair
 * @returns {string}
 */
function readCompareTitle(pair) {
  const kinds = new Set(pair.map((unit) => unit.kind));
  if (kinds.size > 1) {
    return MIXED_TITLE;
  }
  if (kinds.has("region")) {
    return REGION_TITLE;
  }
  if (kinds.has("governmentRegion")) {
    return "Comparativo de Regiões de Governo";
  }
  return MUNICIPALITY_TITLE;
}

/**
 * With the demo on, only the synthetic value is compared.
 *
 * @param {CompareContext} context
 * @returns {IndicatorDefinition[]}
 */
function readComparedIndicators(context) {
  if (context.isDemoActive) {
    return [context.indicator];
  }
  return COMPARED_INDICATOR_IDS.map((id) => INDICATORS[id]);
}

/**
 * @param {IndicatorDefinition} indicator
 * @param {ComparedPair} pair
 * @param {Map<string, MunicipalityRecord>} recordsByCode
 * @returns {CompareMetric}
 */
function buildMetric(indicator, pair, recordsByCode) {
  const [first, second] = pair;
  const firstValue = buildCompareValue(indicator, readUnitRecords(first.codes, recordsByCode));
  const secondValue = buildCompareValue(indicator, readUnitRecords(second.codes, recordsByCode));
  return {
    id: indicator.id,
    label: indicator.label,
    unitLabel: readUnitLabel(indicator, [firstValue, secondValue]),
    values: [firstValue, secondValue],
    shareOfFirst: readShareOfFirst(firstValue.value, secondValue.value),
    difference: describeDifference(
      { name: first.name, value: firstValue.value },
      { name: second.name, value: secondValue.value },
    ),
  };
}

/**
 * @param {IndicatorDefinition} indicator
 * @param {MunicipalityRecord[]} records
 * @returns {CompareValue}
 */
function buildCompareValue(indicator, records) {
  const value = readAggregateValue(indicator, records);
  if (!isFiniteNumber(value)) {
    return { value: null, text: MISSING_VALUE_TEXT };
  }
  return { value, text: indicator.format(value) };
}

/**
 * @param {IndicatorDefinition} indicator
 * @param {CompareValue[]} values
 * @returns {string}
 */
function readUnitLabel(indicator, values) {
  if (values.some((entry) => entry.text.includes(indicator.unit))) {
    return "";
  }
  return indicator.unit;
}

/**
 * @param {number | null} firstValue
 * @param {number | null} secondValue
 * @returns {number | null}
 */
function readShareOfFirst(firstValue, secondValue) {
  const hasBothValues = isFiniteNumber(firstValue) && isFiniteNumber(secondValue);
  if (!hasBothValues) {
    return null;
  }
  const hasNegativeValue = firstValue < 0 || secondValue < 0;
  if (hasNegativeValue) {
    return null;
  }
  const total = firstValue + secondValue;
  if (total <= 0) {
    return null;
  }
  return (firstValue / total) * 100;
}

/**
 * @param {CompareMetric} metric
 * @returns {CompareMetric}
 */
function swapMetricValues(metric) {
  return {
    ...metric,
    values: [metric.values[1], metric.values[0]],
    shareOfFirst: readComplementShare(metric.shareOfFirst),
  };
}

/**
 * @param {number | null} share
 * @returns {number | null}
 */
function readComplementShare(share) {
  if (share === null) {
    return null;
  }
  return 100 - share;
}

/**
 * @param {MeasuredValue} first
 * @param {MeasuredValue} second
 * @returns {{ larger: MeasuredValue, smaller: MeasuredValue }}
 */
function orderByValue(first, second) {
  if (first.value > second.value) {
    return { larger: first, smaller: second };
  }
  return { larger: second, smaller: first };
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatOneDecimal(value) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * @param {IndicatorDefinition} indicator
 * @param {MunicipalityRecord[]} records
 * @returns {number | null}
 */
function readAggregateValue(indicator, records) {
  const { value } = aggregateIndicator(indicator, records);
  if (!isFiniteNumber(value)) {
    return null;
  }
  return value;
}

/**
 * @param {readonly string[]} codes
 * @param {Map<string, MunicipalityRecord>} recordsByCode
 * @returns {MunicipalityRecord[]}
 */
function readUnitRecords(codes, recordsByCode) {
  /** @type {MunicipalityRecord[]} */
  const records = [];
  for (const code of codes) {
    const record = recordsByCode.get(code);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

/**
 * @param {TerritoryIndex} territory
 * @param {string} regionCode
 * @returns {string[]}
 */
function readRegionCodes(territory, regionCode) {
  return territory.municipalitiesInRegion(regionCode).map((record) => record.code);
}

/**
 * @param {StandingEntry[]} entries
 * @returns {number[]}
 */
function readDistinctPositiveValues(entries) {
  const positiveValues = entries.map((entry) => entry.value).filter(isPositiveNumber);
  return [...new Set(positiveValues)];
}

/**
 * @param {number | null} value
 * @returns {value is number}
 */
function isPositiveNumber(value) {
  return isFiniteNumber(value) && value > 0;
}

/**
 * @param {PanelUnit} unit
 * @returns {string}
 */
function readUnitKey(unit) {
  return `${unit.kind}:${unit.code}`;
}

/**
 * @param {number | null | undefined} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
