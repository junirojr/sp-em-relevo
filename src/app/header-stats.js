import { aggregateIndicator } from "../domain/aggregation.js";
import { findIndicator } from "../domain/indicator.js";

/**
 * Numbers shown in the top bar and in the legend card. Every figure is computed from the loaded
 * records, never written by hand.
 *
 * @typedef {import("../domain/indicator.js").IndicatorDefinition} IndicatorDefinition
 * @typedef {Array<Record<string, any>>} Records
 *
 * @typedef {{ value: string, label: string, isSynthetic: boolean }} HeaderStat
 * @typedef {{ municipalities: HeaderStat, population: HeaderStat | null }} HeaderStats
 * @typedef {{ label: string, value: string }} MapMetric
 * @typedef {{ items: MapMetric[] }} MapMetrics three figures, in the order the card shows them.
 */

const STATE_LABEL = "Estado";
const CITIES_LABEL = "Cidades";
const AVERAGE_LABEL = "Média por município";
const SELECTION_LABEL = "Seleção";

export const SYNTHETIC_METRIC_TEXT = "Sintético";

/**
 * The top bar figures: how many municipalities were loaded and the state population. While the
 * demo is on the population is synthetic, so it is replaced by the synthetic label and the real
 * total is never shown as if it described the synthetic map.
 *
 * @param {{
 *   municipalities: Records,
 *   isDemoActive: boolean,
 *   syntheticLabel: string
 * }} input real records, as loaded.
 * @returns {HeaderStats}
 */
export function buildHeaderStats(input) {
  return {
    municipalities: buildMunicipalitiesStat(input.municipalities.length),
    population: buildPopulationStat(input),
  };
}

/**
 * @param {number} count
 * @returns {HeaderStat}
 */
function buildMunicipalitiesStat(count) {
  let label = "municípios";
  if (count === 1) {
    label = "município";
  }
  return { value: count.toLocaleString("pt-BR"), label, isSynthetic: false };
}

/**
 * @param {{ municipalities: Records, isDemoActive: boolean, syntheticLabel: string }} input
 * @returns {HeaderStat | null}
 */
function buildPopulationStat(input) {
  if (input.isDemoActive) {
    return { value: input.syntheticLabel, label: "", isSynthetic: true };
  }
  const population = findIndicator("population");
  const total = aggregateIndicator(population, input.municipalities).value;
  if (total === null) {
    return null;
  }
  return { value: population.format(total), label: population.unit, isSynthetic: false };
}

/**
 * The legend card figures for the active indicator (LAY-09).
 * - No selection: the state value (sum or ratio, as the indicator aggregates), how many cities
 *   have a value, and the mean value per municipality.
 * - With a selection: the selection value (the same domain aggregation as the panel total), how
 *   many selected cities have a value, and the state value to compare against.
 * While the demo is on the values are synthetic, so only the counts are shown as numbers.
 *
 * @param {{
 *   definition: IndicatorDefinition,
 *   records: Records,
 *   isDemoActive: boolean,
 *   selectedCodes?: readonly string[]
 * }} input records the active indicator reads, synthetic ones included while the demo is on.
 * @returns {MapMetrics}
 */
export function buildMapMetrics(input) {
  const selectedCodes = input.selectedCodes ?? [];
  if (selectedCodes.length === 0) {
    return buildStateMetrics(input);
  }
  return buildSelectionMetrics(input, selectedCodes);
}

/**
 * @param {{ definition: IndicatorDefinition, records: Records, isDemoActive: boolean }} input
 * @returns {MapMetrics}
 */
function buildStateMetrics({ definition, records, isDemoActive }) {
  const values = readFiniteValues(definition, records);
  const cities = { label: CITIES_LABEL, value: formatCount(values.length) };
  if (isDemoActive) {
    return {
      items: [
        { label: STATE_LABEL, value: SYNTHETIC_METRIC_TEXT },
        cities,
        { label: AVERAGE_LABEL, value: SYNTHETIC_METRIC_TEXT },
      ],
    };
  }
  return {
    items: [
      { label: STATE_LABEL, value: formatAggregate(definition, records) },
      cities,
      { label: AVERAGE_LABEL, value: definition.formatAbbreviated(readMean(values)) },
    ],
  };
}

/**
 * @param {{ definition: IndicatorDefinition, records: Records, isDemoActive: boolean }} input
 * @param {readonly string[]} selectedCodes
 * @returns {MapMetrics}
 */
function buildSelectionMetrics({ definition, records, isDemoActive }, selectedCodes) {
  const selectedSet = new Set(selectedCodes);
  const selectedRecords = records.filter((record) => selectedSet.has(record.code));
  const values = readFiniteValues(definition, selectedRecords);
  const cities = { label: CITIES_LABEL, value: formatCount(values.length) };
  if (isDemoActive) {
    return {
      items: [
        { label: SELECTION_LABEL, value: SYNTHETIC_METRIC_TEXT },
        cities,
        { label: STATE_LABEL, value: SYNTHETIC_METRIC_TEXT },
      ],
    };
  }
  return {
    items: [
      { label: SELECTION_LABEL, value: formatAggregate(definition, selectedRecords) },
      cities,
      { label: STATE_LABEL, value: formatAggregate(definition, records) },
    ],
  };
}

/**
 * @param {IndicatorDefinition} definition
 * @param {Records} records
 * @returns {string}
 */
function formatAggregate(definition, records) {
  const aggregated = aggregateIndicator(definition, records);
  return definition.formatAbbreviated(aggregated.value);
}

/**
 * @param {number} count
 * @returns {string}
 */
function formatCount(count) {
  return count.toLocaleString("pt-BR");
}

/**
 * @param {IndicatorDefinition} definition
 * @param {Records} records
 * @returns {number[]}
 */
function readFiniteValues(definition, records) {
  const values = [];
  for (let i = 0; i < records.length; i += 1) {
    const value = definition.computeValue(/** @type {any} */ (records[i]));
    if (value !== null && Number.isFinite(value)) {
      values.push(value);
    }
  }
  return values;
}

/**
 * @param {number[]} values
 * @returns {number | null} null when there is nothing to average.
 */
function readMean(values) {
  if (values.length === 0) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
  }
  return sum / values.length;
}

/**
 * Mounts the figures of the top bar into `container`.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} container
 * @returns {{ update: (stats: HeaderStats) => void }}
 */
export function mountHeaderStats(documentRef, container) {
  return {
    update(stats) {
      const chips = [buildChip(documentRef, stats.municipalities)];
      if (stats.population) {
        chips.push(buildChip(documentRef, stats.population));
      }
      container.replaceChildren(...chips);
    },
  };
}

/**
 * @param {Document} documentRef
 * @param {HeaderStat} stat
 * @returns {HTMLElement}
 */
function buildChip(documentRef, stat) {
  const chip = documentRef.createElement("span");
  chip.className = "header-stat";
  if (stat.isSynthetic) {
    chip.className = "header-stat header-stat-synthetic";
  }
  const value = documentRef.createElement("span");
  value.className = "header-stat-value";
  value.textContent = stat.value;
  chip.append(value);
  if (stat.label) {
    chip.append(documentRef.createTextNode(` ${stat.label}`));
  }
  return chip;
}
