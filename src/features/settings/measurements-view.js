/**
 * Numbers shown in "Medições". The caller passes them in; `null` means not measured yet.
 *
 * @typedef {{
 *   buildMilliseconds: number | null,
 *   vertexCount: number | null,
 *   drawCalls: number | null,
 *   triangles: number | null,
 *   medianFrameMilliseconds: number | null
 * }} Measurements
 * @typedef {{ id: string, label: string, text: string }} MeasurementRow
 */

const NOT_READ_TEXT = "…";

/**
 * @param {Measurements} measurements
 * @returns {MeasurementRow[]}
 */
export function buildMeasurementRows(measurements) {
  return [
    {
      id: "build",
      label: "Montagem da geometria",
      text: formatMilliseconds(measurements.buildMilliseconds),
    },
    { id: "vertices", label: "Vértices do bloco", text: formatCount(measurements.vertexCount) },
    {
      id: "calls",
      label: "Chamadas de desenho por quadro",
      text: formatCount(measurements.drawCalls),
    },
    { id: "triangles", label: "Triângulos por quadro", text: formatCount(measurements.triangles) },
    {
      id: "frame",
      label: "CPU por quadro, mediana",
      text: formatMilliseconds(measurements.medianFrameMilliseconds),
    },
  ];
}

/**
 * Creates the "Medições" section and returns it with an `update` function. It reads no engine.
 *
 * @param {Document} documentRef
 * @returns {{ element: HTMLElement, update: (measurements: Measurements) => void }}
 */
export function createMeasurementsView(documentRef) {
  const section = documentRef.createElement("section");
  section.className = "settings-card";
  const heading = documentRef.createElement("h3");
  heading.textContent = "Medições neste navegador";
  const list = documentRef.createElement("dl");
  list.className = "settings-stats";
  section.append(heading, list);
  return {
    element: section,
    update: (measurements) => renderRows(documentRef, list, measurements),
  };
}

/**
 * @param {Document} documentRef
 * @param {HTMLElement} list
 * @param {Measurements} measurements
 */
function renderRows(documentRef, list, measurements) {
  const children = buildMeasurementRows(measurements).flatMap((row) =>
    buildRowNodes(documentRef, row),
  );
  list.replaceChildren(...children);
}

/**
 * @param {Document} documentRef
 * @param {MeasurementRow} row
 */
function buildRowNodes(documentRef, row) {
  const term = documentRef.createElement("dt");
  term.textContent = row.label;
  const value = documentRef.createElement("dd");
  value.textContent = row.text;
  return [term, value];
}

/** @param {number | null} value */
function formatMilliseconds(value) {
  if (value === null) {
    return NOT_READ_TEXT;
  }
  const text = value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${text} ms`;
}

/** @param {number | null} value */
function formatCount(value) {
  if (value === null) {
    return NOT_READ_TEXT;
  }
  return value.toLocaleString("pt-BR");
}
