/**
 * Administrative region labels projection and collision resolution (REG-03, BAS-04, BAS-09).
 * Projects the 16 administrative region names over the map in light and dark themes.
 * Uses a bounding-box collision detection algorithm: labels that do not fit the stage
 * or collide with a higher-priority label are discarded (hidden) on the map and remain
 * accessible in the alternative data table.
 *
 * @typedef {{
 *   code: string,
 *   label: string,
 *   shortLabel: string,
 *   x: number,
 *   y: number,
 *   priority: number
 * }} RegionLabelDefinition
 *
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number
 * }} BoundingBox
 *
 * @typedef {{
 *   code: string,
 *   label: string,
 *   box: BoundingBox,
 *   visible: boolean,
 *   inTable: boolean,
 *   reason?: "outOfBounds" | "collision"
 * }} LabelPlacement
 *
 * @typedef {{
 *   element: HTMLElement,
 *   update: (width: number, height: number) => LabelPlacement[],
 *   getPlacements: () => LabelPlacement[],
 *   getLabels: () => HTMLElement[],
 *   destroy: () => void
 * }} RegionLabelsView
 */

/**
 * 16 administrative region label definitions with normalized centroids (0..1)
 * calculated from the state topology and administrative hierarchy.
 * Priority orders largest agglomerations first during conflict resolution.
 *
 * @type {readonly RegionLabelDefinition[]}
 */
export const REGION_LABEL_DEFINITIONS = [
  { code: "1", label: "RM São Paulo", shortLabel: "RM São Paulo", x: 0.79, y: 0.76, priority: 1 },
  { code: "6", label: "RA Campinas", shortLabel: "Campinas", x: 0.71, y: 0.51, priority: 2 },
  { code: "7", label: "RA Ribeirão Preto", shortLabel: "Ribeirão Preto", x: 0.60, y: 0.19, priority: 3 },
  { code: "3", label: "RA Santos", shortLabel: "Santos", x: 0.81, y: 0.86, priority: 4 },
  { code: "4", label: "RA São José dos Campos", shortLabel: "São José dos Campos", x: 0.96, y: 0.62, priority: 5 },
  { code: "5", label: "RA Sorocaba", shortLabel: "Sorocaba", x: 0.57, y: 0.69, priority: 6 },
  { code: "8", label: "RA Bauru", shortLabel: "Bauru", x: 0.38, y: 0.41, priority: 7 },
  { code: "2", label: "RA Registro", shortLabel: "Registro", x: 0.60, y: 0.98, priority: 8 },
  { code: "9", label: "RA São José do Rio Preto", shortLabel: "São José do Rio Preto", x: 0.26, y: 0.05, priority: 9 },
  { code: "11", label: "RA Presidente Prudente", shortLabel: "Presidente Prudente", x: 0.05, y: 0.36, priority: 10 },
  { code: "10", label: "RA Araçatuba", shortLabel: "Araçatuba", x: 0.14, y: 0.15, priority: 11 },
  { code: "12", label: "RA Marília", shortLabel: "Marília", x: 0.22, y: 0.49, priority: 12 },
  { code: "13", label: "RA Central", shortLabel: "Central", x: 0.52, y: 0.31, priority: 13 },
  { code: "14", label: "RA Barretos", shortLabel: "Barretos", x: 0.46, y: 0.08, priority: 14 },
  { code: "15", label: "RA Franca", shortLabel: "Franca", x: 0.62, y: 0.03, priority: 15 },
  { code: "16", label: "RA Itapeva", shortLabel: "Itapeva", x: 0.40, y: 0.84, priority: 16 },
];

export const DEFAULT_LABEL_HEIGHT = 22;
export const DEFAULT_PADDING_PX = 4;
export const DEFAULT_MARGIN_PX = 12;

/**
 * Pure collision and boundary discard algorithm for bounding boxes (REG-03).
 * When candidate boxes overlap, the lower priority candidate is discarded (hidden on map,
 * retained in table).
 *
 * @param {readonly RegionLabelDefinition[]} definitions
 * @param {number} stageWidth
 * @param {number} stageHeight
 * @param {{
 *   padding?: number,
 *   margin?: number,
 *   estimateWidth?: (text: string) => number,
 *   labelHeight?: number
 *   labelHeight?: number,
 *   occlusionBoxes?: BoundingBox[],
 *   useShortLabel?: boolean
 * }} [options]
 * @returns {LabelPlacement[]}
 */
export function computeLabelCollisions(
  definitions,
  stageWidth,
  stageHeight,
  options = {},
) {
  const padding = options.padding ?? DEFAULT_PADDING_PX;
  const margin = options.margin ?? DEFAULT_MARGIN_PX;
  const labelHeight = options.labelHeight ?? DEFAULT_LABEL_HEIGHT;
  const estimateWidth = options.estimateWidth ?? estimateLabelWidth;
  const occlusionBoxes = options.occlusionBoxes ?? [];
  const useShortLabel = options.useShortLabel ?? true;

  const sorted = [...definitions].sort((a, b) => a.priority - b.priority);
  /** @type {BoundingBox[]} */
  const acceptedBoxes = [];
  /** @type {LabelPlacement[]} */
  const placements = [];

  const availableWidth = Math.max(1, stageWidth - 2 * margin);
  const availableHeight = Math.max(1, stageHeight - 2 * margin);

  for (let i = 0; i < sorted.length; i += 1) {
    const item = sorted[i];
    let displayText = item.label;
    if (useShortLabel && item.shortLabel) {
      displayText = item.shortLabel;
    }
    const width = estimateWidth(displayText);
    const centerX = margin + item.x * availableWidth;
    const centerY = margin + item.y * availableHeight;

    const candidateBox = {
      x: centerX - width / 2,
      y: centerY - labelHeight / 2,
      width,
      height: labelHeight,
    };

    const isOutOfBounds = isBoxOutOfBounds(candidateBox, stageWidth, stageHeight);
    if (isOutOfBounds) {
      placements.push({
        code: item.code,
        label: displayText,
        box: candidateBox,
        visible: false,
        inTable: true,
        reason: "outOfBounds",
      });
      continue;
    }

    const collidesWithOcclusion = checkCollisions(candidateBox, occlusionBoxes, padding);
    if (collidesWithOcclusion) {
      placements.push({
        code: item.code,
        label: displayText,
        box: candidateBox,
        visible: false,
        inTable: true,
        reason: "collision",
      });
      continue;
    }

    const collides = checkCollisions(candidateBox, acceptedBoxes, padding);
    if (collides) {
      placements.push({
        code: item.code,
        label: displayText,
        box: candidateBox,
        visible: false,
        inTable: true,
        reason: "collision",
      });
      continue;
    }

    acceptedBoxes.push(candidateBox);
    placements.push({
      code: item.code,
      label: displayText,
      box: candidateBox,
      visible: true,
      inTable: true,
    });
  }

  return placements;
}

/**
 * Checks whether two boxes overlap with a specified spacing padding.
 *
 * @param {BoundingBox} boxA
 * @param {BoundingBox} boxB
 * @param {number} padding
 * @returns {boolean}
 */
export function areBoxesOverlapping(boxA, boxB, padding = DEFAULT_PADDING_PX) {
  if (boxA.x + boxA.width + padding <= boxB.x) {
    return false;
  }
  if (boxB.x + boxB.width + padding <= boxA.x) {
    return false;
  }
  if (boxA.y + boxA.height + padding <= boxB.y) {
    return false;
  }
  if (boxB.y + boxB.height + padding <= boxA.y) {
    return false;
  }
  return true;
}

/**
 * Checks whether a candidate box collides with any accepted box.
 *
 * @param {BoundingBox} candidate
 * @param {BoundingBox[]} accepted
 * @param {number} padding
 * @returns {boolean}
 */
function checkCollisions(candidate, accepted, padding) {
  for (let i = 0; i < accepted.length; i += 1) {
    if (areBoxesOverlapping(candidate, accepted[i], padding)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a box falls outside the stage area.
 *
 * @param {BoundingBox} box
 * @param {number} stageWidth
 * @param {number} stageHeight
 * @returns {boolean}
 */
function isBoxOutOfBounds(box, stageWidth, stageHeight) {
  if (box.x < 0) {
    return true;
  }
  if (box.y < 0) {
    return true;
  }
  if (box.x + box.width > stageWidth) {
    return true;
  }
  if (box.y + box.height > stageHeight) {
    return true;
  }
  return false;
}

/**
 * Estimates rendered width in CSS pixels for label typography.
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateLabelWidth(text) {
  return Math.max(54, text.length * 7.2 + 14);
}

/**
 * Mounts the region labels layer onto a container element (REG-03, BAS-04).
 * Idle state does not request frames (preserves BAS-04 and BAS-09).
 *
 * @param {Document} documentRef
 * @param {HTMLElement} container
 * @param {{
 *   definitions?: readonly RegionLabelDefinition[],
 *   onSelectRegion?: (code: string) => void
 * }} [options]
 * @returns {RegionLabelsView}
 */
export function mountRegionLabelsView(documentRef, container, options = {}) {
  const definitions = options.definitions ?? REGION_LABEL_DEFINITIONS;

  const layer = documentRef.createElement("div");
  layer.className = "region-labels-layer";
  layer.setAttribute("aria-hidden", "true");

  /** @type {Map<string, HTMLElement>} */
  const elementByCode = new Map();
  /** @type {HTMLElement[]} */
  const elements = [];

  for (let i = 0; i < definitions.length; i += 1) {
    const item = definitions[i];
    const span = documentRef.createElement("span");
    span.className = "region-label region-label-hidden";
    span.dataset.regionCode = item.code;
    let labelText = item.label;
    if (item.shortLabel) {
      labelText = item.shortLabel;
    }
    span.textContent = labelText;
    span.hidden = true;
    layer.append(span);
    elementByCode.set(item.code, span);
    elements.push(span);
  }

  container.append(layer);

  /** @type {LabelPlacement[]} */
  let currentPlacements = [];

  /**
   * Updates placements and toggles visibility based on collision discard (REG-03).
   *
   * @param {number} width
   * @param {number} height
   * @param {{ occlusionBoxes?: BoundingBox[], useShortLabel?: boolean }} [updateOptions]
   * @returns {LabelPlacement[]}
   */
  function update(width, height, updateOptions = {}) {
    currentPlacements = computeLabelCollisions(definitions, width, height, updateOptions);

    for (let i = 0; i < currentPlacements.length; i += 1) {
      const placement = currentPlacements[i];
      const el = elementByCode.get(placement.code);
      if (!el) {
        continue;
      }

      applyPlacementToElement(el, placement);
    }

    return currentPlacements;
  }

  return {
    element: layer,
    update,
    getPlacements: () => currentPlacements,
    getLabels: () => elements,
    destroy() {
      layer.remove();
    },
  };
}

/**
 * @param {HTMLElement} element
 * @param {LabelPlacement} placement
 */
function applyPlacementToElement(element, placement) {
  if (placement.visible) {
    element.hidden = false;
    element.className = "region-label region-label-visible";
    element.style.left = `${Math.round(placement.box.x + placement.box.width / 2)}px`;
    element.style.top = `${Math.round(placement.box.y + placement.box.height / 2)}px`;
    return;
  }

  element.hidden = true;
  element.className = "region-label region-label-hidden";
}
