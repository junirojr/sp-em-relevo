import { assignCandidateColors, getElectionNeutrals, getPartyColor } from "./election-colors.js";
import { BASE_HEIGHT, DEFAULT_EXAGGERATION, DEFAULT_HEIGHT_GAIN } from "./height.js";

/**
 * Pure electoral domain: leader and margin over valid nominal votes (ELE-01),
 * tie and zero-vote states (ELE-02), regional aggregation by vote sum (ELE-03),
 * fixed 0-100 pp linear height scale with exaggeration (ELE-04, E32),
 * 50% sections threshold in live and replay modes (ELE-05, E31),
 * isolated per-municipality state update (ELE-06), deterministic candidate ordering
 * by ballot number and votes (ELE-11, E34), and deputy bounds certificate (TUR-04).
 *
 * @typedef {"first-round" | "live" | "replay"} ElectionRoundMode
 * @typedef {"leading" | "tie" | "no-result" | "uncertain-leader"} ElectionStatus
 * @typedef {"leading" | "tie" | "no-result" | "insufficient-sections" | "uncertain-leader"} ElectionVisualStatus
 * @typedef {import("./election-colors.js").ThemeMode} ThemeMode
 * @typedef {{
 *   ballotNumber: number | string,
 *   name?: string,
 *   party?: string,
 *   votes?: number,
 *   validVotes?: number,
 *   annulledSubJudice?: boolean,
 *   subJudice?: boolean,
 *   voteDestination?: string,
 *   destinacao?: string,
 *   status?: string
 * }} RawCandidateVote
 * @typedef {{
 *   ballotNumber: string,
 *   numericBallot: number,
 *   name: string,
 *   party: string,
 *   validVotes: number,
 *   votes: number,
 *   sharePct: number
 * }} NormalizedCandidateVote
 * @typedef {{
 *   code?: string,
 *   ibgeCode?: string,
 *   name?: string,
 *   candidates?: RawCandidateVote[],
 *   validVotes?: number,
 *   totalValidVotes?: number,
 *   blankVotes?: number,
 *   nullVotes?: number,
 *   annulledSubJudiceVotes?: number,
 *   otherVotes?: number,
 *   othersVotes?: number,
 *   demais?: number,
 *   tenthPlaceVotes?: number,
 *   sectionsCounted?: number,
 *   sectionsTotal?: number,
 *   pst?: number | string,
 *   electorate?: number,
 *   turnout?: number,
 *   abstentions?: number
 * }} ElectionUnitInput
 * @typedef {{
 *   mode?: ElectionRoundMode,
 *   theme?: ThemeMode,
 *   minHeight?: number,
 *   baseHeight?: number,
 *   maxHeight?: number,
 *   span?: number,
 *   gain?: number,
 *   exaggeration?: number,
 *   heightMode?: "data" | "flat",
 *   selectedCandidateBallot?: number | string | null,
 *   colorByBallotNumber?: Record<string, string>,
 *   neutralColorBelowThreshold?: boolean,
 *   isDeputyFreeSelection?: boolean
 * }} ElectionComputeOptions
 * @typedef {{
 *   ballotNumber: string,
 *   numericBallot: number,
 *   name: string,
 *   party: string,
 *   minVotes: number,
 *   maxVotes: number,
 *   minSharePct: number,
 *   maxSharePct: number,
 *   listedMunicipalities: number,
 *   unlistedMunicipalities: number
 * }} DeputyCandidateBounds
 * @typedef {{
 *   uncertainLeader: boolean,
 *   certified: boolean,
 *   leader: DeputyCandidateBounds | null,
 *   leadingContender: DeputyCandidateBounds | null,
 *   runnerUpMaxVotes: number,
 *   bounds: { minVotes: number, maxVotes: number, minSharePct: number, maxSharePct: number },
 *   candidates: DeputyCandidateBounds[],
 *   totalValidVotes: number,
 *   totalOtherVotes: number,
 *   colorKey: "candidate" | "others" | "noResult"
 * }} DeputyBoundsCertificate
 * @typedef {{
 *   code: string,
 *   name: string,
 *   status: ElectionStatus,
 *   visualStatus: ElectionVisualStatus,
 *   label: string,
 *   tieText: string | null,
 *   leader: NormalizedCandidateVote | null,
 *   runnerUp: NormalizedCandidateVote | null,
 *   tiedCandidates: NormalizedCandidateVote[],
 *   candidates: NormalizedCandidateVote[],
 *   candidatesByBallot: NormalizedCandidateVote[],
 *   totalValidVotes: number,
 *   blankVotes: number,
 *   nullVotes: number,
 *   annulledSubJudiceVotes: number,
 *   otherVotes: number,
 *   sectionsCounted: number,
 *   sectionsTotal: number,
 *   sectionsPct: number,
 *   belowSectionsThreshold: boolean,
 *   marginVotes: number,
 *   marginPp: number,
 *   selectedCandidateVotes: number | null,
 *   selectedCandidateSharePct: number | null,
 *   height: number,
 *   colorKey: "candidate" | "tie" | "noResult" | "others",
 *   color: string,
 *   leaderColor: string,
 *   thresholdNeutralColor: string,
 *   uncertainLeader: boolean,
 *   boundsCertificate: DeputyBoundsCertificate | null
 * }} ElectionUnitResult
 */

export const MIN_MARGIN_PP = 0;
export const MAX_MARGIN_PP = 100;
export const SECTIONS_THRESHOLD_PCT = 50;
export const SECTIONS_THRESHOLD_RATIO = 0.5;

/**
 * Computes candidate share percentage over total valid nominal votes (ELE-01).
 *
 * @param {number} candidateVotes
 * @param {number} totalValidVotes
 * @returns {number}
 */
export function computeCandidateSharePct(candidateVotes, totalValidVotes) {
  if (!Number.isFinite(candidateVotes) || !Number.isFinite(totalValidVotes)) {
    return 0;
  }
  if (totalValidVotes <= 0 || candidateVotes <= 0) {
    return 0;
  }
  return (candidateVotes / totalValidVotes) * 100;
}

/**
 * Computes leader margin in percentage points over total valid nominal votes (ELE-01).
 *
 * @param {number} firstVotes
 * @param {number} secondVotes
 * @param {number} totalValidVotes
 * @returns {number}
 */
export function computeMarginPp(firstVotes, secondVotes, totalValidVotes) {
  if (!Number.isFinite(firstVotes) || !Number.isFinite(secondVotes)) {
    return 0;
  }
  if (!Number.isFinite(totalValidVotes) || totalValidVotes <= 0) {
    return 0;
  }
  const diff = firstVotes - secondVotes;
  if (diff <= 0) {
    return 0;
  }
  return (diff / totalValidVotes) * 100;
}

/**
 * Formats the deterministic tie text required by ELE-02 ("Empate: N votos cada").
 *
 * @param {number} votes
 * @returns {string}
 */
export function formatTieText(votes) {
  const safeVotes = Math.max(0, Math.trunc(votes));
  return `Empate: ${safeVotes.toLocaleString("pt-BR")} votos cada`;
}

/**
 * Orders candidates strictly by ascending ballot number (ELE-11, E34).
 * Invariant to input permutation and across readings.
 *
 * @template {RawCandidateVote} T
 * @param {T[]} candidates
 * @returns {T[]}
 */
export function sortCandidatesByBallotNumber(candidates) {
  return [...candidates].sort((a, b) => compareRawBallotNumbers(a, b));
}

/**
 * Orders candidates by ascending ballot number when totalValidVotes === 0,
 * or by descending valid votes with ascending ballot number tie-break when
 * totalValidVotes > 0 (ELE-11, E34, ELE-02).
 *
 * @template {RawCandidateVote} T
 * @param {T[]} candidates
 * @param {number} [totalValidVotes]
 * @returns {T[]}
 */
export function sortCandidates(candidates, totalValidVotes) {
  const resolvedTotal = resolveCandidateListTotalVotes(candidates, totalValidVotes);
  if (resolvedTotal <= 0) {
    return sortCandidatesByBallotNumber(candidates);
  }
  return [...candidates].sort((a, b) => {
    const votesA = readCandidateRawVotes(a);
    const votesB = readCandidateRawVotes(b);
    if (votesB !== votesA) {
      return votesB - votesA;
    }
    return compareRawBallotNumbers(a, b);
  });
}

/**
 * Alias of sortCandidates for explicit vote-ranking semantics.
 *
 * @template {RawCandidateVote} T
 * @param {T[]} candidates
 * @param {number} [totalValidVotes]
 * @returns {T[]}
 */
export function sortCandidatesByVotes(candidates, totalValidVotes) {
  return sortCandidates(candidates, totalValidVotes);
}

/**
 * Maps a margin (0 to 100 pp) or candidate share (0 to 100%) to a continuous linear
 * height scale on the fixed domain [0, 100] without rescaling by observed maximum (ELE-04, E32).
 *
 * @param {number | null | undefined} marginOrSharePp
 * @param {ElectionComputeOptions} [options]
 * @returns {number}
 */
export function computeElectionHeight(marginOrSharePp, options = {}) {
  const minHeight = resolveMinHeight(options);
  if (options.heightMode === "flat") {
    return minHeight;
  }
  if (
    marginOrSharePp === null ||
    marginOrSharePp === undefined ||
    !Number.isFinite(marginOrSharePp) ||
    marginOrSharePp <= MIN_MARGIN_PP
  ) {
    return minHeight;
  }
  const clamped = Math.min(MAX_MARGIN_PP, Math.max(MIN_MARGIN_PP, marginOrSharePp));
  const span = resolveElectionElevationSpan(minHeight, options);
  return minHeight + span * (clamped / MAX_MARGIN_PP);
}

/**
 * Determines whether a unit has fewer than 50% of its polling sections counted
 * in live or replay mode (ELE-05, E31). First-round mode has no threshold.
 *
 * @param {{
 *   sectionsCounted?: number,
 *   sectionsTotal?: number,
 *   pst?: number | string,
 *   mode?: ElectionRoundMode
 * }} input
 * @returns {boolean}
 */
export function isBelowSectionsThreshold(input) {
  const mode = input.mode ?? "first-round";
  if (mode === "first-round") {
    return false;
  }
  const pct = computeSectionsPct(input.sectionsCounted, input.sectionsTotal, input.pst);
  return pct < SECTIONS_THRESHOLD_PCT;
}

/**
 * Computes the complete election result for a single territorial unit (ELE-01, ELE-02,
 * ELE-04, ELE-05, ELE-11).
 *
 * @param {ElectionUnitInput} unit
 * @param {ElectionComputeOptions} [options]
 * @returns {ElectionUnitResult}
 */
export function computeUnitElectionResult(unit, options = {}) {
  const code = String(unit.ibgeCode ?? unit.code ?? "");
  const name = String(unit.name ?? code);
  const mode = options.mode ?? "first-round";
  const theme = options.theme ?? "dark";
  const neutrals = getElectionNeutrals(theme);
  const minHeight = resolveMinHeight(options);

  const rawCandidates = unit.candidates ?? [];
  /** @type {RawCandidateVote[]} */
  const validCandidateInputs = [];
  let annulledFromCandidates = 0;

  for (const cand of rawCandidates) {
    if (isAnnulledSubJudice(cand)) {
      annulledFromCandidates += readCandidateRawVotes(cand);
      continue;
    }
    validCandidateInputs.push(cand);
  }

  const otherVotes = Math.max(0, unit.otherVotes ?? unit.othersVotes ?? unit.demais ?? 0);
  let summedNominalVotes = otherVotes;
  for (const cand of validCandidateInputs) {
    summedNominalVotes += readCandidateRawVotes(cand);
  }

  const totalValidVotes = resolveTotalValidVotes(
    unit.totalValidVotes ?? unit.validVotes,
    summedNominalVotes,
    annulledFromCandidates,
  );
  const blankVotes = Math.max(0, unit.blankVotes ?? 0);
  const nullVotes = Math.max(0, unit.nullVotes ?? 0);
  const annulledSubJudiceVotes = Math.max(
    annulledFromCandidates,
    unit.annulledSubJudiceVotes ?? 0,
  );

  const sectionsTotal = Math.max(0, unit.sectionsTotal ?? 0);
  const sectionsCounted = Math.max(0, unit.sectionsCounted ?? 0);
  const sectionsPct = computeSectionsPct(sectionsCounted, sectionsTotal, unit.pst);
  const belowThreshold = isBelowSectionsThreshold({
    sectionsCounted,
    sectionsTotal,
    pst: unit.pst,
    mode,
  });

  const sortedByBallotRaw = sortCandidatesByBallotNumber(validCandidateInputs);
  const candidatesByBallot = sortedByBallotRaw.map((cand) =>
    toNormalizedCandidate(cand, totalValidVotes),
  );
  const sortedByVotesRaw = sortCandidates(validCandidateInputs, totalValidVotes);
  const candidates = sortedByVotesRaw.map((cand) =>
    toNormalizedCandidate(cand, totalValidVotes),
  );

  const selectedInspection = resolveSelectedCandidateInspection(
    candidatesByBallot,
    totalValidVotes,
    options.selectedCandidateBallot,
  );

  if (totalValidVotes <= 0 || candidates.length === 0) {
    return {
      code,
      name,
      status: "no-result",
      visualStatus: "no-result",
      label: "Sem votos apurados",
      tieText: null,
      leader: null,
      runnerUp: null,
      tiedCandidates: [],
      candidates,
      candidatesByBallot,
      totalValidVotes: 0,
      blankVotes,
      nullVotes,
      annulledSubJudiceVotes,
      otherVotes,
      sectionsCounted,
      sectionsTotal,
      sectionsPct,
      belowSectionsThreshold: belowThreshold,
      marginVotes: 0,
      marginPp: 0,
      selectedCandidateVotes: selectedInspection.votes,
      selectedCandidateSharePct: selectedInspection.sharePct,
      height: minHeight,
      colorKey: "noResult",
      color: neutrals.noResult,
      leaderColor: neutrals.noResult,
      thresholdNeutralColor: neutrals.noResult,
      uncertainLeader: false,
      boundsCertificate: null,
    };
  }

  const first = candidates[0];
  const second = candidates[1] ?? null;
  const firstVotes = first.validVotes;
  const secondVotes = second?.validVotes ?? 0;

  if (firstVotes <= 0) {
    return {
      code,
      name,
      status: "no-result",
      visualStatus: "no-result",
      label: "Sem votos apurados",
      tieText: null,
      leader: null,
      runnerUp: null,
      tiedCandidates: [],
      candidates,
      candidatesByBallot,
      totalValidVotes,
      blankVotes,
      nullVotes,
      annulledSubJudiceVotes,
      otherVotes,
      sectionsCounted,
      sectionsTotal,
      sectionsPct,
      belowSectionsThreshold: belowThreshold,
      marginVotes: 0,
      marginPp: 0,
      selectedCandidateVotes: selectedInspection.votes,
      selectedCandidateSharePct: selectedInspection.sharePct,
      height: minHeight,
      colorKey: "noResult",
      color: neutrals.noResult,
      leaderColor: neutrals.noResult,
      thresholdNeutralColor: neutrals.noResult,
      uncertainLeader: false,
      boundsCertificate: null,
    };
  }

  if (second !== null && firstVotes === secondVotes) {
    const tiedCandidates = candidates.filter((c) => c.validVotes === firstVotes);
    const visualStatus = resolveTieVisualStatus(belowThreshold);
    return {
      code,
      name,
      status: "tie",
      visualStatus,
      label: "Empate",
      tieText: formatTieText(firstVotes),
      leader: null,
      runnerUp: second,
      tiedCandidates,
      candidates,
      candidatesByBallot,
      totalValidVotes,
      blankVotes,
      nullVotes,
      annulledSubJudiceVotes,
      otherVotes,
      sectionsCounted,
      sectionsTotal,
      sectionsPct,
      belowSectionsThreshold: belowThreshold,
      marginVotes: 0,
      marginPp: 0,
      selectedCandidateVotes: selectedInspection.votes,
      selectedCandidateSharePct: selectedInspection.sharePct,
      height: minHeight,
      colorKey: "tie",
      color: neutrals.tie,
      leaderColor: neutrals.tie,
      thresholdNeutralColor: neutrals.noResult,
      uncertainLeader: false,
      boundsCertificate: null,
    };
  }

  const marginVotes = firstVotes - secondVotes;
  const marginPp = computeMarginPp(firstVotes, secondVotes, totalValidVotes);
  const metricForHeight = resolveHeightMetric(marginPp, selectedInspection.sharePct);
  const rawHeight = computeElectionHeight(metricForHeight, options);
  const height = resolveThresholdHeight(rawHeight, minHeight, belowThreshold);
  const visualStatus = resolveLeadingVisualStatus(belowThreshold);
  const leaderColor = resolveCandidateHexColor(first, theme, options.colorByBallotNumber);
  const isOthersLeader = leaderColor === neutrals.others;
  const colorKey = resolveLeadingColorKey(
    isOthersLeader,
    belowThreshold,
    options.neutralColorBelowThreshold,
  );
  const activeColor = resolveActiveLeadingColor(
    leaderColor,
    neutrals.noResult,
    belowThreshold,
    options.neutralColorBelowThreshold,
  );

  return {
    code,
    name,
    status: "leading",
    visualStatus,
    label: first.name,
    tieText: null,
    leader: first,
    runnerUp: second,
    tiedCandidates: [],
    candidates,
    candidatesByBallot,
    totalValidVotes,
    blankVotes,
    nullVotes,
    annulledSubJudiceVotes,
    otherVotes,
    sectionsCounted,
    sectionsTotal,
    sectionsPct,
    belowSectionsThreshold: belowThreshold,
    marginVotes,
    marginPp,
    selectedCandidateVotes: selectedInspection.votes,
    selectedCandidateSharePct: selectedInspection.sharePct,
    height,
    colorKey,
    color: activeColor,
    leaderColor,
    thresholdNeutralColor: neutrals.noResult,
    uncertainLeader: false,
    boundsCertificate: null,
  };
}

/**
 * Aggregates multiple election units (municipalities in an RA, RG, multi-selection,
 * or whole State) by summing valid nominal votes per candidate and total valid votes,
 * recalculating leader, shares, and margin from the sum (ELE-03, TUR-04).
 * Never averages percentages or margins, and never picks the leader by municipality count.
 *
 * @param {ElectionUnitInput[]} units
 * @param {ElectionComputeOptions & { code?: string, name?: string }} [options]
 * @returns {ElectionUnitResult & {
 *   memberCount: number,
 *   ledMunicipalitiesByBallot: Record<string, number>
 * }}
 */
export function aggregateElectionUnits(units, options = {}) {
  const code = options.code ?? "aggregate";
  const name = options.name ?? "Conjunto agregado";

  /** @type {Map<string, { ballotNumber: string, name: string, party: string, validVotes: number }>} */
  const candidateSums = new Map();
  /** @type {Record<string, number>} */
  const ledMunicipalitiesByBallot = {};

  let totalValidVotes = 0;
  let blankVotes = 0;
  let nullVotes = 0;
  let annulledSubJudiceVotes = 0;
  let otherVotes = 0;
  let sectionsCounted = 0;
  let sectionsTotal = 0;
  let electorate = 0;
  let turnout = 0;
  let abstentions = 0;
  let hasTruncatedTopList = Boolean(options.isDeputyFreeSelection);

  for (const unit of units) {
    const unitResult = computeUnitElectionResult(unit, {
      ...options,
      mode: "first-round",
    });
    if (unitResult.leader) {
      const prevCount = ledMunicipalitiesByBallot[unitResult.leader.ballotNumber] ?? 0;
      ledMunicipalitiesByBallot[unitResult.leader.ballotNumber] = prevCount + 1;
    }

    totalValidVotes += unitResult.totalValidVotes;
    blankVotes += unitResult.blankVotes;
    nullVotes += unitResult.nullVotes;
    annulledSubJudiceVotes += unitResult.annulledSubJudiceVotes;
    otherVotes += unitResult.otherVotes;
    sectionsCounted += unitResult.sectionsCounted;
    sectionsTotal += unitResult.sectionsTotal;
    electorate += Math.max(0, unit.electorate ?? 0);
    turnout += Math.max(0, unit.turnout ?? 0);
    abstentions += Math.max(0, unit.abstentions ?? 0);

    if (unitResult.otherVotes > 0 || unit.tenthPlaceVotes !== undefined) {
      hasTruncatedTopList = true;
    }

    for (const cand of unitResult.candidatesByBallot) {
      const existing = candidateSums.get(cand.ballotNumber);
      if (existing) {
        existing.validVotes += cand.validVotes;
        continue;
      }
      candidateSums.set(cand.ballotNumber, {
        ballotNumber: cand.ballotNumber,
        name: cand.name,
        party: cand.party,
        validVotes: cand.validVotes,
      });
    }
  }

  const aggregatedCandidates = Array.from(candidateSums.values()).map((c) => ({
    ballotNumber: c.ballotNumber,
    name: c.name,
    party: c.party,
    validVotes: c.validVotes,
    votes: c.validVotes,
  }));

  const baseResult = computeUnitElectionResult(
    {
      code,
      name,
      candidates: aggregatedCandidates,
      totalValidVotes,
      blankVotes,
      nullVotes,
      annulledSubJudiceVotes,
      otherVotes,
      sectionsCounted,
      sectionsTotal,
      electorate,
      turnout,
      abstentions,
    },
    options,
  );

  if (!hasTruncatedTopList || units.length <= 1) {
    return {
      ...baseResult,
      memberCount: units.length,
      ledMunicipalitiesByBallot,
    };
  }

  const certificate = computeDeputyBoundsCertificate(units);
  if (!certificate.uncertainLeader) {
    return {
      ...baseResult,
      uncertainLeader: false,
      boundsCertificate: certificate,
      memberCount: units.length,
      ledMunicipalitiesByBallot,
    };
  }

  const theme = options.theme ?? "dark";
  const neutrals = getElectionNeutrals(theme);
  const minHeight = resolveMinHeight(options);

  return {
    ...baseResult,
    status: "uncertain-leader",
    visualStatus: "uncertain-leader",
    label: "Lideranca indefinida (intervalo sobreposto)",
    leader: null,
    height: minHeight,
    colorKey: "others",
    color: neutrals.others,
    leaderColor: neutrals.others,
    uncertainLeader: true,
    boundsCertificate: certificate,
    memberCount: units.length,
    ledMunicipalitiesByBallot,
  };
}

/**
 * Computes the exact bounds certificate [minVotes, maxVotes] for deputy candidates
 * across a collection of municipalities where each municipality provides its top-10
 * listed candidates and "otherVotes" ("demais") (TUR-04).
 *
 * For each candidate c:
 *   minVotes = sum of listed votes in municipalities where c appears in top-10
 *   maxVotes = minVotes + sum(min(tenthPlaceVotes[m], remainingOtherVotes[m]))
 *              over municipalities m where c does NOT appear in top-10.
 *
 * The leader is certified exact iff the candidate with the highest minVotes has
 * minVotes > maxVotes of every other candidate.
 *
 * @param {ElectionUnitInput[]} units
 * @returns {DeputyBoundsCertificate}
 */
export function computeDeputyBoundsCertificate(units) {
  /**
   * @type {Map<string, {
   *   ballotNumber: string,
   *   numericBallot: number,
   *   name: string,
   *   party: string,
   *   minVotes: number,
   *   presentInUnits: Set<number>
   * }>}
   */
  const candidateMap = new Map();
  /** @type {number[]} */
  const maxUnlistedPerUnit = [];
  let totalValidVotes = 0;
  let totalOtherVotes = 0;

  for (let uIndex = 0; uIndex < units.length; uIndex += 1) {
    const unit = units[uIndex];
    const rawCandidates = (unit.candidates ?? []).filter((c) => !isAnnulledSubJudice(c));
    let listedSum = 0;
    let minListedVotes = Number.POSITIVE_INFINITY;

    for (const rawCand of rawCandidates) {
      const votes = readCandidateRawVotes(rawCand);
      listedSum += votes;
      if (votes < minListedVotes) {
        minListedVotes = votes;
      }
      const ballotStr = String(rawCand.ballotNumber ?? "").trim();
      const existing = candidateMap.get(ballotStr);
      if (existing) {
        existing.minVotes += votes;
        existing.presentInUnits.add(uIndex);
        continue;
      }
      candidateMap.set(ballotStr, {
        ballotNumber: ballotStr,
        numericBallot: parseBallotNumber(ballotStr),
        name: String(rawCand.name ?? ballotStr),
        party: String(rawCand.party ?? ""),
        minVotes: votes,
        presentInUnits: new Set([uIndex]),
      });
    }

    const explicitOther = unit.otherVotes ?? unit.othersVotes ?? unit.demais;
    const explicitTotal = unit.totalValidVotes ?? unit.validVotes;
    const remainingOther = resolveRemainingOtherVotes(explicitOther, explicitTotal, listedSum);
    const tenthPlaceVotes = resolveTenthPlaceVotes(
      unit.tenthPlaceVotes,
      minListedVotes,
      rawCandidates.length,
      remainingOther,
    );
    const unitCap = Math.max(0, Math.min(tenthPlaceVotes, remainingOther));
    maxUnlistedPerUnit.push(unitCap);

    totalOtherVotes += remainingOther;
    totalValidVotes += resolveUnitTotalForBounds(explicitTotal, listedSum, remainingOther);
  }

  /** @type {DeputyCandidateBounds[]} */
  const candidateBounds = [];
  for (const entry of candidateMap.values()) {
    let extraPossibleVotes = 0;
    let unlistedCount = 0;
    for (let uIndex = 0; uIndex < units.length; uIndex += 1) {
      if (!entry.presentInUnits.has(uIndex)) {
        extraPossibleVotes += maxUnlistedPerUnit[uIndex];
        unlistedCount += 1;
      }
    }
    const maxVotes = entry.minVotes + extraPossibleVotes;
    candidateBounds.push({
      ballotNumber: entry.ballotNumber,
      numericBallot: entry.numericBallot,
      name: entry.name,
      party: entry.party,
      minVotes: entry.minVotes,
      maxVotes,
      minSharePct: computeCandidateSharePct(entry.minVotes, totalValidVotes),
      maxSharePct: computeCandidateSharePct(maxVotes, totalValidVotes),
      listedMunicipalities: entry.presentInUnits.size,
      unlistedMunicipalities: unlistedCount,
    });
  }

  candidateBounds.sort((a, b) => {
    if (b.minVotes !== a.minVotes) {
      return b.minVotes - a.minVotes;
    }
    if (b.maxVotes !== a.maxVotes) {
      return b.maxVotes - a.maxVotes;
    }
    if (a.numericBallot !== b.numericBallot) {
      return a.numericBallot - b.numericBallot;
    }
    return a.ballotNumber.localeCompare(b.ballotNumber);
  });

  if (candidateBounds.length === 0 || totalValidVotes <= 0) {
    return {
      uncertainLeader: true,
      certified: false,
      leader: null,
      leadingContender: null,
      runnerUpMaxVotes: 0,
      bounds: { minVotes: 0, maxVotes: 0, minSharePct: 0, maxSharePct: 0 },
      candidates: [],
      totalValidVotes: 0,
      totalOtherVotes,
      colorKey: "noResult",
    };
  }

  const topContender = candidateBounds[0];
  let maxOtherCandidateVotes = 0;
  for (let i = 1; i < candidateBounds.length; i += 1) {
    if (candidateBounds[i].maxVotes > maxOtherCandidateVotes) {
      maxOtherCandidateVotes = candidateBounds[i].maxVotes;
    }
  }

  if (candidateBounds.length === 1) {
    let maxHypotheticalUnlisted = 0;
    for (const cap of maxUnlistedPerUnit) {
      maxHypotheticalUnlisted += cap;
    }
    maxOtherCandidateVotes = maxHypotheticalUnlisted;
  }

  const isCertified = topContender.minVotes > maxOtherCandidateVotes;
  const certifiedLeader = resolveCertifiedLeader(topContender, isCertified);
  const colorKey = resolveCertificateColorKey(isCertified);

  return {
    uncertainLeader: !isCertified,
    certified: isCertified,
    leader: certifiedLeader,
    leadingContender: topContender,
    runnerUpMaxVotes: maxOtherCandidateVotes,
    bounds: {
      minVotes: topContender.minVotes,
      maxVotes: topContender.maxVotes,
      minSharePct: topContender.minSharePct,
      maxSharePct: topContender.maxSharePct,
    },
    candidates: candidateBounds,
    totalValidVotes,
    totalOtherVotes,
    colorKey,
  };
}

/**
 * Pure incremental update for a single municipality in the state dictionary/map (ELE-06).
 * Produces a new state container updating only `ibgeCode` without mutating or
 * recalculating any of the other 644 municipalities.
 *
 * @param {{
 *   municipalities: Record<string, ElectionUnitResult>,
 *   colorsByCode?: Record<string, string>,
 *   heightsByCode?: Record<string, number>
 * }} state
 * @param {string} ibgeCode
 * @param {ElectionUnitInput | ElectionUnitResult} municipalityUpdate
 * @param {ElectionComputeOptions} [options]
 * @returns {{
 *   municipalities: Record<string, ElectionUnitResult>,
 *   colorsByCode: Record<string, string>,
 *   heightsByCode: Record<string, number>,
 *   changed: boolean,
 *   updatedCode: string
 * }}
 */
export function applyMunicipalityUpdate(state, ibgeCode, municipalityUpdate, options = {}) {
  const code = String(ibgeCode);
  const nextUnitResult = toUnitResult(code, municipalityUpdate, options);
  const previousResult = state.municipalities[code];

  const prevColors = state.colorsByCode ?? {};
  const prevHeights = state.heightsByCode ?? {};

  if (previousResult && isSameUnitVisualAndVotes(previousResult, nextUnitResult)) {
    return {
      municipalities: state.municipalities,
      colorsByCode: prevColors,
      heightsByCode: prevHeights,
      changed: false,
      updatedCode: code,
    };
  }

  const nextMunicipalities = {
    ...state.municipalities,
    [code]: nextUnitResult,
  };
  const nextColors = {
    ...prevColors,
    [code]: nextUnitResult.color,
  };
  const nextHeights = {
    ...prevHeights,
    [code]: nextUnitResult.height,
  };

  return {
    municipalities: nextMunicipalities,
    colorsByCode: nextColors,
    heightsByCode: nextHeights,
    changed: true,
    updatedCode: code,
  };
}

/**
 * Builds an initial election map state from an array of municipality inputs,
 * assigning up to 8 candidate colors according to E25 / TUR-05.
 *
 * @param {ElectionUnitInput[]} municipalities
 * @param {ElectionComputeOptions} [options]
 */
export function buildElectionMapState(municipalities, options = {}) {
  const theme = options.theme ?? "dark";
  const stateAggregate = aggregateElectionUnits(municipalities, {
    ...options,
    code: "35",
    name: "Sao Paulo",
  });

  const paletteCandidates = stateAggregate.candidates.map((cand) => ({
    ballotNumber: cand.ballotNumber,
    name: cand.name,
    party: cand.party,
    votes: cand.validVotes,
    ledMunicipalities: stateAggregate.ledMunicipalitiesByBallot[cand.ballotNumber] ?? 0,
  }));

  const assignedPalette = assignCandidateColors(paletteCandidates, theme, {
    unlistedOthersVotes: stateAggregate.otherVotes,
  });

  const resolvedColorMap = options.colorByBallotNumber ?? assignedPalette.colorByBallotNumber;
  /** @type {Record<string, ElectionUnitResult>} */
  const byCode = {};
  /** @type {Record<string, string>} */
  const colorsByCode = {};
  /** @type {Record<string, number>} */
  const heightsByCode = {};

  for (const mun of municipalities) {
    const res = computeUnitElectionResult(mun, {
      ...options,
      colorByBallotNumber: resolvedColorMap,
    });
    byCode[res.code] = res;
    colorsByCode[res.code] = res.color;
    heightsByCode[res.code] = res.height;
  }

  return {
    municipalities: byCode,
    colorsByCode,
    heightsByCode,
    palette: assignedPalette,
    stateAggregate,
  };
}

/**
 * Checks whether a candidate entry is marked as "Anulado sub judice" (ELE-01, TUR-01).
 *
 * @param {RawCandidateVote} candidate
 * @returns {boolean}
 */
export function isAnnulledSubJudice(candidate) {
  if (candidate.annulledSubJudice === true || candidate.subJudice === true) {
    return true;
  }
  const dest = String(
    candidate.voteDestination ?? candidate.destinacao ?? candidate.status ?? "",
  ).toLowerCase();
  return dest.includes("anulado sub judice") || dest.includes("anulado-sub-judice");
}

/**
 * @param {RawCandidateVote} candidate
 * @returns {number}
 */
function readCandidateRawVotes(candidate) {
  const raw = candidate.validVotes ?? candidate.votes ?? 0;
  if (!Number.isFinite(raw) || raw < 0) {
    return 0;
  }
  return raw;
}

/**
 * @param {RawCandidateVote[]} candidates
 * @param {number | undefined} explicitTotal
 * @returns {number}
 */
function resolveCandidateListTotalVotes(candidates, explicitTotal) {
  if (explicitTotal !== undefined && Number.isFinite(explicitTotal)) {
    return Math.max(0, explicitTotal);
  }
  let sum = 0;
  for (const cand of candidates) {
    if (!isAnnulledSubJudice(cand)) {
      sum += readCandidateRawVotes(cand);
    }
  }
  return sum;
}

/**
 * @param {RawCandidateVote} a
 * @param {RawCandidateVote} b
 * @returns {number}
 */
function compareRawBallotNumbers(a, b) {
  const strA = String(a.ballotNumber ?? "").trim();
  const strB = String(b.ballotNumber ?? "").trim();
  const numA = parseBallotNumber(strA);
  const numB = parseBallotNumber(strB);
  if (numA !== numB) {
    return numA - numB;
  }
  return strA.localeCompare(strB);
}

/**
 * @param {string} ballotStr
 * @returns {number}
 */
function parseBallotNumber(ballotStr) {
  const parsed = Number.parseInt(ballotStr, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * @param {RawCandidateVote} cand
 * @param {number} totalValidVotes
 * @returns {NormalizedCandidateVote}
 */
function toNormalizedCandidate(cand, totalValidVotes) {
  const ballotNumber = String(cand.ballotNumber ?? "").trim();
  const numericBallot = parseBallotNumber(ballotNumber);
  const validVotes = readCandidateRawVotes(cand);
  return {
    ballotNumber,
    numericBallot,
    name: String(cand.name ?? ballotNumber),
    party: String(cand.party ?? ""),
    validVotes,
    votes: validVotes,
    sharePct: computeCandidateSharePct(validVotes, totalValidVotes),
  };
}

/**
 * @param {number | undefined} explicitTotal
 * @param {number} summedNominalVotes
 * @param {number} annulledVotes
 * @returns {number}
 */
function resolveTotalValidVotes(explicitTotal, summedNominalVotes, annulledVotes) {
  if (explicitTotal === undefined || !Number.isFinite(explicitTotal) || explicitTotal <= 0) {
    return summedNominalVotes;
  }
  if (annulledVotes > 0 && explicitTotal === summedNominalVotes + annulledVotes) {
    return summedNominalVotes;
  }
  return Math.max(summedNominalVotes, explicitTotal);
}

/**
 * @param {number | undefined} sectionsCounted
 * @param {number | undefined} sectionsTotal
 * @param {number | string | undefined} pst
 * @returns {number}
 */
function computeSectionsPct(sectionsCounted, sectionsTotal, pst) {
  if (
    sectionsTotal !== undefined &&
    sectionsCounted !== undefined &&
    Number.isFinite(sectionsTotal) &&
    sectionsTotal > 0
  ) {
    const ratio = Math.max(0, sectionsCounted) / sectionsTotal;
    return Math.min(100, ratio * 100);
  }
  if (pst !== undefined) {
    const normalizedPst = String(pst).replace(",", ".").trim();
    const parsed = Number.parseFloat(normalizedPst);
    if (Number.isFinite(parsed)) {
      return Math.min(100, Math.max(0, parsed));
    }
  }
  return 100;
}

/**
 * @param {ElectionComputeOptions} options
 * @returns {number}
 */
function resolveMinHeight(options) {
  if (options.minHeight !== undefined && Number.isFinite(options.minHeight)) {
    return options.minHeight;
  }
  if (options.baseHeight !== undefined && Number.isFinite(options.baseHeight)) {
    return options.baseHeight;
  }
  return BASE_HEIGHT;
}

/**
 * @param {number} minHeight
 * @param {ElectionComputeOptions} options
 * @returns {number}
 */
function resolveElectionElevationSpan(minHeight, options) {
  if (options.span !== undefined && Number.isFinite(options.span)) {
    const ex = resolveNumericOption(options.exaggeration, 1);
    return options.span * ex;
  }
  if (options.maxHeight !== undefined && Number.isFinite(options.maxHeight)) {
    const ex = resolveNumericOption(options.exaggeration, 1);
    if (minHeight === 0) {
      return options.maxHeight * ex;
    }
    return (options.maxHeight - minHeight) * ex;
  }
  const gain = resolveNumericOption(options.gain, DEFAULT_HEIGHT_GAIN);
  const exaggeration = resolveNumericOption(options.exaggeration, DEFAULT_EXAGGERATION);
  return gain * exaggeration;
}

/**
 * @param {number | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function resolveNumericOption(value, fallback) {
  if (value !== undefined && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

/**
 * @param {NormalizedCandidateVote[]} candidatesByBallot
 * @param {number} totalValidVotes
 * @param {number | string | null | undefined} selectedCandidateBallot
 * @returns {{ votes: number | null, sharePct: number | null }}
 */
function resolveSelectedCandidateInspection(
  candidatesByBallot,
  totalValidVotes,
  selectedCandidateBallot,
) {
  if (selectedCandidateBallot === undefined || selectedCandidateBallot === null) {
    return { votes: null, sharePct: null };
  }
  const targetBallot = String(selectedCandidateBallot).trim();
  const found = candidatesByBallot.find((c) => c.ballotNumber === targetBallot);
  const votes = found?.validVotes ?? 0;
  return {
    votes,
    sharePct: computeCandidateSharePct(votes, totalValidVotes),
  };
}

/**
 * @param {number} marginPp
 * @param {number | null} selectedSharePct
 * @returns {number}
 */
function resolveHeightMetric(marginPp, selectedSharePct) {
  if (selectedSharePct !== null) {
    return selectedSharePct;
  }
  return marginPp;
}

/**
 * @param {number} rawHeight
 * @param {number} minHeight
 * @param {boolean} belowThreshold
 * @returns {number}
 */
function resolveThresholdHeight(rawHeight, minHeight, belowThreshold) {
  if (belowThreshold) {
    return minHeight;
  }
  return rawHeight;
}

/**
 * @param {boolean} belowThreshold
 * @returns {ElectionVisualStatus}
 */
function resolveTieVisualStatus(belowThreshold) {
  if (belowThreshold) {
    return "insufficient-sections";
  }
  return "tie";
}

/**
 * @param {boolean} belowThreshold
 * @returns {ElectionVisualStatus}
 */
function resolveLeadingVisualStatus(belowThreshold) {
  if (belowThreshold) {
    return "insufficient-sections";
  }
  return "leading";
}

/**
 * @param {NormalizedCandidateVote} leader
 * @param {ThemeMode} theme
 * @param {Record<string, string> | undefined} colorByBallotNumber
 * @returns {string}
 */
function resolveCandidateHexColor(leader, theme, colorByBallotNumber) {
  if (colorByBallotNumber && colorByBallotNumber[leader.ballotNumber]) {
    return colorByBallotNumber[leader.ballotNumber];
  }
  return getPartyColor(leader.party, theme);
}

/**
 * @param {boolean} isOthersLeader
 * @param {boolean} belowThreshold
 * @param {boolean | undefined} neutralColorBelowThreshold
 * @returns {"candidate" | "others" | "noResult"}
 */
function resolveLeadingColorKey(isOthersLeader, belowThreshold, neutralColorBelowThreshold) {
  if (belowThreshold && neutralColorBelowThreshold) {
    return "noResult";
  }
  if (isOthersLeader) {
    return "others";
  }
  return "candidate";
}

/**
 * @param {string} leaderColor
 * @param {string} noResultColor
 * @param {boolean} belowThreshold
 * @param {boolean | undefined} neutralColorBelowThreshold
 * @returns {string}
 */
function resolveActiveLeadingColor(
  leaderColor,
  noResultColor,
  belowThreshold,
  neutralColorBelowThreshold,
) {
  if (belowThreshold && neutralColorBelowThreshold) {
    return noResultColor;
  }
  return leaderColor;
}

/**
 * @param {number | undefined} explicitOther
 * @param {number | undefined} explicitTotal
 * @param {number} listedSum
 * @returns {number}
 */
function resolveRemainingOtherVotes(explicitOther, explicitTotal, listedSum) {
  if (explicitOther !== undefined && Number.isFinite(explicitOther)) {
    return Math.max(0, explicitOther);
  }
  if (explicitTotal !== undefined && Number.isFinite(explicitTotal)) {
    return Math.max(0, explicitTotal - listedSum);
  }
  return 0;
}

/**
 * @param {number | undefined} explicitTenth
 * @param {number} minListedVotes
 * @param {number} listedCount
 * @param {number} remainingOther
 * @returns {number}
 */
function resolveTenthPlaceVotes(explicitTenth, minListedVotes, listedCount, remainingOther) {
  if (explicitTenth !== undefined && Number.isFinite(explicitTenth)) {
    return Math.max(0, explicitTenth);
  }
  if (listedCount > 0 && Number.isFinite(minListedVotes)) {
    return Math.max(0, minListedVotes);
  }
  return remainingOther;
}

/**
 * @param {number | undefined} explicitTotal
 * @param {number} listedSum
 * @param {number} remainingOther
 * @returns {number}
 */
function resolveUnitTotalForBounds(explicitTotal, listedSum, remainingOther) {
  if (explicitTotal !== undefined && Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return Math.max(listedSum + remainingOther, explicitTotal);
  }
  return listedSum + remainingOther;
}

/**
 * @param {DeputyCandidateBounds} topContender
 * @param {boolean} isCertified
 * @returns {DeputyCandidateBounds | null}
 */
function resolveCertifiedLeader(topContender, isCertified) {
  if (isCertified) {
    return topContender;
  }
  return null;
}

/**
 * @param {boolean} isCertified
 * @returns {"candidate" | "others"}
 */
function resolveCertificateColorKey(isCertified) {
  if (isCertified) {
    return "candidate";
  }
  return "others";
}

/**
 * @param {string} code
 * @param {ElectionUnitInput | ElectionUnitResult} input
 * @param {ElectionComputeOptions} options
 * @returns {ElectionUnitResult}
 */
function toUnitResult(code, input, options) {
  if ("visualStatus" in input && "candidatesByBallot" in input) {
    return input;
  }
  return computeUnitElectionResult({ ...input, code }, options);
}

/**
 * @param {ElectionUnitResult} a
 * @param {ElectionUnitResult} b
 * @returns {boolean}
 */
function isSameUnitVisualAndVotes(a, b) {
  if (a.totalValidVotes !== b.totalValidVotes) {
    return false;
  }
  if (a.sectionsCounted !== b.sectionsCounted || a.sectionsTotal !== b.sectionsTotal) {
    return false;
  }
  if (a.color !== b.color || a.height !== b.height || a.status !== b.status) {
    return false;
  }
  if (a.marginVotes !== b.marginVotes) {
    return false;
  }
  return true;
}
