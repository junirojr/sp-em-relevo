import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TOLERANCE_PP,
  extractCandidateVotes,
  extractTotalValidVotes,
  OFFICIAL_ORACLE_TARGETS,
  verifyCargoOracle,
} from "./oracle-first-round.mjs";

test("TUR-02 oracle reference targets specify exact official percentages for SP", () => {
  const pres = OFFICIAL_ORACLE_TARGETS.presidente;
  assert.equal(pres.office, "presidente");
  assert.equal(pres.officeCode, 1);
  assert.equal(pres.electionCode, "6257");
  assert.equal(pres.totalValidVotes, 24882948);

  const flavio = pres.candidates.find((c) => c.ballotNumber === "22");
  assert.ok(flavio);
  assert.equal(flavio.expectedPct, 51.93);

  const lula = pres.candidates.find((c) => c.ballotNumber === "13");
  assert.ok(lula);
  assert.equal(lula.expectedPct, 38.2);

  const gov = OFFICIAL_ORACLE_TARGETS.governador;
  assert.equal(gov.office, "governador");
  assert.equal(gov.officeCode, 3);
  assert.equal(gov.electionCode, "6259");
  assert.equal(gov.totalValidVotes, 24400000);

  const tarcisio = gov.candidates.find((c) => c.ballotNumber === "10");
  assert.ok(tarcisio);
  assert.equal(tarcisio.expectedPct, 62.65);

  const haddad = gov.candidates.find((c) => c.ballotNumber === "13");
  assert.ok(haddad);
  assert.equal(haddad.expectedPct, 36.42);

  const sen = OFFICIAL_ORACLE_TARGETS.senador;
  assert.equal(sen.office, "senador");
  assert.equal(sen.officeCode, 5);
  assert.equal(sen.electionCode, "6259");
  assert.equal(sen.totalValidVotes, 45287580);

  const derrite = sen.candidates.find((c) => c.ballotNumber === "111");
  assert.ok(derrite);
  assert.equal(derrite.expectedPct, 30.6);

  const andre = sen.candidates.find((c) => c.ballotNumber === "222");
  assert.ok(andre);
  assert.equal(andre.expectedPct, 29.28);
});

test("TUR-02 verifyCargoOracle validates matching data and passes within tolerance", () => {
  const mockPresidentPayload = {
    office: "presidente",
    officeCode: 1,
    totals: {
      state: {
        validVotes: 24882948,
        votes: [
          ["22", 12921714], // 51.93%
          ["13", 9505286], // 38.20%
          ["30", 893300], // 3.59%
          ["44", 803719], // 3.23%
          ["55", 579770], // 2.33%
          ["99", 179159],
        ],
      },
    },
  };

  const report = verifyCargoOracle("presidente", mockPresidentPayload, DEFAULT_TOLERANCE_PP);
  assert.equal(report.valid, true);
  assert.equal(report.problems.length, 0);
  assert.equal(report.diffs.length, 5);

  const flavioDiff = report.diffs.find((d) => d.ballotNumber === "22");
  assert.ok(flavioDiff);
  assert.ok(flavioDiff.diffPp <= 0.01);
  assert.equal(flavioDiff.passed, true);

  const lulaDiff = report.diffs.find((d) => d.ballotNumber === "13");
  assert.ok(lulaDiff);
  assert.ok(lulaDiff.diffPp <= 0.01);
  assert.equal(lulaDiff.passed, true);
});

test("TUR-02 verifyCargoOracle detects percentage discrepancies outside tolerance", () => {
  const biasedPayload = {
    office: "presidente",
    officeCode: 1,
    totals: {
      state: {
        validVotes: 24882948,
        votes: [
          ["22", 10000000], // ~40.18% instead of 51.93%
          ["13", 12000000], // ~48.22% instead of 38.20%
        ],
      },
    },
  };

  const report = verifyCargoOracle("presidente", biasedPayload, DEFAULT_TOLERANCE_PP);
  assert.equal(report.valid, false);
  assert.ok(report.problems.length >= 2);
  assert.ok(report.problems.some((p) => p.includes("Flavio Bolsonaro")));
  assert.ok(report.problems.some((p) => p.includes("Lula")));
});

test("extractCandidateVotes and extractTotalValidVotes support multiple payload representations", () => {
  // Representation 1: compact row format
  const compactPayload = {
    rows: [
      [
        "3500105",
        1000,
        10,
        20,
        0,
        0,
        [
          ["22", 600],
          ["13", 400],
        ],
      ],
      [
        "3500204",
        2000,
        20,
        30,
        0,
        0,
        [
          ["22", 1100],
          ["13", 900],
        ],
      ],
    ],
  };

  assert.equal(extractTotalValidVotes(compactPayload), 3000);
  assert.equal(extractCandidateVotes(compactPayload, "22"), 1700);
  assert.equal(extractCandidateVotes(compactPayload, "13"), 1300);

  // Representation 2: candidate list format
  const candidateListPayload = {
    validVotes: 10000,
    candidates: [
      { ballotNumber: "10", validVotes: 6265 },
      { ballotNumber: "13", validVotes: 3642 },
    ],
  };

  assert.equal(extractTotalValidVotes(candidateListPayload), 10000);
  assert.equal(extractCandidateVotes(candidateListPayload, "10"), 6265);
  assert.equal(extractCandidateVotes(candidateListPayload, "13"), 3642);
});
