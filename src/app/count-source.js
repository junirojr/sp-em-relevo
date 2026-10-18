import {
  buildMunicipalConfigUrl,
  buildStateTrackingUrl,
  buildTotalizationUrl,
  calculateFailureBackoff,
  createSessionBlocklist,
  detectElectedCandidate,
  hasTrackingChanged,
  isBlocked404,
  markHttp404,
  parseMunicipalCountPayload,
  parseTseJson,
  planMunicipalQueue,
} from "../domain/count-reader.js";

/**
 * Browser network adapter and polling engine for TSE live count (N13, APU-01 to APU-13).
 *
 * Implements:
 * - APU-01: Session 404 blocklist and TSE URL contract compliance
 * - APU-02: Zero municipal requests when tracking has not changed
 * - APU-03: Sequential descending-electorate queue with rate limit <= 10 req/s (interval >= 100ms)
 * - APU-04: Rejection of truncated/regressive files while retaining last valid packet
 * - APU-05: 10-minute backoff with jitter after 3 consecutive network failures
 * - APU-09: Prioritizes statewide SP aggregate, emits read count progress
 * - APU-10: Checks national proclamation exclusively on 'br' scope file
 * - APU-11: Pauses on document visibilitychange and resumes in <= 2s
 * - APU-12: Zero timer or listener leaks across 300+ cycles
 * - APU-13: Permanent termination when totalization concludes (tf === "s")
 *
 * @typedef {{
 *   fetchImpl?: typeof fetch,
 *   documentRef?: Document,
 *   electionCode?: string,
 *   host?: string,
 *   onStateUpdate?: (data: Record<string, unknown>) => void,
 *   onMunicipalUpdate?: (code: string, data: Record<string, unknown>) => void,
 *   onTrackingUpdate?: (tracking: { dg?: string, hg?: string, etag?: string }, isPaused: boolean) => void,
 *   onConnectionError?: (hour: string) => void,
 *   onConnectionRestored?: () => void,
 *   onProclamation?: (proclamation: {
 *     announced: boolean,
 *     candidate: { ballotNumber: string, name: string, party: string, status: string, elected: boolean } | null,
 *     announcementText: string | null
 *   }) => void,
 *   onConcluded?: () => void,
 *   pollIntervalMs?: number
 * }} CountSourceOptions
 */

export const DEFAULT_COUNT_POLL_INTERVAL_MS = 60000;
export const MIN_MUNICIPAL_REQUEST_INTERVAL_MS = 100;

/**
 * Creates a CountSource polling engine instance.
 *
 * @param {CountSourceOptions} [options={}]
 * @returns {{
 *   start: () => void,
 *   pause: () => void,
 *   resume: () => void,
 *   stop: () => void,
 *   destroy: () => void,
 *   runCycleNow: () => Promise<void>,
 *   getBlocklist: () => Set<string>,
 *   isRunning: () => boolean,
 *   isConcluded: () => boolean
 * }}
 */
export function createCountSource(options = {}) {
  let defaultFetch = null;
  if (typeof fetch !== "undefined") {
    defaultFetch = fetch;
  }
  const fetchImpl = options.fetchImpl ?? defaultFetch;

  let defaultDoc = null;
  if (typeof document !== "undefined") {
    defaultDoc = document;
  }
  const documentRef = options.documentRef ?? defaultDoc;
  const electionCode = options.electionCode ?? "6258";
  const host = options.host ?? "";
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_COUNT_POLL_INTERVAL_MS;

  const onStateUpdate = options.onStateUpdate;
  const onMunicipalUpdate = options.onMunicipalUpdate;
  const onTrackingUpdate = options.onTrackingUpdate;
  const onConnectionError = options.onConnectionError;
  const onConnectionRestored = options.onConnectionRestored;
  const onProclamation = options.onProclamation;
  const onConcluded = options.onConcluded;

  const blocklist404 = createSessionBlocklist();
  /** @type {Map<string, Record<string, unknown>>} */
  const retainedMunicipalData = new Map();
  /** @type {Record<string, { cd?: string, cdi?: string, nm?: string, elet?: number }>} */
  let municipalConfigMap = {};
  let municipalConfigLoaded = false;

  let isPolling = false;
  let isPausedByVisibility = false;
  let isConcludedFlag = false;
  let isCycleInFlight = false;
  let activeTimeoutId = null;
  let consecutiveFailures = 0;
  let previousTracking = null;
  let lastSuccessfulHour = "";
  let proclamationAnnounced = false;

  function clearActiveTimer() {
    if (activeTimeoutId !== null) {
      clearTimeout(activeTimeoutId);
      activeTimeoutId = null;
    }
  }

  function scheduleNextCycle(delayMs = pollIntervalMs) {
    clearActiveTimer();
    if (!isPolling || isConcludedFlag || isPausedByVisibility) {
      return;
    }
    activeTimeoutId = setTimeout(() => {
      activeTimeoutId = null;
      runCycle().catch((_err) => {});
    }, delayMs);
  }

  async function fetchWith404Handling(url) {
    if (!fetchImpl) {
      return { ok: false, status: 0, data: null };
    }
    if (isBlocked404(blocklist404, url)) {
      return { ok: false, status: 404, data: null };
    }

    let response;
    try {
      response = await fetchImpl(url);
    } catch (_networkError) {
      return { ok: false, status: 0, data: null };
    }

    if (response.status === 404) {
      markHttp404(blocklist404, url);
      return { ok: false, status: 404, data: null };
    }

    if (!response.ok) {
      return { ok: false, status: response.status, data: null };
    }

    let textData;
    try {
      textData = await response.text();
    } catch (_err) {
      return { ok: false, status: 200, data: null };
    }

    const jsonParsed = parseTseJson(textData);
    if (!jsonParsed.ok) {
      return { ok: false, status: 200, data: null };
    }

    return {
      ok: true,
      status: 200,
      data: jsonParsed.data,
      etag: response.headers?.get("etag") ?? "",
    };
  }

  async function ensureMunicipalConfigLoaded() {
    if (municipalConfigLoaded) {
      return true;
    }
    const configUrl = buildMunicipalConfigUrl(electionCode, host);
    const res = await fetchWith404Handling(configUrl);
    if (!res.ok || !res.data) {
      return false;
    }

    const abrList = res.data.abr;
    if (Array.isArray(abrList)) {
      for (const item of abrList) {
        if (!item || typeof item !== "object") {
          continue;
        }
        const muList = /** @type {any} */ (item).mu;
        if (Array.isArray(muList)) {
          for (const mu of muList) {
            const cd = String(mu.cd ?? "").trim().padStart(5, "0");
            if (cd) {
              municipalConfigMap[cd] = {
                cd,
                cdi: String(mu.cdi ?? ""),
                nm: String(mu.nm ?? cd),
                elet: Number(mu.elet ?? mu.electorate ?? 0),
              };
            }
          }
        }
      }
    }
    municipalConfigLoaded = true;
    return true;
  }

  async function runCycle() {
    if (isCycleInFlight || !isPolling || isConcludedFlag || isPausedByVisibility) {
      return;
    }
    isCycleInFlight = true;

    try {
      await ensureMunicipalConfigLoaded();

      // 1. Priority 1: Fetch state tracking file (APU-01, APU-02, APU-09)
      const trackingUrl = buildStateTrackingUrl(electionCode, host);
      const trackingRes = await fetchWith404Handling(trackingUrl);

      if (!trackingRes.ok) {
        consecutiveFailures += 1;
        if (typeof onConnectionError === "function") {
          onConnectionError(lastSuccessfulHour);
        }
        const backoff = calculateFailureBackoff({ consecutiveFailures });
        let nextDelay = pollIntervalMs;
        if (backoff.inBackoff) {
          nextDelay = backoff.backoffMs;
        }
        scheduleNextCycle(nextDelay);
        return;
      }

      // Connection restored if it was previously in failure
      if (consecutiveFailures > 0) {
        consecutiveFailures = 0;
        if (typeof onConnectionRestored === "function") {
          onConnectionRestored();
        }
      }

      const trackingData = trackingRes.data ?? {};
      const currentTracking = {
        dg: String(trackingData.dg ?? ""),
        hg: String(trackingData.hg ?? ""),
        etag: trackingRes.etag,
      };

      if (currentTracking.hg) {
        lastSuccessfulHour = currentTracking.hg;
      }

      const trackingChanged = hasTrackingChanged(previousTracking, currentTracking);
      const isTrackingPaused = !trackingChanged && previousTracking !== null;

      if (typeof onTrackingUpdate === "function") {
        onTrackingUpdate(currentTracking, isTrackingPaused);
      }

      // If tracking hasn't changed, perform ZERO municipal requests (APU-02)
      if (!trackingChanged && previousTracking !== null) {
        scheduleNextCycle(pollIntervalMs);
        return;
      }

      previousTracking = currentTracking;

      // 2. Fetch statewide SP aggregate immediately (APU-09)
      const spAggregateUrl = buildTotalizationUrl({
        electionCode,
        scope: "sp",
        host,
        blocked404Set: blocklist404,
      });

      if (spAggregateUrl) {
        const spRes = await fetchWith404Handling(spAggregateUrl);
        if (spRes.ok && spRes.data) {
          const parsedState = parseMunicipalCountPayload(spRes.data);
          if (parsedState.ok && parsedState.data) {
            if (typeof onStateUpdate === "function") {
              onStateUpdate(parsedState.data);
            }
            if (String(parsedState.data.tf).toLowerCase() === "s") {
              isConcludedFlag = true;
              if (typeof onConcluded === "function") {
                onConcluded();
              }
              return;
            }
          }
        }
      }

      // 3. Proclamation check on national 'br' file (APU-10)
      if (!proclamationAnnounced) {
        const brUrl = buildTotalizationUrl({
          electionCode,
          scope: "br",
          host,
          blocked404Set: blocklist404,
        });
        if (brUrl) {
          const brRes = await fetchWith404Handling(brUrl);
          if (brRes.ok && brRes.data) {
            const proclamation = detectElectedCandidate(brRes.data);
            if (proclamation.announced) {
              proclamationAnnounced = true;
              if (typeof onProclamation === "function") {
                onProclamation(proclamation);
              }
            }
          }
        }
      }

      let rawTrackingMunicipalities = [];
      if (Array.isArray(trackingData.abr)) {
        rawTrackingMunicipalities = trackingData.abr.flatMap((a) => {
          if (Array.isArray(a.mu)) {
            return a.mu;
          }
          return [];
        });
      }

      const queuePlan = planMunicipalQueue({
        trackingMunicipalities: rawTrackingMunicipalities,
        municipalConfigMap,
        blocked404Set: blocklist404,
      });

      for (const item of queuePlan.queue) {
        if (!isPolling || isPausedByVisibility || isConcludedFlag) {
          break;
        }

        const munUrl = buildTotalizationUrl({
          electionCode,
          scope: "mun",
          tseCode: item.cd,
          host,
          blocked404Set: blocklist404,
        });

        if (!munUrl) {
          continue;
        }

        const munRes = await fetchWith404Handling(munUrl);
        if (munRes.ok && munRes.data) {
          const prevGood = retainedMunicipalData.get(item.cd) ?? null;
          const parsed = parseMunicipalCountPayload(munRes.data, prevGood);
          if (parsed.ok && parsed.data) {
            retainedMunicipalData.set(item.cd, parsed.data);
            const emitCode = item.cdi || item.cd;
            if (typeof onMunicipalUpdate === "function") {
              onMunicipalUpdate(emitCode, parsed.data);
            }
          }
        }

        // Self-imposed rate throttle (<= 10 req/s, APU-03)
        await delay(MIN_MUNICIPAL_REQUEST_INTERVAL_MS);
      }

      scheduleNextCycle(pollIntervalMs);
    } finally {
      isCycleInFlight = false;
    }
  }

  function handleVisibilityChange() {
    if (!documentRef) {
      return;
    }
    if (documentRef.hidden) {
      // Pause polling while tab is hidden (APU-11)
      isPausedByVisibility = true;
      clearActiveTimer();
      return;
    }

    // Tab became visible again: resume in <= 2s (APU-11)
    if (isPausedByVisibility && isPolling && !isConcludedFlag) {
      isPausedByVisibility = false;
      clearActiveTimer();
      // Resume quickly (<= 2 seconds)
      scheduleNextCycle(100);
    }
  }

  if (documentRef && typeof documentRef.addEventListener === "function") {
    documentRef.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return {
    start() {
      if (isPolling) {
        return;
      }
      isPolling = true;
      isPausedByVisibility = Boolean(documentRef?.hidden);
      scheduleNextCycle(0);
    },
    pause() {
      isPolling = false;
      clearActiveTimer();
    },
    resume() {
      if (isConcludedFlag) {
        return;
      }
      isPolling = true;
      isPausedByVisibility = Boolean(documentRef?.hidden);
      scheduleNextCycle(0);
    },
    stop() {
      isPolling = false;
      clearActiveTimer();
    },
    destroy() {
      isPolling = false;
      clearActiveTimer();
      if (documentRef && typeof documentRef.removeEventListener === "function") {
        documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    },
    async runCycleNow() {
      await runCycle();
    },
    getBlocklist() {
      return blocklist404;
    },
    isRunning() {
      return isPolling && !isConcludedFlag;
    },
    isConcluded() {
      return isConcludedFlag;
    },
  };
}

/**
 * Promise-based delay helper without setTimeout leaks.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
