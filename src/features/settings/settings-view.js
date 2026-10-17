import {
  changeBorders,
  changeFraming,
  changeMotionReduced,
  changeShadow,
  changeTilt,
  changeViewAngle,
  VIEW_ANGLE_MAX,
  VIEW_ANGLE_MIN,
} from "./settings-slice.js";

/**
 * Height, exaggeration and color mode live in the column cards (LAY-10, CFG-05), not here.
 *
 * @typedef {import("./settings-slice.js").SettingsState} SettingsState
 * @typedef {{ type: string }} Action
 * @typedef {{
 *   viewAngleDegrees: number,
 *   viewAngleText: string,
 *   isFramingOn: boolean,
 *   isTiltOn: boolean,
 *   isShadowOn: boolean,
 *   areBordersOn: boolean,
 *   isMotionReduced: boolean
 * }} SettingsViewModel
 * @typedef {{
 *   element: HTMLElement,
 *   toggleButton: HTMLButtonElement,
 *   refresh: (state: SettingsState) => void
 * }} SettingsView
 */

const PANEL_ID = "settings-panel";
const CLOSE_KEY = "Escape";

/**
 * Pure rule: the values the controls show for a given settings state.
 *
 * @param {SettingsState} state
 * @returns {SettingsViewModel}
 */
export function buildSettingsViewModel(state) {
  return {
    viewAngleDegrees: state.viewAngleDegrees,
    viewAngleText: `${state.viewAngleDegrees}°`,
    isFramingOn: state.isFramingOn,
    isTiltOn: state.isTiltOn,
    isShadowOn: state.isShadowOn,
    areBordersOn: state.areBordersOn,
    isMotionReduced: state.isMotionReduced,
  };
}

/**
 * The exaggeration text of the height cards (appearance view).
 *
 * @param {number} exaggeration
 * @returns {string}
 */
export function formatExaggeration(exaggeration) {
  return `${exaggeration.toLocaleString("pt-BR")}x`;
}

/**
 * @param {boolean} isExpanded
 * @returns {boolean}
 */
export function toggleExpanded(isExpanded) {
  return !isExpanded;
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isCloseKey(key) {
  return key === CLOSE_KEY;
}

/**
 * Builds the collapsed toggle button and the settings panel, born with the values of `state`.
 * `dispatch` receives the action for each control change; the caller feeds new state to `refresh`.
 * Extra sections (such as measurements) are appended to the panel by the caller.
 *
 * @param {Document} documentRef
 * @param {SettingsState} state
 * @param {(action: Action) => void} dispatch
 * @returns {SettingsView}
 */
export function createSettingsView(documentRef, state, dispatch) {
  const toggleButton = buildToggleButton(documentRef);
  const panel = buildPanel(documentRef);
  const controls = buildControls(documentRef, dispatch);
  panel.append(...controls.groups);
  wireExpansion(toggleButton, panel);
  const element = documentRef.createElement("div");
  element.className = "settings";
  element.append(toggleButton, panel);
  const refresh = (/** @type {SettingsState} */ next) =>
    controls.apply(buildSettingsViewModel(next));
  refresh(state);
  return { element, toggleButton, refresh };
}

/**
 * @param {Document} documentRef
 * @returns {HTMLButtonElement}
 */
function buildToggleButton(documentRef) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "settings-toggle";
  button.id = "settings-toggle";
  button.textContent = "Configurações";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", PANEL_ID);
  return button;
}

/**
 * @param {Document} documentRef
 * @returns {HTMLElement}
 */
function buildPanel(documentRef) {
  const panel = documentRef.createElement("div");
  panel.id = PANEL_ID;
  panel.className = "settings-panel";
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Configurações");
  panel.hidden = true;
  return panel;
}

/**
 * @param {HTMLButtonElement} toggleButton
 * @param {HTMLElement} panel
 */
function wireExpansion(toggleButton, panel) {
  toggleButton.addEventListener("click", () => {
    const isExpanded = toggleButton.getAttribute("aria-expanded") === "true";
    setExpanded(toggleButton, panel, toggleExpanded(isExpanded));
  });
  panel.addEventListener("keydown", (event) => {
    if (!isCloseKey(event.key)) {
      return;
    }
    setExpanded(toggleButton, panel, false);
    toggleButton.focus();
  });
}

/**
 * @param {HTMLButtonElement} toggleButton
 * @param {HTMLElement} panel
 * @param {boolean} isExpanded
 */
function setExpanded(toggleButton, panel, isExpanded) {
  toggleButton.setAttribute("aria-expanded", String(isExpanded));
  panel.hidden = !isExpanded;
}

/**
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 */
function buildControls(documentRef, dispatch) {
  const framing = buildCheckbox(
    documentRef,
    dispatch,
    "toggle-fly",
    "Enquadrar as cidades selecionadas",
    changeFraming,
  );
  const tilt = buildCheckbox(
    documentRef,
    dispatch,
    "toggle-tilt",
    "Inclinação acompanha o mouse",
    changeTilt,
  );
  const angle = buildSlider(documentRef, dispatch, {
    id: "view-angle",
    label: "Ângulo de visão",
    min: VIEW_ANGLE_MIN,
    max: VIEW_ANGLE_MAX,
    step: 1,
    createAction: changeViewAngle,
  });
  const shadow = buildCheckbox(
    documentRef,
    dispatch,
    "toggle-shadow",
    "Sombra do estado e da cidade levantada",
    changeShadow,
  );
  const borders = buildCheckbox(
    documentRef,
    dispatch,
    "toggle-borders",
    "Divisas entre municípios",
    changeBorders,
  );
  const motion = buildCheckbox(
    documentRef,
    dispatch,
    "toggle-motion",
    "Simular movimento reduzido",
    changeMotionReduced,
  );
  return {
    groups: [
      buildFieldset(documentRef, "Câmera", [framing.element, tilt.element, angle.element]),
      buildFieldset(documentRef, "Luz e traço", [shadow.element, borders.element, motion.element]),
    ],
    apply: (/** @type {SettingsViewModel} */ viewModel) => {
      angle.show(viewModel.viewAngleDegrees, viewModel.viewAngleText);
      framing.show(viewModel.isFramingOn);
      tilt.show(viewModel.isTiltOn);
      shadow.show(viewModel.isShadowOn);
      borders.show(viewModel.areBordersOn);
      motion.show(viewModel.isMotionReduced);
    },
  };
}

/**
 * @param {Document} documentRef
 * @param {string} title
 * @param {HTMLElement[]} children
 */
function buildFieldset(documentRef, title, children) {
  const fieldset = documentRef.createElement("fieldset");
  fieldset.className = "settings-card";
  const legend = documentRef.createElement("legend");
  legend.textContent = title;
  fieldset.append(legend, ...children);
  return fieldset;
}

/**
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {string} id
 * @param {string} label
 * @param {(value: unknown) => Action} createAction
 */
function buildCheckbox(documentRef, dispatch, id, label, createAction) {
  const input = documentRef.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.autocomplete = "off";
  input.addEventListener("change", () => dispatch(createAction(input.checked)));
  const element = wrapWithLabel(documentRef, input, label);
  return {
    element,
    show: (/** @type {boolean} */ isChecked) => {
      input.checked = isChecked;
    },
  };
}

/**
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {{
 *   id: string,
 *   label: string,
 *   min: number,
 *   max: number,
 *   step: number,
 *   createAction: (value: unknown) => Action
 * }} spec
 */
function buildSlider(documentRef, dispatch, spec) {
  const input = documentRef.createElement("input");
  input.type = "range";
  input.id = spec.id;
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step);
  input.autocomplete = "off";
  input.addEventListener("input", () => dispatch(spec.createAction(Number(input.value))));
  const output = documentRef.createElement("output");
  output.htmlFor = spec.id;
  const element = wrapWithLabel(documentRef, input, spec.label);
  element.append(output);
  return {
    element,
    show: (/** @type {number} */ value, /** @type {string} */ text) => {
      input.value = String(value);
      output.textContent = text;
    },
  };
}

/**
 * @param {Document} documentRef
 * @param {HTMLInputElement} input
 * @param {string} text
 * @returns {HTMLLabelElement}
 */
function wrapWithLabel(documentRef, input, text) {
  const label = documentRef.createElement("label");
  label.className = "settings-choice";
  label.htmlFor = input.id;
  label.append(input, documentRef.createTextNode(text));
  return label;
}
