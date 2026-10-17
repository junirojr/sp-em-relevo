import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { classify } from "../../domain/classification.js";
import { computeStepHeight } from "../../domain/height.js";
import { INDICATORS } from "../../domain/indicator.js";
import { buildHowToReadViewModel, mountHowToReadView } from "./how-to-read-view.js";
import { buildLegendViewModel, mountLegendView } from "./legend-view.js";
import {
  buildBandLabels,
  formatBandLabel,
  HEAT_BAND_COUNT,
  hasMissingValues,
  selectBreaks,
  selectClassIndex,
  selectClassIndexes,
  selectHeightTargets,
  selectStepHeightTargets,
} from "./scale-slice.js";

/**
 * Creates a minimal DOM mock for testing HTML element mounting in Node.js.
 */
function createMockDocument() {
  /**
   * @param {string} tagName
   * @returns {any}
   */
  function createElement(tagName) {
    /** @type {any[]} */
    const children = [];
    return {
      tagName: tagName.toUpperCase(),
      className: "",
      textContent: "",
      open: false,
      hidden: false,
      /** @type {Record<string, string>} */
      attributes: {},
      style: {},
      children,
      /**
       * @param {string} name
       * @param {any} value
       */
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      /**
       * @param {string} name
       * @returns {string | null}
       */
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      /**
       * @param {any[]} elements
       */
      append(...elements) {
        for (const el of elements) {
          children.push(el);
        }
      },
      /**
       * @param {any[]} elements
       */
      replaceChildren(...elements) {
        children.length = 0;
        this.append(...elements);
      },
      /**
       * @param {string} selector
       * @returns {any[]}
       */
      querySelectorAll(selector) {
        /** @type {any[]} */
        const matches = [];
        /** @param {any} node */
        function walk(node) {
          if (!node?.children) {
            return;
          }
          for (const child of node.children) {
            if (selector.includes("li") && child.tagName === "LI") {
              matches.push(child);
            }
            walk(child);
          }
        }
        walk(this);
        return matches;
      },
    };
  }

  return { createElement };
}

function loadRealMunicipalities() {
  const content = fs.readFileSync("data/municipalities.json", "utf8");
  return JSON.parse(content).municipalities;
}

test("ESC-05 shared class function between legend and scene across 20 municipalities", () => {
  const municipalities = loadRealMunicipalities();
  assert.ok(municipalities.length >= 20);

  const sample = municipalities.slice(0, 20);
  const values = municipalities.map((/** @type {any} */ m) => m.population);
  const breaks = selectBreaks(values, "municipality");
  assert.equal(breaks.length, 6);

  for (const m of sample) {
    const sceneClass = classify(m.population, breaks);
    const legendClass = selectClassIndex(m.population, breaks);
    assert.equal(legendClass, sceneClass);
  }
});

test("ESC-05 band labels format breaks in abbreviated pt-BR without label box collision", () => {
  const breaks = [50000, 200000, 500000, 1000000, 2000000, 5000000];
  const labels = buildBandLabels(breaks, "population");

  assert.equal(labels.length, HEAT_BAND_COUNT);
  assert.equal(labels[0], "Até 50 mil");
  assert.equal(labels[1], "50 mil a 200 mil");
  assert.equal(labels[2], "200 mil a 500 mil");
  assert.equal(labels[3], "500 mil a 1 mi");
  assert.equal(labels[4], "1 mi a 2 mi");
  assert.equal(labels[5], "2 mi a 5 mi");
  assert.equal(labels[6], "Mais de 5 mi");

  const uniqueLabels = new Set(labels);
  assert.equal(uniqueLabels.size, HEAT_BAND_COUNT);
});

test("ESC-05 formatBandLabel formats GDP per capita with currency symbol", () => {
  const breaks = [20000, 40000, 60000, 80000, 100000, 150000];
  assert.equal(formatBandLabel(0, breaks, "gdpPerCapita"), "Até R$ 20 mil");
  assert.equal(formatBandLabel(1, breaks, "gdpPerCapita"), "R$ 20 mil a R$ 40 mil");
  assert.equal(formatBandLabel(6, breaks, "gdpPerCapita"), "Mais de R$ 150 mil");
});

test("ESC-05 selectClassIndexes and selectHeightTargets compute arrays accurately", () => {
  const values = new Float64Array([100, 60000, 300000, 0]);
  const breaks = [50000, 200000, 500000, 1000000, 2000000, 5000000];
  const classes = selectClassIndexes(values, breaks);

  assert.equal(classes.length, 4);
  assert.equal(classes[0], 0);
  assert.equal(classes[1], 1);
  assert.equal(classes[2], 2);
  assert.equal(classes[3], -1);

  const heights = selectHeightTargets(values);
  assert.equal(heights.length, 4);
  assert.ok(heights[1] > heights[0]);
  assert.ok(heights[2] > heights[1]);
  assert.equal(heights[3], 1);
});

test("ESC-07 HTML legend displays indicator, level, unit, year and source", () => {
  const indicator = INDICATORS.population;
  const breaks = [50000, 200000, 500000, 1000000, 2000000, 5000000];
  const labels = buildBandLabels(breaks, indicator.id);
  const colors = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#bddf26", "#fde725"];

  const viewModel = buildLegendViewModel({
    indicator,
    level: "municipality",
    labels,
    colors,
    hasMissing: false,
  });

  assert.equal(viewModel.indicatorLabel, "População");
  assert.equal(viewModel.levelLabel, "Município");
  assert.equal(viewModel.unit, "habitantes");
  assert.equal(viewModel.year, "2022");
  assert.equal(viewModel.source, "IBGE, Censo Demográfico");
  assert.equal(viewModel.bands.length, 7);
  assert.equal(viewModel.hasMissing, false);
});

test("ESC-07 'Sem dado' is hidden when no missing data and shown when present", () => {
  const doc = createMockDocument();
  const indicator = INDICATORS.population;
  const breaks = [50000, 200000, 500000, 1000000, 2000000, 5000000];
  const labels = buildBandLabels(breaks, indicator.id);
  const colors = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#bddf26", "#fde725"];

  const view = mountLegendView(doc, {
    indicator,
    level: "municipality",
    labels,
    colors,
    hasMissing: false,
  });

  assert.equal(view.missingElement.hidden, true);

  view.update({
    indicator,
    level: "municipality",
    labels,
    colors,
    hasMissing: true,
  });

  assert.equal(view.missingElement.hidden, false);
});

test("ESC-07 hasMissingValues identifies absent or non-positive values accurately", () => {
  assert.equal(hasMissingValues([10, 20, 30]), false);
  assert.equal(hasMissingValues([10, null, 30]), true);
  assert.equal(hasMissingValues([10, undefined, 30]), true);
  assert.equal(hasMissingValues([10, Number.NaN, 30]), true);
  assert.equal(hasMissingValues([10, 0, 30]), true);
  assert.equal(hasMissingValues([10, -5, 30]), true);
});

test("ESC-09 How to read this map details element is collapsed and contains three lines", () => {
  const doc = createMockDocument();
  const view = mountHowToReadView(doc);

  assert.equal(view.element.tagName, "DETAILS");
  assert.equal(view.element.open, false);
  assert.equal(view.summaryElement.textContent, "Como ler este mapa");

  const lines = view.listElement.children;
  assert.equal(lines.length, 3);

  const texts = lines.map((/** @type {any} */ l) => l.textContent);
  assert.ok(texts[0].startsWith("Escala:"));
  assert.ok(texts[1].startsWith("Altura:"));
  assert.ok(texts[2].startsWith("Agregação:"));

  for (const text of texts) {
    assert.equal(text.includes("\u2013"), false);
    assert.equal(text.includes("\u2014"), false);
  }
});

test("ESC-09 buildHowToReadViewModel provides three lines without forbidden characters", () => {
  const model = buildHowToReadViewModel();
  assert.equal(model.title, "Como ler este mapa");
  assert.equal(model.lines.length, 3);
  assert.equal(model.lines[0].key, "scale");
  assert.equal(model.lines[1].key, "height");
  assert.equal(model.lines[2].key, "aggregation");

  for (const line of model.lines) {
    assert.equal(line.text.includes("\u2013"), false);
    assert.equal(line.text.includes("\u2014"), false);
  }
});

const LEGEND_BREAKS = [50000, 200000, 500000, 1000000, 2000000, 5000000];
const LEGEND_COLORS = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#bddf26", "#fde725"];
/** @type {import("../../domain/height.js").HeightMode[]} */
const ALL_HEIGHT_MODES = ["data", "step", "flat"];

test("ESC-10 selectStepHeightTargets gives each unit the height of its heat band", () => {
  const values = new Float64Array([100, 60000, 70000, 300000, 7000000, 0]);
  const heights = selectStepHeightTargets(values, LEGEND_BREAKS, { exaggeration: 0.5 });

  assert.ok(heights instanceof Float32Array);
  assert.equal(heights.length, 6);
  assert.ok(Math.abs(heights[0] - (1 + 4.5 / 7)) < 1e-6);
  assert.equal(heights[1], heights[2]);
  assert.ok(heights[1] > heights[0]);
  assert.ok(heights[3] > heights[1]);
  assert.equal(heights[4], 5.5);
  assert.equal(heights[5], 1);
});

test("ESC-10 selectStepHeightTargets follows the exaggeration, like the proportional mode", () => {
  const values = new Float64Array([7000000]);
  const subtle = selectStepHeightTargets(values, LEGEND_BREAKS, { exaggeration: 0.4 });
  const strong = selectStepHeightTargets(values, LEGEND_BREAKS, { exaggeration: 2 });

  assert.ok(Math.abs(subtle[0] - 4.6) < 1e-6);
  assert.equal(strong[0], 19);
});

test("ESC-10 on real data the step height comes from the same class the legend uses", () => {
  const values = loadRealMunicipalities().map((/** @type {any} */ m) => m.population);
  const breaks = selectBreaks(values, "municipality");
  const heights = selectStepHeightTargets(values, breaks);

  for (let i = 0; i < values.length; i += 1) {
    const expected = computeStepHeight(selectClassIndex(values[i], breaks));
    assert.equal(heights[i], Math.fround(expected));
  }
});

test("ESC-11 legend view model describes the height by mode and has no row for flat", () => {
  const described = (/** @type {any} */ heightMode) =>
    buildLegendViewModel(buildLegendProps({ heightMode })).heightDescription;

  assert.equal(described("data"), "relevo proporcional ao valor");
  assert.equal(described("step"), "um degrau por faixa");
  assert.equal(described("flat"), null);
});

test("ESC-11 legend view model describes the proportional height when no mode is given", () => {
  const viewModel = buildLegendViewModel(buildLegendProps());
  assert.equal(viewModel.heightDescription, "relevo proporcional ao valor");
});

test("ESC-11 mounted legend shows the Altura 3D row by mode and drops it on flat", () => {
  const view = mountLegendView(createMockDocument(), buildLegendProps({ heightMode: "step" }));
  const height = findLegendRow(view.element, "Altura 3D");
  assert.equal(height.description.textContent, "um degrau por faixa");
  assert.equal(height.term.hidden, false);
  assert.equal(height.description.hidden, false);

  view.updateHeightMode("flat");
  assert.equal(height.term.hidden, true);
  assert.equal(height.description.hidden, true);

  view.updateHeightMode("data");
  assert.equal(height.description.textContent, "relevo proporcional ao valor");
  assert.equal(height.term.hidden, false);
  assert.equal(height.description.hidden, false);
});

test("ESC-11 mounted legend starts proportional and keeps the Cor row in every mode", () => {
  const view = mountLegendView(createMockDocument(), buildLegendProps());
  const height = findLegendRow(view.element, "Altura 3D");
  const color = findLegendRow(view.element, "Cor");
  assert.equal(height.description.textContent, "relevo proporcional ao valor");

  for (const heightMode of ALL_HEIGHT_MODES) {
    view.updateHeightMode(heightMode);
    assert.equal(color.term.hidden, false);
    assert.equal(color.description.hidden, false);
    assert.equal(color.description.textContent, "7 faixas de calor");
  }
});

test("ESC-11 legend keeps the height mode across updates that do not carry one", () => {
  const view = mountLegendView(createMockDocument(), buildLegendProps({ heightMode: "step" }));
  const height = findLegendRow(view.element, "Altura 3D");

  view.update(buildLegendProps({ hasMissing: true }));
  assert.equal(height.description.textContent, "um degrau por faixa");

  view.update(buildLegendProps({ heightMode: "flat" }));
  assert.equal(height.description.hidden, true);

  view.update(buildLegendProps());
  assert.equal(height.description.hidden, true);
  assert.equal(height.term.hidden, true);
});

test("ESC-11 how to read height line follows the mode and the other two lines stay", () => {
  const dataLines = buildHowToReadViewModel("data").lines;
  const stepLines = buildHowToReadViewModel("step").lines;
  const flatLines = buildHowToReadViewModel("flat").lines;

  for (const lines of [dataLines, stepLines, flatLines]) {
    assert.deepEqual(
      lines.map((line) => line.key),
      ["scale", "height", "aggregation"],
    );
    assert.ok(lines[1].text.startsWith("Altura:"));
  }
  assert.notEqual(dataLines[1].text, stepLines[1].text);
  assert.notEqual(stepLines[1].text, flatLines[1].text);
  assert.notEqual(dataLines[1].text, flatLines[1].text);
  assert.ok(stepLines[1].text.includes("faixa"));
  assert.equal(stepLines[0].text, dataLines[0].text);
  assert.equal(flatLines[2].text, dataLines[2].text);
});

test("ESC-11 how to read view model defaults to the proportional height line", () => {
  assert.deepEqual(buildHowToReadViewModel(), buildHowToReadViewModel("data"));
});

test("ESC-11 mounted how to read changes only the height line on a mode change", () => {
  const view = mountHowToReadView(createMockDocument(), "step");
  const readTexts = () => view.listElement.children.map((/** @type {any} */ l) => l.textContent);
  const before = readTexts();
  assert.equal(before[1], buildHowToReadViewModel("step").lines[1].text);

  view.updateHeightMode("flat");
  const after = readTexts();

  assert.equal(after.length, 3);
  assert.equal(after[0], before[0]);
  assert.equal(after[1], buildHowToReadViewModel("flat").lines[1].text);
  assert.notEqual(after[1], before[1]);
  assert.equal(after[2], before[2]);
  assert.equal(view.element.open, false);
});

test("ESC-11 height texts never use en dash or em dash, in any mode", () => {
  for (const heightMode of ALL_HEIGHT_MODES) {
    const legendText = buildLegendViewModel(buildLegendProps({ heightMode })).heightDescription;
    const lineTexts = buildHowToReadViewModel(heightMode).lines.map((line) => line.text);

    for (const text of [legendText ?? "", ...lineTexts]) {
      assert.equal(text.includes("\u2013"), false);
      assert.equal(text.includes("\u2014"), false);
    }
  }
});

/**
 * @param {Partial<import("./legend-view.js").LegendProps>} [overrides]
 * @returns {import("./legend-view.js").LegendProps}
 */
function buildLegendProps(overrides = {}) {
  const indicator = INDICATORS.population;
  return {
    indicator,
    level: "municipality",
    labels: buildBandLabels(LEGEND_BREAKS, indicator.id),
    colors: LEGEND_COLORS,
    hasMissing: false,
    ...overrides,
  };
}

/**
 * @param {any} legendElement the mounted legend root.
 * @param {string} term the dt text of the row.
 * @returns {{ term: any, description: any }}
 */
function findLegendRow(legendElement, term) {
  const rows = findByClassName(legendElement, "legend-rows");
  const termIndex = rows.children.findIndex(
    (/** @type {any} */ child) => child.tagName === "DT" && child.textContent === term,
  );
  assert.ok(termIndex >= 0, `row "${term}" exists`);
  return { term: rows.children[termIndex], description: rows.children[termIndex + 1] };
}

/**
 * @param {any} node
 * @param {string} className
 * @returns {any} the first descendant with that exact class name.
 */
function findByClassName(node, className) {
  if (node.className === className) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findByClassName(child, className);
    if (found) {
      return found;
    }
  }
  return null;
}
