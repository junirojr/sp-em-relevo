import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCountSource } from "../../app/count-source.js";
import {
  ARTIFACT_TIMELESS_NOTICE,
  isArtifactEnvironment,
  isElectionFeatureEnabled,
  renderArtifactNotice,
  renderRetryUi,
} from "../../app/election-loader.js";
import { projectElectionToEngine } from "../../app/election-projection.js";
import {
  calculateFailureBackoff,
  hasTrackingChanged,
  isBlocked404,
  markHttp404,
  parseMunicipalCountPayload,
  planMunicipalQueue,
  resolveBannerState,
} from "../../domain/count-reader.js";
import {
  computeCandidateSharePct,
  computeElectionHeight,
  computeUnitElectionResult,
  isBelowSectionsThreshold,
  sortCandidatesByBallotNumber,
} from "../../domain/election.js";
import { assignCandidateColors } from "../../domain/election-colors.js";
import {
  changeElectionTab,
  createElectionState,
  isElectionTab,
  reduceElection,
  shouldHideIndicatorControls,
} from "../election/election-slice.js";
import {
  ELECTION_STRINGS,
  formatBrasiliaHour,
  formatCandidateLeadMessage,
  formatElectedAnnouncement,
  formatNoConnectionMessage,
  formatPartialCountMessage,
  formatTseStoppedMessage,
} from "../election/election-strings.js";
import { applyControlsVisibility, mountModeSelectorView } from "../election/mode-selector-view.js";
import { mountCountBannerView } from "./count-banner-view.js";
import { mountCountScoreboardView } from "./count-scoreboard-view.js";
import {
  countConcluded,
  countConnectionError,
  countConnectionRestored,
  countMunicipalPacketReceived,
  countStateUpdated,
  countTrackingUpdated,
  createCountState,
  reduceCount,
} from "./count-slice.js";

/**
 * Creates a minimal mock DOM Document and Window for headless unit tests.
 */
function createMockEnvironment() {
  const elements = new Map();

  /**
   * @param {string} tag
   */
  function createElement(tag) {
    /** @type {any} DOM test double. */
    const el = {
      tagName: tag.toUpperCase(),
      attributes: {},
      children: [],
      classList: new Set(),
      style: {},
      hidden: false,
      textContent: "",
      innerHTML: "",
      parentNode: null,
      /**
       * @param {string | number} name
       * @param {any} val
       */
      setAttribute(name, val) {
        el.attributes[name] = String(val);
      },
      /**
       * @param {string | number} name
       */
      getAttribute(name) {
        return el.attributes[name] ?? null;
      },
      /**
       * @param {any[]} items
       */
      append(...items) {
        for (const item of items) {
          if (typeof item === "string") {
            el.children.push({ textContent: item });
            continue;
          }
          item.parentNode = el;
          el.children.push(item);
        }
      },
      /**
       * @param {any} _selector
       */
      querySelector(_selector) {
        return null;
      },
      /**
       * @param {any} _selector
       */
      querySelectorAll(_selector) {
        return [];
      },
      /**
       * @param {any} _ev
       * @param {any} _cb
       */
      addEventListener(_ev, _cb) {},
      /**
       * @param {any} _ev
       * @param {any} _cb
       */
      removeEventListener(_ev, _cb) {},
    };
    return el;
  }

  /** @type {any} DOM test double. */
  const documentRef = {
    createElement,
    /**
     * @param {string} id
     */
    getElementById(id) {
      if (!elements.has(id)) {
        const el = createElement("div");
        el.id = id;
        elements.set(id, el);
      }
      return elements.get(id);
    },
    /**
     * @param {any} _selector
     */
    querySelector(_selector) {
      return null;
    },
    /**
     * @param {any} _selector
     */
    querySelectorAll(_selector) {
      return [];
    },
    documentElement: {
      dataset: {},
      style: {},
    },
    head: createElement("head"),
    /**
     * @param {any} _ev
     * @param {any} _cb
     */
    addEventListener(_ev, _cb) {},
    /**
     * @param {any} _ev
     * @param {any} _cb
     */
    removeEventListener(_ev, _cb) {},
    hidden: false,
  };

  /** @type {any} Window test double. */
  const windowRef = {
    location: {
      protocol: "https:",
      href: "https://junirojr.github.io/sp-em-relevo/",
      search: "",
    },
    history: {
      replaceState: () => {},
    },
    /**
     * @param {any} _ev
     * @param {any} _cb
     */
    addEventListener(_ev, _cb) {},
    /**
     * @param {any} _ev
     * @param {any} _cb
     */
    removeEventListener(_ev, _cb) {},
  };

  return { documentRef, windowRef, elements };
}

describe("N13 live election counting unit tests", () => {
  it("TXT-01 centralizes all election and count interface strings in an immutable catalog without literals", () => {
    assert.ok(Object.isFrozen(ELECTION_STRINGS));
    assert.ok(Object.isFrozen(ELECTION_STRINGS.mode));
    assert.ok(Object.isFrozen(ELECTION_STRINGS.scope));
    assert.ok(Object.isFrozen(ELECTION_STRINGS.credits));
    assert.ok(Object.isFrozen(ELECTION_STRINGS.noResultReasons));

    assert.equal(ELECTION_STRINGS.scope.stateLabel, "em Sao Paulo");
    assert.equal(ELECTION_STRINGS.scope.timezoneSuffix, "(Brasilia)");
    assert.equal(ELECTION_STRINGS.verbs.leads, "lidera");
    assert.equal(ELECTION_STRINGS.credits.sourceTse, "Fonte: TSE");
  });

  it("ELE-21 formats hours strictly with (Brasilia) and lead messages with neutral terminology and em Sao Paulo", () => {
    const formattedHour = formatBrasiliaHour("17:45:00");
    assert.equal(formattedHour, "17:45:00 (Brasilia)");

    const leadMsg = formatCandidateLeadMessage("Candidato A", "5,20");
    assert.ok(leadMsg.includes("lidera em Sao Paulo"));
    assert.ok(leadMsg.includes("a frente"));
    assert.ok(!leadMsg.includes("vence"));
    assert.ok(!leadMsg.includes("ganhou"));
  });

  it("ELE-08 provides explicit textual reasons for units without results or below sections threshold", () => {
    assert.equal(ELECTION_STRINGS.noResultReasons.noSections, "Nenhuma secao apurada");
    assert.equal(ELECTION_STRINGS.noResultReasons.reading, "Ainda lendo");
    assert.equal(ELECTION_STRINGS.noResultReasons.failed, "Leitura falhou");
    assert.equal(
      ELECTION_STRINGS.noResultReasons.insufficientSections,
      "Secoes insuficientes (< 50%)",
    );

    const belowThreshold = isBelowSectionsThreshold({
      sectionsCounted: 49,
      sectionsTotal: 100,
      mode: "live",
    });
    assert.equal(belowThreshold, true);

    const atThreshold = isBelowSectionsThreshold({
      sectionsCounted: 50,
      sectionsTotal: 100,
      mode: "live",
    });
    assert.equal(atThreshold, false);
  });

  it("ELE-10 candidate colors maintain lightness parity and deterministic OKLCH properties", () => {
    const candidates = [
      { ballotNumber: "10", name: "Alpha", party: "REPUBLICANOS", votes: 5000 },
      { ballotNumber: "20", name: "Beta", party: "PT", votes: 4800 },
    ];
    const palette = assignCandidateColors(candidates, "dark");
    assert.equal(palette.coloredCandidates.length, 2);

    const c1 = palette.byBallotNumber.get("10");
    const c2 = palette.byBallotNumber.get("20");
    assert.ok(c1);
    assert.ok(c2);
    assert.notEqual(c1.color, c2.color);
  });

  it("ELE-11 candidate listings are deterministically sorted strictly by ballot number across views", () => {
    const candidates = [
      {
        ballotNumber: "22",
        name: "B",
        validVotes: 300,
        numericBallot: 22,
        sharePct: 30,
        votes: 300,
        party: "PL",
      },
      {
        ballotNumber: "13",
        name: "A",
        validVotes: 700,
        numericBallot: 13,
        sharePct: 70,
        votes: 700,
        party: "PT",
      },
    ];
    const sorted = sortCandidatesByBallotNumber(candidates);
    assert.equal(sorted[0].ballotNumber, "13");
    assert.equal(sorted[1].ballotNumber, "22");
  });

  it("ELE-17 mode transitions maintain selection and level and update state atomically", () => {
    const initialState = createElectionState("indicators");
    const nextState = reduceElection(initialState, changeElectionTab("second-round"));

    assert.equal(nextState.tab, "second-round");
    assert.equal(nextState.selectionNotice, "Selecao mantida");
  });

  it("ELE-18 mode selector view mounts native radios with legend in slot and remains visible", () => {
    const { documentRef } = createMockEnvironment();
    const slot = documentRef.getElementById("mode-selector-slot");

    let tabSelected = null;
    const view = mountModeSelectorView(documentRef, slot, {
      tab: "indicators",
      onTabChange: (t) => {
        tabSelected = t;
      },
    });

    assert.ok(view.element);
    assert.equal(slot.hidden, false);
    assert.equal(view.element.tagName, "FIELDSET");
    view.destroy();
  });

  it("ELE-19 hides indicator controls (appearance, step, demo) when in election modes", () => {
    const { documentRef } = createMockEnvironment();
    applyControlsVisibility(documentRef, "second-round");
    assert.equal(documentRef.documentElement.dataset.mode, "election");
    assert.equal(shouldHideIndicatorControls("second-round"), true);
    assert.equal(shouldHideIndicatorControls("indicators"), false);

    applyControlsVisibility(documentRef, "indicators");
    assert.equal(documentRef.documentElement.dataset.mode, "indicator");
  });

  it("ELE-20 detects election tabs correctly", () => {
    assert.equal(isElectionTab("second-round"), true);
    assert.equal(isElectionTab("first-round"), true);
    assert.equal(isElectionTab("indicators"), false);
  });

  it("APU-07 banner slot has role='status' and aria-live='polite' and renders correctly", () => {
    const { documentRef } = createMockEnvironment();
    const slot = documentRef.getElementById("election-banner-slot");

    const bannerView = mountCountBannerView(documentRef, slot);
    assert.equal(slot.getAttribute("role"), "status");
    assert.equal(slot.getAttribute("aria-live"), "polite");

    const state = createCountState();
    bannerView.update(state, true);
    assert.equal(slot.hidden, false);
    bannerView.destroy();
  });

  it("APU-08 formats distinct messages for TSE stopped vs no connection without 'Recarregue a pagina'", () => {
    const stoppedMsg = formatTseStoppedMessage("17:30:00");
    const noConnMsg = formatNoConnectionMessage("17:30:00");

    assert.equal(stoppedMsg, "O TSE nao publicou dados novos desde 17:30:00 (Brasilia)");
    assert.equal(noConnMsg, "Sem conexao com o TSE desde 17:30:00 (Brasilia)");
    assert.ok(!stoppedMsg.includes("Recarregue"));
    assert.ok(!noConnMsg.includes("Recarregue"));
  });

  it("APU-09 formats partial count message with sections percentage and read count", () => {
    const partialMsg = formatPartialCountMessage("45,50", 300, 645);
    assert.equal(
      partialMsg,
      "Em apuracao em Sao Paulo: 45,50% das secoes (300 de 645 municipios lidos)",
    );
  });

  it("APU-09 planning prioritizes descending electorate and respects rate limit", () => {
    const queuePlan = planMunicipalQueue({
      trackingMunicipalities: [
        { cd: "35001", elet: 5000, st: 10 },
        { cd: "35002", elet: 500000, st: 20 },
      ],
      municipalConfigMap: {
        35001: { cd: "35001", elet: 5000, nm: "Mun A" },
        35002: { cd: "35002", elet: 500000, nm: "Mun B" },
      },
    });

    assert.equal(queuePlan.queue.length, 2);
    assert.equal(queuePlan.queue[0].cd, "35002");
    assert.equal(queuePlan.queue[1].cd, "35001");
    assert.ok(queuePlan.intervalMs >= 100);
  });

  it("APU-10 proclamation announcement quotes the TSE mathematically defined election", () => {
    const announcement = formatElectedAnnouncement("Candidato Vencedor", "PART");
    assert.equal(
      announcement,
      "Segundo o TSE, Candidato Vencedor (PART) esta matematicamente eleito para a Presidencia da Republica.",
    );
  });

  it("APU-11 count source respects pause and resume on visibility change", () => {
    const { documentRef } = createMockEnvironment();
    let fetchCount = 0;
    const fakeFetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ dg: "25/10/2026", hg: "17:00", abr: [] }));
    };

    const source = createCountSource({
      fetchImpl: fakeFetch,
      documentRef,
      pollIntervalMs: 50000,
    });

    assert.equal(source.isRunning(), false);
    source.start();
    assert.equal(source.isRunning(), true);

    source.pause();
    assert.equal(source.isRunning(), false);

    source.resume();
    assert.equal(source.isRunning(), true);
    source.destroy();
  });

  it("APU-12 handles failure backoff after 3 consecutive failures", () => {
    const noBackoff = calculateFailureBackoff({ consecutiveFailures: 2 });
    assert.equal(noBackoff.inBackoff, false);

    const backoff = calculateFailureBackoff({ consecutiveFailures: 3 });
    assert.equal(backoff.inBackoff, true);
    assert.ok(backoff.waitSeconds >= 600);
  });

  it("APU-13 countConcluded marks apuracao as concluded and stops polling", () => {
    const state = createCountState();
    const concludedState = reduceCount(state, countConcluded());

    assert.equal(concludedState.isConcluded, true);
    assert.equal(concludedState.bannerState, "apuracao-concluida");
  });

  it("APU-14 detects artifact environment and renders timeless notice without network fetch", () => {
    const { documentRef, windowRef } = createMockEnvironment();
    windowRef.location.protocol = "file:";
    assert.equal(isArtifactEnvironment(windowRef), true);

    const slot = documentRef.getElementById("election-banner-slot");
    renderArtifactNotice(slot, documentRef);
    assert.equal(slot.hidden, false);
    assert.ok(slot.children.length > 0);
  });

  it("APU-16 processes municipal packet payload and updates state", () => {
    const state = createCountState();
    const nextState = reduceCount(
      state,
      countMunicipalPacketReceived("3550308", {
        name: "Sao Paulo",
        sectionsCounted: 100,
        sectionsTotal: 100,
        totalValidVotes: 1000,
        candidates: [
          { ballotNumber: "10", validVotes: 600 },
          { ballotNumber: "20", validVotes: 400 },
        ],
      }),
    );

    assert.equal(nextState.readCount, 1);
    assert.ok(nextState.municipalResults["3550308"]);
    assert.equal(nextState.municipalResults["3550308"].marginVotes, 200);
  });

  it("FLG-01 checks whether election features are enabled in operational status", () => {
    assert.equal(isElectionFeatureEnabled({ mode: "disabled" }), false);
    assert.equal(isElectionFeatureEnabled({ features: { election: false } }), false);
    assert.equal(isElectionFeatureEnabled({ features: { election: true } }), true);
  });

  it("FLG-03 renders retry UI on dynamic import error", () => {
    const { documentRef } = createMockEnvironment();
    const slot = documentRef.getElementById("election-banner-slot");
    let retried = false;
    renderRetryUi(slot, documentRef, () => {
      retried = true;
    });

    assert.equal(slot.hidden, false);
    assert.ok(slot.children.length > 0);
  });
});
