/**
 * Reader for the JSON returned by apisidra.ibge.gov.br/values: a header row followed by one
 * row per territory, variable and period, every field as text.
 *
 * @typedef {{ level: string, code: string, name: string, variable: string, value: number | null }} SidraRow
 * @typedef {{ code: string, name: string, value: number | null }} SidraValue
 */

/** SIDRA markers for data that does not exist or is not published. */
const ABSENT_MARKERS = Object.freeze(["..", "...", "X"]);
/** SIDRA marker for an absolute zero, not produced by rounding. */
const ZERO_MARKER = "-";
const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;
const STATE_SUFFIX = / - [A-Z]{2}$/;

/**
 * @param {string} text Body of the SIDRA response.
 * @returns {SidraRow[]} Data rows only; the header row is dropped.
 */
export function readSidraRows(text) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error("SIDRA response is not a list of rows");
  return rows.filter(isDataRow).map(toSidraRow);
}

/**
 * Municipal values of one variable, one entry per row, name without the " - SP" suffix (R1).
 * @param {SidraRow[]} rows
 * @param {{ level: string, variable: string }} selection
 * @returns {SidraValue[]}
 */
export function selectValues(rows, { level, variable }) {
  return rows
    .filter((row) => row.level === level && row.variable === variable)
    .map((row) => ({ code: row.code, name: stripStateSuffix(row.name), value: row.value }));
}

/**
 * Value of one variable for one territory, or undefined when the row is absent.
 * @param {SidraRow[]} rows
 * @param {{ level: string, variable: string, code: string }} selection
 * @returns {number | null | undefined}
 */
export function selectValue(rows, { level, variable, code }) {
  const row = rows.find(
    (candidate) =>
      candidate.level === level && candidate.variable === variable && candidate.code === code,
  );
  return row?.value;
}

/**
 * Absent markers become null, never 0; "-" is SIDRA's absolute zero; anything else that is
 * not a plain decimal number becomes NaN so DAD-06 fails the build.
 * @param {string} text
 * @returns {number | null}
 */
export function parseSidraValue(text) {
  if (ABSENT_MARKERS.includes(text)) return null;
  if (text === ZERO_MARKER) return 0;
  if (!NUMERIC_TEXT.test(text)) return Number.NaN;
  return Number(text);
}

/**
 * @param {string} name
 * @returns {string}
 */
export function stripStateSuffix(name) {
  return name.replace(STATE_SUFFIX, "");
}

/**
 * The header row repeats the column titles; data rows carry a numeric level code.
 * @param {unknown} row
 * @returns {row is Record<string, string>}
 */
function isDataRow(row) {
  return typeof row === "object" && row !== null && /^\d+$/.test(String(Reflect.get(row, "NC")));
}

/**
 * @param {Record<string, string>} row
 * @returns {SidraRow}
 */
function toSidraRow(row) {
  return {
    level: row.NC,
    code: row.D1C,
    name: row.D1N,
    variable: row.D2C,
    value: parseSidraValue(row.V),
  };
}
