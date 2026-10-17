import { findIndicator } from "../../domain/indicator.js";
import { changeIndicator, DEFAULT_INDICATOR_ID, INDICATOR_OPTIONS } from "./indicator-slice.js";

/**
 * @typedef {import("./indicator-slice.js").IndicatorId} IndicatorId
 * @typedef {import("./indicator-slice.js").IndicatorState} IndicatorState
 * @typedef {{ type: string }} Action
 *
 * @typedef {{
 *   title: string,
 *   currentIndicatorId: string,
 *   options: typeof INDICATOR_OPTIONS
 * }} IndicatorViewModel
 */

const TITLE = "Indicador";

/**
 * Pure rule: builds view model for indicator radio group.
 *
 * @param {IndicatorState} state
 * @returns {IndicatorViewModel}
 */
export function buildIndicatorViewModel(state) {
  return {
    title: TITLE,
    currentIndicatorId: state.id,
    options: INDICATOR_OPTIONS,
  };
}

/**
 * Indicator view: renders a fieldset containing 4 native radio buttons with labels.
 * Follows IND-01, IND-02 and IND-04.
 *
 * @param {Document} documentRef
 * @param {(action: Action) => void} [dispatch]
 * @returns {{
 *   element: HTMLElement,
 *   update: (stateOrId: IndicatorState | string) => void,
 *   getRadio: (id: string) => HTMLInputElement | null
 * }}
 */
export function mountIndicatorView(documentRef, dispatch = undefined) {
  const fieldset = documentRef.createElement("fieldset");
  fieldset.className = "indicator-fieldset";

  const legend = documentRef.createElement("legend");
  legend.className = "indicator-legend";
  legend.textContent = TITLE;
  fieldset.append(legend);

  /** @type {Map<string, HTMLInputElement>} */
  const radios = new Map();

  for (const option of INDICATOR_OPTIONS) {
    const label = documentRef.createElement("label");
    label.className = "indicator-option";

    const radio = documentRef.createElement("input");
    radio.type = "radio";
    radio.name = "indicator";
    radio.value = option.id;
    radio.checked = option.id === DEFAULT_INDICATOR_ID;

    if (dispatch) {
      radio.addEventListener("change", () => {
        if (radio.checked) {
          dispatch(changeIndicator(/** @type {IndicatorId} */ (option.id)));
        }
      });
    }

    const span = documentRef.createElement("span");
    span.textContent = option.label;

    const unit = documentRef.createElement("span");
    unit.className = "indicator-unit";
    unit.setAttribute("aria-hidden", "true");
    unit.textContent = findIndicator(option.id).unit;

    label.append(radio, span, unit);
    fieldset.append(label);
    radios.set(option.id, radio);
  }

  /**
   * @param {IndicatorState | string} stateOrId
   */
  function update(stateOrId) {
    const targetId = resolveTargetId(stateOrId);
    for (const [id, radio] of radios) {
      radio.checked = id === targetId;
    }
  }

  /**
   * @param {IndicatorState | string} stateOrId
   * @returns {string}
   */
  function resolveTargetId(stateOrId) {
    if (typeof stateOrId === "string") {
      return stateOrId;
    }
    if (stateOrId && typeof stateOrId === "object" && stateOrId.id) {
      return stateOrId.id;
    }
    return DEFAULT_INDICATOR_ID;
  }

  /**
   * @param {string} id
   * @returns {HTMLInputElement | null}
   */
  function getRadio(id) {
    const radio = radios.get(id);
    if (radio) {
      return radio;
    }
    return null;
  }

  return {
    element: fieldset,
    update,
    getRadio,
  };
}
