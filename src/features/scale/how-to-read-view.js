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
const REGION_SCALE_LINE = {
  key: "scale",
  title: "Escala",
  text: "Escala: 16 cores distintas, uma para cada região administrativa.",
};

/** @type {HowToReadLine} */
const AGGREGATION_LINE = {
  key: "aggregation",
  title: "Agregação",
  text: "Agregação: soma direta para totais e razão de somas para indicadores derivados.",
};

/**
 * Builds the view model for the 'Como ler este mapa' expandable section.
 * Follows ESC-09, ESC-11 and REG-01: the height line follows the height mode
 * and the scale line follows the color mode.
 *
 * @param {HeightMode} [heightMode] defaults to the proportional mode.
 * @param {string} [colorMode] defaults to heat.
 * @returns {HowToReadViewModel}
 */
export function buildHowToReadViewModel(
  heightMode = DEFAULT_HEIGHT_MODE,
  colorMode = "heat",
) {
  return {
    title: TITLE,
    lines: [buildScaleLine(colorMode), buildHeightLine(heightMode), AGGREGATION_LINE],
  };
}

/**
 * @param {string} [colorMode]
 * @returns {HowToReadLine}
 */
function buildScaleLine(colorMode) {
  if (colorMode === "region") {
    return REGION_SCALE_LINE;
  }
  return SCALE_LINE;
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
 * Follows ESC-09, ESC-11 and REG-01.
 *
 * @param {any} documentRef
 * @param {HeightMode} [initialHeightMode] defaults to the proportional mode.
 * @param {string} [initialColorMode] defaults to heat.
 */
export function mountHowToReadView(
  documentRef,
  initialHeightMode = DEFAULT_HEIGHT_MODE,
  initialColorMode = "heat",
) {
  let heightMode = initialHeightMode;
  let colorMode = initialColorMode;
  const model = buildHowToReadViewModel(heightMode, colorMode);

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
    updateHeightMode: (/** @type {HeightMode} */ nextHeightMode) => {
      heightMode = nextHeightMode;
      writeLineTexts(lineElements, buildHowToReadViewModel(heightMode, colorMode).lines);
    },
    updateColorMode: (/** @type {string} */ nextColorMode) => {
      colorMode = nextColorMode;
      writeLineTexts(lineElements, buildHowToReadViewModel(heightMode, colorMode).lines);
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
