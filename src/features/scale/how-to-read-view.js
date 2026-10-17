import { DEFAULT_HEIGHT_MODE } from "../../domain/height.js";

/**
 * @typedef {import("../../domain/height.js").HeightMode} HeightMode
 *
 * @typedef {{
 *   key: "scale" | "height" | "aggregation",
 *   title: string,
 *   text: string
 * }} HowToReadLine
 *
 * @typedef {{
 *   title: string,
 *   lines: HowToReadLine[]
 * }} HowToReadViewModel
 */

const TITLE = "Como ler este mapa";

/** @type {Record<HeightMode, string>} */
const HEIGHT_TEXTS = {
  data: "Altura: relevo proporcional à posição logarítmica contínua do indicador.",
  step: "Altura: um degrau por faixa de calor; quem está na mesma faixa tem a mesma altura.",
  flat: "Altura: igual para todas as unidades; só a cor mostra o valor.",
};

/** @type {HowToReadLine} */
const SCALE_LINE = {
  key: "scale",
  title: "Escala",
  text: "Escala: 7 faixas de calor em escala logarítmica para municípios e quantis para regiões.",
};

/** @type {HowToReadLine} */
const AGGREGATION_LINE = {
  key: "aggregation",
  title: "Agregação",
  text: "Agregação: soma direta para totais e razão de somas para indicadores derivados.",
};

/**
 * Builds the view model for the 'Como ler este mapa' expandable section.
 * Follows ESC-09 and ESC-11: the height line follows the height mode.
 *
 * @param {HeightMode} [heightMode] defaults to the proportional mode.
 * @returns {HowToReadViewModel}
 */
export function buildHowToReadViewModel(heightMode = DEFAULT_HEIGHT_MODE) {
  return {
    title: TITLE,
    lines: [SCALE_LINE, buildHeightLine(heightMode), AGGREGATION_LINE],
  };
}

/**
 * @param {HeightMode} heightMode
 * @returns {HowToReadLine}
 */
function buildHeightLine(heightMode) {
  return {
    key: "height",
    title: "Altura",
    text: HEIGHT_TEXTS[heightMode],
  };
}

/**
 * Mounts the collapsed <details> element with the three explanatory lines.
 * Follows ESC-09 and ESC-11.
 *
 * @param {any} documentRef
 * @param {HeightMode} [initialHeightMode] defaults to the proportional mode.
 */
export function mountHowToReadView(documentRef, initialHeightMode = DEFAULT_HEIGHT_MODE) {
  const model = buildHowToReadViewModel(initialHeightMode);

  const details = documentRef.createElement("details");
  details.className = "how-to-read-details";
  details.open = false;

  const summary = documentRef.createElement("summary");
  summary.className = "how-to-read-summary";
  summary.textContent = model.title;

  const list = documentRef.createElement("ul");
  list.className = "how-to-read-list";

  const lineElements = appendLines(documentRef, list, model.lines);

  details.append(summary, list);

  return {
    element: details,
    summaryElement: summary,
    listElement: list,
    updateHeightMode: (/** @type {HeightMode} */ heightMode) => {
      writeLineTexts(lineElements, buildHowToReadViewModel(heightMode).lines);
    },
  };
}

/**
 * @param {any} documentRef
 * @param {any} list
 * @param {HowToReadLine[]} lines
 * @returns {any[]} the line elements, in the order of `lines`.
 */
function appendLines(documentRef, list, lines) {
  const lineElements = [];
  for (let i = 0; i < lines.length; i += 1) {
    const li = documentRef.createElement("li");
    li.className = `how-to-read-line line-${lines[i].key}`;
    li.textContent = lines[i].text;
    list.append(li);
    lineElements.push(li);
  }
  return lineElements;
}

/**
 * @param {any[]} lineElements
 * @param {HowToReadLine[]} lines same order as `lineElements`.
 */
function writeLineTexts(lineElements, lines) {
  for (let i = 0; i < lineElements.length; i += 1) {
    lineElements[i].textContent = lines[i].text;
  }
}
