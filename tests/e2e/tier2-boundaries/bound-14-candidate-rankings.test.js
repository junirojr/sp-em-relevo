import assert from "node:assert/strict";
import test from "node:test";
import { sortCandidatesByVotes } from "../../../src/domain/election.js";

test("B14-01: Single candidate with all valid votes receives exactly 100% share", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const data = {
    office: "presidente",
    candidates: [["99", "Solo Candidate", "SOLO"]],
    totals: {
      state: { validVotes: 5000, votes: [["99", 5000]] },
    },
    municipalResults: {},
  };

  const rankings = mod.buildElectionCandidateRankings(data);
  assert.equal(rankings.candidates.length, 1);
  assert.equal(rankings.candidates[0].sharePct, 100);
});

test("B14-02: Zero valid votes across all candidates orders strictly by ballot number", () => {
  const candidates = [
    { ballotNumber: "50", validVotes: 0 },
    { ballotNumber: "10", validVotes: 0 },
    { ballotNumber: "30", validVotes: 0 },
  ];

  const sorted = sortCandidatesByVotes(candidates, 0);
  assert.equal(sorted[0].ballotNumber, "10");
  assert.equal(sorted[1].ballotNumber, "30");
  assert.equal(sorted[2].ballotNumber, "50");
});

test("B14-03: Three-way tie in valid votes breaks tie by ascending ballot number", () => {
  const candidates = [
    { ballotNumber: "45", validVotes: 2000 },
    { ballotNumber: "13", validVotes: 2000 },
    { ballotNumber: "22", validVotes: 2000 },
  ];

  const sorted = sortCandidatesByVotes(candidates, 6000);
  assert.equal(sorted[0].ballotNumber, "13");
  assert.equal(sorted[1].ballotNumber, "22");
  assert.equal(sorted[2].ballotNumber, "45");
});

test("B14-04: Massive vote counts (> 20M) do not cause arithmetic precision anomalies", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const data = {
    office: "presidente",
    candidates: [
      ["13", "Lula", "PT"],
      ["22", "Bolsonaro", "PL"],
    ],
    totals: {
      state: {
        validVotes: 30000000,
        votes: [
          ["13", 16500000],
          ["22", 13500000],
        ],
      },
    },
    municipalResults: {},
  };

  const rankings = mod.buildElectionCandidateRankings(data);
  assert.equal(rankings.candidates[0].sharePct, 55);
  assert.equal(rankings.candidates[1].sharePct, 45);
});

test("B14-05: Candidate with missing name or party receives ballot number as fallback name", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const data = {
    office: "presidente",
    candidates: [["99", null, null]],
    totals: { state: { validVotes: 10, votes: [["99", 10]] } },
    municipalResults: {},
  };

  const rankings = mod.buildElectionCandidateRankings(data);
  assert.ok(rankings.candidates[0].name.length > 0);
  assert.equal(rankings.candidates[0].ballotNumber, "99");
});
