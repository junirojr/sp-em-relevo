/**
 * Pure validation checks for the 1st round electoral pipeline (TUR-01, TUR-02, TUR-03, PUB-09).
 * Returns an array of problem strings; an empty array indicates full compliance.
 *
 * @typedef {{
 *   ballotNumber: string | number,
 *   name?: string,
 *   party?: string,
 *   validVotes?: number,
 *   votes?: number
 * }} CandidateEntry
 *
 * @typedef {{
 *   code: string,
 *   validVotes: number,
 *   blankVotes?: number,
 *   nullVotes?: number,
 *   demais?: number,
 *   otherVotes?: number,
 *   tenthPlaceVotes?: number,
 *   candidates?: CandidateEntry[]
 * }} UnitEntry
 */

import fs from "node:fs";

export const EXPECTED_MUNICIPALITY_COUNT = 645;
export const MAX_FILE_SIZE_BYTES = 120000; // 120 KB per PUB-09
export const SP_STATE_CODE = "35";
export const EXPECTED_RA_CODES = Object.freeze(
  Array.from({ length: 16 }, (_, index) => String(index + 1)),
);
export const EXPECTED_RG_CODES = Object.freeze(
  Array.from({ length: 43 }, (_, index) => `rg-${index + 1}`),
);

const IBGE_CODE_REGEX = /^35\d{5}$/;

/**
 * TUR-01: Validates that exactly 645 distinct 7-digit IBGE municipality codes are present for SP.
 *
 * @param {string[]} codes
 * @returns {string[]}
 */
export function checkMunicipalityCoverage(codes) {
  const problems = [];
  if (!Array.isArray(codes)) {
    problems.push("TUR-01: Lista de municipios deve ser um array.");
    return problems;
  }

  if (codes.length !== EXPECTED_MUNICIPALITY_COUNT) {
    problems.push(
      `TUR-01: Esperados exatamente ${EXPECTED_MUNICIPALITY_COUNT} municipios, recebidos ${codes.length}.`,
    );
  }

  const seen = new Set();
  const duplicates = new Set();
  const invalidCodes = [];

  for (const rawCode of codes) {
    const codeStr = String(rawCode).trim();
    if (!IBGE_CODE_REGEX.test(codeStr)) {
      invalidCodes.push(codeStr);
    }
    if (seen.has(codeStr)) {
      duplicates.add(codeStr);
    }
    seen.add(codeStr);
  }

  if (duplicates.size > 0) {
    const list = Array.from(duplicates).slice(0, 5).join(", ");
    problems.push(`TUR-01: Municipios duplicados encontrados: ${list}.`);
  }

  if (invalidCodes.length > 0) {
    const list = invalidCodes.slice(0, 5).join(", ");
    problems.push(`TUR-01: Codigos IBGE invalidos para SP (devem iniciar com 35): ${list}.`);
  }

  return problems;
}

/**
 * TUR-01: Validates nominal valid votes integrity, ensuring non-negative values and vote sum coherence.
 *
 * @param {UnitEntry} unit
 * @returns {string[]}
 */
export function checkValidVotesIntegrity(unit) {
  const problems = [];
  const code = String(unit.code ?? "desconhecido");

  if (!Number.isFinite(unit.validVotes) || unit.validVotes < 0) {
    problems.push(`TUR-01 (${code}): Total de votos validos invalido (${unit.validVotes}).`);
    return problems;
  }

  const blank = unit.blankVotes ?? 0;
  if (!Number.isFinite(blank) || blank < 0) {
    problems.push(`TUR-01 (${code}): Votos brancos invalidos (${blank}).`);
  }

  const nullVotes = unit.nullVotes ?? 0;
  if (!Number.isFinite(nullVotes) || nullVotes < 0) {
    problems.push(`TUR-01 (${code}): Votos nulos invalidos (${nullVotes}).`);
  }

  const candidateList = unit.candidates ?? [];
  let candidateSum = 0;
  for (const cand of candidateList) {
    const votes = cand.validVotes ?? cand.votes ?? 0;
    if (!Number.isFinite(votes) || votes < 0) {
      problems.push(
        `TUR-01 (${code}): Votos nominais invalidos para candidato ${cand.ballotNumber} (${votes}).`,
      );
    }
    candidateSum += Math.max(0, votes);
  }

  const otherVotes = unit.demais ?? unit.otherVotes ?? 0;
  if (!Number.isFinite(otherVotes) || otherVotes < 0) {
    problems.push(`TUR-01 (${code}): Votos 'demais' invalidos (${otherVotes}).`);
  }

  const totalSum = candidateSum + otherVotes;
  if (unit.validVotes > 0 && totalSum > unit.validVotes) {
    problems.push(
      `TUR-01 (${code}): Soma dos candidatos e demais (${totalSum}) excede o total valido (${unit.validVotes}).`,
    );
  }

  return problems;
}

/**
 * TUR-03: Validates top 10 deputy candidates structure, remainder "demais", and 10th-place votes.
 *
 * @param {UnitEntry} unit
 * @returns {string[]}
 */
export function checkDeputyStructure(unit) {
  const problems = [];
  const code = String(unit.code ?? "desconhecido");
  const candidates = unit.candidates ?? [];

  if (candidates.length > 10) {
    problems.push(
      `TUR-03 (${code}): Gravados ${candidates.length} candidatos, maximo permitido e 10.`,
    );
  }

  let prevVotes = Number.POSITIVE_INFINITY;
  for (let index = 0; index < candidates.length; index += 1) {
    const cand = candidates[index];
    const votes = cand.validVotes ?? cand.votes ?? 0;
    if (votes > prevVotes) {
      problems.push(
        `TUR-03 (${code}): Candidatos nao estao ordenados por votos decrescentes na posicao ${index}.`,
      );
    }
    prevVotes = votes;
  }

  const otherVotes = unit.demais ?? unit.otherVotes;
  if (otherVotes === undefined || !Number.isFinite(otherVotes) || otherVotes < 0) {
    problems.push(`TUR-03 (${code}): Campo 'demais' ausente ou invalido.`);
  }

  if (candidates.length === 10) {
    const tenthCand = candidates[9];
    const tenthVotes = tenthCand.validVotes ?? tenthCand.votes ?? 0;
    if (unit.tenthPlaceVotes !== undefined && unit.tenthPlaceVotes !== tenthVotes) {
      problems.push(
        `TUR-03 (${code}): tenthPlaceVotes (${unit.tenthPlaceVotes}) diverge do 10o colocado (${tenthVotes}).`,
      );
    }
  }

  return problems;
}

/**
 * TUR-03: Validates pre-aggregated totals by RA (16 regions), RG (43 regions), and State ("35").
 *
 * @param {{
 *   state?: { validVotes: number },
 *   ra?: Record<string, { validVotes: number }>,
 *   rg?: Record<string, { validVotes: number }>
 * }} totals
 * @returns {string[]}
 */
export function checkPreaggregatedTotals(totals) {
  const problems = [];
  if (!totals || typeof totals !== "object") {
    problems.push("TUR-03: Totais pre-somados ausentes.");
    return problems;
  }

  if (!totals.state || !Number.isFinite(totals.state.validVotes) || totals.state.validVotes <= 0) {
    problems.push("TUR-03: Total estadual ausente ou com votos validos invalidos.");
    return problems;
  }

  const stateVotes = totals.state.validVotes;

  const raMap = totals.ra ?? {};
  const raKeys = Object.keys(raMap);
  for (const expectedRa of EXPECTED_RA_CODES) {
    if (!raMap[expectedRa]) {
      problems.push(`TUR-03: Regiao Administrativa ausente: RA ${expectedRa}.`);
    }
  }

  let raSum = 0;
  for (const key of raKeys) {
    const entry = raMap[key];
    if (entry && Number.isFinite(entry.validVotes)) {
      raSum += entry.validVotes;
    }
  }
  if (Math.abs(raSum - stateVotes) > 1) {
    problems.push(`TUR-03: Soma das RAs (${raSum}) diverge do total estadual (${stateVotes}).`);
  }

  const rgMap = totals.rg ?? {};
  const rgKeys = Object.keys(rgMap);
  for (const expectedRg of EXPECTED_RG_CODES) {
    if (!rgMap[expectedRg]) {
      problems.push(`TUR-03: Regiao de Governo ausente: ${expectedRg}.`);
    }
  }

  let rgSum = 0;
  for (const key of rgKeys) {
    const entry = rgMap[key];
    if (entry && Number.isFinite(entry.validVotes)) {
      rgSum += entry.validVotes;
    }
  }
  if (Math.abs(rgSum - stateVotes) > 1) {
    problems.push(`TUR-03: Soma das RGs (${rgSum}) diverge do total estadual (${stateVotes}).`);
  }

  return problems;
}

/**
 * PUB-09: Checks that file size on disk or byte buffer does not exceed 120,000 bytes.
 *
 * @param {string | number | Buffer} fileOrBytes
 * @param {number} [maxBytes]
 * @returns {string[]}
 */
export function checkFileSizeCeiling(fileOrBytes, maxBytes = MAX_FILE_SIZE_BYTES) {
  const problems = [];
  let size = 0;

  if (typeof fileOrBytes === "number") {
    size = fileOrBytes;
  }

  if (typeof fileOrBytes === "string") {
    if (!fs.existsSync(fileOrBytes)) {
      problems.push(`PUB-09: Arquivo nao encontrado para checagem de peso: ${fileOrBytes}.`);
      return problems;
    }
    const stat = fs.statSync(fileOrBytes);
    size = stat.size;
  }

  if (Buffer.isBuffer(fileOrBytes)) {
    size = fileOrBytes.length;
  }

  if (size > maxBytes) {
    problems.push(
      `PUB-09: Peso do arquivo (${size} bytes) excedeu o teto estrito de ${maxBytes} bytes.`,
    );
  }

  return problems;
}

/**
 * TUR-02: Checks candidate share percentages against oracle reference values within tolerance.
 *
 * @param {number} actualPct
 * @param {number} targetPct
 * @param {string} candidateName
 * @param {number} [tolerance]
 * @returns {string[]}
 */
export function checkCandidateOraclePercentage(
  actualPct,
  targetPct,
  candidateName,
  tolerance = 0.05,
) {
  const problems = [];
  const diff = Math.abs(actualPct - targetPct);
  if (diff > tolerance) {
    problems.push(
      `TUR-02: Porcentagem de ${candidateName} (${actualPct.toFixed(2)}%) diverge do oraculo (${targetPct.toFixed(2)}%). Diferenca: ${diff.toFixed(2)} pp.`,
    );
  }
  return problems;
}

/**
 * Hydrates a compact columnar row into an ElectionUnitInput compatible with src/domain/election.js.
 *
 * Row columns: [code, validVotes, blankVotes, nullVotes, demais, tenthPlaceVotes, votesPairs]
 * where votesPairs is [[ballotNumber, votes], ...]
 *
 * @param {[string, number, number, number, number, number, Array<[string | number, number]>]} row
 * @param {Array<[string, string, string] | {ballotNumber: string, name: string, party: string}> | Record<string, {name: string, party: string}>} [candidatesCatalog]
 * @returns {import("../../src/domain/election.js").ElectionUnitInput}
 */
export function hydrateUnitFromRow(row, candidatesCatalog = []) {
  const code = String(row[0]);
  const validVotes = Number(row[1] ?? 0);
  const blankVotes = Number(row[2] ?? 0);
  const nullVotes = Number(row[3] ?? 0);
  const demais = Number(row[4] ?? 0);
  const tenthPlaceVotes = Number(row[5] ?? 0);
  const rawVotes = row[6] ?? [];

  const candidates = rawVotes.map(([ref, votes]) => {
    let ballotNumber = String(ref);
    let name = ballotNumber;
    let party = "";

    if (typeof ref === "number" && Array.isArray(candidatesCatalog)) {
      const entry = candidatesCatalog[ref];
      if (Array.isArray(entry)) {
        ballotNumber = String(entry[0]);
        name = String(entry[1] ?? ballotNumber);
        party = String(entry[2] ?? "");
      }
      if (!Array.isArray(entry) && entry && typeof entry === "object") {
        ballotNumber = String(entry.ballotNumber ?? ref);
        name = String(entry.name ?? ballotNumber);
        party = String(entry.party ?? "");
      }
    }

    if (typeof candidatesCatalog === "object" && !Array.isArray(candidatesCatalog)) {
      const meta = candidatesCatalog[ballotNumber];
      if (meta) {
        name = String(meta.name ?? ballotNumber);
        party = String(meta.party ?? "");
      }
    }

    return {
      ballotNumber,
      name,
      party,
      validVotes: Number(votes ?? 0),
      votes: Number(votes ?? 0),
    };
  });

  return {
    code,
    ibgeCode: code,
    validVotes,
    totalValidVotes: validVotes,
    blankVotes,
    nullVotes,
    demais,
    otherVotes: demais,
    tenthPlaceVotes,
    candidates,
  };
}
