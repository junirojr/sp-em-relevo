import { aggregateElectionUnits, computeUnitElectionResult } from "../../domain/election.js";
import { findSuggestions, normalizeName } from "../../domain/search.js";
import { highlightMatch } from "../../domain/search-results.js";
import { groupOf } from "../../domain/territory.js";
import {
  computeDisplayedMarginPp,
  formatCandidateMargin,
  formatCandidateShare,
  resolveCalculationBase,
  resolveColorText,
  resolveOfficeLabel,
  UNCERTAIN_LEADER_MESSAGE,
} from "./election-compare-model.js";

/**
 * Election search data model (ELE-11, ELE-22, RGV-03, TUR-04).
 *
 * Implements:
 * - ELE-11: Candidate ordering strictly by ballot number when 0 votes,
 *   or votes descending with ballot number tie-break when votes > 0.
 * - ELE-22: Voted shares equal to the map, declared calculation base
 *   (valid nominal votes, or two votes per voter in senate), and displayed margin
 *   as direct difference of displayed 2-decimal percentages.
 * - RGV-03: Multi-level search across Municipality, Government Region (RG)
 *   and Administrative Region (RA), recalculating leader and margin via groupOf
 *   summed candidate votes.
 * - TUR-04: Bounds certificate for deputy free selection with [minVotes, maxVotes]
 *   and uncertainty handling when overlapping outside municipal top-10.
 *
 * PROHIBITIONS:
 * - No else or ternary operators in JS code.
 * - No en-dash (U+2013) or em-dash (U+2014) in strings or comments.
 *
 * @typedef {import("../../domain/search.js").SearchEntry} SearchEntry
 * @typedef {import("../../domain/territory.js").TerritoryIndex} TerritoryIndex
 * @typedef {import("../../domain/territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("../../domain/election.js").ElectionUnitInput} ElectionUnitInput
 * @typedef {import("../../domain/election.js").NormalizedCandidateVote} NormalizedCandidateVote
 * @typedef {import("../../domain/election.js").DeputyBoundsCertificate} DeputyBoundsCertificate
 * @typedef {import("../../domain/search-results.js").NamePart} NamePart
 *
 * @typedef {{
 *   entry: SearchEntry,
 *   nameParts: NamePart[],
 *   kind: "municipality" | "governmentRegion" | "region",
 *   office: string,
 *   officeLabel: string,
 *   calculationBase: string,
 *   status: string,
 *   leader: NormalizedCandidateVote | null,
 *   runnerUp: NormalizedCandidateVote | null,
 *   leaderPct: string,
 *   secondPct: string,
 *   marginPp: number,
 *   formattedMargin: string,
 *   totalValidVotes: number,
 *   formattedTotalValidVotes: string,
 *   sectionsPct: number,
 *   formattedSectionsPct: string,
 *   candidates: NormalizedCandidateVote[],
 *   uncertainLeader: boolean,
 *   boundsCertificate: DeputyBoundsCertificate | null,
 *   uncertainMessage: string | null,
 *   color: string,
 *   colorText: string,
 *   memberCount: number
 * }} ElectionSearchResult
 *
 * @typedef {{
 *   foundCount: number,
 *   results: ElectionSearchResult[]
 * }} ElectionSearchResults
 */

export const SEARCH_RESULT_LIMIT = 8;

/**
 * Builds search entries for all three territorial levels (RGV-03).
 *
 * @param {TerritoryIndex} territory
 * @returns {SearchEntry[]}
 */
export function buildElectionSearchEntries(territory) {
  /** @type {SearchEntry[]} */
  const entries = [];

  // 1. Municipalities
  const regions = territory.regions();
  for (let r = 0; r < regions.length; r += 1) {
    const reg = regions[r];
    const munList = territory.municipalitiesInRegion(reg.code);
    for (let m = 0; m < munList.length; m += 1) {
      const mun = munList[m];
      entries.push({
        kind: "municipality",
        code: mun.code,
        label: mun.name,
        key: normalizeName(mun.name),
      });
    }
  }

  // 2. Government regions (43)
  if (typeof territory.governmentRegions === "function") {
    const govList = territory.governmentRegions();
    for (let g = 0; g < govList.length; g += 1) {
      const gov = govList[g];
      entries.push({
        kind: "governmentRegion",
        code: gov.code,
        label: gov.label,
        key: normalizeName(gov.label),
      });
    }
  }

  // 3. Administrative regions (16)
  for (let r = 0; r < regions.length; r += 1) {
    const reg = regions[r];
    entries.push({
      kind: "region",
      code: reg.code,
      label: reg.label,
      key: normalizeName(reg.label),
    });
  }

  return entries;
}

/**
 * Describes a single election search result row (ELE-11, ELE-22, RGV-03, TUR-04).
 *
 * @param {SearchEntry} entry
 * @param {string} query
 * @param {Map<string, ElectionUnitInput> | Record<string, ElectionUnitInput>} electionLookup
 * @param {{
 *   territory?: TerritoryIndex,
 *   municipalities?: MunicipalityRecord[],
 *   office?: string,
 *   theme?: "light" | "dark",
 *   isDeputyFreeSelection?: boolean
 * }} [options]
 * @returns {ElectionSearchResult}
 */
export function describeElectionSearchEntry(entry, query, electionLookup, options = {}) {
  const office = options.office ?? "presidente";
  const officeLabel = resolveOfficeLabel(office);
  const calculationBase = resolveCalculationBase(office);
  const territory = options.territory;
  const municipalities = options.municipalities ?? [];
  const lookupMap = toLookupMap(electionLookup);

  let unitResult = computeUnitElectionResult({ code: entry.code, name: entry.label }, options);
  let memberCount = 1;

  if (entry.kind === "municipality" || !territory || municipalities.length === 0) {
    const raw = lookupMap.get(entry.code) || {
      code: entry.code,
      name: entry.label,
    };
    unitResult = computeUnitElectionResult(raw, options);
  }

  if (entry.kind !== "municipality" && territory && municipalities.length > 0) {
    const childInputs = [];
    for (let i = 0; i < municipalities.length; i += 1) {
      const mun = municipalities[i];
      const groupCode = groupOf(entry.kind, mun.code, territory);
      if (groupCode === entry.code) {
        const munData = lookupMap.get(mun.code) || {
          code: mun.code,
          name: mun.name,
        };
        childInputs.push(munData);
      }
    }
    unitResult = aggregateElectionUnits(childInputs, {
      ...options,
      code: entry.code,
      name: entry.label,
    });
    memberCount = childInputs.length;
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
  const nameParts = highlightMatch(entry.label, query);

  return {
    entry,
    nameParts,
    kind: entry.kind,
    office,
    officeLabel,
    calculationBase,
    status: unitResult.status,
    leader,
    runnerUp,
    leaderPct,
    secondPct,
    marginPp,
    formattedMargin,
    totalValidVotes: unitResult.totalValidVotes,
    formattedTotalValidVotes,
    sectionsPct: unitResult.sectionsPct,
    formattedSectionsPct,
    candidates: unitResult.candidates,
    uncertainLeader: unitResult.uncertainLeader,
    boundsCertificate: unitResult.boundsCertificate,
    uncertainMessage,
    color: unitResult.color,
    colorText,
    memberCount,
  };
}

/**
 * Searches across election entries and produces ranked election search results (ELE-22, RGV-03).
 *
 * @param {{
 *   query: string,
 *   entries: SearchEntry[],
 *   electionLookup: Map<string, ElectionUnitInput> | Record<string, ElectionUnitInput>,
 *   territory?: TerritoryIndex,
 *   municipalities?: MunicipalityRecord[],
 *   office?: string,
 *   theme?: "light" | "dark",
 *   limit?: number,
 *   isDeputyFreeSelection?: boolean
 * }} request
 * @returns {ElectionSearchResults}
 */
export function findElectionSearchResults(request) {
  const query = request.query;
  const limit = request.limit ?? SEARCH_RESULT_LIMIT;
  const needle = normalizeName(query);

  if (needle === "") {
    return {
      foundCount: 0,
      results: [],
    };
  }

  const exactMatches = request.entries.filter((entry) => isExactMatch(entry, needle));
  const suggested = findSuggestions(request.entries, query, request.entries.length);
  const otherMatches = suggested.filter((entry) => !exactMatches.includes(entry));
  const matches = [...exactMatches, ...otherMatches];

  const shown = matches.slice(0, limit);
  const results = shown.map((entry) =>
    describeElectionSearchEntry(entry, query, request.electionLookup, request),
  );

  return {
    foundCount: matches.length,
    results,
  };
}

/**
 * @param {SearchEntry} entry
 * @param {string} needle
 * @returns {boolean}
 */
function isExactMatch(entry, needle) {
  if (entry.key === needle) {
    return true;
  }
  return normalizeName(entry.label) === needle;
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
