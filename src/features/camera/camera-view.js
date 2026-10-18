/**
 * Camera zoom controls: the "+" and "-" buttons and the button that returns
 * to the whole-state view. The view never reads the engine. It reports the
 * user's intent through injected callbacks and receives the zoom target and
 * the maximum zoom through `update`.
 */

const ZOOM_EPSILON = 0.01;
const MIN_ZOOM_TOLERANCE = 0.001;
const MIN_ZOOM = 1;

const ZOOM_IN_ICON =
  '<path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>';
const ZOOM_OUT_ICON =
  '<path d="M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>';
const RESET_ICON =
  '<path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';

/**
 * @typedef {{ zoomInDisabled: boolean, zoomOutDisabled: boolean }} ZoomControlsState
 */

/**
 * @typedef {{
 *   onZoomIn: () => void,
 *   onZoomOut: () => void,
 *   onResetView: () => void,
 * }} CameraControlHandlers
 */

/**
 * @param {number} zoomTarget
 * @param {number} maxZoom
 * @returns {boolean}
 */
function isAtMaxZoom(zoomTarget, maxZoom) {
  return zoomTarget >= maxZoom - ZOOM_EPSILON;
}

/**
 * @param {number} zoomTarget
 * @returns {boolean}
 */
function isAtMinZoom(zoomTarget) {
  return zoomTarget <= MIN_ZOOM + MIN_ZOOM_TOLERANCE;
}

/**
 * Pure rule: which zoom buttons are disabled for a given zoom target.
 *
 * @param {number} zoomTarget
 * @param {number} maxZoom
 * @returns {ZoomControlsState}
 */
export function zoomControlsState(zoomTarget, maxZoom) {
  return {
    zoomInDisabled: isAtMaxZoom(zoomTarget, maxZoom),
    zoomOutDisabled: isAtMinZoom(zoomTarget),
  };
}

/**
 * @param {string} label
 * @param {string} iconMarkup
 * @param {() => void} onClick
 * @returns {HTMLButtonElement}
 */
function createControlButton(label, iconMarkup, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${iconMarkup}</svg>`;
  button.addEventListener("click", onClick);
  return button;
}

/**
 * @param {{ zoomIn: HTMLButtonElement, zoomOut: HTMLButtonElement }} buttons
 * @param {number} zoomTarget
 * @param {number} maxZoom
 */
function applyZoomControlsState(buttons, zoomTarget, maxZoom) {
  const state = zoomControlsState(zoomTarget, maxZoom);
  buttons.zoomIn.disabled = state.zoomInDisabled;
  buttons.zoomOut.disabled = state.zoomOutDisabled;
}

const TOGGLE_3D_ICON =
  '<text x="2" y="11" font-size="8" font-weight="bold" fill="currentColor" font-family="sans-serif">3D</text>';
const COMPASS_ICON =
  '<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4" fill="none"/><polygon points="8,3.5 10.5,8 8,12.5 5.5,8" fill="currentColor"/>';

/**
 * Builds the zoom and camera control buttons inside `container`.
 *
 * @param {HTMLElement} container
 * @param {CameraControlHandlers & { onToggle3d?: () => void, onCompass?: () => void }} handlers
 * @returns {{ update: (zoomTarget: number, maxZoom: number) => void }}
 */
export function mountCameraControls(container, handlers) {
  const buttons = {
    toggle3d: createControlButton("Alternar visão 3D isométrica", TOGGLE_3D_ICON, () => {
      if (typeof handlers.onToggle3d === "function") {
        handlers.onToggle3d();
      }
    }),
    reset: createControlButton("Voltar ao estado inteiro", RESET_ICON, handlers.onResetView),
    compass: createControlButton("Alinhar ao Norte", COMPASS_ICON, () => {
      if (typeof handlers.onCompass === "function") {
        handlers.onCompass();
      }
      if (typeof handlers.onCompass !== "function") {
        handlers.onResetView();
      }
    }),
    zoomIn: createControlButton("Aproximar o mapa", ZOOM_IN_ICON, handlers.onZoomIn),
    zoomOut: createControlButton("Afastar o mapa", ZOOM_OUT_ICON, handlers.onZoomOut),
  };

  buttons.toggle3d.id = "zoom-3d";
  buttons.reset.id = "zoom-reset";
  buttons.compass.id = "zoom-compass";
  buttons.zoomIn.id = "zoom-in";
  buttons.zoomOut.id = "zoom-out";

  container.replaceChildren(
    buttons.toggle3d,
    buttons.reset,
    buttons.compass,
    buttons.zoomIn,
    buttons.zoomOut,
  );

  return {
    update(zoomTarget, maxZoom) {
      applyZoomControlsState(buttons, zoomTarget, maxZoom);
    },
  };
}
