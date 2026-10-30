import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  allocateLargestRemainder,
  buildElectionStateDocument,
  buildElectionStates,
  determineTargetUfs,
  ELECTION_PRESIDENT_1T_FILE,
  ELECTION_PRESIDENT_2T_FILE,
  verifyExactSums,
} from "./build-election-states.mjs";
import { findUf, UF_CATALOG } from "./sources-national.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../");
const dataDir = path.resolve(projectRoot, "data");

describe("build-election-states unit tests", () => {
  it("allocateLargestRemainder conserves exact total across various distributions", () => {
    const total = 1000;
    const weights = [10, 20, 30, 40];
    const allocated = allocateLargestRemainder(total, weights);

    assert.equal(allocated.length, 4);
    const sum = allocated.reduce((acc, v) => acc + v, 0);
    assert.equal(sum, total);
    assert.deepEqual(allocated, [100, 200, 300, 400]);
  });

  it("allocateLargestRemainder handles fractional remainders deterministically", () => {
    const total = 10;
    const weights = [3, 3, 3];
    const keys = ["A", "B", "C"];
    const allocated = allocateLargestRemainder(total, weights, keys);

    const sum = allocated.reduce((acc, v) => acc + v, 0);
    assert.equal(sum, total);
    // 10 / 3 = 3 remainder 1. First key "A" receives the +1
    assert.deepEqual(allocated, [4, 3, 3]);
  });

  it("allocateLargestRemainder handles edge cases (empty, single, zero total, null weights)", () => {
    assert.deepEqual(allocateLargestRemainder(100, []), []);
    assert.deepEqual(allocateLargestRemainder(100, [50]), [100]);
    assert.deepEqual(allocateLargestRemainder(0, [10, 20]), [0, 0]);
    assert.deepEqual(allocateLargestRemainder(-5, [10, 20]), [0, 0]);

    // Null or non-positive weights treated safely as 1
    const allocatedSafe = allocateLargestRemainder(10, [0, /** @type {any} */ (null), 10]);
    assert.equal(
      allocatedSafe.reduce((acc, v) => acc + v, 0),
      10,
    );
  });

  it("determineTargetUfs parses single UF, comma separated, and all", () => {
    const single = determineTargetUfs({ uf: "11" });
    assert.deepEqual(single, ["11"]);

    const bySigla = determineTargetUfs({ uf: "ro" });
    assert.deepEqual(bySigla, ["11"]);

    const multiple = determineTargetUfs({ uf: "11, sp, 33" });
    assert.deepEqual(multiple, ["11", "35", "33"]);

    const allUfs = determineTargetUfs({ all: true });
    assert.equal(allUfs.length, 27);
  });

  it("determineTargetUfs throws error on unknown UF code", () => {
    assert.throws(() => determineTargetUfs({ uf: "99" }), /Unknown UF code/);
  });

  it("buildElectionStateDocument and verifyExactSums guarantee exact vote preservation", () => {
    const ufInfo = findUf("11");
    assert.ok(ufInfo);

    const nationalRow = [
      "11",
      1000,
      50,
      80,
      0,
      0,
      [
        ["22", 600],
        ["13", 400],
      ],
    ];
    const nationalDoc = {
      candidates: [
        ["22", "Cand 22", "P22"],
        ["13", "Cand 13", "P13"],
      ],
      rows: [nationalRow],
    };
    const municipalitiesDoc = {
      rows: [
        ["1100015", "Mun A", "1101", "110001", "Region A", 300, 100, 1000],
        ["1100023", "Mun B", "1101", "110001", "Region A", 700, 200, 2000],
      ],
    };

    const doc2t = buildElectionStateDocument({
      ufInfo,
      isFirstRound: false,
      nationalDoc,
      spDoc: null,
      municipalitiesDoc,
    });

    assert.equal(doc2t.schemaVersion, 1);
    assert.equal(doc2t.office, "presidente");
    assert.equal(doc2t.electionCode, "6258");
    assert.equal(doc2t.rows.length, 2);

    // Sum verification must succeed without throwing
    verifyExactSums(doc2t, nationalRow);
  });

  it("buildElectionStates creates valid election files for all 27 UFs", async () => {
    const result = await buildElectionStates({ dataDir, all: true });
    assert.equal(result.ufsBuilt.length, 27);
    assert.ok(result.totalFilesWritten >= 54);

    for (let i = 0; i < UF_CATALOG.length; i += 1) {
      const uf = UF_CATALOG[i];
      const codeDir = path.join(dataDir, "ufs", uf.code);
      const siglaDir = path.join(dataDir, "ufs", uf.sigla.toLowerCase());

      const code1tPath = path.join(codeDir, ELECTION_PRESIDENT_1T_FILE);
      const code2tPath = path.join(codeDir, ELECTION_PRESIDENT_2T_FILE);
      const sigla1tPath = path.join(siglaDir, ELECTION_PRESIDENT_1T_FILE);
      const sigla2tPath = path.join(siglaDir, ELECTION_PRESIDENT_2T_FILE);

      assert.ok(fs.existsSync(code1tPath), `Missing ${code1tPath}`);
      assert.ok(fs.existsSync(code2tPath), `Missing ${code2tPath}`);
      assert.ok(fs.existsSync(sigla1tPath), `Missing ${sigla1tPath}`);
      assert.ok(fs.existsSync(sigla2tPath), `Missing ${sigla2tPath}`);

      const doc1t = JSON.parse(fs.readFileSync(code1tPath, "utf8"));
      const doc2t = JSON.parse(fs.readFileSync(code2tPath, "utf8"));

      assert.equal(doc1t.schemaVersion, 1);
      assert.equal(doc1t.office, "presidente");
      assert.equal(doc1t.electionCode, "6257");
      assert.ok(Array.isArray(doc1t.candidates));
      assert.ok(Array.isArray(doc1t.rows));
      assert.ok(doc1t.rows.length > 0);

      assert.equal(doc2t.schemaVersion, 1);
      assert.equal(doc2t.office, "presidente");
      assert.equal(doc2t.electionCode, "6258");
      assert.ok(Array.isArray(doc2t.candidates));
      assert.ok(Array.isArray(doc2t.rows));
      assert.ok(doc2t.rows.length > 0);
    }
  });

  it("buildElectionStates produces files respecting typical byte budgets", () => {
    let typicalCountUnder30Kb = 0;
    const totalChecked = UF_CATALOG.length;

    for (let i = 0; i < UF_CATALOG.length; i += 1) {
      const uf = UF_CATALOG[i];
      const p2t = path.join(dataDir, "ufs", uf.code, ELECTION_PRESIDENT_2T_FILE);
      const size2t = fs.statSync(p2t).size;
      // All files must strictly respect the payload ceiling < 120 KB
      assert.ok(size2t < 120000, `File ${p2t} exceeds 120 KB: ${size2t}`);
      if (size2t < 30000) {
        typicalCountUnder30Kb += 1;
      }
    }

    // At least 25 of 27 states have 2T file size < 30 KB
    assert.ok(typicalCountUnder30Kb >= totalChecked - 2);
  });
});
