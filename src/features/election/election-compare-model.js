import {
  aggregateElectionUnits,
  computeUnitElectionResult,
  sortCandidates,
  sortCandidatesByBallotNumber,
} from "../../domain/election.js";
import { getElectionNeutrals, getPartyColor } from "../../domain/election-colors.js";
import { groupOf } from "../../domain/territory.js";

/**
 * Election comparison data model (ELE-11, ELE-22, RGV-03, TUR-04).
 *
 * Implements:
 * - ELE-11: Candidate ordering strictly by ballot number when zero votes,
 *   or votes descending with ballot number tie-break when votes > 0.
 * - ELE-22: Voted shares equal to the map, declared calculation base
 *   (valid nominal votes, or two votes per voter in senate), and displayed margin
 *   as direct difference of displayed 2-decimal percentages.
 * - RGV-03: Multi-level aggregation via groupOf(level, code) across Municipality,
 *   Government Region (RG) and Administrative Region (RA), recalculating leader
 *   and margin from the summed candidate votes.
 * - TUR-04: Bounds certificate for deputy free selection with [minVotes, maxVotes]
 *   and uncertainty handling when overlapping outside municipal top-10.
 *
 * PROHIBITIONS:
 * - No else or ternary operators in JS code.
 * - No en-dash (U+2013) or em-dash (U+2014) in strings or comments.
 *
 * @typedef {import("../../domain/election.js").ElectionUnitResult} ElectionUnitResult
 * @typedef {import("../../domain/election.js").ElectionUnitInput} ElectionUnitInput
 * @typedef {import("../../domain/election.js").NormalizedCandidateVote} NormalizedCandidateVote
 * @typedef {import("../../domain/election.js").DeputyBoundsCertificate} DeputyBoundsCertificate
 * @typedef {import("../../domain/territory.js").TerritoryIndex} TerritoryIndex
 * @typedef {import("../../domain/territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("./election-slice.js").ElectionOffice} ElectionOffice
 * @typedef {import("./election-slice.js").ElectionTab} ElectionTab
 *
 * @typedef {{
 *   code: string,
 *   name: string,
 *   kind: "municipality" | "governmentRegion" | "region",
 *   office: string,
 *   officeLabel: string,
 *   calculationBase: string,
 *   status: string,
 *   totalValidVotes: number,
 *   formattedTotalValidVotes: string,
 *   sectionsPct: number,
 *   formattedSectionsPct: string,
 *   leader: NormalizedCandidateVote | null,
 *   runnerUp: NormalizedCandidateVote | null,
 *   leaderPct: string,
 *   secondPct: string,
 *   marginPp: number,
 *   formattedMargin: string,
 *   candidates: NormalizedCandidateVote[],
 *   candidatesByBallot: NormalizedCandidateVote[],
 *   uncertainLeader: boolean,
 *   boundsCertificate: DeputyBoundsCertificate | null,
 *   uncertainMessage: string | null,
 *   color: string,
 *   colorText: string,
 *   memberCount: number
 * }} ElectionCompareSide
 *
 * @typedef {{
 *   pairKey: string,
 *   title: string,
 *   office: string,
 *   officeLabel: string,
 *   calculationBase: string,
 *   sides: [ElectionCompareSide, ElectionCompareSide],
 *   metrics: ElectionCompareMetric[]
 * }} ElectionCompareModel
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   values: [string, string],
 *   difference: string
 * }} ElectionCompareMetric
 */

export const BASE_CALCULATION_VALID_VOTES = "Votos nominais validos";
export const BASE_CALCULATION_SENATE = "Votos nominais validos (dois votos por eleitor no senado)";
export const UNCERTAIN_LEADER_MESSAGE =
  "Nao e possivel afirmar o lider (intervalo sobreposto fora do top-10 municipal)";

/** @type {Record<string, string>} */
const OFFICE_LABELS = {
  presidente: "Presidente",
  governador: "Governador",
  senador: "Senador",
  "deputado-federal": "Deputado federal",
  "deputado-estadual": "Deputado estadual",
};

/**
 * Resolves human-readable office label in Brazilian Portuguese.
 *
 * @param {string | undefined | null} office
 * @returns {string}
 */
export function resolveOfficeLabel(office) {
  const key = String(office ?? "presidente").trim();
  const match = OFFICE_LABELS[key];
  if (match) {
    return match;
  }
  return "Presidente";
}

/**
 * Declares calculation base for the active election office (ELE-22).
 *
 * @param {string | undefined | null} office
 * @returns {string}
 */
export function resolveCalculationBase(office) {
  const key = String(office ?? "")
    .toLowerCase()
    .trim();
  if (key === "senador" || key === "senado") {
    return BASE_CALCULATION_SENATE;
  }
  return BASE_CALCULATION_VALID_VOTES;
}

/**
 * Computes displayed margin in percentage points as direct difference of
 * percentages rounded to two decimal places (ELE-22).
 *
 * @param {number | null | undefined} leaderSharePct
 * @param {number | null | undefined} runnerUpSharePct
 * @returns {number}
 */
export function computeDisplayedMarginPp(leaderSharePct, runnerUpSharePct) {
  if (leaderSharePct === null || leaderSharePct === undefined || !Number.isFinite(leaderSharePct)) {
    return 0;
  }
  if (
    runnerUpSharePct === null ||
    runnerUpSharePct === undefined ||
    !Number.isFinite(runnerUpSharePct)
  ) {
    return 0;
  }
  const p1 = Number(leaderSharePct.toFixed(2));
  const p2 = Number(runnerUpSharePct.toFixed(2));
  const diff = p1 - p2;
  if (diff <= 0) {
    return 0;
  }
  return Number(diff.toFixed(2));
}

/**
 * Formats a candidate percentage value with two decimal places in pt-BR.
 *
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function formatCandidateShare(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * Formats margin points with two decimal places in pt-BR.
 *
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function formatCandidateMargin(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} pp`;
}

/**
 * Resolves color name in Brazilian Portuguese for accessibility (ACE-02).
 *
 * @param {string} [party]
 * @param {string} [status]
 * @returns {string}
 */
export function resolveColorText(party = "", status = "") {
  if (status === "no-result") {
    return "Cinza sem dado";
  }
  if (status === "tie") {
    return "Cinza empate";
  }
  if (status === "insufficient-sections") {
    return "Cinza em apuracao";
  }
  if (status === "uncertain-leader") {
    return "Cinza outros";
  }

  const normalized = String(party || "")
    .toUpperCase()
    .trim();
  /** @type {Record<string, string>} */
  const partyColors = {
    PT: "Vermelho",
    PL: "Azul escuro",
    REPUBLICANOS: "Azul",
    PP: "Azul medio",
    PSB: "Amarelo",
    REDE: "Verde agua",
    MDB: "Verde",
    PSD: "Roxo",
    PSDB: "Azul classico",
    UNIAO: "Azul cobalto",
    PSOL: "Magenta",
    NOVO: "Laranja",
    PDT: "Rosa forte",
    PODE: "Azul claro",
    SOLIDARIEDADE: "Laranja claro",
    PCDOB: "Rubi",
    PV: "Verde claro",
    CIDADANIA: "Magenta claro",
    AVANTE: "Azul petroleo",
    PRD: "Indigo",
  };

  const match = partyColors[normalized];
  if (match) {
    return match;
  }
  if (normalized.length > 0) {
    return `Cor partidaria (${normalized})`;
  }
  return "Cinza neutro";
}

/**
 * Resolves the territorial unit election result, grouping children via groupOf(level, code)
 * when dealing with government regions or administrative regions (RGV-03).
 *
 * @param {string} level "municipality" | "governmentRegion" | "region"
 * @param {string} code
 * @param {MunicipalityRecord[]} municipalities
 * @param {Map<string, ElectionUnitInput> | Record<string, ElectionUnitInput>} electionLookup
 * @param {TerritoryIndex} territory
 * @param {any} [options]
 * @returns {ElectionUnitResult & { memberCount: number }}
 */
export function resolveTerritoryElectionResult(
  level,
  code,
  municipalities,
  electionLookup,
  territory,
  options = {},
) {
  const lookupMap = toLookupMap(electionLookup);

  if (level === "municipality") {
    const raw = lookupMap.get(code) || { code, name: code };
    const res = computeUnitElectionResult(raw, options);
    return { ...res, memberCount: 1 };
  }

  // Multi-unit aggregation via groupOf (RGV-03)
  const childInputs = [];
  for (let i = 0; i < municipalities.length; i += 1) {
    const mun = municipalities[i];
    const groupCode = groupOf(level, mun.code, territory);
    if (groupCode === code) {
      const munData = lookupMap.get(mun.code) || {
        code: mun.code,
        name: mun.name,
      };
      childInputs.push(munData);
    }
  }

  const name = resolveGroupName(level, code, territory);
  const agg = aggregateElectionUnits(childInputs, {
    ...options,
    code,
    name,
  });

  return {
    ...agg,
    memberCount: childInputs.length,
  };
}

/**
 * Describes one side of an election comparison (ELE-11, ELE-22, TUR-04).
 *
 * @param {{
 *   code: string,
 *   name?: string,
 *   kind?: "municipality" | "governmentRegion" | "region"
 * }} unitTarget
 * @param {Map<string, ElectionUnitInput> | Record<string, ElectionUnitInput>} electionLookup
 * @param {{
 *   level?: "municipality" | "governmentRegion" | "region",
 *   municipalities?: MunicipalityRecord[],
 *   territory?: TerritoryIndex,
 *   office?: string,
 *   theme?: "light" | "dark",
 *   isDeputyFreeSelection?: boolean
 * }} [options]
 * @returns {ElectionCompareSide}
 */
export function describeElectionCompareSide(unitTarget, electionLookup, options = {}) {
  const level = options.level ?? "municipality";
  const office = options.office ?? "presidente";
  const officeLabel = resolveOfficeLabel(office);
  const calculationBase = resolveCalculationBase(office);
  const municipalities = options.municipalities ?? [];
  const territory = options.territory;

  let unitResult = null;
  if (territory && municipalities.length > 0) {
    unitResult = resolveTerritoryElectionResult(
      level,
      unitTarget.code,
      municipalities,
      electionLookup,
      territory,
      options,
    );
  }
  if (!unitResult) {
    const lookupMap = toLookupMap(electionLookup);
    const raw = lookupMap.get(unitTarget.code) || {
      code: unitTarget.code,
      name: unitTarget.name ?? unitTarget.code,
    };
    const computed = computeUnitElectionResult(raw, options);
    unitResult = { ...computed, memberCount: 1 };
  }

  const leader = unitResult.leader;
  const runnerUp = unitResult.runnerUp;
  let leaderPct = "-";
  let secondPct = "-";
  let leaderPctNum = 0;
  let secondPctNum = 0;

  if (leader) {
    leaderPctNum = leader.sharePct;
    leaderPct = formatCandidateShare(leaderPctNum);
  }
  if (runnerUp) {
    secondPctNum = runnerUp.sharePct;
    secondPct = formatCandidateShare(secondPctNum);
  }

  // ELE-22: displayed margin is direct difference of displayed 2-decimal percentages
  const marginPp = computeDisplayedMarginPp(leaderPctNum, secondPctNum);
  const formattedMargin = formatCandidateMargin(marginPp);
  const formattedTotalValidVotes = unitResult.totalValidVotes.toLocaleString("pt-BR");
  const formattedSectionsPct = formatCandidateShare(unitResult.sectionsPct);

  let uncertainMessage = null;
  if (unitResult.uncertainLeader) {
    uncertainMessage = UNCERTAIN_LEADER_MESSAGE;
  }

  const colorText = resolveColorText(leader?.party, unitResult.status);

  return {
    code: unitTarget.code,
    name: unitResult.name,
    kind: level,
    office,
    officeLabel,
    calculationBase,
    status: unitResult.status,
    totalValidVotes: unitResult.totalValidVotes,
    formattedTotalValidVotes,
    sectionsPct: unitResult.sectionsPct,
    formattedSectionsPct,
    leader,
    runnerUp,
    leaderPct,
    secondPct,
    marginPp,
    formattedMargin,
    candidates: unitResult.candidates,
    candidatesByBallot: unitResult.candidatesByBallot,
    uncertainLeader: unitResult.uncertainLeader,
    boundsCertificate: unitResult.boundsCertificate,
    uncertainMessage,
    color: unitResult.color,
    colorText,
    memberCount: unitResult.memberCount,
  };
}

/**
 * Builds the complete election comparison model for exactly two units (ELE-11, ELE-22, TUR-04).
 *
 * @param {[
 *   { code: string, name?: string },
 *   { code: string, name?: string }
 * ]} pair
 * @param {Map<string, ElectionUnitInput> | Record<string, ElectionUnitInput>} electionLookup
 * @param {{
 *   level?: "municipality" | "governmentRegion" | "region",
 *   municipalities?: MunicipalityRecord[],
 *   territory?: TerritoryIndex,
 *   office?: string,
 *   theme?: "light" | "dark",
 *   isDeputyFreeSelection?: boolean
 * }} [options]
 * @returns {ElectionCompareModel}
 */
export function buildElectionCompareModel(pair, electionLookup, options = {}) {
  const sideA = describeElectionCompareSide(pair[0], electionLookup, options);
  const sideB = describeElectionCompareSide(pair[1], electionLookup, options);

  const metrics = buildComparisonMetrics(sideA, sideB);
  const office = options.office ?? "presidente";
  const officeLabel = resolveOfficeLabel(office);
  const calculationBase = resolveCalculationBase(office);

  return {
    pairKey: `${sideA.code}|${sideB.code}`,
    title: `Comparativo Eleitoral: ${sideA.name} x ${sideB.name}`,
    office,
    officeLabel,
    calculationBase,
    sides: [sideA, sideB],
    metrics,
  };
}

/**
 * @param {ElectionCompareSide} sideA
 * @param {ElectionCompareSide} sideB
 * @returns {ElectionCompareMetric[]}
 */
function buildComparisonMetrics(sideA, sideB) {
  /** @type {ElectionCompareMetric[]} */
  const metrics = [];

  // Metric 1: Total valid votes
  metrics.push({
    id: "totalValidVotes",
    label: "Total de votos validos",
    values: [sideA.formattedTotalValidVotes, sideB.formattedTotalValidVotes],
    difference: computeNumericDifferenceText(
      sideA.totalValidVotes,
      sideB.totalValidVotes,
      sideA.name,
      sideB.name,
    ),
  });

  // Metric 2: Sections totalized
  metrics.push({
    id: "sectionsPct",
    label: "Secoes apuradas",
    values: [sideA.formattedSectionsPct, sideB.formattedSectionsPct],
    difference: computePercentagePointDifferenceText(
      sideA.sectionsPct,
      sideB.sectionsPct,
      sideA.name,
      sideB.name,
    ),
  });

  // Metric 3: Leader margin
  metrics.push({
    id: "marginPp",
    label: "Margem do lider",
    values: [sideA.formattedMargin, sideB.formattedMargin],
    difference: computePercentagePointDifferenceText(
      sideA.marginPp,
      sideB.marginPp,
      sideA.name,
      sideB.name,
    ),
  });

  return metrics;
}

/**
 * @param {number} valA
 * @param {number} valB
 * @param {string} nameA
 * @param {string} nameB
 * @returns {string}
 */
function computeNumericDifferenceText(valA, valB, nameA, nameB) {
  if (!Number.isFinite(valA) || !Number.isFinite(valB)) {
    return "Sem dado";
  }
  if (valA === valB) {
    return "Iguais";
  }
  if (valA > valB) {
    const diff = valA - valB;
    return `+${diff.toLocaleString("pt-BR")} em ${nameA}`;
  }
  const diff = valB - valA;
  return `+${diff.toLocaleString("pt-BR")} em ${nameB}`;
}

/**
 * @param {number} pctA
 * @param {number} pctB
 * @param {string} nameA
 * @param {string} nameB
 * @returns {string}
 */
function computePercentagePointDifferenceText(pctA, pctB, nameA, nameB) {
  if (!Number.isFinite(pctA) || !Number.isFinite(pctB)) {
    return "Sem dado";
  }
  const roundedA = Number(pctA.toFixed(2));
  const roundedB = Number(pctB.toFixed(2));
  if (roundedA === roundedB) {
    return "Iguais";
  }
  if (roundedA > roundedB) {
    const diff = (roundedA - roundedB).toFixed(2).replace(".", ",");
    return `+${diff} pp em ${nameA}`;
  }
  const diff = (roundedB - roundedA).toFixed(2).replace(".", ",");
  return `+${diff} pp em ${nameB}`;
}

/**
 * @param {any} input
 * @returns {Map<string, ElectionUnitInput>}
 */
function toLookupMap(input) {
  if (!input) {
    return new Map();
  }
  if (input instanceof Map) {
    return input;
  }
  const map = new Map();
  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i += 1) {
      const item = input[i];
      if (item && item.code) {
        map.set(item.code, item);
      }
    }
    return map;
  }
  if (typeof input === "object") {
    const keys = Object.keys(input);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      map.set(k, input[k]);
    }
  }
  return map;
}

/**
 * @param {string} level
 * @param {string} code
 * @param {TerritoryIndex} territory
 * @returns {string}
 */
function resolveGroupName(level, code, territory) {
  if (level === "governmentRegion") {
    if (typeof territory.governmentRegions === "function") {
      const list = territory.governmentRegions();
      const match = list.find((r) => r.code === code);
      if (match) {
        return match.label;
      }
    }
    return `RG ${code}`;
  }
  if (level === "region") {
    if (typeof territory.regions === "function") {
      const list = territory.regions();
      const match = list.find((r) => r.code === code);
      if (match) {
        return match.label;
      }
    }
    return `RA ${code}`;
  }
  return code;
}
