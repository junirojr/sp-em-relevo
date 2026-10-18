import {
  detectAccessibilityMilestone,
  parseTseNumber,
  resolveBannerState,
} from "../../domain/count-reader.js";
import { computeUnitElectionResult } from "../../domain/election.js";

/**
 * Count slice state management (APU-06, APU-07, APU-08, APU-09, APU-10, APU-13, ACE-05).
 *
 * @typedef {import("../../domain/count-reader.js").resolveBannerState} ResolveBannerState
 * @typedef {import("../../domain/election.js").ElectionUnitResult} ElectionUnitResult
 *
 * @typedef {{
 *   bannerState: "nao-iniciada" | "em-apuracao" | "apuracao-pausada" | "matematicamente-definida" | "apuracao-concluida" | "sem-conexao" | "replay",
 *   bannerAlias: "aguardando" | "parcial" | "tse-sem-novidade" | "matematicamente-definida" | "encerrada" | "sem-conexao" | "replay",
 *   bannerLabel: string,
 *   isPaused: boolean,
 *   hasConnectionError: boolean,
 *   lastUpdateHour: string,
 *   lastTracking: { dg?: string, hg?: string, etag?: string } | null,
 *   sectionsCounted: number,
 *   sectionsTotal: number,
 *   sectionsPct: number,
 *   readCount: number,
 *   totalMunicipalities: number,
 *   stateResult: ElectionUnitResult | null,
 *   municipalResults: Record<string, ElectionUnitResult>,
 *   proclamation: {
 *     announced: boolean,
 *     candidate: { ballotNumber: string, name: string, party: string, status: string, elected: boolean } | null,
 *     announcementText: string | null
 *   } | null,
 *   accessibilityMilestone: string | null,
 *   isConcluded: boolean,
 *   consecutiveFailures: number
 * }} CountState
 *
 * @typedef {{ type: string }} Action
 * @typedef {{ type: "count/stateUpdated", payload: Record<string, unknown> }} CountStateUpdatedAction
 * @typedef {{ type: "count/municipalPacketReceived", code: string, payload: Record<string, unknown> }} CountMunicipalPacketAction
 * @typedef {{ type: "count/trackingUpdated", tracking: { dg?: string, hg?: string, etag?: string }, isPaused?: boolean }} CountTrackingUpdatedAction
 * @typedef {{ type: "count/connectionError", hour?: string }} CountConnectionErrorAction
 * @typedef {{ type: "count/connectionRestored" }} CountConnectionRestoredAction
 * @typedef {{ type: "count/proclamationReceived", proclamation: NonNullable<CountState["proclamation"]> }} CountProclamationAction
 * @typedef {{ type: "count/concluded" }} CountConcludedAction
 * @typedef {{ type: "count/reset" }} CountResetAction
 */

export const COUNT_STATE_UPDATED = "count/stateUpdated";
export const COUNT_MUNICIPAL_PACKET_RECEIVED = "count/municipalPacketReceived";
export const COUNT_TRACKING_UPDATED = "count/trackingUpdated";
export const COUNT_CONNECTION_ERROR = "count/connectionError";
export const COUNT_CONNECTION_RESTORED = "count/connectionRestored";
export const COUNT_PROCLAMATION_RECEIVED = "count/proclamationReceived";
export const COUNT_CONCLUDED = "count/concluded";
export const COUNT_RESET = "count/reset";

export const TOTAL_SP_MUNICIPALITIES = 645;

/**
 * Creates the initial CountState object.
 *
 * @returns {CountState}
 */
export function createCountState() {
  const initialBanner = resolveBannerState({
    sectionsCounted: 0,
    sectionsTotal: 0,
  });

  return {
    bannerState: initialBanner.state,
    bannerAlias: initialBanner.alias,
    bannerLabel: initialBanner.label,
    isPaused: false,
    hasConnectionError: false,
    lastUpdateHour: "",
    lastTracking: null,
    sectionsCounted: 0,
    sectionsTotal: 0,
    sectionsPct: 0,
    readCount: 0,
    totalMunicipalities: TOTAL_SP_MUNICIPALITIES,
    stateResult: null,
    municipalResults: {},
    proclamation: null,
    accessibilityMilestone: null,
    isConcluded: false,
    consecutiveFailures: 0,
  };
}

/**
 * Action creator for statewide count update (APU-09).
 *
 * @param {Record<string, unknown>} payload
 * @returns {CountStateUpdatedAction}
 */
export function countStateUpdated(payload) {
  return { type: COUNT_STATE_UPDATED, payload };
}

/**
 * Action creator for an individual municipal count packet (APU-03, APU-04, APU-09).
 *
 * @param {string} code
 * @param {Record<string, unknown>} payload
 * @returns {CountMunicipalPacketAction}
 */
export function countMunicipalPacketReceived(code, payload) {
  return { type: COUNT_MUNICIPAL_PACKET_RECEIVED, code, payload };
}

/**
 * Action creator for tracking file update (APU-02, APU-06).
 *
 * @param {{ dg?: string, hg?: string, etag?: string }} tracking
 * @param {boolean} [isPaused=false]
 * @returns {CountTrackingUpdatedAction}
 */
export function countTrackingUpdated(tracking, isPaused = false) {
  return { type: COUNT_TRACKING_UPDATED, tracking, isPaused };
}

/**
 * Action creator for network connection error (APU-08).
 *
 * @param {string} [hour=""]
 * @returns {CountConnectionErrorAction}
 */
export function countConnectionError(hour = "") {
  return { type: COUNT_CONNECTION_ERROR, hour };
}

/**
 * Action creator for network restoration (APU-08).
 *
 * @returns {CountConnectionRestoredAction}
 */
export function countConnectionRestored() {
  return { type: COUNT_CONNECTION_RESTORED };
}

/**
 * Action creator for proclamation of elected president (APU-10).
 *
 * @param {NonNullable<CountState["proclamation"]>} proclamation
 * @returns {CountProclamationAction}
 */
export function countProclamationReceived(proclamation) {
  return { type: COUNT_PROCLAMATION_RECEIVED, proclamation };
}

/**
 * Action creator when totalization is finished (tf = "s", APU-13).
 *
 * @returns {CountConcludedAction}
 */
export function countConcluded() {
  return { type: COUNT_CONCLUDED };
}

/**
 * Action creator to reset count state to initial.
 *
 * @returns {CountResetAction}
 */
export function countReset() {
  return { type: COUNT_RESET };
}

/**
 * Reducer for count slice state transitions.
 *
 * @param {CountState} state
 * @param {Action} action
 * @returns {CountState}
 */
export function reduceCount(state, action) {
  if (action.type === COUNT_RESET) {
    return createCountState();
  }

  if (action.type === COUNT_TRACKING_UPDATED) {
    const act = /** @type {CountTrackingUpdatedAction} */ (action);
    const isPaused = Boolean(act.isPaused);
    let hour = state.lastUpdateHour;
    if (act.tracking.hg) {
      hour = String(act.tracking.hg).trim();
    }
    let tfFlag = "n";
    if (state.isConcluded) {
      tfFlag = "s";
    }
    const nextBanner = resolveBannerState({
      sectionsCounted: state.sectionsCounted,
      sectionsTotal: state.sectionsTotal,
      isPaused,
      hasConnectionError: state.hasConnectionError,
      isMathematicallyDefined: Boolean(state.proclamation?.announced),
      tf: tfFlag,
    });

    const milestone = detectAccessibilityMilestone(
      {
        bannerState: state.bannerState,
        sectionsPct: state.sectionsPct,
        sectionsCounted: state.sectionsCounted,
        isPaused: state.isPaused,
        hasConnectionError: state.hasConnectionError,
        tseHour: state.lastUpdateHour,
      },
      {
        bannerState: nextBanner.state,
        sectionsPct: state.sectionsPct,
        sectionsCounted: state.sectionsCounted,
        isPaused,
        hasConnectionError: state.hasConnectionError,
        tseHour: hour,
      },
    );

    return {
      ...state,
      lastTracking: act.tracking,
      isPaused,
      lastUpdateHour: hour,
      bannerState: nextBanner.state,
      bannerAlias: nextBanner.alias,
      bannerLabel: nextBanner.label,
      accessibilityMilestone: milestone ?? state.accessibilityMilestone,
    };
  }

  if (action.type === COUNT_STATE_UPDATED) {
    const act = /** @type {CountStateUpdatedAction} */ (action);
    const doc = act.payload;
    const sectionsCounted = parseTseNumber(doc.sectionsCounted ?? doc.st ?? 0);
    const sectionsTotal = parseTseNumber(doc.sectionsTotal ?? doc.ts ?? 0);
    let sectionsPct = 0;
    if (sectionsTotal > 0) {
      sectionsPct = (sectionsCounted / sectionsTotal) * 100;
    }
    const tf = String(doc.tf ?? "").toLowerCase() === "s";
    const hour = String(doc.hg ?? state.lastUpdateHour).trim();

    const stateResult = computeUnitElectionResult(
      {
        code: "35",
        name: "Sao Paulo",
        candidates: /** @type {any} */ (doc.candidates ?? []),
        totalValidVotes: parseTseNumber(doc.totalValidVotes ?? doc.vv ?? 0),
        blankVotes: parseTseNumber(doc.blankVotes ?? doc.vb ?? 0),
        nullVotes: parseTseNumber(doc.nullVotes ?? doc.vn ?? 0),
        sectionsCounted,
        sectionsTotal,
      },
      { mode: "live" },
    );

    const isConcluded = tf || state.isConcluded;
    let tfFlag = "n";
    if (isConcluded) {
      tfFlag = "s";
    }

    const nextBanner = resolveBannerState({
      sectionsCounted,
      sectionsTotal,
      tf: tfFlag,
      isPaused: false,
      hasConnectionError: false,
      isMathematicallyDefined: Boolean(state.proclamation?.announced),
    });

    const milestone = detectAccessibilityMilestone(
      {
        bannerState: state.bannerState,
        sectionsPct: state.sectionsPct,
        sectionsCounted: state.sectionsCounted,
        hasConnectionError: state.hasConnectionError,
        isPaused: state.isPaused,
        tseHour: state.lastUpdateHour,
      },
      {
        bannerState: nextBanner.state,
        sectionsPct,
        sectionsCounted,
        hasConnectionError: false,
        isPaused: false,
        tseHour: hour,
      },
    );

    return {
      ...state,
      sectionsCounted,
      sectionsTotal,
      sectionsPct,
      lastUpdateHour: hour,
      stateResult,
      isConcluded,
      isPaused: false,
      hasConnectionError: false,
      consecutiveFailures: 0,
      bannerState: nextBanner.state,
      bannerAlias: nextBanner.alias,
      bannerLabel: nextBanner.label,
      accessibilityMilestone: milestone ?? state.accessibilityMilestone,
    };
  }

  if (action.type === COUNT_MUNICIPAL_PACKET_RECEIVED) {
    const act = /** @type {CountMunicipalPacketAction} */ (action);
    const code = String(act.code).trim();
    const doc = act.payload;

    const unitResult = computeUnitElectionResult(
      {
        code,
        name: String(doc.name ?? code),
        candidates: /** @type {any} */ (doc.candidates ?? []),
        totalValidVotes: parseTseNumber(doc.totalValidVotes ?? doc.vv ?? 0),
        blankVotes: parseTseNumber(doc.blankVotes ?? doc.vb ?? 0),
        nullVotes: parseTseNumber(doc.nullVotes ?? doc.vn ?? 0),
        sectionsCounted: parseTseNumber(doc.sectionsCounted ?? doc.st ?? 0),
        sectionsTotal: parseTseNumber(doc.sectionsTotal ?? doc.ts ?? 0),
      },
      { mode: "live" },
    );

    const prevExisted = Boolean(state.municipalResults[code]);
    let nextReadCount = state.readCount;
    if (!prevExisted) {
      nextReadCount += 1;
    }

    return {
      ...state,
      readCount: nextReadCount,
      municipalResults: {
        ...state.municipalResults,
        [code]: unitResult,
      },
    };
  }

  if (action.type === COUNT_CONNECTION_ERROR) {
    const act = /** @type {CountConnectionErrorAction} */ (action);
    let hour = state.lastUpdateHour;
    if (act.hour) {
      hour = act.hour;
    }
    const nextBanner = resolveBannerState({
      hasConnectionError: true,
      sectionsCounted: state.sectionsCounted,
      sectionsTotal: state.sectionsTotal,
    });
    const milestone = detectAccessibilityMilestone(
      { hasConnectionError: state.hasConnectionError },
      { hasConnectionError: true },
    );

    return {
      ...state,
      hasConnectionError: true,
      lastUpdateHour: hour,
      consecutiveFailures: state.consecutiveFailures + 1,
      bannerState: nextBanner.state,
      bannerAlias: nextBanner.alias,
      bannerLabel: nextBanner.label,
      accessibilityMilestone: milestone ?? state.accessibilityMilestone,
    };
  }

  if (action.type === COUNT_CONNECTION_RESTORED) {
    let tfFlag = "n";
    if (state.isConcluded) {
      tfFlag = "s";
    }
    const nextBanner = resolveBannerState({
      sectionsCounted: state.sectionsCounted,
      sectionsTotal: state.sectionsTotal,
      tf: tfFlag,
      isPaused: state.isPaused,
      hasConnectionError: false,
    });
    const milestone = detectAccessibilityMilestone(
      { hasConnectionError: true },
      { hasConnectionError: false },
    );

    return {
      ...state,
      hasConnectionError: false,
      consecutiveFailures: 0,
      bannerState: nextBanner.state,
      bannerAlias: nextBanner.alias,
      bannerLabel: nextBanner.label,
      accessibilityMilestone: milestone ?? state.accessibilityMilestone,
    };
  }

  if (action.type === COUNT_PROCLAMATION_RECEIVED) {
    const act = /** @type {CountProclamationAction} */ (action);
    const proclamation = act.proclamation;
    let tfFlag = "n";
    if (state.isConcluded) {
      tfFlag = "s";
    }
    const nextBanner = resolveBannerState({
      sectionsCounted: state.sectionsCounted,
      sectionsTotal: state.sectionsTotal,
      tf: tfFlag,
      isMathematicallyDefined: proclamation.announced,
    });
    const cand = proclamation.candidate;
    let electedCand;
    if (cand) {
      electedCand = { name: cand.name, party: cand.party };
    }
    const milestone = detectAccessibilityMilestone(
      { isElected: false },
      { isElected: true, electedCandidate: electedCand },
    );

    return {
      ...state,
      proclamation,
      bannerState: nextBanner.state,
      bannerAlias: nextBanner.alias,
      bannerLabel: nextBanner.label,
      accessibilityMilestone: milestone ?? state.accessibilityMilestone,
    };
  }

  if (action.type === COUNT_CONCLUDED) {
    const nextBanner = resolveBannerState({
      sectionsCounted: state.sectionsCounted,
      sectionsTotal: state.sectionsTotal,
      tf: "s",
    });
    const milestone = detectAccessibilityMilestone(
      { bannerState: state.bannerState },
      { bannerState: "apuracao-concluida" },
    );

    return {
      ...state,
      isConcluded: true,
      bannerState: nextBanner.state,
      bannerAlias: nextBanner.alias,
      bannerLabel: nextBanner.label,
      accessibilityMilestone: milestone ?? state.accessibilityMilestone,
    };
  }

  return state;
}
