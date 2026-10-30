import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  getFirstRoundOfficePath,
  isNationalScope,
  loadFirstRoundElectionData,
  loadNationalElectionData,
  loadSecondRoundElectionData,
} from "./election-data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates a mock fetch function reading from local file system.
 *
 * @returns {typeof fetch}
 */
function createLocalFileFetch() {
  const rootDir = path.resolve(__dirname, "../../");
  return /** @type {any} */ (
    async (/** @type {string} */ inputUrl) => {
      const cleanPath = String(inputUrl).replace(/^\.\//, "");
      const absolutePath = path.resolve(rootDir, cleanPath);
      if (!fs.existsSync(absolutePath)) {
        return {
          ok: false,
          status: 404,
          json: async () => {
            throw new Error(`File not found: ${absolutePath}`);
          },
        };
      }
      const rawContent = fs.readFileSync(absolutePath, "utf8");
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(rawContent),
      };
    }
  );
}

describe("Election Data - National Presidential Support", () => {
  it("ELE-24 isNationalScope identifies national scope correctly", () => {
    assert.equal(isNationalScope(null), true);
    assert.equal(isNationalScope(""), true);
    assert.equal(isNationalScope("br"), true);
    assert.equal(isNationalScope("BR"), true);
    assert.equal(isNationalScope("brasil"), true);
    assert.equal(isNationalScope("35"), false);
    assert.equal(isNationalScope("SP"), false);
    assert.equal(isNationalScope(undefined), false);
  });

  it("ELE-24 getFirstRoundOfficePath resolves national presidential paths when activeUf is null", () => {
    const path1t = getFirstRoundOfficePath("presidente", null);
    assert.equal(path1t, "./data/national/election-president-1t.json");

    const path2t = getFirstRoundOfficePath("presidente-2t", null);
    assert.equal(path2t, "./data/national/election-president-2t.json");

    // Default SP paths when activeUf is provided
    const pathSp1t = getFirstRoundOfficePath("presidente", "35");
    assert.equal(pathSp1t, "./data/election/presidente-1t.json");

    const pathSp2t = getFirstRoundOfficePath("presidente-2t", "35");
    assert.equal(pathSp2t, "./data/election/presidente-2t.json");
  });

  it("ELE-24 loadNationalElectionData loads 1st round data for all 27 Brazilian UFs", async () => {
    const localFetch = createLocalFileFetch();
    const statesPath = path.resolve(__dirname, "../../data/national/states.json");
    const statesDoc = JSON.parse(fs.readFileSync(statesPath, "utf8"));
    const municipalities = statesDoc.states;

    const result = await loadNationalElectionData("first-round", {
      fetchImpl: localFetch,
      theme: "dark",
      municipalities,
    });

    assert.equal(result.ok, true);
    assert.equal(result.candidates.length, 6);
    assert.equal(result.palette.orderedCandidates.length > 0, true);

    const unitKeys = Object.keys(result.municipalResults);
    assert.equal(unitKeys.length, 27);

    // Verify key states
    const spResult = result.municipalResults["35"];
    assert.ok(spResult);
    assert.equal(spResult.name, "São Paulo");
    assert.equal(spResult.leader?.ballotNumber, "22");
    assert.ok(spResult.marginPp > 0);
    assert.ok(spResult.height > 0);

    const baResult = result.municipalResults["29"];
    assert.ok(baResult);
    assert.equal(baResult.name, "Bahia");
    assert.equal(baResult.leader?.ballotNumber, "13");
    assert.ok(baResult.marginPp > 0);
  });

  it("ELE-24 loadNationalElectionData loads 2nd round consolidated data for all 27 UFs", async () => {
    const localFetch = createLocalFileFetch();
    const statesPath = path.resolve(__dirname, "../../data/national/states.json");
    const statesDoc = JSON.parse(fs.readFileSync(statesPath, "utf8"));
    const municipalities = statesDoc.states;

    const result = await loadNationalElectionData("second-round", {
      fetchImpl: localFetch,
      theme: "dark",
      municipalities,
    });

    assert.equal(result.ok, true);
    assert.equal(result.candidates.length, 2);

    const unitKeys = Object.keys(result.municipalResults);
    assert.equal(unitKeys.length, 27);

    for (let i = 0; i < unitKeys.length; i += 1) {
      const code = unitKeys[i];
      const unit = result.municipalResults[code];
      assert.ok(unit.leader, `Unit ${code} should have a leader`);
      assert.ok(unit.leaderColor, `Unit ${code} should have a leaderColor`);
      assert.ok(unit.marginPp >= 0, `Unit ${code} should have a non-negative margin`);
      assert.ok(unit.height >= 0, `Unit ${code} should have a non-negative height`);
    }
  });

  it("ELE-24 loadSecondRoundElectionData with activeUf null delegates to national 2t file", async () => {
    const localFetch = createLocalFileFetch();
    const statesPath = path.resolve(__dirname, "../../data/national/states.json");
    const statesDoc = JSON.parse(fs.readFileSync(statesPath, "utf8"));
    const municipalities = statesDoc.states;

    const result = await loadSecondRoundElectionData({
      fetchImpl: localFetch,
      theme: "dark",
      activeUf: null,
      municipalities,
    });

    assert.equal(result.ok, true);
    assert.equal(Object.keys(result.municipalResults).length, 27);
  });

  it("getFirstRoundOfficePath resolves state paths for SP and non-SP UFs", () => {
    // São Paulo delegates to data/election
    assert.equal(getFirstRoundOfficePath("presidente", "35"), "./data/election/presidente-1t.json");
    assert.equal(
      getFirstRoundOfficePath("presidente-2t", "35"),
      "./data/election/presidente-2t.json",
    );
    assert.equal(getFirstRoundOfficePath("presidente", "sp"), "./data/election/presidente-1t.json");
    assert.equal(
      getFirstRoundOfficePath("presidente-2t", "SP"),
      "./data/election/presidente-2t.json",
    );

    // Other UFs resolve to data/ufs/{activeUf}
    assert.equal(
      getFirstRoundOfficePath("presidente", "11"),
      "./data/ufs/11/election-president-1t.json",
    );
    assert.equal(
      getFirstRoundOfficePath("presidente-2t", "11"),
      "./data/ufs/11/election-president-2t.json",
    );
    assert.equal(
      getFirstRoundOfficePath("presidente", "ro"),
      "./data/ufs/ro/election-president-1t.json",
    );
    assert.equal(
      getFirstRoundOfficePath("presidente-2t", "RO"),
      "./data/ufs/ro/election-president-2t.json",
    );
    assert.equal(
      getFirstRoundOfficePath("presidente", "29"),
      "./data/ufs/29/election-president-1t.json",
    );
    assert.equal(
      getFirstRoundOfficePath("presidente-2t", "ba"),
      "./data/ufs/ba/election-president-2t.json",
    );
  });

  it("loads municipal presidential election data for non-SP state and verifies exact sums", async () => {
    const localFetch = createLocalFileFetch();
    const munPath = path.resolve(__dirname, "../../data/ufs/11/municipalities.json");
    const munDoc = JSON.parse(fs.readFileSync(munPath, "utf8"));
    const municipalities = munDoc.rows.map((/** @type {any} */ r) => ({
      code: r[0],
      name: r[1],
    }));

    // Test 1st round
    const res1t = await loadFirstRoundElectionData("presidente", {
      fetchImpl: localFetch,
      theme: "dark",
      activeUf: "11",
      municipalities,
    });

    assert.equal(res1t.ok, true);
    assert.equal(res1t.candidates.length, 6);
    const munKeys1t = Object.keys(res1t.municipalResults);
    assert.equal(munKeys1t.length, 52);

    let sumValid1t = 0;
    for (let i = 0; i < munKeys1t.length; i += 1) {
      const code = munKeys1t[i];
      const unit = res1t.municipalResults[code];
      assert.ok(unit.leader);
      assert.ok(unit.leaderColor);
      sumValid1t += unit.totalValidVotes;
    }
    assert.equal(sumValid1t, res1t.totals.state.validVotes);

    // Test 2nd round
    const res2t = await loadSecondRoundElectionData({
      fetchImpl: localFetch,
      theme: "dark",
      activeUf: "11",
      municipalities,
    });

    assert.equal(res2t.ok, true);
    assert.equal(res2t.candidates.length, 2);
    const munKeys2t = Object.keys(res2t.municipalResults);
    assert.equal(munKeys2t.length, 52);

    let sumValid2t = 0;
    for (let i = 0; i < munKeys2t.length; i += 1) {
      const code = munKeys2t[i];
      const unit = res2t.municipalResults[code];
      assert.ok(unit.leader);
      assert.ok(unit.leaderColor);
      sumValid2t += unit.totalValidVotes;
    }
    assert.equal(sumValid2t, res2t.totals.state.validVotes);
  });
});
