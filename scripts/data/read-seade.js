/**
 * Reader for the Seade CSV of municipality and region codes: Latin-1, semicolon separated,
 * decimal comma, a state row (2-digit code) and an "unspecified municipality" placeholder
 * (3500000) mixed with the 645 municipalities. Labels may carry a double space
 * ("RM  São Paulo"), normalized here to a single one.
 *
 * @typedef {{ code: string, name: string, areaKm2: number | null, regionCode: string | null, regionLabel: string | null }} SeadeRow
 */

const COLUMNS = Object.freeze({
  code: "cod_ibge",
  name: "municipio",
  areaKm2: "area_km",
  regionCode: "cod_ra",
  regionLabel: "ra",
});
const SEPARATOR = ";";
const MUNICIPALITY_CODE = /^\d{7}$/;
/** IBGE placeholder for "municipality not specified": the state code followed by zeros. */
const UNSPECIFIED_MUNICIPALITY = /^\d{2}0{5}$/;
const DECIMAL_COMMA = /^\d+(,\d+)?$/;

/**
 * @param {Uint8Array} bytes Raw CSV as downloaded.
 * @returns {SeadeRow[]} One row per seven-digit municipality code, in file order.
 */
export function readSeadeRows(bytes) {
  const [headerLine, ...lines] = Buffer.from(bytes)
    .toString("latin1")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const columnIndex = readColumnIndex(headerLine ?? "");
  return lines
    .map((line) => line.split(SEPARATOR))
    .filter((cells) => isMunicipalityCode(cells[columnIndex.code]))
    .map((cells) => toSeadeRow(cells, columnIndex));
}

/**
 * Collapses runs of whitespace into a single space and trims the ends.
 * @param {string} text
 * @returns {string}
 */
export function normalizeLabel(text) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * "411,987" becomes 411.987; an empty cell is absent (null); anything else is NaN.
 * @param {string} text
 * @returns {number | null}
 */
export function parseDecimalComma(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (!DECIMAL_COMMA.test(trimmed)) return Number.NaN;
  return Number(trimmed.replace(",", "."));
}

/**
 * @param {string} headerLine
 * @returns {Record<keyof typeof COLUMNS, number>}
 */
function readColumnIndex(headerLine) {
  const headers = headerLine.split(SEPARATOR).map((header) => header.trim());
  const entries = Object.entries(COLUMNS).map(([field, header]) => {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error(`Seade CSV lacks the column ${header}`);
    return [field, index];
  });
  return /** @type {Record<keyof typeof COLUMNS, number>} */ (Object.fromEntries(entries));
}

/**
 * @param {string | undefined} code
 * @returns {boolean}
 */
function isMunicipalityCode(code) {
  const trimmed = (code ?? "").trim();
  return MUNICIPALITY_CODE.test(trimmed) && !UNSPECIFIED_MUNICIPALITY.test(trimmed);
}

/**
 * @param {string[]} cells
 * @param {Record<keyof typeof COLUMNS, number>} columnIndex
 * @returns {SeadeRow}
 */
function toSeadeRow(cells, columnIndex) {
  /** @param {keyof typeof COLUMNS} field */
  const cell = (field) => normalizeLabel(cells[columnIndex[field]] ?? "");
  return {
    code: cell("code"),
    name: cell("name"),
    areaKm2: parseDecimalComma(cell("areaKm2")),
    regionCode: emptyToNull(cell("regionCode")),
    regionLabel: emptyToNull(cell("regionLabel")),
  };
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function emptyToNull(text) {
  if (text.length === 0) return null;
  return text;
}
