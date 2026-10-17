import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAppearanceViewModel, createAppearanceView } from "./appearance-view.js";
import { changeHeightMode, createSettingsState, reduceSettings } from "./settings-slice.js";

test("CFG-05 view model of the initial state: heat, proportional, 0,5x, range enabled", () => {
  const viewModel = buildAppearanceViewModel(createSettingsState());
  assert.equal(viewModel.colorMode, "heat");
  assert.equal(viewModel.heightMode, "data");
  assert.equal(viewModel.exaggeration, 0.5);
  assert.equal(viewModel.exaggerationText, "0,5x");
  assert.equal(viewModel.isExaggerationDisabled, false);
});

test("CFG-05 view model disables the exaggeration range only with flat height", () => {
  const flat = reduceSettings(createSettingsState(), changeHeightMode("flat"));
  assert.equal(buildAppearanceViewModel(flat).isExaggerationDisabled, true);

  const step = { ...createSettingsState(), heightMode: /** @type {any} */ ("step") };
  assert.equal(buildAppearanceViewModel(step).isExaggerationDisabled, false);
});

test("CFG-05 view model writes the exaggeration with a decimal comma", () => {
  const state = { ...createSettingsState(), exaggeration: 1.3 };
  assert.equal(buildAppearanceViewModel(state).exaggerationText, "1,3x");
});

test("LAY-10 color group is a fieldset with 2 cards: Mapa de calor and Destaque", () => {
  const view = mountView();
  const fieldset = findFieldsetByName(view.element, "color-mode");
  assert.equal(legendText(fieldset), "Cor do mapa");
  assert.deepEqual(readCards(fieldset), [
    { value: "heat", name: "Mapa de calor", note: "7 faixas" },
    { value: "selection", name: "Destaque", note: "Só a seleção" },
  ]);
});

test("LAY-10 height group is a fieldset with 3 cards: Plana, Degrau and Proporcional", () => {
  const view = mountView();
  const fieldset = findFieldsetByName(view.element, "height-mode");
  assert.equal(legendText(fieldset), "Altura (eixo Z)");
  assert.deepEqual(readCards(fieldset), [
    { value: "flat", name: "Plana", note: "Igual" },
    { value: "step", name: "Degrau", note: "Por faixa" },
    { value: "data", name: "Proporcional", note: "Pelo valor" },
  ]);
});

test("LAY-10 the (eixo Z) detail of the height legend sits in its own span", () => {
  const view = mountView();
  const fieldset = findFieldsetByName(view.element, "height-mode");
  const axisSpans = findAll(fieldset, (node) => node.className === "appearance-legend-axis");
  assert.equal(axisSpans.length, 1);
  assert.equal(axisSpans[0].textContent, "(eixo Z)");
});

test("LAY-10 the exaggeration range sits inside the height group, from 0,4 to 2 in steps of 0,1", () => {
  const view = mountView();
  const heightFieldset = findFieldsetByName(view.element, "height-mode");
  const colorFieldset = findFieldsetByName(view.element, "color-mode");
  const ranges = findAll(heightFieldset, isRange);
  assert.equal(ranges.length, 1);
  assert.equal(findAll(colorFieldset, isRange).length, 0);
  assert.equal(ranges[0].min, "0.4");
  assert.equal(ranges[0].max, "2");
  assert.equal(ranges[0].step, "0.1");
});

test("LAY-10 each radio value maps to the settings action of its group", () => {
  const dispatched = /** @type {any[]} */ ([]);
  const view = mountView(createSettingsState(), (action) => dispatched.push(action));

  const radios = findAll(view.element, isRadio);
  for (const radio of radios) {
    radio.fire("change");
  }

  const changes = dispatched.map((action) => [action.name, action.value]);
  assert.deepEqual(changes, [
    ["colorMode", "heat"],
    ["colorMode", "selection"],
    ["heightMode", "flat"],
    ["heightMode", "step"],
    ["heightMode", "data"],
  ]);
  assert.ok(dispatched.every((action) => action.type === "settings/changed"));
});

test("CFG-05 the range dispatches the exaggeration as a number", () => {
  const dispatched = /** @type {any[]} */ ([]);
  const view = mountView(createSettingsState(), (action) => dispatched.push(action));

  const range = findAll(view.element, isRange)[0];
  range.value = "1.5";
  range.fire("input");

  assert.deepEqual(dispatched, [{ type: "settings/changed", name: "exaggeration", value: 1.5 }]);
});

test("LAY-10 cards are born checked from the state, with autocomplete off and unique ids", () => {
  const state = { ...createSettingsState(), colorMode: /** @type {const} */ ("selection") };
  const view = mountView(state);

  const radios = findAll(view.element, isRadio);
  assert.deepEqual(checkedValues(radios), ["selection", "data"]);
  assert.ok(radios.every((radio) => radio.autocomplete === "off"));

  const ids = findAll(view.element, isInput).map((input) => input.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("appearance-")));
});

test("LAY-10 update moves the checked cards and disables the range with flat height", () => {
  const view = mountView();
  const flatState = reduceSettings(createSettingsState(), changeHeightMode("flat"));

  view.update(buildAppearanceViewModel(flatState));

  const radios = findAll(view.element, isRadio);
  assert.deepEqual(checkedValues(radios), ["heat", "flat"]);
  const range = findAll(view.element, isRange)[0];
  assert.equal(range.disabled, true);
  assert.equal(range.value, "0.5");
  const output = findAll(view.element, (node) => node.tagName === "output")[0];
  assert.equal(output.textContent, "0,5x");
});

/**
 * @param {import("./settings-slice.js").SettingsState} [state]
 * @param {(action: { type: string }) => void} [dispatch]
 */
function mountView(state = createSettingsState(), dispatch = () => {}) {
  return createAppearanceView(createFakeDocument(), state, dispatch);
}

/**
 * @param {any} root
 * @param {string} radioName
 */
function findFieldsetByName(root, radioName) {
  const fieldsets = findAll(root, (node) => node.tagName === "fieldset");
  const matching = fieldsets.filter((fieldset) =>
    findAll(fieldset, isRadio).some((radio) => radio.name === radioName),
  );
  assert.equal(matching.length, 1);
  return matching[0];
}

/** @param {any} fieldset */
function legendText(fieldset) {
  const legends = findAll(fieldset, (node) => node.tagName === "legend");
  assert.equal(legends.length, 1);
  return collectText(legends[0]);
}

/** @param {any} fieldset */
function readCards(fieldset) {
  const labels = findAll(fieldset, (node) => node.className === "appearance-card");
  return labels.map((label) => ({
    value: findAll(label, isRadio)[0].value,
    name: findAll(label, (node) => node.className === "appearance-card-name")[0].textContent,
    note: findAll(label, (node) => node.className === "appearance-card-note")[0].textContent,
  }));
}

/** @param {any[]} radios */
function checkedValues(radios) {
  return radios.filter((radio) => radio.checked).map((radio) => radio.value);
}

/** @param {any} node */
function isRadio(node) {
  return node.tagName === "input" && node.type === "radio";
}

/** @param {any} node */
function isRange(node) {
  return node.tagName === "input" && node.type === "range";
}

/** @param {any} node */
function isInput(node) {
  return node.tagName === "input";
}

/**
 * @param {any} node
 * @param {(node: any) => boolean} matches
 * @returns {any[]}
 */
function findAll(node, matches) {
  if (typeof node === "string") {
    return [];
  }
  const descendants = node.children.flatMap((/** @type {any} */ child) => findAll(child, matches));
  if (matches(node)) {
    return [node, ...descendants];
  }
  return descendants;
}

/** @param {any} node */
function collectText(node) {
  if (typeof node === "string") {
    return node;
  }
  const parts = node.children.map((/** @type {any} */ child) => collectText(child));
  return node.textContent + parts.join("");
}

function createFakeDocument() {
  return /** @type {any} */ ({
    createElement: (/** @type {string} */ tag) => createFakeElement(tag),
  });
}

/** @param {string} tagName */
function createFakeElement(tagName) {
  /** @type {Record<string, Array<() => void>>} */
  const listeners = {};
  const element = {
    tagName,
    className: "",
    id: "",
    textContent: "",
    type: "",
    name: "",
    value: "",
    min: "",
    max: "",
    step: "",
    htmlFor: "",
    autocomplete: "",
    checked: false,
    disabled: false,
    children: /** @type {any[]} */ ([]),
    append(/** @type {any[]} */ ...nodes) {
      element.children.push(...nodes);
    },
    addEventListener(/** @type {string} */ type, /** @type {() => void} */ listener) {
      listeners[type] = [...(listeners[type] ?? []), listener];
    },
    fire(/** @type {string} */ type) {
      for (const listener of listeners[type] ?? []) {
        listener();
      }
    },
  };
  return element;
}
