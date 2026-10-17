/**
 * @param {number | null | undefined} value
 * @param {string} indicatorId
 * @returns {string}
 */
export function formatValue(value, indicatorId) {
  if (value === null || value === undefined) {
    return "Sem dado";
  }
  if (Number.isNaN(value)) {
    return "Sem dado";
  }

  if (indicatorId === "population") {
    return formatPopulation(value);
  }
  if (indicatorId === "area") {
    return formatArea(value);
  }
  if (indicatorId === "density") {
    return formatDensity(value);
  }
  if (indicatorId === "gdpPerCapita") {
    return formatGdpPerCapita(value);
  }

  return formatDefaultNumber(value);
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatPopulation(value) {
  const rounded = Math.round(value);
  return rounded.toLocaleString("pt-BR");
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatArea(value) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatDensity(value) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatGdpPerCapita(value) {
  const rounded = Math.round(value);
  const formatted = rounded.toLocaleString("pt-BR");
  return `R$ ${formatted}`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatDefaultNumber(value) {
  return value.toLocaleString("pt-BR");
}

/**
 * @param {number | null | undefined} value
 * @param {string} indicatorId
 * @returns {string}
 */
export function formatAbbreviated(value, indicatorId) {
  if (value === null || value === undefined) {
    return "Sem dado";
  }
  if (Number.isNaN(value)) {
    return "Sem dado";
  }

  const prefix = abbreviatedPrefix(indicatorId);
  const abs = Math.abs(value);

  if (abs >= 1000000) {
    const millions = value / 1000000;
    const formatted = formatOneDecimalOrInteger(millions);
    return `${prefix}${formatted} mi`;
  }

  if (abs >= 1000) {
    const thousands = value / 1000;
    const formatted = formatOneDecimalOrInteger(thousands);
    return `${prefix}${formatted} mil`;
  }

  const integerStr = Math.round(value).toLocaleString("pt-BR");
  return `${prefix}${integerStr}`;
}

/**
 * @param {string} indicatorId
 * @returns {string}
 */
function abbreviatedPrefix(indicatorId) {
  if (indicatorId === "gdpPerCapita") {
    return "R$ ";
  }
  return "";
}

/**
 * @param {number} num
 * @returns {string}
 */
function formatOneDecimalOrInteger(num) {
  const roundedToOne = Math.round(num * 10) / 10;
  if (roundedToOne % 1 === 0) {
    return roundedToOne.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }
  return roundedToOne.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
