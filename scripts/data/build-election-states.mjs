#!/usr/bin/env node
/**
 * Municipal presidential election data generator for all 27 Brazilian UFs.
 *
 * Implements:
 * - Deterministic Largest Remainder Method (Hamilton-Hare) to distribute
 *   official national state totals across municipalities proportional to 2022 Census population.
 * - Exact sum invariant: sum(municipalities) === official state total for valid, blank, null, and candidate votes.
 * - SP (35) synchronization with official data in data/election/presidente-1t.json and 2t.json.
 * - Compact columnar JSON storage (< 30 KB per typical state file).
 * - Prohibited conditional alternative keywords and ternary operator.
 * - Pure determinism and English-only identifiers.
 */

import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { findUf, UF_CATALOG } from "./sources-national.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(scriptDir, "..", "..", "data");

export const ELECTION_PRESIDENT_1T_FILE = "election-president-1t.json";
export const ELECTION_PRESIDENT_2T_FILE = "election-president-2t.json";

export const ELECTION_CODE_1T = "6257";
export const ELECTION_CODE_2T = "6258";

export const OFFICE_NAME = "presidente";
export const OFFICE_CODE = 1;

/**
 * Distributes an integer total deterministically across items according to weights.
 * Uses the Largest Remainder Method (Hamilton-Hare) with deterministic tie-breaking.
 *
 * @param {number} total Total integer sum to allocate.
 * @param {readonly number[]} weights Relative weights (e.g. population).
 * @param {readonly string[]} [tieBreakerKeys] Optional unique keys for deterministic tie breaking.
 * @returns {number[]} Array of allocated integers summing exactly to total.
 */
export function allocateLargestRemainder(total, weights, tieBreakerKeys = []) {
  if (weights.length === 0) {
    return [];
  }
  if (weights.length === 1) {
    return [total];
  }
  if (total <= 0) {
    return weights.map(() => 0);
  }

  let weightSum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const rawWeight = Number(weights[i]);
    let safeWeight = 1;
    if (Number.isFinite(rawWeight) && rawWeight > 0) {
      safeWeight = rawWeight;
    }
    weightSum += safeWeight;
  }

  if (weightSum <= 0) {
    weightSum = weights.length;
  }

  const allocated = [];
  const remainders = [];
  let baseSum = 0;

  for (let i = 0; i < weights.length; i += 1) {
    const rawWeight = Number(weights[i]);
    let safeWeight = 1;
    if (Number.isFinite(rawWeight) && rawWeight > 0) {
      safeWeight = rawWeight;
    }
    const quota = (total * safeWeight) / weightSum;
    const floorValue = Math.floor(quota);
    allocated.push(floorValue);
    baseSum += floorValue;
    remainders.push({
      index: i,
      remainder: quota - floorValue,
      key: tieBreakerKeys[i] ?? String(i),
    });
  }

  const surplus = total - baseSum;
  remainders.sort((a, b) => {
    const diff = b.remainder - a.remainder;
    if (Math.abs(diff) > 1e-9) {
      return diff;
    }
    return a.key.localeCompare(b.key);
  });

  for (let i = 0; i < surplus; i += 1) {
    const targetIndex = remainders[i].index;
    allocated[targetIndex] += 1;
  }

  return allocated;
}

/**
 * Parses user target UFs from CLI arguments.
 *
 * @param {{ uf?: string, all?: boolean }} options
 * @returns {string[]} List of 2-digit UF codes.
 */
export function determineTargetUfs({ uf = "", all = false }) {
  if (all || (!uf && all)) {
    return UF_CATALOG.map((item) => item.code);
  }
  if (!uf) {
    return UF_CATALOG.map((item) => item.code);
  }

  const tokens = uf
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  /** @type {string[]} */
  const matchedCodes = [];
  for (const token of tokens) {
    const found = findUf(token);
    if (!found) {
      throw new Error(`Unknown UF code or abbreviation "${token}"`);
    }
    if (!matchedCodes.includes(found.code)) {
      matchedCodes.push(found.code);
    }
  }
  return matchedCodes;
}

/**
 * Builds election state document for a single round and UF.
 *
 * @param {{
 *   ufInfo: import("./sources-national.js").UfInfo,
 *   isFirstRound: boolean,
 *   nationalDoc: any,
 *   spDoc: any | null,
 *   municipalitiesDoc: any,
 * }} params
 * @returns {any}
 */
export function buildElectionStateDocument({
  ufInfo,
  isFirstRound,
  nationalDoc,
  spDoc,
  municipalitiesDoc,
}) {
  let electionCode = ELECTION_CODE_2T;
  let roundLabel = "2o Turno";
  if (isFirstRound) {
    electionCode = ELECTION_CODE_1T;
    roundLabel = "1o Turno";
  }

  // São Paulo special case: direct synchronization with official files
  if (ufInfo.code === "35" && spDoc) {
    return {
      schemaVersion: 1,
      office: OFFICE_NAME,
      officeCode: OFFICE_CODE,
      electionCode,
      description: `Presidente da Republica - ${roundLabel} 2026 (${ufInfo.sigla})`,
      candidates: spDoc.candidates,
      columns: spDoc.columns,
      totals: {
        state: spDoc.totals.state,
      },
      rows: spDoc.rows,
    };
  }

  const nationalRow = nationalDoc.rows.find(
    (/** @type {any} */ row) => String(row[0]) === ufInfo.code,
  );
  if (!nationalRow) {
    throw new Error(`State ${ufInfo.code} (${ufInfo.sigla}) not found in national election data`);
  }

  const stateValidVotes = Number(nationalRow[1]);
  const stateBlankVotes = Number(nationalRow[2]);
  const stateNullVotes = Number(nationalRow[3]);
  const stateCandidateVotes = nationalRow[6] ?? [];

  const munRows = municipalitiesDoc.rows ?? [];
  const munCodes = munRows.map((/** @type {any} */ r) => String(r[0]));
  const weights = munRows.map((/** @type {any} */ r) => {
    const pop = Number(r[5]);
    if (Number.isFinite(pop) && pop > 0) {
      return pop;
    }
    return 1;
  });

  const allocatedBlank = allocateLargestRemainder(stateBlankVotes, weights, munCodes);
  const allocatedNull = allocateLargestRemainder(stateNullVotes, weights, munCodes);

  /** @type {Record<string, number[]>} */
  const allocatedByCandidate = {};
  for (let c = 0; c < stateCandidateVotes.length; c += 1) {
    const pair = stateCandidateVotes[c];
    const ballot = String(pair[0]);
    const candTotal = Number(pair[1]);
    allocatedByCandidate[ballot] = allocateLargestRemainder(candTotal, weights, munCodes);
  }

  const rows = [];
  for (let m = 0; m < munCodes.length; m += 1) {
    const munCode = munCodes[m];
    const munCandVotes = [];
    let munValidVotes = 0;

    for (let c = 0; c < stateCandidateVotes.length; c += 1) {
      const pair = stateCandidateVotes[c];
      const ballot = String(pair[0]);
      const candVotes = allocatedByCandidate[ballot][m];
      munCandVotes.push([ballot, candVotes]);
      munValidVotes += candVotes;
    }

    const munBlankVotes = allocatedBlank[m];
    const munNullVotes = allocatedNull[m];

    rows.push([munCode, munValidVotes, munBlankVotes, munNullVotes, 0, 0, munCandVotes]);
  }

  return {
    schemaVersion: 1,
    office: OFFICE_NAME,
    officeCode: OFFICE_CODE,
    electionCode,
    description: `Presidente da Republica - ${roundLabel} 2026 (${ufInfo.sigla})`,
    candidates: nationalDoc.candidates,
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
      state: {
        validVotes: stateValidVotes,
        blankVotes: stateBlankVotes,
        nullVotes: stateNullVotes,
        demais: 0,
        votes: stateCandidateVotes,
      },
    },
    rows,
  };
}

/**
 * Validates exact summation for an election state document.
 *
 * @param {any} doc
 * @param {any} nationalRow
 */
export function verifyExactSums(doc, nationalRow) {
  const expectedValid = Number(nationalRow[1]);
  const expectedBlank = Number(nationalRow[2]);
  const expectedNull = Number(nationalRow[3]);
  const expectedCandVotes = nationalRow[6] ?? [];

  let sumValid = 0;
  let sumBlank = 0;
  let sumNull = 0;
  /** @type {Map<string, number>} */
  const candSumMap = new Map();

  for (let i = 0; i < doc.rows.length; i += 1) {
    const row = doc.rows[i];
    sumValid += Number(row[1]);
    sumBlank += Number(row[2]);
    sumNull += Number(row[3]);

    const votesArr = row[6] ?? [];
    for (let v = 0; v < votesArr.length; v += 1) {
      const pair = votesArr[v];
      const ballot = String(pair[0]);
      const count = Number(pair[1]);
      const current = candSumMap.get(ballot) ?? 0;
      candSumMap.set(ballot, current + count);
    }
  }

  if (sumValid !== expectedValid) {
    throw new Error(`Valid votes sum mismatch: computed ${sumValid}, expected ${expectedValid}`);
  }
  if (sumBlank !== expectedBlank) {
    throw new Error(`Blank votes sum mismatch: computed ${sumBlank}, expected ${expectedBlank}`);
  }
  if (sumNull !== expectedNull) {
    throw new Error(`Null votes sum mismatch: computed ${sumNull}, expected ${expectedNull}`);
  }

  for (let c = 0; c < expectedCandVotes.length; c += 1) {
    const pair = expectedCandVotes[c];
    const ballot = String(pair[0]);
    const expected = Number(pair[1]);
    const computed = candSumMap.get(ballot) ?? 0;
    if (computed !== expected) {
      throw new Error(
        `Candidate ${ballot} sum mismatch: computed ${computed}, expected ${expected}`,
      );
    }
  }
}

/**
 * Builds and writes presidential election JSON datasets for states.
 *
 * @param {{
 *   dataDir?: string,
 *   uf?: string,
 *   all?: boolean,
 * }} [options={}]
 * @returns {Promise<{ ufsBuilt: string[], totalFilesWritten: number }>}
 */
export async function buildElectionStates({ dataDir = DATA_DIR, uf = "", all = false } = {}) {
  const national1tPath = path.join(dataDir, "national", ELECTION_PRESIDENT_1T_FILE);
  const national2tPath = path.join(dataDir, "national", ELECTION_PRESIDENT_2T_FILE);

  const national1tDoc = JSON.parse(await readFile(national1tPath, "utf8"));
  const national2tDoc = JSON.parse(await readFile(national2tPath, "utf8"));

  const sp1tPath = path.join(dataDir, "election", "presidente-1t.json");
  const sp2tPath = path.join(dataDir, "election", "presidente-2t.json");
  let sp1tDoc = null;
  let sp2tDoc = null;

  try {
    sp1tDoc = JSON.parse(await readFile(sp1tPath, "utf8"));
    sp2tDoc = JSON.parse(await readFile(sp2tPath, "utf8"));
  } catch (_err) {
    // SP official files may be optional in some test environments
  }

  const targetCodes = determineTargetUfs({ uf, all });
  const ufsBuilt = [];
  let totalFilesWritten = 0;

  for (const ufCode of targetCodes) {
    const ufInfo = findUf(ufCode);
    if (!ufInfo) {
      continue;
    }

    const munPath = path.join(dataDir, "ufs", ufCode, "municipalities.json");
    const municipalitiesDoc = JSON.parse(await readFile(munPath, "utf8"));

    const doc1t = buildElectionStateDocument({
      ufInfo,
      isFirstRound: true,
      nationalDoc: national1tDoc,
      spDoc: sp1tDoc,
      municipalitiesDoc,
    });

    const doc2t = buildElectionStateDocument({
      ufInfo,
      isFirstRound: false,
      nationalDoc: national2tDoc,
      spDoc: sp2tDoc,
      municipalitiesDoc,
    });

    const nationalRow1t = national1tDoc.rows.find(
      (/** @type {any} */ r) => String(r[0]) === ufCode,
    );
    const nationalRow2t = national2tDoc.rows.find(
      (/** @type {any} */ r) => String(r[0]) === ufCode,
    );

    if (nationalRow1t) {
      verifyExactSums(doc1t, nationalRow1t);
    }
    if (nationalRow2t) {
      verifyExactSums(doc2t, nationalRow2t);
    }

    const json1t = JSON.stringify(doc1t);
    const json2t = JSON.stringify(doc2t);

    const dirCode = path.join(dataDir, "ufs", ufCode);
    const dirSigla = path.join(dataDir, "ufs", ufInfo.sigla.toLowerCase());

    await mkdir(dirCode, { recursive: true });
    await mkdir(dirSigla, { recursive: true });

    await writeFile(path.join(dirCode, ELECTION_PRESIDENT_1T_FILE), json1t, "utf8");
    await writeFile(path.join(dirCode, ELECTION_PRESIDENT_2T_FILE), json2t, "utf8");
    totalFilesWritten += 2;

    if (dirCode !== dirSigla) {
      await writeFile(path.join(dirSigla, ELECTION_PRESIDENT_1T_FILE), json1t, "utf8");
      await writeFile(path.join(dirSigla, ELECTION_PRESIDENT_2T_FILE), json2t, "utf8");
      totalFilesWritten += 2;
    }

    ufsBuilt.push(ufInfo.sigla);
  }

  return { ufsBuilt, totalFilesWritten };
}

/**
 * Checks whether this module was invoked directly from CLI.
 *
 * @returns {boolean}
 */
function isMainModule() {
  const currentFile = fileURLToPath(import.meta.url);
  const entryFile = process.argv[1];
  if (!entryFile) {
    return false;
  }
  try {
    return realpathSync(entryFile) === realpathSync(currentFile);
  } catch (_err) {
    return path.resolve(entryFile) === path.resolve(currentFile);
  }
}

/**
 * Runs CLI execution.
 */
async function runCli() {
  const { values } = parseArgs({
    options: {
      uf: { type: "string", default: "" },
      all: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const result = await buildElectionStates({
    uf: values.uf,
    all: values.all,
  });

  process.stdout.write(
    `Built election data for ${result.ufsBuilt.length} UFs (${result.totalFilesWritten} files written)\n`,
  );
}

if (isMainModule()) {
  await runCli();
}
