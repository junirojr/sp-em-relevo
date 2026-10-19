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
 * @param {string | undefined} tab
 * @returns {"indicators" | "election"}
 */
export function resolveModeFromTab(tab) {
  if (tab === TAB_FIRST_ROUND || tab === TAB_SECOND_ROUND) {
    return MODE_ELECTION;
  }
  return MODE_INDICATORS;
}

export const resolveActiveMode = resolveModeFromTab;

/**
 * Mounts the mode toggle into the provided container.
 *
 * @param {HTMLElement} container
 * @param {{
 *   activeTab?: string,
 *   onSelectTab?: (tab: string) => void,
 *   documentRef?: Document
 * }} [options={}]
 * @returns {{
 *   element: HTMLElement,
 *   update: (tab: string) => void,
 *   destroy: () => void
 * }}
 */
export function mountModeToggle(container, options = {}) {
  const documentRef = options.documentRef || container.ownerDocument || document;
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

    return button;
  });

  // Keyboard navigation for segmented button group (WCAG 2.1.1)
  group.addEventListener("keydown", (event) => {
    const isNext = event.key === "ArrowRight" || event.key === "ArrowDown";
    const isPrev = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const isHome = event.key === "Home";
    const isEnd = event.key === "End";

    if (!isNext && !isPrev && !isHome && !isEnd) {
      return;
    }

    event.preventDefault();
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

    const nextIndex = isNext
      ? (currentIndex + 1) % buttons.length
      : (currentIndex - 1 + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  });

  group.append(...buttons);
  if (container && typeof container.append === "function") {
    container.append(group);
  }

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
      if (typeof group.remove === "function") {
        group.remove();
      }
    },
  };
}
