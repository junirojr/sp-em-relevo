import { swapCompareSides } from "../../domain/compare.js";
import { removeCodesAction } from "./selection-slice.js";

/**
 * @typedef {import("../../domain/compare.js").CompareModel} CompareModel
 * @typedef {import("../../domain/compare.js").CompareSide} CompareSide
 * @typedef {import("../../domain/compare.js").CompareMetric} CompareMetric
 * @typedef {{ type: string }} Action
 *
 * @typedef {{
 *   onFocusUnits: (codes: string[]) => void
 * }} CompareViewOptions
 *   `onFocusUnits` frames the given municipality codes on the map, whatever the framing setting.
 *
 * @typedef {{
 *   model: CompareModel | null,
 *   isInverted: boolean,
 *   isMinimized: boolean
 * }} CompareLocalState
 *   Inverting and minimizing belong to the view; a new pair brings both back to the default.
 *
 * @typedef {{
 *   invert: () => void,
 *   minimize: () => void,
 *   reopen: () => void,
 *   focusUnits: () => void,
 *   replaceSideB: () => void
 * }} CompareActions
 *
 * @typedef {{
 *   element: HTMLDivElement,
 *   title: HTMLHeadingElement,
 *   count: HTMLSpanElement,
 *   invertButton: HTMLButtonElement,
 *   minimizeButton: HTMLButtonElement
 * }} HeaderParts
 *
 * @typedef {{
 *   element: HTMLDivElement,
 *   replaceSideBButton: HTMLButtonElement,
 *   focusButton: HTMLButtonElement
 * }} ActionParts
 *
 * @typedef {{
 *   dock: HTMLDivElement,
 *   panel: HTMLElement,
 *   title: HTMLHeadingElement,
 *   count: HTMLSpanElement,
 *   invertButton: HTMLButtonElement,
 *   minimizeButton: HTMLButtonElement,
 *   sides: HTMLDivElement,
 *   metrics: HTMLDListElement,
 *   replaceSideBButton: HTMLButtonElement,
 *   focusButton: HTMLButtonElement,
 *   reopenButton: HTMLButtonElement
 * }} CompareParts
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SEARCH_INPUT_ID = "city-search";
const DOCK_ID = "compare-dock";
const PANEL_ID = "compare-panel";
const TITLE_ID = "compare-title";
const REOPEN_ID = "compare-reopen";
const SUBTITLE_TEXT = "Métricas lado a lado no relevo 3D";
const INVERT_LABEL = "Inverter posições";
const MINIMIZE_LABEL = "Minimizar";
const REOPEN_TEXT = "Reabrir comparativo";
const REPLACE_SIDE_B_TEXT = "Trocar B";
const FOCUS_TEXT = "Focar no relevo";
const COMPACT_METRIC_IDS = new Set(["gdpPerCapita", "area"]);
const SIDE_LETTERS = ["A", "B"];
const SIDE_B_INDEX = 1;

/** @type {CompareLocalState} */
const DEFAULT_LOCAL_STATE = Object.freeze({ model: null, isInverted: false, isMinimized: false });

const BARS_ICON = ["M3 3v18h18", "M18 17V9", "M13 17V5", "M8 17v-3"];
const SWAP_ICON = ["M8 3 4 7l4 4", "M4 7h16", "m16 21 4-4-4-4", "M20 17H4"];
const MINIMIZE_ICON = ["m6 9 6 6 6-6"];
const EXPAND_ICON = ["m18 15-6-6-6 6"];
const FOCUS_ICON = [
  "M12 2v4",
  "M12 18v4",
  "M2 12h4",
  "M18 12h4",
  "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8",
];

/**
 * Mounts the comparison panel of the stage: it shows only with exactly two selection units.
 * Follows SEL-11, SEL-12 and SEL-13.
 *
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {CompareViewOptions} options
 */
export function mountCompareView(documentRef, dispatch, options) {
  const parts = buildCompareParts(documentRef);
  let local = DEFAULT_LOCAL_STATE;

  /** @param {CompareLocalState} next */
  const show = (next) => {
    local = next;
    renderCompare(documentRef, parts, local);
  };

  wireCompareActions(parts, {
    invert: () => show({ ...local, isInverted: !local.isInverted }),
    minimize: () => show({ ...local, isMinimized: !local.isMinimized }),
    reopen: () => show({ ...local, isMinimized: false }),
    focusUnits: () => {
      let codes = readShownCodes(local);
      if (codes.length === 0 && local.model) {
        codes = local.model.sides.flatMap((side) => side.unit.codes);
      }
      options.onFocusUnits(codes);
    },
    replaceSideB: () => {
      dispatch(removeCodesAction(readShownSideBCodes(local)));
      focusSearchInput(documentRef);
    },
  });

  return {
    element: parts.dock,
    update: (/** @type {CompareModel | null} */ model) => show(receiveModel(local, model)),
  };
}

/**
 * Minimizing collapses the panel in place or hands focus, allowing smooth expansion.
 *
 * @param {CompareParts} parts
 * @param {CompareActions} actions
 */
function wireCompareActions(parts, actions) {
  parts.invertButton.addEventListener("click", actions.invert);
  parts.minimizeButton.addEventListener("click", (e) => {
    e.stopPropagation();
    actions.minimize();
    parts.reopenButton.focus();
  });
  parts.panel.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (parts.panel.classList.contains("compare-panel-collapsed")) {
      if (!target.closest(".compare-icon-button")) {
        actions.reopen();
      }
    }
  });
  parts.reopenButton.addEventListener("click", () => {
    actions.reopen();
    parts.minimizeButton.focus();
  });
  parts.focusButton.addEventListener("click", actions.focusUnits);
  parts.replaceSideBButton.addEventListener("click", actions.replaceSideB);
}

/**
 * The same pair keeps the orientation and the minimized state; a new pair opens the panel with A
 * as the first panel row.
 *
 * @param {CompareLocalState} local
 * @param {CompareModel | null} model
 * @returns {CompareLocalState}
 */
function receiveModel(local, model) {
  if (model === null) {
    return DEFAULT_LOCAL_STATE;
  }
  const isSamePair = local.model?.pairKey === model.pairKey;
  if (isSamePair) {
    return { ...local, model };
  }
  return { ...DEFAULT_LOCAL_STATE, model };
}

/**
 * @param {CompareLocalState} local
 * @returns {string[]} the municipality codes of both sides.
 */
function readShownCodes(local) {
  const shown = readShownModel(local);
  if (shown === null) {
    return [];
  }
  return shown.sides.flatMap((side) => side.unit.codes);
}

/**
 * @param {CompareLocalState} local
 * @returns {string[]} the municipality codes of the side shown as B.
 */
function readShownSideBCodes(local) {
  const shown = readShownModel(local);
  if (shown === null) {
    return [];
  }
  return shown.sides[SIDE_B_INDEX].unit.codes;
}

/**
 * @param {CompareLocalState} local
 * @returns {CompareModel | null}
 */
function readShownModel(local) {
  if (local.model === null) {
    return null;
  }
  if (!local.isInverted) {
    return local.model;
  }
  return swapCompareSides(local.model);
}

/**
 * @param {Document} documentRef
 */
function focusSearchInput(documentRef) {
  const searchInput = documentRef.getElementById(SEARCH_INPUT_ID);
  if (!searchInput) {
    return;
  }
  const sidebar = documentRef.getElementById("sidebar");
  if (sidebar) {
    documentRef.documentElement.dataset.sheetState = "half";
    sidebar.dataset.sheetState = "half";
  }
  searchInput.focus();
  if (typeof searchInput.scrollIntoView === "function") {
    searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/**
 * @param {Document} documentRef
 * @param {CompareParts} parts
 * @param {CompareLocalState} local
 */
function renderCompare(documentRef, parts, local) {
  const shown = readShownModel(local);
  if (shown === null) {
    parts.dock.hidden = true;
    return;
  }
  parts.dock.hidden = false;
  if (local.isMinimized) {
    parts.panel.classList.add("compare-panel-collapsed");
    parts.minimizeButton.setAttribute("aria-expanded", "false");
    parts.minimizeButton.setAttribute("aria-label", "Expandir comparativo");
    parts.minimizeButton.title = "Expandir comparativo";
    parts.minimizeButton.replaceChildren(buildIcon(documentRef, EXPAND_ICON));
  }
  if (!local.isMinimized) {
    parts.panel.classList.remove("compare-panel-collapsed");
    parts.minimizeButton.setAttribute("aria-expanded", "true");
    parts.minimizeButton.setAttribute("aria-label", "Minimizar comparativo");
    parts.minimizeButton.title = "Minimizar comparativo";
    parts.minimizeButton.replaceChildren(buildIcon(documentRef, MINIMIZE_ICON));
  }
  parts.panel.hidden = local.isMinimized;
  parts.reopenButton.hidden = !local.isMinimized;
  renderModel(documentRef, parts, shown);
}

/**
 * @param {Document} documentRef
 * @param {CompareParts} parts
 * @param {CompareModel} model
 */
function renderModel(documentRef, parts, model) {
  parts.title.textContent = model.title;
  parts.count.textContent = model.countLabel;
  const sideCards = model.sides.map((side, index) =>
    buildSideCard(documentRef, side, SIDE_LETTERS[index]),
  );
  const vsBadge = createElement(documentRef, "div", "compare-vs-badge", "VS");
  vsBadge.setAttribute("aria-hidden", "true");
  if (sideCards.length === 2) {
    parts.sides.replaceChildren(sideCards[0], vsBadge, sideCards[1]);
  }
  if (sideCards.length !== 2) {
    parts.sides.replaceChildren(...sideCards);
  }
  parts.metrics.replaceChildren(...model.metrics.map((metric) => buildMetric(documentRef, metric)));
}

/**
 * @param {Document} documentRef
 * @param {CompareSide} side
 * @param {string} letter "A" or "B".
 * @returns {HTMLDivElement}
 */
function buildSideCard(documentRef, side, letter) {
  const card = createElement(documentRef, "div", "compare-side");
  card.dataset.side = letter.toLowerCase();
  card.append(
    buildSideMeta(documentRef, side, letter),
    buildSideName(documentRef, side),
    createElement(documentRef, "p", "compare-side-value", side.valueLabel),
  );
  return card;
}

/**
 * @param {Document} documentRef
 * @param {CompareSide} side
 * @param {string} letter
 * @returns {HTMLDivElement}
 */
function buildSideMeta(documentRef, side, letter) {
  const meta = createElement(documentRef, "div", "compare-side-meta");
  meta.append(
    createElement(documentRef, "span", "compare-letter", letter),
    createElement(documentRef, "span", "compare-rank", side.rankLabel),
    createElement(documentRef, "span", "compare-context", side.contextLabel),
  );
  return meta;
}

/**
 * The unit name is the heading of its side; the swatch carries the band of the active legend.
 *
 * @param {Document} documentRef
 * @param {CompareSide} side
 * @returns {HTMLHeadingElement}
 */
function buildSideName(documentRef, side) {
  const heading = createElement(documentRef, "h3", "compare-side-name");
  const swatch = createElement(documentRef, "span", "band-swatch compare-swatch");
  swatch.dataset.band = String(side.bandIndex);
  swatch.setAttribute("aria-hidden", "true");
  const name = createElement(documentRef, "span", "compare-name", side.unit.name);
  name.title = side.unit.name;
  heading.append(swatch, name);
  return heading;
}

/**
 * One term of the metrics list: its label, the A and B values, and the difference.
 *
 * @param {Document} documentRef
 * @param {CompareMetric} metric
 * @returns {HTMLDivElement}
 */
function buildMetric(documentRef, metric) {
  const group = createElement(
    documentRef,
    "div",
    `compare-metric ${readMetricLayoutClass(metric.id)}`,
  );
  group.dataset.metric = metric.id;
  group.append(
    buildMetricLabel(documentRef, metric),
    buildMetricValues(documentRef, metric),
    createElement(documentRef, "dd", "compare-metric-diff", metric.difference),
  );
  return group;
}

/**
 * Population, density and the synthetic value get a split bar; GDP per capita and area are
 * compact cards, two by two.
 *
 * @param {string} metricId
 * @returns {string}
 */
function readMetricLayoutClass(metricId) {
  return "compare-metric-bar";
}

/**
 * @param {Document} documentRef
 * @param {CompareMetric} metric
 * @returns {HTMLElement}
 */
function buildMetricLabel(documentRef, metric) {
  const label = createElement(documentRef, "dt", "compare-metric-label", metric.label);
  if (metric.unitLabel === "") {
    return label;
  }
  label.append(" ", createElement(documentRef, "span", "compare-metric-unit", metric.unitLabel));
  return label;
}

/**
 * @param {Document} documentRef
 * @param {CompareMetric} metric
 * @returns {HTMLElement}
 */
function buildMetricValues(documentRef, metric) {
  const values = createElement(documentRef, "dd", "compare-metric-values");
  const valueOfA = buildMetricValue(documentRef, metric, 0);
  const valueOfB = buildMetricValue(documentRef, metric, SIDE_B_INDEX);
  values.append(valueOfA, buildSplitBar(documentRef, metric.shareOfFirst), valueOfB);
  return values;
}

/**
 * @param {Document} documentRef
 * @param {CompareMetric} metric
 * @param {number} sideIndex 0 for A, 1 for B.
 * @returns {HTMLSpanElement}
 */
function buildMetricValue(documentRef, metric, sideIndex) {
  const sideName = SIDE_LETTERS[sideIndex].toLowerCase();
  const value = createElement(
    documentRef,
    "span",
    `compare-metric-value compare-value-${sideName}`,
    metric.values[sideIndex].text,
  );
  value.dataset.side = sideName;
  return value;
}

/**
 * Two segments whose widths follow the share of each value; an empty track without a split.
 *
 * @param {Document} documentRef
 * @param {number | null} shareOfFirst
 * @returns {HTMLSpanElement}
 */
function buildSplitBar(documentRef, shareOfFirst) {
  const bar = createElement(documentRef, "span", "compare-split");
  bar.setAttribute("aria-hidden", "true");
  if (shareOfFirst === null) {
    return bar;
  }
  const first = createElement(documentRef, "span", "compare-split-a");
  first.style.width = `${shareOfFirst}%`;
  const second = createElement(documentRef, "span", "compare-split-b");
  second.style.width = `${100 - shareOfFirst}%`;
  bar.append(first, second);
  return bar;
}

/**
 * @param {Document} documentRef
 * @returns {CompareParts}
 */
function buildCompareParts(documentRef) {
  const header = buildHeaderParts(documentRef);
  const sides = createElement(documentRef, "div", "compare-sides");
  const metrics = createElement(documentRef, "dl", "compare-metrics");
  const actions = buildActionParts(documentRef);
  const panel = buildPanel(documentRef, [header.element, sides, metrics, actions.element]);
  const reopenButton = buildReopenButton(documentRef);
  const dock = buildDock(documentRef, [panel, reopenButton]);
  return {
    dock,
    panel,
    title: header.title,
    count: header.count,
    invertButton: header.invertButton,
    minimizeButton: header.minimizeButton,
    sides,
    metrics,
    replaceSideBButton: actions.replaceSideBButton,
    focusButton: actions.focusButton,
    reopenButton,
  };
}

/**
 * Icon, title with the count, subtitle, and the two icon buttons.
 *
 * @param {Document} documentRef
 * @returns {HeaderParts}
 */
function buildHeaderParts(documentRef) {
  const title = createElement(documentRef, "h2", "compare-title");
  title.id = TITLE_ID;
  const count = createElement(documentRef, "span", "compare-count");
  const titleRow = createElement(documentRef, "div", "compare-title-row");
  titleRow.append(title, count);
  const heading = createElement(documentRef, "div", "compare-heading");
  heading.append(titleRow, createElement(documentRef, "p", "compare-subtitle", SUBTITLE_TEXT));

  const invertButton = buildIconButton(documentRef, INVERT_LABEL, SWAP_ICON);
  const minimizeButton = buildIconButton(documentRef, MINIMIZE_LABEL, MINIMIZE_ICON);
  minimizeButton.setAttribute("aria-controls", PANEL_ID);
  minimizeButton.setAttribute("aria-expanded", "true");
  const tools = createElement(documentRef, "div", "compare-tools");
  tools.append(invertButton, minimizeButton);

  const element = createElement(documentRef, "div", "compare-header");
  element.append(buildHeaderIcon(documentRef), heading, tools);
  return { element, title, count, invertButton, minimizeButton };
}

/**
 * @param {Document} documentRef
 * @returns {HTMLSpanElement}
 */
function buildHeaderIcon(documentRef) {
  const icon = createElement(documentRef, "span", "compare-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.append(buildIcon(documentRef, BARS_ICON));
  return icon;
}

/**
 * Trocar B (secondary) and Focar no relevo (primary).
 *
 * @param {Document} documentRef
 * @returns {ActionParts}
 */
function buildActionParts(documentRef) {
  const replaceSideBButton = buildActionButton(
    documentRef,
    REPLACE_SIDE_B_TEXT,
    "compare-action-secondary",
  );
  replaceSideBButton.prepend(buildIcon(documentRef, SWAP_ICON));
  const focusButton = buildActionButton(documentRef, FOCUS_TEXT, "compare-action-primary");
  focusButton.prepend(buildIcon(documentRef, FOCUS_ICON));

  const element = createElement(documentRef, "div", "compare-actions");
  element.append(replaceSideBButton, focusButton);
  return { element, replaceSideBButton, focusButton };
}

/**
 * @param {Document} documentRef
 * @param {HTMLElement[]} children
 * @returns {HTMLElement}
 */
function buildPanel(documentRef, children) {
  const panel = createElement(documentRef, "section", "compare-panel");
  panel.id = PANEL_ID;
  panel.setAttribute("aria-labelledby", TITLE_ID);
  panel.append(...children);
  return panel;
}

/**
 * The minimized panel: a pill in the same corner that opens it again.
 *
 * @param {Document} documentRef
 * @returns {HTMLButtonElement}
 */
function buildReopenButton(documentRef) {
  const button = createElement(documentRef, "button", "compare-reopen");
  button.type = "button";
  button.id = REOPEN_ID;
  button.hidden = true;
  button.setAttribute("aria-controls", PANEL_ID);
  button.setAttribute("aria-expanded", "false");
  button.append(
    buildIcon(documentRef, BARS_ICON),
    createElement(documentRef, "span", "compare-action-text", REOPEN_TEXT),
  );
  return button;
}

/**
 * @param {Document} documentRef
 * @param {HTMLElement[]} children
 * @returns {HTMLDivElement}
 */
function buildDock(documentRef, children) {
  const dock = createElement(documentRef, "div", "compare-dock");
  dock.id = DOCK_ID;
  dock.hidden = true;
  dock.append(...children);
  return dock;
}

/**
 * @param {Document} documentRef
 * @param {string} label
 * @param {string[]} iconPaths
 * @returns {HTMLButtonElement}
 */
function buildIconButton(documentRef, label, iconPaths) {
  const button = createElement(documentRef, "button", "compare-icon-button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(buildIcon(documentRef, iconPaths));
  return button;
}

/**
 * @param {Document} documentRef
 * @param {string} text
 * @param {string} variantClass
 * @returns {HTMLButtonElement}
 */
function buildActionButton(documentRef, text, variantClass) {
  const button = createElement(documentRef, "button", `compare-action ${variantClass}`);
  button.type = "button";
  button.append(createElement(documentRef, "span", "compare-action-text", text));
  return button;
}

/**
 * @param {Document} documentRef
 * @param {string[]} paths
 * @returns {SVGSVGElement}
 */
function buildIcon(documentRef, paths) {
  const svg = documentRef.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.append(...paths.map((pathData) => buildIconPath(documentRef, pathData)));
  return svg;
}

/**
 * @param {Document} documentRef
 * @param {string} pathData
 * @returns {SVGPathElement}
 */
function buildIconPath(documentRef, pathData) {
  const path = documentRef.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", pathData);
  return path;
}

/**
 * @template {keyof HTMLElementTagNameMap} TagName
 * @param {Document} documentRef
 * @param {TagName} tagName
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[TagName]}
 */
function createElement(documentRef, tagName, className, text) {
  const element = documentRef.createElement(tagName);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}
