import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignCandidateColors,
  deltaEOklab,
  ELECTION_NEUTRALS,
  formatRgbToHex,
  getElectionNeutrals,
  getPartyColor,
  hueDistanceDegrees,
  MAX_CANDIDATE_COLORS,
  MAX_LEADER_DELTA_C,
  MAX_LEADER_DELTA_L,
  MIN_OKLAB_DELTA_E,
  oklab,
  oklabToOklch,
  oklabToRgb,
  oklch,
  oklchToOklab,
  PARTY_COLOR_TABLE,
  parseHexToRgb,
  shiftCandidateHue,
} from "./election-colors.js";

test("ELE-07 three neutrals in light and dark themes maintain deltaE OKLab >= 0.08 among themselves and reuse the no-data token", () => {
  assert.equal(ELECTION_NEUTRALS.light.noResult, "#bec2cc");
  assert.equal(ELECTION_NEUTRALS.dark.noResult, "#33353c");

  /** @type {Array<"light" | "dark">} */
  const themes = ["light", "dark"];
  for (const theme of themes) {
    const neutrals = getElectionNeutrals(theme);
    const dNoResultTie = deltaEOklab(neutrals.noResult, neutrals.tie);
    const dNoResultOthers = deltaEOklab(neutrals.noResult, neutrals.others);
    const dTieOthers = deltaEOklab(neutrals.tie, neutrals.others);

    assert.ok(
      dNoResultTie >= MIN_OKLAB_DELTA_E,
      `${theme} noResult vs tie deltaE=${dNoResultTie.toFixed(4)} must be >= 0.08`,
    );
    assert.ok(
      dNoResultOthers >= MIN_OKLAB_DELTA_E,
      `${theme} noResult vs others deltaE=${dNoResultOthers.toFixed(4)} must be >= 0.08`,
    );
    assert.ok(
      dTieOthers >= MIN_OKLAB_DELTA_E,
      `${theme} tie vs others deltaE=${dTieOthers.toFixed(4)} must be >= 0.08`,
    );
  }
});

test("ELE-07 every neutral is at least 0.08 deltaE OKLab from every party color in both themes", () => {
  /** @type {Array<"light" | "dark">} */
  const themes = ["light", "dark"];
  for (const theme of themes) {
    const neutrals = getElectionNeutrals(theme);
    const neutralEntries = Object.entries(neutrals);
    const partyTable = PARTY_COLOR_TABLE[theme];

    for (const [party, partyHex] of Object.entries(partyHexMap(partyTable))) {
      for (const [neutralKey, neutralHex] of neutralEntries) {
        const dist = deltaEOklab(partyHex, neutralHex);
        assert.ok(
          dist >= MIN_OKLAB_DELTA_E,
          `${theme} neutral ${neutralKey} (${neutralHex}) vs ${party} (${partyHex}) deltaE=${dist.toFixed(4)} < 0.08`,
        );
      }
    }
  }
});

test("ELE-09 top two leaders in a race keep lightness |deltaL| <= 0.05 and chroma |deltaC| <= 0.03 in both themes", () => {
  /** @type {Array<"light" | "dark">} */
  const themes = ["light", "dark"];
  const syntheticCandidates = [
    { ballotNumber: 91, name: "Candidato Alfa", party: "PA", ledMunicipalities: 380, votes: 5200 },
    { ballotNumber: 92, name: "Candidato Beta", party: "PB", ledMunicipalities: 265, votes: 4800 },
  ];

  for (const theme of themes) {
    const assigned = assignCandidateColors(syntheticCandidates, theme);
    assert.equal(assigned.coloredCandidates.length, 2);
    const firstLch = oklch(assigned.coloredCandidates[0].color);
    const secondLch = oklch(assigned.coloredCandidates[1].color);

    const deltaL = Math.abs(firstLch.L - secondLch.L);
    const deltaC = Math.abs(firstLch.C - secondLch.C);
    const deltaE = deltaEOklab(
      assigned.coloredCandidates[0].color,
      assigned.coloredCandidates[1].color,
    );

    assert.ok(
      deltaL <= MAX_LEADER_DELTA_L,
      `${theme} leader |deltaL|=${deltaL.toFixed(4)} must be <= 0.05`,
    );
    assert.ok(
      deltaC <= MAX_LEADER_DELTA_C,
      `${theme} leader |deltaC|=${deltaC.toFixed(4)} must be <= 0.03`,
    );
    assert.ok(
      deltaE >= MIN_OKLAB_DELTA_E,
      `${theme} leader deltaE=${deltaE.toFixed(4)} must be >= 0.08`,
    );
  }
});

test("ELE-09 hue collision rotation preserves lightness |deltaL| <= 0.05 and chroma |deltaC| <= 0.03 while separating hues", () => {
  /** @type {Array<"light" | "dark">} */
  const themes = ["light", "dark"];
  const samePartyCandidates = [
    { ballotNumber: 9101, name: "Candidato Um", party: "PX", ledMunicipalities: 120, votes: 900 },
    { ballotNumber: 9102, name: "Candidato Dois", party: "PX", ledMunicipalities: 80, votes: 700 },
    { ballotNumber: 9103, name: "Candidato Tres", party: "PX", ledMunicipalities: 40, votes: 500 },
  ];

  for (const theme of themes) {
    const assigned = assignCandidateColors(samePartyCandidates, theme);
    assert.equal(assigned.coloredCandidates.length, 3);
    assert.equal(assigned.coloredCandidates[0].hueShifted, false);
    assert.equal(assigned.coloredCandidates[1].hueShifted, true);
    assert.equal(assigned.coloredCandidates[2].hueShifted, true);

    const leaderLch = oklch(assigned.coloredCandidates[0].color);
    for (let i = 1; i < assigned.coloredCandidates.length; i += 1) {
      const shiftedLch = oklch(assigned.coloredCandidates[i].color);
      assert.ok(Math.abs(leaderLch.L - shiftedLch.L) <= MAX_LEADER_DELTA_L);
      assert.ok(Math.abs(leaderLch.C - shiftedLch.C) <= MAX_LEADER_DELTA_C);
      assert.ok(
        deltaEOklab(assigned.coloredCandidates[0].color, assigned.coloredCandidates[i].color) >=
          MIN_OKLAB_DELTA_E,
      );
    }

    const manualShifted = shiftCandidateHue(getPartyColor("PX", theme), 1, theme);
    const manualLch = oklch(manualShifted);
    assert.ok(Math.abs(leaderLch.L - manualLch.L) <= MAX_LEADER_DELTA_L);
    assert.ok(Math.abs(leaderLch.C - manualLch.C) <= MAX_LEADER_DELTA_C);
  }
});

test("TUR-05 assignCandidateColors selects up to 8 candidates deterministically with ballot tie-break and maps the rest to others", () => {
  const candidates = [
    { ballotNumber: 88, name: "Cand 88", party: "P1", ledMunicipalities: 50, votes: 1000 },
    { ballotNumber: 81, name: "Cand 81", party: "P2", ledMunicipalities: 50, votes: 1000 },
    { ballotNumber: 82, name: "Cand 82", party: "P3", ledMunicipalities: 40, votes: 900 },
    { ballotNumber: 83, name: "Cand 83", party: "P4", ledMunicipalities: 35, votes: 800 },
    { ballotNumber: 84, name: "Cand 84", party: "P5", ledMunicipalities: 30, votes: 700 },
    { ballotNumber: 85, name: "Cand 85", party: "P6", ledMunicipalities: 25, votes: 600 },
    { ballotNumber: 86, name: "Cand 86", party: "P7", ledMunicipalities: 20, votes: 500 },
    { ballotNumber: 87, name: "Cand 87", party: "P8", ledMunicipalities: 15, votes: 400 },
    { ballotNumber: 89, name: "Cand 89", party: "P9", ledMunicipalities: 10, votes: 300 },
    { ballotNumber: 90, name: "Cand 90", party: "P0", ledMunicipalities: 5, votes: 200 },
  ];

  const darkResult = assignCandidateColors(candidates, "dark", { unlistedOthersVotes: 100 });
  const PermutedResult = assignCandidateColors([...candidates].reverse(), "dark", {
    unlistedOthersVotes: 100,
  });

  assert.equal(darkResult.coloredCandidates.length, MAX_CANDIDATE_COLORS);
  assert.equal(darkResult.othersCandidates.length, 2);

  // Tie in ledMunicipalities (50) and votes (1000) broken by lower ballotNumber (81 before 88)
  assert.equal(darkResult.coloredCandidates[0].ballotNumber, "81");
  assert.equal(darkResult.coloredCandidates[1].ballotNumber, "88");

  // Invariance to input permutation
  assert.deepEqual(
    darkResult.orderedCandidates.map((c) => ({ b: c.ballotNumber, color: c.color })),
    PermutedResult.orderedCandidates.map((c) => ({ b: c.ballotNumber, color: c.color })),
  );

  // All 8 categorical colors are pairwise >= 0.08 deltaE OKLab and >= 0.08 from all neutrals
  for (let i = 0; i < darkResult.coloredCandidates.length; i += 1) {
    const cA = darkResult.coloredCandidates[i].color;
    assert.ok(deltaEOklab(cA, darkResult.neutrals.noResult) >= MIN_OKLAB_DELTA_E);
    assert.ok(deltaEOklab(cA, darkResult.neutrals.tie) >= MIN_OKLAB_DELTA_E);
    assert.ok(deltaEOklab(cA, darkResult.neutrals.others) >= MIN_OKLAB_DELTA_E);

    for (let j = i + 1; j < darkResult.coloredCandidates.length; j += 1) {
      const cB = darkResult.coloredCandidates[j].color;
      const d = deltaEOklab(cA, cB);
      assert.ok(
        d >= MIN_OKLAB_DELTA_E,
        `Pair (${i}, ${j}) color distance ${d.toFixed(4)} must be >= 0.08`,
      );
    }
  }

  // Remaining candidates get the "others" neutral and othersFraction is exact
  for (const other of darkResult.othersCandidates) {
    assert.equal(other.isOthers, true);
    assert.equal(other.color, darkResult.neutrals.others);
  }
  assert.equal(darkResult.othersVotes, 300 + 200 + 100);
  assert.equal(darkResult.totalVotes, 6500);
  assert.ok(Math.abs(darkResult.othersFraction - 600 / 6500) < 1e-12);
});

test("ELE-09 OKLab and OKLCH round-trip conversions and angular distance are accurate", () => {
  const sampleHex = "#3b82f6";
  const rgb = parseHexToRgb(sampleHex);
  const lab = oklab(sampleHex);
  const lch = oklabToOklch(lab);
  const backLab = oklchToOklab(lch.L, lch.C, lch.h);
  const backRgb = oklabToRgb(backLab.L, backLab.a, backLab.b);

  assert.equal(formatRgbToHex(backRgb), sampleHex);
  assert.ok(Math.abs(rgb.r - backRgb.r) < 0.01);
  assert.equal(hueDistanceDegrees(10, 350), 20);
  assert.equal(hueDistanceDegrees(350, 10), 20);
  assert.equal(hueDistanceDegrees(0, 180), 180);
});

/**
 * @param {Record<string, string>} table
 * @returns {Record<string, string>}
 */
function partyHexMap(table) {
  return table;
}
