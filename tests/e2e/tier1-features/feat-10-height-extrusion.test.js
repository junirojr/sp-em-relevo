import assert from "node:assert/strict";
import test from "node:test";
import {
  computeElectionHeight,
  computeUnitElectionResult,
  isBelowSectionsThreshold,
} from "../../../src/domain/election.js";

test("F10-01: Margin of 0 pp yields base height 1", () => {
  const height = computeElectionHeight(0);
  assert.equal(height, 1, "0 pp margin must produce base height 1");
});

test("F10-02: Margin of 100 pp yields maximum linear extrusion height", () => {
  const height0 = computeElectionHeight(0);
  const height50 = computeElectionHeight(50);
  const height100 = computeElectionHeight(100);

  assert.ok(height100 > height50);
  assert.ok(height50 > height0);
  // Linear property: (h100 - h50) == (h50 - h0)
  assert.ok(
    Math.abs(height100 - height50 - (height50 - height0)) < 1e-6,
    "height must scale linearly",
  );
});

test("F10-03: Elevation scale is continuous and fixed on [0, 100] pp without rescaling by max", () => {
  const height25 = computeElectionHeight(25);
  const height50 = computeElectionHeight(50);

  const span1 = height25 - 1;
  const span2 = height50 - 1;
  assert.ok(Math.abs(span2 - span1 * 2) < 1e-6, "double margin must produce double elevation span");
});

test("F10-04: Municipalities with < 50% counted sections are clamped to base height 1 in replay/live", () => {
  const belowThreshold = isBelowSectionsThreshold({
    sectionsCounted: 40,
    sectionsTotal: 100,
    mode: "replay",
  });
  assert.equal(belowThreshold, true);

  const result = computeUnitElectionResult(
    {
      code: "3550308",
      name: "São Paulo",
      candidates: [
        { ballotNumber: "13", validVotes: 800 },
        { ballotNumber: "22", validVotes: 200 },
      ],
      sectionsCounted: 40,
      sectionsTotal: 100,
    },
    { mode: "replay" },
  );

  assert.equal(result.belowSectionsThreshold, true);
  assert.equal(result.height, 1, "below 50% threshold must clamp to base height 1");
});

test("F10-05: Municipalities with tie or 0 valid votes receive base height 1", () => {
  const resultTie = computeUnitElectionResult({
    code: "3500105",
    candidates: [
      { ballotNumber: "13", validVotes: 500 },
      { ballotNumber: "22", validVotes: 500 },
    ],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(resultTie.height, 1, "tie margin must have height 1");

  const resultZero = computeUnitElectionResult({
    code: "3500105",
    candidates: [],
    validVotes: 0,
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(resultZero.height, 1, "zero votes must have height 1");
});
