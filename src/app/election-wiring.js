import {
  changeElectionTab,
  isElectionTab,
} from "../features/election/election-slice.js";
import {
  ELECTION_STRINGS,
  formatBrasiliaHour,
  formatCandidateLeadMessage,
  formatElectedAnnouncement,
  formatNoConnectionMessage,
  formatPartialCountMessage,
  formatTseStoppedMessage,
} from "../features/election/election-strings.js";
import {
  applyControlsVisibility,
  mountModeSelectorView,
} from "../features/election/mode-selector-view.js";
import {
  countConcluded,
  countConnectionError,
  countConnectionRestored,
  countMunicipalPacketReceived,
  countProclamationReceived,
  countStateUpdated,
  countTrackingUpdated,
  createCountState,
  reduceCount,
} from "../features/count/count-slice.js";
import { mountCountBannerView } from "../features/count/count-banner-view.js";
import { mountCountScoreboardView } from "../features/count/count-scoreboard-view.js";
import { mountOfficeSelectorView } from "../features/election/office-selector-view.js";
import { mountElectionLegendView } from "../features/election/election-legend-view.js";
import { createCountSource } from "./count-source.js";
import {
  isArtifactEnvironment,
  isElectionFeatureEnabled,
  renderArtifactNotice,
} from "./election-loader.js";
import {
  applyElectionEngineSettings,
  projectElectionComparison,
  projectElectionSearch,
  projectElectionSelection,
  projectElectionTable,
  projectElectionToEngine,
} from "./election-projection.js";
import {
  loadFirstRoundElectionData,
  loadSecondRoundReplayData,
} from "./election-data.js";
import { changeTab } from "./state.js";
import { syncUrlState } from "./url-state.js";

/**
 * Election feature orchestrator and wiring (N13, N15, ELE-17, ELE-18, ELE-19, ELE-20, APU-07, APU-09).
 *
 * Connects mode selector, live count banner, statewide scoreboard, TSE incremental reader,
 * first-round office selector, election legend, and 3D engine projection.
 *
 * @typedef {import("./store.js").Store<any, any>} Store
 * @typedef {import("../engine/engine.js").Engine} Engine
 * @typedef {import("./data-loader.js").OperationalStatus} OperationalStatus
 *
 * @typedef {{
 *   store: Store,
 *   engine?: Engine | null,
 *   documentRef?: Document,
 *   windowRef?: Window,
 *   status?: OperationalStatus,
 *   fetchImpl?: typeof fetch,
 *   electionCode?: string,
 *   host?: string,
 *   restoreIndicator?: () => void
 * }} ElectionWiringOptions
 */

/**
 * Initializes and wires election components into the application DOM.
 *
 * @param {ElectionWiringOptions} options
 * @returns {{
 *   destroy: () => void,
 *   countSource: ReturnType<typeof createCountSource> | null,
 *   getCountState: () => ReturnType<typeof createCountState>,
 *   getElectionResults: () => Record<string, any>,
 *   getActiveOffice: () => string
 * }}
 */
export function initElectionWiring(options) {
  const store = options.store;
  const engine = options.engine ?? null;
  let defaultDoc = null;
  if (typeof document !== "undefined") {
    defaultDoc = document;
  }
  const documentRef = options.documentRef ?? defaultDoc;

  let defaultWin = null;
  if (typeof window !== "undefined") {
    defaultWin = window;
  }
  const windowRef = options.windowRef ?? defaultWin;
  const status = options.status ?? store.getState().status;
  const fetchImpl = options.fetchImpl;
  const electionCode = options.electionCode ?? "6258";
  const host = options.host ?? "";
  const restoreIndicator = options.restoreIndicator ?? null;

  if (!documentRef) {
    return {
      destroy: () => {},
      countSource: null,
      getCountState: () => createCountState(),
      getElectionResults: () => ({}),
      getActiveOffice: () => "presidente",
    };
  }

  // Check operational feature flags (FLG-01)
  const isEnabled = isElectionFeatureEnabled(status);
  if (!isEnabled) {
    return {
      destroy: () => {},
      countSource: null,
      getCountState: () => createCountState(),
      getElectionResults: () => ({}),
      getActiveOffice: () => "presidente",
    };
  }

  let countState = createCountState();
  let currentElectionResults = {};
  let currentFirstRoundOffice = "presidente";
  const isArtifact = isArtifactEnvironment(windowRef);

  // 1. Mount Mode Selector into #mode-selector-slot (ELE-18)
  const modeSlot = documentRef.getElementById("mode-selector-slot");
  let modeSelector = null;
  if (modeSlot) {
    modeSelector = mountModeSelectorView(documentRef, modeSlot, {
      tab: store.getState().tab ?? "indicators",
      status,
      selectedCount: store.getState().selection?.selectedCodes?.length ?? 0,
      onTabChange: (nextTab) => {
        store.dispatch(changeTab(nextTab));
        store.dispatch(changeElectionTab(nextTab));
      },
    });
  }

  // 1b. Create slot for 1st round office selector inside #search-container
  let officeSlot = documentRef.getElementById("office-selector-slot");
  if (!officeSlot) {
    officeSlot = documentRef.createElement("div");
    officeSlot.id = "office-selector-slot";
    officeSlot.hidden = true;
    const searchContainer = documentRef.getElementById("search-container");
    if (searchContainer) {
      searchContainer.append(officeSlot);
    }
  }

  let officeSelector = null;
  if (officeSlot) {
    officeSelector = mountOfficeSelectorView(documentRef, officeSlot, {
      office: /** @type {any} */ (currentFirstRoundOffice),
      onOfficeChange: async (nextOffice) => {
        currentFirstRoundOffice = nextOffice;
        await switchFirstRoundOffice(nextOffice);
      },
    });
  }

  // 1c. Create slot for categorical election legend in stage overlay
  let electionLegendSlot = documentRef.getElementById("election-legend-slot");
  if (!electionLegendSlot) {
    electionLegendSlot = documentRef.createElement("div");
    electionLegendSlot.id = "election-legend-slot";
    electionLegendSlot.hidden = true;
    const stageOverlay = documentRef.getElementById("stage-overlay");
    if (stageOverlay) {
      stageOverlay.append(electionLegendSlot);
    }
  }

  let electionLegendView = null;
  if (electionLegendSlot) {
    electionLegendView = mountElectionLegendView(documentRef, electionLegendSlot, {
      theme: store.getState().theme ?? "dark",
    });
  }

  // 2. Mount Banner View into #election-banner-slot (APU-07, APU-08)
  const bannerSlot = documentRef.getElementById("election-banner-slot");
  let bannerView = null;
  if (bannerSlot) {
    if (isArtifact) {
      renderArtifactNotice(bannerSlot, documentRef);
    }
    if (!isArtifact) {
      bannerView = mountCountBannerView(documentRef, bannerSlot, {
        formatTseStoppedMessage,
        formatNoConnectionMessage,
        formatPartialCountMessage,
        formatElectedAnnouncement,
      });
    }
  }

  // 3. Mount Scoreboard View into #election-scoreboard-slot (APU-07, APU-09)
  const scoreboardSlot = documentRef.getElementById("election-scoreboard-slot");
  const sourceSlot = documentRef.getElementById("election-source-slot");
  let scoreboardView = null;
  if (scoreboardSlot) {
    scoreboardView = mountCountScoreboardView(documentRef, scoreboardSlot, {
      sourceSlotElement: sourceSlot,
      formatCandidateLeadMessage,
    });
  }

  // 4. Create Count Source polling adapter (APU-01 to APU-13)
  let countSource = null;
  if (!isArtifact) {
    countSource = createCountSource({
      fetchImpl,
      documentRef,
      electionCode,
      host,
      onTrackingUpdate: (tracking, isPaused) => {
        countState = reduceCount(
          countState,
          countTrackingUpdated(tracking, isPaused),
        );
        updateViews();
      },
      onStateUpdate: (spDoc) => {
        countState = reduceCount(countState, countStateUpdated(spDoc));
        updateViews();
        reprojectToEngine();
      },
      onMunicipalUpdate: (code, munDoc) => {
        countState = reduceCount(
          countState,
          countMunicipalPacketReceived(code, munDoc),
        );
        updateViews();
        reprojectToEngine();
      },
      onConnectionError: (hour) => {
        countState = reduceCount(countState, countConnectionError(hour));
        updateViews();
      },
      onConnectionRestored: () => {
        countState = reduceCount(countState, countConnectionRestored());
        updateViews();
      },
      onProclamation: (proclamation) => {
        countState = reduceCount(
          countState,
          countProclamationReceived(proclamation),
        );
        updateViews();
      },
      onConcluded: () => {
        countState = reduceCount(countState, countConcluded());
        updateViews();
      },
    });
  }

  function updateViews() {
    const state = store.getState();
    const isSecondRound = state.tab === "second-round";

    if (bannerView) {
      bannerView.update(countState, isSecondRound);
    }
    if (scoreboardView) {
      scoreboardView.update(countState, isSecondRound, "dark");
    }
  }

  function applyElectionProjection(mode = "first-round") {
    if (!engine) {
      return;
    }
    const state = store.getState();
    const municipalities = state.data?.municipalities ?? [];
    if (municipalities.length === 0) {
      return;
    }
    if (Object.keys(currentElectionResults).length === 0) {
      return;
    }

    const projection = projectElectionToEngine({
      municipalities,
      municipalResults: currentElectionResults,
      mode,
      theme: state.theme ?? "dark",
      heightMode: state.settings?.heightMode ?? "data",
    });

    if (typeof engine.setHeightTargets === "function") {
      engine.setHeightTargets(projection.heightTargets);
    }
    if (typeof engine.setColors === "function") {
      engine.setColors(projection.colorPositions);
    }
  }

  function reprojectToEngine() {
    const state = store.getState();
    if (state.tab !== "second-round" || !engine) {
      return;
    }
    const municipalities = state.data?.municipalities ?? [];
    if (municipalities.length === 0) {
      return;
    }

    const results = countState.municipalResults;
    if (results && Object.keys(results).length > 0) {
      currentElectionResults = results;
    }

    applyElectionProjection("live");
  }

  function updateTopPill(titleText, subText = "") {
    const pill = documentRef.getElementById("pointed-pill");
    if (!pill) {
      return;
    }
    let full = titleText;
    if (subText) {
      full = `${titleText} | ${subText}`;
    }
    pill.textContent = full;
  }

  async function switchFirstRoundOffice(office) {
    const state = store.getState();
    const theme = state.theme ?? "dark";
    const res = await loadFirstRoundElectionData(office, { fetchImpl, theme });
    if (!res.ok) {
      return;
    }
    currentElectionResults = res.municipalResults;
    syncGlobals();
    applyElectionProjection("first-round");

    if (electionLegendView) {
      electionLegendView.update({
        officeTitle: res.description,
        candidates: res.candidates,
        palette: res.palette,
        theme,
      });
    }

    const stateVotes = res.totals?.state?.validVotes;
    let votesStr = "";
    if (typeof stateVotes === "number") {
      votesStr = `${stateVotes.toLocaleString("pt-BR")} votos válidos`;
    }
    updateTopPill(`🗳️ ${res.description}`, votesStr);
  }

  async function activateSecondRound() {
    const state = store.getState();
    const theme = state.theme ?? "dark";
    const res2 = await loadSecondRoundReplayData({ fetchImpl, theme });
    if (res2.ok && Object.keys(res2.municipalResults).length > 0) {
      currentElectionResults = res2.municipalResults;
      syncGlobals();
      applyElectionProjection("replay");

      if (electionLegendView) {
        electionLegendView.update({
          officeTitle: "Presidente da República: 2º Turno (SP)",
          candidates: res2.candidates,
          palette: res2.palette,
          theme,
        });
      }
      updateTopPill("🗳️ 2º Turno Presidencial (SP)", "Apuração consolidada");
    }

    if (countSource) {
      countSource.start();
    }
    updateViews();
  }

  function syncGlobals() {
    if (windowRef) {
      const win = /** @type {any} */ (windowRef);
      win.__electionResults = currentElectionResults;
      win.__activeElectionOffice = currentFirstRoundOffice;
    }
  }

  let previousTab = store.getState().tab ?? "indicators";

  // Handle Tab transitions (ELE-17, ELE-19, ELE-20)
  async function handleStateChange() {
    const currentState = store.getState();
    const currentTab = currentState.tab ?? "indicators";

    if (modeSelector) {
      const selectedCount = currentState.selection?.selectedCodes?.length ?? 0;
      modeSelector.update(currentTab, status, selectedCount);
    }

    if (currentTab === previousTab) {
      return;
    }

    const prevWasSecondRound = previousTab === "second-round";
    const isNowSecondRound = currentTab === "second-round";
    const isNowFirstRound = currentTab === "first-round";
    const isNowElection = isElectionTab(currentTab);
    previousTab = currentTab;

    // Apply engine elevation rules for election (ELE-12, ELE-15)
    applyElectionEngineSettings(engine, isNowElection);
    applyControlsVisibility(documentRef, currentTab);

    // Toggle election vs indicator sub-views
    const scaleDock = documentRef.getElementById("scale-dock");

    if (isNowFirstRound) {
      if (officeSlot) {
        officeSlot.hidden = false;
      }
      if (electionLegendSlot) {
        electionLegendSlot.hidden = false;
      }
      if (scaleDock) {
        scaleDock.style.display = "none";
      }
      await switchFirstRoundOffice(currentFirstRoundOffice);
    }

    if (isNowSecondRound) {
      if (officeSlot) {
        officeSlot.hidden = true;
      }
      if (electionLegendSlot) {
        electionLegendSlot.hidden = false;
      }
      if (scaleDock) {
        scaleDock.style.display = "none";
      }
      await activateSecondRound();
    }

    if (!isNowElection) {
      if (officeSlot) {
        officeSlot.hidden = true;
      }
      if (electionLegendSlot) {
        electionLegendSlot.hidden = true;
      }
      if (scaleDock) {
        scaleDock.style.display = "";
      }
      if (typeof restoreIndicator === "function") {
        restoreIndicator();
      }
    }

    if (prevWasSecondRound && !isNowSecondRound) {
      if (countSource) {
        countSource.pause();
      }
      if (bannerView) {
        bannerView.update(countState, false);
      }
      if (scoreboardView) {
        scoreboardView.update(countState, false);
      }
    }

    if (windowRef) {
      syncUrlState(windowRef, {
        indicatorId: currentState.indicator.id,
        levelId: currentState.level.id,
        tab: currentTab,
        isDemoActive: currentState.demo.isActive,
      });
    }
  }

  // Initial tab setup
  const unsubscribe = store.subscribe(handleStateChange);
  handleStateChange();

  const wiring = {
    countSource,
    getCountState: () => countState,
    getElectionResults: () => currentElectionResults,
    getActiveOffice: () => currentFirstRoundOffice,
    getSelectionProjection(selectedCodes, opts = {}) {
      const state = store.getState();
      return projectElectionSelection(selectedCodes, currentElectionResults, {
        office: state.election?.office ?? currentFirstRoundOffice,
        level: state.level?.id ?? "municipality",
        theme: state.theme ?? "dark",
        ...opts,
      });
    },
    getComparisonProjection(pair, opts = {}) {
      const state = store.getState();
      return projectElectionComparison(pair, currentElectionResults, {
        office: state.election?.office ?? currentFirstRoundOffice,
        level: state.level?.id ?? "municipality",
        theme: state.theme ?? "dark",
        ...opts,
      });
    },
    getSearchProjection(query, entries, opts = {}) {
      const state = store.getState();
      return projectElectionSearch(query, entries, currentElectionResults, {
        office: state.election?.office ?? currentFirstRoundOffice,
        level: state.level?.id ?? "municipality",
        theme: state.theme ?? "dark",
        ...opts,
      });
    },
    getTableProjection(municipalities, opts = {}) {
      const state = store.getState();
      return projectElectionTable(municipalities, currentElectionResults, {
        office: state.election?.office ?? currentFirstRoundOffice,
        mode: state.tab ?? "first-round",
        level: state.level?.id ?? "municipality",
        theme: state.theme ?? "dark",
        ...opts,
      });
    },
    destroy() {
      unsubscribe();
      if (countSource) {
        countSource.destroy();
      }
      if (modeSelector) {
        modeSelector.destroy();
      }
      if (officeSelector) {
        officeSelector.destroy();
      }
      if (electionLegendView) {
        electionLegendView.destroy();
      }
      if (bannerView) {
        bannerView.destroy();
      }
      if (scoreboardView) {
        scoreboardView.destroy();
      }
    },
  };

  if (windowRef) {
    const win = /** @type {any} */ (windowRef);
    win.__electionWiring = wiring;
  }

  return wiring;
}

// Auto-wire if loaded in browser and appStore is ready
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const win = /** @type {any} */ (window);
  if (win.__appStore) {
    initElectionWiring({
      store: win.__appStore,
      windowRef: win,
      documentRef: document,
    });
  }
}
