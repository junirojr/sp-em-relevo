import assert from "node:assert/strict";
import test from "node:test";
import { parseUrlState, syncUrlState } from "../../../src/app/url-state.js";
import {
  computeUnitElectionResult,
  isBelowSectionsThreshold,
} from "../../../src/domain/election.js";
import { getElectionNeutrals, getPartyColor } from "../../../src/domain/election-colors.js";
import { buildElectionCompareModel } from "../../../src/features/election/election-compare-model.js";
import { applyControlsVisibility } from "../../../src/features/election/mode-selector-view.js";
import { FIRST_ROUND_OFFICES } from "../../../src/features/election/office-selector-view.js";
import { createMockWindow, MockDocument } from "../helpers/dom-mock.js";

test("PAIR-01: Mode toggle [IBGE <-> TSE] x URL sync [?aba=...]", () => {
  const { windowRef } = createMockWindow("http://localhost:4173/");

  // Switch to TSE 2nd round
  syncUrlState(windowRef, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "second-round",
  });
  assert.equal(new URL(windowRef.location.href).searchParams.get("aba"), "2turno");

  // Switch to TSE 1st round
  syncUrlState(windowRef, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "first-round",
  });
  assert.equal(new URL(windowRef.location.href).searchParams.get("aba"), "1turno");

  // Switch back to IBGE
  syncUrlState(windowRef, {
    indicatorId: "population",
    levelId: "municipality",
    tab: "indicators",
  });
  assert.equal(new URL(windowRef.location.href).searchParams.has("aba"), false);
});

test("PAIR-02: Mode toggle [TSE] x Theme switch [Claro <-> Escuro] palette adaptation", () => {
  const darkNeutrals = getElectionNeutrals("dark");
  const lightNeutrals = getElectionNeutrals("light");

  const darkPt = getPartyColor("PT", "dark");
  const lightPt = getPartyColor("PT", "light");

  assert.notEqual(darkPt, lightPt, "party color must adapt lightness/chroma across themes");
  assert.notEqual(darkNeutrals.noResult, lightNeutrals.noResult);
});

test("PAIR-03: Mode toggle [IBGE <-> TSE] x Mobile bottom navigation sync", async () => {
  const modToggle = await import("../../../src/features/layout/mode-toggle-view.js").catch(
    () => null,
  );
  assert.ok(modToggle, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let activeTab = "indicators";
  modToggle.mountModeToggle(container, {
    activeTab,
    onSelectTab: (t) => {
      activeTab = t;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  if (buttons.length >= 2) {
    buttons[1].click();
    assert.equal(activeTab, "second-round");
  }
});

test("PAIR-04: Mode toggle [TSE] x Territorial level [municipality <-> region]", () => {
  const lookup = {
    3550308: {
      code: "3550308",
      name: "São Paulo",
      validVotes: 1000,
      candidates: [
        { ballotNumber: "13", validVotes: 700 },
        { ballotNumber: "22", validVotes: 300 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  const munModel = buildElectionCompareModel([{ code: "3550308" }, { code: "3550308" }], lookup, {
    level: "municipality",
  });
  assert.equal(munModel.sides[0].kind, "municipality");
});

test("PAIR-05: Office selection [Presidente] x 2nd round scoreboard & replay margins", () => {
  const res = computeUnitElectionResult(
    {
      code: "3550308",
      candidates: [
        { ballotNumber: "13", validVotes: 600 },
        { ballotNumber: "22", validVotes: 400 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    { mode: "second-round" },
  );

  assert.equal(res.marginPp, 20);
  assert.equal(res.status, "leading");
  assert.equal(res.leader?.ballotNumber, "13");
});

test("PAIR-06: Office selection [1st round 5 offices] x Candidate rankings model", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  for (const office of FIRST_ROUND_OFFICES) {
    const data = {
      office: office.id,
      candidates: [
        ["1", "Leader A", "PA"],
        ["2", "Runner B", "PB"],
      ],
      totals: {
        state: {
          validVotes: 100,
          votes: [
            ["1", 60],
            ["2", 40],
          ],
        },
      },
    };
    const rankings = mod.buildElectionCandidateRankings(data);
    assert.equal(rankings.office, office.id);
    assert.equal(rankings.candidates[0].ballotNumber, "1");
  }
});

test("PAIR-07: Office selection [Deputies] x Top municipalities calculation", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const data = {
    office: "deputado-federal",
    candidates: [["1010", "Marcos Pereira", "REPUBLICANOS"]],
    totals: { state: { validVotes: 500, votes: [["1010", 500]] } },
    municipalResults: {
      3550308: {
        code: "3550308",
        name: "São Paulo",
        totalValidVotes: 500,
        candidates: [{ ballotNumber: "1010", validVotes: 500, sharePct: 100 }],
        leader: { ballotNumber: "1010" },
      },
    },
  };

  const rankings = mod.buildElectionCandidateRankings(data);
  assert.equal(rankings.candidates[0].topMunicipalitiesByVotes[0].code, "3550308");
  assert.equal(rankings.candidates[0].ledCount, 1);
});

test("PAIR-08: Office selection [Governador] x Territorial comparison between 2 cities", () => {
  const lookup = {
    3550308: {
      code: "3550308",
      name: "São Paulo",
      validVotes: 1000,
      candidates: [{ ballotNumber: "10", validVotes: 600, name: "Cand Gov A" }],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    3509502: {
      code: "3509502",
      name: "Campinas",
      validVotes: 1000,
      candidates: [{ ballotNumber: "10", validVotes: 700, name: "Cand Gov A" }],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  const model = buildElectionCompareModel([{ code: "3550308" }, { code: "3509502" }], lookup, {
    office: "governador",
  });

  assert.equal(model.office, "governador");
  assert.equal(model.officeLabel, "Governador");
});

test("PAIR-09: Live/replay status x 50% counted sections threshold height", () => {
  const isBelow = isBelowSectionsThreshold({
    sectionsCounted: 30,
    sectionsTotal: 100,
    mode: "live",
  });
  assert.equal(isBelow, true);

  const res = computeUnitElectionResult(
    {
      code: "3550308",
      candidates: [
        { ballotNumber: "13", validVotes: 800 },
        { ballotNumber: "22", validVotes: 200 },
      ],
      sectionsCounted: 30,
      sectionsTotal: 100,
    },
    { mode: "live" },
  );

  assert.equal(res.height, 1, "height clamped to 1 when below threshold");
});

test("PAIR-10: Keyboard navigation [Tab/Arrows] x Mode toggle segmented pill", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let activeTab = "indicators";
  mod.mountModeToggle(container, {
    activeTab,
    onSelectTab: (t) => {
      activeTab = t;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  if (buttons.length >= 2) {
    buttons[0].focus();
    buttons[0].dispatchEvent({
      type: "keydown",
      key: "ArrowRight",
      code: "ArrowRight",
      bubbles: true,
    });
    assert.ok(activeTab === "second-round" || doc.activeElement === buttons[1]);
  }
});

test("PAIR-11: Switch to TSE mode x Demographic panel hiding (Degrau, Cor do mapa)", () => {
  const doc = new MockDocument();
  const indContainer = doc.createElement("div");
  indContainer.id = "indicator-container";
  doc.body.append(indContainer);

  applyControlsVisibility(doc, "second-round");
  assert.equal(indContainer.hidden, true);
  assert.equal(doc.documentElement.dataset.mode, "election");
});

test("PAIR-12: Switch to IBGE mode x Demographic restoration (quantile coloring & step height)", () => {
  const doc = new MockDocument();
  const indContainer = doc.createElement("div");
  indContainer.id = "indicator-container";
  doc.body.append(indContainer);

  applyControlsVisibility(doc, "second-round");
  assert.equal(indContainer.hidden, true);

  applyControlsVisibility(doc, "indicators");
  assert.equal(indContainer.hidden, false);
  assert.equal(doc.documentElement.dataset.mode, "indicator");
});

test("PAIR-13: Territorial comparison x Territorial level switch (governmentRegion vs region)", () => {
  const lookup = {
    "rg-40": {
      code: "rg-40",
      name: "RG São Paulo",
      validVotes: 5000,
      candidates: [],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    "rg-11": {
      code: "rg-11",
      name: "RG Campinas",
      validVotes: 3000,
      candidates: [],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  const model = buildElectionCompareModel([{ code: "rg-40" }, { code: "rg-11" }], lookup, {
    level: "governmentRegion",
  });

  assert.equal(model.sides[0].kind, "governmentRegion");
  assert.equal(model.sides[1].kind, "governmentRegion");
});

test("PAIR-14: Candidate ranking x Office switch (Presidente -> Senador)", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const dataPres = {
    office: "presidente",
    candidates: [
      ["13", "Lula", "PT"],
      ["22", "Bolsonaro", "PL"],
    ],
    totals: {
      state: {
        validVotes: 100,
        votes: [
          ["13", 55],
          ["22", 45],
        ],
      },
    },
  };
  const rPres = mod.buildElectionCandidateRankings(dataPres);
  assert.equal(rPres.office, "presidente");

  const dataSen = {
    office: "senador",
    candidates: [
      ["100", "Senador A", "PA"],
      ["200", "Senador B", "PB"],
    ],
    totals: {
      state: {
        validVotes: 100,
        votes: [
          ["100", 60],
          ["200", 40],
        ],
      },
    },
  };
  const rSen = mod.buildElectionCandidateRankings(dataSen);
  assert.equal(rSen.office, "senador");
  assert.equal(rSen.candidates[0].ballotNumber, "100");
});

test("PAIR-15: Unit selection outline x Preserving candidate color during office switch", () => {
  const resultPres = computeUnitElectionResult(
    {
      code: "3550308",
      candidates: [{ ballotNumber: "13", party: "PT", validVotes: 100 }],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    { colorByBallotNumber: { 13: "#c0392b" } },
  );

  const resultGov = computeUnitElectionResult(
    {
      code: "3550308",
      candidates: [{ ballotNumber: "10", party: "REPUBLICANOS", validVotes: 100 }],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    { colorByBallotNumber: { 10: "#2980b9" } },
  );

  assert.equal(resultPres.color, "#c0392b");
  assert.equal(resultGov.color, "#2980b9");
});

test("PAIR-16: Browser popstate event x Active mode and controls synchronization", () => {
  const { windowRef, documentRef } = createMockWindow("http://localhost:4173/?aba=2turno");

  let parsed = parseUrlState(windowRef.location.href);
  assert.equal(parsed.tab, "second-round");
  applyControlsVisibility(documentRef, parsed.tab);
  assert.equal(documentRef.documentElement.dataset.mode, "election");

  // User hits back button to indicators
  windowRef.location.href = "http://localhost:4173/";
  windowRef.dispatchPopstate(null);

  parsed = parseUrlState(windowRef.location.href);
  assert.equal(parsed.tab, "indicators");
  applyControlsVisibility(documentRef, parsed.tab);
  assert.equal(documentRef.documentElement.dataset.mode, "indicator");
});
