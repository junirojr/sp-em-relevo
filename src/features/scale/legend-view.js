import { DEFAULT_HEIGHT_MODE } from "../../domain/height.js";

/**
 * @typedef {import("../../domain/indicator.js").IndicatorDefinition} IndicatorDefinition
 * @typedef {import("../../domain/classification.js").TerritorialLevel} TerritorialLevel
 * @typedef {import("../../domain/height.js").HeightMode} HeightMode
 *
 * @typedef {{
 *   indicator: IndicatorDefinition,
 *   level: TerritorialLevel,
 *   labels: readonly string[],
 *   colors: readonly string[],
 *   hasMissing: boolean,
 *   metrics?: LegendMetrics,
 *   heightMode?: HeightMode
 * }} LegendProps
 *   `heightMode` defaults to the proportional mode; on `update` it keeps the current mode when
 *   left out.
 *
 * @typedef {{ items: ReadonlyArray<{ label: string, value: string }> }} LegendMetrics three
 *   figures, label and value, in display order.
 *
 * @typedef {{
 *   color: string,
 *   label: string
 * }} BandItemModel
 *
 * @typedef {{
 *   indicatorLabel: string,
 *   levelLabel: string,
 *   unit: string,
 *   year: string,
 *   source: string,
 *   bands: BandItemModel[],
 *   hasMissing: boolean,
 *   heightDescription: string | null
 * }} LegendViewModel `heightDescription` is null when the "Altura 3D" row must not show.
 *
 * @typedef {{ termElement: any, descriptionElement: any }} LegendRow
 */

const ACTIVE_LAYER_LABEL = "Camada ativa";
const METRIC_SLOTS = 3;

/** @type {Record<HeightMode, string | null>} */
const HEIGHT_DESCRIPTIONS = {
  data: "relevo proporcional ao valor",
  step: "um degrau por faixa",
  flat: null,
};

const LEVEL_LABELS = {
  municipality: "Município",
  region: "Região administrativa",
};

/**
 * Builds the view model for the scale legend.
 * Follows ESC-07 and ESC-11: the "Altura 3D" text follows the height mode, and the row is gone
 * in the flat mode.
 *
 * @param {LegendProps} props
 * @returns {LegendViewModel}
 */
export function buildLegendViewModel(props) {
  const bands = [];
  const count = Math.min(props.labels.length, props.colors.length);
  for (let i = 0; i < count; i += 1) {
    bands.push({
      color: props.colors[i],
      label: props.labels[i],
    });
  }

  return {
    indicatorLabel: props.indicator.label,
    levelLabel: formatLevelLabel(props.level),
    unit: props.indicator.unit,
    year: props.indicator.year,
    source: props.indicator.source,
    bands,
    hasMissing: props.hasMissing,
    heightDescription: describeHeight(props.heightMode ?? DEFAULT_HEIGHT_MODE),
  };
}

/**
 * @param {HeightMode} heightMode
 * @returns {string | null} null when the mode has nothing to say about the height (flat).
 */
function describeHeight(heightMode) {
  return HEIGHT_DESCRIPTIONS[heightMode];
}

/**
 * @param {TerritorialLevel} level
 * @returns {string}
 */
function formatLevelLabel(level) {
  if (level === "region") {
    return LEVEL_LABELS.region;
  }
  return LEVEL_LABELS.municipality;
}

/**
 * Mounts the HTML legend displaying heat bands and metadata.
 * Follows ESC-07.
 *
 * @param {any} documentRef
 * @param {LegendProps} initialProps
 */
export function mountLegendView(documentRef, initialProps) {
  const container = documentRef.createElement("section");
  container.className = "scale-legend";

  const badge = documentRef.createElement("span");
  badge.className = "legend-badge";
  badge.textContent = ACTIVE_LAYER_LABEL;

  const header = documentRef.createElement("div");
  header.className = "legend-header";

  const indicatorSpan = documentRef.createElement("span");
  indicatorSpan.className = "legend-indicator";

  const levelSpan = documentRef.createElement("span");
  levelSpan.className = "legend-level";

  header.append(indicatorSpan, documentRef.createElement("span"), levelSpan);

  const meta = documentRef.createElement("div");
  meta.className = "legend-meta";

  const unitSpan = documentRef.createElement("span");
  unitSpan.className = "legend-unit";

  const yearSpan = documentRef.createElement("span");
  yearSpan.className = "legend-year";

  const sourceSpan = documentRef.createElement("span");
  sourceSpan.className = "legend-source";

  meta.append(unitSpan, yearSpan, sourceSpan);

  const metricsElement = documentRef.createElement("div");
  metricsElement.className = "legend-metrics";
  metricsElement.hidden = true;
  /** @type {Array<{ labelElement: any, valueElement: any }>} */
  const metricSlots = [];
  for (let i = 0; i < METRIC_SLOTS; i += 1) {
    const item = documentRef.createElement("div");
    item.className = "legend-metric";
    const labelElement = documentRef.createElement("span");
    labelElement.className = "legend-metric-label";
    const valueElement = documentRef.createElement("span");
    valueElement.className = "legend-metric-value";
    item.append(labelElement, valueElement);
    metricsElement.append(item);
    metricSlots.push({ labelElement, valueElement });
  }

  const ramp = documentRef.createElement("div");
  ramp.className = "legend-ramp";
  ramp.setAttribute("aria-hidden", "true");

  const bandsList = documentRef.createElement("ol");
  bandsList.className = "legend-bands";

  const rows = documentRef.createElement("dl");
  rows.className = "legend-rows";
  const heightRow = appendRow(documentRef, rows, "Altura 3D");
  const colorRow = appendRow(documentRef, rows, "Cor");
  let heightMode = DEFAULT_HEIGHT_MODE;

  const missingContainer = documentRef.createElement("div");
  missingContainer.className = "legend-missing";
  missingContainer.hidden = true;

  const missingColor = documentRef.createElement("span");
  missingColor.className = "band-color neutral";

  const missingLabel = documentRef.createElement("span");
  missingLabel.className = "band-label";
  missingLabel.textContent = "Sem dado";

  missingContainer.append(missingColor, missingLabel);

  container.append(badge, header, metricsElement, ramp, bandsList, rows, meta, missingContainer);

  /**
   * @param {LegendProps} props
   */
  function render(props) {
    heightMode = props.heightMode ?? heightMode;
    const model = buildLegendViewModel({ ...props, heightMode });

    indicatorSpan.textContent = model.indicatorLabel;
    levelSpan.textContent = `(${model.levelLabel})`;

    unitSpan.textContent = model.unit;
    yearSpan.textContent = model.year;
    sourceSpan.textContent = `Fonte: ${model.source}`;

    if (props.metrics) {
      renderMetrics(metricsElement, metricSlots, props.metrics);
    }
    ramp.style.backgroundImage = buildRampGradient(props.colors);
    renderHeightRow(heightRow, model.heightDescription);
    colorRow.descriptionElement.textContent = `${model.bands.length} faixas de calor`;
    renderBands(bandsList, model.bands, documentRef);
    missingContainer.hidden = !model.hasMissing;
  }

  render(initialProps);

  return {
    element: container,
    missingElement: missingContainer,
    update: (/** @type {LegendProps} */ nextProps) => {
      render(nextProps);
    },
    updateMetrics: (/** @type {LegendMetrics} */ metrics) => {
      renderMetrics(metricsElement, metricSlots, metrics);
    },
    updateHeightMode: (/** @type {HeightMode} */ nextHeightMode) => {
      heightMode = nextHeightMode;
      renderHeightRow(heightRow, describeHeight(nextHeightMode));
    },
  };
}

/**
 * @param {any} documentRef
 * @param {any} list
 * @param {string} term
 * @returns {LegendRow} the term and description elements of the new row.
 */
function appendRow(documentRef, list, term) {
  const termElement = documentRef.createElement("dt");
  termElement.textContent = term;
  const descriptionElement = documentRef.createElement("dd");
  list.append(termElement, descriptionElement);
  return { termElement, descriptionElement };
}

/**
 * Shows the "Altura 3D" row with its description, or hides the whole row when there is none.
 *
 * @param {LegendRow} row
 * @param {string | null} description
 */
function renderHeightRow(row, description) {
  const isRowHidden = description === null;
  row.termElement.hidden = isRowHidden;
  row.descriptionElement.hidden = isRowHidden;
  row.descriptionElement.textContent = description ?? "";
}

/**
 * @param {any} metricsElement
 * @param {Array<{ labelElement: any, valueElement: any }>} slots
 * @param {LegendMetrics} metrics
 */
function renderMetrics(metricsElement, slots, metrics) {
  for (let i = 0; i < slots.length; i += 1) {
    const metric = metrics.items[i];
    if (!metric) {
      slots[i].labelElement.textContent = "";
      slots[i].valueElement.textContent = "";
      continue;
    }
    slots[i].labelElement.textContent = metric.label;
    slots[i].valueElement.textContent = metric.value;
  }
  metricsElement.hidden = false;
}

/**
 * @param {readonly string[]} colors
 * @returns {string} a left to right gradient through every band color.
 */
function buildRampGradient(colors) {
  if (colors.length < 2) {
    return "none";
  }
  return `linear-gradient(90deg, ${colors.join(", ")})`;
}

/**
 * @param {any} listElement
 * @param {BandItemModel[]} bands
 * @param {any} documentRef
 */
function renderBands(listElement, bands, documentRef) {
  listElement.replaceChildren();

  for (let i = 0; i < bands.length; i += 1) {
    const item = bands[i];
    const li = documentRef.createElement("li");
    li.className = "band-item";

    const swatch = documentRef.createElement("span");
    swatch.className = "band-color";
    swatch.style.backgroundColor = item.color;

    const label = documentRef.createElement("span");
    label.className = "band-label";
    label.textContent = item.label;

    li.append(swatch, label);
    listElement.append(li);
  }
}
