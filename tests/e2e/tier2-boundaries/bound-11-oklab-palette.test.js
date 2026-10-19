import assert from "node:assert/strict";
import test from "node:test";
import {
  assignCandidateColors,
  getElectionNeutrals,
  getPartyColor,
  MAX_CANDIDATE_COLORS,
} from "../../../src/domain/election-colors.js";

test("B11-01: Unknown or empty party string returns fallback party color", () => {
  const colUnknown = getPartyColor("PARTIDO_DESCONHECIDO_99");
  assert.ok(colUnknown.startsWith("#"));

  const colEmpty = getPartyColor("");
  assert.ok(colEmpty.startsWith("#"));

  const colNull = getPartyColor(null);
  assert.ok(colNull.startsWith("#"));
});

test("B11-02: Palette with > 8 candidates groups remainder into others group", () => {
  const candidates = [];
  for (let i = 1; i <= 15; i += 1) {
    candidates.push({
      ballotNumber: String(i),
      party: `P${i}`,
      votes: 1000 - i * 10,
    });
  }

  const palette = assignCandidateColors(candidates, "dark");
  assert.ok(palette.coloredCandidates.length <= MAX_CANDIDATE_COLORS);
  assert.ok(palette.othersCandidates.length > 0);
  assert.equal(palette.othersCandidates[0].color, palette.neutrals.others);
});

test("B11-03: Empty candidate input returns valid palette structure and neutrals", () => {
  const palette = assignCandidateColors([], "dark");
  assert.equal(palette.coloredCandidates.length, 0);
  assert.equal(palette.othersCandidates.length, 0);
  assert.ok(palette.neutrals.noResult);
});

test("B11-04: Candidates from same party trigger hue shift to avoid collision", () => {
  const candidates = [
    { ballotNumber: "13", party: "PT", votes: 5000 },
    { ballotNumber: "1313", party: "PT", votes: 4000 },
  ];

  const palette = assignCandidateColors(candidates, "dark");
  assert.equal(palette.coloredCandidates.length, 2);
  assert.notEqual(
    palette.coloredCandidates[0].color,
    palette.coloredCandidates[1].color,
    "same-party contenders must not share exact same color",
  );
});

test("B11-05: getElectionNeutrals with invalid theme string falls back safely", () => {
  const neutrals = getElectionNeutrals(/** @type {any} */ ("solarized"));
  assert.ok(neutrals.noResult);
  assert.ok(neutrals.tie);
  assert.ok(neutrals.others);
});
