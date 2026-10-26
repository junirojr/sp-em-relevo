/**
 * Election slice state management (ELE-17, ELE-18, ELE-19, ELE-20).
 *
 * Provides:
 * - Tab and mode state constants
 * - Action creators for tab switches and election mode intent
 * - Reducer ensuring atomic switch preserving selection and level (ELE-17)
 * - Helper selectors identifying controls to hide in election modes (ELE-19)
 *
 * @typedef {"indicators" | "first-round" | "second-round"} ElectionTab
 * @typedef {"presidente" | "governador" | "senador" | "deputado-federal" | "deputado-estadual"} ElectionOffice
 *
 * @typedef {{
 *   tab: ElectionTab,
 *   office: ElectionOffice,
 *   selectionNotice: string | null,
 *   paletteColors: readonly string[] | null,
 *   isLoaded: boolean,
 *   loadError: string | null
 * }} ElectionState
 *
 * @typedef {{ type: string }} Action
 * @typedef {{ type: "election/tabChanged", tab: ElectionTab }} ElectionTabChangedAction
 * @typedef {{ type: "election/officeChanged", office: ElectionOffice }} ElectionOfficeChangedAction
 * @typedef {{ type: "election/paletteColorsChanged", colors: readonly string[] | null }} ElectionPaletteColorsChangedAction
 * @typedef {{ type: "election/loadStatusChanged", isLoaded: boolean, error: string | null }} ElectionLoadStatusChangedAction
 * @typedef {{ type: "election/selectionNoticeCleared" }} ElectionSelectionNoticeClearedAction
 */

export const TAB_INDICATORS = "indicators";
export const TAB_FIRST_ROUND = "first-round";
export const TAB_SECOND_ROUND = "second-round";

export const OFFICE_PRESIDENT = "presidente";
export const OFFICE_GOVERNOR = "governador";
export const OFFICE_SENATOR = "senador";
export const OFFICE_FEDERAL_DEPUTY = "deputado-federal";
export const OFFICE_STATE_DEPUTY = "deputado-estadual";

export const ELECTION_TAB_CHANGED = "election/tabChanged";
export const ELECTION_OFFICE_CHANGED = "election/officeChanged";
export const ELECTION_PALETTE_COLORS_CHANGED = "election/paletteColorsChanged";
export const ELECTION_LOAD_STATUS_CHANGED = "election/loadStatusChanged";
export const ELECTION_SELECTION_NOTICE_CLEARED = "election/selectionNoticeCleared";

/**
 * Creates the initial election slice state.
 *
 * @param {ElectionTab} [initialTab="indicators"]
 * @param {ElectionOffice} [initialOffice="presidente"]
 * @returns {ElectionState}
 */
export function createElectionState(initialTab = TAB_INDICATORS, initialOffice = OFFICE_PRESIDENT) {
  return {
    tab: initialTab,
    office: initialOffice,
    selectionNotice: null,
    paletteColors: null,
    isLoaded: false,
    loadError: null,
  };
}

/**
 * Checks whether a given tab identifier represents an election round (ELE-16, ELE-19).
 *
 * @param {string | undefined | null} tab
 * @returns {boolean}
 */
export function isElectionTab(tab) {
  return tab === TAB_FIRST_ROUND || tab === TAB_SECOND_ROUND;
}

/**
 * Checks whether indicator-specific controls (Degrau, Destaque, "Cor do mapa", demo)
 * must be hidden (ELE-19).
 *
 * @param {string | undefined | null} tab
 * @returns {boolean}
 */
export function shouldHideIndicatorControls(tab) {
  return isElectionTab(tab);
}

/**
 * Action creator to switch election tab (ELE-17, ELE-20).
 *
 * @param {ElectionTab} tab
 * @returns {ElectionTabChangedAction}
 */
export function changeElectionTab(tab) {
  return { type: ELECTION_TAB_CHANGED, tab };
}

/**
 * Action creator to change active election office (N15).
 *
 * @param {ElectionOffice} office
 * @returns {ElectionOfficeChangedAction}
 */
export function changeElectionOffice(office) {
  return { type: ELECTION_OFFICE_CHANGED, office };
}

/**
 * Action creator to update custom palette colors for election rendering (ELE-15).
 *
 * @param {readonly string[] | null} colors
 * @returns {ElectionPaletteColorsChangedAction}
 */
export function changeElectionPaletteColors(colors) {
  return { type: ELECTION_PALETTE_COLORS_CHANGED, colors };
}

/**
 * Action creator to update load status and errors (FLG-03).
 *
 * @param {boolean} isLoaded
 * @param {string | null} [error=null]
 * @returns {ElectionLoadStatusChangedAction}
 */
export function changeElectionLoadStatus(isLoaded, error = null) {
  return { type: ELECTION_LOAD_STATUS_CHANGED, isLoaded, error };
}

/**
 * Action creator to clear selection notice after announcement.
 *
 * @returns {ElectionSelectionNoticeClearedAction}
 */
export function clearElectionSelectionNotice() {
  return { type: ELECTION_SELECTION_NOTICE_CLEARED };
}

/**
 * Reducer for the election slice.
 *
 * @param {ElectionState} state
 * @param {Action} action
 * @returns {ElectionState}
 */
export function reduceElection(state, action) {
  if (action.type === ELECTION_TAB_CHANGED) {
    const tabAction = /** @type {ElectionTabChangedAction} */ (action);
    if (tabAction.tab === state.tab) {
      return state;
    }
    return {
      ...state,
      tab: tabAction.tab,
      selectionNotice: "Selecao mantida",
    };
  }

  if (action.type === ELECTION_OFFICE_CHANGED) {
    const officeAction = /** @type {ElectionOfficeChangedAction} */ (action);
    if (officeAction.office === state.office) {
      return state;
    }
    return {
      ...state,
      office: officeAction.office,
    };
  }

  if (action.type === ELECTION_PALETTE_COLORS_CHANGED) {
    const palAction = /** @type {ElectionPaletteColorsChangedAction} */ (action);
    return {
      ...state,
      paletteColors: palAction.colors,
    };
  }

  if (action.type === ELECTION_LOAD_STATUS_CHANGED) {
    const loadAction = /** @type {ElectionLoadStatusChangedAction} */ (action);
    return {
      ...state,
      isLoaded: loadAction.isLoaded,
      loadError: loadAction.error,
    };
  }

  if (action.type === ELECTION_SELECTION_NOTICE_CLEARED) {
    if (state.selectionNotice === null) {
      return state;
    }
    return {
      ...state,
      selectionNotice: null,
    };
  }

  return state;
}
