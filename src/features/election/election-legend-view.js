import { assignCandidateColors, getElectionNeutrals } from "../../domain/election-colors.js";
import { ELECTION_STRINGS } from "./election-strings.js";

/**
 * Categorical election legend view component (N15, TUR-05, TUR-06, ELE-07, ACE-04).
 *
 * Implements:
 * - TUR-05: Deterministic list of up to 8 colored candidates ordered by municipal leadership,
 *   with remaining candidates assigned to "outros" and others fraction displayed.
 * - TUR-06: Color swatch, ballot name, number, party, count of led municipalities.
 *   Touch/focus on a municipality in "outros" reveals that unit's specific leader.
 *   Official credit: "Fonte: TSE (CC-BY), dados agregados por este projeto".
 * - ELE-07: Display of active neutral states ("sem resultado", "empate", "outros")
 *   with individual municipal counts, omitting absent states.
 *
 * @typedef {import("../../domain/election-colors.js").ThemeMode} ThemeMode
 * @typedef {import("../../domain/election-colors.js").CandidateColorAssignment} CandidateColorAssignment
 * @typedef {import("../../domain/election-colors.js").AssignedCandidatePalette} AssignedCandidatePalette
 * @typedef {import("../../domain/election-colors.js").CandidateColorInput} CandidateColorInput
 *
 * @typedef {{
 *   code?: string,
 *   name: string,
 *   isOthers?: boolean,
 *   colorKey?: "candidate" | "tie" | "noResult" | "others",
 *   leaderName?: string,
 *   leaderBallot?: string | number,
 *   leaderParty?: string,
 *   leaderVotes?: number,
 *   leaderSharePct?: number,
 *   totalValidVotes?: number
 * }} InspectedUnitInfo
 *
 * @typedef {{
 *   noResult?: number,
 *   tie?: number,
 *   others?: number
 * }} NeutralCounts
 *
 * @typedef {{
 *   candidates?: CandidateColorInput[],
 *   palette?: AssignedCandidatePalette | null,
 *   theme?: ThemeMode,
 *   officeTitle?: string,
 *   neutralCounts?: NeutralCounts,
 *   inspectedUnit?: InspectedUnitInfo | null,
 *   unlistedOthersVotes?: number
 * }} ElectionLegendOptions
 */

/**
 * Formats a fraction or percentage into Portuguese decimal string with 1 decimal place.
 *
 * @param {number} valuePct
 * @returns {string}
 */
export function formatPercentageValue(valuePct) {
  if (!Number.isFinite(valuePct) || valuePct <= 0) {
    return "0,0%";
  }
  return `${valuePct.toFixed(1).replace(".", ",")}%`;
}

/**
 * Checks whether an inspected unit is classified as "outros" (TUR-06).
 *
 * @param {InspectedUnitInfo | null | undefined} unit
 * @returns {boolean}
 */
export function isUnitInOthers(unit) {
  if (!unit) {
    return false;
  }
  if (unit.isOthers === true) {
    return true;
  }
  if (unit.colorKey === "others") {
    return true;
  }
  return false;
}

/**
 * Injects required CSS rules for the election legend if not present.
 *
 * @param {Document} documentRef
 */
function ensureLegendStyles(documentRef) {
  if (!documentRef?.head) {
    return;
  }
  if (documentRef.getElementById("election-legend-injected-styles")) {
    return;
  }
  const styleEl = documentRef.createElement("style");
  styleEl.id = "election-legend-injected-styles";
  styleEl.textContent = `
    .election-legend {
      border: 1px solid var(--border-color, #70737f);
      border-radius: var(--radius-sm, 6px);
      padding: var(--space-xs, 6px) var(--space-sm, 8px);
      margin: 0 0 var(--space-sm, 8px) 0;
      background-color: var(--card-bg, rgba(25, 26, 31, 0.7));
      font-size: var(--font-size-xs, 12px);
      color: var(--text-primary, #eceef4);
    }
    .election-legend-header {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: var(--space-xs, 6px);
      border-bottom: 1px solid var(--border-color, #33353c);
      padding-bottom: 4px;
    }
    .election-legend-title {
      font-size: var(--font-size-xs, 11px);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted, #858a96);
      margin: 0;
    }
    .election-legend-scope {
      font-size: 11px;
      color: var(--text-secondary, #b4b8c5);
    }
    .election-legend-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .election-legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 24px;
      padding: 2px 4px;
      border-radius: 3px;
    }
    .election-legend-swatch {
      width: 14px;
      height: 14px;
      min-width: 14px;
      border-radius: 3px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      flex-shrink: 0;
    }
    .election-legend-info {
      display: flex;
      flex: 1;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
      overflow: hidden;
    }
    .election-legend-name-group {
      display: flex;
      align-items: baseline;
      gap: 4px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .election-legend-name {
      font-weight: 600;
      color: var(--text-primary, #eceef4);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .election-legend-party {
      font-size: 11px;
      color: var(--text-muted, #858a96);
    }
    .election-legend-ballot {
      font-size: 11px;
      color: var(--text-muted, #858a96);
      font-variant-numeric: tabular-nums;
    }
    .election-legend-count {
      font-size: 11px;
      color: var(--text-secondary, #b4b8c5);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .election-legend-neutrals {
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px dashed var(--border-color, #33353c);
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .election-legend-neutral-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      min-height: 22px;
      color: var(--text-secondary, #b4b8c5);
    }
    .election-legend-neutral-label {
      flex: 1;
    }
    .election-legend-neutral-count {
      font-variant-numeric: tabular-nums;
    }
    .election-legend-others-card {
      margin-top: 6px;
      padding: 6px 8px;
      background: rgba(82, 86, 97, 0.25);
      border: 1px solid var(--border-color, #70737f);
      border-radius: var(--radius-xs, 4px);
    }
    .election-legend-others-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-primary, #eceef4);
      margin-bottom: 2px;
    }
    .election-legend-others-leader {
      font-size: 12px;
      color: var(--text-primary, #eceef4);
    }
    .election-legend-others-detail {
      font-size: 11px;
      color: var(--text-muted, #858a96);
      margin-top: 2px;
    }
    .election-legend-footer {
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px solid var(--border-color, #33353c);
      font-size: 10px;
      color: var(--text-muted, #858a96);
      text-align: right;
    }
  `;
  documentRef.head.append(styleEl);
}

/**
 * Formats municipal count text.
 *
 * @param {number} count
 * @returns {string}
 */
function formatMunicipalCount(count) {
  if (count === 1) {
    return "1 mun.";
  }
  return `${count} mun.`;
}

/**
 * Resolves the count of municipalities led by others.
 *
 * @param {NeutralCounts} neutralCounts
 * @param {AssignedCandidatePalette} palette
 * @returns {number}
 */
function resolveOthersMunicipalCount(neutralCounts, palette) {
  if (neutralCounts.others !== undefined) {
    return neutralCounts.others;
  }
  const others = palette.othersCandidates;
  if (!others || others.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const c of others) {
    sum += c.ledMunicipalities ?? 0;
  }
  return sum;
}

/**
 * Resolves ballot suffix string.
 *
 * @param {string | number | undefined} ballot
 * @returns {string}
 */
function resolveBallotPart(ballot) {
  if (!ballot) {
    return "";
  }
  return ` - ${ballot}`;
}

/**
 * Resolves party and ballot info string.
 *
 * @param {string | undefined} party
 * @param {string | number | undefined} ballot
 * @returns {string}
 */
function resolvePartyPart(party, ballot) {
  if (!party) {
    return "";
  }
  const ballotPart = resolveBallotPart(ballot);
  return ` (${party}${ballotPart})`;
}

/**
 * Resolves votes count text string.
 *
 * @param {number | undefined} votes
 * @returns {string}
 */
function resolveVotesString(votes) {
  if (votes === undefined) {
    return "";
  }
  return `${votes.toLocaleString("pt-BR")} votos`;
}

/**
 * Resolves share percentage text string.
 *
 * @param {number | undefined} sharePct
 * @returns {string}
 */
function resolveShareString(sharePct) {
  if (sharePct === undefined) {
    return "";
  }
  return ` (${formatPercentageValue(sharePct)})`;
}

/**
 * Mounts the categorical election legend view.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} slotElement
 * @param {ElectionLegendOptions} [options]
 * @returns {{
 *   element: HTMLElement,
 *   update: (options: ElectionLegendOptions) => void,
 *   inspectUnit: (unit: InspectedUnitInfo | null) => void,
 *   destroy: () => void
 * }}
 */
export function mountElectionLegendView(documentRef, slotElement, options = {}) {
  let currentOptions = { ...options };
  let currentTheme = options.theme ?? "dark";
  let currentInspectedUnit = options.inspectedUnit ?? null;

  ensureLegendStyles(documentRef);

  slotElement.innerHTML = "";
  slotElement.hidden = false;

  const section = documentRef.createElement("section");
  section.className = "election-legend";
  section.setAttribute("aria-label", "Legenda eleitoral categorica");

  const header = documentRef.createElement("div");
  header.className = "election-legend-header";

  const title = documentRef.createElement("h3");
  title.className = "election-legend-title";
  title.textContent = options.officeTitle ?? "Lideranca por municipio em Sao Paulo";

  const scope = documentRef.createElement("span");
  scope.className = "election-legend-scope";
  scope.textContent = "Ate 8 lideres com cores proprias (regra E25)";

  header.append(title, scope);
  section.append(header);

  const candidatesList = documentRef.createElement("ul");
  candidatesList.className = "election-legend-list";
  candidatesList.setAttribute("role", "list");
  candidatesList.setAttribute("aria-label", "Candidatos líderes");
  section.append(candidatesList);

  const neutralsContainer = documentRef.createElement("div");
  neutralsContainer.className = "election-legend-neutrals";
  neutralsContainer.setAttribute("aria-label", "Estados neutros e outros");
  section.append(neutralsContainer);

  const othersCalloutSlot = documentRef.createElement("div");
  othersCalloutSlot.className = "election-legend-others-container";
  othersCalloutSlot.setAttribute("role", "region");
  othersCalloutSlot.setAttribute("aria-live", "polite");
  section.append(othersCalloutSlot);

  const footer = documentRef.createElement("footer");
  footer.className = "election-legend-footer";
  footer.textContent = ELECTION_STRINGS.credits.sourceTseAggregated;
  section.append(footer);

  slotElement.append(section);

  /** @param {ElectionLegendOptions} opts
   * @returns {AssignedCandidatePalette} */
  function resolvePalette(opts) {
    if (opts.palette) {
      return opts.palette;
    }
    const candidateInputs = opts.candidates ?? [];
    return assignCandidateColors(candidateInputs, currentTheme, {
      unlistedOthersVotes: opts.unlistedOthersVotes,
    });
  }

  /** @param {AssignedCandidatePalette} palette */
  function renderCandidates(palette) {
    candidatesList.innerHTML = "";
    const coloredList = palette.coloredCandidates ?? [];

    for (const candidate of coloredList) {
      const item = documentRef.createElement("li");
      item.className = "election-legend-item";
      item.dataset.ballot = String(candidate.ballotNumber);

      const swatch = documentRef.createElement("span");
      swatch.className = "election-legend-swatch";
      swatch.style.backgroundColor = candidate.color;
      swatch.setAttribute("aria-hidden", "true");

      const info = documentRef.createElement("div");
      info.className = "election-legend-info";

      const nameGroup = documentRef.createElement("div");
      nameGroup.className = "election-legend-name-group";

      const nameSpan = documentRef.createElement("span");
      nameSpan.className = "election-legend-name";
      nameSpan.textContent = candidate.name;

      const partySpan = documentRef.createElement("span");
      partySpan.className = "election-legend-party";
      partySpan.textContent = `(${candidate.party})`;

      const ballotSpan = documentRef.createElement("span");
      ballotSpan.className = "election-legend-ballot";
      ballotSpan.textContent = String(candidate.ballotNumber);

      nameGroup.append(nameSpan, partySpan, ballotSpan);

      const countSpan = documentRef.createElement("span");
      countSpan.className = "election-legend-count";
      countSpan.textContent = formatMunicipalCount(candidate.ledMunicipalities ?? 0);

      info.append(nameGroup, countSpan);
      item.append(swatch, info);
      candidatesList.append(item);
    }
  }

  /** @param {AssignedCandidatePalette} palette
   * @param {NeutralCounts} neutralCounts */
  function renderNeutrals(palette, neutralCounts) {
    neutralsContainer.innerHTML = "";
    const neutrals = getElectionNeutrals(currentTheme);

    const noResultCount = neutralCounts.noResult ?? 0;
    const tieCount = neutralCounts.tie ?? 0;
    const othersCount = resolveOthersMunicipalCount(neutralCounts, palette);
    const othersSharePct = palette.othersSharePct ?? 0;

    let hasAnyNeutrals = false;

    // 1. Sem resultado (ELE-07)
    if (noResultCount > 0) {
      hasAnyNeutrals = true;
      const item = documentRef.createElement("div");
      item.className = "election-legend-neutral-item election-legend-neutral-no-result";

      const swatch = documentRef.createElement("span");
      swatch.className = "election-legend-swatch";
      swatch.style.backgroundColor = neutrals.noResult;
      swatch.setAttribute("aria-hidden", "true");

      const label = documentRef.createElement("span");
      label.className = "election-legend-neutral-label";
      label.textContent = "Sem resultado";

      const count = documentRef.createElement("span");
      count.className = "election-legend-neutral-count";
      count.textContent = formatMunicipalCount(noResultCount);

      item.append(swatch, label, count);
      neutralsContainer.append(item);
    }

    // 2. Empate (ELE-07)
    if (tieCount > 0) {
      hasAnyNeutrals = true;
      const item = documentRef.createElement("div");
      item.className = "election-legend-neutral-item election-legend-neutral-tie";

      const swatch = documentRef.createElement("span");
      swatch.className = "election-legend-swatch";
      swatch.style.backgroundColor = neutrals.tie;
      swatch.setAttribute("aria-hidden", "true");

      const label = documentRef.createElement("span");
      label.className = "election-legend-neutral-label";
      label.textContent = "Empate";

      const count = documentRef.createElement("span");
      count.className = "election-legend-neutral-count";
      count.textContent = formatMunicipalCount(tieCount);

      item.append(swatch, label, count);
      neutralsContainer.append(item);
    }

    // 3. Outros candidatos (ELE-07, TUR-05, TUR-06)
    const hasOthersCandidates = palette.othersCandidates && palette.othersCandidates.length > 0;
    const hasOthersFraction = palette.othersFraction > 0 || othersSharePct > 0;
    if (othersCount > 0 || hasOthersCandidates || hasOthersFraction) {
      hasAnyNeutrals = true;
      const item = documentRef.createElement("div");
      item.className = "election-legend-neutral-item election-legend-neutral-others";

      const swatch = documentRef.createElement("span");
      swatch.className = "election-legend-swatch";
      swatch.style.backgroundColor = neutrals.others;
      swatch.setAttribute("aria-hidden", "true");

      const label = documentRef.createElement("span");
      label.className = "election-legend-neutral-label";
      const fractionStr = formatPercentageValue(othersSharePct);
      label.textContent = `Outros candidatos (${fractionStr} dos votos nominais)`;

      const count = documentRef.createElement("span");
      count.className = "election-legend-neutral-count";
      count.textContent = formatMunicipalCount(othersCount);

      item.append(swatch, label, count);
      neutralsContainer.append(item);
    }

    if (!hasAnyNeutrals) {
      neutralsContainer.hidden = true;
    }
    if (hasAnyNeutrals) {
      neutralsContainer.hidden = false;
    }
  }

  /**
   * @param {InspectedUnitInfo | null | undefined} unit
   */
  function renderInspectedOthers(unit) {
    othersCalloutSlot.innerHTML = "";
    const inOthers = isUnitInOthers(unit);
    if (!inOthers || !unit) {
      othersCalloutSlot.hidden = true;
      return;
    }
    othersCalloutSlot.hidden = false;

    const card = documentRef.createElement("div");
    card.className = "election-legend-others-card";

    const cardTitle = documentRef.createElement("div");
    cardTitle.className = "election-legend-others-title";
    cardTitle.textContent = `Líder em ${unit.name} (classificado em Outros):`;

    const leaderText = documentRef.createElement("div");
    leaderText.className = "election-legend-others-leader";
    const partyPart = resolvePartyPart(unit.leaderParty, unit.leaderBallot);
    const leaderName = unit.leaderName ?? "Candidato";
    leaderText.textContent = `${leaderName}${partyPart}`;

    card.append(cardTitle, leaderText);

    if (unit.leaderVotes !== undefined || unit.leaderSharePct !== undefined) {
      const detail = documentRef.createElement("div");
      detail.className = "election-legend-others-detail";
      const votesStr = resolveVotesString(unit.leaderVotes);
      const shareStr = resolveShareString(unit.leaderSharePct);
      detail.textContent = `${votesStr}${shareStr}`.trim();
      card.append(detail);
    }

    othersCalloutSlot.append(card);
  }

  function render() {
    const palette = resolvePalette(currentOptions);
    const neutralCounts = currentOptions.neutralCounts ?? {};

    if (currentOptions.officeTitle) {
      title.textContent = currentOptions.officeTitle;
    }

    renderCandidates(palette);
    renderNeutrals(palette, neutralCounts);
    renderInspectedOthers(currentInspectedUnit);
  }

  render();

  /** @param {ElectionLegendOptions} newOptions */
  function update(newOptions) {
    currentOptions = { ...currentOptions, ...newOptions };
    if (newOptions.theme) {
      currentTheme = newOptions.theme;
    }
    if (newOptions.inspectedUnit !== undefined) {
      currentInspectedUnit = newOptions.inspectedUnit;
    }
    render();
  }

  /**
   * @param {InspectedUnitInfo | null} unit
   */
  function inspectUnit(unit) {
    currentInspectedUnit = unit;
    renderInspectedOthers(currentInspectedUnit);
  }

  function destroy() {
    slotElement.innerHTML = "";
  }

  return {
    element: section,
    update,
    inspectUnit,
    destroy,
  };
}
