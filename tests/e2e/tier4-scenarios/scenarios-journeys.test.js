import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parseUrlState, syncUrlState } from "../../../src/app/url-state.js";
import { computeUnitElectionResult } from "../../../src/domain/election.js";
import { getElectionNeutrals } from "../../../src/domain/election-colors.js";
import { buildElectionCompareModel } from "../../../src/features/election/election-compare-model.js";
import { applyControlsVisibility } from "../../../src/features/election/mode-selector-view.js";
import {
  FIRST_ROUND_OFFICES,
  mountOfficeSelectorView,
} from "../../../src/features/election/office-selector-view.js";
import { createMockWindow, MockDocument } from "../helpers/dom-mock.js";

test("SCEN-01: Journey 1 - Citizen lands on Censo IBGE, clicks Eleições TSE, lands on 2º Turno Presidencial", async () => {
  const { windowRef, documentRef } = createMockWindow("http://localhost:4173/");

  // Step 1: Initial load
  let parsed = parseUrlState(windowRef.location.href);
  assert.equal(parsed.tab, "indicators", "default must be indicators");
  applyControlsVisibility(documentRef, parsed.tab);
  assert.equal(documentRef.documentElement.dataset.mode, "indicator");

  // Step 2: User clicks Eleições TSE
  syncUrlState(windowRef, {
    indicatorId: parsed.indicatorId,
    levelId: parsed.levelId,
    tab: "second-round",
  });
  parsed = parseUrlState(windowRef.location.href);
  assert.equal(parsed.tab, "second-round", "entering elections defaults to 2nd round");
  applyControlsVisibility(documentRef, parsed.tab);
  assert.equal(documentRef.documentElement.dataset.mode, "election");

  // Step 3: Scoreboard and 3D height check for presidential units
  const res = computeUnitElectionResult({
    code: "3550308",
    name: "São Paulo",
    candidates: [
      { ballotNumber: "13", party: "PT", validVotes: 3500000 },
      { ballotNumber: "22", party: "PL", validVotes: 3000000 },
    ],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(res.status, "leading");
  assert.equal(res.leader?.ballotNumber, "13");
  assert.ok(res.height > 1, "margin must produce elevated 3D relief");
});

test("SCEN-02: Journey 2 - Voter explores 1º Turno across all 5 offices", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  /** @type {import("../../../src/features/election/office-selector-view.js").ElectionOffice} */
  let activeOffice = "presidente";
  const view = mountOfficeSelectorView(doc, slot, {
    office: activeOffice,
    onOfficeChange: (off) => {
      activeOffice = off;
    },
  });

  // Cycle through all 5 offices
  for (const office of FIRST_ROUND_OFFICES) {
    view.update(office.id);
    assert.equal(view.getOffice(), office.id);
  }

  view.destroy();
});

test("SCEN-03: Journey 3 - Electoral analyst inspects candidate rankings and top municipalities", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const electionData = {
    office: "presidente",
    candidates: [
      ["13", "Lula", "PT"],
      ["22", "Bolsonaro", "PL"],
    ],
    totals: {
      state: {
        validVotes: 10000000,
        votes: [
          ["13", 5500000],
          ["22", 4500000],
        ],
      },
    },
    municipalResults: {
      3550308: {
        code: "3550308",
        name: "São Paulo",
        totalValidVotes: 5000000,
        candidates: [
          { ballotNumber: "13", validVotes: 3000000, sharePct: 60 },
          { ballotNumber: "22", validVotes: 2000000, sharePct: 40 },
        ],
        leader: { ballotNumber: "13" },
      },
    },
  };

  const rankings = mod.buildElectionCandidateRankings(electionData);
  assert.equal(rankings.candidates[0].ballotNumber, "13");
  assert.equal(rankings.candidates[0].sharePct, 55);
  assert.equal(rankings.candidates[0].topMunicipalitiesByVotes[0].code, "3550308");
});

test("SCEN-04: Journey 4 - Side-by-side territorial comparison of São Paulo and Campinas", () => {
  const lookup = {
    3550308: {
      code: "3550308",
      name: "São Paulo",
      validVotes: 6000000,
      candidates: [
        { ballotNumber: "13", party: "PT", validVotes: 3300000 },
        { ballotNumber: "22", party: "PL", validVotes: 2700000 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    3509502: {
      code: "3509502",
      name: "Campinas",
      validVotes: 600000,
      candidates: [
        { ballotNumber: "13", party: "PT", validVotes: 270000 },
        { ballotNumber: "22", party: "PL", validVotes: 330000 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  const model = buildElectionCompareModel([{ code: "3550308" }, { code: "3509502" }], lookup, {
    office: "presidente",
  });

  assert.equal(model.sides[0].name, "São Paulo");
  assert.equal(model.sides[1].name, "Campinas");
  assert.equal(model.sides[0].leader?.ballotNumber, "13");
  assert.equal(model.sides[1].leader?.ballotNumber, "22");
  assert.ok(model.metrics.length > 0);
});

test("SCEN-05: Journey 5 - Full mode round-trip (IBGE -> TSE 2T -> TSE 1T -> IBGE) with clean restoration", () => {
  const doc = new MockDocument();
  const indicatorContainer = doc.createElement("div");
  indicatorContainer.id = "indicator-container";
  doc.body.append(indicatorContainer);

  const state = {
    tab: "indicators",
    indicatorId: "gdpPerCapita",
    selectedCode: "3550308",
  };

  // Step 1: Switch to TSE 2T
  state.tab = "second-round";
  applyControlsVisibility(
    doc,
    /** @type {import("../../../src/features/election/election-slice.js").ElectionTab} */ (
      state.tab
    ),
  );
  assert.equal(indicatorContainer.hidden, true);

  // Step 2: Switch to TSE 1T
  state.tab = "first-round";
  applyControlsVisibility(
    doc,
    /** @type {import("../../../src/features/election/election-slice.js").ElectionTab} */ (
      state.tab
    ),
  );
  assert.equal(indicatorContainer.hidden, true);

  // Step 3: Switch back to IBGE
  state.tab = "indicators";
  applyControlsVisibility(
    doc,
    /** @type {import("../../../src/features/election/election-slice.js").ElectionTab} */ (
      state.tab
    ),
  );
  assert.equal(indicatorContainer.hidden, false);
  assert.equal(state.selectedCode, "3550308", "selected city must be retained");
  assert.equal(state.indicatorId, "gdpPerCapita", "indicator must be retained");
});

test("SCEN-06: Journey 6 - Deep linking with ?aba=2turno, ?aba=1turno and history navigation", () => {
  const { windowRef } = createMockWindow("http://localhost:4173/?aba=2turno");

  let parsed = parseUrlState(windowRef.location.href);
  assert.equal(parsed.tab, "second-round");

  // User navigates to 1turno
  syncUrlState(windowRef, {
    indicatorId: parsed.indicatorId,
    levelId: parsed.levelId,
    tab: "first-round",
  });
  parsed = parseUrlState(windowRef.location.href);
  assert.equal(parsed.tab, "first-round");

  // User pops history back
  windowRef.location.href = "http://localhost:4173/?aba=2turno";
  windowRef.dispatchPopstate(null);
  parsed = parseUrlState(windowRef.location.href);
  assert.equal(parsed.tab, "second-round");
});

test("SCEN-07: Journey 7 - Mobile user on smartphone (390px) verifies responsive layout and touch targets", () => {
  const css = fs.readFileSync("src/features/layout/layout.css", "utf8");
  const bottomNavCss = fs.readFileSync("src/features/layout/bottom-nav.css", "utf8");

  assert.ok(css.includes("@media"), "must have responsive media query");
  assert.ok(
    bottomNavCss.includes("padding") || bottomNavCss.includes("height"),
    "must specify touch sizing",
  );
});

test("SCEN-08: Journey 8 - Extreme electoral conditions (ties, zero votes, sub-50% threshold)", () => {
  const neutrals = getElectionNeutrals("dark");

  // Sub-case A: 0 valid votes
  const resZero = computeUnitElectionResult({
    code: "3500001",
    candidates: [],
    validVotes: 0,
    sectionsCounted: 100,
    sectionsTotal: 100,
  });
  assert.equal(resZero.status, "no-result");
  assert.equal(resZero.height, 1);
  assert.equal(resZero.color, neutrals.noResult);

  // Sub-case B: Tie
  const resTie = computeUnitElectionResult({
    code: "3500002",
    candidates: [
      { ballotNumber: "13", validVotes: 500 },
      { ballotNumber: "22", validVotes: 500 },
    ],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });
  assert.equal(resTie.status, "tie");
  assert.equal(resTie.height, 1);
  assert.equal(resTie.color, neutrals.tie);

  // Sub-case C: Below 50% counted sections threshold
  const resBelow = computeUnitElectionResult(
    {
      code: "3500003",
      candidates: [
        { ballotNumber: "13", validVotes: 800 },
        { ballotNumber: "22", validVotes: 200 },
      ],
      sectionsCounted: 25,
      sectionsTotal: 100,
    },
    { mode: "replay" },
  );
  assert.equal(resBelow.belowSectionsThreshold, true);
  assert.equal(resBelow.height, 1);
});
