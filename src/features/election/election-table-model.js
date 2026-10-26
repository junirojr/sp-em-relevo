import { aggregateElectionUnits, computeUnitElectionResult } from "../../domain/election.js";
import { groupOf } from "../../domain/territory.js";
import {
  computeDisplayedMarginPp,
  formatCandidateMargin,
  formatCandidateShare,
  resolveColorText,
  resolveOfficeLabel,
} from "./election-compare-model.js";

/**
 * Electoral alternative table data model (ACE-02, ELE-22, RGV-03, TUR-04).
 *
 * Implements:
 * - ACE-02: Rows show territorial unit name, office ("Cargo"), leader candidate,
 *   leader party, leader percentage (with 2 decimal places), runner-up percentage,
 *   margin (in pp, difference of displayed percentages, ELE-22), totalized sections
 *   percentage (pst), and leader color description in Brazilian Portuguese text.
 * - RGV-03: Multi-level aggregation via groupOf(level, code) across Municipality,
 *   Government Region (RG) and Administrative Region (RA), recalculating leader
 *   and margin from the summed candidate votes.
 * - TUR-04: Support for uncertain deputy leadership outside top-10.
 *
 * PROHIBITIONS:
 * - No else or ternary operators in JS code.
 * - No en-dash (U+2013) or em-dash (U+2014) in strings or comments.
 *
 * @typedef {import("../../domain/territory.js").TerritoryIndex} TerritoryIndex
 * @typedef {import("../../domain/territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("../../domain/territory.js").RegionRecord} RegionRecord
 * @typedef {import("../../domain/election.js").ElectionUnitInput} ElectionUnitInput
 * @typedef {import("../../domain/election.js").ElectionUnitResult} ElectionUnitResult
 * @typedef {import("../table/table-model.js").TableColumn} TableColumn
 * @typedef {import("../table/table-model.js").TableRow} TableRow
 * @typedef {import("../table/table-model.js").TableModel} TableModel
 * @typedef {import("../table/table-model.js").TerritorialLevel} TerritorialLevel
 */

export const WCAG_FOOTER_BADGE = "projetado para WCAG 2.2 AA";

/** @type {Record<string, string>} */
const LEVEL_LABELS = {
  municipality: "Municipio",
  governmentRegion: "Regiao de governo",
  region: "Regiao administrativa",
};

/**
 * Resolves territorial level label.
 *
 * @param {string} level
 * @returns {string}
 */
export function resolveLevelLabel(level) {
  const match = LEVEL_LABELS[level];
  if (match) {
    return match;
  }
  return "Municipio";
}

/**
 * Builds table columns for the election alternative table (ACE-02).
 *
 * @param {{
 *   level?: TerritorialLevel,
 *   office?: string,
 *   includeOffice?: boolean
 * }} [options]
 * @returns {TableColumn[]}
 */
export function buildElectionTableColumns(options = {}) {
  const level = options.level || "municipality";
  const unitLabel = resolveLevelLabel(level);

  /** @type {TableColumn[]} */
  const columns = [
    { key: "selection", label: "Selecao", align: "center", type: "control" },
    { key: "code", label: "Codigo", align: "left", type: "text" },
    { key: "name", label: unitLabel, align: "left", type: "text" },
    { key: "office", label: "Cargo", align: "left", type: "text" },
    { key: "leader", label: "Lider", align: "left", type: "text" },
    { key: "party", label: "Partido", align: "left", type: "text" },
    { key: "leaderPct", label: "% Lider", align: "right", type: "numeric" },
    { key: "secondPct", label: "% 2º Lugar", align: "right", type: "numeric" },
    { key: "margin", label: "Margem", align: "right", type: "numeric" },
    { key: "sectionsPct", label: "% Secoes", align: "right", type: "numeric" },
    { key: "colorText", label: "Cor", align: "left", type: "text" },
    { key: "actions", label: "Acoes", align: "center", type: "control" },
  ];

  return columns;
}

/**
 * Builds table rows for election mode across the three territorial levels (ACE-02, RGV-03, TUR-04).
 *
 * @param {{
 *   level?: TerritorialLevel,
 *   mode?: import("../table/table-model.js").ModeId,
 *   office?: string,
 *   municipalities?: MunicipalityRecord[],
 *   regions?: RegionRecord[],
 *   governmentRegions?: RegionRecord[],
 *   electionUnits?: Map<string, ElectionUnitInput> | Record<string, ElectionUnitInput> | ElectionUnitInput[],
 *   selectedCodes?: readonly string[],
 *   pointedCode?: string | null,
 *   inspectedCode?: string | null,
 *   territory?: TerritoryIndex,
 *   theme?: "light" | "dark",
 *   isDeputyFreeSelection?: boolean
 * }} [options]
 * @returns {TableRow[]}
 */
export function buildElectionTableRows(options = {}) {
  const level = options.level || "municipality";
  const mode = options.mode || "second-round";
  const office = options.office || "presidente";
  const officeLabel = resolveOfficeLabel(office);
  const municipalities = options.municipalities || [];
  const regions = options.regions || [];
  const governmentRegions = options.governmentRegions || [];
  const selectedSet = new Set(options.selectedCodes || []);
  const pointedCode = options.pointedCode || null;
  const inspectedCode = options.inspectedCode || null;
  const electionLookup = toLookupMap(options.electionUnits);
  const theme = options.theme || "dark";
  const territory = options.territory;

  if (level === "governmentRegion") {
    return buildGovernmentRegionElectionRows({
      mode,
      officeLabel,
      municipalities,
      governmentRegions,
      selectedSet,
      pointedCode,
      inspectedCode,
      electionLookup,
      territory,
      theme,
      isDeputyFreeSelection: options.isDeputyFreeSelection,
    });
  }

  if (level === "region") {
    return buildRegionElectionRows({
      mode,
      officeLabel,
      municipalities,
      regions,
      selectedSet,
      pointedCode,
      inspectedCode,
      electionLookup,
      territory,
      theme,
      isDeputyFreeSelection: options.isDeputyFreeSelection,
    });
  }

  return buildMunicipalityElectionRows({
    mode,
    officeLabel,
    municipalities,
    regions,
    governmentRegions,
    selectedSet,
    pointedCode,
    inspectedCode,
    electionLookup,
    theme,
  });
}

/**
 * @param {{
 *   mode: import("../table/table-model.js").ModeId,
 *   officeLabel: string,
 *   municipalities: MunicipalityRecord[],
 *   regions: RegionRecord[],
 *   governmentRegions: RegionRecord[],
 *   selectedSet: Set<string>,
 *   pointedCode: string | null,
 *   inspectedCode: string | null,
 *   electionLookup: Map<string, ElectionUnitInput>,
 *   theme: "light" | "dark"
 * }} ctx
 * @returns {TableRow[]}
 */
function buildMunicipalityElectionRows(ctx) {
  const sorted = [...ctx.municipalities].sort((a, b) => {
    if (a.code < b.code) {
      return -1;
    }
    if (a.code > b.code) {
      return 1;
    }
    return 0;
  });

  return sorted.map((mun) => {
    const isSelected = ctx.selectedSet.has(mun.code);
    const isPointed = ctx.pointedCode === mun.code;
    const isInspected = ctx.inspectedCode === mun.code;

    const raw = ctx.electionLookup.get(mun.code) || {
      code: mun.code,
      name: mun.name,
    };
    const elecResult = computeUnitElectionResult(raw, {
      mode: resolveElectionRoundMode(ctx.mode),
      theme: ctx.theme,
    });

    const leader = elecResult.leader;
    const second = elecResult.candidates[1] ?? null;

    let leaderName = "Sem resultado";
    let party = "-";
    let leaderPctNum = 0;
    let secondPctNum = 0;
    let leaderPct = "-";
    let secondPct = "-";

    if (elecResult.status === "tie") {
      leaderName = "Empate";
    }
    if (elecResult.status === "uncertain-leader" || elecResult.uncertainLeader) {
      leaderName = "Lideranca indefinida";
    }
    if (leader) {
      leaderName = leader.name;
      party = leader.party || "-";
      leaderPctNum = leader.sharePct;
      leaderPct = formatCandidateShare(leaderPctNum);
    }
    if (second) {
      secondPctNum = second.sharePct;
      secondPct = formatCandidateShare(secondPctNum);
    }

    // ELE-22: displayed margin is direct difference of displayed 2-decimal percentages
    const marginPp = computeDisplayedMarginPp(leaderPctNum, secondPctNum);
    const margin = formatCandidateMargin(marginPp);
    const sectionsPct = formatCandidateShare(elecResult.sectionsPct);
    const colorText = resolveColorText(party, elecResult.status);

    return {
      code: mun.code,
      name: mun.name,
      isSelected,
      isPointed,
      isInspected,
      office: ctx.officeLabel,
      leader: leaderName,
      party,
      leaderPct,
      secondPct,
      margin,
      sectionsPct,
      colorText,
      rawResult: elecResult,
    };
  });
}

/**
 * @param {{
 *   mode: import("../table/table-model.js").ModeId,
 *   officeLabel: string,
 *   municipalities: MunicipalityRecord[],
 *   governmentRegions: RegionRecord[],
 *   selectedSet: Set<string>,
 *   pointedCode: string | null,
 *   inspectedCode: string | null,
 *   electionLookup: Map<string, ElectionUnitInput>,
 *   territory?: TerritoryIndex,
 *   theme: "light" | "dark",
 *   isDeputyFreeSelection?: boolean
 * }} ctx
 * @returns {TableRow[]}
 */
function buildGovernmentRegionElectionRows(ctx) {
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
      const resolvedGroup = groupOf("governmentRegion", m, ctx.territory);
      if (resolvedGroup === gov.code) {
        return true;
      }
      const stripped = String(gov.code).replace(/^rg-/, "");
      return resolvedGroup === stripped;
    });

    const isSelected =
      ctx.selectedSet.has(gov.code) ||
      (inGov.length > 0 && inGov.every((m) => ctx.selectedSet.has(m.code)));
    const isPointed = ctx.pointedCode === gov.code;
    const isInspected = ctx.inspectedCode === gov.code;

    const childInputs = inGov.map((m) => {
      return (
        ctx.electionLookup.get(m.code) || {
          code: m.code,
          name: m.name,
        }
      );
    });

    const aggResult = aggregateElectionUnits(childInputs, {
      code: gov.code,
      name: gov.label,
      mode: resolveElectionRoundMode(ctx.mode),
      theme: ctx.theme,
      isDeputyFreeSelection: ctx.isDeputyFreeSelection,
    });

    const leader = aggResult.leader;
    const second = aggResult.candidates[1] ?? null;

    let leaderName = "Sem resultado";
    let party = "-";
    let leaderPctNum = 0;
    let secondPctNum = 0;
    let leaderPct = "-";
    let secondPct = "-";

    if (aggResult.status === "tie") {
      leaderName = "Empate";
    }
    if (aggResult.status === "uncertain-leader" || aggResult.uncertainLeader) {
      leaderName = "Lideranca indefinida";
    }
    if (leader) {
      leaderName = leader.name;
      party = leader.party || "-";
      leaderPctNum = leader.sharePct;
      leaderPct = formatCandidateShare(leaderPctNum);
    }
    if (second) {
      secondPctNum = second.sharePct;
      secondPct = formatCandidateShare(secondPctNum);
    }

    const marginPp = computeDisplayedMarginPp(leaderPctNum, secondPctNum);
    const margin = formatCandidateMargin(marginPp);
    const sectionsPct = formatCandidateShare(aggResult.sectionsPct);
    const colorText = resolveColorText(party, aggResult.status);

    return {
      code: gov.code,
      name: gov.label,
      isSelected,
      isPointed,
      isInspected,
      count: inGov.length,
      office: ctx.officeLabel,
      leader: leaderName,
      party,
      leaderPct,
      secondPct,
      margin,
      sectionsPct,
      colorText,
      rawResult: aggResult,
    };
  });
}

/**
 * @param {{
 *   mode: import("../table/table-model.js").ModeId,
 *   officeLabel: string,
 *   municipalities: MunicipalityRecord[],
 *   regions: RegionRecord[],
 *   selectedSet: Set<string>,
 *   pointedCode: string | null,
 *   inspectedCode: string | null,
 *   electionLookup: Map<string, ElectionUnitInput>,
 *   territory?: TerritoryIndex,
 *   theme: "light" | "dark",
 *   isDeputyFreeSelection?: boolean
 * }} ctx
 * @returns {TableRow[]}
 */
function buildRegionElectionRows(ctx) {
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
    const inReg = ctx.municipalities.filter((m) => {
      const resolvedGroup = groupOf("region", m, ctx.territory);
      return resolvedGroup === reg.code;
    });

    const isSelected =
      ctx.selectedSet.has(reg.code) ||
      (inReg.length > 0 && inReg.every((m) => ctx.selectedSet.has(m.code)));
    const isPointed = ctx.pointedCode === reg.code;
    const isInspected = ctx.inspectedCode === reg.code;

    const childInputs = inReg.map((m) => {
      return (
        ctx.electionLookup.get(m.code) || {
          code: m.code,
          name: m.name,
        }
      );
    });

    const aggResult = aggregateElectionUnits(childInputs, {
      code: reg.code,
      name: reg.label,
      mode: resolveElectionRoundMode(ctx.mode),
      theme: ctx.theme,
      isDeputyFreeSelection: ctx.isDeputyFreeSelection,
    });

    const leader = aggResult.leader;
    const second = aggResult.candidates[1] ?? null;

    let leaderName = "Sem resultado";
    let party = "-";
    let leaderPctNum = 0;
    let secondPctNum = 0;
    let leaderPct = "-";
    let secondPct = "-";

    if (aggResult.status === "tie") {
      leaderName = "Empate";
    }
    if (aggResult.status === "uncertain-leader" || aggResult.uncertainLeader) {
      leaderName = "Lideranca indefinida";
    }
    if (leader) {
      leaderName = leader.name;
      party = leader.party || "-";
      leaderPctNum = leader.sharePct;
      leaderPct = formatCandidateShare(leaderPctNum);
    }
    if (second) {
      secondPctNum = second.sharePct;
      secondPct = formatCandidateShare(secondPctNum);
    }

    const marginPp = computeDisplayedMarginPp(leaderPctNum, secondPctNum);
    const margin = formatCandidateMargin(marginPp);
    const sectionsPct = formatCandidateShare(aggResult.sectionsPct);
    const colorText = resolveColorText(party, aggResult.status);

    return {
      code: reg.code,
      name: reg.label,
      isSelected,
      isPointed,
      isInspected,
      count: inReg.length,
      office: ctx.officeLabel,
      leader: leaderName,
      party,
      leaderPct,
      secondPct,
      margin,
      sectionsPct,
      colorText,
      rawResult: aggResult,
    };
  });
}

/**
 * Builds the caption for the election alternative table (ACE-03).
 *
 * @param {{
 *   mode?: import("../table/table-model.js").ModeId,
 *   level?: TerritorialLevel,
 *   office?: string,
 *   totalUnits?: number,
 *   theme?: "light" | "dark"
 * }} [options]
 * @returns {string}
 */
export function buildElectionTableCaption(options = {}) {
  const level = options.level || "municipality";
  const totalUnits = options.totalUnits || 0;
  const theme = options.theme || "dark";
  const office = options.office || "presidente";
  const officeLabel = resolveOfficeLabel(office);
  const levelLabel = resolveLevelLabel(level);
  const themeLabel = resolveThemeLabel(theme);
  const countLabel = `${totalUnits} unidades listadas`;

  return `Tabela de dados eleitorais. Cargo: ${officeLabel}. Nivel territorial: ${levelLabel}. ${countLabel}. Tema: ${themeLabel}.`;
}

/**
 * Resolves theme label in Brazilian Portuguese.
 *
 * @param {string} theme
 * @returns {string}
 */
function resolveThemeLabel(theme) {
  if (theme === "light") {
    return "claro";
  }
  return "escuro";
}

/**
 * Constructs the complete electoral alternative table model (ACE-02, ACE-03, ACE-06).
 *
 * @param {{
 *   level?: TerritorialLevel,
 *   mode?: import("../table/table-model.js").ModeId,
 *   office?: string,
 *   municipalities?: MunicipalityRecord[],
 *   regions?: RegionRecord[],
 *   governmentRegions?: RegionRecord[],
 *   electionUnits?: Map<string, ElectionUnitInput> | Record<string, ElectionUnitInput> | ElectionUnitInput[],
 *   selectedCodes?: readonly string[],
 *   pointedCode?: string | null,
 *   inspectedCode?: string | null,
 *   territory?: TerritoryIndex,
 *   theme?: "light" | "dark",
 *   isDeputyFreeSelection?: boolean
 * }} [options]
 * @returns {TableModel}
 */
export function buildElectionTableModel(options = {}) {
  const level = options.level || "municipality";
  const mode = options.mode || "second-round";
  const columns = buildElectionTableColumns(options);
  const rows = buildElectionTableRows(options);
  const caption = buildElectionTableCaption({
    ...options,
    totalUnits: rows.length,
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

/**
 * @param {any} input
 * @returns {Map<string, ElectionUnitInput>}
 */
function toLookupMap(input) {
  if (!input) {
    return new Map();
  }
  if (input instanceof Map) {
    return input;
  }
  const map = new Map();
  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i += 1) {
      const item = input[i];
      if (item && item.code) {
        map.set(item.code, item);
      }
    }
    return map;
  }
  if (typeof input === "object") {
    const keys = Object.keys(input);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      map.set(k, input[k]);
    }
  }
  return map;
}

/** @param {import("../table/table-model.js").ModeId} mode
 * @returns {import("../../domain/election.js").ElectionRoundMode} */
function resolveElectionRoundMode(mode) {
  if (mode === "first-round") return mode;
  return "live";
}
