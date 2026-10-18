import { aggregateIndicator } from "../domain/aggregation.js";
import { DEFAULT_EXAGGERATION } from "../domain/height.js";
import { computeIndicatorValues } from "../domain/indicator.js";
import { createSelector } from "../domain/memo.js";
import { generateSyntheticValues, SYNTHETIC_INDICATOR } from "../domain/synthetic.js";
import { selectIndicatorDefinition } from "../features/indicator/indicator-slice.js";
import { selectBreaks } from "../features/scale/scale-slice.js";
import { readModeAttribute } from "./state.js";

/**
 * @typedef {import("./state.js").RootState} RootState
 * @typedef {import("./state.js").Action} Action
 * @typedef {import("./state.js").ModeAttribute} ModeAttribute
 * @typedef {Pick<import("./store.js").Store<RootState, Action>, "getState" | "subscribe">} ProjectedStore
 * @typedef {{ pointed: string | readonly string[] | null, selected: readonly string[] }} RaisedUnits
 *   Unit codes: the pointed one(s), or null, and the selected ones.
 * @typedef {(state: RootState) => void} ProjectionBinding
 */

/**
 * The engine methods the projection drives. The engine facade satisfies it structurally, so the
 * projection never imports the engine and tests can pass a fake that records calls.
 *
 * @typedef {Object} EnginePort
 * @property {(targets: Float32Array) => void} setHeightTargets one target height per municipality.
 * @property {(positions: Uint8Array) => void} setColors one position in the palette `colors` per
 *   municipality.
 * @property {(raised: RaisedUnits) => void} setRaised
 */

/**
 * Scale rules injected by the caller until the domain owns classification and height. Both
 * receive the indicator values in municipality order and must return arrays in the same order.
 * They run only when their inputs change reference. Both get the same heat breaks of the active
 * level, so the height of a unit never disagrees with its color.
 *
 * @typedef {Object} ScaleRules
 * @property {(values: Float64Array, breaks: number[]) => Uint8Array} toColorPositions palette
 *   position per value.
 * @property {(values: Float64Array, options: HeightTargetOptions) => Float32Array} toHeightTargets
 *   target height per value, given the height mode, the exaggeration and the heat breaks.
 */

/**
 * @typedef {{
 *   heightMode: import("../domain/height.js").HeightMode,
 *   exaggeration: number,
 *   breaks: number[]
 * }} HeightTargetOptions `breaks` are the heat breaks that paint the map; the step mode reads
 *   them (ESC-10).
 */

/**
 * Map centers by municipality code, which the synthetic generator needs to cluster its values.
 *
 * @typedef {ReadonlyMap<string, { x: number, y: number }>} MapCenters
 * @typedef {import("../domain/territory.js").MunicipalityRecord & {
 *   governmentRegionCode?: string,
 *   value?: number
 * }} IndicatorRecord
 *   A municipality record; with the demo on it also carries the synthetic `value`.
 *
 * @typedef {Object} RootSelectors
 * @property {(state: RootState) => import("../domain/indicator.js").IndicatorDefinition} selectActiveIndicator
 *   The synthetic indicator while the demo is on, the chosen real one otherwise.
 * @property {(state: RootState) => IndicatorRecord[]} selectActiveRecords
 *   The loaded municipalities, with the synthetic value in place of the real data while the demo is
 *   on. The loaded data itself is never changed.
 * @property {(state: RootState) => Float64Array} selectIndicatorValues
 * @property {(state: RootState) => number[]} selectHeatBreaks the 6 heat breaks of the active
 *   level: the map color, the step heights, the legend and the band filter all read these.
 * @property {(state: RootState) => Uint8Array} selectColorPositions
 * @property {(state: RootState) => Float32Array} selectHeightTargets
 * @property {(state: RootState) => RaisedUnits} selectRaised
 * @property {(state: RootState) => ModeAttribute} selectModeAttribute
 */

/**
 * Maps a municipality code or record to its group code at the requested territorial level
 * (`"municipality"`, `"governmentRegion"` or `"region"`).
 *
 * @param {string} level
 * @param {string | IndicatorRecord} codeOrRecord
 * @param {readonly IndicatorRecord[]} [municipalities]
 * @returns {string}
 */
export function groupOf(level, codeOrRecord, municipalities = []) {
  const record = resolveMunicipalityRecord(codeOrRecord, municipalities);
  const fallbackCode = readFallbackCode(codeOrRecord);
  if (level === "municipality") {
    return record?.code ?? fallbackCode;
  }
  if (level === "governmentRegion") {
    return record?.governmentRegionCode ?? record?.regionCode ?? fallbackCode;
  }
  if (level === "region") {
    return record?.regionCode ?? fallbackCode;
  }
  return fallbackCode;
}

/**
 * Builds a fast lookup closure `(level, code) => groupCode` indexed by municipality code.
 *
 * @param {readonly IndicatorRecord[]} municipalities
 * @returns {(level: string, code: string) => string}
 */
export function createGroupOf(municipalities = []) {
  /** @type {Map<string, IndicatorRecord>} */
  const byCode = new Map();
  for (const municipality of municipalities) {
    byCode.set(municipality.code, municipality);
  }
  return function resolveGroup(level, code) {
    const record = byCode.get(code);
    if (!record) {
      return code;
    }
    return groupOf(level, record);
  };
}

/**
 * @param {string | IndicatorRecord} codeOrRecord
 * @param {readonly IndicatorRecord[]} municipalities
 * @returns {IndicatorRecord | null}
 */
function resolveMunicipalityRecord(codeOrRecord, municipalities) {
  if (typeof codeOrRecord === "object" && codeOrRecord !== null) {
    return codeOrRecord;
  }
  if (typeof codeOrRecord === "string" && municipalities.length > 0) {
    return municipalities.find((m) => m.code === codeOrRecord) ?? null;
  }
  return null;
}

/**
 * @param {string | IndicatorRecord} codeOrRecord
 * @returns {string}
 */
function readFallbackCode(codeOrRecord) {
  if (typeof codeOrRecord === "string") {
    return codeOrRecord;
  }
  if (typeof codeOrRecord === "object" && codeOrRecord !== null) {
    return String(codeOrRecord.code ?? "");
  }
  return "";
}

/**
 * Projects the current state now and after every store change.
 *
 * @param {ProjectedStore} store
 * @param {(state: RootState) => void} project
 * @returns {() => void} detaches the projection from the store.
 */
export function attachProjection(store, project) {
  project(store.getState());
  return store.subscribe(project);
}

/**
 * Builds the function that maps a root state onto the engine and the views. Each binding runs
 * its memoized selector and calls the engine or the view only when that output changed
 * reference, so a hover touches `setRaised` alone.
 *
 * @param {{ engine: EnginePort, selectors: RootSelectors, views?: ProjectionBinding[] }} options
 * @returns {(state: RootState) => void}
 */
export function createProjection({ engine, selectors, views = [] }) {
  const bindings = [
    bindToChange(selectors.selectHeightTargets, (targets) => engine.setHeightTargets(targets)),
    bindToChange(selectors.selectColorPositions, (positions) => engine.setColors(positions)),
    bindToChange(selectors.selectRaised, (raised) => engine.setRaised(raised)),
    ...views,
  ];
  return function project(state) {
    for (const runBinding of bindings) {
      runBinding(state);
    }
  };
}

/**
 * Wraps `apply` so it runs on the first state and then only when `select` returns a different
 * reference (`Object.is`). Views use it to render only when their own input changed.
 *
 * @template Input
 * @param {(state: RootState) => Input} select
 * @param {(input: Input) => void} apply
 * @returns {ProjectionBinding}
 */
export function bindToChange(select, apply) {
  /** @type {{ input: Input } | null} */
  let lastApplied = null;
  return function applyOnChange(state) {
    const input = select(state);
    if (lastApplied !== null && Object.is(lastApplied.input, input)) {
      return;
    }
    lastApplied = { input };
    apply(input);
  };
}

/**
 * Computes values per municipality for the given level.
 *
 * @param {import("../domain/indicator.js").IndicatorDefinition} def
 * @param {IndicatorRecord[]} municipalities
 * @param {import("../domain/territory.js").RegionRecord[]} [regions]
 * @param {string} [levelId]
 * @returns {Float64Array}
 */
export function computeValuesForLevel(def, municipalities, regions = [], levelId = "municipality") {
  if (levelId === "region") {
    return computeRegionIndicatorValues(def, municipalities, regions);
  }
  if (levelId === "governmentRegion") {
    return computeGovernmentRegionIndicatorValues(def, municipalities);
  }
  return computeIndicatorValues(def, municipalities);
}

/**
 * @param {import("../domain/indicator.js").IndicatorDefinition} def
 * @param {IndicatorRecord[]} municipalities
 * @param {import("../domain/territory.js").RegionRecord[]} regions
 * @returns {Float64Array}
 */
function computeRegionIndicatorValues(def, municipalities, regions) {
  /** @type {Map<string, number | null>} */
  const regionValues = new Map();
  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const inRegion = municipalities.filter((m) => m.regionCode === region.code);
    const agg = aggregateIndicator(def, inRegion);
    regionValues.set(region.code, agg.value);
  }

  const result = new Float64Array(municipalities.length);
  for (let i = 0; i < municipalities.length; i += 1) {
    const val = regionValues.get(municipalities[i].regionCode);
    if (val === null || val === undefined || Number.isNaN(val)) {
      result[i] = Number.NaN;
      continue;
    }
    result[i] = val;
  }
  return result;
}

/**
 * @param {import("../domain/indicator.js").IndicatorDefinition} def
 * @param {IndicatorRecord[]} municipalities
 * @returns {Float64Array}
 */
function computeGovernmentRegionIndicatorValues(def, municipalities) {
  /** @type {Map<string, IndicatorRecord[]>} */
  const groups = new Map();
  for (const municipality of municipalities) {
    const groupCode = groupOf("governmentRegion", municipality);
    const bucket = groups.get(groupCode) ?? [];
    bucket.push(municipality);
    groups.set(groupCode, bucket);
  }

  /** @type {Map<string, number | null>} */
  const groupValues = new Map();
  for (const [groupCode, members] of groups.entries()) {
    const agg = aggregateIndicator(def, members);
    groupValues.set(groupCode, agg.value);
  }

  const result = new Float64Array(municipalities.length);
  for (let i = 0; i < municipalities.length; i += 1) {
    const groupCode = groupOf("governmentRegion", municipalities[i]);
    const val = groupValues.get(groupCode);
    if (val === null || val === undefined || Number.isNaN(val)) {
      result[i] = Number.NaN;
      continue;
    }
    result[i] = val;
  }
  return result;
}

/**
 * Creates the memoized selectors over the root state. Each call returns a fresh set with its own
 * caches, so two projections never evict each other's results.
 *
 * @param {ScaleRules} scale
 * @param {MapCenters} [centers] needed only to generate synthetic values.
 * @returns {RootSelectors}
 */
export function createRootSelectors(scale, centers = new Map()) {
  const selectActiveIndicator = createSelector([readIndicator, readDemoDraw], pickActiveIndicator);
  const selectSyntheticValues = createSelector(
    [readDemoDraw, readMunicipalities],
    (drawNumber, municipalities) => generateDemoValues(drawNumber, municipalities, centers),
  );
  const selectActiveRecords = createSelector(
    [readMunicipalities, selectSyntheticValues],
    withSyntheticValues,
  );
  const selectIndicatorValues = createSelector(
    [selectActiveIndicator, selectActiveRecords, readRegions, readLevelId],
    computeValuesForLevel,
  );
  const selectHeatBreaks = createSelector([selectIndicatorValues, readLevelId], computeLevelBreaks);
  const selectModeAttribute = createSelector([readTab], (tab) => readModeAttribute({ tab }));
  return {
    selectActiveIndicator,
    selectActiveRecords,
    selectIndicatorValues,
    selectHeatBreaks,
    selectModeAttribute,
    selectColorPositions: createSelector(
      [selectIndicatorValues, selectHeatBreaks, readColorMode],
      (values, breaks, colorMode) => toColorPositions(scale, { values, breaks, colorMode }),
    ),
    selectHeightTargets: createSelector(
      [selectIndicatorValues, selectHeatBreaks, readHeightMode, readExaggeration],
      (values, breaks, heightMode, exaggeration) =>
        scale.toHeightTargets(values, { heightMode, exaggeration, breaks }),
    ),
    selectRaised: createSelector(
      [readPointedCode, readInspectedCode, readSelectedCodes, readRegions, readMunicipalities],
      (pointed, inspected, selected, regions, municipalities) => {
        const activePointed = pointed ?? inspected ?? null;
        const resolvedPointed = resolvePointedUnits(activePointed, regions, municipalities);
        return {
          pointed: resolvedPointed,
          selected,
        };
      },
    ),
  };
}

/**
 * @param {string | null} activePointed
 * @param {import("../domain/territory.js").RegionRecord[]} regions
 * @param {IndicatorRecord[]} municipalities
 * @returns {string | readonly string[] | null}
 */
function resolvePointedUnits(activePointed, regions, municipalities) {
  if (typeof activePointed !== "string") {
    return null;
  }
  const isRegion = regions.some((r) => r.code === activePointed);
  if (isRegion) {
    return municipalities.filter((m) => m.regionCode === activePointed).map((m) => m.code);
  }
  const inGovernmentRegion = municipalities.filter(
    (m) => m.governmentRegionCode !== undefined && m.governmentRegionCode === activePointed,
  );
  if (inGovernmentRegion.length > 0) {
    return inGovernmentRegion.map((m) => m.code);
  }
  return activePointed;
}

/**
 * The synthetic indicator reads its value from the record `withSyntheticValues` builds.
 *
 * @type {import("../domain/indicator.js").IndicatorDefinition}
 */
const SYNTHETIC_DEFINITION = {
  ...SYNTHETIC_INDICATOR,
  computeValue: (record) => /** @type {IndicatorRecord} */ (record).value ?? null,
};

/**
 * @param {import("../features/indicator/indicator-slice.js").IndicatorState} indicator
 * @param {number | null} drawNumber null while the demo is off.
 * @returns {import("../domain/indicator.js").IndicatorDefinition}
 */
function pickActiveIndicator(indicator, drawNumber) {
  if (drawNumber === null) {
    return selectIndicatorDefinition(indicator);
  }
  return SYNTHETIC_DEFINITION;
}

/**
 * @param {number | null} drawNumber null while the demo is off.
 * @param {IndicatorRecord[]} municipalities
 * @param {MapCenters} centers
 * @returns {Float64Array | null}
 */
function generateDemoValues(drawNumber, municipalities, centers) {
  if (drawNumber === null) {
    return null;
  }
  const placed = municipalities.map((municipality) => ({
    code: municipality.code,
    center: centers.get(municipality.code) ?? { x: 0, y: 0 },
  }));
  return generateSyntheticValues(placed, drawNumber);
}

/**
 * @param {IndicatorRecord[]} municipalities
 * @param {Float64Array | null} syntheticValues
 * @returns {IndicatorRecord[]}
 */
function withSyntheticValues(municipalities, syntheticValues) {
  if (syntheticValues === null) {
    return municipalities;
  }
  return municipalities.map((municipality, index) => ({
    ...municipality,
    value: syntheticValues[index],
  }));
}

/**
 * Aggregate levels (`region` and `governmentRegion`) split the distinct group values, so each
 * group weighs once in the quantiles instead of once per municipality it holds (P36).
 *
 * @param {Float64Array} values one value per municipality; in aggregate levels, its group's.
 * @param {string} levelId
 * @returns {number[]}
 */
function computeLevelBreaks(values, levelId) {
  if (levelId === "region" || levelId === "governmentRegion") {
    return selectBreaks(readDistinctRegionValues(values), /** @type {any} */ (levelId));
  }
  return selectBreaks(values, /** @type {any} */ (levelId));
}

/**
 * @param {Float64Array} values
 * @returns {Float64Array} each positive region value once.
 */
function readDistinctRegionValues(values) {
  const distinctValues = Array.from(new Set(values));
  return Float64Array.from(distinctValues.filter(isPositiveFinite));
}

/**
 * @param {number} value
 * @returns {boolean}
 */
function isPositiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

/**
 * With "selection" color mode every block takes the lowest palette position; the engine paints
 * the selected ones in the selection color on top.
 *
 * @param {ScaleRules} scale
 * @param {{ values: Float64Array, breaks: number[], colorMode: string }} coloring
 * @returns {Uint8Array}
 */
function toColorPositions(scale, { values, breaks, colorMode }) {
  if (colorMode === "selection") {
    const positions = new Uint8Array(values.length);
    for (let i = 0; i < values.length; i += 1) {
      const val = values[i];
      if (val === null || val === undefined || Number.isNaN(val) || val <= 0) {
        positions[i] = 255;
      }
    }
    return positions;
  }
  return scale.toColorPositions(values, breaks);
}

/**
 * @param {RootState} state
 */
function readTab(state) {
  return state.tab ?? "indicators";
}

/**
 * @param {RootState} state
 */
function readColorMode(state) {
  return state.settings?.colorMode ?? "heat";
}

/**
 * @param {RootState} state
 */
function readHeightMode(state) {
  return state.settings?.heightMode ?? "data";
}

/**
 * @param {RootState} state
 */
function readExaggeration(state) {
  return state.settings?.exaggeration ?? DEFAULT_EXAGGERATION;
}

/**
 * @param {RootState} state
 */
function readIndicator(state) {
  return state.indicator;
}

/**
 * @param {RootState} state
 * @returns {number | null} the draw number while the demo is on, null otherwise.
 */
function readDemoDraw(state) {
  if (!state.demo?.isActive) {
    return null;
  }
  return state.demo.drawNumber;
}

/**
 * @param {RootState} state
 */
function readMunicipalities(state) {
  return state.data.municipalities;
}

/**
 * @param {RootState} state
 */
function readRegions(state) {
  return state.data.regions || [];
}

/**
 * @param {RootState} state
 */
function readLevelId(state) {
  return state.level?.id || "municipality";
}

/**
 * @param {RootState} state
 */
function readPointedCode(state) {
  return state.pointer?.pointedCode ?? null;
}

/**
 * @param {RootState} state
 */
function readInspectedCode(state) {
  return state.pointer?.inspectedCode ?? null;
}

/**
 * @param {RootState} state
 */
function readSelectedCodes(state) {
  return state.selection.selectedCodes;
}
