import {
  changeDrawNumber,
  DEFAULT_DRAW_NUMBER,
  DISABLED_INDICATOR_REASON,
  disableDemo,
  enableDemo,
  MAX_DRAW_NUMBER,
  MIN_DRAW_NUMBER,
  normalizeDrawNumber,
  pickRandomDrawNumber,
} from "./demo-slice.js";

/**
 * @typedef {import("./demo-slice.js").DemoState} DemoState
 * @typedef {{ type: string }} Action
 *
 * @typedef {{
 *   isActive: boolean,
 *   drawNumber: number,
 *   minDraw: number,
 *   maxDraw: number
 * }} DemoSettingsViewModel
 *
 * @typedef {{
 *   isVisible: boolean,
 *   title: string,
 *   buttonText: string
 * }} StageBannerViewModel
 *
 * @typedef {{
 *   isVisible: boolean,
 *   reason: string
 * }} IndicatorNoticeViewModel
 */

export const STAGE_BANNER_TITLE = "Dado sintético";
const RETURN_BUTTON_TEXT = "Voltar ao dado real";

/**
 * Pure rule: builds view model for the demo section inside Settings.
 *
 * @param {DemoState} state
 * @returns {DemoSettingsViewModel}
 */
export function buildDemoSettingsViewModel(state) {
  return {
    isActive: state.isActive,
    drawNumber: state.drawNumber,
    minDraw: MIN_DRAW_NUMBER,
    maxDraw: MAX_DRAW_NUMBER,
  };
}

/**
 * Pure rule: builds view model for the stage banner.
 *
 * @param {DemoState} state
 * @returns {StageBannerViewModel}
 */
export function buildStageBannerViewModel(state) {
  return {
    isVisible: state.isActive,
    title: STAGE_BANNER_TITLE,
    buttonText: RETURN_BUTTON_TEXT,
  };
}

/**
 * Pure rule: builds view model for the notice shown beside disabled indicators.
 *
 * @param {DemoState} state
 * @returns {IndicatorNoticeViewModel}
 */
export function buildIndicatorNoticeViewModel(state) {
  if (!state.isActive) {
    return {
      isVisible: false,
      reason: "",
    };
  }
  return {
    isVisible: true,
    reason: DISABLED_INDICATOR_REASON,
  };
}

/**
 * Mounts the demo toggle, draw number input, and draw button for Settings.
 *
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 */
export function mountDemoSettingsControl(documentRef, dispatch) {
  const container = documentRef.createElement("div");
  container.className = "demo-settings-control";

  const toggleLabel = documentRef.createElement("label");
  toggleLabel.className = "settings-choice demo-toggle-label";

  const toggleInput = documentRef.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.id = "demo-active-toggle";
  toggleInput.autocomplete = "off";

  const toggleText = documentRef.createTextNode("Usar dado sintético (demo)");
  toggleLabel.append(toggleInput, toggleText);

  const drawRow = documentRef.createElement("div");
  drawRow.className = "demo-draw-row";

  const drawInputLabel = documentRef.createElement("label");
  drawInputLabel.htmlFor = "demo-draw-number";
  drawInputLabel.className = "demo-draw-label";
  drawInputLabel.textContent = "Sorteio:";

  const drawInput = documentRef.createElement("input");
  drawInput.type = "number";
  drawInput.id = "demo-draw-number";
  drawInput.min = String(MIN_DRAW_NUMBER);
  drawInput.max = String(MAX_DRAW_NUMBER);
  drawInput.step = "1";
  drawInput.value = String(DEFAULT_DRAW_NUMBER);
  drawInput.autocomplete = "off";

  const drawButton = documentRef.createElement("button");
  drawButton.type = "button";
  drawButton.id = "demo-draw-button";
  drawButton.className = "action demo-draw-button";
  drawButton.textContent = "Sortear";

  drawRow.append(drawInputLabel, drawInput, drawButton);
  container.append(toggleLabel, drawRow);

  toggleInput.addEventListener("change", () => {
    handleToggleChange(toggleInput, drawInput, dispatch);
  });

  drawInput.addEventListener("change", () => {
    handleDrawInputChange(drawInput, dispatch);
  });

  drawButton.addEventListener("click", () => {
    handleDrawButtonClick(drawInput, toggleInput, dispatch);
  });

  return {
    element: container,
    update: (/** @type {DemoState} */ state) => {
      const model = buildDemoSettingsViewModel(state);
      toggleInput.checked = model.isActive;
      drawInput.value = String(model.drawNumber);
    },
  };
}

/**
 * @param {HTMLInputElement} toggleInput
 * @param {HTMLInputElement} drawInput
 * @param {(action: Action) => void} dispatch
 */
function handleToggleChange(toggleInput, drawInput, dispatch) {
  if (!toggleInput.checked) {
    dispatch(disableDemo());
    return;
  }
  const parsed = normalizeDrawNumber(Number(drawInput.value));
  const drawNumber = resolveValidDraw(parsed, DEFAULT_DRAW_NUMBER);
  drawInput.value = String(drawNumber);
  dispatch(enableDemo(drawNumber));
}

/**
 * @param {HTMLInputElement} drawInput
 * @param {(action: Action) => void} dispatch
 */
function handleDrawInputChange(drawInput, dispatch) {
  const parsed = normalizeDrawNumber(Number(drawInput.value));
  if (parsed === null) {
    return;
  }
  dispatch(changeDrawNumber(parsed));
}

/**
 * @param {HTMLInputElement} drawInput
 * @param {HTMLInputElement} toggleInput
 * @param {(action: Action) => void} dispatch
 */
function handleDrawButtonClick(drawInput, toggleInput, dispatch) {
  const nextDraw = pickRandomDrawNumber();
  drawInput.value = String(nextDraw);
  if (!toggleInput.checked) {
    toggleInput.checked = true;
    dispatch(enableDemo(nextDraw));
    return;
  }
  dispatch(changeDrawNumber(nextDraw));
}

/**
 * @param {number | null} candidate
 * @param {number} fallback
 * @returns {number}
 */
function resolveValidDraw(candidate, fallback) {
  if (candidate === null) {
    return fallback;
  }
  return candidate;
}

/**
 * Mounts the stage banner for synthetic data notification.
 *
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 */
export function mountStageBanner(documentRef, dispatch) {
  const banner = documentRef.createElement("div");
  banner.id = "demo-stage-banner";
  banner.className = "demo-stage-banner";
  banner.hidden = true;

  const title = documentRef.createElement("span");
  title.className = "demo-stage-banner-title";
  title.textContent = STAGE_BANNER_TITLE;

  const button = documentRef.createElement("button");
  button.type = "button";
  button.id = "demo-return-button";
  button.className = "action demo-return-button";
  button.textContent = RETURN_BUTTON_TEXT;

  button.addEventListener("click", () => {
    dispatch(disableDemo());
  });

  banner.append(title, button);

  return {
    element: banner,
    update: (/** @type {DemoState} */ state) => {
      const model = buildStageBannerViewModel(state);
      banner.hidden = !model.isVisible;
    },
  };
}

/**
 * Mounts the reason notice displayed beside indicator radios when demo is active.
 *
 * @param {Document} documentRef
 */
export function mountIndicatorNotice(documentRef) {
  const notice = documentRef.createElement("span");
  notice.id = "demo-indicator-notice";
  notice.className = "demo-indicator-notice";
  notice.hidden = true;

  return {
    element: notice,
    update: (/** @type {DemoState} */ state) => {
      const model = buildIndicatorNoticeViewModel(state);
      notice.hidden = !model.isVisible;
      notice.textContent = model.reason;
    },
  };
}
