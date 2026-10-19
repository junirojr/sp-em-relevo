import assert from "node:assert/strict";
import test from "node:test";
import {
  computeUnitElectionResult,
  isBelowSectionsThreshold,
} from "../../../src/domain/election.js";

test("B06-01: Unit with null candidates list produces status no-result", () => {
  const result = computeUnitElectionResult({
    code: "3550308",
    candidates: /** @type {any} */ (null),
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(result.status, "no-result");
  assert.equal(result.leader, null);
  assert.equal(result.marginVotes, 0);
});

test("B06-02: Exactly 50.0% counted sections in replay mode is sufficient", () => {
  const isBelow = isBelowSectionsThreshold({
    sectionsCounted: 50,
    sectionsTotal: 100,
    mode: "replay",
  });
  assert.equal(isBelow, false, "50.0% must NOT be below threshold");
});

test("B06-03: Exactly 49.9% counted sections in replay mode is below threshold", () => {
  const isBelow = isBelowSectionsThreshold({
    sectionsCounted: 499,
    sectionsTotal: 1000,
    mode: "replay",
  });
  assert.equal(isBelow, true, "49.9% must be below threshold");
});

test("B06-04: Negative votes in candidate entries are sanitized to 0", () => {
  const result = computeUnitElectionResult({
    code: "3550308",
    candidates: [
      { ballotNumber: "13", validVotes: -50 },
      { ballotNumber: "22", validVotes: 100 },
    ],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(result.leader?.ballotNumber, "22");
  assert.equal(result.candidates.find((c) => c.ballotNumber === "13")?.validVotes, 0);
});

test("B06-05: Single candidate with 0 competitor votes produces 100 pp margin and 100% share", () => {
  const result = computeUnitElectionResult({
    code: "3550308",
    candidates: [
      { ballotNumber: "13", validVotes: 500 },
      { ballotNumber: "22", validVotes: 0 },
    ],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(result.leader?.sharePct, 100);
  assert.equal(result.marginPp, 100);
  assert.equal(result.status, "leading");
});
