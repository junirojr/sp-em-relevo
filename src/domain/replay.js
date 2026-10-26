/**
 * Pure domain functions for electoral replay (N17, RPL-02, RPL-03, RPL-05).
 *
 * Implements:
 * - Cumulative state reconstruction from delta-encoded frames (RPL-02).
 * - Timeline extraction with Brasilia timezone formatting (RPL-03, RPL-04).
 * - Real temporal gap detection (> 5 minutes / 300 seconds) without synthetic interpolation (RPL-05).
 * - Deterministic time and banner formatting without dependency on visitor local clock (ELE-21, TXT-01).
 *
 * Strict architectural boundaries:
 * - 100% pure and synchronous.
 * - No DOM, window, document, fetch, node:*, or three imports.
 * - No else statements, no ternary operators.
 * - No en-dash (U+2013) or em-dash (U+2014).
 *
 * @typedef {{
 *   leader: string,
 *   marginPp: number,
 *   pctCounted: number,
 *   sectionsCounted: number,
 *   sectionsTotal: number
 * }} ReplaySpState
 *
 * @typedef {{
 *   index: number,
 *   t: number,
 *   iso: string,
 *   sp: ReplaySpState,
 *   muns: Record<string, [string, number, number]>,
 *   isGap: boolean,
 *   gapBeforeSeconds: number
 * }} ReconstructedReplayFrame
 *
 * @typedef {{
 *   index: number,
 *   t: number,
 *   iso: string,
 *   formattedTime: string,
 *   formattedBrasilia: string,
 *   pctCounted: number,
 *   isGap: boolean,
 *   gapDurationSeconds: number
 * }} ReplayTimelineMarker
 *
 * @typedef {{
 *   startIndex: number,
 *   endIndex: number,
 *   durationSeconds: number,
 *   startIso: string,
 *   endIso: string
 * }} ReplayGapInterval
 */

export const REPLAY_SCHEMA_VERSION = 1;
export const DEFAULT_MIN_GAP_SECONDS = 300; // 5 minutes (GRV-04, RPL-05)

const BRASILIA_TIMEZONE = "America/Sao_Paulo";
const REPLAY_BANNER_PREFIX = "Gravacao de 25/10, leitura das";

/**
 * Formats an ISO timestamp to Brasília hour and minute (HH:MM).
 * Deterministic and independent of visitor system clock (ELE-21).
 *
 * @param {string | undefined | null} isoString
 * @returns {string}
 */
export function formatReplayHourBrasilia(isoString) {
  if (!isoString || typeof isoString !== "string") {
    return "--:--";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatter.format(date);
}

/**
 * Formats an ISO timestamp to Brasília time string with timezone suffix.
 * Pattern: "HH:MM (Brasilia)" (ELE-21, RPL-03).
 *
 * @param {string | undefined | null} isoString
 * @returns {string}
 */
export function formatReplayTimeBrasilia(isoString) {
  const hourMinute = formatReplayHourBrasilia(isoString);
  if (hourMinute === "--:--") {
    return "--:-- (Brasilia)";
  }
  return `${hourMinute} (Brasilia)`;
}

/**
 * Formats the replay banner announcement text (RPL-03, TXT-01).
 * Pattern: "Gravacao de 25/10, leitura das HH:MM (Brasilia)".
 * Never contains "Ao vivo" or non-ASCII dashes.
 *
 * @param {string | undefined | null} isoString
 * @returns {string}
 */
export function formatReplayBannerText(isoString) {
  const timeFormatted = formatReplayTimeBrasilia(isoString);
  if (timeFormatted.startsWith("--:--")) {
    return "Gravacao de 25/10";
  }
  return `${REPLAY_BANNER_PREFIX} ${timeFormatted}`;
}

/**
 * Reconstructs cumulatively from frame 0 up to targetIndex the full map of municipalities
 * and the state-level consolidated result of SP (RPL-02).
 *
 * Ensures that the state at index k is identical to recorded reading k.
 *
 * @param {Record<string, any> | null} replayDoc
 * @param {number} targetIndex
 * @returns {ReconstructedReplayFrame}
 */
export function reconstructReplayFrame(replayDoc, targetIndex) {
  const emptyResult = {
    index: -1,
    t: 0,
    iso: "",
    sp: {
      leader: "",
      marginPp: 0,
      pctCounted: 0,
      sectionsCounted: 0,
      sectionsTotal: 0,
    },
    muns: {},
    isGap: false,
    gapBeforeSeconds: 0,
  };

  if (!replayDoc || !Array.isArray(replayDoc.frames) || replayDoc.frames.length === 0) {
    return emptyResult;
  }

  const frames = replayDoc.frames;
  const maxIndex = frames.length - 1;
  let clampedIndex = Number(targetIndex);

  if (!Number.isFinite(clampedIndex) || clampedIndex < 0) {
    clampedIndex = 0;
  }
  if (clampedIndex > maxIndex) {
    clampedIndex = maxIndex;
  }

  /** @type {Record<string, [string, number, number]>} */
  const accumulatedMuns = {};

  for (let i = 0; i <= clampedIndex; i += 1) {
    const frame = frames[i];
    if (frame && frame.muns && typeof frame.muns === "object") {
      const entries = Object.entries(frame.muns);
      for (let j = 0; j < entries.length; j += 1) {
        const [code, val] = entries[j];
        accumulatedMuns[code] = val;
      }
    }
  }

  const currentFrame = frames[clampedIndex];
  let rawSp = [];
  if (Array.isArray(currentFrame.sp)) {
    rawSp = currentFrame.sp;
  }

  let gapSeconds = 0;
  if (typeof currentFrame.gap_before_seconds === "number") {
    gapSeconds = currentFrame.gap_before_seconds;
  }

  const spState = {
    leader: String(rawSp[0] || ""),
    marginPp: Number(rawSp[1] || 0),
    pctCounted: Number(rawSp[2] || 0),
    sectionsCounted: Number(rawSp[3] || 0),
    sectionsTotal: Number(rawSp[4] || 0),
  };

  return {
    index: clampedIndex,
    t: Number(currentFrame.t || 0),
    iso: String(currentFrame.iso || ""),
    sp: spState,
    muns: accumulatedMuns,
    isGap: Boolean(currentFrame.is_gap),
    gapBeforeSeconds: gapSeconds,
  };
}

/**
 * Extracts a sequence of timeline markers for all frames in the replay document (RPL-04).
 *
 * @param {Record<string, any> | null} replayDoc
 * @returns {ReplayTimelineMarker[]}
 */
export function extractReplayTimeline(replayDoc) {
  if (!replayDoc || !Array.isArray(replayDoc.frames)) {
    return [];
  }

  const timeline = [];
  const frames = replayDoc.frames;

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    let rawSp = [];
    if (Array.isArray(frame.sp)) {
      rawSp = frame.sp;
    }
    let gapSeconds = 0;
    if (typeof frame.gap_before_seconds === "number") {
      gapSeconds = frame.gap_before_seconds;
    }
    const iso = String(frame.iso || "");

    timeline.push({
      index: i,
      t: Number(frame.t || 0),
      iso,
      formattedTime: formatReplayHourBrasilia(iso),
      formattedBrasilia: formatReplayTimeBrasilia(iso),
      pctCounted: Number(rawSp[2] || 0),
      isGap: Boolean(frame.is_gap),
      gapDurationSeconds: gapSeconds,
    });
  }

  return timeline;
}

/**
 * Identifies real temporal gaps > 5 minutes (> 300 s) preserved by recorder (RPL-05).
 * Returns list of interval descriptors with start and end indices and duration.
 *
 * @param {Record<string, any> | null} replayDoc
 * @param {number} [minGapSeconds=300]
 * @returns {ReplayGapInterval[]}
 */
export function findReplayGaps(replayDoc, minGapSeconds = DEFAULT_MIN_GAP_SECONDS) {
  if (!replayDoc || !Array.isArray(replayDoc.frames) || replayDoc.frames.length < 2) {
    return [];
  }

  const gaps = [];
  const frames = replayDoc.frames;

  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const curr = frames[i];
    let duration = 0;

    if (typeof curr.gap_before_seconds === "number" && curr.gap_before_seconds > minGapSeconds) {
      duration = curr.gap_before_seconds;
    }
    if (duration === 0) {
      const prevT = Number(prev.t || 0);
      const currT = Number(curr.t || 0);
      const diffT = currT - prevT;
      if (diffT > minGapSeconds) {
        duration = diffT;
      }
    }

    if (duration > minGapSeconds) {
      gaps.push({
        startIndex: i - 1,
        endIndex: i,
        durationSeconds: duration,
        startIso: String(prev.iso || ""),
        endIso: String(curr.iso || ""),
      });
    }
  }

  return gaps;
}
