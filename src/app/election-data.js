import { computeUnitElectionResult } from "../domain/election.js";
import { assignCandidateColors, getElectionNeutrals } from "../domain/election-colors.js";

/**
 * Election data loader and processor for 1st and 2nd round data.
 *
 * Provides:
 * - On-demand fetching and caching of first-round office data (presidente, governador, senador, etc.)
 * - Computation of unit election results, candidate colors, and leaders
 * - Fallback simulation / replay data loading for 2nd round when live TSE is offline
 *
 * @typedef {import("../domain/election.js").ElectionUnitResult} ElectionUnitResult
 * @typedef {import("../domain/election-colors.js").ThemeMode} ThemeMode
 * @typedef {import("../domain/election-colors.js").AssignedCandidatePalette} AssignedCandidatePalette
 * @typedef {"presidente" | "governador" | "senador" | "deputado-federal" | "deputado-estadual"} ElectionOffice
 */

/**
 * Cache of loaded first-round data by office key.
 * @type {Map<string, any>}
 */
const firstRoundCache = new Map();

/**
 * Cache of loaded 2nd round replay data.
 * @type {any}
 */
let secondRoundCache = null;

/**
 * Resolves the relative path for a first-round office file.
 *
 * @param {string} office
 * @returns {string}
 */
export function getFirstRoundOfficePath(office) {
  if (office === "presidente-2t") {
    return "./data/election/presidente-2t.json";
  }
  const allowed = ["presidente", "governador", "senador", "deputado-federal", "deputado-estadual"];
  if (allowed.includes(office)) {
    return `./data/election/${office}-1t.json`;
  }
  return "./data/election/presidente-1t.json";
}

/**
 * Loads first-round office data and computes election unit results for all municipalities.
 *
 * @param {string} [office="presidente"]
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   theme?: ThemeMode,
 *   municipalities?: readonly import("../domain/territory.js").MunicipalityRecord[]
 * }} [options={}]
 * @returns {Promise<{
 *   ok: boolean,
 *   office: string,
 *   description: string,
 *   candidates: any[],
 *   palette: AssignedCandidatePalette,
 *   municipalResults: Record<string, ElectionUnitResult>,
 *   totals: any,
 *   error: string | null
 * }>}
 */
export async function loadFirstRoundElectionData(office = "presidente", options = {}) {
  let defaultFetch = null;
  if (typeof fetch !== "undefined") {
    defaultFetch = fetch;
  }
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const theme = options.theme ?? "dark";
  const path = getFirstRoundOfficePath(office);

  if (!fetchImpl) {
    return {
      ok: false,
      office,
      description: "",
      candidates: [],
      palette: assignCandidateColors([], theme),
      municipalResults: {},
      totals: null,
      error: "Fetch implementation is unavailable",
    };
  }

  let rawData = firstRoundCache.get(path);
  if (!rawData) {
    try {
      const response = await fetchImpl(path);
      if (!response.ok) {
        return {
          ok: false,
          office,
          description: "",
          candidates: [],
          palette: assignCandidateColors([], theme),
          municipalResults: {},
          totals: null,
          error: `HTTP error ${response.status}`,
        };
      }
      rawData = await response.json();
      firstRoundCache.set(path, rawData);
    } catch (err) {
      return {
        ok: false,
        office,
        description: "",
        candidates: [],
        palette: assignCandidateColors([], theme),
        municipalResults: {},
        totals: null,
        error: String(err),
      };
    }
  }

  const rawCandidates = rawData.candidates ?? [];
  const candidateMap = new Map();
  const colorInputCandidates = [];

  for (let i = 0; i < rawCandidates.length; i += 1) {
    const item = rawCandidates[i];
    const ballotNumber = String(item[0]);
    const name = String(item[1] ?? ballotNumber);
    const party = String(item[2] ?? "");
    candidateMap.set(ballotNumber, { name, party });
    colorInputCandidates.push({
      ballotNumber,
      name,
      party,
      votes: 0,
      ledMunicipalities: 0,
    });
  }

  // Pre-count led municipalities to ensure deterministic colors
  const rows = rawData.rows ?? [];
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const votesArr = row[6] ?? [];
    let bestVotes = -1;
    let bestBallot = null;
    for (let v = 0; v < votesArr.length; v += 1) {
      const pair = votesArr[v];
      const count = Number(pair[1] ?? 0);
      if (count > bestVotes) {
        bestVotes = count;
        bestBallot = resolveBallotReference(pair[0], rawCandidates);
      }
    }
    if (bestBallot !== null) {
      const candObj = colorInputCandidates.find((c) => c.ballotNumber === bestBallot);
      if (candObj) {
        candObj.ledMunicipalities += 1;
      }
    }
  }

  const totals = normalizeFirstRoundTotals(rawData.totals, rawCandidates);
  const stateTotals = totals?.state?.votes ?? [];
  for (let s = 0; s < stateTotals.length; s += 1) {
    const sPair = stateTotals[s];
    const sBallot = String(sPair[0]);
    const sCount = Number(sPair[1] ?? 0);
    const candObj = colorInputCandidates.find((c) => c.ballotNumber === sBallot);
    if (candObj) {
      candObj.votes = sCount;
    }
  }

  const palette = assignCandidateColors(colorInputCandidates, theme);
  const colorLookup = palette.colorByBallotNumber;
  /** @type {Record<string, ElectionUnitResult>} */
  const municipalResults = {};

  const nameMap = new Map();
  if (Array.isArray(options.municipalities)) {
    for (let mIdx = 0; mIdx < options.municipalities.length; mIdx += 1) {
      const mItem = options.municipalities[mIdx];
      if (mItem?.code) {
        nameMap.set(String(mItem.code), String(mItem.name || mItem.code));
      }
    }
  }

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const code = String(row[0]);
    let munName = nameMap.get(code);
    if (!munName) {
      munName = code;
    }
    const validVotes = Number(row[1] ?? 0);
    const blankVotes = Number(row[2] ?? 0);
    const nullVotes = Number(row[3] ?? 0);
    const votesArr = row[6] ?? [];

    const unitCandidates = [];
    for (let v = 0; v < votesArr.length; v += 1) {
      const pair = votesArr[v];
      const ballotNumber = resolveBallotReference(pair[0], rawCandidates);
      const vCount = Number(pair[1] ?? 0);
      const meta = candidateMap.get(ballotNumber);
      unitCandidates.push({
        ballotNumber,
        name: meta?.name ?? ballotNumber,
        party: meta?.party ?? "",
        validVotes: vCount,
        votes: vCount,
      });
    }

    const unitResult = computeUnitElectionResult(
      {
        code,
        name: munName,
        validVotes,
        blankVotes,
        nullVotes,
        demais: Number(row[4] ?? 0),
        tenthPlaceVotes: Number(row[5] ?? 0),
        candidates: unitCandidates,
        sectionsCounted: 100,
        sectionsTotal: 100,
      },
      {
        mode: "first-round",
        theme,
        colorByBallotNumber: colorLookup,
      },
    );

    unitResult.name = munName;
    municipalResults[code] = unitResult;
  }

  return {
    ok: true,
    office,
    description: rawData.description ?? "",
    candidates: colorInputCandidates,
    palette,
    municipalResults,
    totals,
    error: null,
  };
}

/**
 * Loads second-round official consolidated election data (presidente 2t).
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   theme?: ThemeMode,
 *   municipalities?: readonly import("../domain/territory.js").MunicipalityRecord[]
 * }} [options={}]
 */
export async function loadSecondRoundElectionData(options = {}) {
  return loadFirstRoundElectionData("presidente-2t", options);
}

/**
 * Loads second-round replay or snapshot data and produces election unit results.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   theme?: ThemeMode,
 *   municipalities?: readonly import("../domain/territory.js").MunicipalityRecord[]
 * }} [options={}]
 * @returns {Promise<{
 *   ok: boolean,
 *   office: string,
 *   candidates: any[],
 *   palette: AssignedCandidatePalette,
 *   municipalResults: Record<string, ElectionUnitResult>,
 *   summary: any,
 *   error: string | null
 * }>}
 */
export async function loadSecondRoundReplayData(options = {}) {
  let defaultFetch = null;
  if (typeof fetch !== "undefined") {
    defaultFetch = fetch;
  }
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const theme = options.theme ?? "dark";
  const path = "./data/election/replay-presidente-2t.json";

  if (!fetchImpl) {
    return {
      ok: false,
      office: "presidente",
      candidates: [],
      palette: assignCandidateColors([], theme),
      municipalResults: {},
      summary: null,
      error: "Fetch implementation is unavailable",
    };
  }

  let rawData = secondRoundCache;
  if (!rawData) {
    try {
      const response = await fetchImpl(path);
      if (!response.ok) {
        return {
          ok: false,
          office: "presidente",
          candidates: [],
          palette: assignCandidateColors([], theme),
          municipalResults: {},
          summary: null,
          error: `HTTP error ${response.status}`,
        };
      }
      rawData = await response.json();
      secondRoundCache = rawData;
    } catch (err) {
      return {
        ok: false,
        office: "presidente",
        candidates: [],
        palette: assignCandidateColors([], theme),
        municipalResults: {},
        summary: null,
        error: String(err),
      };
    }
  }

  const rawCandidates = rawData.candidates ?? [
    { ballotNumber: "10", name: "Candidato Alfa", party: "PARTIDO-A" },
    { ballotNumber: "20", name: "Candidato Beta", party: "PARTIDO-B" },
  ];

  const colorCandidates = rawCandidates.map(
    (/** @type {{ ballotNumber: any; name: any; party: any; }} */ c, /** @type {number} */ idx) => {
      let votes = 10000000;
      let ledMunicipalities = 295;
      if (idx === 0) {
        votes = 12000000;
        ledMunicipalities = 350;
      }
      return {
        ballotNumber: String(c.ballotNumber ?? idx + 1),
        name: String(c.name ?? `Candidato ${idx + 1}`),
        party: String(c.party ?? `PARTIDO-${idx + 1}`),
        votes,
        ledMunicipalities,
      };
    },
  );

  const palette = assignCandidateColors(colorCandidates, theme);
  const colorLookup = palette.colorByBallotNumber;

  // Replay frame accumulation: compile all frames to get last known state per municipality
  const frames = rawData.frames ?? [];
  /** @type {Record<string, [string, number, number]>} */
  const accumulatedMuns = {};
  for (let f = 0; f < frames.length; f += 1) {
    const frame = frames[f];
    const muns = frame.muns ?? {};
    const munKeys = Object.keys(muns);
    for (let k = 0; k < munKeys.length; k += 1) {
      const code = munKeys[k];
      accumulatedMuns[code] = muns[code];
    }
  }

  /** @type {Record<string, ElectionUnitResult>} */
  const municipalResults = {};
  const accumulatedCodes = Object.keys(accumulatedMuns);

  const nameMap = new Map();
  if (Array.isArray(options.municipalities)) {
    for (let mIdx = 0; mIdx < options.municipalities.length; mIdx += 1) {
      const mItem = options.municipalities[mIdx];
      if (mItem?.code) {
        nameMap.set(String(mItem.code), String(mItem.name || mItem.code));
      }
    }
  }

  for (let i = 0; i < accumulatedCodes.length; i += 1) {
    const code = accumulatedCodes[i];
    let munName = nameMap.get(code);
    if (!munName) {
      munName = code;
    }
    const munData = accumulatedMuns[code];
    // munData format: [leaderBallot, marginPp, pctCounted]
    const leaderBallot = String(munData[0] ?? colorCandidates[0].ballotNumber);
    const marginPp = Number(munData[1] ?? 5.0);
    const pctCounted = Number(munData[2] ?? 100);

    const isFirstLeader = leaderBallot === colorCandidates[0].ballotNumber;
    let votes1 = 50000;
    let votes2 = 45000;
    if (!isFirstLeader) {
      votes1 = 45000;
      votes2 = 50000;
    }

    const unitCandidates = [
      {
        ballotNumber: colorCandidates[0].ballotNumber,
        name: colorCandidates[0].name,
        party: colorCandidates[0].party,
        validVotes: votes1,
        votes: votes1,
      },
      {
        ballotNumber: colorCandidates[1].ballotNumber,
        name: colorCandidates[1].name,
        party: colorCandidates[1].party,
        validVotes: votes2,
        votes: votes2,
      },
    ];

    const unitResult = computeUnitElectionResult(
      {
        code,
        name: munName,
        validVotes: votes1 + votes2,
        blankVotes: 1000,
        nullVotes: 1500,
        candidates: unitCandidates,
        sectionsCounted: pctCounted,
        sectionsTotal: 100,
      },
      {
        mode: "replay",
        theme,
        colorByBallotNumber: colorLookup,
      },
    );

    unitResult.name = munName;
    municipalResults[code] = unitResult;
  }

  return {
    ok: true,
    office: "presidente",
    candidates: colorCandidates,
    palette,
    municipalResults,
    summary: rawData.summary ?? null,
    error: null,
  };
}

/** @param {string | number} reference
 * @param {readonly (readonly [string, ...unknown[]])[]} candidates
 * @returns {string} */
function resolveBallotReference(reference, candidates) {
  if (typeof reference === "number" && candidates[reference])
    return String(candidates[reference][0]);
  return String(reference);
}
/** @typedef {{validVotes: number, blankVotes: number, nullVotes: number, demais: number, votes: [string | number, number][]}} CompactVoteTotals */
/** @param {{state?: CompactVoteTotals, ra?: Record<string, CompactVoteTotals>, rg?: Record<string, CompactVoteTotals>} | null | undefined} totals
 * @param {readonly (readonly [string, ...unknown[]])[]} candidates */
function normalizeFirstRoundTotals(totals, candidates) {
  if (!totals) return null;
  /** @param {CompactVoteTotals} unit */
  const normalize = (unit) => ({
    ...unit,
    votes: unit.votes.map(
      ([reference, votes]) =>
        /** @type {[string, number]} */ ([resolveBallotReference(reference, candidates), votes]),
    ),
  });
  /** @param {Record<string, CompactVoteTotals> | undefined} groups */
  const normalizeGroups = (groups) =>
    Object.fromEntries(Object.entries(groups ?? {}).map(([code, unit]) => [code, normalize(unit)]));
  let state;
  if (totals.state) state = normalize(totals.state);
  return { ...totals, state, ra: normalizeGroups(totals.ra), rg: normalizeGroups(totals.rg) };
}
