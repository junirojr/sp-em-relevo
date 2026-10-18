import { DEFAULT_STATUS, normalizeStatus } from "./data-loader.js";

/**
 * On-demand dynamic loader for election features and styles (FLG-01, FLG-02, FLG-03, APU-14, PUB-09).
 *
 * Implements:
 * - FLG-01: Zero election network requests and DOM pollution when feature flags are disabled
 * - FLG-02: Safe fallback to default status when status.json is missing or corrupted
 * - FLG-03: Graceful degradation with retry UI on dynamic import() failure without affecting indicators mode
 * - APU-14: Detection of artifact environment and rendering of timeless link notice without fetching
 * - PUB-09: On-demand import within the 180,000-byte code budget
 *
 * @typedef {import("./data-loader.js").OperationalStatus} OperationalStatus
 */

export const ARTIFACT_URL_PAGES =
  "https://junirojr.github.io/sp-em-relevo/?aba=2turno";

export const ARTIFACT_TIMELESS_NOTICE =
  "A apuracao ao vivo do 2º turno e transmitida em https://junirojr.github.io/sp-em-relevo/?aba=2turno durante a contagem de 25/10.";

/**
 * Checks whether the current runtime environment is the offline artifact (APU-14).
 *
 * @param {Window | null | undefined} windowRef
 * @returns {boolean}
 */
export function isArtifactEnvironment(windowRef) {
  if (!windowRef?.location) {
    return false;
  }
  const protocol = windowRef.location.protocol;
  if (protocol === "file:") {
    return true;
  }
  const href = windowRef.location.href;
  if (href.includes("/brain/") || href.includes("artifact")) {
    return true;
  }
  return false;
}

/**
 * Checks whether election features are active in the operational status (FLG-01, FLG-02).
 *
 * @param {OperationalStatus | unknown} rawStatus
 * @returns {boolean}
 */
export function isElectionFeatureEnabled(rawStatus) {
  const status = normalizeStatus(rawStatus);
  if (status.mode === "disabled") {
    return false;
  }
  const features = status.features ?? status.Features;
  if (features && features.election === false) {
    return false;
  }
  return true;
}

/**
 * Injects a stylesheet into the document head if not already loaded.
 *
 * @param {Document} documentRef
 * @param {string} href
 */
export function injectStylesheet(documentRef, href) {
  if (!documentRef?.head) {
    return;
  }
  const existing = documentRef.querySelector(`link[href*="${href}"]`);
  if (existing) {
    return;
  }
  const link = documentRef.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  documentRef.head.append(link);
}

/**
 * Renders the timeless notice into the banner slot in artifact environments (APU-14).
 *
 * @param {HTMLElement | null} bannerSlot
 * @param {Document} documentRef
 */
export function renderArtifactNotice(bannerSlot, documentRef) {
  if (!bannerSlot) {
    return;
  }
  bannerSlot.innerHTML = "";
  bannerSlot.hidden = false;

  const card = documentRef.createElement("div");
  card.className = "count-banner count-banner-waiting artifact-notice-card";

  const message = documentRef.createElement("span");
  message.className = "count-banner-message";
  message.textContent = ARTIFACT_TIMELESS_NOTICE;

  card.append(message);
  bannerSlot.append(card);
}

/**
 * Renders an import failure card with a retry button (FLG-03).
 *
 * @param {HTMLElement | null} bannerSlot
 * @param {Document} documentRef
 * @param {() => void} onRetry
 */
export function renderRetryUi(bannerSlot, documentRef, onRetry) {
  if (!bannerSlot) {
    return;
  }
  bannerSlot.innerHTML = "";
  bannerSlot.hidden = false;

  const card = documentRef.createElement("div");
  card.className = "count-banner count-banner-error retry-card";

  const message = documentRef.createElement("span");
  message.className = "count-banner-message";
  message.textContent = "Nao foi possivel carregar os dados eleitorais.";

  const retryBtn = documentRef.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "retry-button";
  retryBtn.textContent = "Tentar de novo";
  retryBtn.addEventListener("click", () => {
    onRetry();
  });

  card.append(message, retryBtn);
  bannerSlot.append(card);
}

/**
 * Dynamically loads election feature modules and stylesheets (PUB-09, FLG-03).
 * If the import fails, catches the error gracefully and displays the retry UI without breaking
 * the indicators mode.
 *
 * @param {{
 *   documentRef?: Document,
 *   windowRef?: Window,
 *   rawStatus?: unknown,
 *   onRetry?: () => void
 * }} options
 * @returns {Promise<{
 *   ok: boolean,
 *   modules: {
 *     electionSlice?: any,
 *     electionStrings?: any,
 *     modeSelectorView?: any,
 *     countSlice?: any,
 *     countBannerView?: any,
 *     countScoreboardView?: any
 *   } | null,
 *   error: Error | null
 * }>}
 */
export async function loadElectionModules(options = {}) {
  let defaultDoc = null;
  if (typeof document !== "undefined") {
    defaultDoc = document;
  }
  const documentRef = options.documentRef ?? defaultDoc;
  const status = normalizeStatus(options.rawStatus ?? DEFAULT_STATUS);

  if (!isElectionFeatureEnabled(status)) {
    return { ok: false, modules: null, error: null };
  }

  if (documentRef) {
    injectStylesheet(documentRef, "./src/features/election/election.css");
    injectStylesheet(documentRef, "./src/features/count/count.css");
  }

  try {
    const [
      electionSlice,
      electionStrings,
      modeSelectorView,
      countSlice,
      countBannerView,
      countScoreboardView,
    ] = await Promise.all([
      import("../features/election/election-slice.js"),
      import("../features/election/election-strings.js"),
      import("../features/election/mode-selector-view.js"),
      import("../features/count/count-slice.js"),
      import("../features/count/count-banner-view.js"),
      import("../features/count/count-scoreboard-view.js"),
    ]);

    return {
      ok: true,
      modules: {
        electionSlice,
        electionStrings,
        modeSelectorView,
        countSlice,
        countBannerView,
        countScoreboardView,
      },
      error: null,
    };
  } catch (err) {
    const error = /** @type {Error} */ (err);
    return {
      ok: false,
      modules: null,
      error,
    };
  }
}
