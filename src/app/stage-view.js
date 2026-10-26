/**
 * Stage view manages the map canvas container, loading status messages,
 * error alerts, and the stage slots for election banner, scoreboard, and source.
 * Follows BAS-01, ERR-01, ERR-02, ERR-03, MOB-02, and APU-07.
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

  ensureStageStyles(documentRef);

  const bannerSlot = ensureStageSlot(
    documentRef,
    stageElement,
    "election-banner-slot",
    "status",
    "polite",
  );
  const scoreboardSlot = ensureStageSlot(
    documentRef,
    stageElement,
    "election-scoreboard-slot",
    null,
    null,
  );
  const sourceSlot = ensureStageSlot(documentRef, stageElement, "election-source-slot", null, null);

  ensureOutsideSidebar(documentRef, stageElement, [bannerSlot, scoreboardSlot, sourceSlot]);

  const element = statusElement;

  return {
    stageElement,
    canvasElement,
    statusElement: element,
    bannerSlot,
    scoreboardSlot,
    sourceSlot,
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

/**
 * Ensures that a slot element exists and is placed within stageElement.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} stageElement
 * @param {string} slotId
 * @param {string | null} role
 * @param {string | null} ariaLive
 * @returns {HTMLElement}
 */
function ensureStageSlot(documentRef, stageElement, slotId, role, ariaLive) {
  let slot = /** @type {HTMLElement | null} */ (stageElement.querySelector(`#${slotId}`));
  if (!slot) {
    const existing = documentRef.getElementById(slotId);
    if (existing) {
      stageElement.append(existing);
      slot = /** @type {HTMLElement} */ (existing);
    }
  }
  if (!slot) {
    slot = documentRef.createElement("div");
    slot.id = slotId;
    slot.hidden = true;
    stageElement.append(slot);
  }
  if (role && !slot.hasAttribute("role")) {
    slot.setAttribute("role", role);
  }
  if (ariaLive && !slot.hasAttribute("aria-live")) {
    slot.setAttribute("aria-live", ariaLive);
  }
  return slot;
}

/**
 * Ensures the given slots are located inside stageElement and outside #sidebar.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} stageElement
 * @param {HTMLElement[]} slots
 */
function ensureOutsideSidebar(documentRef, stageElement, slots) {
  const sidebar = documentRef.getElementById("sidebar");
  if (!sidebar) {
    return;
  }
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (sidebar.contains(slot)) {
      stageElement.append(slot);
    }
  }
}

/**
 * Injects layout styles for the election stage slots (MOB-02, APU-07).
 *
 * @param {Document} documentRef
 */
function ensureStageStyles(documentRef) {
  const styleId = "stage-slots-layout-style";
  if (documentRef.getElementById(styleId)) {
    return;
  }
  const head = documentRef.head;
  if (!head) {
    return;
  }
  const style = documentRef.createElement("style");
  style.id = styleId;
  style.textContent = `
#election-banner-slot,
#election-scoreboard-slot,
#election-source-slot {
  position: absolute;
  z-index: 24;
}

#election-banner-slot[hidden],
#election-scoreboard-slot[hidden],
#election-source-slot[hidden] {
  display: none !important;
}

#election-banner-slot {
  top: calc(var(--topbar-height) + var(--space-2));
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, calc(100% - 2 * var(--space-3)));
  max-width: 100%;
  pointer-events: auto;
}

#election-scoreboard-slot {
  top: calc(var(--topbar-height) + var(--space-2) + 38px);
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, calc(100% - 2 * var(--space-3)));
  max-width: 100%;
  pointer-events: auto;
}

#election-source-slot {
  bottom: var(--space-3);
  right: var(--space-4);
  font-size: var(--font-size-xs);
  color: var(--ink-muted);
  pointer-events: auto;
}

@media (max-width: 900px) {
  #election-banner-slot {
    top: calc(var(--topbar-height) + 4px);
    left: var(--space-3);
    right: var(--space-3);
    transform: none;
    width: auto;
  }

  #election-scoreboard-slot {
    top: calc(var(--topbar-height) + 40px);
    left: var(--space-3);
    right: var(--space-3);
    transform: none;
    width: auto;
    max-height: calc(var(--visual-viewport-height, 100dvh) * 0.22);
    overflow-y: auto;
  }

  #election-source-slot {
    top: calc(var(--topbar-height) + 2px);
    right: var(--space-3);
    bottom: auto;
    font-size: 10px;
  }
}
`;
  head.append(style);
}
