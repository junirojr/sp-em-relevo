import assert from "node:assert/strict";
import test from "node:test";
import { computeUnitElectionResult } from "../../../src/domain/election.js";
import { MOCK_ELECTION_2T_DATA } from "../helpers/test-data.js";

test("F06-01: Default 2nd round election office is presidente", () => {
  assert.equal(MOCK_ELECTION_2T_DATA.office, "presidente", "office must be presidente");
});

test("F06-02: 2nd round election data contains exactly 2 presidential contenders", () => {
  const candidates = MOCK_ELECTION_2T_DATA.candidates;
  assert.equal(candidates.length, 2, "2nd round must have exactly 2 candidates");
});

test("F06-03: Scoreboard totals compute state valid votes and candidate breakdown", () => {
  const totals = MOCK_ELECTION_2T_DATA.totals.state;
  assert.equal(totals.validVotes, 25000000);
  assert.equal(totals.votes.length, 2);
  const totalCandidateVotes = totals.votes.reduce((acc, curr) => acc + Number(curr[1]), 0);
  assert.equal(totalCandidateVotes, totals.validVotes, "candidate votes must sum to valid votes");
});

test("F06-04: Unit result computes leader, runner-up, and positive margin", () => {
  const unit = computeUnitElectionResult({
    code: "3550308",
    name: "São Paulo",
    candidates: [
      { ballotNumber: "13", name: "Lula", party: "PT", validVotes: 3850000 },
      { ballotNumber: "22", name: "Bolsonaro", party: "PL", validVotes: 3150000 },
    ],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(unit.status, "leading");
  assert.equal(unit.leader?.ballotNumber, "13");
  assert.equal(unit.runnerUp?.ballotNumber, "22");
  assert.equal(unit.marginVotes, 700000);
  assert.equal(unit.marginPp, 10);
});

test("F06-05: Unit result with tied votes resolves to tie status", () => {
  const unit = computeUnitElectionResult({
    code: "3500105",
    name: "Adamantina",
    candidates: [
      { ballotNumber: "13", name: "Lula", party: "PT", validVotes: 5000 },
      { ballotNumber: "22", name: "Bolsonaro", party: "PL", validVotes: 5000 },
    ],
    sectionsCounted: 100,
    sectionsTotal: 100,
  });

  assert.equal(unit.status, "tie");
  assert.equal(unit.marginVotes, 0);
  assert.equal(unit.marginPp, 0);
  assert.ok(unit.tieText?.includes("Empate:"));
});
