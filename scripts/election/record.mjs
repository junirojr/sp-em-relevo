import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildMunicipalConfigUrl,
  buildStateTrackingUrl,
  buildTotalizationUrl,
  createSessionBlocklist,
  DEFAULT_ELECTION_CODE,
  hasTrackingChanged,
  isBlocked404,
  markHttp404,
  parseMunicipalCountPayload,
  parseTseNumber,
  planMunicipalQueue,
} from "../../src/domain/count-reader.js";

/**
 * Local TSE Election Recorder (N11).
 *
 * Implements:
 * - GRV-01: Append-only NDJSON log with automatic restart recovery (discards truncated line, prevents duplicate readings).
 * - GRV-02: Pure domain planner and parser reuse with self-imposed rate limit <= 10 req/s.
 * - APU-01 / APU-04: Autochecks non-regressive sections, municipal sums vs SP aggregate, and monitors 404 count.
 * - 3-minute silence warning alert for terminal and log monitoring.
 */

export const DEFAULT_OUT_PATH = "data/election/records.ndjson";
export const DEFAULT_INTERVAL_MS = 60000;
export const DEFAULT_SERVER_URL = "https://resultados.tse.jus.br";
export const DEFAULT_RATE_LIMIT = 10;
export const ALERT_SILENCE_THRESHOLD_MS = 180000; // 3 minutes

/**
 * Parses CLI command-line arguments.
 *
 * @param {string[]} args
 * @returns {{
 *   outPath: string,
 *   intervalMs: number,
 *   serverUrl: string,
 *   electionCode: string,
 *   rateLimit: number,
 *   dryRun: boolean,
 *   singleCycle: boolean,
 *   help: boolean
 * }}
 */
export function parseCliArgs(args) {
  const options = {
    outPath: DEFAULT_OUT_PATH,
    intervalMs: DEFAULT_INTERVAL_MS,
    serverUrl: DEFAULT_SERVER_URL,
    electionCode: DEFAULT_ELECTION_CODE,
    rateLimit: DEFAULT_RATE_LIMIT,
    dryRun: false,
    singleCycle: false,
    help: false,
  };

  let index = 0;
  while (index < args.length) {
    const item = args[index];
    if (item === "--out" && index + 1 < args.length) {
      index += 1;
      options.outPath = args[index];
    }
    if (item === "--interval" && index + 1 < args.length) {
      index += 1;
      const parsed = Number.parseInt(args[index], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.intervalMs = parsed;
      }
    }
    if (item === "--server" && index + 1 < args.length) {
      index += 1;
      options.serverUrl = args[index];
    }
    if (item === "--election" && index + 1 < args.length) {
      index += 1;
      options.electionCode = args[index];
    }
    if (item === "--rate-limit" && index + 1 < args.length) {
      index += 1;
      const parsedRate = Number.parseInt(args[index], 10);
      if (Number.isFinite(parsedRate) && parsedRate > 0) {
        options.rateLimit = Math.min(10, parsedRate);
      }
    }
    if (item === "--dry-run") {
      options.dryRun = true;
    }
    if (item === "--single-cycle") {
      options.singleCycle = true;
    }
    if (item === "--help" || item === "-h") {
      options.help = true;
    }
    index += 1;
  }

  return options;
}

/**
 * Fetches an HTTP/HTTPS resource and computes status, etag, sha256 and payload.
 *
 * @param {string} url
 * @param {{
 *   etag?: string | null,
 *   timeoutMs?: number,
 *   customFetch?: typeof fetch
 * }} [options]
 * @returns {Promise<{
 *   status: number,
 *   etag: string | null,
 *   sha256: string | null,
 *   payload: Record<string, unknown> | string | null,
 *   rawText: string,
 *   error: string | null
 * }>}
 */
export async function fetchTseResource(url, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const activeFetch = options.customFetch || globalThis.fetch;
  /** @type {Record<string, string>} */
  const headers = {};
  if (options.etag) {
    headers["If-None-Match"] = options.etag;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await activeFetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const status = res.status;
    let resEtag = null;
    if (res.headers && typeof res.headers.get === "function") {
      resEtag = res.headers.get("etag") || null;
    }

    if (status === 304) {
      let finalEtag = resEtag;
      if (!finalEtag) {
        finalEtag = options.etag || null;
      }
      return {
        status: 304,
        etag: finalEtag,
        sha256: null,
        payload: null,
        rawText: "",
        error: null,
      };
    }

    const rawText = await res.text();
    let sha256 = null;
    if (rawText.length > 0) {
      sha256 = crypto.createHash("sha256").update(rawText, "utf8").digest("hex");
    }

    let payload = null;
    if (status === 200) {
      try {
        payload = JSON.parse(rawText);
      } catch (_parseError) {
        payload = rawText;
      }
    }

    return {
      status,
      etag: resEtag,
      sha256,
      payload,
      rawText,
      error: null,
    };
  } catch (err) {
    clearTimeout(timer);
    let msg = "network-error";
    if (err instanceof Error) {
      msg = err.message;
    }
    return {
      status: 0,
      etag: null,
      sha256: null,
      payload: null,
      rawText: "",
      error: msg,
    };
  }
}

/**
 * Appends a record to an NDJSON file, creating parent directories if needed.
 *
 * @param {string} filePath
 * @param {Record<string, unknown>} record
 * @returns {void}
 */
export function appendNdjsonRecord(filePath, record) {
  const line = JSON.stringify(record) + "\n";
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.appendFileSync(filePath, line, "utf8");
}

/**
 * Recovers an NDJSON log file on restart (GRV-01).
 * Discards an incomplete/truncated trailing line without data loss, and repairs the file.
 *
 * @param {string} filePath
 * @returns {{
 *   validRecords: Array<{ ts: string, url: string, status: number, etag: string | null, sha256: string | null, payload: unknown }>,
 *   discardedLine: string | null,
 *   recoveredCount: number
 * }}
 */
export function recoverNdjsonLog(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      validRecords: [],
      discardedLine: null,
      recoveredCount: 0,
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw || raw.trim().length === 0) {
    return {
      validRecords: [],
      discardedLine: null,
      recoveredCount: 0,
    };
  }

  const lines = raw.split(/\r?\n/);
  const validRecords = [];
  const validLines = [];
  let discardedLine = null;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const text = lines[idx].trim();
    if (text.length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(text);
      validRecords.push(parsed);
      validLines.push(text);
    } catch (_parseErr) {
      if (idx === lines.length - 1) {
        discardedLine = text;
      }
    }
  }

  if (discardedLine !== null) {
    let cleanContent = "";
    if (validLines.length > 0) {
      cleanContent = validLines.join("\n") + "\n";
    }
    fs.writeFileSync(filePath, cleanContent, "utf8");
  }

  return {
    validRecords,
    discardedLine,
    recoveredCount: validRecords.length,
  };
}

/**
 * Builds a deterministic fingerprint for deduplicating recorded readings.
 *
 * @param {string} url
 * @param {string | null} [etag]
 * @param {string | null} [sha256]
 * @param {number} [status]
 * @returns {string}
 */
export function buildRecordSignature(url, etag = null, sha256 = null, status = 200) {
  const safeUrl = String(url || "");
  const safeEtag = String(etag || "");
  const safeSha = String(sha256 || "");
  const safeStatus = Number(status || 0);
  return `${safeUrl}::${safeStatus}::${safeEtag}::${safeSha}`;
}

/**
 * Local election recorder class orchestrating reading, queue planning,
 * rate limiting, NDJSON logging, autochecking, and alerts.
 */
export class ElectionRecorder {
  /**
   * @param {{
   *   outPath?: string,
   *   intervalMs?: number,
   *   serverUrl?: string,
   *   electionCode?: string,
   *   rateLimit?: number,
   *   dryRun?: boolean,
   *   singleCycle?: boolean,
   *   customFetch?: typeof fetch,
   *   clock?: { now: () => number },
   *   onAlert?: (event: { type: string, durationMs: number, timestamp: string }) => void,
   *   onAutocheck?: (report: Record<string, unknown>) => void,
   *   onRecord?: (record: Record<string, unknown>) => void
   * }} [options]
   */
  constructor(options = {}) {
    this.outPath = options.outPath || DEFAULT_OUT_PATH;
    this.intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
    this.serverUrl = options.serverUrl || DEFAULT_SERVER_URL;
    this.electionCode = options.electionCode || DEFAULT_ELECTION_CODE;
    this.rateLimit = Math.min(10, Math.max(1, options.rateLimit || DEFAULT_RATE_LIMIT));
    this.dryRun = Boolean(options.dryRun);
    this.singleCycle = Boolean(options.singleCycle);
    this.customFetch = options.customFetch || globalThis.fetch;
    this.clock = options.clock || { now: () => Date.now() };

    this.onAlert = options.onAlert || null;
    this.onAutocheck = options.onAutocheck || null;
    this.onRecord = options.onRecord || null;

    /** @type {Array<Record<string, unknown>>} */
    this.records = [];
    /** @type {Set<string>} */
    this.knownSignatures = new Set();
    /** @type {Record<string, { cd?: string, cdi?: string, nm?: string, elet?: number }>} */
    this.municipalConfigMap = {};
    /** @type {Set<string>} */
    this.validCodesSet = new Set();
    /** @type {Set<string>} */
    this.blocked404Set = createSessionBlocklist();

    /** @type {Record<string, Record<string, unknown>>} */
    this.processedMap = {};
    /** @type {Record<string, number>} */
    this.previousSections = {};

    /** @type {Record<string, unknown> | null} */
    this.lastTracking = null;
    /** @type {string | null} */
    this.lastTrackingEtag = null;
    /** @type {Record<string, unknown> | null} */
    this.stateAggregate = null;

    this.lastSuccessTimestamp = this.clock.now();
    /** @type {ReturnType<ElectionRecorder["performAutocheck"]>[]} */
    this.autocheckLogs = [];
    /** @type {{type: string, durationMs: number, timestamp: string}[]} */
    this.alertLogs = [];
    this.timerHandle = null;
    this.isRunning = false;
  }

  /**
   * Initializes recorder by reading existing NDJSON and reconstructing session state.
   */
  async init() {
    const recovery = recoverNdjsonLog(this.outPath);
    this.records = recovery.validRecords;

    for (const record of this.records) {
      const url = String(record.url || "");
      let etag = null;
      if (record.etag) {
        etag = String(record.etag);
      }
      let sha256 = null;
      if (record.sha256) {
        sha256 = String(record.sha256);
      }
      const status = Number(record.status || 0);

      const sig = buildRecordSignature(url, etag, sha256, status);
      this.knownSignatures.add(sig);

      if (status === 404) {
        markHttp404(this.blocked404Set, url);
      }
      if (status === 200 || status === 304) {
        this.lastSuccessTimestamp = this.clock.now();
      }

      if (url.includes("mun-e") && record.payload && typeof record.payload === "object") {
        this.populateMunicipalConfig(/** @type {Record<string, unknown>} */ (record.payload));
      }

      if (url.includes("-ab.json") && record.payload && typeof record.payload === "object") {
        this.lastTracking = /** @type {Record<string, unknown>} */ (record.payload);
        this.lastTrackingEtag = etag;
      }

      if (url.includes("sp-c0001-e") && record.payload && typeof record.payload === "object") {
        const parsedState = parseMunicipalCountPayload(record.payload);
        if (parsedState.ok && parsedState.data) {
          this.stateAggregate = parsedState.data;
        }
      }

      const isMunResult = url.includes("/dados/sp/sp") && !url.includes("sp-c0001-e");
      if (isMunResult && record.payload && typeof record.payload === "object") {
        const parsedMun = parseMunicipalCountPayload(record.payload);
        if (parsedMun.ok && parsedMun.data) {
          const code = String(parsedMun.data.tseCode || parsedMun.data.code || "");
          if (code.length > 0) {
            this.processedMap[code] = parsedMun.data;
            this.previousSections[code] = Number(parsedMun.data.sectionsCounted || 0);
          }
        }
      }
    }
  }

  /**
   * Populates municipal configuration and valid codes set from EA12 config payload.
   *
   * @param {Record<string, unknown>} payload
   */
  populateMunicipalConfig(payload) {
    if (!payload) {
      return;
    }
    let abrList = [];
    if (Array.isArray(payload.abr)) {
      abrList = payload.abr;
    }
    for (const abr of abrList) {
      /** @type {Record<string, unknown>} */
      let abrObj = {};
      if (abr && typeof abr === "object") {
        abrObj = /** @type {Record<string, unknown>} */ (abr);
      }
      let muList = [];
      if (Array.isArray(abrObj.mu)) {
        muList = abrObj.mu;
      }
      for (const mu of muList) {
        if (!mu || typeof mu !== "object") {
          continue;
        }
        const muObj = /** @type {Record<string, unknown>} */ (mu);
        const cd = String(muObj.cd || "")
          .trim()
          .padStart(5, "0");
        if (cd.length === 5 && cd !== "00000") {
          const cdi = String(muObj.cdi || "");
          const nm = String(muObj.nm || cd);
          const elet = Number(muObj.elet || 0);
          this.municipalConfigMap[cd] = { cd, cdi, nm, elet };
          this.validCodesSet.add(cd);
        }
      }
    }
  }

  /**
   * Records a fetch response into memory and append-only NDJSON log.
   * Prevents storing duplicate entries of identical responses (GRV-01).
   *
   * @param {string} url
   * @param {{
   *   status: number,
   *   etag: string | null,
   *   sha256: string | null,
   *   payload: Record<string, unknown> | string | null
   * }} result
   * @returns {Record<string, unknown> | null}
   */
  recordFetch(url, result) {
    const ts = new Date(this.clock.now()).toISOString();
    const sig = buildRecordSignature(url, result.etag, result.sha256, result.status);

    if (this.knownSignatures.has(sig)) {
      return null;
    }
    this.knownSignatures.add(sig);

    const record = {
      ts,
      url,
      status: result.status,
      etag: result.etag,
      sha256: result.sha256,
      payload: result.payload,
    };

    this.records.push(record);

    if (!this.dryRun) {
      appendNdjsonRecord(this.outPath, record);
    }
    if (this.onRecord) {
      this.onRecord(record);
    }

    return record;
  }

  /**
   * Pauses asynchronous execution for specified milliseconds.
   *
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Executes a single polling cycle.
   *
   * @returns {Promise<{
   *   status: string,
   *   autocheck: Record<string, unknown>,
   *   pending: number
   * }>}
   */
  async runCycle() {
    // Step 1: Ensure municipal config is loaded
    if (Object.keys(this.municipalConfigMap).length === 0) {
      const configUrl = buildMunicipalConfigUrl(this.electionCode, this.serverUrl);
      const configRes = await fetchTseResource(configUrl, { customFetch: this.customFetch });
      this.recordFetch(configUrl, configRes);
      if (configRes.status === 200 && configRes.payload && typeof configRes.payload === "object") {
        this.populateMunicipalConfig(/** @type {Record<string, unknown>} */ (configRes.payload));
        this.lastSuccessTimestamp = this.clock.now();
      }
    }

    // Step 2: Fetch SP tracking file
    const trackingUrl = buildStateTrackingUrl(this.electionCode, this.serverUrl);
    const trackingRes = await fetchTseResource(trackingUrl, {
      etag: this.lastTrackingEtag,
      customFetch: this.customFetch,
    });
    this.recordFetch(trackingUrl, trackingRes);

    if (trackingRes.status === 304) {
      this.lastSuccessTimestamp = this.clock.now();
      const autocheckReport = this.performAutocheck();
      this.checkSilenceAlert();
      return { status: "not-modified", autocheck: autocheckReport, pending: 0 };
    }

    let trackingChanged = false;
    let currentTracking = null;

    if (
      trackingRes.status === 200 &&
      trackingRes.payload &&
      typeof trackingRes.payload === "object"
    ) {
      this.lastSuccessTimestamp = this.clock.now();
      currentTracking = /** @type {Record<string, unknown>} */ (trackingRes.payload);
      trackingChanged = hasTrackingChanged(this.lastTracking, currentTracking);
      this.lastTracking = currentTracking;
      this.lastTrackingEtag = trackingRes.etag;
    }

    if (!trackingChanged) {
      const autocheckReport = this.performAutocheck();
      this.checkSilenceAlert();
      return { status: "stagnant", autocheck: autocheckReport, pending: 0 };
    }

    // Step 3: Fetch state aggregate file
    const stateUrl = buildTotalizationUrl({
      electionCode: this.electionCode,
      scope: "sp",
      host: this.serverUrl,
      blocked404Set: this.blocked404Set,
    });
    if (stateUrl) {
      const stateRes = await fetchTseResource(stateUrl, { customFetch: this.customFetch });
      this.recordFetch(stateUrl, stateRes);
      if (stateRes.status === 200 && stateRes.payload && typeof stateRes.payload === "object") {
        this.lastSuccessTimestamp = this.clock.now();
        const parsedState = parseMunicipalCountPayload(stateRes.payload);
        if (parsedState.ok && parsedState.data) {
          this.stateAggregate = parsedState.data;
        }
      }
    }

    // Step 4: Extract tracking municipalities and plan municipal queue
    let trackingMunicipalities = [];
    if (currentTracking && Array.isArray(currentTracking.abr)) {
      const firstAbr = currentTracking.abr[0];
      if (firstAbr && typeof firstAbr === "object" && Array.isArray(firstAbr.mu)) {
        trackingMunicipalities = firstAbr.mu;
      }
    }

    const queuePlan = planMunicipalQueue({
      trackingMunicipalities,
      municipalConfigMap: this.municipalConfigMap,
      processedMap: this.processedMap,
      blocked404Set: this.blocked404Set,
      maxRatePerSecond: this.rateLimit,
    });

    const interRequestMs = Math.max(100, queuePlan.intervalMs); // Rate limit <= 10 req/s (GRV-02)

    // Step 5: Process municipal queue sequentially with rate limiting
    for (const item of queuePlan.queue) {
      await this.sleep(interRequestMs);

      const munUrl = buildTotalizationUrl({
        electionCode: this.electionCode,
        scope: "sp",
        tseCode: item.cd,
        host: this.serverUrl,
        validCodesSet: this.validCodesSet,
        blocked404Set: this.blocked404Set,
      });

      if (!munUrl) {
        continue;
      }

      const munRes = await fetchTseResource(munUrl, { customFetch: this.customFetch });
      this.recordFetch(munUrl, munRes);

      if (munRes.status === 200 && munRes.payload && typeof munRes.payload === "object") {
        this.lastSuccessTimestamp = this.clock.now();
        const previousData = this.processedMap[item.cd] || null;
        const parsedMun = parseMunicipalCountPayload(munRes.payload, previousData);
        if (parsedMun.ok && parsedMun.data) {
          this.processedMap[item.cd] = parsedMun.data;
        }
      }

      if (munRes.status === 404) {
        markHttp404(this.blocked404Set, item.cd);
        markHttp404(this.blocked404Set, munUrl);
      }
    }

    // Step 6: Autocheck on every cycle
    const autocheck = this.performAutocheck();
    this.autocheckLogs.push(autocheck);
    if (this.onAutocheck) {
      this.onAutocheck(autocheck);
    }

    // Step 7: Check 3-minute silence alert
    this.checkSilenceAlert();

    return {
      status: "updated",
      autocheck,
      pending: queuePlan.totalPending,
    };
  }

  /**
   * Autochecks data integrity: non-regressive sections, sum of municipalities vs SP aggregate,
   * and 404 count (APU-01, APU-04).
   *
   */
  performAutocheck() {
    const regressions = [];
    let hasRegression = false;

    for (const cd of Object.keys(this.processedMap)) {
      const current = this.processedMap[cd];
      const prevCount = this.previousSections[cd];
      const currentCount = Number(current.sectionsCounted || 0);

      if (prevCount !== undefined && currentCount < prevCount) {
        hasRegression = true;
        regressions.push({
          code: cd,
          previous: prevCount,
          current: currentCount,
        });
      }
      this.previousSections[cd] = currentCount;
    }

    let sumMunicipalSections = 0;
    let sumMunicipalValidVotes = 0;
    for (const cd of Object.keys(this.processedMap)) {
      const item = this.processedMap[cd];
      sumMunicipalSections += Number(item.sectionsCounted || 0);
      sumMunicipalValidVotes += Number(item.totalValidVotes || 0);
    }

    let stateSectionsCounted = 0;
    let stateSectionsTotal = 0;
    let stateValidVotes = 0;
    let isFinal = false;

    if (this.stateAggregate) {
      stateSectionsCounted = Number(this.stateAggregate.sectionsCounted || 0);
      stateSectionsTotal = Number(this.stateAggregate.sectionsTotal || 0);
      stateValidVotes = Number(this.stateAggregate.totalValidVotes || 0);
      const tfVal = String(this.stateAggregate.tf || "").toLowerCase();
      if (tfVal === "s") {
        isFinal = true;
      }
    }

    let sectionsMatch = false;
    if (isFinal) {
      if (stateSectionsTotal > 0 && sumMunicipalSections === stateSectionsTotal) {
        sectionsMatch = true;
      }
    }
    if (!isFinal) {
      if (sumMunicipalSections <= stateSectionsTotal) {
        sectionsMatch = true;
      }
    }

    return {
      timestamp: new Date(this.clock.now()).toISOString(),
      stateSectionsCounted,
      stateSectionsTotal,
      sumMunicipalSections,
      stateValidVotes,
      sumMunicipalValidVotes,
      municipalitiesTotal: 645,
      municipalitiesRead: Object.keys(this.processedMap).length,
      total404Count: this.blocked404Set.size,
      hasRegression,
      regressions,
      sectionsMatch,
      isFinal,
    };
  }

  /**
   * Checks if silence duration exceeds 3 minutes and emits an alert if needed.
   *
   * @returns {void}
   */
  checkSilenceAlert() {
    const silenceDurationMs = this.clock.now() - this.lastSuccessTimestamp;
    if (silenceDurationMs >= ALERT_SILENCE_THRESHOLD_MS) {
      const alertEvent = {
        type: "silence-alert",
        durationMs: silenceDurationMs,
        timestamp: new Date(this.clock.now()).toISOString(),
      };
      this.alertLogs.push(alertEvent);
      if (this.onAlert) {
        this.onAlert(alertEvent);
      }
      console.warn(
        `[ALERT] No successful reading for ${Math.round(silenceDurationMs / 1000)} seconds (> 3 minutes).`,
      );
    }
  }

  /**
   * Starts the recurring recording polling loop.
   */
  async start() {
    this.isRunning = true;
    while (this.isRunning) {
      try {
        await this.runCycle();
      } catch (err) {
        console.error("Cycle execution error:", err);
      }
      if (!this.isRunning) {
        break;
      }
      await this.sleep(this.intervalMs);
    }
  }

  /**
   * Stops the recurring polling loop.
   */
  stop() {
    this.isRunning = false;
  }
}

/**
 * Main entrypoint for CLI execution.
 */
export async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`
Usage: node scripts/election/record.mjs [options]

Options:
  --out <path>         Path to NDJSON output file (default: data/election/records.ndjson)
  --interval <ms>      Polling interval in milliseconds (default: 60000)
  --server <url>       TSE server base URL (default: https://resultados.tse.jus.br)
  --election <code>    Election code (default: 6258)
  --rate-limit <n>     Max requests per second (default: 10)
  --dry-run            Do not persist records to disk
  --single-cycle       Execute one polling cycle and exit
  --help, -h           Show this help message
`);
    return;
  }

  const recorder = new ElectionRecorder({
    outPath: args.outPath,
    intervalMs: args.intervalMs,
    serverUrl: args.serverUrl,
    electionCode: args.electionCode,
    rateLimit: args.rateLimit,
    dryRun: args.dryRun,
    singleCycle: args.singleCycle,
  });

  await recorder.init();

  if (args.singleCycle) {
    const report = await recorder.runCycle();
    console.log("Single cycle finished:", JSON.stringify(report.autocheck));
    return;
  }

  await recorder.start();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Recorder process error:", err);
    process.exit(1);
  });
}
