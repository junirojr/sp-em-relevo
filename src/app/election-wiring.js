import { mountCountBannerView } from "../features/count/count-banner-view.js";
import { mountCountScoreboardView } from "../features/count/count-scoreboard-view.js";
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
import { mountCandidateRankingsView } from "../features/election/candidate-rankings-view.js";
import { mountElectionLegendView } from "../features/election/election-legend-view.js";
import { changeElectionTab, isElectionTab } from "../features/election/election-slice.js";
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
import { mountOfficeSelectorView } from "../features/election/office-selector-view.js";
import {
  clearSelectionAction,
  toggleMunicipalityAction,
} from "../features/selection/selection-slice.js";
import { createCountSource } from "./count-source.js";
import {
  loadFirstRoundElectionData,
  loadSecondRoundElectionData,
  loadSecondRoundReplayData,
} from "./election-data.js";
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
import { readPalette, withColors } from "./palette.js";
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
  const host = options.host ?? "https://resultados.tse.jus.br";
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
  /** @type {Record<string, import("../domain/election.js").ElectionUnitResult>} */
  let currentElectionResults = {};
  let currentFirstRoundOffice = "presidente";
  const isArtifact = isArtifactEnvironment(windowRef);

  // 1. Mount Mode Selector into #mode-selector-slot (ELE-18)
  const modeSlot = documentRef.getElementById("mode-selector-slot");
  /** @type {ReturnType<typeof mountModeSelectorView> | null} */
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

  /** @type {ReturnType<typeof mountElectionLegendView> | null} */
  let electionLegendView = null;
  if (electionLegendSlot) {
    electionLegendView = mountElectionLegendView(documentRef, electionLegendSlot, {
      theme: store.getState().theme ?? "dark",
    });
  }

  // 1d. Create slot for candidate rankings and relevance in sidebar
  let rankingsSlot = documentRef.getElementById("election-rankings-slot");
  if (!rankingsSlot) {
    rankingsSlot = documentRef.createElement("div");
    rankingsSlot.id = "election-rankings-slot";
    rankingsSlot.hidden = true;
    const sidebarContent = documentRef.querySelector(".sidebar-content");
    if (sidebarContent) {
      sidebarContent.prepend(rankingsSlot);
    }
  }

  /** @type {ReturnType<typeof mountCandidateRankingsView> | null} */
  let candidateRankingsView = null;
  if (rankingsSlot) {
    candidateRankingsView = mountCandidateRankingsView(documentRef, rankingsSlot);
  }

  // 1e. Create slot for selected city stage HUD pill
  let stageCityPill = documentRef.getElementById("selected-city-stage-pill");
  if (!stageCityPill) {
    stageCityPill = documentRef.createElement("div");
    stageCityPill.id = "selected-city-stage-pill";
    stageCityPill.className = "selected-city-stage-pill";
    stageCityPill.hidden = true;
    const stageOverlay = documentRef.getElementById("stage-overlay");
    if (stageOverlay) {
      stageOverlay.append(stageCityPill);
    }
  }

  // 2. Mount Banner View into #election-banner-slot (APU-07, APU-08)
  const bannerSlot = documentRef.getElementById("election-banner-slot");
  /** @type {ReturnType<typeof mountCountBannerView> | null} */
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
  /** @type {ReturnType<typeof mountCountScoreboardView> | null} */
  let scoreboardView = null;
  if (scoreboardSlot) {
    scoreboardView = mountCountScoreboardView(documentRef, scoreboardSlot, {
      sourceSlotElement: sourceSlot,
      formatCandidateLeadMessage,
    });
  }

  // 4. Create Count Source polling adapter (APU-01 to APU-13)
  /** @type {ReturnType<typeof createCountSource> | null} */
  let countSource = null;
  if (!isArtifact) {
    countSource = createCountSource({
      fetchImpl,
      documentRef,
      electionCode,
      host,
      onTrackingUpdate: (tracking, isPaused) => {
        countState = reduceCount(countState, countTrackingUpdated(tracking, isPaused));
        updateViews();
      },
      onStateUpdate: (spDoc) => {
        countState = reduceCount(countState, countStateUpdated(spDoc));
        updateViews();
        reprojectToEngine();
      },
      onMunicipalUpdate: (code, munDoc) => {
        countState = reduceCount(countState, countMunicipalPacketReceived(code, munDoc));
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
        countState = reduceCount(countState, countProclamationReceived(proclamation));
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

    if (isSecondRound && countState.stateResult) {
      const result = countState.stateResult;
      currentOfficeMeta = {
        office: "presidente",
        candidates: result.candidates,
        totals: {
          state: {
            validVotes: result.totalValidVotes,
            votes: result.candidates.map((candidate) => [
              candidate.ballotNumber,
              candidate.validVotes,
            ]),
          },
        },
        municipalResults: currentElectionResults,
      };
      refreshCandidateRankings(state.selection?.selectedCodes ?? []);
      electionLegendView?.update({ candidates: result.candidates, theme: state.theme ?? "dark" });
    }
    if (bannerView) {
      bannerView.update(countState, isSecondRound);
    }
    if (scoreboardView) {
      scoreboardView.update(countState, isSecondRound, state.theme ?? "dark");
    }
  }

  /** @param {import("../domain/election.js").ElectionRoundMode} [mode] */
  function applyElectionProjection(mode = "first-round") {
    if (!engine) {
      return;
    }
    const state = store.getState();
    const municipalities = state.data?.municipalities ?? [];
    if (municipalities.length === 0) {
      return;
    }

    const projection = projectElectionToEngine({
      municipalities,
      municipalResults: currentElectionResults,
      mode,
      theme: state.theme ?? "dark",
      heightMode: state.settings?.heightMode ?? "data",
    });

    if (
      typeof engine.setPalette === "function" &&
      Array.isArray(projection.paletteColors) &&
      projection.paletteColors.length > 0
    ) {
      const basePal = readPalette(documentRef ?? undefined);
      const customPal = withColors(basePal, projection.paletteColors);
      engine.setPalette(customPal);
    }
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

  /**
   * @type {{ office: string; candidates: any[]; totals: any; municipalResults: Record<string, import("../domain/election.js").ElectionUnitResult>; } | null}
   */
  let currentOfficeMeta = null;
  let previousSelectedCodesKey = "";

  /** @param {string[] | string} [selectedCodesInput] */
  function refreshCandidateRankings(selectedCodesInput = []) {
    if (!candidateRankingsView || !currentOfficeMeta) {
      return;
    }
    const state = store.getState();
    const municipalities = state.data?.municipalities ?? [];

    /** @type {string[]} */
    let codes = [];
    if (Array.isArray(selectedCodesInput)) {
      codes = selectedCodesInput;
    }
    if (!Array.isArray(selectedCodesInput) && selectedCodesInput) {
      codes = [selectedCodesInput];
    }

    const selectedList = [];
    for (const code of codes) {
      if (currentElectionResults[code]) {
        const unit = currentElectionResults[code];
        let munName = unit.name;
        if (!munName || munName === code) {
          for (let mIdx = 0; mIdx < municipalities.length; mIdx += 1) {
            const mObj = municipalities[mIdx];
            if (String(mObj.code) === String(code)) {
              munName = mObj.name;
              break;
            }
          }
        }
        if (!munName) {
          munName = code;
        }
        selectedList.push({
          code,
          name: munName,
          validVotes: unit.totalValidVotes,
          blankVotes: unit.blankVotes,
          nullVotes: unit.nullVotes,
          leader: unit.leader,
          candidates: unit.candidates,
          marginPp: unit.marginPp,
        });
      }
    }

    let selectedMun = null;
    if (selectedList.length === 1) {
      selectedMun = selectedList[0];
    }

    candidateRankingsView.update({
      ...currentOfficeMeta,
      municipalResults: currentElectionResults,
      selectedMunicipality: selectedMun,
      selectedMunicipalities: selectedList,
      onClearSelection: () => {
        store.dispatch(clearSelectionAction());
      },
      onSelectMunicipality: (/** @type {string} */ targetCode) => {
        store.dispatch(toggleMunicipalityAction(targetCode));
      },
    });

    if (stageCityPill) {
      if (selectedList.length === 1) {
        const item = selectedList[0];
        const leader = item.leader;
        let leaderText = "";
        if (leader && leader.name) {
          let marginStr = "";
          if (typeof item.marginPp === "number" && item.marginPp > 0) {
            marginStr = ` • +${item.marginPp.toFixed(1).replace(".", ",")} p.p.`;
          }
          leaderText = ` • 🏆 ${leader.name} (${Number(leader.sharePct ?? 0)
            .toFixed(1)
            .replace(".", ",")}%) ${marginStr}`;
        }
        stageCityPill.innerHTML = `
          <span class="stage-pill-dot animate-pulse"></span>
          <span class="stage-pill-city">${item.name}</span>
          <span class="stage-pill-leader">${leaderText}</span>
          <button type="button" class="stage-pill-close" title="Limpar seleção">✕</button>
        `;
        stageCityPill.hidden = false;
        const closeBtn = stageCityPill.querySelector(".stage-pill-close");
        if (closeBtn) {
          closeBtn.addEventListener("click", () => {
            store.dispatch(clearSelectionAction());
          });
        }
      }
      if (selectedList.length > 1) {
        const names = selectedList
          .map((m) => m.name)
          .slice(0, 3)
          .join(", ");
        let extra = "";
        if (selectedList.length > 3) {
          extra = ` (+${selectedList.length - 3})`;
        }
        stageCityPill.innerHTML = `
          <span class="stage-pill-dot animate-pulse"></span>
          <span class="stage-pill-city">📍 ${selectedList.length} cidades</span>
          <span class="stage-pill-leader">• ${names}${extra}</span>
          <button type="button" class="stage-pill-close" title="Limpar seleção">✕</button>
        `;
        stageCityPill.hidden = false;
        const closeBtn = stageCityPill.querySelector(".stage-pill-close");
        if (closeBtn) {
          closeBtn.addEventListener("click", () => {
            store.dispatch(clearSelectionAction());
          });
        }
      }
      if (selectedList.length === 0) {
        stageCityPill.hidden = true;
        stageCityPill.innerHTML = "";
      }
    }
  }

  /**
   * @param {string | undefined} office
   */
  async function switchFirstRoundOffice(office) {
    const state = store.getState();
    const theme = state.theme ?? "dark";
    const municipalities = state.data?.municipalities ?? [];
    const res = await loadFirstRoundElectionData(office, { fetchImpl, theme, municipalities });
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

    currentOfficeMeta = {
      office: res.office,
      candidates: res.candidates,
      totals: res.totals,
      municipalResults: res.municipalResults,
    };

    const selCodes = state.selection?.selectedCodes ?? [];
    refreshCandidateRankings(selCodes);
  }

  async function activateSecondRound() {
    const state = store.getState();
    const theme = state.theme ?? "dark";
    const municipalities = state.data?.municipalities ?? [];

    // Prioriza dados oficiais consolidados do 2º Turno TSE se disponiveis
    const resConsolidated = await loadSecondRoundElectionData({ fetchImpl, theme, municipalities });
    if (resConsolidated.ok && Object.keys(resConsolidated.municipalResults).length > 0) {
      currentElectionResults = resConsolidated.municipalResults;
      syncGlobals();
      applyElectionProjection("first-round");

      if (electionLegendView) {
        electionLegendView.update({
          officeTitle:
            resConsolidated.description || "Presidente da República - 2º Turno 2026 (SP)",
          candidates: resConsolidated.candidates,
          palette: resConsolidated.palette,
          theme,
        });
      }

      currentOfficeMeta = {
        office: "presidente",
        candidates: resConsolidated.candidates,
        totals: resConsolidated.totals,
        municipalResults: resConsolidated.municipalResults,
      };

      const selCodes = state.selection?.selectedCodes ?? [];
      refreshCandidateRankings(selCodes);
      updateViews();
      return;
    }

    if (status.mode === "replay" && status.replay.available) {
      const res2 = await loadSecondRoundReplayData({ fetchImpl, theme, municipalities });
      if (res2.ok && Object.keys(res2.municipalResults).length > 0) {
        currentElectionResults = res2.municipalResults;
        syncGlobals();
        applyElectionProjection("replay");

        if (electionLegendView) {
          electionLegendView.update({
            officeTitle: "Presidente da República - 2º Turno 2026 (SP)",
            candidates: res2.candidates,
            palette: res2.palette,
            theme,
          });
        }

        currentOfficeMeta = {
          office: "presidente",
          candidates: res2.candidates,
          totals: res2.summary,
          municipalResults: res2.municipalResults,
        };

        const selCodes = state.selection?.selectedCodes ?? [];
        refreshCandidateRankings(selCodes);
      }

      return;
    }
    currentElectionResults = countState.municipalResults;
    currentOfficeMeta = null;
    syncGlobals();
    applyElectionProjection("live");
    candidateRankingsView?.update({
      office: "presidente",
      candidates: [],
      municipalResults: currentElectionResults,
    });
    if (countSource) countSource.start();

    updateViews();
  }

  function syncGlobals() {
    if (windowRef) {
      const win = /** @type {any} */ (windowRef);
      win.__electionResults = currentElectionResults;
      win.__activeElectionOffice = currentFirstRoundOffice;
    }
  }

  let previousTab = "indicators";

  // Handle Tab transitions (ELE-17, ELE-19, ELE-20)
  async function handleStateChange() {
    const currentState = store.getState();
    const currentTab = currentState.tab ?? "indicators";
    const selectedCodes = currentState.selection?.selectedCodes ?? [];
    const selectedCodesKey = selectedCodes.slice().sort().join(",");

    if (modeSelector) {
      const selectedCount = selectedCodes.length;
      modeSelector.update(currentTab, status, selectedCount);
    }

    const isNowElection = isElectionTab(currentTab);
    if (isNowElection) {
      if (selectedCodesKey !== previousSelectedCodesKey) {
        previousSelectedCodesKey = selectedCodesKey;
        refreshCandidateRankings(selectedCodes);
      }
    }

    if (currentTab === previousTab) {
      return;
    }

    const prevWasSecondRound = previousTab === "second-round";
    const isNowSecondRound = currentTab === "second-round";
    const isNowFirstRound = currentTab === "first-round";
    previousTab = currentTab;

    // Apply engine elevation rules for election (ELE-12, ELE-15)
    applyElectionEngineSettings(engine, isNowElection);
    applyControlsVisibility(documentRef ?? document, currentTab);

    // Toggle election vs indicator sub-views
    const scaleDock = documentRef?.getElementById("scale-dock");

    if (isNowFirstRound) {
      if (officeSlot) {
        officeSlot.hidden = false;
      }
      if (electionLegendSlot) {
        electionLegendSlot.hidden = false;
      }
      if (rankingsSlot) {
        rankingsSlot.hidden = false;
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
      if (rankingsSlot) {
        rankingsSlot.hidden = false;
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
      if (rankingsSlot) {
        rankingsSlot.hidden = true;
      }
      if (scaleDock) {
        scaleDock.style.display = "";
      }
      if (engine && typeof engine.setPalette === "function") {
        engine.setPalette(readPalette(documentRef ?? undefined));
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
    /**
     * @param {readonly string[]} selectedCodes
     */
    getSelectionProjection(selectedCodes, opts = {}) {
      const state = store.getState();
      return projectElectionSelection(selectedCodes, currentElectionResults, {
        office: state.election?.office ?? currentFirstRoundOffice,
        level: state.level?.id ?? "municipality",
        theme: state.theme ?? "dark",
        ...opts,
      });
    },
    /**
     * @param {[{ code: string; name?: string; }, { code: string; name?: string; }]} pair
     */
    getComparisonProjection(pair, opts = {}) {
      const state = store.getState();
      return projectElectionComparison(pair, currentElectionResults, {
        office: state.election?.office ?? currentFirstRoundOffice,
        level: state.level?.id ?? "municipality",
        theme: state.theme ?? "dark",
        ...opts,
      });
    },
    /**
     * @param {string} query
     * @param {any[]} entries
     */
    getSearchProjection(query, entries, opts = {}) {
      const state = store.getState();
      return projectElectionSearch(query, entries, currentElectionResults, {
        office: state.election?.office ?? currentFirstRoundOffice,
        level: state.level?.id ?? "municipality",
        theme: state.theme ?? "dark",
        ...opts,
      });
    },
    /**
     * @param {any[]} municipalities
     */
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
      if (stageCityPill) {
        stageCityPill.remove();
      }
    },
  };

  if (windowRef) {
    const win = /** @type {any} */ (windowRef);
    win.__electionWiring = wiring;
  }

  return wiring;
}
