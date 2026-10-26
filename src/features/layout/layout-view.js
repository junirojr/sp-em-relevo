export const SHEET_STATE_COLLAPSED = "collapsed";
export const SHEET_STATE_HALF = "half";
export const SHEET_STATE_EXPANDED = "expanded";

/** @type { readonly ["collapsed", "half", "expanded"] } */
export const SHEET_STATES = [SHEET_STATE_COLLAPSED, SHEET_STATE_HALF, SHEET_STATE_EXPANDED];

const NARROW_VIEWPORT_MAX_WIDTH = 900;
const DRAG_STEP_THRESHOLD_PX = 28;
const DRAG_FULL_THRESHOLD_PX = 160;

/**
 * @typedef {"collapsed" | "half" | "expanded"} SheetState
 */

/** @type {Record<SheetState, SheetState>} */
const NEXT_SHEET_STATE = {
  collapsed: SHEET_STATE_HALF,
  half: SHEET_STATE_EXPANDED,
  expanded: SHEET_STATE_COLLAPSED,
};

/**
 * @type {Record<SheetState, { ariaExpanded: string, ariaLabel: string, text: string }>}
 */
const SHEET_STATE_META = {
  collapsed: {
    ariaExpanded: "false",
    ariaLabel: "Alternar altura do painel, estado recolhido",
    text: "Expandir painel",
  },
  half: {
    ariaExpanded: "true",
    ariaLabel: "Alternar altura do painel, altura média",
    text: "Painel médio",
  },
  expanded: {
    ariaExpanded: "true",
    ariaLabel: "Alternar altura do painel, estado expandido",
    text: "Recolher painel",
  },
};

/**
 * Normalizes an arbitrary string into one of the three valid bottom-sheet states.
 *
 * @param {string | undefined | null} value
 * @returns {SheetState}
 */
export function normalizeSheetState(value) {
  if (value === SHEET_STATE_HALF) {
    return SHEET_STATE_HALF;
  }
  if (value === SHEET_STATE_EXPANDED) {
    return SHEET_STATE_EXPANDED;
  }
  return SHEET_STATE_COLLAPSED;
}

/**
 * Resolves the next bottom-sheet state after a vertical pointer drag.
 *
 * @param {SheetState} startState
 * @param {number} deltaY
 * @returns {SheetState}
 */
export function resolveDraggedSheetState(startState, deltaY) {
  if (deltaY <= -DRAG_FULL_THRESHOLD_PX) {
    return SHEET_STATE_EXPANDED;
  }
  if (deltaY <= -DRAG_STEP_THRESHOLD_PX) {
    if (startState === SHEET_STATE_COLLAPSED) {
      return SHEET_STATE_HALF;
    }
    return SHEET_STATE_EXPANDED;
  }
  if (deltaY >= DRAG_FULL_THRESHOLD_PX) {
    return SHEET_STATE_COLLAPSED;
  }
  if (deltaY >= DRAG_STEP_THRESHOLD_PX) {
    if (startState === SHEET_STATE_EXPANDED) {
      return SHEET_STATE_HALF;
    }
    return SHEET_STATE_COLLAPSED;
  }
  return startState;
}

/**
 * @param {Document} documentRef
 * @returns {Window | null}
 */
function resolveWindow(documentRef) {
  if (documentRef?.defaultView) {
    return documentRef.defaultView;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  return null;
}

/**
 * @param {Window | null} windowRef
 * @returns {boolean}
 */
function isNarrowViewport(windowRef) {
  if (!windowRef || typeof windowRef.innerWidth !== "number") {
    return false;
  }
  return windowRef.innerWidth <= NARROW_VIEWPORT_MAX_WIDTH;
}

/**
 * @param {HTMLElement} parent
 * @param {...HTMLElement} children
 */
function appendChildren(parent, ...children) {
  if (typeof parent.append === "function") {
    parent.append(...children);
  }
}

/**
 * @param {HTMLElement} parent
 * @param {HTMLElement} child
 */
function prependChild(parent, child) {
  if (typeof parent.prepend === "function") {
    parent.prepend(child);
  }
}

/**
 * @param {Element} target
 * @returns {Element}
 */
function findScrollTarget(target) {
  if (typeof target.closest === "function") {
    const label = target.closest("label");
    if (label) {
      return label;
    }
  }
  return target;
}

/**
 * Mounts the sidebar collapse toggle button and the mobile bottom-sheet controller.
 * Follows LAY-05, MOB-03 and ACE-04.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} sidebarElement
 * @param {(expanded: boolean) => void} [onToggle]
 * @returns {{
 *   element: HTMLButtonElement,
 *   sheetButton: HTMLButtonElement,
 *   isExpanded: () => boolean,
 *   toggle: () => boolean,
 *   getSheetState: () => SheetState,
 *   setSheetState: (nextState: SheetState) => SheetState,
 *   cycleSheetState: () => SheetState
 * }}
 */
export function mountLayoutToggle(documentRef, sidebarElement, onToggle = undefined) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "collapse-toggle";
  button.id = "sidebar-toggle";
  button.setAttribute("aria-expanded", "true");
  button.setAttribute("aria-label", "Recolher barra lateral");
  button.setAttribute("aria-controls", "sidebar");
  button.textContent = "◀";

  const sheetHeader = documentRef.createElement("div");
  sheetHeader.className = "sheet-header";

  const sheetButton = documentRef.createElement("button");
  sheetButton.type = "button";
  sheetButton.className = "sheet-toggle";
  sheetButton.id = "sheet-toggle";
  sheetButton.setAttribute("aria-controls", sidebarElement.id || "sidebar");

  const handleBar = documentRef.createElement("span");
  handleBar.className = "sheet-handle-bar";
  handleBar.setAttribute("aria-hidden", "true");

  const sheetLabel = documentRef.createElement("span");
  sheetLabel.className = "sheet-toggle-label";

  appendChildren(sheetButton, handleBar, sheetLabel);
  appendChildren(sheetHeader, sheetButton);
  prependChild(sidebarElement, sheetHeader);

  /** @type {SheetState} */
  let currentSheetState = SHEET_STATE_COLLAPSED;

  /**
   * @param {SheetState} nextState
   * @param {boolean} shouldNotify
   * @returns {SheetState}
   */
  function applySheetState(nextState, shouldNotify) {
    currentSheetState = normalizeSheetState(nextState);
    const meta = SHEET_STATE_META[currentSheetState];

    sidebarElement.setAttribute("data-sheet-state", currentSheetState);
    if (documentRef.documentElement?.setAttribute) {
      documentRef.documentElement.setAttribute("data-sheet-state", currentSheetState);
    }

    sheetButton.setAttribute("aria-expanded", meta.ariaExpanded);
    sheetButton.setAttribute("aria-label", `${meta.text}, ${meta.ariaLabel}`);
    sheetButton.setAttribute("data-sheet-state", currentSheetState);
    sheetLabel.textContent = meta.text;

    if (shouldNotify && onToggle) {
      onToggle(currentSheetState !== SHEET_STATE_COLLAPSED);
    }

    return currentSheetState;
  }

  function getSheetState() {
    return currentSheetState;
  }

  /**
   * @param {SheetState} nextState
   * @returns {SheetState}
   */
  function setSheetState(nextState) {
    return applySheetState(nextState, true);
  }

  function cycleSheetState() {
    const nextState = NEXT_SHEET_STATE[currentSheetState];
    return applySheetState(nextState, true);
  }

  applySheetState(SHEET_STATE_COLLAPSED, false);

  let dragPointerId = /** @type {number | null} */ (null);
  let dragStartY = 0;
  let dragMoved = false;
  let suppressNextClick = false;

  sheetButton.addEventListener("pointerdown", (/** @type {PointerEvent} */ event) => {
    dragPointerId = event.pointerId;
    dragStartY = event.clientY;
    dragMoved = false;
  });

  sheetButton.addEventListener("pointermove", (/** @type {PointerEvent} */ event) => {
    if (dragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = event.clientY - dragStartY;
    if (Math.abs(deltaY) >= DRAG_STEP_THRESHOLD_PX) {
      dragMoved = true;
    }
  });

  sheetButton.addEventListener("pointerup", (/** @type {PointerEvent} */ event) => {
    if (dragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = event.clientY - dragStartY;
    dragPointerId = null;
    if (!dragMoved) {
      return;
    }
    suppressNextClick = true;
    const nextState = resolveDraggedSheetState(currentSheetState, deltaY);
    applySheetState(nextState, true);
  });

  sheetButton.addEventListener("pointercancel", () => {
    dragPointerId = null;
    dragMoved = false;
  });

  sheetButton.addEventListener("click", () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    cycleSheetState();
  });

  const windowRef = resolveWindow(documentRef);

  function syncVisualViewport() {
    const root = documentRef.documentElement;
    if (!root || !root.style || !windowRef) {
      return;
    }
    const vv = windowRef.visualViewport;
    if (vv && typeof vv.height === "number" && vv.height > 0) {
      root.style.setProperty("--visual-viewport-height", `${Math.floor(vv.height)}px`);
      return;
    }
    if (typeof windowRef.innerHeight === "number" && windowRef.innerHeight > 0) {
      root.style.setProperty("--visual-viewport-height", `${Math.floor(windowRef.innerHeight)}px`);
    }
  }

  syncVisualViewport();
  if (windowRef && typeof windowRef.addEventListener === "function") {
    windowRef.addEventListener("resize", syncVisualViewport);
  }
  if (
    windowRef?.visualViewport &&
    typeof windowRef.visualViewport.addEventListener === "function"
  ) {
    windowRef.visualViewport.addEventListener("resize", syncVisualViewport);
    windowRef.visualViewport.addEventListener("scroll", syncVisualViewport);
  }

  if (typeof documentRef.addEventListener === "function") {
    documentRef.addEventListener("focusin", (/** @type {FocusEvent} */ event) => {
      if (!isNarrowViewport(windowRef)) {
        return;
      }
      const target = /** @type {Element | null} */ (event?.target);
      if (
        !target ||
        typeof target.getBoundingClientRect !== "function" ||
        typeof sidebarElement.contains !== "function" ||
        typeof sidebarElement.getBoundingClientRect !== "function"
      ) {
        return;
      }

      if (sidebarElement.contains(target)) {
        if (target === sheetButton) {
          return;
        }
        if (typeof sheetHeader.contains === "function" && sheetHeader.contains(target)) {
          return;
        }
        const isInsideTopBar = Boolean(
          typeof target.closest === "function" && target.closest(".sidebar-top"),
        );
        if (!isInsideTopBar && currentSheetState === SHEET_STATE_COLLAPSED) {
          applySheetState(SHEET_STATE_EXPANDED, true);
        }
        const scrollTarget = findScrollTarget(target);
        if (scrollTarget && typeof scrollTarget.scrollIntoView === "function") {
          scrollTarget.scrollIntoView({ block: "nearest" });
        }
        return;
      }

      if (currentSheetState === SHEET_STATE_COLLAPSED) {
        return;
      }
      const targetRect = target.getBoundingClientRect();
      const sidebarRect = sidebarElement.getBoundingClientRect();
      if (targetRect.bottom > sidebarRect.top) {
        applySheetState(SHEET_STATE_COLLAPSED, true);
      }
    });
  }

  function isExpanded() {
    return button.getAttribute("aria-expanded") === "true";
  }

  function toggle() {
    const currentlyExpanded = isExpanded();
    const nextExpanded = !currentlyExpanded;

    if (nextExpanded) {
      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-label", "Recolher barra lateral");
      button.textContent = "◀";
      sidebarElement.classList.remove("collapsed");
    }
    if (!nextExpanded) {
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Expandir barra lateral");
      button.textContent = "▶";
      sidebarElement.classList.add("collapsed");
    }

    if (onToggle) {
      onToggle(nextExpanded);
    }

    return nextExpanded;
  }

  button.addEventListener("click", () => {
    toggle();
  });

  return {
    element: button,
    sheetButton,
    isExpanded,
    toggle,
    getSheetState,
    setSheetState,
    cycleSheetState,
  };
}

export const createLayoutView = mountLayoutToggle;
