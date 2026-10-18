import {
  extractReplayTimeline,
  findReplayGaps,
  formatReplayBannerText,
  formatReplayHourBrasilia,
  formatReplayTimeBrasilia,
  reconstructReplayFrame,
} from "../../domain/replay.js";

/**
 * Replay view component inside the responsive shell (N17, RPL-01, RPL-03, RPL-04, RPL-05, ACE-04).
 *
 * Renders into `#election-replay-slot`.
 *
 * Requirements:
 * - Hidden without error when replay.available is false or replayDoc is missing (RPL-01).
 * - Opens automatically at the last recorded frame (targetIndex = frames.length - 1) (RPL-03).
 * - Displays "Gravacao de 25/10, leitura das HH:MM (Brasilia)" and NEVER "Ao vivo" (RPL-03).
 * - Accessible time slider <input type="range"> announcing hour and % counted (RPL-04).
 * - Keyboard navigation (ArrowLeft, ArrowRight, Home, End) without autoplay (RPL-04).
 * - Instant frame application without smoothing on slider interaction (RPL-05).
 * - Real temporal gaps > 5 minutes (300 s) visually marked on the timeline track (RPL-05).
 * - Interactive buttons with minimum target size >= 24x24 px CSS (ACE-04).
 *
 * PROHIBITIONS:
 * - No else statements, no ternary operators.
 * - No en-dash (U+2013) or em-dash (U+2014).
 *
 * @typedef {import("../../domain/replay.js").ReconstructedReplayFrame} ReconstructedReplayFrame
 * @typedef {import("../../domain/replay.js").ReplayTimelineMarker} ReplayTimelineMarker
 * @typedef {import("../../domain/replay.js").ReplayGapInterval} ReplayGapInterval
 *
 * @typedef {{
 *   replayDoc?: Record<string, any> | null,
 *   isAvailable?: boolean,
 *   initialFrameIndex?: number,
 *   onFrameChange?: (frame: ReconstructedReplayFrame) => void,
 *   onBannerTextChange?: (bannerText: string) => void
 * }} ReplayViewOptions
 */

/**
 * Mounts the electoral replay view into the provided slot element.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} slotElement
 * @param {ReplayViewOptions} [options={}]
 * @returns {{
 *   element: HTMLElement,
 *   setReplayDoc: (doc: Record<string, any> | null) => void,
 *   setIndex: (index: number) => void,
 *   getCurrentIndex: () => number,
 *   getCurrentFrame: () => ReconstructedReplayFrame | null,
 *   getTimeline: () => ReplayTimelineMarker[],
 *   update: (opts?: { isVisible?: boolean, isAvailable?: boolean, replayDoc?: Record<string, any> | null }) => void,
 *   destroy: () => void
 * }}
 */
export function mountReplayView(documentRef, slotElement, options = {}) {
  let isAvailable = Boolean(options.isAvailable);
  let replayDoc = options.replayDoc || null;
  const onFrameChange = options.onFrameChange;
  const onBannerTextChange = options.onBannerTextChange;

  let currentIndex = -1;
  let currentFrame = null;
  let timeline = [];
  let gaps = [];

  slotElement.className = "count-replay-slot";

  // Build DOM layout
  const container = documentRef.createElement("div");
  container.className = "replay-view";

  // Header section
  const header = documentRef.createElement("div");
  header.className = "replay-header";

  const titleRow = documentRef.createElement("div");
  titleRow.className = "replay-title-row";

  const badge = documentRef.createElement("span");
  badge.className = "replay-badge";
  badge.textContent = "Replay";

  const title = documentRef.createElement("h2");
  title.className = "replay-title";
  title.textContent = "Linha do tempo da totalizacao";

  titleRow.append(badge, title);

  const bannerNotice = documentRef.createElement("div");
  bannerNotice.className = "replay-banner-notice";
  bannerNotice.setAttribute("role", "status");
  bannerNotice.setAttribute("aria-live", "polite");

  header.append(titleRow, bannerNotice);

  // Slider container section
  const sliderContainer = documentRef.createElement("div");
  sliderContainer.className = "replay-slider-container";

  const trackWrap = documentRef.createElement("div");
  trackWrap.className = "replay-slider-track-wrap";

  const slider = documentRef.createElement("input");
  slider.type = "range";
  slider.className = "replay-slider";
  slider.setAttribute("aria-label", "Controle de tempo do replay");

  const gapIndicatorsContainer = documentRef.createElement("div");
  gapIndicatorsContainer.className = "replay-gap-indicators";
  gapIndicatorsContainer.setAttribute("aria-hidden", "true");

  trackWrap.append(slider, gapIndicatorsContainer);

  const sliderLabels = documentRef.createElement("div");
  sliderLabels.className = "replay-slider-labels";

  const timeStart = documentRef.createElement("span");
  timeStart.className = "replay-time-start";

  const currentIndicator = documentRef.createElement("span");
  currentIndicator.className = "replay-current-indicator";

  const timeEnd = documentRef.createElement("span");
  timeEnd.className = "replay-time-end";

  sliderLabels.append(timeStart, currentIndicator, timeEnd);
  sliderContainer.append(trackWrap, sliderLabels);

  // Controls toolbar section (ACE-04 target size >= 24x24 px CSS)
  const controls = documentRef.createElement("div");
  controls.className = "replay-controls";
  controls.setAttribute("role", "toolbar");
  controls.setAttribute("aria-label", "Navegacao do replay");

  const btnFirst = documentRef.createElement("button");
  btnFirst.type = "button";
  btnFirst.className = "replay-btn replay-btn-first";
  btnFirst.setAttribute("aria-label", "Ir para o inicio do replay");
  btnFirst.innerHTML = '<span aria-hidden="true">&laquo;</span>';

  const btnPrev = documentRef.createElement("button");
  btnPrev.type = "button";
  btnPrev.className = "replay-btn replay-btn-prev";
  btnPrev.setAttribute("aria-label", "Quadro anterior");
  btnPrev.innerHTML = '<span aria-hidden="true">&lsaquo;</span>';

  const frameCounter = documentRef.createElement("span");
  frameCounter.className = "replay-frame-counter";

  const btnNext = documentRef.createElement("button");
  btnNext.type = "button";
  btnNext.className = "replay-btn replay-btn-next";
  btnNext.setAttribute("aria-label", "Proximo quadro");
  btnNext.innerHTML = '<span aria-hidden="true">&rsaquo;</span>';

  const btnLast = documentRef.createElement("button");
  btnLast.type = "button";
  btnLast.className = "replay-btn replay-btn-last";
  btnLast.setAttribute("aria-label", "Ir para o fim do replay");
  btnLast.innerHTML = '<span aria-hidden="true">&raquo;</span>';

  controls.append(btnFirst, btnPrev, frameCounter, btnNext, btnLast);

  // Gap alert notification
  const gapNotice = documentRef.createElement("div");
  gapNotice.className = "replay-gap-notice";
  gapNotice.hidden = true;

  const gapIcon = documentRef.createElement("span");
  gapIcon.className = "replay-gap-icon";
  gapIcon.setAttribute("aria-hidden", "true");
  gapIcon.textContent = "!";

  const gapText = documentRef.createElement("span");
  gapText.className = "replay-gap-text";

  gapNotice.append(gapIcon, gapText);

  container.append(header, sliderContainer, controls, gapNotice);
  slotElement.innerHTML = "";
  slotElement.append(container);

  /**
   * Applies state at the specified frame index.
   *
   * @param {number} targetIndex
   */
  function applyIndex(targetIndex) {
    if (!replayDoc || !Array.isArray(replayDoc.frames) || replayDoc.frames.length === 0) {
      return;
    }

    const totalFrames = replayDoc.frames.length;
    const maxIdx = totalFrames - 1;
    let clamped = Number(targetIndex);
    if (!Number.isFinite(clamped) || clamped < 0) {
      clamped = 0;
    }
    if (clamped > maxIdx) {
      clamped = maxIdx;
    }

    currentIndex = clamped;
    currentFrame = reconstructReplayFrame(replayDoc, currentIndex);

    const marker = timeline[currentIndex] || {
      formattedTime: formatReplayHourBrasilia(currentFrame.iso),
      formattedBrasilia: formatReplayTimeBrasilia(currentFrame.iso),
      pctCounted: currentFrame.sp.pctCounted,
    };

    // Update slider attributes (RPL-04)
    slider.value = String(currentIndex);
    slider.setAttribute("aria-valuenow", String(currentIndex));

    const pctFormatted = marker.pctCounted.toFixed(2).replace(".", ",");
    const ariaValueText = `${marker.formattedTime} - ${pctFormatted}% apurado`;
    slider.setAttribute("aria-valuetext", ariaValueText);

    // Update banner text (RPL-03)
    const bannerText = formatReplayBannerText(currentFrame.iso);
    bannerNotice.textContent = bannerText;

    if (typeof onBannerTextChange === "function") {
      onBannerTextChange(bannerText);
    }

    // Update indicator labels
    currentIndicator.textContent = `${marker.formattedTime} (${pctFormatted}% apurado)`;
    frameCounter.textContent = `Quadro ${currentIndex + 1} de ${totalFrames}`;

    // Update gap notification if current frame follows a real gap > 300s (RPL-05)
    if (currentFrame.isGap && currentFrame.gapBeforeSeconds > 300) {
      const minutes = Math.round(currentFrame.gapBeforeSeconds / 60);
      gapText.textContent = `Lacuna de transmissao de ${minutes} minutos preservada sem interpolacao`;
      gapNotice.hidden = false;
    }
    if (!currentFrame.isGap || currentFrame.gapBeforeSeconds <= 300) {
      gapNotice.hidden = true;
    }

    // Invoke callback for engine and map synchronization without smoothing (RPL-05)
    if (typeof onFrameChange === "function") {
      onFrameChange(currentFrame);
    }
  }

  /**
   * Renders gap indicators across the timeline track (RPL-05).
   */
  function renderGapIndicators() {
    gapIndicatorsContainer.innerHTML = "";
    if (!replayDoc || !Array.isArray(replayDoc.frames) || replayDoc.frames.length < 2) {
      return;
    }

    const totalFrames = replayDoc.frames.length;
    const maxIdx = totalFrames - 1;

    for (let i = 0; i < gaps.length; i += 1) {
      const gap = gaps[i];
      const marker = documentRef.createElement("div");
      marker.className = "replay-gap-indicator";
      const leftPct = (gap.endIndex / maxIdx) * 100;
      marker.style.left = `${leftPct.toFixed(2)}%`;

      const minutes = Math.round(gap.durationSeconds / 60);
      const gapLabel = `Lacuna de transmissao: ${minutes} min (${gap.durationSeconds} s)`;
      marker.setAttribute("title", gapLabel);
      marker.setAttribute("aria-label", gapLabel);
      gapIndicatorsContainer.append(marker);
    }
  }

  /**
   * Refreshes view structure when replay document changes.
   */
  function refreshDocument() {
    if (!isAvailable || !replayDoc || !Array.isArray(replayDoc.frames) || replayDoc.frames.length === 0) {
      slotElement.hidden = true;
      return;
    }

    slotElement.hidden = false;
    timeline = extractReplayTimeline(replayDoc);
    gaps = findReplayGaps(replayDoc);

    const totalFrames = replayDoc.frames.length;
    const maxIndex = totalFrames - 1;

    slider.min = "0";
    slider.max = String(maxIndex);
    slider.step = "1";
    slider.setAttribute("aria-valuemin", "0");
    slider.setAttribute("aria-valuemax", String(maxIndex));

    if (timeline.length > 0) {
      timeStart.textContent = timeline[0].formattedTime;
      timeEnd.textContent = timeline[timeline.length - 1].formattedTime;
    }

    renderGapIndicators();

    // Default to last recorded frame (RPL-03)
    let initialIdx = maxIndex;
    if (typeof options.initialFrameIndex === "number" && options.initialFrameIndex >= 0) {
      initialIdx = Math.min(options.initialFrameIndex, maxIndex);
    }
    applyIndex(initialIdx);
  }

  // Event handlers
  function handleSliderInput(e) {
    const val = Number(e.target.value);
    applyIndex(val);
  }

  function handleSliderKeydown(e) {
    if (e.key === "Home") {
      e.preventDefault();
      applyIndex(0);
      return;
    }
    if (e.key === "End") {
      if (replayDoc && Array.isArray(replayDoc.frames)) {
        e.preventDefault();
        applyIndex(replayDoc.frames.length - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      applyIndex(currentIndex - 1);
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      applyIndex(currentIndex + 1);
    }
  }

  function handleFirstClick() {
    applyIndex(0);
  }

  function handlePrevClick() {
    applyIndex(currentIndex - 1);
  }

  function handleNextClick() {
    applyIndex(currentIndex + 1);
  }

  function handleLastClick() {
    if (replayDoc && Array.isArray(replayDoc.frames)) {
      applyIndex(replayDoc.frames.length - 1);
    }
  }

  slider.addEventListener("input", handleSliderInput);
  slider.addEventListener("change", handleSliderInput);
  slider.addEventListener("keydown", handleSliderKeydown);

  btnFirst.addEventListener("click", handleFirstClick);
  btnPrev.addEventListener("click", handlePrevClick);
  btnNext.addEventListener("click", handleNextClick);
  btnLast.addEventListener("click", handleLastClick);

  // Initial render
  refreshDocument();

  return {
    element: slotElement,
    setReplayDoc(doc) {
      replayDoc = doc;
      refreshDocument();
    },
    setIndex(idx) {
      applyIndex(idx);
    },
    getCurrentIndex() {
      return currentIndex;
    },
    getCurrentFrame() {
      return currentFrame;
    },
    getTimeline() {
      return [...timeline];
    },
    update(opts = {}) {
      if (typeof opts.isAvailable === "boolean") {
        isAvailable = opts.isAvailable;
      }
      if (opts.replayDoc !== undefined) {
        replayDoc = opts.replayDoc;
      }
      if (opts.isVisible === false) {
        slotElement.hidden = true;
        return;
      }
      refreshDocument();
    },
    destroy() {
      slider.removeEventListener("input", handleSliderInput);
      slider.removeEventListener("change", handleSliderInput);
      slider.removeEventListener("keydown", handleSliderKeydown);
      btnFirst.removeEventListener("click", handleFirstClick);
      btnPrev.removeEventListener("click", handlePrevClick);
      btnNext.removeEventListener("click", handleNextClick);
      btnLast.removeEventListener("click", handleLastClick);
      slotElement.innerHTML = "";
      slotElement.hidden = true;
    },
  };
}
