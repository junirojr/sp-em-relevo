import { aggregateIndicator, formatAggregatedValue } from "../../domain/aggregation.js";
import { classify } from "../../domain/classification.js";
import { computeUnitElectionResult } from "../../domain/election.js";
import { formatValue } from "../../domain/format.js";
import { INDICATORS } from "../../domain/indicator.js";

/**
 * Pure data model generator for the alternative data table.
 * Follows ACE-02, ACE-03, ACE-04 and ACE-06.
 *
 * @typedef {"municipality" | "governmentRegion" | "region"} TerritorialLevel
 * @typedef {"indicators" | "first-round" | "second-round"} ModeId
 * @typedef {"light" | "dark"} ThemeId
 *
 * @typedef {{
 *   key: string,
 *   label: string,
 *   align: "left" | "right" | "center",
 *   type: "text" | "numeric" | "control"
 * }} TableColumn
 *
 * @typedef {{
 *   code: string,
 *   name: string,
 *   isSelected: boolean,
 *   isPointed: boolean,
 *   isInspected: boolean,
 *   value?: number | null,
 *   formattedValue?: string,
 *   classIndex?: number,
 *   classLabel?: string,
 *   regionCode?: string,
 *   regionName?: string,
 *   govRegionCode?: string,
 *   govRegionName?: string,
 *   count?: number,
 *   leader?: string,
 *   party?: string,
 *   leaderPct?: string,
 *   secondPct?: string,
 *   margin?: string,
 *   sectionsPct?: string,
 *   colorText?: string,
 *   rawResult?: any
 * }} TableRow
 *
 * @typedef {{
 *   caption: string,
 *   columns: TableColumn[],
 *   rows: TableRow[],
 *   footerText: string,
 *   level: TerritorialLevel,
 *   mode: ModeId,
 *   totalCount: number,
 *   selectedCount: number
 * }} TableModel
 */

export const WCAG_FOOTER_BADGE = "projetado para WCAG 2.2 AA";

const LEVEL_LABELS = {
  municipality: "Município",
  governmentRegion: "Região de governo",
  region: "Região administrativa",
};

const ROUND_LABELS = {
  "first-round": "1º turno (Governador e Presidente)",
  "second-round": "2º turno (Presidente)",
};

const THEME_LABELS = {
  light: "claro",
  dark: "escuro",
};

/**
 * @param {string} level
 * @returns {string}
 */
export function resolveLevelLabel(level) {
  const match = LEVEL_LABELS[level];
  if (match) {
    return match;
  }
  return "Município";
}

/**
 * @param {string} theme
 * @returns {string}
 */
export function resolveThemeLabel(theme) {
  const match = THEME_LABELS[theme];
  if (match) {
    return match;
  }
  return "escuro";
}

/**
 * @param {string} round
 * @returns {string}
 */
export function resolveRoundLabel(round) {
  const match = ROUND_LABELS[round];
  if (match) {
    return match;
  }
  return "Eleição";
}

/**
 * @param {any} indicator
 * @returns {string}
 */
export function resolveIndicatorLabel(indicator) {
  if (indicator && typeof indicator.label === "string") {
    return indicator.label;
  }
  return "População";
}

/**
 * Builds descriptive caption text summarizing state (ACE-03).
 *
 * @param {{
 *   mode?: ModeId,
 *   level?: TerritorialLevel,
 *   indicator?: any,
 *   totalUnits?: number,
 *   theme?: ThemeId
 * }} [options]
 * @returns {string}
 */
export function buildTableCaption(options = {}) {
  const mode = options.mode || "indicators";
  const level = options.level || "municipality";
  const totalUnits = options.totalUnits || 0;
  const theme = options.theme || "dark";

  const levelLabel = resolveLevelLabel(level);
  const themeLabel = resolveThemeLabel(theme);
  const countLabel = `${totalUnits} unidades listadas`;

  if (mode === "first-round" || mode === "second-round") {
    const roundLabel = resolveRoundLabel(mode);
    return `Tabela de dados eleitorais. Turno: ${roundLabel}. Nível territorial: ${levelLabel}. ${countLabel}. Tema: ${themeLabel}.`;
  }

  const indicatorLabel = resolveIndicatorLabel(options.indicator);
  return `Tabela de dados do mapa. Indicador: ${indicatorLabel}. Nível territorial: ${levelLabel}. ${countLabel}. Tema: ${themeLabel}.`;
}

/**
 * Resolves color name in Brazilian Portuguese for accessibility (ACE-02).
 *
 * @param {string} [party]
 * @param {string} [status]
 * @returns {string}
 */
export function resolveColorText(party = "", status = "") {
  if (status === "no-result") {
    return "Cinza sem dado";
  }
  if (status === "tie") {
    return "Cinza empate";
  }
  if (status === "insufficient-sections") {
    return "Cinza em apuração";
  }

  const normalized = String(party || "").toUpperCase().trim();
  const partyColors = {
    PT: "Vermelho",
    PL: "Azul escuro",
    REPUBLICANOS: "Azul",
    PP: "Azul médio",
    PSB: "Amarelo",
    REDE: "Verde água",
    MDB: "Verde",
    PSD: "Roxo",
    PSDB: "Azul clássico",
    UNIAO: "Azul cobalto",
    PSOL: "Magenta",
    NOVO: "Laranja",
    PDT: "Rosa forte",
    PODE: "Azul claro",
    SOLIDARIEDADE: "Laranja claro",
    PCDOB: "Rubi",
    PV: "Verde claro",
    CIDADANIA: "Magenta claro",
    AVANTE: "Azul petróleo",
    PRD: "Índigo",
  };

  const match = partyColors[normalized];
  if (match) {
    return match;
  }
  if (normalized.length > 0) {
    return `Cor partidária (${normalized})`;
  }
  return "Cinza neutro";
}

/**
 * Formats a percentage value for Brazilian Portuguese UI.
 *
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function formatPercentage(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (Number.isNaN(value)) {
    return "-";
  }
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * Formats margin in percentage points for Brazilian Portuguese UI.
 *
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function formatMarginPoints(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (Number.isNaN(value)) {
    return "-";
  }
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} pp`;
}

/**
 * Builds table column definitions based on mode and territorial level.
 *
 * @param {{
 *   mode?: ModeId,
 *   level?: TerritorialLevel,
 *   indicator?: any
 * }} [options]
 * @returns {TableColumn[]}
 */
export function buildTableColumns(options = {}) {
  const mode = options.mode || "indicators";
  const level = options.level || "municipality";
  const unitLabel = resolveLevelLabel(level);

  if (mode === "first-round" || mode === "second-round") {
    return [
      { key: "selection", label: "Seleção", align: "center", type: "control" },
      { key: "code", label: "Código", align: "left", type: "text" },
      { key: "name", label: unitLabel, align: "left", type: "text" },
      { key: "leader", label: "Líder", align: "left", type: "text" },
      { key: "party", label: "Partido", align: "left", type: "text" },
      { key: "leaderPct", label: "% Líder", align: "right", type: "numeric" },
      { key: "secondPct", label: "% 2º Lugar", align: "right", type: "numeric" },
      { key: "margin", label: "Margem", align: "right", type: "numeric" },
      { key: "sectionsPct", label: "% Seções", align: "right", type: "numeric" },
      { key: "colorText", label: "Cor", align: "left", type: "text" },
      { key: "actions", label: "Ações", align: "center", type: "control" },
    ];
  }

  const indicatorLabel = resolveIndicatorLabel(options.indicator);
  const columns = [
    { key: "selection", label: "Seleção", align: "center", type: "control" },
    { key: "code", label: "Código", align: "left", type: "text" },
    { key: "name", label: unitLabel, align: "left", type: "text" },
    { key: "value", label: indicatorLabel, align: "right", type: "numeric" },
  ];

  if (level === "municipality") {
    columns.push({ key: "classIndex", label: "Faixa", align: "center", type: "numeric" });
    columns.push({ key: "region", label: "Região administrativa", align: "left", type: "text" });
  }

  if (level === "governmentRegion" || level === "region") {
    columns.push({ key: "count", label: "Municípios", align: "right", type: "numeric" });
  }

  columns.push({ key: "actions", label: "Ações", align: "center", type: "control" });
  return columns;
}

/**
 * Builds table rows matching inspect() values deterministically (ACE-02, ACE-03).
 *
 * @param {{
 *   mode?: ModeId,
 *   level?: TerritorialLevel,
 *   indicator?: any,
 *   municipalities?: any[],
 *   regions?: any[],
 *   governmentRegions?: any[],
 *   breaks?: number[],
 *   selectedCodes?: readonly string[],
 *   pointedCode?: string | null,
 *   inspectedCode?: string | null,
 *   electionUnits?: Record<string, any> | Map<string, any> | any[],
 *   theme?: ThemeId
 * }} [options]
 * @returns {TableRow[]}
 */
export function buildTableRows(options = {}) {
  const mode = options.mode || "indicators";
  const level = options.level || "municipality";
  const indicator = options.indicator || INDICATORS.population;
  const municipalities = options.municipalities || [];
  const regions = options.regions || [];
  const governmentRegions = options.governmentRegions || [];
  const breaks = options.breaks || [];
  const selectedSet = new Set(options.selectedCodes || []);
  const pointedCode = options.pointedCode || null;
  const inspectedCode = options.inspectedCode || null;

  if (level === "governmentRegion") {
    return buildGovernmentRegionRows({
      mode,
      indicator,
      municipalities,
      governmentRegions,
      selectedSet,
      pointedCode,
      inspectedCode,
      electionUnits: options.electionUnits,
      theme: options.theme,
    });
  }

  if (level === "region") {
    return buildRegionRows({
      mode,
      indicator,
      municipalities,
      regions,
      selectedSet,
      pointedCode,
      inspectedCode,
      electionUnits: options.electionUnits,
      theme: options.theme,
    });
  }

  return buildMunicipalityRows({
    mode,
    indicator,
    municipalities,
    regions,
    governmentRegions,
    breaks,
    selectedSet,
    pointedCode,
    inspectedCode,
    electionUnits: options.electionUnits,
    theme: options.theme,
  });
}

/**
 * @param {{
 *   mode: ModeId,
 *   indicator: any,
 *   municipalities: any[],
 *   regions: any[],
 *   governmentRegions: any[],
 *   breaks: number[],
 *   selectedSet: Set<string>,
 *   pointedCode: string | null,
 *   inspectedCode: string | null,
 *   electionUnits?: any,
 *   theme?: ThemeId
 * }} ctx
 * @returns {TableRow[]}
 */
function buildMunicipalityRows(ctx) {
  const regionMap = new Map();
  for (let i = 0; i < ctx.regions.length; i += 1) {
    regionMap.set(ctx.regions[i].code, ctx.regions[i].label);
  }

  const govRegionMap = new Map();
  for (let i = 0; i < ctx.governmentRegions.length; i += 1) {
    govRegionMap.set(ctx.governmentRegions[i].code, ctx.governmentRegions[i].label);
  }

  // Deterministic order: sorted by municipal code ascending
  const sorted = [...ctx.municipalities].sort((a, b) => {
    if (a.code < b.code) {
      return -1;
    }
    if (a.code > b.code) {
      return 1;
    }
    return 0;
  });

  const electionLookup = resolveElectionLookup(ctx.electionUnits);

  return sorted.map((mun) => {
    const isSelected = ctx.selectedSet.has(mun.code);
    const isPointed = ctx.pointedCode === mun.code;
    const isInspected = ctx.inspectedCode === mun.code;
    const regionName = regionMap.get(mun.regionCode) || mun.regionCode || "";
    const govRegionName =
      govRegionMap.get(mun.governmentRegionCode) ||
      mun.governmentRegionName ||
      mun.governmentRegionCode ||
      "";

    if (ctx.mode === "first-round" || ctx.mode === "second-round") {
      const elecData = electionLookup.get(mun.code) || {
        code: mun.code,
        name: mun.name,
      };
      const elecResult = computeUnitElectionResult(elecData, {
        mode: ctx.mode,
        theme: ctx.theme || "dark",
      });

      const leaderCandidate = elecResult.leader;
      let leaderName = "Sem resultado";
      let party = "-";
      let leaderPct = "-";
      let secondPct = "-";

      if (elecResult.status === "tie") {
        leaderName = "Empate";
      }

      if (leaderCandidate) {
        leaderName = leaderCandidate.name;
        party = leaderCandidate.party || "-";
        leaderPct = formatPercentage(leaderCandidate.sharePct);
      }

      if (elecResult.candidates && elecResult.candidates.length >= 2) {
        const secondCandidate = elecResult.candidates[1];
        secondPct = formatPercentage(secondCandidate.sharePct);
      }

      const margin = formatMarginPoints(elecResult.marginPp);
      const sectionsPct = formatPercentage(elecResult.sectionsPct);
      const colorText = resolveColorText(party, elecResult.status);

      return {
        code: mun.code,
        name: mun.name,
        isSelected,
        isPointed,
        isInspected,
        regionName,
        govRegionName,
        leader: leaderName,
        party,
        leaderPct,
        secondPct,
        margin,
        sectionsPct,
        colorText,
        rawResult: elecResult,
      };
    }

    let value = null;
    if (typeof ctx.indicator.computeValue === "function") {
      value = ctx.indicator.computeValue(mun);
    }
    const formattedValue = formatValue(value, ctx.indicator.id);

    let classIndex = 0;
    let classLabel = "Sem dado";
    if (value !== null && value !== undefined && !Number.isNaN(value) && ctx.breaks.length > 0) {
      classIndex = classify(value, ctx.breaks);
      classLabel = `Faixa ${classIndex + 1} de ${ctx.breaks.length + 1}`;
    }

    return {
      code: mun.code,
      name: mun.name,
      isSelected,
      isPointed,
      isInspected,
      value,
      formattedValue,
      classIndex,
      classLabel,
      regionCode: mun.regionCode,
      regionName,
      govRegionCode: mun.governmentRegionCode,
      govRegionName,
    };
  });
}

/**
 * @param {{
 *   mode: ModeId,
 *   indicator: any,
 *   municipalities: any[],
 *   governmentRegions: any[],
 *   selectedSet: Set<string>,
 *   pointedCode: string | null,
 *   inspectedCode: string | null,
 *   electionUnits?: any,
 *   theme?: ThemeId
 * }} ctx
 * @returns {TableRow[]}
 */
function buildGovernmentRegionRows(ctx) {
  const sorted = [...ctx.governmentRegions].sort((a, b) => {
    if (a.code < b.code) {
      return -1;
    }
    if (a.code > b.code) {
      return 1;
    }
    return 0;
  });

  return sorted.map((gov) => {
    const inGov = ctx.municipalities.filter((m) => {
      if (m.governmentRegionCode === gov.code) {
        return true;
      }
      const stripped = String(gov.code).replace(/^rg-/, "");
      return m.governmentRegionCode === stripped;
    });

    const isSelected =
      ctx.selectedSet.has(gov.code) ||
      (inGov.length > 0 && inGov.every((m) => ctx.selectedSet.has(m.code)));
    const isPointed = ctx.pointedCode === gov.code;
    const isInspected = ctx.inspectedCode === gov.code;

    if (ctx.mode === "first-round" || ctx.mode === "second-round") {
      return {
        code: gov.code,
        name: gov.label,
        isSelected,
        isPointed,
        isInspected,
        count: inGov.length,
        leader: "-",
        party: "-",
        leaderPct: "-",
        secondPct: "-",
        margin: "-",
        sectionsPct: "-",
        colorText: "Neutro",
      };
    }

    const agg = aggregateIndicator(ctx.indicator, inGov);
    const formattedValue = formatAggregatedValue(agg, ctx.indicator);

    return {
      code: gov.code,
      name: gov.label,
      isSelected,
      isPointed,
      isInspected,
      count: inGov.length,
      value: agg.value,
      formattedValue,
    };
  });
}

/**
 * @param {{
 *   mode: ModeId,
 *   indicator: any,
 *   municipalities: any[],
 *   regions: any[],
 *   selectedSet: Set<string>,
 *   pointedCode: string | null,
 *   inspectedCode: string | null,
 *   electionUnits?: any,
 *   theme?: ThemeId
 * }} ctx
 * @returns {TableRow[]}
 */
function buildRegionRows(ctx) {
  const sorted = [...ctx.regions].sort((a, b) => {
    const numA = Number.parseInt(a.code, 10);
    const numB = Number.parseInt(b.code, 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
    if (a.code < b.code) {
      return -1;
    }
    if (a.code > b.code) {
      return 1;
    }
    return 0;
  });

  return sorted.map((reg) => {
    const inReg = ctx.municipalities.filter((m) => m.regionCode === reg.code);
    const isSelected =
      ctx.selectedSet.has(reg.code) ||
      (inReg.length > 0 && inReg.every((m) => ctx.selectedSet.has(m.code)));
    const isPointed = ctx.pointedCode === reg.code;
    const isInspected = ctx.inspectedCode === reg.code;

    if (ctx.mode === "first-round" || ctx.mode === "second-round") {
      return {
        code: reg.code,
        name: reg.label,
        isSelected,
        isPointed,
        isInspected,
        count: inReg.length,
        leader: "-",
        party: "-",
        leaderPct: "-",
        secondPct: "-",
        margin: "-",
        sectionsPct: "-",
        colorText: "Neutro",
      };
    }

    const agg = aggregateIndicator(ctx.indicator, inReg);
    const formattedValue = formatAggregatedValue(agg, ctx.indicator);

    return {
      code: reg.code,
      name: reg.label,
      isSelected,
      isPointed,
      isInspected,
      count: inReg.length,
      value: agg.value,
      formattedValue,
    };
  });
}

/**
 * @param {any} electionUnits
 * @returns {Map<string, any>}
 */
function resolveElectionLookup(electionUnits) {
  const map = new Map();
  if (!electionUnits) {
    return map;
  }
  if (electionUnits instanceof Map) {
    return electionUnits;
  }
  if (Array.isArray(electionUnits)) {
    for (let i = 0; i < electionUnits.length; i += 1) {
      const item = electionUnits[i];
      if (item && item.code) {
        map.set(item.code, item);
      }
    }
    return map;
  }
  if (typeof electionUnits === "object") {
    const keys = Object.keys(electionUnits);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      map.set(key, electionUnits[key]);
    }
    return map;
  }
  return map;
}

/**
 * Constructs the complete table data model (ACE-02, ACE-03, ACE-06).
 *
 * @param {{
 *   mode?: ModeId,
 *   level?: TerritorialLevel,
 *   indicator?: any,
 *   municipalities?: any[],
 *   regions?: any[],
 *   governmentRegions?: any[],
 *   breaks?: number[],
 *   selectedCodes?: readonly string[],
 *   pointedCode?: string | null,
 *   inspectedCode?: string | null,
 *   electionUnits?: any,
 *   theme?: ThemeId
 * }} [options]
 * @returns {TableModel}
 */
export function buildTableModel(options = {}) {
  const mode = options.mode || "indicators";
  const level = options.level || "municipality";
  const columns = buildTableColumns(options);
  const rows = buildTableRows(options);
  const caption = buildTableCaption({
    mode,
    level,
    indicator: options.indicator,
    totalUnits: rows.length,
    theme: options.theme,
  });

  let selectedCount = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].isSelected) {
      selectedCount += 1;
    }
  }

  return {
    caption,
    columns,
    rows,
    footerText: WCAG_FOOTER_BADGE,
    level,
    mode,
    totalCount: rows.length,
    selectedCount,
  };
}
