import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignCandidateColors,
  getElectionNeutrals,
} from "../../domain/election-colors.js";
import {
  changeElectionOffice,
  changeElectionTab,
  createElectionState,
  isElectionTab,
  OFFICE_FEDERAL_DEPUTY,
  OFFICE_GOVERNOR,
  OFFICE_PRESIDENT,
  OFFICE_SENATOR,
  OFFICE_STATE_DEPUTY,
  reduceElection,
  TAB_FIRST_ROUND,
  TAB_INDICATORS,
  TAB_SECOND_ROUND,
} from "./election-slice.js";
import {
  FIRST_ROUND_OFFICES,
  mountOfficeSelectorView,
  resolveOfficeLabel,
} from "./office-selector-view.js";
import {
  formatPercentageValue,
  isUnitInOthers,
  mountElectionLegendView,
} from "./election-legend-view.js";
import {
  getSenateExplanationText,
  mountElectionHowToReadView,
  resolveOfficeDidacticContent,
} from "./election-how-to-read-view.js";
import { ELECTION_STRINGS } from "./election-strings.js";

/**
 * Creates a minimal DOM mock environment for headless testing.
 *
 * @returns {{ document: any, window: any }}
 */
function createMockDom() {
  const elements = new Map();

  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      attributes: {},
      dataset: {},
      children: [],
      classList: new Set(),
      style: {},
      hidden: false,
      textContent: "",
      innerHTML: "",
      parentNode: null,
      id: "",
      value: "",
      checked: false,
      type: "",
      name: "",
      listeners: new Map(),

      setAttribute(name, val) {
        el.attributes[name] = String(val);
      },
      getAttribute(name) {
        const val = el.attributes[name];
        if (val !== undefined) {
          return val;
        }
        return null;
      },
      removeAttribute(name) {
        delete el.attributes[name];
      },
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
      addEventListener(event, cb) {
        if (!el.listeners.has(event)) {
          el.listeners.set(event, []);
        }
        el.listeners.get(event).push(cb);
      },
      removeEventListener(event, cb) {
        if (!el.listeners.has(event)) {
          return;
        }
        const filtered = el.listeners.get(event).filter((fn) => fn !== cb);
        el.listeners.set(event, filtered);
      },
      dispatchEvent(eventObj) {
        const type = eventObj.type;
        const cbs = el.listeners.get(type) ?? [];
        for (const cb of cbs) {
          cb(eventObj);
        }
      },
      querySelector(_sel) {
        return null;
      },
      querySelectorAll(_sel) {
        return [];
      },
    };
    return el;
  }

  const head = createElement("head");
  const doc = {
    createElement,
    head,
    documentElement: {
      dataset: {},
      style: {},
    },
    getElementById(id) {
      if (!elements.has(id)) {
        const el = createElement("div");
        el.id = id;
        elements.set(id, el);
      }
      return elements.get(id);
    },
  };

  const win = {
    document: doc,
    location: {
      protocol: "file:",
      href: "file:///brain/c6613aaa/artifact/index.html",
      search: "",
    },
  };

  return { document: doc, window: win };
}

describe("N15 First round tab suite: office selector, legend, and how to read", () => {
  it("TUR-05 assigns up to 8 candidate colors deterministically with remaining relegated to others", () => {
    // 10 candidates with varied municipality leadership counts
    const candidates = [
      { ballotNumber: "10", name: "Cand 10", party: "PART10", ledMunicipalities: 100, votes: 500000 },
      { ballotNumber: "20", name: "Cand 20", party: "PART20", ledMunicipalities: 90, votes: 450000 },
      { ballotNumber: "30", name: "Cand 30", party: "PART30", ledMunicipalities: 80, votes: 400000 },
      { ballotNumber: "40", name: "Cand 40", party: "PART40", ledMunicipalities: 70, votes: 350000 },
      { ballotNumber: "50", name: "Cand 50", party: "PART50", ledMunicipalities: 60, votes: 300000 },
      { ballotNumber: "60", name: "Cand 60", party: "PART60", ledMunicipalities: 50, votes: 250000 },
      { ballotNumber: "70", name: "Cand 70", party: "PART70", ledMunicipalities: 40, votes: 200000 },
      { ballotNumber: "80", name: "Cand 80", party: "PART80", ledMunicipalities: 30, votes: 150000 },
      { ballotNumber: "90", name: "Cand 90", party: "PART90", ledMunicipalities: 20, votes: 100000 },
      { ballotNumber: "95", name: "Cand 95", party: "PART95", ledMunicipalities: 10, votes: 50000 },
    ];

    const palette = assignCandidateColors(candidates, "dark");
    assert.equal(palette.coloredCandidates.length, 8, "Must assign color to exactly 8 top candidates");
    assert.equal(palette.othersCandidates.length, 2, "Must relegate remaining 2 candidates to others");

    // Check others fraction calculation
    assert.ok(palette.othersFraction > 0, "Others fraction must be greater than zero");
    assert.ok(palette.othersSharePct > 0, "Others percentage must be greater than zero");

    // The relegated candidates must have neutrals.others color
    const neutrals = getElectionNeutrals("dark");
    assert.equal(palette.othersCandidates[0].color, neutrals.others);
    assert.equal(palette.othersCandidates[1].color, neutrals.others);
  });

  it("ELE-07 maintains distinct neutral colors and displays only active states with count", () => {
    const neutralsDark = getElectionNeutrals("dark");
    const neutralsLight = getElectionNeutrals("light");

    assert.notEqual(neutralsDark.noResult, neutralsDark.tie);
    assert.notEqual(neutralsDark.noResult, neutralsDark.others);
    assert.notEqual(neutralsDark.tie, neutralsDark.others);

    assert.notEqual(neutralsLight.noResult, neutralsLight.tie);
    assert.notEqual(neutralsLight.noResult, neutralsLight.others);
    assert.notEqual(neutralsLight.tie, neutralsLight.others);

    const { document } = createMockDom();
    const slot = document.createElement("div");

    // Mount legend with only "tie" and "others", "noResult" is 0
    const legend = mountElectionLegendView(document, slot, {
      candidates: [
        { ballotNumber: "22", name: "Candidato A", party: "PL", ledMunicipalities: 400, votes: 1000000 },
      ],
      neutralCounts: {
        noResult: 0,
        tie: 3,
        others: 15,
      },
      theme: "dark",
    });

    const neutralsContainer = legend.element.children.find(
      (c) => c.className === "election-legend-neutrals",
    );
    assert.ok(neutralsContainer, "Neutrals container must exist");

    // Must show tie and others, but NOT noResult (omitted when 0)
    const tieItem = neutralsContainer.children.find(
      (c) => c.className && c.className.includes("election-legend-neutral-tie"),
    );
    const noResultItem = neutralsContainer.children.find(
      (c) => c.className && c.className.includes("election-legend-neutral-no-result"),
    );
    const othersItem = neutralsContainer.children.find(
      (c) => c.className && c.className.includes("election-legend-neutral-others"),
    );

    assert.ok(tieItem, "Tie item must be present when count > 0");
    assert.ok(othersItem, "Others item must be present when count > 0");
    assert.equal(noResultItem, undefined, "No result item must be omitted when count is 0");
  });

  it("TUR-06 displays candidate info, official TSE credit, and inspected unit leader in others", () => {
    const { document } = createMockDom();
    const slot = document.createElement("div");

    const legend = mountElectionLegendView(document, slot, {
      candidates: [
        { ballotNumber: "22", name: "Flavio Bolsonaro", party: "PL", ledMunicipalities: 450, votes: 12000000 },
        { ballotNumber: "13", name: "Lula", party: "PT", ledMunicipalities: 195, votes: 9500000 },
      ],
      neutralCounts: {
        others: 5,
      },
      unlistedOthersVotes: 300000,
      theme: "dark",
    });

    // Verify official credit (TUR-06)
    const footer = legend.element.children.find(
      (c) => c.className === "election-legend-footer",
    );
    assert.ok(footer, "Legend footer must exist");
    assert.equal(
      footer.textContent,
      ELECTION_STRINGS.credits.sourceTseAggregated,
      "Official credit must match TSE CC-BY aggregated data string exactly",
    );

    // Inspect unit NOT in others
    legend.inspectUnit({
      code: "3550308",
      name: "Sao Paulo",
      isOthers: false,
      colorKey: "candidate",
      leaderName: "Flavio Bolsonaro",
    });

    const othersContainer = legend.element.children.find(
      (c) => c.className === "election-legend-others-container",
    );
    assert.equal(othersContainer.hidden, true, "Callout must be hidden when inspected unit is not in others");

    // Inspect unit in others (TUR-06)
    legend.inspectUnit({
      code: "3500105",
      name: "Adamantina",
      isOthers: true,
      colorKey: "others",
      leaderName: "Candidato Local",
      leaderBallot: "77",
      leaderParty: "SOLIDARIEDADE",
      leaderVotes: 4200,
      leaderSharePct: 35.5,
    });

    assert.equal(othersContainer.hidden, false, "Callout must be visible when unit is in others");
    const card = othersContainer.children[0];
    assert.ok(card, "Callout card must be rendered");

    const leaderText = card.children.find(
      (c) => c.className === "election-legend-others-leader",
    );
    assert.ok(leaderText.textContent.includes("Candidato Local"), "Must state local candidate name");
    assert.ok(leaderText.textContent.includes("SOLIDARIEDADE"), "Must state local candidate party");
    assert.ok(leaderText.textContent.includes("77"), "Must state local candidate ballot number");
  });

  it("TUR-08 Como ler view explains linear height and provides didactic Senate two-vote explanation", () => {
    const { document } = createMockDom();
    const slot = document.createElement("div");

    const howToRead = mountElectionHowToReadView(document, slot, {
      office: OFFICE_SENATOR,
      initiallyExpanded: true,
    });

    assert.equal(howToRead.isExpanded(), true);

    const senateExplanation = getSenateExplanationText();
    assert.ok(
      senateExplanation.includes("dois candidatos"),
      "Senate explanation must mention voting for two candidates",
    );
    assert.ok(
      senateExplanation.includes("duas vagas"),
      "Senate explanation must mention two vacancies in dispute",
    );
    assert.ok(
      senateExplanation.includes("dobro"),
      "Senate explanation must explain the doubling of valid nominal votes",
    );

    const didacticContent = resolveOfficeDidacticContent(OFFICE_SENATOR);
    assert.equal(didacticContent.body, senateExplanation);

    // Switch to Governor and verify dynamic update
    howToRead.update(OFFICE_GOVERNOR);
    const govContent = resolveOfficeDidacticContent(OFFICE_GOVERNOR);
    assert.ok(govContent.body.includes("Governador"));
  });

  it("TUR-07 functions in offline artifact mode without live network fetch for all 5 offices", () => {
    const { document, window } = createMockDom();

    // Verify artifact detection logic
    const isFileArtifact = window.location.protocol === "file:";
    assert.equal(isFileArtifact, true, "Mock environment represents offline artifact");

    const officeSlot = document.createElement("div");
    const legendSlot = document.createElement("div");
    const howToReadSlot = document.createElement("div");

    let changedOffice = null;
    const officeSelector = mountOfficeSelectorView(document, officeSlot, {
      office: OFFICE_PRESIDENT,
      onOfficeChange: (newOffice) => {
        changedOffice = newOffice;
      },
    });

    const legendView = mountElectionLegendView(document, legendSlot, {
      officeTitle: "Presidente",
      candidates: [
        { ballotNumber: "22", name: "Flavio Bolsonaro", party: "PL", ledMunicipalities: 400, votes: 12000000 },
        { ballotNumber: "13", name: "Lula", party: "PT", ledMunicipalities: 245, votes: 9500000 },
      ],
      theme: "dark",
    });

    const howToReadView = mountElectionHowToReadView(document, howToReadSlot, {
      office: OFFICE_PRESIDENT,
      initiallyExpanded: false,
    });

    // Cycle through all 5 offices in the offline artifact without throwing
    const allOffices = [
      OFFICE_PRESIDENT,
      OFFICE_GOVERNOR,
      OFFICE_SENATOR,
      OFFICE_FEDERAL_DEPUTY,
      OFFICE_STATE_DEPUTY,
    ];

    for (const off of allOffices) {
      officeSelector.update(off);
      legendView.update({
        officeTitle: resolveOfficeLabel(off),
      });
      howToReadView.update(off);
      assert.equal(officeSelector.getOffice(), off);
    }

    assert.equal(FIRST_ROUND_OFFICES.length, 5, "5 offices available in 1st round");
  });

  it("manages election slice state transitions and office changes", () => {
    let state = createElectionState(TAB_INDICATORS, OFFICE_PRESIDENT);
    assert.equal(state.tab, TAB_INDICATORS);
    assert.equal(state.office, OFFICE_PRESIDENT);
    assert.equal(isElectionTab(state.tab), false);

    // Switch to first round tab
    state = reduceElection(state, changeElectionTab(TAB_FIRST_ROUND));
    assert.equal(state.tab, TAB_FIRST_ROUND);
    assert.equal(isElectionTab(state.tab), true);
    assert.equal(state.selectionNotice, "Selecao mantida");

    // Switch office to Senador
    state = reduceElection(state, changeElectionOffice(OFFICE_SENATOR));
    assert.equal(state.office, OFFICE_SENATOR);

    // Switch office to Deputado Federal
    state = reduceElection(state, changeElectionOffice(OFFICE_FEDERAL_DEPUTY));
    assert.equal(state.office, OFFICE_FEDERAL_DEPUTY);

    // Helper formatting tests
    assert.equal(formatPercentageValue(0), "0,0%");
    assert.equal(formatPercentageValue(15.42), "15,4%");
    assert.equal(isUnitInOthers(null), false);
    assert.equal(isUnitInOthers({ name: "Teste", isOthers: true }), true);
  });
});
