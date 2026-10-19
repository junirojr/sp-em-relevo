import assert from "node:assert/strict";
import test from "node:test";
import { computeElectionHeight } from "../../../src/domain/election.js";

test("B10-01: Negative margin value is clamped to base height 1", () => {
  const height = computeElectionHeight(-50);
  assert.equal(height, 1);
});

test("B10-02: Extreme margin exceeding 100 pp is clamped to max height at 100 pp", () => {
  const height100 = computeElectionHeight(100);
  const height150 = computeElectionHeight(150);
  assert.equal(height150, height100, "margins > 100 must be clamped to 100 pp max height");
});

test("B10-03: NaN or Infinity margin inputs fall back safely to base height 1", () => {
  assert.equal(computeElectionHeight(Number.NaN), 1);
  assert.equal(computeElectionHeight(Number.POSITIVE_INFINITY), 1);
  assert.equal(computeElectionHeight(Number.NEGATIVE_INFINITY), 1);
});

test("B10-04: heightMode: 'flat' returns base height 1 regardless of high margin", () => {
  const height = computeElectionHeight(95, { heightMode: "flat" });
  assert.equal(height, 1, "flat height mode must return base height 1");
});

test("B10-05: Exaggeration scaling at 0.4x and 2.0x scales height monotonically", () => {
  const lowExag = computeElectionHeight(50, { exaggeration: 0.4 });
  const midExag = computeElectionHeight(50, { exaggeration: 1.0 });
  const highExag = computeElectionHeight(50, { exaggeration: 2.0 });

  assert.ok(highExag > midExag);
  assert.ok(midExag > lowExag);
  assert.ok(lowExag >= 1);
});
