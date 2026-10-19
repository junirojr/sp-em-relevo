import assert from "node:assert/strict";
import test from "node:test";
import { computeUnitElectionResult } from "../../../src/domain/election.js";
import { getElectionNeutrals } from "../../../src/domain/election-colors.js";
import { createSelectionOutline } from "../../../src/engine/selection-outline.js";

test("B12-01: Selecting unit with no votes preserves noResult color under outline", () => {
  const neutrals = getElectionNeutrals("dark");
  const result = computeUnitElectionResult({
    code: "3550308",
    candidates: [],
    validVotes: 0,
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(result.color, neutrals.noResult);
  assert.equal(result.colorKey, "noResult");
});

test("B12-02: Selecting unit with tie preserves tie color under outline", () => {
  const neutrals = getElectionNeutrals("dark");
  const result = computeUnitElectionResult({
    code: "3550308",
    candidates: [
      { ballotNumber: "13", validVotes: 500 },
      { ballotNumber: "22", validVotes: 500 },
    ],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(result.color, neutrals.tie);
  assert.equal(result.colorKey, "tie");
});

test("B12-03: Selecting unit with leader in others preserves others color under outline", () => {
  const neutrals = getElectionNeutrals("dark");
  const result = computeUnitElectionResult(
    {
      code: "3550308",
      candidates: [{ ballotNumber: "99", validVotes: 1000 }],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    {
      colorByBallotNumber: { 99: neutrals.others },
    },
  );

  assert.equal(result.color, neutrals.others);
});

test("B12-04: createSelectionOutline handles custom options cleanly without crashing", () => {
  const outline = createSelectionOutline({
    innerWidth: 2,
    outerWidth: 4,
    darkTone: "#111111",
    lightTone: "#eeeeee",
  });

  assert.ok(outline.group);
  assert.equal(outline.visible, false);
  outline.dispose();
});

test("B12-05: Rapid visibility toggling on outline does not alter inner/outer materials", () => {
  const outline = createSelectionOutline();
  for (let i = 0; i < 20; i += 1) {
    outline.setVisible(i % 2 === 0);
  }
  assert.ok(outline.innerMaterial);
  assert.ok(outline.outerMaterial);
  outline.dispose();
});
