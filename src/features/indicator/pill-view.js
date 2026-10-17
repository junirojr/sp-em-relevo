import { formatValue } from "../../domain/format.js";

/**
 * @typedef {{
 *   code: string | null,
 *   name?: string,
 *   value?: number | null,
 *   indicatorId?: string
 * }} PillProps
 */

const DEFAULT_EMPTY_PROMPT = "Aponte para um município";

/**
 * Mounts the pointed unit pill view.
 * Follows BAS-12.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} container
 */
export function mountPillView(documentRef, container) {
  const contentWrapper = documentRef.createElement("div");
  contentWrapper.className = "pill-content";

  const emptyNotice = documentRef.createElement("span");
  emptyNotice.className = "pill-empty";
  emptyNotice.textContent = DEFAULT_EMPTY_PROMPT;

  const titleSpan = documentRef.createElement("span");
  titleSpan.className = "pill-title";

  const valueSpan = documentRef.createElement("span");
  valueSpan.className = "pill-value";

  contentWrapper.append(titleSpan, valueSpan);
  container.append(emptyNotice, contentWrapper);

  contentWrapper.hidden = true;
  emptyNotice.hidden = false;

  /**
   * @param {PillProps} props
   */
  function render(props) {
    if (!props.code || !props.name) {
      contentWrapper.hidden = true;
      emptyNotice.hidden = false;
      emptyNotice.textContent = DEFAULT_EMPTY_PROMPT;
      titleSpan.textContent = "";
      valueSpan.textContent = "";
      return;
    }

    emptyNotice.hidden = true;
    contentWrapper.hidden = false;
    emptyNotice.textContent = "";

    titleSpan.textContent = props.name;
    const formatted = formatValue(props.value, props.indicatorId || "population");
    valueSpan.textContent = formatted;
  }

  return {
    element: container,
    update: (/** @type {PillProps} */ nextProps) => {
      render(nextProps);
    },
  };
}
