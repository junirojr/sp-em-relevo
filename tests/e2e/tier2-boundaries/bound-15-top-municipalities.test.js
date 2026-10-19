import assert from "node:assert/strict";
import test from "node:test";

test("B15-01: Candidate with votes in only 1 municipality produces 1 top municipality entry", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const data = {
    office: "presidente",
    candidates: [["13", "Cand A", "PT"]],
    totals: { state: { validVotes: 100, votes: [["13", 100]] } },
    municipalResults: {
      3550308: {
        code: "3550308",
        name: "São Paulo",
        totalValidVotes: 100,
        candidates: [{ ballotNumber: "13", validVotes: 100, sharePct: 100 }],
        leader: { ballotNumber: "13" },
      },
    },
  };

  const rankings = mod.buildElectionCandidateRankings(data);
  const cand = rankings.candidates[0];
  assert.equal(cand.topMunicipalitiesByVotes.length, 1);
  assert.equal(cand.topMunicipalitiesByVotes[0].code, "3550308");
});

test("B15-02: Candidate with 0 votes in all municipalities returns empty top list", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const data = {
    office: "presidente",
    candidates: [["99", "Zero Cand", "ZZ"]],
    totals: { state: { validVotes: 0, votes: [["99", 0]] } },
    municipalResults: {},
  };

  const rankings = mod.buildElectionCandidateRankings(data);
  const cand = rankings.candidates[0];
  assert.equal(cand.topMunicipalitiesByVotes.length, 0);
  assert.equal(cand.ledCount, 0);
});

test("B15-03: Municipality with 100% share for candidate ranks #1 by share", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const data = {
    office: "presidente",
    candidates: [["13", "Lula", "PT"]],
    totals: { state: { validVotes: 1500, votes: [["13", 1500]] } },
    municipalResults: {
      3550308: {
        code: "3550308",
        name: "São Paulo",
        totalValidVotes: 1000,
        candidates: [{ ballotNumber: "13", validVotes: 500, sharePct: 50 }],
      },
      3509502: {
        code: "3509502",
        name: "Campinas",
        totalValidVotes: 500,
        candidates: [{ ballotNumber: "13", validVotes: 500, sharePct: 100 }],
      },
    },
  };

  const rankings = mod.buildElectionCandidateRankings(data);
  const cand = rankings.candidates[0];
  const topByShare = cand.topMunicipalitiesByShare;
  assert.equal(topByShare[0].code, "3509502", "Campinas (100%) must rank #1 by share");
});

test("B15-04: Equal municipal votes sort deterministically without flakiness", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  const data = {
    office: "presidente",
    candidates: [["13", "Cand", "PT"]],
    totals: { state: { validVotes: 200, votes: [["13", 200]] } },
    municipalResults: {
      3509502: {
        code: "3509502",
        name: "Campinas",
        totalValidVotes: 100,
        candidates: [{ ballotNumber: "13", validVotes: 100, sharePct: 100 }],
      },
      3550308: {
        code: "3550308",
        name: "São Paulo",
        totalValidVotes: 100,
        candidates: [{ ballotNumber: "13", validVotes: 100, sharePct: 100 }],
      },
    },
  };

  const r1 = mod.buildElectionCandidateRankings(data);
  const r2 = mod.buildElectionCandidateRankings(data);
  assert.deepEqual(
    r1.candidates[0].topMunicipalitiesByVotes,
    r2.candidates[0].topMunicipalitiesByVotes,
    "ranking must be deterministic across calls",
  );
});

test("B15-05: Missing municipal results object in input data does not throw", async () => {
  const mod = await import("../../../src/domain/election-ranking.js").catch(() => null);
  assert.ok(mod, "src/domain/election-ranking.js must be implemented");

  assert.doesNotThrow(() => {
    mod.buildElectionCandidateRankings({
      office: "presidente",
      candidates: [["13", "Cand", "PT"]],
      totals: { state: { validVotes: 10, votes: [["13", 10]] } },
    });
  });
});
