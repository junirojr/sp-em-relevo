/**
 * @typedef {import("./indicator.js").IndicatorDefinition} IndicatorDefinition
 * @typedef {{
 *   value: number | null;
 *   completeness: { complete: number; total: number; isComplete: boolean };
 *   note: string | null;
 *   label: string;
 * }} AggregationResult
 */

/**
 * Aggregates an indicator over a collection of municipality records. Sum aggregates total a
 * single field; ratio aggregates sum numerator and denominator over municipalities that have both,
 * then divide and scale.
 * @param {IndicatorDefinition} indicator
 * @param {Array<Record<string, any>>} municipalities
 * @returns {AggregationResult}
 */
export function aggregateIndicator(indicator, municipalities) {
  const label = readAggregationLabel(indicator);
  if (municipalities.length === 0) {
    return createEmptyResult(label, 0);
  }

  if (indicator.aggregation.type === "sum") {
    return aggregateSum(indicator.aggregation.field, municipalities, label);
  }

  return aggregateRatio(indicator.aggregation, municipalities, label);
}

/**
 * Label for the summary line: sum indicators are called 'Total', ratios describe the aggregate set.
 * @param {IndicatorDefinition} indicator
 * @returns {string}
 */
export function readAggregationLabel(indicator) {
  if (indicator.aggregation.type === "sum") {
    return "Total";
  }
  return `${indicator.label} do conjunto`;
}

/**
 * Formats the aggregated value using the indicator's formatter, or shows the completeness note.
 * @param {AggregationResult} result
 * @param {IndicatorDefinition} indicator
 * @returns {string}
 */
export function formatAggregatedValue(result, indicator) {
  if (result.value === null) {
    if (result.note) {
      return result.note;
    }
    return "sem dado";
  }
  return indicator.format(result.value);
}

/**
 * Sums numeric values at the specified indexes from a vector, used for synthetic indicator aggregation.
 * @param {Float64Array | number[]} vector
 * @param {number[]} indexes
 * @returns {number}
 */
export function aggregateVectorByIndexes(vector, indexes) {
  let sum = 0;
  for (const index of indexes) {
    sum += vector[index];
  }
  return sum;
}

/**
 * @param {string} field
 * @param {Array<Record<string, any>>} municipalities
 * @param {string} label
 * @returns {AggregationResult}
 */
function aggregateSum(field, municipalities, label) {
  let sum = 0;
  let complete = 0;

  for (const m of municipalities) {
    const val = m[field];
    if (val === null) {
      continue;
    }
    if (val === undefined) {
      continue;
    }
    if (Number.isNaN(val)) {
      continue;
    }
    sum += val;
    complete += 1;
  }

  if (complete === 0) {
    return createEmptyResult(label, municipalities.length);
  }

  const isComplete = complete === municipalities.length;
  let note = null;
  if (!isComplete) {
    note = `dado incompleto (${complete} de ${municipalities.length})`;
  }

  return {
    value: sum,
    completeness: { complete, total: municipalities.length, isComplete },
    note,
    label,
  };
}

/**
 * @param {{ numerator: string; numeratorScale: number; denominator: string }} spec
 * @param {Array<Record<string, any>>} municipalities
 * @param {string} label
 * @returns {AggregationResult}
 */
function aggregateRatio(spec, municipalities, label) {
  const scale = spec.numeratorScale ?? 1;
  let sumNumerator = 0;
  let sumDenominator = 0;
  let complete = 0;

  for (const m of municipalities) {
    const numVal = m[spec.numerator];
    const denVal = m[spec.denominator];
    if (numVal === null) {
      continue;
    }
    if (numVal === undefined) {
      continue;
    }
    if (Number.isNaN(numVal)) {
      continue;
    }
    if (denVal === null) {
      continue;
    }
    if (denVal === undefined) {
      continue;
    }
    if (Number.isNaN(denVal)) {
      continue;
    }

    sumNumerator += numVal;
    sumDenominator += denVal;
    complete += 1;
  }

  if (complete === 0) {
    return createEmptyResult(label, municipalities.length);
  }
  if (sumDenominator === 0) {
    return createEmptyResult(label, municipalities.length);
  }

  const isComplete = complete === municipalities.length;
  let note = null;
  if (!isComplete) {
    note = `dado incompleto (${complete} de ${municipalities.length})`;
  }

  return {
    value: (sumNumerator * scale) / sumDenominator,
    completeness: { complete, total: municipalities.length, isComplete },
    note,
    label,
  };
}

/**
 * @param {string} label
 * @param {number} total
 * @returns {AggregationResult}
 */
function createEmptyResult(label, total) {
  return {
    value: null,
    completeness: { complete: 0, total, isComplete: false },
    note: "sem dado",
    label,
  };
}
