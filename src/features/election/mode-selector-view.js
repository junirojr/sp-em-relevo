import { ELECTION_STRINGS } from "./election-strings.js";

/**
 * Mode selector view component (ELE-17, ELE-18, ELE-19, ELE-20).
 *
 * Renders native accessible radio buttons with a fieldset legend inside `#mode-selector-slot` (ELE-18).
 * Stays visible inside the collapsed bottom panel header on mobile without scrolling (MOB-02).
 * Toggles visibility of indicator-specific controls (Degrau, Destaque, "Cor do mapa", demo) (ELE-19).
 * Announces "Selecao mantida" to screen readers upon tab transitions when units are selected (ELE-17).
 *
 * @typedef {import("./election-slice.js").ElectionTab} ElectionTab
 * @typedef {import("../../app/data-loader.js").OperationalStatus} OperationalStatus
 *
 * @typedef {{
 *   tab: ElectionTab,
 *   status?: OperationalStatus,
 *   selectedCount?: number,
 *   onTabChange: (tab: ElectionTab) => void
 * }} ModeSelectorOptions
 */

/**
 * Mounts the mode selector into the specified slot container.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} slotElement
 * @param {ModeSelectorOptions} options
 * @returns {{
 *   element: HTMLElement,
 *   update: (tab: ElectionTab, status?: OperationalStatus, selectedCount?: number) => void,
 *   destroy: () => void
 * }}
 */
export function mountModeSelectorView(documentRef, slotElement, options) {
  let currentTab = options.tab ?? "indicators";
  let currentStatus = options.status;
  let currentSelectedCount = options.selectedCount ?? 0;
  const onTabChange = options.onTabChange;

  slotElement.innerHTML = "";
  slotElement.hidden = false;

  const fieldset = documentRef.createElement("fieldset");
  fieldset.className = "mode-selector-group";

  const legend = documentRef.createElement("legend");
  legend.className = "mode-selector-legend";
  legend.textContent = ELECTION_STRINGS.mode.legend;
  fieldset.append(legend);

  const optionsContainer = documentRef.createElement("div");
  optionsContainer.className = "mode-selector-options";
  fieldset.append(optionsContainer);

  const liveAnnouncer = documentRef.createElement("div");
  liveAnnouncer.className = "visually-hidden";
  liveAnnouncer.setAttribute("role", "status");
  liveAnnouncer.setAttribute("aria-live", "polite");
  fieldset.append(liveAnnouncer);

  /** @type {Map<ElectionTab, HTMLInputElement>} */
  const radioInputs = new Map();

  function renderOptions() {
    optionsContainer.innerHTML = "";
    radioInputs.clear();

    const electionAllowed = isElectionAllowed(currentStatus);
    if (!electionAllowed) {
      slotElement.hidden = true;
      return;
    }
    slotElement.hidden = false;

    const availableTabs = getAvailableTabs(currentStatus);
    for (const tabInfo of availableTabs) {
      const label = documentRef.createElement("label");
      label.className = `mode-selector-option mode-selector-option-${tabInfo.id}`;

      const radio = documentRef.createElement("input");
      radio.type = "radio";
      radio.name = "app-view-mode";
      radio.value = tabInfo.id;
      radio.className = "mode-selector-radio";
      radio.checked = tabInfo.id === currentTab;

      radio.addEventListener("change", () => {
        if (!radio.checked) {
          return;
        }
        if (radio.value === currentTab) {
          return;
        }
        const nextTab = /** @type {ElectionTab} */ (radio.value);
        currentTab = nextTab;
        announceSelectionMaintainedIfApplicable();
        applyControlsVisibility(documentRef, nextTab);
        if (typeof onTabChange === "function") {
          onTabChange(nextTab);
        }
      });

      const textSpan = documentRef.createElement("span");
      textSpan.className = "mode-selector-label-text";
      textSpan.textContent = tabInfo.label;

      label.append(radio, textSpan);
      optionsContainer.append(label);
      radioInputs.set(tabInfo.id, radio);
    }
  }

  function announceSelectionMaintainedIfApplicable() {
    if (currentSelectedCount <= 0) {
      return;
    }
    liveAnnouncer.textContent = "";
    liveAnnouncer.textContent = ELECTION_STRINGS.mode.selectionMaintained;
  }

  renderOptions();
  applyControlsVisibility(documentRef, currentTab);
  slotElement.append(fieldset);

  return {
    element: fieldset,
    update(tab, status, selectedCount) {
      const tabChanged = tab !== currentTab;
      currentTab = tab;
      if (status !== undefined) {
        currentStatus = status;
      }
      if (selectedCount !== undefined) {
        currentSelectedCount = selectedCount;
      }

      renderOptions();
      const activeRadio = radioInputs.get(currentTab);
      if (activeRadio) {
        activeRadio.checked = true;
      }
      if (tabChanged) {
        announceSelectionMaintainedIfApplicable();
      }
      applyControlsVisibility(documentRef, currentTab);
    },
    destroy() {
      slotElement.innerHTML = "";
      slotElement.hidden = true;
      restoreIndicatorControls(documentRef);
    },
  };
}

/**
 * Checks whether election mode is permitted under operational status (FLG-01).
 *
 * @param {OperationalStatus | undefined} status
 * @returns {boolean}
 */
function isElectionAllowed(status) {
  if (!status) {
    return true;
  }
  if (status.mode === "disabled") {
    return false;
  }
  const features = status.features ?? status.Features;
  if (features && features.election === false) {
    return false;
  }
  return true;
}

/**
 * Returns available tabs according to operational status feature flags.
 *
 * @param {OperationalStatus | undefined} status
 * @returns {Array<{ id: ElectionTab, label: string }>}
 */
function getAvailableTabs(status) {
  /** @type {Array<{id: ElectionTab, label: string}>} */
  const tabs = [
    { id: /** @type {ElectionTab} */ ("indicators"), label: ELECTION_STRINGS.mode.indicators },
    { id: /** @type {ElectionTab} */ ("first-round"), label: ELECTION_STRINGS.mode.firstRound },
  ];

  const features = status?.features ?? status?.Features;
  const secondRoundAllowed = features?.electionSecondRound !== false;
  if (secondRoundAllowed) {
    tabs.push({
      id: /** @type {ElectionTab} */ ("second-round"),
      label: ELECTION_STRINGS.mode.secondRound,
    });
  }

  return tabs;
}

/**
 * Applies visibility rules for indicator controls (ELE-19).
 * Hides Degrau, Destaque, "Cor do mapa", and demo controls in election modes.
 *
 * @param {Document} documentRef
 * @param {ElectionTab} tab
 */
export function applyControlsVisibility(documentRef, tab) {
  const isElection = tab === "first-round" || tab === "second-round";
  const indicatorContainer = documentRef.getElementById("indicator-container");
  if (indicatorContainer) {
    indicatorContainer.hidden = isElection;
  }

  const appearanceContainer = documentRef.getElementById("appearance-container");
  if (appearanceContainer) {
    appearanceContainer.hidden = isElection;
    const colorGroup = appearanceContainer.querySelector(
      /** @type {"div"} */ (".appearance-group-color"),
    );
    if (colorGroup) {
      colorGroup.hidden = isElection;
    }
    const stepOption = appearanceContainer.querySelector(
      /** @type {"div"} */ (".height-mode-option-step"),
    );
    if (stepOption) {
      stepOption.hidden = isElection;
    }
  }

  const levelContainer = documentRef.getElementById("level-container");
  if (levelContainer) {
    levelContainer.hidden = isElection;
  }

  const selectionContainer = documentRef.getElementById("selection-container");
  if (selectionContainer) {
    selectionContainer.hidden = isElection;
  }

  const settingsContainer = documentRef.getElementById("settings-container");
  if (settingsContainer) {
    settingsContainer.hidden = isElection;
  }

  const pointedPill = documentRef.getElementById("pointed-pill");
  if (pointedPill) {
    pointedPill.hidden = isElection;
  }

  const stageBanner = documentRef.querySelector(/** @type {"div"} */ (".stage-banner"));
  if (stageBanner) {
    stageBanner.hidden = isElection;
  }

  const demoNotice = documentRef.querySelector(/** @type {"div"} */ (".indicator-notice"));
  if (demoNotice) {
    demoNotice.hidden = isElection;
  }

  if (documentRef.documentElement) {
    let modeAttr = "indicator";
    if (isElection) {
      modeAttr = "election";
    }
    documentRef.documentElement.dataset.mode = modeAttr;
  }
}

/**
 * Restores indicator controls visibility on unmount.
 *
 * @param {Document} documentRef
 */
function restoreIndicatorControls(documentRef) {
  applyControlsVisibility(documentRef, "indicators");
}
