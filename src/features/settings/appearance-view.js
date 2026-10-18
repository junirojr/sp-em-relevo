import {
  changeColorMode,
  changeExaggeration,
  changeHeightMode,
  EXAGGERATION_MAX,
  EXAGGERATION_MIN,
  EXAGGERATION_STEP,
} from "./settings-slice.js";
import { formatExaggeration } from "./settings-view.js";

/**
 * @typedef {import("./settings-slice.js").SettingsState} SettingsState
 * @typedef {{ type: string }} Action
 * @typedef {{ value: string, label: string, note: string }} ChoiceOption
 * @typedef {{
 *   key: string,
 *   name: string,
 *   title: string,
 *   titleDetail: string,
 *   options: readonly ChoiceOption[],
 *   createAction: (value: unknown) => Action
 * }} ChoiceGroup
 * @typedef {{
 *   colorMode: string,
 *   heightMode: string,
 *   exaggeration: number,
 *   exaggerationText: string,
 *   isExaggerationDisabled: boolean
 * }} AppearanceViewModel
 * @typedef {{
 *   element: HTMLElement,
 *   update: (viewModel: AppearanceViewModel) => void
 * }} AppearanceView
 */

const FLAT_HEIGHT_MODE = "flat";
const EXAGGERATION_ID = "appearance-exaggeration";
const EXAGGERATION_LABEL = "Exagero da altura";

/** @type {ChoiceGroup} */
const COLOR_GROUP = {
  key: "color",
  name: "color-mode",
  title: "Cor do mapa",
  titleDetail: "",
  options: [
    { value: "heat", label: "Mapa de calor", note: "7 faixas" },
    { value: "selection", label: "Destaque", note: "Só a seleção" },
    { value: "region", label: "Região", note: "16 cores" },
  ],
  createAction: changeColorMode,
};

/** @type {ChoiceGroup} */
const HEIGHT_GROUP = {
  key: "height",
  name: "height-mode",
  title: "Altura",
  titleDetail: "(eixo Z)",
  options: [
    { value: "flat", label: "Plana", note: "Igual" },
    { value: "step", label: "Degrau", note: "Por faixa" },
    { value: "data", label: "Proporcional", note: "Pelo valor" },
  ],
  createAction: changeHeightMode,
};

/**
 * Pure rule: the values the color cards, height cards and exaggeration range show for a given
 * settings state. The range is disabled while the height is flat (CFG-05).
 *
 * @param {SettingsState} state
 * @returns {AppearanceViewModel}
 */
export function buildAppearanceViewModel(state) {
  return {
    colorMode: state.colorMode,
    heightMode: state.heightMode,
    exaggeration: state.exaggeration,
    exaggerationText: formatExaggeration(state.exaggeration),
    isExaggerationDisabled: state.heightMode === FLAT_HEIGHT_MODE,
  };
}

/**
 * Builds the "Cor do mapa" and "Altura (eixo Z)" groups (LAY-10), born with the values of `state`.
 * `dispatch` receives the settings action for each change; the caller feeds the new view model to
 * `update`.
 *
 * @param {Document} documentRef
 * @param {SettingsState} state
 * @param {(action: Action) => void} dispatch
 * @returns {AppearanceView}
 */
export function createAppearanceView(documentRef, state, dispatch) {
  const colorGroup = buildChoiceGroup(documentRef, dispatch, COLOR_GROUP);
  const heightGroup = buildChoiceGroup(documentRef, dispatch, HEIGHT_GROUP);
  const exaggeration = buildExaggerationControl(documentRef, dispatch);
  heightGroup.element.append(exaggeration.element);

  const element = documentRef.createElement("div");
  element.className = "appearance";
  element.append(colorGroup.element, heightGroup.element);

  const update = (/** @type {AppearanceViewModel} */ viewModel) => {
    colorGroup.show(viewModel.colorMode);
    heightGroup.show(viewModel.heightMode);
    exaggeration.show(viewModel);
  };
  update(buildAppearanceViewModel(state));
  return { element, update };
}

/**
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {ChoiceGroup} group
 */
function buildChoiceGroup(documentRef, dispatch, group) {
  const cards = group.options.map((option) => buildCard(documentRef, group, option));
  wireChoiceChanges(cards, group, dispatch);

  const grid = documentRef.createElement("div");
  grid.className = "appearance-cards";
  grid.append(...cards.map((card) => card.label));

  const fieldset = documentRef.createElement("fieldset");
  fieldset.className = `appearance-group appearance-group-${group.key}`;
  fieldset.append(buildLegend(documentRef, group), grid);

  const show = (/** @type {string} */ chosenValue) => checkChosen(cards, chosenValue);
  return { element: fieldset, show };
}

/**
 * @param {Document} documentRef
 * @param {ChoiceGroup} group
 * @param {ChoiceOption} option
 */
function buildCard(documentRef, group, option) {
  const input = documentRef.createElement("input");
  input.type = "radio";
  input.name = group.name;
  input.value = option.value;
  input.id = `appearance-${group.key}-${option.value}`;
  input.autocomplete = "off";

  const body = documentRef.createElement("span");
  body.className = "appearance-card-body";
  body.append(
    buildSpan(documentRef, "appearance-card-name", option.label),
    buildSpan(documentRef, "appearance-card-note", option.note),
  );

  const label = documentRef.createElement("label");
  label.className = "appearance-card";
  label.append(input, body);
  return { label, input };
}

/**
 * @param {Array<{ input: HTMLInputElement }>} cards
 * @param {ChoiceGroup} group
 * @param {(action: Action) => void} dispatch
 */
function wireChoiceChanges(cards, group, dispatch) {
  for (const { input } of cards) {
    input.addEventListener("change", () => dispatch(group.createAction(input.value)));
  }
}

/**
 * @param {Document} documentRef
 * @param {ChoiceGroup} group
 */
function buildLegend(documentRef, group) {
  const legend = documentRef.createElement("legend");
  legend.className = "appearance-legend";
  legend.append(group.title);
  if (group.titleDetail === "") {
    return legend;
  }
  legend.append(" ", buildSpan(documentRef, "appearance-legend-axis", group.titleDetail));
  return legend;
}

/**
 * @param {Array<{ input: HTMLInputElement }>} cards
 * @param {string} chosenValue
 */
function checkChosen(cards, chosenValue) {
  for (const { input } of cards) {
    input.checked = input.value === chosenValue;
  }
}

/**
 * @param {Document} documentRef
 * @param {string} className
 * @param {string} text
 */
function buildSpan(documentRef, className, text) {
  const span = documentRef.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

/**
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 */
function buildExaggerationControl(documentRef, dispatch) {
  const input = buildExaggerationInput(documentRef, dispatch);
  const output = documentRef.createElement("output");
  output.htmlFor = input.id;

  const label = documentRef.createElement("label");
  label.className = "appearance-exaggeration";
  label.append(
    buildSpan(documentRef, "appearance-exaggeration-label", EXAGGERATION_LABEL),
    output,
    input,
  );

  const show = (/** @type {AppearanceViewModel} */ viewModel) => {
    input.value = String(viewModel.exaggeration);
    input.disabled = viewModel.isExaggerationDisabled;
    output.textContent = viewModel.exaggerationText;
  };
  return { element: label, show };
}

/**
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 */
function buildExaggerationInput(documentRef, dispatch) {
  const input = documentRef.createElement("input");
  input.type = "range";
  input.id = EXAGGERATION_ID;
  input.min = String(EXAGGERATION_MIN);
  input.max = String(EXAGGERATION_MAX);
  input.step = String(EXAGGERATION_STEP);
  input.autocomplete = "off";
  input.addEventListener("input", () => dispatch(changeExaggeration(Number(input.value))));
  return input;
}
