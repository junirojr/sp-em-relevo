import {
  aggregateIndicator,
  formatAggregatedValue,
  readAggregationLabel,
} from "../../domain/aggregation.js";
import { buildPanelUnits } from "../../domain/selection.js";
import { addRegionAction, removeCodesAction, toggleMunicipalityAction } from "./selection-slice.js";

/**
 * @typedef {import("../../domain/territory.js").TerritoryIndex} TerritoryIndex
 * @typedef {import("../../domain/territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("../../domain/indicator.js").IndicatorDefinition} IndicatorDefinition
 * @typedef {import("../../domain/selection.js").PanelUnit} PanelUnit
 * @typedef {{ type: string, code?: string | null }} Action
 *
 * @typedef {{
 *   code: string,
 *   name: string,
 *   value: number,
 *   formattedValue: string
 * }} RankingUnit
 *
 * @typedef {{
 *   onFocusUnit?: (code: string) => void,
 *   onPointUnit?: (code: string | null) => void
 * }} PanelViewOptions
 */

export const RANKING_LIMIT = 12;

/**
 * Pure rule: builds the top 12 units for the active indicator and level.
 * Tie-breaker is alphabetical by name in pt-BR.
 * Follows SEL-08.
 *
 * @param {IndicatorDefinition} indicator
 * @param {"municipality" | "region"} level
 * @param {TerritoryIndex} territory
 * @param {MunicipalityRecord[]} municipalities
 * @returns {RankingUnit[]}
 */
export function buildRankingUnits(indicator, level, territory, municipalities) {
  if (level === "region") {
    return buildRegionRanking(indicator, territory, municipalities);
  }
  return buildMunicipalityRanking(indicator, municipalities);
}

/**
 * @param {IndicatorDefinition} indicator
 * @param {TerritoryIndex} territory
 * @param {MunicipalityRecord[]} municipalities
 * @returns {RankingUnit[]}
 */
function buildRegionRanking(indicator, territory, municipalities) {
  const list = [];
  const regions = territory.regions();
  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const inRegion = municipalities.filter((m) => m.regionCode === region.code);
    const agg = aggregateIndicator(indicator, inRegion);
    const numericValue = resolveNumericValue(agg.value);
    list.push({
      code: region.code,
      name: region.label,
      value: numericValue,
      formattedValue: formatAggregatedValue(agg, indicator),
    });
  }
  list.sort(compareRankingUnits);
  return list.slice(0, RANKING_LIMIT);
}

/**
 * @param {IndicatorDefinition} indicator
 * @param {MunicipalityRecord[]} municipalities
 * @returns {RankingUnit[]}
 */
function buildMunicipalityRanking(indicator, municipalities) {
  const list = [];
  for (let i = 0; i < municipalities.length; i += 1) {
    const mun = municipalities[i];
    const val = indicator.computeValue(mun);
    if (val !== null && Number.isFinite(val)) {
      list.push({
        code: mun.code,
        name: mun.name,
        value: val,
        formattedValue: indicator.format(val),
      });
    }
  }
  list.sort(compareRankingUnits);
  return list.slice(0, RANKING_LIMIT);
}

/**
 * @param {number | null} value
 * @returns {number}
 */
function resolveNumericValue(value) {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

/**
 * @param {RankingUnit} a
 * @param {RankingUnit} b
 * @returns {number}
 */
function compareRankingUnits(a, b) {
  const diff = b.value - a.value;
  if (diff !== 0) {
    return diff;
  }
  return a.name.localeCompare(b.name, "pt-BR");
}

/**
 * Mounts the selection panel table with active selection, ranking fallback,
 * and touch inspection card.
 * Follows SEL-06, SEL-07, SEL-08, SEL-09, E33, and MOB-04.
 *
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {PanelViewOptions} [options]
 */
export function mountPanelView(documentRef, dispatch, options = {}) {
  const container = documentRef.createElement("div");
  container.className = "selection-panel";

  const noticeArea = documentRef.createElement("div");
  noticeArea.className = "selection-notice";
  noticeArea.setAttribute("aria-live", "polite");
  noticeArea.setAttribute("aria-atomic", "true");

  const inspectedCard = documentRef.createElement("div");
  inspectedCard.className = "selection-inspected-card";
  inspectedCard.hidden = true;

  const tableContainer = documentRef.createElement("div");
  tableContainer.className = "selection-table-container";

  container.append(noticeArea, inspectedCard, tableContainer);

  let cachedSelectedCodes = /** @type {readonly string[]} */ ([]);
  let cachedRetentionNotice = /** @type {string | null} */ (null);
  let cachedTerritory = /** @type {TerritoryIndex | null} */ (null);
  let cachedIndicator = /** @type {IndicatorDefinition | null} */ (null);
  let cachedLevel = /** @type {"municipality" | "region"} */ ("municipality");
  let cachedMunicipalities = /** @type {MunicipalityRecord[]} */ ([]);
  let cachedInspectedCode = /** @type {string | null} */ (null);

  /**
   * @param {string | null} inspectedCode
   */
  function renderInspectedCard(inspectedCode) {
    cachedInspectedCode = inspectedCode;
    if (!inspectedCode) {
      inspectedCard.hidden = true;
      inspectedCard.replaceChildren();
      return;
    }

    const mun = cachedMunicipalities.find((m) => m.code === inspectedCode);
    if (!mun) {
      inspectedCard.hidden = true;
      inspectedCard.replaceChildren();
      return;
    }

    elevateSheetIfCollapsed(documentRef);

    inspectedCard.replaceChildren();

    const header = documentRef.createElement("div");
    header.className = "inspected-card-header";

    const titleGroup = documentRef.createElement("div");
    titleGroup.className = "inspected-card-title-group";

    const titleRow = documentRef.createElement("div");
    titleRow.className = "inspected-card-title-row";

    const title = documentRef.createElement("h3");
    title.className = "inspected-card-title";
    title.textContent = mun.name;
    titleRow.append(title);

    const stateRank = computeStateRank(mun.code, cachedMunicipalities, cachedIndicator);
    if (stateRank !== null) {
      const rankBadge = documentRef.createElement("span");
      rankBadge.className = "inspected-rank-badge";
      rankBadge.textContent = `#${stateRank} no Estado`;
      titleRow.append(rankBadge);
    }

    const contextText = resolveMunicipalityContext(mun, cachedTerritory);
    const contextElem = documentRef.createElement("p");
    contextElem.className = "inspected-card-context";
    contextElem.textContent = contextText;

    titleGroup.append(titleRow, contextElem);

    const closeBtn = documentRef.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "inspected-card-close";
    closeBtn.setAttribute("aria-label", "Fechar inspeção");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => {
      renderInspectedCard(null);
      dispatch({ type: "pointer/inspectedUnitChanged", code: null });
    });

    header.append(titleGroup, closeBtn);

    const win = resolveWindow(documentRef);
    const appStore = /** @type {any} */ (win)?.__appStore;
    let isElectionMode = false;
    if (appStore && typeof appStore.getState === "function") {
      const currentTab = appStore.getState().tab;
      if (currentTab === "first-round" || currentTab === "second-round") {
        isElectionMode = true;
      }
    }

    const electionResults = /** @type {any} */ (win)?.__electionResults;
    let electionData = null;
    if (isElectionMode && electionResults) {
      electionData = electionResults[mun.code] || null;
    }

    const statGrid = documentRef.createElement("div");
    statGrid.className = "inspected-stat-grid";

    if (electionData && electionData.leader) {
      const leaderBox = documentRef.createElement("div");
      leaderBox.className = "inspected-stat-box";

      const leaderLabel = documentRef.createElement("span");
      leaderLabel.className = "inspected-stat-label";
      const officeName = /** @type {any} */ (win)?.__activeElectionOffice || "cargo";
      leaderLabel.textContent = `LÍDER (${officeName.toUpperCase()})`;

      const leaderValue = documentRef.createElement("span");
      leaderValue.className = "inspected-stat-value";
      let partyStr = "";
      if (electionData.leader.party) {
        partyStr = ` (${electionData.leader.party})`;
      }
      leaderValue.textContent = `${electionData.leader.name}${partyStr}`;

      const leaderSub = documentRef.createElement("span");
      leaderSub.className = "inspected-stat-sub";
      let shareStr = "0.0";
      if (typeof electionData.leader.sharePct === "number") {
        shareStr = electionData.leader.sharePct.toFixed(1);
      }
      let votesStr = "0";
      if (typeof electionData.leader.validVotes === "number") {
        votesStr = electionData.leader.validVotes.toLocaleString("pt-BR");
      }
      leaderSub.textContent = `${shareStr}% dos votos válidos (${votesStr} votos)`;

      leaderBox.append(leaderLabel, leaderValue, leaderSub);

      const marginBox = documentRef.createElement("div");
      marginBox.className = "inspected-stat-box";

      const marginLabel = documentRef.createElement("span");
      marginLabel.className = "inspected-stat-label";
      marginLabel.textContent = "VANTAGEM / MARGEM";

      const marginValue = documentRef.createElement("span");
      marginValue.className = "inspected-stat-value";
      let marginNum = 0;
      if (typeof electionData.marginPp === "number") {
        marginNum = electionData.marginPp;
      }
      marginValue.textContent = `+${marginNum.toFixed(1)} pp`;

      const marginSub = documentRef.createElement("span");
      marginSub.className = "inspected-stat-sub";
      if (electionData.runnerUp) {
        let runnerShare = "0.0";
        if (typeof electionData.runnerUp.sharePct === "number") {
          runnerShare = electionData.runnerUp.sharePct.toFixed(1);
        }
        marginSub.textContent = `sobre ${electionData.runnerUp.name} (${runnerShare}%)`;
      }
      if (!electionData.runnerUp) {
        marginSub.textContent = "votos apurados";
      }

      marginBox.append(marginLabel, marginValue, marginSub);
      statGrid.append(leaderBox, marginBox);
    }

    if (!electionData || !electionData.leader) {
      const popBox = documentRef.createElement("div");
      popBox.className = "inspected-stat-box";

      const popLabel = documentRef.createElement("span");
      popLabel.className = "inspected-stat-label";
      popLabel.textContent = "POPULAÇÃO 2022";

      const popValue = documentRef.createElement("span");
      popValue.className = "inspected-stat-value";
      const popNum = mun.population || 0;
      popValue.textContent = `${popNum.toLocaleString("pt-BR")} hab`;

      const popSub = documentRef.createElement("span");
      popSub.className = "inspected-stat-sub";
      popSub.textContent = "Censo Demográfico IBGE";

      popBox.append(popLabel, popValue, popSub);

      const densBox = documentRef.createElement("div");
      densBox.className = "inspected-stat-box";

      const densLabel = documentRef.createElement("span");
      densLabel.className = "inspected-stat-label";
      densLabel.textContent = "DENSIDADE";

      const densValue = documentRef.createElement("span");
      densValue.className = "inspected-stat-value";
      let densText = "sem dado";
      if (mun.population && mun.areaKm2 && mun.areaKm2 > 0) {
        const dens = mun.population / mun.areaKm2;
        densText = `${dens.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hab/km²`;
      }
      densValue.textContent = densText;

      const densSub = documentRef.createElement("span");
      densSub.className = "inspected-stat-sub";
      densSub.textContent = "habitantes por km²";

      densBox.append(densLabel, densValue, densSub);
      statGrid.append(popBox, densBox);
    }

    const chipsRow = documentRef.createElement("div");
    chipsRow.className = "inspected-chips-row";

    if (electionData) {
      const chipValid = documentRef.createElement("span");
      chipValid.className = "inspected-chip";
      const totalV = electionData.totalValidVotes || 0;
      chipValid.textContent = `Votos válidos: ${totalV.toLocaleString("pt-BR")}`;
      chipsRow.append(chipValid);

      if (electionData.sectionsTotal) {
        const chipSec = documentRef.createElement("span");
        chipSec.className = "inspected-chip";
        chipSec.textContent = `Seções: ${electionData.sectionsCounted || 0}/${electionData.sectionsTotal}`;
        chipsRow.append(chipSec);
      }

      const chipIbge = documentRef.createElement("span");
      chipIbge.className = "inspected-chip";
      chipIbge.textContent = `TSE: ${mun.code}`;
      chipsRow.append(chipIbge);
    }

    if (!electionData) {
      const chipArea = documentRef.createElement("span");
      chipArea.className = "inspected-chip";
      const areaNum = mun.areaKm2 || 0;
      chipArea.textContent = `Área: ${areaNum.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km²`;
      chipsRow.append(chipArea);

      if (mun.gdpThousandBrl && mun.population && mun.population > 0) {
        const chipPib = documentRef.createElement("span");
        chipPib.className = "inspected-chip";
        const pibPerCap = (mun.gdpThousandBrl * 1000) / mun.population;
        if (pibPerCap >= 1000) {
          chipPib.textContent = `PIB per cap: R$ ${(pibPerCap / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
        }
        if (pibPerCap < 1000) {
          chipPib.textContent = `PIB per cap: R$ ${pibPerCap.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
        }
        chipsRow.append(chipPib);
      }

      if (cachedIndicator && cachedIndicator.id !== "population") {
        const val = cachedIndicator.computeValue(mun);
        if (val !== null && Number.isFinite(val)) {
          const chipInd = documentRef.createElement("span");
          chipInd.className = "inspected-chip";
          chipInd.textContent = `${cachedIndicator.label}: ${cachedIndicator.format(val)}`;
          chipsRow.append(chipInd);
        }
      }

      const chipIbge = documentRef.createElement("span");
      chipIbge.className = "inspected-chip";
      chipIbge.textContent = `IBGE: ${mun.code}`;
      chipsRow.append(chipIbge);
    }

    const actionsRow = documentRef.createElement("div");
    actionsRow.className = "inspected-actions-row";

    const compareBtn = documentRef.createElement("button");
    compareBtn.type = "button";
    compareBtn.className = "inspected-btn-secondary";
    compareBtn.innerHTML = '<span aria-hidden="true">⇄</span> Comparar';
    compareBtn.setAttribute("aria-label", `Comparar ${mun.name}`);
    compareBtn.addEventListener("click", () => {
      if (!cachedSelectedCodes.includes(inspectedCode)) {
        dispatch(toggleMunicipalityAction(inspectedCode));
      }
      const compareDock = documentRef.getElementById("compare-dock");
      if (compareDock) {
        compareDock.hidden = false;
        compareDock.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    const isSelected = cachedSelectedCodes.includes(inspectedCode);
    const selectBtn = documentRef.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "inspected-action-button";

    if (isSelected) {
      selectBtn.classList.add("inspected-action-remove");
      selectBtn.textContent = "Remover da seleção";
      selectBtn.setAttribute("aria-label", `Remover ${mun.name} da seleção`);
      selectBtn.addEventListener("click", () => {
        dispatch(toggleMunicipalityAction(inspectedCode));
      });
    }
    if (!isSelected) {
      selectBtn.classList.add("inspected-action-add");
      selectBtn.textContent = "Adicionar à seleção";
      selectBtn.setAttribute("aria-label", `Adicionar ${mun.name} à seleção`);
      selectBtn.addEventListener("click", () => {
        dispatch(toggleMunicipalityAction(inspectedCode));
      });
    }

    const isolateBtn = documentRef.createElement("button");
    isolateBtn.type = "button";
    isolateBtn.className = "inspected-btn-secondary";
    isolateBtn.innerHTML = '<span aria-hidden="true">⌖</span> Isolar 3D';
    isolateBtn.setAttribute("aria-label", `Isolar ${mun.name} no mapa 3D`);
    isolateBtn.addEventListener("click", () => {
      if (typeof options.onFocusUnit === "function") {
        options.onFocusUnit(inspectedCode);
      }
    });

    actionsRow.append(compareBtn, selectBtn, isolateBtn);

    inspectedCard.append(header, statGrid, chipsRow, actionsRow);
    inspectedCard.hidden = false;
    inspectedCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function subscribeToStore() {
    const win = resolveWindow(documentRef);
    const store = /** @type {any} */ (win)?.__appStore;
    if (!store || typeof store.subscribe !== "function") {
      return;
    }
    store.subscribe(() => {
      const state = store.getState();
      const nextInspected = state.pointer?.inspectedCode ?? null;
      if (nextInspected !== cachedInspectedCode) {
        renderInspectedCard(nextInspected);
      }
    });
  }

  subscribeToStore();

  return {
    element: container,
    update: (
      /** @type {readonly string[]} */ selectedCodes,
      /** @type {string | null} */ retentionNotice,
      /** @type {TerritoryIndex} */ territory,
      /** @type {IndicatorDefinition} */ indicator,
      /** @type {"municipality" | "region"} */ level,
      /** @type {MunicipalityRecord[]} */ municipalities,
      /** @type {string | null | undefined} */ inspectedCode = null,
    ) => {
      cachedSelectedCodes = selectedCodes;
      cachedRetentionNotice = retentionNotice;
      cachedTerritory = territory;
      cachedIndicator = indicator;
      cachedLevel = level;
      cachedMunicipalities = municipalities;

      subscribeToStore();

      let targetInspected = cachedInspectedCode;
      if (inspectedCode !== undefined) {
        targetInspected = inspectedCode;
      }
      if (inspectedCode === undefined) {
        const win = resolveWindow(documentRef);
        const store = /** @type {any} */ (win)?.__appStore;
        if (store?.getState) {
          targetInspected = store.getState().pointer?.inspectedCode ?? null;
        }
      }

      syncNotice(noticeArea, retentionNotice);
      renderInspectedCard(targetInspected);
      renderTable(
        tableContainer,
        documentRef,
        dispatch,
        selectedCodes,
        territory,
        indicator,
        level,
        municipalities,
        options,
      );
    },
  };
}

/**
 * Elevates the mobile bottom sheet to half height if it is currently collapsed (MOB-04).
 *
 * @param {Document} doc
 */
function elevateSheetIfCollapsed(doc) {
  const sidebar = doc.getElementById("sidebar");
  if (!sidebar) {
    return;
  }
  if (sidebar.getAttribute("data-sheet-state") === "collapsed") {
    const sheetToggle = doc.getElementById("sheet-toggle");
    if (sheetToggle) {
      sheetToggle.click();
    }
  }
}

/**
 * @param {MunicipalityRecord} mun
 * @param {TerritoryIndex | null} territory
 * @returns {string}
 */
function resolveMunicipalityContext(mun, territory) {
  if (territory) {
    const reg = territory.regionOf(mun.code);
    if (reg) {
      return reg.label;
    }
  }
  if (mun.governmentRegionName) {
    return mun.governmentRegionName;
  }
  return "São Paulo";
}

/**
 * @param {Document} documentRef
 * @returns {Window | null}
 */
function resolveWindow(documentRef) {
  if (documentRef && documentRef.defaultView) {
    return documentRef.defaultView;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  return null;
}

/**
 * @param {HTMLDivElement} noticeArea
 * @param {string | null} notice
 */
function syncNotice(noticeArea, notice) {
  if (notice === null || notice === "") {
    noticeArea.textContent = "";
    noticeArea.hidden = true;
    return;
  }
  noticeArea.textContent = notice;
  noticeArea.hidden = false;
}

/**
 * @param {HTMLDivElement} container
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {readonly string[]} selectedCodes
 * @param {TerritoryIndex} territory
 * @param {IndicatorDefinition} indicator
 * @param {"municipality" | "region"} level
 * @param {MunicipalityRecord[]} municipalities
 * @param {PanelViewOptions} options
 */
function renderTable(
  container,
  documentRef,
  dispatch,
  selectedCodes,
  territory,
  indicator,
  level,
  municipalities,
  options,
) {
  const activeElement = documentRef.activeElement;
  const isFocusInContainer = Boolean(activeElement && container.contains(activeElement));
  let focusedRowIndex = 0;
  if (isFocusInContainer && activeElement) {
    const activeRow = activeElement.closest("tr");
    if (activeRow?.parentElement) {
      const rows = Array.from(activeRow.parentElement.children);
      const index = rows.indexOf(activeRow);
      if (index >= 0) {
        focusedRowIndex = index;
      }
    }
  }

  container.replaceChildren();

  if (selectedCodes.length === 0) {
    renderRankingTable(
      container,
      documentRef,
      dispatch,
      indicator,
      level,
      territory,
      municipalities,
      options,
    );
    if (isFocusInContainer) {
      const selectButtons = container.querySelectorAll(".selection-select-button");
      const targetIndex = Math.min(focusedRowIndex, selectButtons.length - 1);
      const targetButton = selectButtons[Math.max(0, targetIndex)];
      if (targetButton instanceof HTMLElement) {
        targetButton.focus();
      }
    }
    return;
  }

  renderSelectionTable(
    container,
    documentRef,
    dispatch,
    selectedCodes,
    territory,
    indicator,
    municipalities,
    options,
  );
  if (isFocusInContainer) {
    const removeButtons = container.querySelectorAll(".selection-remove-button");
    const targetIndex = Math.min(focusedRowIndex, removeButtons.length - 1);
    const targetButton = removeButtons[Math.max(0, targetIndex)];
    if (targetButton instanceof HTMLElement) {
      targetButton.focus();
    }
  }
}

/**
 * @param {HTMLDivElement} container
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {readonly string[]} selectedCodes
 * @param {TerritoryIndex} territory
 * @param {IndicatorDefinition} indicator
 * @param {MunicipalityRecord[]} municipalities
 * @param {PanelViewOptions} options
 */
function renderSelectionTable(
  container,
  documentRef,
  dispatch,
  selectedCodes,
  territory,
  indicator,
  municipalities,
  options,
) {
  const panelUnits = buildPanelUnits([...selectedCodes], territory);
  const unitValues = panelUnits.map((unit) => readUnitValue(unit, indicator, municipalities));
  const largestValue = readLargestValue(unitValues);
  const table = documentRef.createElement("table");
  table.className = "selection-table";

  const tbody = documentRef.createElement("tbody");

  for (let i = 0; i < panelUnits.length; i += 1) {
    const unit = panelUnits[i];
    const tr = documentRef.createElement("tr");
    tr.className = "selection-row";

    wireRowHover(tr, unit.code, options);

    const tdName = documentRef.createElement("td");
    tdName.className = "selection-cell-name";
    tdName.textContent = unit.name;
    tdName.append(buildProportionBar(documentRef, unitValues[i], largestValue));

    const tdValue = documentRef.createElement("td");
    tdValue.className = "selection-cell-value";
    tdValue.textContent = formatUnitValue(unit, indicator, municipalities);

    const tdAction = documentRef.createElement("td");
    tdAction.className = "selection-cell-action";

    const removeBtn = documentRef.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "selection-remove-button";
    removeBtn.setAttribute("aria-label", `Tirar ${unit.name} da seleção`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      dispatch(removeCodesAction(unit.codes));
    });

    tdAction.append(removeBtn);
    tr.append(tdName, tdValue, tdAction);
    tbody.append(tr);
  }

  const tfoot = documentRef.createElement("tfoot");
  const trTotal = documentRef.createElement("tr");
  trTotal.className = "selection-total-row";

  const selectedSet = new Set(selectedCodes);
  const selectedRecords = municipalities.filter((m) => selectedSet.has(m.code));
  const aggResult = aggregateIndicator(indicator, selectedRecords);

  const tdTotalLabel = documentRef.createElement("td");
  tdTotalLabel.className = "selection-total-label";
  tdTotalLabel.textContent = readAggregationLabel(indicator);

  const tdTotalValue = documentRef.createElement("td");
  tdTotalValue.className = "selection-total-value";
  tdTotalValue.textContent = formatAggregatedValue(aggResult, indicator);

  const tdTotalBlank = documentRef.createElement("td");

  trTotal.append(tdTotalLabel, tdTotalValue, tdTotalBlank);
  tfoot.append(trTotal);

  table.append(tbody, tfoot);
  container.append(table);
}

/**
 * @param {HTMLDivElement} container
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {IndicatorDefinition} indicator
 * @param {"municipality" | "region"} level
 * @param {TerritoryIndex} territory
 * @param {MunicipalityRecord[]} municipalities
 * @param {PanelViewOptions} options
 */
function renderRankingTable(
  container,
  documentRef,
  dispatch,
  indicator,
  level,
  territory,
  municipalities,
  options,
) {
  const ranking = buildRankingUnits(indicator, level, territory, municipalities);
  const largestValue = readLargestValue(ranking.map((item) => item.value));
  const table = documentRef.createElement("table");
  table.className = "selection-table selection-ranking-table";

  const caption = documentRef.createElement("caption");
  caption.className = "selection-caption";
  caption.textContent = readRankingCaption(level);
  table.append(caption);

  const tbody = documentRef.createElement("tbody");

  for (let i = 0; i < ranking.length; i += 1) {
    const item = ranking[i];
    const tr = documentRef.createElement("tr");
    tr.className = "selection-row selection-ranking-row";

    wireRowHover(tr, item.code, options);

    const selectUnit = () => handleRankingClick(item, level, territory, dispatch);
    const selectButton = buildSelectButton(documentRef, item.name);
    wireRowSelection(tr, selectButton, selectUnit);

    const tdName = documentRef.createElement("td");
    tdName.className = "selection-cell-name";
    tdName.append(selectButton, buildProportionBar(documentRef, item.value, largestValue));

    const tdValue = documentRef.createElement("td");
    tdValue.className = "selection-cell-value";
    tdValue.textContent = item.formattedValue;

    tr.append(tdName, tdValue);
    tbody.append(tr);
  }

  table.append(tbody);
  container.append(table);
}

/**
 * @param {HTMLElement} element
 * @param {string} code
 * @param {PanelViewOptions} options
 */
function wireRowHover(element, code, options) {
  if (!options.onPointUnit) {
    return;
  }
  const handler = options.onPointUnit;
  element.addEventListener("mouseenter", () => handler(code));
  element.addEventListener("focusin", () => handler(code));
  element.addEventListener("mouseleave", () => handler(null));
  element.addEventListener("focusout", (event) => {
    if (isFocusMovingWithinRow(element, event)) {
      return;
    }
    handler(null);
  });
}

/**
 * focusin and focusout bubble from the controls of a row; `focus` and `blur` do not.
 *
 * @param {HTMLElement} row
 * @param {FocusEvent} event
 * @returns {boolean} true when the focus goes from one control of the row to another of the same row.
 */
function isFocusMovingWithinRow(row, event) {
  const nextFocused = /** @type {Node | null} */ (event.relatedTarget);
  return row.contains(nextFocused);
}

/**
 * The button holds the unit name in the name cell, so the row is reached by Tab and acts on Enter
 * and Space. The visible name is part of the label, as WCAG 2.5.3 asks.
 *
 * @param {Document} documentRef
 * @param {string} name
 * @returns {HTMLButtonElement}
 */
function buildSelectButton(documentRef, name) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "selection-select-button";
  button.setAttribute("aria-label", `Selecionar ${name}`);
  button.textContent = name;
  return button;
}

/**
 * The button owns the action. The rest of the row stays clickable for the pointer, and a click
 * on the button must not run the action a second time when it bubbles to the row.
 *
 * @param {HTMLElement} row
 * @param {HTMLButtonElement} selectButton
 * @param {() => void} selectUnit
 */
function wireRowSelection(row, selectButton, selectUnit) {
  selectButton.addEventListener("click", selectUnit);
  row.addEventListener("click", (event) => {
    const isClickOnButton = selectButton.contains(/** @type {Node | null} */ (event.target));
    if (isClickOnButton) {
      return;
    }
    selectUnit();
  });
}

/**
 * @param {RankingUnit} item
 * @param {"municipality" | "region"} level
 * @param {TerritoryIndex} territory
 * @param {(action: Action) => void} dispatch
 */
function handleRankingClick(item, level, territory, dispatch) {
  if (level === "region") {
    dispatch(addRegionAction(item.code, territory));
    return;
  }
  dispatch(toggleMunicipalityAction(item.code));
}

/**
 * @param {"municipality" | "region"} level
 * @returns {string}
 */
function readRankingCaption(level) {
  if (level === "region") {
    return "12 maiores regiões";
  }
  return "12 maiores municípios";
}

/**
 * @param {number[]} values
 * @returns {number} the largest finite value, or 0 when there is none.
 */
function readLargestValue(values) {
  let largest = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (Number.isFinite(values[i]) && values[i] > largest) {
      largest = values[i];
    }
  }
  return largest;
}

/**
 * A thin bar under the unit name; its width is the value over the largest value of the list.
 * It has no text, so the cell text stays the unit name.
 *
 * @param {Document} documentRef
 * @param {number} value
 * @param {number} largestValue
 * @returns {HTMLSpanElement}
 */
function buildProportionBar(documentRef, value, largestValue) {
  const bar = documentRef.createElement("span");
  bar.className = "selection-bar";
  bar.setAttribute("aria-hidden", "true");
  const fill = documentRef.createElement("span");
  fill.className = "selection-bar-fill";
  fill.style.width = `${readBarPercent(value, largestValue)}%`;
  bar.append(fill);
  return bar;
}

/**
 * @param {number} value
 * @param {number} largestValue
 * @returns {number} 0 to 100.
 */
function readBarPercent(value, largestValue) {
  if (largestValue <= 0) {
    return 0;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(100, (value / largestValue) * 100);
}

/**
 * @param {PanelUnit} unit
 * @param {IndicatorDefinition} indicator
 * @param {MunicipalityRecord[]} municipalities
 * @returns {number} the numeric value of the row, 0 when there is no data.
 */
function readUnitValue(unit, indicator, municipalities) {
  if (unit.kind === "municipality") {
    const mun = municipalities.find((m) => m.code === unit.code);
    if (!mun) {
      return 0;
    }
    return resolveNumericValue(indicator.computeValue(mun));
  }
  const regionRecords = municipalities.filter((m) => unit.codes.includes(m.code));
  return resolveNumericValue(aggregateIndicator(indicator, regionRecords).value);
}

/**
 * @param {PanelUnit} unit
 * @param {IndicatorDefinition} indicator
 * @param {MunicipalityRecord[]} municipalities
 * @returns {string}
 */
function formatUnitValue(unit, indicator, municipalities) {
  if (unit.kind === "municipality") {
    const mun = municipalities.find((m) => m.code === unit.code);
    if (!mun) {
      return "sem dado";
    }
    const val = indicator.computeValue(mun);
    if (val === null) {
      return "sem dado";
    }
    return indicator.format(val);
  }

  const regionRecords = municipalities.filter((m) => unit.codes.includes(m.code));
  const agg = aggregateIndicator(indicator, regionRecords);
  return formatAggregatedValue(agg, indicator);
}

/**
 * Computes state ranking (1-based) of municipality for active indicator.
 *
 * @param {string} code
 * @param {MunicipalityRecord[]} municipalities
 * @param {IndicatorDefinition | null} indicator
 * @returns {number | null}
 */
function computeStateRank(code, municipalities, indicator) {
  if (!indicator || !municipalities || municipalities.length === 0) {
    return null;
  }
  const scored = [];
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    const val = indicator.computeValue(m);
    if (val !== null && Number.isFinite(val)) {
      scored.push({ code: m.code, val });
    }
  }
  if (scored.length === 0) {
    return null;
  }
  scored.sort((a, b) => b.val - a.val);
  const foundIndex = scored.findIndex((s) => s.code === code);
  if (foundIndex < 0) {
    return null;
  }
  return foundIndex + 1;
}
