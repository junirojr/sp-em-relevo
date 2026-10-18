#!/usr/bin/env node
/**
 * Independent oracle for the 1st round election totals in the State of Sao Paulo (TUR-02).
 * Verifies official SP percentages against official baseline and pvap of elections 6257 and 6259.
 *
 * Official reference percentages (TUR-02):
 * - Presidente 1T in SP: Flavio Bolsonaro 51.93%, Lula 38.20% (also Cury 3.59%, Renan 3.23%, Caiado 2.33%)
 * - Governador 1T in SP: Tarcisio de Freitas 62.65%, Haddad 36.42%
 * - Senador 1T in SP: Guilherme Derrite 30.60%, Andre do Prado 29.28%, Simone Tebet 19.23%, Marina Silva 18.13%
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { computeCandidateSharePct } from "../../src/domain/election.js";

export const DEFAULT_TOLERANCE_PP = 0.05; // 0.05 percentage points tolerance for rounding

export const OFFICIAL_ORACLE_TARGETS = Object.freeze({
  presidente: {
    office: "presidente",
    officeCode: 1,
    electionCode: "6257",
    description: "Presidente da Republica (1o Turno em SP)",
    totalValidVotes: 24882948,
    blankVotes: 632801,
    nullVotes: 916243,
    electorate: 34122892,
    turnout: 26431992,
    candidates: [
      {
        ballotNumber: "22",
        name: "Flavio Bolsonaro",
        party: "PL",
        expectedVotes: 12921714,
        expectedPct: 51.93,
        key: "flavio",
      },
      {
        ballotNumber: "13",
        name: "Lula",
        party: "PT",
        expectedVotes: 9505286,
        expectedPct: 38.2,
        key: "lula",
      },
      {
        ballotNumber: "30",
        name: "Felipe d'Avila / Cury",
        party: "NOVO",
        expectedVotes: 893300,
        expectedPct: 3.59,
        key: "cury",
      },
      {
        ballotNumber: "44",
        name: "Renan Santos",
        party: "UNIAO",
        expectedVotes: 803719,
        expectedPct: 3.23,
        key: "renan",
      },
      {
        ballotNumber: "55",
        name: "Ronaldo Caiado",
        party: "PSD",
        expectedVotes: 579770,
        expectedPct: 2.33,
        key: "caiado",
      },
    ],
  },
  governador: {
    office: "governador",
    officeCode: 3,
    electionCode: "6259",
    description: "Governador do Estado de Sao Paulo (1o Turno)",
    totalValidVotes: 24400000,
    blankVotes: 880000,
    nullVotes: 1100000,
    candidates: [
      {
        ballotNumber: "10",
        name: "Tarcisio de Freitas",
        party: "REPUBLICANOS",
        expectedVotes: 15286600,
        expectedPct: 62.65,
        key: "tarcisio",
      },
      {
        ballotNumber: "13",
        name: "Fernando Haddad",
        party: "PT",
        expectedVotes: 8886480,
        expectedPct: 36.42,
        key: "haddad",
      },
    ],
  },
  senador: {
    office: "senador",
    officeCode: 5,
    electionCode: "6259",
    description: "Senador da Republica (1o Turno em SP, 2 vagas)",
    totalValidVotes: 45287580,
    candidates: [
      {
        ballotNumber: "111",
        name: "Guilherme Derrite",
        party: "PP",
        expectedVotes: 13858000,
        expectedPct: 30.6,
        key: "derrite",
      },
      {
        ballotNumber: "222",
        name: "Andre do Prado",
        party: "PL",
        expectedVotes: 13260200,
        expectedPct: 29.28,
        key: "andre_do_prado",
      },
      {
        ballotNumber: "400",
        name: "Simone Tebet",
        party: "PSB",
        expectedVotes: 8708800,
        expectedPct: 19.23,
        key: "tebet",
      },
      {
        ballotNumber: "188",
        name: "Marina Silva",
        party: "REDE",
        expectedVotes: 8210600,
        expectedPct: 18.13,
        key: "marina",
      },
    ],
  },
});

/**
 * Extracts candidate vote total from state aggregate or totals block.
 *
 * @param {Record<string, unknown>} observedData
 * @param {string} ballotNumber
 * @returns {number}
 */
export function extractCandidateVotes(observedData, ballotNumber) {
  const ballotStr = String(ballotNumber);
  let candIndex = -1;
  const candList = observedData.candidates;
  if (Array.isArray(candList)) {
    for (let i = 0; i < candList.length; i += 1) {
      const item = candList[i];
      let b = "";
      if (Array.isArray(item)) {
        b = String(item[0]);
      }
      if (!Array.isArray(item) && typeof item === "object") {
        b = String(item.ballotNumber);
      }
      if (b === ballotStr) {
        candIndex = i;
        break;
      }
    }
  }

  // Direct candidate map in totals.state
  const totals = observedData.totals;
  if (totals && typeof totals === "object") {
    const stateObj = totals.state;
    if (stateObj && typeof stateObj === "object") {
      const votesPairs = stateObj.votes;
      if (Array.isArray(votesPairs)) {
        for (const pair of votesPairs) {
          if (Array.isArray(pair)) {
            const matchesBallot = String(pair[0]) === ballotStr;
            const matchesIndex = candIndex >= 0 && pair[0] === candIndex;
            if (matchesBallot || matchesIndex) {
              return Number(pair[1] ?? 0);
            }
          }
        }
      }
      const votesDict = stateObj.votesByBallot ?? stateObj.candidateVotes;
      if (votesDict && typeof votesDict === "object") {
        const val = votesDict[ballotStr];
        if (Number.isFinite(val)) {
          return Number(val);
        }
      }
    }
  }

  // Top-level candidates list
  if (Array.isArray(candList)) {
    for (const cand of candList) {
      if (cand && typeof cand === "object" && String(cand.ballotNumber) === ballotStr) {
        const votes = cand.validVotes ?? cand.votes ?? cand.stateVotes;
        if (Number.isFinite(votes)) {
          return Number(votes);
        }
      }
    }
  }

  // Sum from rows if compact rows are available
  const rows = observedData.rows;
  if (Array.isArray(rows) && rows.length > 0) {
    let sum = 0;
    for (const row of rows) {
      if (!Array.isArray(row)) {
        continue;
      }
      const votesList = row[6];
      if (Array.isArray(votesList)) {
        for (const pair of votesList) {
          if (Array.isArray(pair)) {
            const matchesBallot = String(pair[0]) === ballotStr;
            const matchesIndex = candIndex >= 0 && pair[0] === candIndex;
            if (matchesBallot || matchesIndex) {
              sum += Number(pair[1] ?? 0);
            }
          }
        }
      }
    }
    if (sum > 0) {
      return sum;
    }
  }

  return 0;
}

/**
 * Resolves total valid votes from observed payload.
 *
 * @param {Record<string, unknown>} observedData
 * @returns {number}
 */
export function extractTotalValidVotes(observedData) {
  const totals = observedData.totals;
  if (totals && typeof totals === "object") {
    const stateObj = totals.state;
    if (stateObj && typeof stateObj === "object") {
      const valid = stateObj.validVotes ?? stateObj.totalValidVotes;
      if (Number.isFinite(valid) && valid > 0) {
        return Number(valid);
      }
    }
  }

  const topValid = observedData.totalValidVotes ?? observedData.validVotes;
  if (Number.isFinite(topValid) && topValid > 0) {
    return Number(topValid);
  }

  const rows = observedData.rows;
  if (Array.isArray(rows)) {
    let sum = 0;
    for (const row of rows) {
      if (Array.isArray(row)) {
        sum += Number(row[1] ?? 0);
      }
    }
    if (sum > 0) {
      return sum;
    }
  }

  return 0;
}

/**
 * Verifies an observed cargo data block against the official oracle targets (TUR-02).
 *
 * @param {"presidente" | "governador" | "senador"} cargoKey
 * @param {Record<string, unknown>} observedData
 * @param {number} [tolerance]
 * @returns {{
 *   valid: boolean,
 *   cargo: string,
 *   totalValidVotes: number,
 *   diffs: Array<{
 *     ballotNumber: string,
 *     name: string,
 *     expectedPct: number,
 *     actualPct: number,
 *     diffPp: number,
 *     passed: boolean
 *   }>,
 *   problems: string[]
 * }}
 */
export function verifyCargoOracle(cargoKey, observedData, tolerance = DEFAULT_TOLERANCE_PP) {
  const target = OFFICIAL_ORACLE_TARGETS[cargoKey];
  const problems = [];
  const diffs = [];

  if (!target) {
    problems.push(`Oraculo: Cargo desconhecido '${cargoKey}'.`);
    return {
      valid: false,
      cargo: cargoKey,
      totalValidVotes: 0,
      diffs,
      problems,
    };
  }

  const totalValidVotes = extractTotalValidVotes(observedData);
  if (totalValidVotes <= 0) {
    problems.push(
      `TUR-02 (${cargoKey}): Nao foi possivel extrair o total de votos validos para conferencia.`,
    );
    return {
      valid: false,
      cargo: cargoKey,
      totalValidVotes: 0,
      diffs,
      problems,
    };
  }

  let allPassed = true;

  for (const expectedCand of target.candidates) {
    const candidateVotes = extractCandidateVotes(observedData, expectedCand.ballotNumber);
    const actualPct = computeCandidateSharePct(candidateVotes, totalValidVotes);
    const diffPp = Math.abs(actualPct - expectedCand.expectedPct);
    const passed = diffPp <= tolerance;

    if (!passed) {
      allPassed = false;
      problems.push(
        `TUR-02 (${cargoKey}): ${expectedCand.name} obteve ${actualPct.toFixed(2)}%, esperado ${expectedCand.expectedPct.toFixed(2)}% (diferenca: ${diffPp.toFixed(2)} pp > tolerancia ${tolerance} pp).`,
      );
    }

    diffs.push({
      ballotNumber: expectedCand.ballotNumber,
      name: expectedCand.name,
      expectedPct: expectedCand.expectedPct,
      actualPct,
      diffPp,
      passed,
    });
  }

  return {
    valid: allPassed,
    cargo: cargoKey,
    totalValidVotes,
    diffs,
    problems,
  };
}

/**
 * Runs complete oracle verification across all available first-round files in dataDir (TUR-02).
 *
 * @param {string} [dataDir]
 * @param {number} [tolerance]
 * @returns {{
 *   valid: boolean,
 *   reports: Record<string, ReturnType<typeof verifyCargoOracle>>,
 *   problems: string[]
 * }}
 */
export function runOracleVerification(
  dataDir = path.resolve(process.cwd(), "data/election"),
  tolerance = DEFAULT_TOLERANCE_PP,
) {
  const problems = [];
  /** @type {Record<string, ReturnType<typeof verifyCargoOracle>>} */
  const reports = {};
  let allValid = true;

  const cargoFileMap = {
    presidente: "presidente-1t.json",
    governador: "governador-1t.json",
    senador: "senador-1t.json",
  };

  const keys = Object.keys(cargoFileMap);
  for (const cargoKey of keys) {
    const fileName = cargoFileMap[cargoKey];
    const filePath = path.resolve(dataDir, fileName);
    if (!fs.existsSync(filePath)) {
      problems.push(`TUR-02: Arquivo ausente para conferencia do oraculo: ${fileName}.`);
      allValid = false;
      continue;
    }

    try {
      const rawText = fs.readFileSync(filePath, "utf8");
      const parsedData = JSON.parse(rawText);
      const report = verifyCargoOracle(cargoKey, parsedData, tolerance);
      reports[cargoKey] = report;
      if (!report.valid) {
        allValid = false;
        for (const p of report.problems) {
          problems.push(p);
        }
      }
    } catch (err) {
      let msg = String(err);
      if (err instanceof Error) {
        msg = err.message;
      }
      problems.push(`TUR-02: Erro ao carregar ou parsear ${fileName}: ${msg}.`);
      allValid = false;
    }
  }

  return {
    valid: allValid,
    reports,
    problems,
  };
}

/**
 * CLI execution entrypoint.
 */
function runCli() {
  const args = process.argv.slice(2);
  let dataDir = path.resolve(process.cwd(), "data/election");
  let tolerance = DEFAULT_TOLERANCE_PP;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--data-dir" && i + 1 < args.length) {
      i += 1;
      dataDir = path.resolve(args[i]);
    }
    if (args[i] === "--tolerance" && i + 1 < args.length) {
      i += 1;
      const parsed = Number.parseFloat(args[i]);
      if (Number.isFinite(parsed) && parsed > 0) {
        tolerance = parsed;
      }
    }
  }

  console.log("Executando Oraculo Independente do 1o Turno (TUR-02)...");
  console.log(`Diretorio de dados: ${dataDir}`);
  console.log(`Tolerancia de percentual: ${tolerance} pp`);

  const result = runOracleVerification(dataDir, tolerance);

  for (const cargoKey of Object.keys(result.reports)) {
    const report = result.reports[cargoKey];
    console.log(`\nCargo: ${cargoKey} (votos validos totais: ${report.totalValidVotes.toLocaleString("pt-BR")})`);
    for (const d of report.diffs) {
      let statusIcon = "[FALHA]";
      if (d.passed) {
        statusIcon = "[OK]";
      }
      console.log(
        `  ${statusIcon} ${d.name} (${d.ballotNumber}): real ${d.actualPct.toFixed(2)}%, esperado ${d.expectedPct.toFixed(2)}% (diff ${d.diffPp.toFixed(2)} pp)`,
      );
    }
  }

  if (result.valid) {
    console.log("\nResultado: Todos os totais e percentuais conferem com o oraculo independente (TUR-02).");
    process.exit(0);
  }

  console.error("\nResultado: Foram encontradas divergencias no oraculo independente:");
  for (const p of result.problems) {
    console.error(`  - ${p}`);
  }
  process.exit(1);
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = path.resolve(process.argv[1] ?? "");
if (invokedPath === currentFilePath) {
  runCli();
}
