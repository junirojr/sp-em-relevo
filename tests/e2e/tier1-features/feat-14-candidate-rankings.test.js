import assert from "node:assert/strict";
import test from "node:test";
import { sortCandidatesByVotes } from "../../../src/domain/election.js";

test("F14-01: buildElectionCandidateRankings is exported from src/domain/election-ranking.js", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");
  assert.equal(
    typeof mod.buildElectionCandidateRankings,
    "function",
    "buildElectionCandidateRankings must be exported function",
  );
});

test("F14-02: Candidates are ordered descending by valid votes count", () => {
  const candidates = [
    { ballotNumber: "22", validVotes: 4000, name: "Cand B" },
    { ballotNumber: "13", validVotes: 6000, name: "Cand A" },
    { ballotNumber: "15", validVotes: 1000, name: "Cand C" },
  ];

  const sorted = sortCandidatesByVotes(candidates, 11000);
  assert.equal(sorted[0].ballotNumber, "13");
  assert.equal(sorted[1].ballotNumber, "22");
  assert.equal(sorted[2].ballotNumber, "15");
});

test("F14-03: Equal valid votes break tie deterministically by ascending ballot number", () => {
  const candidates = [
    { ballotNumber: "45", validVotes: 5000, name: "Cand Y" },
    { ballotNumber: "13", validVotes: 5000, name: "Cand X" },
  ];

  const sorted = sortCandidatesByVotes(candidates, 10000);
  assert.equal(sorted[0].ballotNumber, "13", "lower ballot number wins tie-break");
  assert.equal(sorted[1].ballotNumber, "45");
});

test("F14-04: Ranked candidate items carry validVotes, sharePct, ballotNumber, name, and party", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const electionData = {
    office: "presidente",
    candidates: [
      ["13", "Lula", "PT"],
      ["22", "Bolsonaro", "PL"],
    ],
    totals: {
      state: {
        validVotes: 10000,
        votes: [
          ["13", 6000],
          ["22", 4000],
        ],
      },
    },
    municipalResults: {},
  };

  const rankings = mod.buildElectionCandidateRankings(electionData);
  assert.ok(rankings.candidates.length >= 2);
  const first = rankings.candidates[0];
  assert.equal(first.ballotNumber, "13");
  assert.equal(first.name, "Lula");
  assert.equal(first.party, "PT");
  assert.equal(first.validVotes, 6000);
  assert.equal(first.sharePct, 60);
});

test("F14-05: Rankings totalValidVotes equals sum of valid votes across candidates", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const electionData = {
    office: "governador",
    candidates: [
      ["10", "Cand A", "REP"],
      ["20", "Cand B", "PL"],
    ],
    totals: {
      state: {
        validVotes: 20000,
        votes: [
          ["10", 12000],
          ["20", 8000],
        ],
      },
    },
    municipalResults: {},
  };

  const rankings = mod.buildElectionCandidateRankings(electionData);
  assert.equal(rankings.totalValidVotes, 20000);
});
