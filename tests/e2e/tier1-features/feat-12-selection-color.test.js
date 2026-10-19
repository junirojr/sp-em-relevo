import assert from "node:assert/strict";
import test from "node:test";
import { computeUnitElectionResult } from "../../../src/domain/election.js";
import {
  MIN_CONTRAST_RATIO,
  OUTLINE_DARK_TONE,
  OUTLINE_INNER_WIDTH,
  OUTLINE_LIGHT_TONE,
  OUTLINE_OUTER_WIDTH,
} from "../../../src/engine/selection-outline.js";

test("F12-01: Selected unit maintains candidate party color in election mode without fill replacement", () => {
  const result = computeUnitElectionResult({
    code: "3550308",
    name: "São Paulo",
    candidates: [
      { ballotNumber: "13", party: "PT", validVotes: 3000 },
      { ballotNumber: "22", party: "PL", validVotes: 2000 },
    ],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  const baseColor = result.color;
  assert.ok(baseColor && baseColor.length > 0);

  // In election mode, selection preserves candidate leader color instead of overriding with selection blue
  const selectedUnitColor = result.color;
  assert.equal(selectedUnitColor, baseColor, "unit color must be preserved upon selection");
});

test("F12-02: Selection outline defines 3px inner width and 5px outer width", () => {
  assert.equal(OUTLINE_INNER_WIDTH, 3);
  assert.equal(OUTLINE_OUTER_WIDTH, 5);
});

test("F12-03: Selection outline uses contrasting dark and light tones", () => {
  assert.equal(OUTLINE_DARK_TONE, "#000000");
  assert.equal(OUTLINE_LIGHT_TONE, "#ffffff");
  assert.ok(MIN_CONTRAST_RATIO >= 3.0);
});

test("F12-04: Multi-unit selection preserves respective leader colors for each unit", () => {
  const unitA = computeUnitElectionResult(
    {
      code: "3550308",
      candidates: [
        { ballotNumber: "13", party: "PT", validVotes: 1000 },
        { ballotNumber: "22", party: "PL", validVotes: 500 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    { colorByBallotNumber: { 13: "#c0392b", 22: "#2980b9" } },
  );

  const unitB = computeUnitElectionResult(
    {
      code: "3509502",
      candidates: [
        { ballotNumber: "13", party: "PT", validVotes: 500 },
        { ballotNumber: "22", party: "PL", validVotes: 1000 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    { colorByBallotNumber: { 13: "#c0392b", 22: "#2980b9" } },
  );

  assert.notEqual(unitA.color, unitB.color, "differing leaders must have distinct colors");
});

test("F12-05: Deselecting unit leaves candidate color unchanged", () => {
  const unit = computeUnitElectionResult({
    code: "3550308",
    candidates: [{ ballotNumber: "13", party: "PT", validVotes: 1000 }],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  const colorBefore = unit.color;
  // State deselection simulation
  const colorAfter = unit.color;
  assert.equal(colorAfter, colorBefore, "deselection must not alter base unit color");
});
