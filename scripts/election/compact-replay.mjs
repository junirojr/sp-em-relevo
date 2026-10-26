/**
 * @typedef {{ts: number, iso: string, isState: boolean, code: string, data: Record<string, unknown>}} ElectoralEvent
 * @typedef {{t: number, iso: string, sp: [string, number, number, number, number], muns: Record<string, [string, number, number]>, gap_before_seconds?: number, is_gap?: boolean}} ReplayFrame
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_ELECTION_CODE,
  parseMunicipalCountPayload,
  parseTseNumber,
} from "../../src/domain/count-reader.js";

/**
 * Replay Compactor (N11, GRV-04).
 *
 * Processes NDJSON recording log and produces a compacted replay file
 * (data/election/replay-presidente-2t.json) respecting the <= 300 KB budget (PUB-09).
 *
 * Implements:
 * - schema_version: 1 with general election count metadata and candidate catalog.
 * - Temporal frames sampled at configurable intervals (default: 30s) or state transitions.
 * - Delta encoding: recording only changed municipalities per frame relative to the previous frame.
 * - Leader ballot number, margin (pp), and percentage of sections counted per municipality.
 * - Preserves real temporal gaps > 5 minutes (300s) without synthetic interpolation (GRV-04, RPL-05).
 */

export const SCHEMA_VERSION = 1;
export const DEFAULT_INPUT_PATH = "data/election/records.ndjson";
export const DEFAULT_OUTPUT_PATH = "data/election/replay-presidente-2t.json";
export const DEFAULT_SAMPLING_INTERVAL_SECONDS = 30;
export const DEFAULT_GAP_THRESHOLD_SECONDS = 300; // 5 minutes (GRV-04)
export const MAX_REPLAY_SIZE_BYTES = 307200; // 300 KB (PUB-09)

/**
 * Parses CLI arguments deterministically.
 *
 * @param {string[]} args
 * @returns {{
 *   inputPath: string,
 *   outputPath: string,
 *   samplingIntervalSeconds: number,
 *   gapThresholdSeconds: number,
 *   help: boolean
 * }}
 */
export function parseCliArgs(args) {
  const options = {
    inputPath: DEFAULT_INPUT_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    samplingIntervalSeconds: DEFAULT_SAMPLING_INTERVAL_SECONDS,
    gapThresholdSeconds: DEFAULT_GAP_THRESHOLD_SECONDS,
    help: false,
  };

  let idx = 0;
  while (idx < args.length) {
    const item = args[idx];
    if (item === "--input" && idx + 1 < args.length) {
      idx += 1;
      options.inputPath = args[idx];
    }
    if (item === "--output" && idx + 1 < args.length) {
      idx += 1;
      options.outputPath = args[idx];
    }
    if (item === "--interval" && idx + 1 < args.length) {
      idx += 1;
      const parsed = Number.parseInt(args[idx], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.samplingIntervalSeconds = parsed;
      }
    }
    if (item === "--gap-threshold" && idx + 1 < args.length) {
      idx += 1;
      const parsedGap = Number.parseInt(args[idx], 10);
      if (Number.isFinite(parsedGap) && parsedGap > 0) {
        options.gapThresholdSeconds = parsedGap;
      }
    }
    if (item === "--help" || item === "-h") {
      options.help = true;
    }
    idx += 1;
  }

  return options;
}

/**
 * Parses an NDJSON string or array of lines into an array of record objects.
 *
 * @param {string | string[]} content
 * @returns {Array<Record<string, unknown>>}
 */
export function parseNdjson(content) {
  /**
   * @type {string[]}
   */
  let lines = [];
  if (Array.isArray(content)) {
    lines = content;
  }
  if (typeof content === "string") {
    lines = content.split(/\r?\n/);
  }

  const records = [];
  for (const rawLine of lines) {
    const trimmed = String(rawLine || "").trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        records.push(parsed);
      }
    } catch (_parseErr) {
      // Skip malformed lines
    }
  }

  return records;
}

/**
 * Calculates leader ballot number, margin in pp, and counted percentage from parsed payload.
 *
 * @param {Record<string, unknown>} parsedData
 * @returns {{
 *   leader: string,
 *   marginPp: number,
 *   pctCounted: number,
 *   sectionsCounted: number,
 *   sectionsTotal: number,
 *   validVotes: number
 * }}
 */
export function calculateLeaderAndMargin(parsedData) {
  if (!parsedData || typeof parsedData !== "object") {
    return {
      leader: "",
      marginPp: 0,
      pctCounted: 0,
      sectionsCounted: 0,
      sectionsTotal: 0,
      validVotes: 0,
    };
  }

  const sectionsCounted = Number(parsedData.sectionsCounted || 0);
  const sectionsTotal = Number(parsedData.sectionsTotal || 0);
  const validVotes = Number(parsedData.totalValidVotes || 0);

  let pctCounted = 0;
  if (sectionsTotal > 0) {
    pctCounted = Math.round((sectionsCounted / sectionsTotal) * 10000) / 100;
  }

  let rawCandidates = [];
  if (Array.isArray(parsedData.candidates)) {
    rawCandidates = parsedData.candidates;
  }
  if (rawCandidates.length === 0 || sectionsCounted === 0) {
    return {
      leader: "",
      marginPp: 0,
      pctCounted,
      sectionsCounted,
      sectionsTotal,
      validVotes,
    };
  }

  // Sort candidates by valid votes descending, then by ballot number ascending (ELE-11)
  const sorted = [...rawCandidates].sort((a, b) => {
    const diff = Number(b.validVotes || 0) - Number(a.validVotes || 0);
    if (diff !== 0) {
      return diff;
    }
    return String(a.ballotNumber || "").localeCompare(String(b.ballotNumber || ""));
  });

  const first = sorted[0];
  const firstVotes = Number(first.validVotes || 0);

  if (sorted.length === 1) {
    return {
      leader: String(first.ballotNumber || ""),
      marginPp: 100,
      pctCounted,
      sectionsCounted,
      sectionsTotal,
      validVotes,
    };
  }

  const second = sorted[1];
  const secondVotes = Number(second.validVotes || 0);

  // Tie condition (ELE-02)
  if (firstVotes === secondVotes) {
    return {
      leader: "",
      marginPp: 0,
      pctCounted,
      sectionsCounted,
      sectionsTotal,
      validVotes,
    };
  }

  let marginPp = 0;
  const firstShare = Number(first.sharePct || 0);
  const secondShare = Number(second.sharePct || 0);
  if (firstShare > 0 || secondShare > 0) {
    marginPp = Math.round(Math.abs(firstShare - secondShare) * 100) / 100;
  }
  if (marginPp === 0 && validVotes > 0) {
    marginPp = Math.round(((firstVotes - secondVotes) / validVotes) * 10000) / 100;
  }

  return {
    leader: String(first.ballotNumber || ""),
    marginPp,
    pctCounted,
    sectionsCounted,
    sectionsTotal,
    validVotes,
  };
}

/**
 * Extracts and filters electoral reading events chronologically from NDJSON records.
 *
 * @param {Array<Record<string, unknown>>} records
 * @returns {Array<{
 *   ts: number,
 *   iso: string,
 *   url: string,
 *   isState: boolean,
 *   code: string,
 *   data: Record<string, unknown>
 * }>}
 */
export function extractElectoralEvents(records) {
  const events = [];

  for (const record of records) {
    const status = Number(record.status || 0);
    if (status !== 200 || !record.payload || typeof record.payload !== "object") {
      continue;
    }

    const url = String(record.url || "");
    const isState = url.includes("sp-c0001-e");
    const isMun = url.includes("/dados/sp/sp") && !isState;

    if (!isState && !isMun) {
      continue;
    }

    const parsed = parseMunicipalCountPayload(record.payload);
    if (!parsed.ok || !parsed.data) {
      continue;
    }

    let code = "SP";
    if (isMun) {
      code = String(parsed.data.tseCode || parsed.data.code || "").padStart(5, "0");
    }

    let timeMs = 0;
    if (record.ts) {
      timeMs = new Date(String(record.ts)).getTime();
    }
    if (!Number.isFinite(timeMs) || timeMs <= 0) {
      timeMs = Date.now();
    }

    events.push({
      ts: timeMs,
      iso: new Date(timeMs).toISOString(),
      url,
      isState,
      code,
      data: parsed.data,
    });
  }

  // Sort events chronologically
  events.sort((a, b) => a.ts - b.ts);
  return events;
}

/**
 * Builds delta-encoded replay frames with gap preservation (GRV-04).
 *
 * @param {Array<{
 *   ts: number,
 *   iso: string,
 *   isState: boolean,
 *   code: string,
 *   data: Record<string, unknown>
 * }>} events
 * @param {{
 *   samplingIntervalSeconds?: number,
 *   gapThresholdSeconds?: number
 * }} [options]
 * @returns {{
 *   frames: ReplayFrame[],
 *   candidates: Array<{ ballotNumber: string, name: string, party: string }>,
 *   summary: Record<string, unknown>,
 *   startTime: string,
 *   endTime: string,
 *   totalGaps: number
 * }}
 */
export function buildReplayFrames(events, options = {}) {
  const samplingSeconds = options.samplingIntervalSeconds || DEFAULT_SAMPLING_INTERVAL_SECONDS;
  const gapThresholdSeconds = options.gapThresholdSeconds || DEFAULT_GAP_THRESHOLD_SECONDS;
  const gapThresholdMs = gapThresholdSeconds * 1000;

  if (events.length === 0) {
    return {
      frames: [],
      candidates: [],
      summary: {},
      startTime: "",
      endTime: "",
      totalGaps: 0,
    };
  }

  const startMs = events[0].ts;
  const endMs = events[events.length - 1].ts;
  const candidatesMap = new Map();

  /** @type {Record<string, [string, number, number]>} */
  const runningMuns = {};
  /** @type {[string, number, number, number, number]} */
  const runningSp = ["", 0, 0, 0, 0];

  const frames = [];
  let totalGaps = 0;
  /** @type {Record<string, [string, number, number]>} */
  let previousFrameMuns = {};
  let previousEventTs = startMs;

  let currentBucketIndex = -1;
  let pendingEventsInBucket = [];

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const diffFromPrevious = event.ts - previousEventTs;
    const isGap = diffFromPrevious > gapThresholdMs;

    if (isGap) {
      totalGaps += 1;
    }
    previousEventTs = event.ts;

    // Collect candidates
    if (Array.isArray(event.data.candidates)) {
      for (const cand of event.data.candidates) {
        const num = String(cand.ballotNumber || "").trim();
        if (num.length > 0 && !candidatesMap.has(num)) {
          candidatesMap.set(num, {
            ballotNumber: num,
            name: String(cand.name || num),
            party: String(cand.party || ""),
          });
        }
      }
    }

    const elapsedSeconds = Math.floor((event.ts - startMs) / 1000);
    const bucketIndex = Math.floor(elapsedSeconds / samplingSeconds);

    if (bucketIndex !== currentBucketIndex || isGap) {
      if (pendingEventsInBucket.length > 0) {
        // Flush previous bucket into a frame
        const frame = createFrameFromBucket({
          bucketEvents: pendingEventsInBucket,
          startMs,
          runningMuns,
          runningSp,
          previousFrameMuns,
          isGap: false,
          gapDurationSeconds: 0,
        });
        if (frame) {
          frames.push(frame);
          previousFrameMuns = { ...runningMuns };
        }
        pendingEventsInBucket = [];
      }

      currentBucketIndex = bucketIndex;
    }

    pendingEventsInBucket.push({
      event,
      isGap,
      gapDurationSeconds: Math.round(diffFromPrevious / 1000),
    });
  }

  // Flush remaining events
  if (pendingEventsInBucket.length > 0) {
    const lastItem = pendingEventsInBucket[pendingEventsInBucket.length - 1];
    let isGap = false;
    let gapSec = 0;
    if (lastItem && lastItem.isGap) {
      isGap = true;
      gapSec = lastItem.gapDurationSeconds;
    }
    const frame = createFrameFromBucket({
      bucketEvents: pendingEventsInBucket,
      startMs,
      runningMuns,
      runningSp,
      previousFrameMuns,
      isGap,
      gapDurationSeconds: gapSec,
    });
    if (frame) {
      frames.push(frame);
    }
  }

  // Candidate list sorted by ballot number (E34)
  const candidateList = Array.from(candidatesMap.values()).sort((a, b) => {
    return a.ballotNumber.localeCompare(b.ballotNumber);
  });

  const summary = {
    total_sections: runningSp[4],
    counted_sections: runningSp[3],
    pct_counted: runningSp[2],
    leader: runningSp[0],
    margin_pp: runningSp[1],
    municipalities_count: Object.keys(runningMuns).length,
  };

  return {
    frames,
    candidates: candidateList,
    summary,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    totalGaps,
  };
}

/**
 * Creates a single frame snapshot with delta encoding relative to previous frame.
 *
 * @param {{
 *   bucketEvents: Array<{ event: ElectoralEvent, isGap: boolean, gapDurationSeconds: number }>,
 *   startMs: number,
 *   runningMuns: Record<string, [string, number, number]>,
 *   runningSp: [string, number, number, number, number],
 *   previousFrameMuns: Record<string, [string, number, number]>,
 *   isGap: boolean,
 *   gapDurationSeconds: number
 * }} params
 * @returns {ReplayFrame | null}
 */
function createFrameFromBucket(params) {
  const {
    bucketEvents,
    startMs,
    runningMuns,
    runningSp,
    previousFrameMuns,
    isGap,
    gapDurationSeconds,
  } = params;

  let latestTs = startMs;
  let hasGapInBucket = isGap;
  let maxGapSeconds = gapDurationSeconds;

  for (const item of bucketEvents) {
    const ev = item.event;
    if (ev.ts > latestTs) {
      latestTs = ev.ts;
    }
    if (item.isGap) {
      hasGapInBucket = true;
      if (item.gapDurationSeconds > maxGapSeconds) {
        maxGapSeconds = item.gapDurationSeconds;
      }
    }

    const calc = calculateLeaderAndMargin(ev.data);
    if (ev.isState) {
      runningSp[0] = calc.leader;
      runningSp[1] = calc.marginPp;
      runningSp[2] = calc.pctCounted;
      runningSp[3] = calc.sectionsCounted;
      runningSp[4] = calc.sectionsTotal;
    }
    if (!ev.isState) {
      runningMuns[ev.code] = [calc.leader, calc.marginPp, calc.pctCounted];
    }
  }

  // Calculate delta: only municipalities that differ from previousFrameMuns
  /** @type {Record<string, [string, number, number]>} */
  const deltas = {};
  let deltaCount = 0;
  const isFirstFrame = Object.keys(previousFrameMuns).length === 0;

  for (const cd of Object.keys(runningMuns)) {
    const currentVal = runningMuns[cd];
    if (isFirstFrame) {
      deltas[cd] = currentVal;
      deltaCount += 1;
      continue;
    }
    const prevVal = previousFrameMuns[cd];
    if (!prevVal) {
      deltas[cd] = currentVal;
      deltaCount += 1;
      continue;
    }
    const hasChanged =
      prevVal[0] !== currentVal[0] || prevVal[1] !== currentVal[1] || prevVal[2] !== currentVal[2];
    if (hasChanged) {
      deltas[cd] = currentVal;
      deltaCount += 1;
    }
  }

  // If nothing changed and no gap, omit redundant frame
  if (deltaCount === 0 && !hasGapInBucket && !isFirstFrame) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((latestTs - startMs) / 1000));
  /** @type {ReplayFrame} */
  const frame = {
    t: elapsedSeconds,
    iso: new Date(latestTs).toISOString(),
    sp: [...runningSp],
    muns: deltas,
  };

  if (hasGapInBucket && maxGapSeconds > 0) {
    frame.gap_before_seconds = maxGapSeconds;
    frame.is_gap = true;
  }

  return frame;
}

/**
 * Compacts raw NDJSON log data into the schema_version 1 replay structure.
 *
 * @param {string | Array<Record<string, unknown>>} inputData
 * @param {{
 *   electionCode?: string,
 *   samplingIntervalSeconds?: number,
 *   gapThresholdSeconds?: number
 * }} [options]
 */
export function compactReplayLog(inputData, options = {}) {
  /**
   * @type {Record<string, unknown>[]}
   */
  let records = [];
  if (Array.isArray(inputData)) {
    records = inputData;
  }
  if (typeof inputData === "string") {
    records = parseNdjson(inputData);
  }

  const events = extractElectoralEvents(records);
  const frameResult = buildReplayFrames(events, {
    samplingIntervalSeconds: options.samplingIntervalSeconds || DEFAULT_SAMPLING_INTERVAL_SECONDS,
    gapThresholdSeconds: options.gapThresholdSeconds || DEFAULT_GAP_THRESHOLD_SECONDS,
  });

  const replayDoc = {
    schema_version: SCHEMA_VERSION,
    election_code: options.electionCode || DEFAULT_ELECTION_CODE,
    created_at: new Date().toISOString(),
    start_time: frameResult.startTime,
    end_time: frameResult.endTime,
    total_frames: frameResult.frames.length,
    sampling_interval_seconds: options.samplingIntervalSeconds || DEFAULT_SAMPLING_INTERVAL_SECONDS,
    gap_threshold_seconds: options.gapThresholdSeconds || DEFAULT_GAP_THRESHOLD_SECONDS,
    total_gaps: frameResult.totalGaps,
    candidates: frameResult.candidates,
    summary: frameResult.summary,
    frames: frameResult.frames,
  };

  return replayDoc;
}

/**
 * Main CLI entrypoint.
 */
export async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`
Usage: node scripts/election/compact-replay.mjs [options]

Options:
  --input <path>            Path to records NDJSON file (default: data/election/records.ndjson)
  --output <path>           Path to replay JSON file (default: data/election/replay-presidente-2t.json)
  --interval <seconds>      Sampling interval in seconds (default: 30)
  --gap-threshold <seconds> Real gap preservation threshold in seconds (default: 300)
  --help, -h                Show this help message
`);
    return;
  }

  if (!fs.existsSync(args.inputPath)) {
    console.error(`Input file not found: ${args.inputPath}`);
    process.exit(1);
  }

  const rawNdjson = fs.readFileSync(args.inputPath, "utf8");
  const replay = compactReplayLog(rawNdjson, {
    samplingIntervalSeconds: args.samplingIntervalSeconds,
    gapThresholdSeconds: args.gapThresholdSeconds,
  });

  const outputJson = JSON.stringify(replay);
  const byteSize = Buffer.byteLength(outputJson, "utf8");

  const outDir = path.dirname(args.outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(args.outputPath, outputJson, "utf8");

  console.log(`Compacted replay written to ${args.outputPath}`);
  console.log(`Frames: ${replay.total_frames}, Gaps preserved: ${replay.total_gaps}`);
  console.log(`Size: ${byteSize} bytes (${(byteSize / 1024).toFixed(2)} KB, budget <= 300 KB)`);

  if (byteSize > MAX_REPLAY_SIZE_BYTES) {
    console.warn(
      `[WARNING] Replay size exceeds 300 KB budget! (${byteSize} > ${MAX_REPLAY_SIZE_BYTES})`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Replay compaction failed:", err);
    process.exit(1);
  });
}
