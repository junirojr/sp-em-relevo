/**
 * Stage view manages the map canvas container, loading status messages and error alerts.
 * Follows BAS-01, ERR-01, ERR-02 and ERR-03.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} stageElement
 * @param {HTMLCanvasElement} canvasElement
 */
export function mountStageView(documentRef, stageElement, canvasElement) {
  let statusElement = /** @type {HTMLElement | null} */ (
    stageElement.querySelector("#stage-status")
  );
  if (!statusElement) {
    statusElement = documentRef.createElement("div");
    statusElement.id = "stage-status";
    statusElement.setAttribute("role", "status");
    statusElement.hidden = true;
    stageElement.append(statusElement);
  }
  const element = statusElement;

  return {
    stageElement,
    canvasElement,
    statusElement: element,
    /**
     * @param {string} message
     */
    setStatus(message) {
      if (!message) {
        element.hidden = true;
        element.textContent = "";
        return;
      }
      element.setAttribute("role", "status");
      element.textContent = message;
      element.hidden = false;
    },
    /**
     * @param {string} message
     */
    setAlert(message) {
      if (!message) {
        element.hidden = true;
        element.textContent = "";
        return;
      }
      element.setAttribute("role", "alert");
      element.textContent = message;
      element.hidden = false;
    },
    clearStatus() {
      element.hidden = true;
      element.textContent = "";
    },
  };
}
