/**
 * Pure synchronous electoral count reader (N10).
 *
 * Implements:
 * - APU-01: Safe URL construction from TSE contracts and permanent 404 blocking
 * - APU-02: Zero municipal requests and motor calls when tracking hour/dg does not change
 * - APU-03: Incremental queue prioritized by descending electorate with <= 10 req/s rate planning
 * - APU-04: Resilient number parsing and rejection of truncated or regressive sections
 * - APU-05: Ten-minute backoff with deterministic jitter after 3 consecutive failures
 * - APU-06: Banner state machine ignoring unstable dv flag and visitor local clock
 * - APU-10: Elected proclamation exclusively from national br scope file with e='s' and st='Eleito'
 * - ACE-05: Concise pt-BR accessibility milestones for role='status' without en-dash or em-dash
 */

export const DEFAULT_ELECTION_CODE = "6258";
export const OFFICE_PRESIDENT = "1";
export const MAX_RECOMMENDED_RATE_PER_SECOND = 10;
export const MIN_REQUEST_INTERVAL_MS = 100;
export const FAILURE_BACKOFF_THRESHOLD = 3;
export const FAILURE_BACKOFF_BASE_SECONDS = 600;
export const FAILURE_BACKOFF_MAX_JITTER_SECONDS = 30;
export const SECTIONS_THRESHOLD_PERCENT = 50;

/**
 * Safely casts a value to an array or returns an empty array.
 *
 * @param {unknown} value
 * @returns {unknown[]}
 */
export function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

/**
 * Safely casts a value to an object or returns an empty object.
 *
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function asObject(value) {
  if (value !== null && typeof value === "object") {
    return /** @type {Record<string, unknown>} */ (value);
  }
  return {};
}

/**
 * Normalizes an election code to a 6-digit zero-padded string (e.g. "6258" -> "006258").
 *
 * @param {string | number} [electionCode]
 * @returns {string}
 */
export function padElectionCode(electionCode = DEFAULT_ELECTION_CODE) {
  const digits = String(electionCode ?? DEFAULT_ELECTION_CODE).replace(/\D/g, "");
  return digits.padStart(6, "0");
}

/**
 * Strips trailing slash from a host prefix string.
 *
 * @param {string} [host]
 * @returns {string}
 */
function resolveHostPrefix(host) {
  if (!host) {
    return "";
  }
  const trimmed = host.trim();
  if (trimmed.endsWith("/")) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

/**
 * Builds the base TSE official results directory URL (APU-01).
 *
 * @param {string} [electionCode]
 * @param {string} [host]
 * @returns {string}
 */
export function buildTseBaseUrl(electionCode = DEFAULT_ELECTION_CODE, host = "") {
  const prefix = resolveHostPrefix(host);
  return `${prefix}/oficial/ele2026/${electionCode}`;
}

/**
 * Builds the election configuration index URL (APU-01).
 *
 * @param {string} [host]
 * @returns {string}
 */
export function buildTseConfigIndexUrl(host = "") {
  const prefix = resolveHostPrefix(host);
  return `${prefix}/oficial/comum/config/ele-c.json`;
}

/**
 * Builds the municipal configuration file URL for the election (APU-01).
 *
 * @param {string} [electionCode]
 * @param {string} [host]
 * @returns {string}
 */
export function buildMunicipalConfigUrl(electionCode = DEFAULT_ELECTION_CODE, host = "") {
  const prefix = resolveHostPrefix(host);
  const padded = padElectionCode(electionCode);
  return `${prefix}/oficial/ele2026/${electionCode}/config/mun-e${padded}-cm.json`;
}

/**
 * Builds the Sao Paulo state tracking URL (EA15 / APU-01).
 *
 * @param {string} [electionCode]
 * @param {string} [host]
 * @returns {string}
 */
export function buildStateTrackingUrl(electionCode = DEFAULT_ELECTION_CODE, host = "") {
  const prefix = resolveHostPrefix(host);
  const padded = padElectionCode(electionCode);
  return `${prefix}/oficial/ele2026/${electionCode}/dados/sp/sp-e${padded}-ab.json`;
}

/**
 * Creates an in-memory session blocklist for 404 URLs or codes (APU-01).
 *
 * @returns {Set<string>}
 */
export function createSessionBlocklist() {
  return new Set();
}

/**
 * Records a 404 error code or URL in the session blocklist (APU-01).
 *
 * @param {Set<string>} blocklist
 * @param {string} codeOrUrl
 * @returns {void}
 */
export function markHttp404(blocklist, codeOrUrl) {
  if (!blocklist || !codeOrUrl) {
    return;
  }
  blocklist.add(String(codeOrUrl).trim());
}

/**
 * Checks whether a code or URL is blocked due to a prior 404 (APU-01).
 *
 * @param {Set<string> | null} [blocklist]
 * @param {string} [codeOrUrl]
 * @returns {boolean}
 */
export function isBlocked404(blocklist, codeOrUrl) {
  if (!blocklist || !codeOrUrl) {
    return false;
  }
  return blocklist.has(String(codeOrUrl).trim());
}

/**
 * Safely constructs a totalization URL adhering strictly to TSE contracts (APU-01).
 * Accepts only 'br', 'sp', or 'sp' + valid 5-digit municipal code.
 * Rejects unknown scopes, malformed codes, or permanently blocked 404 identifiers.
 *
 * @param {{
 *   electionCode?: string,
 *   scope?: string,
 *   tseCode?: string | number,
 *   host?: string,
 *   validCodesSet?: Set<string> | null,
 *   blocked404Set?: Set<string> | null
 * }} [options]
 * @returns {string | null}
 */
export function buildTotalizationUrl(options = {}) {
  const electionCode = options.electionCode ?? DEFAULT_ELECTION_CODE;
  const rawScope = String(options.scope ?? "sp")
    .toLowerCase()
    .trim();
  const prefix = resolveHostPrefix(options.host);
  const padded = padElectionCode(electionCode);
  const blockedSet = options.blocked404Set ?? null;
  const validSet = options.validCodesSet ?? null;

  if (rawScope === "br") {
    const url = `${prefix}/oficial/ele2026/${electionCode}/dados/br/br-c0001-e${padded}-u.json`;
    if (isBlocked404(blockedSet, "br") || isBlocked404(blockedSet, url)) {
      return null;
    }
    return url;
  }

  const rawCode = options.tseCode;
  const hasCode = rawCode !== undefined && rawCode !== null && String(rawCode).trim().length > 0;

  if (rawScope === "sp" && !hasCode) {
    const url = `${prefix}/oficial/ele2026/${electionCode}/dados/sp/sp-c0001-e${padded}-u.json`;
    if (isBlocked404(blockedSet, "sp") || isBlocked404(blockedSet, url)) {
      return null;
    }
    return url;
  }

  if (rawScope === "sp" || rawScope === "mun") {
    if (!hasCode) {
      return null;
    }
    const codeStr = String(rawCode).trim().padStart(5, "0");
    if (!/^\d{5}$/.test(codeStr)) {
      return null;
    }
    if (validSet !== null && !validSet.has(codeStr)) {
      return null;
    }
    if (isBlocked404(blockedSet, codeStr)) {
      return null;
    }
    const url = `${prefix}/oficial/ele2026/${electionCode}/dados/sp/sp${codeStr}-c0001-e${padded}-u.json`;
    if (isBlocked404(blockedSet, url)) {
      return null;
    }
    return url;
  }

  return null;
}

/**
 * Checks whether tracking metadata has changed since the previous cycle (APU-02).
 * Compares generation date (dg) and hour (hg), or etags.
 * If dg and hg are identical, returns false so zero municipal requests occur.
 *
 * @param {{ dg?: string, hg?: string, etag?: string } | null | undefined} previousTracking
 * @param {{ dg?: string, hg?: string, etag?: string } | null | undefined} currentTracking
 * @returns {boolean}
 */
export function hasTrackingChanged(previousTracking, currentTracking) {
  if (!previousTracking) {
    return true;
  }
  if (!currentTracking) {
    return false;
  }

  const prevEtag = previousTracking.etag;
  const currEtag = currentTracking.etag;
  if (prevEtag && currEtag && prevEtag === currEtag) {
    return false;
  }

  const prevDg = String(previousTracking.dg ?? "").trim();
  const prevHg = String(previousTracking.hg ?? "").trim();
  const currDg = String(currentTracking.dg ?? "").trim();
  const currHg = String(currentTracking.hg ?? "").trim();

  if (prevDg.length > 0 && currDg.length > 0 && prevHg.length > 0 && currHg.length > 0) {
    if (prevDg === currDg && prevHg === currHg) {
      return false;
    }
  }

  return true;
}

/**
 * Alias of hasTrackingChanged for explicit cycle gate checking (APU-02).
 *
 * @param {{ dg?: string, hg?: string, etag?: string } | null | undefined} previousTracking
 * @param {{ dg?: string, hg?: string, etag?: string } | null | undefined} currentTracking
 * @returns {boolean}
 */
export function shouldFetchMunicipalUpdates(previousTracking, currentTracking) {
  return hasTrackingChanged(previousTracking, currentTracking);
}

/**
 * Converts Brazilian date and time strings ("DD/MM/YYYY" and "HH:MM:SS") to a comparable integer.
 * Format: YYYYMMDDHHMMSS
 *
 * @param {string} [dateStr]
 * @param {string} [timeStr]
 * @returns {number}
 */
export function parseTseGenerationTimestamp(dateStr, timeStr) {
  const d = String(dateStr ?? "").trim();
  const t = String(timeStr ?? "").trim();
  if (d.length === 0 && t.length === 0) {
    return 0;
  }
  const dateParts = d.split("/");
  let yyyy = "0000";
  let mm = "00";
  let dd = "00";
  if (dateParts.length === 3) {
    dd = dateParts[0].padStart(2, "0");
    mm = dateParts[1].padStart(2, "0");
    yyyy = dateParts[2].padStart(4, "0");
  }
  const timeParts = t.split(":");
  let hh = "00";
  let min = "00";
  let ss = "00";
  if (timeParts.length >= 2) {
    hh = timeParts[0].padStart(2, "0");
    min = timeParts[1].padStart(2, "0");
    if (timeParts.length >= 3) {
      ss = timeParts[2].padStart(2, "0");
    }
  }
  const combined = `${yyyy}${mm}${dd}${hh}${min}${ss}`;
  return Number.parseInt(combined, 10) || 0;
}

/**
 * Discards incoming data if its generation timestamp (dg + hg) is older than or equal
 * to the currently processed generation timestamp for that municipality (APU-03).
 *
 * @param {{ dg?: string, hg?: string } | null | undefined} processedRecord
 * @param {{ dg?: string, hg?: string } | null | undefined} incomingRecord
 * @returns {boolean}
 */
export function isStaleGeneration(processedRecord, incomingRecord) {
  if (!processedRecord || !incomingRecord) {
    return false;
  }
  const processedTs = parseTseGenerationTimestamp(processedRecord.dg, processedRecord.hg);
  const incomingTs = parseTseGenerationTimestamp(incomingRecord.dg, incomingRecord.hg);
  if (processedTs <= 0 || incomingTs <= 0) {
    return false;
  }
  return incomingTs <= processedTs;
}

/**
 * Orders municipalities strictly by descending electorate, with deterministic
 * ascending ballot/code tie-break (APU-03).
 *
 * @template {{ cd?: string, code?: string, elet?: number, electorate?: number }} T
 * @param {T[]} municipalities
 * @returns {T[]}
 */
export function sortMunicipalitiesByElectorate(municipalities) {
  return [...municipalities].sort((a, b) => {
    const eletA = Number(a.elet ?? a.electorate ?? 0);
    const eletB = Number(b.elet ?? b.electorate ?? 0);
    if (eletB !== eletA) {
      return eletB - eletA;
    }
    const codeA = String(a.cd ?? a.code ?? "");
    const codeB = String(b.cd ?? b.code ?? "");
    return codeA.localeCompare(codeB);
  });
}

/**
 * Plans an incremental municipal update queue ordered by descending electorate (APU-03).
 * Skips blocked 404 municipalities and municipalities whose generation/sections have not changed.
 * Enforces a self-imposed rate limit <= 10 req/s.
 *
 * @param {{
 *   trackingMunicipalities?: Array<{ cd?: string, st?: number | string, s?: number | string, elet?: number, dg?: string, hg?: string }>,
 *   municipalConfigMap?: Record<string, { cd?: string, cdi?: string, elet?: number, nm?: string }>,
 *   processedMap?: Record<string, { dg?: string, hg?: string, st?: number, sectionsCounted?: number }>,
 *   blocked404Set?: Set<string>,
 *   maxRatePerSecond?: number
 * }} options
 * @returns {{
 *   queue: Array<{ cd: string, cdi: string, name: string, electorate: number, sectionsCounted: number, dg: string, hg: string }>,
 *   totalPending: number,
 *   intervalMs: number,
 *   recommendedRate: number
 * }}
 */
export function planMunicipalQueue(options = {}) {
  const trackingList = options.trackingMunicipalities ?? [];
  const configMap = options.municipalConfigMap ?? {};
  const processedMap = options.processedMap ?? {};
  const blockedSet = options.blocked404Set ?? null;
  const targetRate = Math.min(
    MAX_RECOMMENDED_RATE_PER_SECOND,
    Math.max(1, options.maxRatePerSecond ?? MAX_RECOMMENDED_RATE_PER_SECOND),
  );
  const intervalMs = Math.ceil(1000 / targetRate);

  /** @type {Array<{ cd: string, cdi: string, name: string, electorate: number, sectionsCounted: number, dg: string, hg: string }>} */
  const pending = [];

  for (const item of trackingList) {
    const cd = String(item.cd ?? "")
      .trim()
      .padStart(5, "0");
    if (!cd || cd === "00000") {
      continue;
    }
    if (isBlocked404(blockedSet, cd)) {
      continue;
    }

    const config = configMap[cd];
    const cdi = String(config?.cdi ?? "");
    const name = String(config?.nm ?? cd);
    const electorate = Number(item.elet ?? config?.elet ?? 0);
    const sectionsCounted = parseTseNumber(item.st);
    const dg = String(item.dg ?? "");
    const hg = String(item.hg ?? "");

    const processed = processedMap[cd];
    if (processed) {
      if (isStaleGeneration(processed, { dg, hg })) {
        continue;
      }
      const processedCounted = Number(processed.st ?? processed.sectionsCounted ?? 0);
      if (
        sectionsCounted <= processedCounted &&
        dg === String(processed.dg ?? "") &&
        hg === String(processed.hg ?? "")
      ) {
        continue;
      }
    }

    pending.push({
      cd,
      cdi,
      name,
      electorate,
      sectionsCounted,
      dg,
      hg,
    });
  }

  const sortedQueue = sortMunicipalitiesByElectorate(pending);

  return {
    queue: sortedQueue,
    totalPending: sortedQueue.length,
    intervalMs,
    recommendedRate: targetRate,
  };
}

/**
 * Resilient number parser accepting numbers, numeric strings, or decimal-comma notation (APU-04).
 * Example: "51,93" -> 51.93, "1.234,56" -> 1234.56, 100 -> 100.
 *
 * @param {unknown} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function parseTseNumber(value, fallback = 0) {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const str = String(value).trim();
  if (str.length === 0) {
    return fallback;
  }

  let cleaned = str.replace(/\s+/g, "");
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number.parseFloat(cleaned);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

/**
 * Safely parses a JSON string, returning a result object without throwing (APU-04).
 *
 * @param {unknown} rawText
 * @returns {{ ok: boolean, data: Record<string, unknown> | null, error: string | null }}
 */
export function parseTseJson(rawText) {
  if (typeof rawText !== "string") {
    if (rawText !== null && typeof rawText === "object") {
      return { ok: true, data: /** @type {Record<string, unknown>} */ (rawText), error: null };
    }
    return { ok: false, data: null, error: "malformed-json" };
  }
  try {
    const parsed = JSON.parse(rawText);
    if (parsed !== null && typeof parsed === "object") {
      return { ok: true, data: parsed, error: null };
    }
    return { ok: false, data: null, error: "malformed-json" };
  } catch (_e) {
    return { ok: false, data: null, error: "malformed-json" };
  }
}

/**
 * Extracts and normalizes presidential candidate records from a TSE EA20 payload.
 *
 * @param {Record<string, unknown>} doc
 * @returns {Array<{
 *   ballotNumber: string,
 *   name: string,
 *   party: string,
 *   validVotes: number,
 *   sharePct: number,
 *   status: string,
 *   elected: boolean
 * }>}
 */
function extractPresidentialCandidates(doc) {
  /** @type {Array<Record<string, unknown>>} */
  const rawCandidates = [];

  const cargArray = asArray(doc.carg);
  for (const carg of cargArray) {
    const cargObj = asObject(carg);
    const cd = String(cargObj.cd ?? cargObj.cargo ?? cargObj.codigoCargo ?? "");
    if (cd !== "1" && cd !== "0001" && cd.length > 0 && cd !== OFFICE_PRESIDENT) {
      continue;
    }
    const agrList = asArray(cargObj.agr);
    if (agrList.length > 0) {
      for (const agr of agrList) {
        const agrObj = asObject(agr);
        const candList = asArray(agrObj.cand);
        for (const cand of candList) {
          if (cand && typeof cand === "object") {
            rawCandidates.push(/** @type {Record<string, unknown>} */ (cand));
          }
        }
      }
    }
    const directCandList = asArray(cargObj.cand);
    for (const cand of directCandList) {
      if (cand && typeof cand === "object") {
        rawCandidates.push(/** @type {Record<string, unknown>} */ (cand));
      }
    }
  }

  if (rawCandidates.length === 0 && Array.isArray(doc.cand)) {
    for (const cand of doc.cand) {
      if (cand && typeof cand === "object") {
        rawCandidates.push(/** @type {Record<string, unknown>} */ (cand));
      }
    }
  }

  return rawCandidates.map((cand) => {
    const ballotNumber = String(cand.n ?? cand.numero ?? cand.ballotNumber ?? "").trim();
    const name = String(cand.nmu ?? cand.nm ?? cand.nome ?? cand.name ?? ballotNumber);
    const party = String(cand.sgp ?? cand.cc ?? cand.partido ?? cand.party ?? "");
    const validVotes = parseTseNumber(cand.vap ?? cand.votos ?? cand.validVotes ?? 0);
    const sharePct = parseTseNumber(cand.pvap ?? cand.pct ?? cand.sharePct ?? 0);
    const status = String(cand.st ?? cand.situacao ?? cand.status ?? "");
    const elected = String(cand.e ?? "").toLowerCase() === "s" || cand.elected === true;

    return {
      ballotNumber,
      name,
      party,
      validVotes,
      sharePct,
      status,
      elected,
    };
  });
}

/**
 * Resilient parser for municipal count files (APU-04).
 * Rejects truncated or malformed JSON, and rejects files with fewer sections counted
 * than the last valid processed packet for that municipality.
 *
 * @param {unknown} rawPayload
 * @param {{
 *   code?: string,
 *   sectionsCounted?: number,
 *   s?: { st?: number }
 * } | null} [previousValidData]
 * @returns {{
 *   ok: boolean,
 *   reason: "malformed-json" | "regressive-sections" | null,
 *   data: Record<string, unknown> | null,
 *   retainedData: Record<string, unknown> | null
 * }}
 */
export function parseMunicipalCountPayload(rawPayload, previousValidData = null) {
  const jsonResult = parseTseJson(rawPayload);
  if (!jsonResult.ok || !jsonResult.data) {
    return {
      ok: false,
      reason: "malformed-json",
      data: null,
      retainedData: /** @type {Record<string, unknown> | null} */ (previousValidData),
    };
  }

  const doc = jsonResult.data;
  const sectionsObj = asObject(doc.s);
  const sectionsCounted = parseTseNumber(sectionsObj.st ?? doc.st ?? doc.sectionsCounted ?? 0);
  const sectionsTotal = parseTseNumber(sectionsObj.ts ?? doc.ts ?? doc.sectionsTotal ?? 0);
  const pst = String(sectionsObj.pst ?? doc.pst ?? "");

  if (previousValidData !== null && previousValidData !== undefined) {
    const prevCounted = parseTseNumber(
      previousValidData.sectionsCounted ?? previousValidData.s?.st ?? 0,
    );
    if (sectionsCounted < prevCounted) {
      return {
        ok: false,
        reason: "regressive-sections",
        data: null,
        retainedData: /** @type {Record<string, unknown>} */ (previousValidData),
      };
    }
  }

  const candidates = extractPresidentialCandidates(doc);
  const electorateObj = asObject(doc.e);
  const votesObj = asObject(doc.v);

  const totalValidVotes = parseTseNumber(votesObj.vv ?? doc.vv ?? doc.totalValidVotes ?? 0);
  const blankVotes = parseTseNumber(votesObj.vb ?? doc.vb ?? doc.blankVotes ?? 0);
  const nullVotes = parseTseNumber(votesObj.vn ?? doc.vn ?? doc.nullVotes ?? 0);
  const electorate = parseTseNumber(electorateObj.te ?? doc.te ?? doc.electorate ?? 0);
  const turnout = parseTseNumber(electorateObj.c ?? doc.c ?? doc.turnout ?? 0);
  const abstentions = parseTseNumber(electorateObj.a ?? doc.a ?? doc.abstentions ?? 0);

  const normalized = {
    code: String(doc.cdabr ?? doc.cd ?? doc.code ?? ""),
    tseCode: String(doc.cd ?? doc.tseCode ?? ""),
    tpabr: String(doc.tpabr ?? "mu"),
    dg: String(doc.dg ?? ""),
    hg: String(doc.hg ?? ""),
    tf: String(doc.tf ?? "n"),
    and: String(doc.and ?? ""),
    sectionsCounted,
    sectionsTotal,
    pst,
    candidates,
    totalValidVotes,
    blankVotes,
    nullVotes,
    electorate,
    turnout,
    abstentions,
  };

  return {
    ok: true,
    reason: null,
    data: normalized,
    retainedData: normalized,
  };
}

/**
 * Calculates failure backoff after consecutive network/HTTP failures (APU-05).
 * After 3 consecutive failures, triggers a 10-minute pause (600s) plus deterministic jitter (0-30s).
 *
 * @param {{
 *   consecutiveFailures?: number,
 *   jitterSeed?: number | string,
 *   baseSeconds?: number,
 *   maxJitterSeconds?: number
 * }} [options]
 * @returns {{
 *   inBackoff: boolean,
 *   waitSeconds: number,
 *   backoffMs: number,
 *   reason: string | null
 * }}
 */
export function calculateFailureBackoff(options = {}) {
  const failures = Math.max(0, Math.trunc(Number(options.consecutiveFailures ?? 0)));
  if (failures < FAILURE_BACKOFF_THRESHOLD) {
    return {
      inBackoff: false,
      waitSeconds: 0,
      backoffMs: 0,
      reason: null,
    };
  }

  const baseSeconds = Math.max(0, options.baseSeconds ?? FAILURE_BACKOFF_BASE_SECONDS);
  const maxJitter = Math.max(0, options.maxJitterSeconds ?? FAILURE_BACKOFF_MAX_JITTER_SECONDS);
  const seed = Math.abs(Math.trunc(Number(options.jitterSeed ?? failures)));

  let jitter = 0;
  if (maxJitter > 0) {
    jitter = seed % (maxJitter + 1);
  }
  const waitSeconds = baseSeconds + jitter;

  return {
    inBackoff: true,
    waitSeconds,
    backoffMs: waitSeconds * 1000,
    reason: "consecutive-failures",
  };
}

/**
 * Resolves the banner status according to APU-06 state machine.
 * States: "nao-iniciada", "em-apuracao", "apuracao-pausada", "matematicamente-definida", "apuracao-concluida".
 * Aliases: "aguardando", "parcial", "tse-sem-novidade", "sem-conexao", "encerrada", "replay".
 * Explicitly ignores unstable dv flags and visitor local clock.
 *
 * @param {{
 *   and?: string,
 *   sectionsCounted?: number,
 *   sectionsTotal?: number,
 *   tf?: string,
 *   isPaused?: boolean,
 *   hasConnectionError?: boolean,
 *   isMathematicallyDefined?: boolean,
 *   isReplay?: boolean
 * }} [input]
 * @returns {{
 *   state: "nao-iniciada" | "em-apuracao" | "apuracao-pausada" | "matematicamente-definida" | "apuracao-concluida" | "sem-conexao" | "replay",
 *   alias: "aguardando" | "parcial" | "tse-sem-novidade" | "matematicamente-definida" | "encerrada" | "sem-conexao" | "replay",
 *   label: string,
 *   isConcluded: boolean
 * }}
 */
export function resolveBannerState(input = {}) {
  if (input.isReplay) {
    return {
      state: "replay",
      alias: "replay",
      label: "Replay da apuracao",
      isConcluded: false,
    };
  }

  if (input.hasConnectionError) {
    return {
      state: "sem-conexao",
      alias: "sem-conexao",
      label: "Sem conexao com o TSE",
      isConcluded: false,
    };
  }

  const sectionsCounted = Math.max(0, Number(input.sectionsCounted ?? 0));
  const sectionsTotal = Math.max(0, Number(input.sectionsTotal ?? 0));
  const tf = String(input.tf ?? "").toLowerCase();
  const andStatus = String(input.and ?? "").toLowerCase();

  const isTotalized =
    tf === "s" || andStatus === "f" || (sectionsTotal > 0 && sectionsCounted >= sectionsTotal);
  if (isTotalized) {
    return {
      state: "apuracao-concluida",
      alias: "encerrada",
      label: "Apuracao encerrada",
      isConcluded: true,
    };
  }

  if (input.isMathematicallyDefined) {
    return {
      state: "matematicamente-definida",
      alias: "matematicamente-definida",
      label: "Resultado matematicamente definido",
      isConcluded: false,
    };
  }

  const isUnstarted = sectionsCounted === 0 || andStatus === "n";
  if (isUnstarted && andStatus !== "a" && andStatus !== "s") {
    return {
      state: "nao-iniciada",
      alias: "aguardando",
      label: "Aguardando inicio da totalizacao",
      isConcluded: false,
    };
  }

  if (input.isPaused) {
    return {
      state: "apuracao-pausada",
      alias: "tse-sem-novidade",
      label: "TSE sem novidade",
      isConcluded: false,
    };
  }

  return {
    state: "em-apuracao",
    alias: "parcial",
    label: "Em apuracao",
    isConcluded: false,
  };
}

/**
 * Detects whether the national results file proclaims an elected candidate (APU-10).
 * Fires EXCLUSIVELY when scope is "br" (tpabr === "br") and a candidate has e: "s" and st: "Eleito".
 * Files with scope "sp" never trigger an elected proclamation.
 *
 * @param {Record<string, unknown> | null | undefined} tseData
 * @returns {{
 *   announced: boolean,
 *   candidate: { ballotNumber: string, name: string, party: string, status: string, elected: boolean } | null,
 *   announcementText: string | null
 * }}
 */
export function detectElectedCandidate(tseData) {
  if (!tseData || typeof tseData !== "object") {
    return { announced: false, candidate: null, announcementText: null };
  }

  const scope = String(tseData.tpabr ?? tseData.scope ?? "")
    .toLowerCase()
    .trim();
  if (scope !== "br") {
    return { announced: false, candidate: null, announcementText: null };
  }

  const candidates = extractPresidentialCandidates(tseData);
  for (const cand of candidates) {
    const isElectedFlag = cand.elected;
    const isElectedStatus = cand.status.toLowerCase() === "eleito";
    if (isElectedFlag && isElectedStatus) {
      const announcementText = `Segundo o TSE, ${cand.name} (${cand.party}) esta matematicamente eleito para a Presidencia da Republica.`;
      return {
        announced: true,
        candidate: {
          ballotNumber: cand.ballotNumber,
          name: cand.name,
          party: cand.party,
          status: cand.status,
          elected: true,
        },
        announcementText,
      };
    }
  }

  return { announced: false, candidate: null, announcementText: null };
}

/**
 * Detects accessibility milestone events for role="status" (ACE-05).
 * Generates concise Brazilian Portuguese messages without en-dash or em-dash.
 * Milestones include start, 25%, 50%, 75%, 90%, 95%, 99%, 100%, connectivity, and elected proclamation.
 *
 * @param {{
 *   bannerState?: string,
 *   sectionsPct?: number,
 *   sectionsCounted?: number,
 *   hasConnectionError?: boolean,
 *   isPaused?: boolean,
 *   tseHour?: string,
 *   isElected?: boolean,
 *   electedCandidate?: { name: string, party: string }
 * } | null | undefined} previousContext
 * @param {{
 *   bannerState?: string,
 *   sectionsPct?: number,
 *   sectionsCounted?: number,
 *   hasConnectionError?: boolean,
 *   isPaused?: boolean,
 *   tseHour?: string,
 *   isElected?: boolean,
 *   electedCandidate?: { name: string, party: string }
 * } | null | undefined} currentContext
 * @returns {string | null}
 */
export function detectAccessibilityMilestone(previousContext, currentContext) {
  if (!currentContext) {
    return null;
  }

  const prevElected = Boolean(previousContext?.isElected);
  const currElected = Boolean(currentContext.isElected);
  if (!prevElected && currElected && currentContext.electedCandidate) {
    const cand = currentContext.electedCandidate;
    return `TSE proclama resultado da eleicao presidencial: ${cand.name} (${cand.party}) eleito`;
  }

  const prevBanner = previousContext?.bannerState ?? "";
  const currBanner = currentContext.bannerState ?? "";
  if (prevBanner !== "apuracao-concluida" && currBanner === "apuracao-concluida") {
    return "Apuracao encerrada em Sao Paulo, 100% das secoes totalizadas";
  }

  const prevConnErr = Boolean(previousContext?.hasConnectionError);
  const currConnErr = Boolean(currentContext.hasConnectionError);
  if (!prevConnErr && currConnErr) {
    return "Sem conexao com o TSE";
  }
  if (prevConnErr && !currConnErr) {
    return "Transmissao de dados do TSE retomada";
  }

  const prevPaused = Boolean(previousContext?.isPaused);
  const currPaused = Boolean(currentContext.isPaused);
  if (!prevPaused && currPaused) {
    const hour = String(currentContext.tseHour ?? "").trim();
    if (hour.length > 0) {
      return `O TSE nao publicou dados novos desde ${hour}`;
    }
    return "O TSE nao publicou dados novos no ultimo ciclo";
  }
  if (prevPaused && !currPaused) {
    return "Transmissao de dados do TSE retomada";
  }

  let prevPct = 0;
  if (previousContext) {
    prevPct = Number(previousContext.sectionsPct ?? 0);
  }
  let currPct = 0;
  if (currentContext) {
    currPct = Number(currentContext.sectionsPct ?? 0);
  }
  const milestoneThresholds = [99, 95, 90, 75, 50, 25];

  for (const milestone of milestoneThresholds) {
    if (currPct >= milestone && prevPct < milestone) {
      return `${milestone}% das secoes totalizadas em Sao Paulo`;
    }
  }

  let prevCounted = 0;
  if (previousContext) {
    prevCounted = Number(previousContext.sectionsCounted ?? 0);
  }
  let currCounted = 0;
  if (currentContext) {
    currCounted = Number(currentContext.sectionsCounted ?? 0);
  }
  if (prevCounted === 0 && currCounted > 0) {
    return "Inicio da apuracao em Sao Paulo";
  }

  return null;
}
