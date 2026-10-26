import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loadFirstRoundElectionData } from "../../../src/app/election-data.js";

test("F08-01: Federal deputy data file schema contains candidates array and indexed votes", () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-federal-1t.json", "utf8"));
  assert.equal(raw.office, "deputado-federal");
  assert.ok(Array.isArray(raw.candidates) && raw.candidates.length > 0);
  assert.ok(Array.isArray(raw.totals?.state?.votes));

  const firstPair = raw.totals.state.votes[0];
  assert.equal(typeof firstPair[0], "number", "first element in vote pair is candidate index");
});

test("F08-02: Federal deputy index 0 correctly identifies candidates[0]", () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-federal-1t.json", "utf8"));
  const cand0 = raw.candidates[0];
  assert.equal(cand0[0], "1010", "candidate 0 ballot number");
  assert.equal(cand0[1], "Marcos Pereira", "candidate 0 name");
  assert.equal(cand0[2], "REPUBLICANOS", "candidate 0 party");
});

test("F08-03: Federal deputy index 1 correctly identifies candidates[1]", () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-federal-1t.json", "utf8"));
  const cand1 = raw.candidates[1];
  assert.equal(cand1[0], "2222", "candidate 1 ballot number");
  assert.equal(cand1[1], "Carla Zambelli", "candidate 1 name");
  assert.equal(cand1[2], "PL", "candidate 1 party");
});

test("F08-04: State deputy data file contains indexed candidate votes", () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-estadual-1t.json", "utf8"));
  assert.equal(raw.office, "deputado-estadual");
  assert.ok(Array.isArray(raw.candidates) && raw.candidates.length > 0);
  assert.ok(Array.isArray(raw.totals?.state?.votes));
});

test("F08-05: Deputy candidate votes map to actual candidate names and not undefined", async () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-federal-1t.json", "utf8"));
  const fakeFetch = async () => new Response(JSON.stringify(raw));

  const result = await loadFirstRoundElectionData("deputado-federal", {
    fetchImpl: fakeFetch,
  });

  assert.ok(result.ok, "loadFirstRoundElectionData should succeed");
  const firstMunKey = Object.keys(result.municipalResults)[0];
  if (firstMunKey) {
    const mun = result.municipalResults[firstMunKey];
    for (const cand of mun.candidates) {
      const definition = raw.candidates.find(
        (/** @type {string[]} */ candidate) => candidate[0] === cand.ballotNumber,
      );
      assert.ok(definition, "municipal references must resolve to an actual ballot number");
      assert.equal(cand.name, definition[1]);
      assert.equal(cand.party, definition[2]);
      assert.notEqual(cand.party, "undefined", "candidate party must never be 'undefined'");
    }
  }
});

test("F08-06 indexed deputy state totals resolve to ballot numbers and nonzero candidate rankings", async () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-federal-1t.json", "utf8"));
  const result = await loadFirstRoundElectionData("deputado-federal", {
    fetchImpl: async () => new Response(JSON.stringify(raw)),
  });
  assert.ok(result.ok);
  for (const [ballot, votes] of result.totals.state.votes) {
    const definition = raw.candidates.find(
      (/** @type {string[]} */ candidate) => candidate[0] === ballot,
    );
    assert.ok(definition);
    assert.ok(votes > 0);
  }
  assert.ok(result.candidates.some((candidate) => candidate.votes > 0));
});
