import assert from "node:assert/strict";
import test from "node:test";
import { findIndicator, INDICATORS } from "../../domain/indicator.js";
import {
  changeIndicator,
  createIndicatorState,
  DEFAULT_INDICATOR_ID,
  INDICATOR_CHANGED,
  INDICATOR_IDS,
  reduceIndicator,
  selectIndicatorDefinition,
  selectIndicatorId,
} from "./indicator-slice.js";
import { buildIndicatorViewModel } from "./indicator-view.js";
import { mountSourceView } from "./source-view.js";

test("IND-01 initial indicator state is population", () => {
  const state = createIndicatorState();
  assert.equal(selectIndicatorId(state), DEFAULT_INDICATOR_ID);
  const def = selectIndicatorDefinition(state);
  assert.equal(def.id, "population");
  assert.equal(def.label, "População");
});

test("IND-02 indicator view model has 4 options inside fieldset", () => {
  const state = createIndicatorState();
  const model = buildIndicatorViewModel(state);
  assert.equal(model.title, "Indicador");
  assert.equal(model.currentIndicatorId, "population");
  assert.equal(model.options.length, 4);

  const ids = model.options.map((opt) => opt.id);
  assert.deepEqual(ids, ["population", "area", "density", "gdpPerCapita"]);
});

test("IND-03 catalog declares all 4 indicators with required fields and formatters", () => {
  for (const id of INDICATOR_IDS) {
    const def = INDICATORS[id];
    assert.ok(def, `Indicator ${id} must exist in catalog`);
    assert.equal(def.id, id);
    assert.ok(def.label.length > 0, `Label missing for ${id}`);
    assert.ok(def.unit.length > 0, `Unit missing for ${id}`);
    assert.ok(def.year.length > 0, `Year missing for ${id}`);
    assert.ok(def.source.length > 0, `Source missing for ${id}`);
    assert.ok(def.sourceUrl.startsWith("http"), `SourceUrl missing for ${id}`);
    assert.equal(typeof def.format, "function", `Format function missing for ${id}`);
    assert.equal(typeof def.formatAbbreviated, "function", `FormatAbbreviated missing for ${id}`);
  }
});

test("IND-04 changeIndicator action updates indicator in reducer", () => {
  const initial = createIndicatorState();
  const next = reduceIndicator(initial, changeIndicator("density"));
  assert.equal(selectIndicatorId(next), "density");
  assert.notEqual(next, initial);

  const back = reduceIndicator(next, changeIndicator("population"));
  assert.equal(selectIndicatorId(back), "population");
});

test("IND-04 reducer returns same reference for unknown indicator or identical id", () => {
  const initial = createIndicatorState();
  const unknown = reduceIndicator(initial, {
    type: INDICATOR_CHANGED,
    id: /** @type {any} */ ("invalido"),
  });
  assert.equal(unknown, initial);

  const same = reduceIndicator(initial, changeIndicator("population"));
  assert.equal(same, initial);
});

test("IND-05 gdpPerCapita displays composite year description", () => {
  const gdp = findIndicator("gdpPerCapita");
  assert.equal(gdp.yearDescription, "PIB 2023 / população 2022");
});

test("IND-06 mountSourceView creates banner with indicator, unit, year and source", () => {
  /** @type {Record<string, any>} */
  const elements = [];
  const fakeDoc = /** @type {any} */ ({
    createElement(/** @type {string} */ tag) {
      const el = {
        tagName: tag,
        className: "",
        id: "",
        textContent: "",
        children: /** @type {any[]} */ ([]),
        append(/** @type {any[]} */ ...children) {
          el.children.push(...children);
        },
      };
      elements.push(el);
      return el;
    },
  });

  const sourceView = mountSourceView(fakeDoc, findIndicator("gdpPerCapita"));
  assert.ok(sourceView.element);
  assert.equal(sourceView.getTitleElement().textContent, "PIB per capita");
  assert.equal(sourceView.getUnitElement().textContent, "R$");
  assert.equal(sourceView.getYearElement().textContent, "PIB 2023 / população 2022");
  assert.ok(sourceView.getSourceLink()?.textContent?.includes("IBGE"));

  sourceView.update("population");
  assert.equal(sourceView.getTitleElement().textContent, "População");
  assert.equal(sourceView.getUnitElement().textContent, "habitantes");
  assert.equal(sourceView.getYearElement().textContent, "Censo 2022");
});
