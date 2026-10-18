import * as THREE from "three";
import { formatValue } from "../domain/format.js";
import { computeIndicatorValues, findIndicator } from "../domain/indicator.js";
import { PLATE_DEPTH, WORLD_UNITS_PER_SVG_UNIT } from "../engine/constants.js";
import { isPointInOutline } from "../engine/picking.js";
import { STAGE_BANNER_TITLE } from "../features/demo/demo-view.js";

/**
 * @typedef {import("./store.js").Store<any, any>} Store
 * @typedef {import("../engine/engine.js").createEngine} CreateEngine
 * @typedef {ReturnType<CreateEngine>} EngineInstance
 * @typedef {import("../domain/territory.js").TerritoryIndex} TerritoryIndex
 */

/**
 * Installs the frozen mapInspector hooks on window.
 * Follows section 4.4 and BAS-01, BAS-03, BAS-04, BAS-11, BAS-12.
 *
 * @param {{
 *   windowRef: Window,
 *   store: Store,
 *   engine: EngineInstance,
 *   geometry: { municipalities: any[], plate: any },
 *   territory: TerritoryIndex,
 *   scaleRules?: any,
 *   palette?: any,
 *   readCamera?: () => any,
 *   readLimits?: () => any,
 *   readLegend?: () => any,
 *   selectors?: any,
 * }} options
 */
export function installTestHooks({
  windowRef,
  store,
  engine,
  geometry,
  territory,
  scaleRules,
  palette,
  readCamera: customReadCamera,
  readLimits: customReadLimits,
  readLegend: customReadLegend,
  selectors,
}) {
  const hooks = {
    isSettled() {
      const stats = engine.readStats();
      return stats.isSettled;
    },

    readFrameCount() {
      const stats = engine.readStats();
      return stats.frameCount;
    },

    readTimings() {
      const stats = engine.readStats();
      return {
        renderTimes: stats.renderTimes,
        lastRenderDuration: stats.lastRenderDuration,
        medianRenderDuration: stats.medianRenderDuration,
      };
    },

    readEngineStats() {
      return engine.readStats();
    },

    // Read only, for ESC-12: a color change must repaint without building any geometry
    readGeometryStats() {
      return engine.readGeometryStats();
    },

    // Read only, for ESC-12: the borders of a block follow its top while the height moves
    readBorderTop(/** @type {string} */ code) {
      const index = geometry.municipalities.findIndex((m) => m.code === code);
      if (index === -1) {
        return null;
      }
      return engine.readBorderTop(index);
    },

    readMapPalette() {
      return engine.readPalette();
    },

    readLimitBounds() {
      return engine.readLimitBounds();
    },

    readState() {
      return JSON.parse(JSON.stringify(store.getState()));
    },

    readStatus() {
      const status = store.getState().status ?? null;
      return JSON.parse(JSON.stringify(status));
    },

    readActiveTab() {
      return store.getState().tab ?? "indicators";
    },

    readInspectedUnit() {
      return store.getState().pointer?.inspectedCode ?? null;
    },

    readSelection() {
      const state = store.getState();
      return state.selection?.selectedCodes || [];
    },

    readCodes() {
      return geometry.municipalities.map((m) => m.code);
    },

    readCamera() {
      if (customReadCamera) {
        return customReadCamera();
      }
      if (engine && typeof engine.readCamera === "function") {
        return engine.readCamera();
      }
      return {
        viewAngleDegrees: 55,
      };
    },

    readLimits() {
      if (customReadLimits) {
        return customReadLimits();
      }
      return {};
    },

    readLegend() {
      if (customReadLegend) {
        return customReadLegend();
      }
      return {};
    },

    readAnimationConstants() {
      return {
        liftDurationMs: 180,
        easingPerFrame: 0.14,
        heightEasingPerFrame: 0.16,
      };
    },

    inspect(/** @type {string} */ code) {
      const index = geometry.municipalities.findIndex((m) => m.code === code);
      if (index === -1) {
        return null;
      }
      const engineData = engine.inspect(index);
      const munRecord = territory.municipalityByCode(code);
      const state = store.getState();

      const indicatorDef = readActiveIndicator(state);
      const indicatorId = indicatorDef.id;
      const activeRecord = readActiveRecord(state, index, munRecord);
      let value = null;
      if (activeRecord) {
        value = indicatorDef.computeValue(activeRecord);
      }
      const formatted = formatValue(value, indicatorId);

      const pointedCode = state.pointer?.pointedCode ?? state.pointer?.inspectedCode ?? null;
      const isPointed =
        pointedCode === code ||
        (pointedCode !== null &&
          pointedCode !== undefined &&
          territory.regionOf(code)?.code === pointedCode);
      const isInspected = state.pointer?.inspectedCode === code;
      const isSelected = (state.selection?.selectedCodes || []).includes(code);

      const activePalette = engine.readPalette() || palette;
      const { classIndex, baseColor } = resolveUnitClassAndColor(
        state,
        index,
        indicatorDef,
        activePalette,
      );
      let color = baseColor;

      // The theme switch (LAY-08) can change the selection blue after boot, so read it live.
      // In election mode (ELE-15), selected units keep their candidate/party color.
      const isElectionMode = state.tab === "first-round" || state.tab === "second-round";
      const selectionColor = activePalette?.selection;
      if (isSelected && !isElectionMode && selectionColor) {
        color = selectionColor;
      }

      return {
        code,
        name: munRecord?.name || "",
        value,
        formattedValue: formatted,
        classIndex,
        color,
        heightCurrent: engineData?.heightCurrent ?? 1,
        heightTarget: engineData?.heightTarget ?? 1,
        liftCurrent: engineData?.liftCurrent ?? 0,
        liftTarget: engineData?.liftTarget ?? 0,
        isPointed,
        isInspected,
        isSelected,
        source: readDataSourceLabel(state),
      };
    },

    readDataSource() {
      return readDataSourceLabel(store.getState());
    },

    findScreenPoint(/** @type {string} */ code) {
      const index = geometry.municipalities.findIndex((m) => m.code === code);
      if (index === -1) {
        return null;
      }
      const m = geometry.municipalities[index];
      let bestX = m.center.x;
      let bestY = m.center.y;

      if (!isPointInOutline(bestX, bestY, m.outline)) {
        const minX = m.bounds.min.x;
        const maxX = m.bounds.max.x;
        const minY = m.bounds.min.y;
        const maxY = m.bounds.max.y;
        let shortestDist = Number.POSITIVE_INFINITY;

        for (let row = 1; row < 10; row += 1) {
          for (let col = 1; col < 10; col += 1) {
            const x = THREE.MathUtils.lerp(minX, maxX, col / 10);
            const y = THREE.MathUtils.lerp(minY, maxY, row / 10);
            if (!isPointInOutline(x, y, m.outline)) {
              continue;
            }
            const dist = Math.hypot(x - m.center.x, y - m.center.y);
            if (dist < shortestDist) {
              shortestDist = dist;
              bestX = x;
              bestY = y;
            }
          }
        }
      }

      const engineData = engine.inspect(index);
      const height = engineData?.heightCurrent ?? 1;
      const lift = engineData?.liftCurrent ?? 0;
      const topHeightWorld = (PLATE_DEPTH * height + lift) * WORLD_UNITS_PER_SVG_UNIT;

      const worldPoint = new THREE.Vector3(
        bestX * WORLD_UNITS_PER_SVG_UNIT,
        -bestY * WORLD_UNITS_PER_SVG_UNIT,
        topHeightWorld,
      );
      return engine.projectGroundPoint(worldPoint);
    },

    readGroundPointAt(/** @type {number} */ x, /** @type {number} */ y) {
      return engine.readGroundPointAt(x, y);
    },

    projectGroundPoint(/** @type {any} */ point) {
      return engine.projectGroundPoint(point);
    },
  };

  /**
   * @param {any} state
   * @param {number} index
   * @param {import("../domain/indicator.js").IndicatorDefinition} indicatorDef
   * @param {any} activePalette
   * @returns {{ classIndex: number, baseColor: string }}
   */
  function resolveUnitClassAndColor(state, index, indicatorDef, activePalette) {
    const colorPositions = readColorPositions(state, indicatorDef);
    if (!colorPositions || colorPositions[index] === undefined) {
      return {
        classIndex: 0,
        baseColor: activePalette?.colors?.[0] || "#fde0dc",
      };
    }
    const classIndex = colorPositions[index];
    return {
      classIndex,
      baseColor: pickColorForClassIndex(classIndex, activePalette),
    };
  }

  /**
   * @param {any} state
   * @param {import("../domain/indicator.js").IndicatorDefinition} indicatorDef
   * @returns {Uint8Array | null}
   */
  function readColorPositions(state, indicatorDef) {
    if (selectors && state.data?.municipalities) {
      return selectors.selectColorPositions(state);
    }
    if (!selectors && scaleRules && state.data?.municipalities) {
      const values = computeIndicatorValues(indicatorDef, state.data.municipalities);
      return scaleRules.toColorPositions(values);
    }
    return null;
  }

  /**
   * @param {number} classIndex
   * @param {any} activePalette
   * @returns {string}
   */
  function pickColorForClassIndex(classIndex, activePalette) {
    if (classIndex === 255 || classIndex < 0) {
      return activePalette?.neutral || "#bec2cc";
    }
    if (activePalette?.colors?.[classIndex]) {
      return activePalette.colors[classIndex];
    }
    return activePalette?.colors?.[0] || "#fde0dc";
  }

  /**
   * @param {any} state
   * @returns {import("../domain/indicator.js").IndicatorDefinition}
   */
  function readActiveIndicator(state) {
    if (selectors) {
      return selectors.selectActiveIndicator(state);
    }
    return findIndicator(state.indicator?.id);
  }

  /**
   * @param {any} state
   * @param {number} index
   * @param {any} fallback
   */
  function readActiveRecord(state, index, fallback) {
    if (selectors) {
      return selectors.selectActiveRecords(state)[index];
    }
    return fallback;
  }

  /**
   * The text for where the values come from: the demo label while it is on, the IBGE source
   * of the chosen indicator otherwise.
   *
   * @param {any} state
   * @returns {string}
   */
  function readDataSourceLabel(state) {
    if (state.demo?.isActive) {
      return STAGE_BANNER_TITLE;
    }
    return readActiveIndicator(state).source;
  }

  /** @type {any} */ (windowRef).mapInspector = Object.freeze(hooks);
  return hooks;
}
