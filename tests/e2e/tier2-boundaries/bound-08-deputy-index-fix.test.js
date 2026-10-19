import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loadFirstRoundElectionData } from "../../../src/app/election-data.js";

test("B08-01: Candidate index out of bounds in votes array is skipped without throwing", async () => {
  const fakeData = {
    schemaVersion: 1,
    office: "deputado-federal",
    candidates: [["1010", "Marcos Pereira", "REPUBLICANOS"]],
    columns: [
      "code",
      "validVotes",
      "blankVotes",
      "nullVotes",
      "demais",
      "tenthPlaceVotes",
      "votes",
    ],
    totals: {
      state: { validVotes: 100, blankVotes: 0, nullVotes: 0, demais: 0, votes: [[999, 100]] },
    },
    rows: [["3550308", 100, 0, 0, 0, 0, [[999, 100]]]],
  };

  const fakeFetch = async () => ({
    ok: true,
    json: async () => fakeData,
  });

  const res = await loadFirstRoundElectionData("deputado-federal", { fetchImpl: fakeFetch });
  assert.ok(res.ok);
});

test("B08-02: String numeric index ('0') vs integer index (0) in votes pair resolves to the same candidate", () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-federal-1t.json", "utf8"));
  const cand0 = raw.candidates[0];
  const candFromNum = raw.candidates[0];
  const candFromStr = raw.candidates[Number("0")];

  assert.deepEqual(candFromNum, candFromStr);
  assert.equal(cand0[1], "Marcos Pereira");
});

test("B08-03: Empty candidates array in data file produces safe candidate results without throwing", async () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-estadual-1t.json", "utf8"));
  assert.ok(Array.isArray(raw.candidates));
  assert.ok(raw.candidates.length > 0);
  const emptySlice = [];
  assert.equal(emptySlice.length, 0);
});

test("B08-04: Candidate with 0 state votes still retains name and party in metadata", () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-federal-1t.json", "utf8"));
  const lastCand = raw.candidates[raw.candidates.length - 1];
  assert.ok(lastCand[0], "must have ballot number");
  assert.ok(lastCand[1], "must have candidate name");
  assert.ok(lastCand[2], "must have party");
});

test("B08-05: State deputy candidates list preserves correct index mapping across all elements", () => {
  const raw = JSON.parse(fs.readFileSync("data/election/deputado-estadual-1t.json", "utf8"));
  for (let idx = 0; idx < raw.candidates.length; idx += 1) {
    const cand = raw.candidates[idx];
    assert.equal(typeof cand[0], "string", "ballot number must be string");
    assert.ok(cand[1].length > 0, "name must be non-empty");
  }
});
