import assert from "node:assert/strict";
import test from "node:test";
import { MOCK_ELECTION_2T_DATA } from "../helpers/test-data.js";

test("F15-01: buildElectionCandidateRankings calculates top municipalities per candidate", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const rankings = mod.buildElectionCandidateRankings(MOCK_ELECTION_2T_DATA);
  assert.ok(rankings.candidates.length > 0);
  const cand = rankings.candidates[0];
  assert.ok(
    Array.isArray(cand.topMunicipalitiesByVotes),
    "must have topMunicipalitiesByVotes array",
  );
  assert.ok(
    Array.isArray(cand.topMunicipalitiesByShare),
    "must have topMunicipalitiesByShare array",
  );
});

test("F15-02: topMunicipalitiesByVotes is ordered descending by nominal votes", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const rankings = mod.buildElectionCandidateRankings(MOCK_ELECTION_2T_DATA);
  const cand = rankings.candidates[0];
  const list = cand.topMunicipalitiesByVotes;
  if (list.length >= 2) {
    assert.ok(list[0].votes >= list[1].votes, "first must have >= votes than second");
  }
});

test("F15-03: topMunicipalitiesByShare is ordered descending by percentage share", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const rankings = mod.buildElectionCandidateRankings(MOCK_ELECTION_2T_DATA);
  const cand = rankings.candidates[0];
  const list = cand.topMunicipalitiesByShare;
  if (list.length >= 2) {
    assert.ok(list[0].sharePct >= list[1].sharePct, "first must have >= sharePct than second");
  }
});

test("F15-04: Candidate records ledCount of municipalities led across state", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const rankings = mod.buildElectionCandidateRankings(MOCK_ELECTION_2T_DATA);
  for (const cand of rankings.candidates) {
    assert.equal(typeof cand.ledCount, "number", "ledCount must be numeric");
    assert.ok(cand.ledCount >= 0);
  }
});

test("F15-05: Municipality entries include code, name, votes, and sharePct", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const rankings = mod.buildElectionCandidateRankings(MOCK_ELECTION_2T_DATA);
  const cand = rankings.candidates[0];
  const firstMun = cand.topMunicipalitiesByVotes[0];
  if (firstMun) {
    assert.ok(firstMun.code, "must have code");
    assert.ok(firstMun.name, "must have name");
    assert.equal(typeof firstMun.votes, "number");
    assert.equal(typeof firstMun.sharePct, "number");
  }
});
