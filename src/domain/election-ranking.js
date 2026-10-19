/**
 * Pure domain module for candidate rankings and territorial relevance (R3, F14, F15, PAIR-06, PAIR-07).
 * Strictly synchronous and pure. Zero external dependencies outside src/domain.
 */

import { sortCandidatesByVotes } from "./election.js";

/**
 * @typedef {{
 *   ballotNumber: string,
 *   name: string,
 *   party: string,
 *   validVotes: number,
 *   sharePct: number,
 *   ledCount: number,
 *   topMunicipalitiesByVotes: Array<{
 *     code: string,
 *     name: string,
 *     votes: number,
 *     sharePct: number
 *   }>,
 *   topMunicipalitiesByShare: Array<{
 *     code: string,
 *     name: string,
 *     votes: number,
 *     sharePct: number
 *   }>
 * }} RankedCandidate
 */

/**
 * @typedef {{
 *   office: string,
 *   totalValidVotes: number,
 *   candidates: RankedCandidate[]
 * }} ElectionRankings
 */

/**
 * Resolves candidate votes from totals object.
 *
 * @param {any} stateTotals
 * @param {string} ballotNumber
 * @returns {number}
 */
function resolveCandidateStateVotes(stateTotals, ballotNumber) {
  if (!stateTotals) {
    return 0;
  }
  const votesData = stateTotals.votes;
  if (!votesData) {
    return 0;
  }
  if (Array.isArray(votesData)) {
    for (const item of votesData) {
      if (Array.isArray(item) && String(item[0]) === ballotNumber) {
        return Number(item[1]) || 0;
      }
    }
    return 0;
  }
  if (typeof votesData === "object" && ballotNumber in votesData) {
    return Number(votesData[ballotNumber]) || 0;
  }
  return 0;
}

/**
 * Normalizes candidate definition tuple or object into structured fields.
 *
 * @param {any} raw
 * @returns {{ ballotNumber: string, name: string, party: string }}
 */
function normalizeCandidateDef(raw) {
  if (Array.isArray(raw)) {
    const ballotNumber = String(raw[0] ?? "");
    let name = raw[1];
    if (typeof name !== "string" || name.trim() === "") {
      name = ballotNumber;
    }
    let party = raw[2];
    if (typeof party !== "string") {
      party = "";
    }
    return { ballotNumber, name, party };
  }
  const ballotNumber = String(raw?.ballotNumber ?? "");
  let name = raw?.name;
  if (typeof name !== "string" || name.trim() === "") {
    name = ballotNumber;
  }
  let party = raw?.party;
  if (typeof party !== "string") {
    party = "";
  }
  return { ballotNumber, name, party };
}

/**
 * Builds candidate rankings, votes, percentage share and top municipalities from election data.
 *
 * @param {{
 *   office?: string,
 *   candidates?: any[],
 *   totals?: { state?: { validVotes?: number, votes?: any } },
 *   municipalResults?: Record<string | number, any>
 * }} data
 * @returns {ElectionRankings}
 */
export function buildElectionCandidateRankings(data) {
  const office = data?.office || "";
  const rawCandidates = data?.candidates || [];
  const stateTotals = data?.totals?.state;

  let totalValidVotes = Number(stateTotals?.validVotes);
  if (!Number.isFinite(totalValidVotes)) {
    totalValidVotes = 0;
  }

  const municipalResults = data?.municipalResults || {};
  const municipalityEntries = Object.values(municipalResults);

  /** @type {RankedCandidate[]} */
  const candidateItems = [];

  for (const rawCand of rawCandidates) {
    const { ballotNumber, name, party } = normalizeCandidateDef(rawCand);
    const validVotes = resolveCandidateStateVotes(stateTotals, ballotNumber);

    let sharePct = 0;
    if (totalValidVotes > 0) {
      sharePct = Math.round(((validVotes * 100) / totalValidVotes) * 10000) / 10000;
    }

    let ledCount = 0;
    const municipalRecords = [];

    for (const mun of municipalityEntries) {
      if (!mun) {
        continue;
      }
      const code = String(mun.code || "");
      const munName = String(mun.name || code);
      const munTotalValid = Number(mun.totalValidVotes) || 0;

      let munVotes = 0;
      let munShare = 0;
      let foundCandidate = false;

      if (Array.isArray(mun.candidates)) {
        for (const c of mun.candidates) {
          if (String(c.ballotNumber) === ballotNumber) {
            munVotes = Number(c.validVotes) || 0;
            if (typeof c.sharePct === "number") {
              munShare = c.sharePct;
            }
            if (typeof c.sharePct !== "number" && munTotalValid > 0) {
              munShare = (munVotes / munTotalValid) * 100;
            }
            foundCandidate = true;
            break;
          }
        }
      }

      if (foundCandidate && munVotes > 0) {
        municipalRecords.push({
          code,
          name: munName,
          votes: munVotes,
          sharePct: munShare,
        });
      }

      const leaderNum = String(mun.leader?.ballotNumber || "");
      if (leaderNum === ballotNumber) {
        ledCount += 1;
      }
    }

    const topMunicipalitiesByVotes = [...municipalRecords].sort((a, b) => {
      if (b.votes !== a.votes) {
        return b.votes - a.votes;
      }
      return a.code.localeCompare(b.code);
    });

    const topMunicipalitiesByShare = [...municipalRecords].sort((a, b) => {
      if (b.sharePct !== a.sharePct) {
        return b.sharePct - a.sharePct;
      }
      if (b.votes !== a.votes) {
        return b.votes - a.votes;
      }
      return a.code.localeCompare(b.code);
    });

    candidateItems.push({
      ballotNumber,
      name,
      party,
      validVotes,
      sharePct,
      ledCount,
      topMunicipalitiesByVotes,
      topMunicipalitiesByShare,
    });
  }

  const sortedCandidates = sortCandidatesByVotes(candidateItems, totalValidVotes);

  return {
    office,
    totalValidVotes,
    candidates: sortedCandidates,
  };
}
