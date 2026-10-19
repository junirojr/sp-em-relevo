/**
 * Mode toggle view component in the top bar (ORIGINAL_REQUEST R1, M1).
 *
 * Switches between "Censo IBGE" (demographic indicators) and "Eleições TSE" (official elections).
 * Emits tab change dispatches, maintaining bidirectional URL and store synchronization.
 *
 * Strict compliance with PUB-08: this module does NOT import from src/features/election or src/features/count.
 */

export const TAB_INDICATORS = "indicators";
export const TAB_SECOND_ROUND = "second-round";
export const TAB_FIRST_ROUND = "first-round";

export const MODE_INDICATORS = "indicators";
export const MODE_ELECTION = "election";

/**
 * @typedef {Object} ModeOption
 * @property {"indicators" | "election"} mode
 * @property {string} tab
 * @property {string} labelFull
 * @property {string} labelShort
 * @property {string} glyphSvg
 * @property {string} ariaLabel
 */

/** @type {ModeOption[]} */
export const MODE_OPTIONS = [
  {
    mode: MODE_INDICATORS,
    tab: TAB_INDICATORS,
    labelFull: "Censo IBGE",
    labelShort: "Censo",
    glyphSvg:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    ariaLabel: "Censo IBGE",
  },
  {
    mode: MODE_ELECTION,
    tab: TAB_SECOND_ROUND,
    labelFull: "Eleições TSE",
    labelShort: "Eleições",
    glyphSvg:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>',
    ariaLabel: "Eleições TSE",
  },
];

/**
 * Maps the active application tab to the top-level mode category.
 *
 * @param {string | undefined | null} [tab]
 * @returns {"indicators" | "election"}
 */
export function resolveModeFromTab(tab) {
  if (tab === TAB_FIRST_ROUND || tab === TAB_SECOND_ROUND) {
    return MODE_ELECTION;
  }
  return MODE_INDICATORS;
}

/**
 * Alias for resolveModeFromTab.
 *
 * @type {typeof resolveModeFromTab}
 */
export const resolveActiveMode = resolveModeFromTab;

/**
 * @typedef {Object} ModeToggleOptions
 * @property {string} [activeTab]
 * @property {((tab: string) => void)} [onSelectTab]
 * @property {Document} [documentRef]
 */

/**
 * @typedef {Object} ModeToggleInstance
 * @property {HTMLElement} element
 * @property {(tab: string) => void} update
 * @property {() => void} destroy
 */

/**
 * Resolves the document object reference from options, container, or global scope.
 *
 * @param {ModeToggleOptions} [options]
 * @param {HTMLElement | null} [container]
 * @returns {Document | null}
 */
function resolveDocumentRef(options = {}, container = null) {
  if (options.documentRef) {
    return options.documentRef;
  }
  if (container?.ownerDocument) {
    return container.ownerDocument;
  }
  if (typeof document !== "undefined") {
    return document;
  }
  return null;
}

/**
 * Mounts the mode toggle into the provided container.
 *
 * @param {HTMLElement | null} [container]
 * @param {ModeToggleOptions} [options={}]
 * @returns {ModeToggleInstance}
 */
export function mountModeToggle(container = null, options = {}) {
  const documentRef = resolveDocumentRef(options, container);

  if (!documentRef) {
    return {
      element: /** @type {HTMLElement} */ (/** @type {unknown} */ (null)),
      update() {},
      destroy() {},
    };
  }

  let currentTab = options.activeTab || TAB_INDICATORS;
  const onSelectTab = options.onSelectTab;

  const group = documentRef.createElement("div");
  group.className = "mode-toggle";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Modo de visualização");

  /** @type {HTMLButtonElement[]} */
  const buttons = MODE_OPTIONS.map((option) => {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = "mode-toggle-button";
    button.tabIndex = 0;
    button.setAttribute("tabindex", "0");
    button.dataset.mode = option.mode;
    button.dataset.tab = option.tab;
    button.setAttribute("aria-label", option.ariaLabel);

    const glyph = documentRef.createElement("span");
    glyph.className = "mode-toggle-glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.innerHTML = option.glyphSvg;

    const text = documentRef.createElement("span");
    text.className = "mode-toggle-text";

    const labelFull = documentRef.createElement("span");
    labelFull.className = "mode-toggle-label-full";
    labelFull.textContent = option.labelFull;

    const labelShort = documentRef.createElement("span");
    labelShort.className = "mode-toggle-label-short";
    labelShort.setAttribute("aria-hidden", "true");
    labelShort.textContent = option.labelShort;

    text.append(labelFull, labelShort);
    button.append(glyph, text);

    button.addEventListener("click", () => {
      const targetMode = option.mode;
      const activeMode = resolveModeFromTab(currentTab);
      if (targetMode === activeMode) {
        return;
      }
      const nextTab = option.tab;
      currentTab = nextTab;
      update(nextTab);
      if (typeof onSelectTab === "function") {
        onSelectTab(nextTab);
      }
    });

    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        if (typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        button.click();
        return;
      }

      const isNext = event.key === "ArrowRight" || event.key === "ArrowDown";
      const isPrev = event.key === "ArrowLeft" || event.key === "ArrowUp";
      const isHome = event.key === "Home";
      const isEnd = event.key === "End";

      if (isNext || isPrev || isHome || isEnd) {
        if (/** @type {any} */ (event)._handled) {
          return;
        }
        /** @type {any} */ (event)._handled = true;
        if (typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        const currentIndex = buttons.indexOf(button);
        if (isHome) {
          buttons[0]?.focus();
          return;
        }
        if (isEnd) {
          buttons[buttons.length - 1]?.focus();
          return;
        }
        let nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        if (isNext) {
          nextIndex = (currentIndex + 1) % buttons.length;
        }
        buttons[nextIndex]?.focus();
      }
    });

    return button;
  });

  // Keyboard navigation for segmented button group (WCAG 2.1.1)
  group.addEventListener("keydown", (event) => {
    if (/** @type {any} */ (event)._handled) {
      return;
    }
    const isNext = event.key === "ArrowRight" || event.key === "ArrowDown";
    const isPrev = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const isHome = event.key === "Home";
    const isEnd = event.key === "End";

    if (!isNext && !isPrev && !isHome && !isEnd) {
      return;
    }

    /** @type {any} */ (event)._handled = true;
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    const activeElement = documentRef.activeElement;
    const currentIndex = buttons.indexOf(/** @type {any} */ (activeElement));

    if (isHome) {
      buttons[0]?.focus();
      return;
    }
    if (isEnd) {
      buttons[buttons.length - 1]?.focus();
      return;
    }

    if (currentIndex === -1) {
      buttons[0]?.focus();
      return;
    }

    let nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    if (isNext) {
      nextIndex = (currentIndex + 1) % buttons.length;
    }
    buttons[nextIndex]?.focus();
  });

  group.append(...buttons);
  if (container && typeof container.append === "function") {
    container.append(group);
  }

  /**
   * @param {string} nextTab
   */
  function update(nextTab) {
    currentTab = nextTab;
    const activeMode = resolveModeFromTab(currentTab);
    for (const button of buttons) {
      const isActive = button.dataset.mode === activeMode;
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  update(currentTab);

  return {
    element: group,
    update,
    destroy() {
      if (group.parentNode && typeof group.parentNode.removeChild === "function") {
        group.parentNode.removeChild(group);
        return;
      }
      if (typeof group.remove === "function") {
        group.remove();
      }
    },
  };
}
