import { sortCandidatesByBallotNumber } from "../../domain/election.js";
import { assignCandidateColors } from "../../domain/election-colors.js";

/**
 * Statewide count scoreboard view component (APU-07, APU-09, ELE-10, ELE-11, ELE-21, MOB-02).
 *
 * Renders the state of Sao Paulo aggregated presidential result into `#election-scoreboard-slot`
 * and updates `#election-source-slot` with "Fonte: TSE" (APU-07, APU-09).
 * Preserves strict candidate ordering by ballot number (ELE-11, E34).
 * Enforces candidate color parity and lightness consistency (ELE-10).
 * Displays neutral lead terminology and explicit "em Sao Paulo" scope (ELE-21).
 *
 * @typedef {import("./count-slice.js").CountState} CountState
 * @typedef {import("../../domain/election-colors.js").ThemeMode} ThemeMode
 *
 * @typedef {{
 *   sourceSlotElement?: HTMLElement | null,
 *   theme?: ThemeMode,
 *   formatCandidateLeadMessage?: (name: string, marginPp: string) => string
 * }} ScoreboardOptions
 */

/**
 * Mounts the scoreboard into the specified slot container.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} slotElement
 * @param {ScoreboardOptions} [options={}]
 * @returns {{
 *   element: HTMLElement,
 *   update: (state: CountState, isVisible?: boolean, theme?: ThemeMode) => void,
 *   destroy: () => void
 * }}
 */
export function mountCountScoreboardView(documentRef, slotElement, options = {}) {
  const sourceSlot =
    options.sourceSlotElement ?? documentRef.getElementById("election-source-slot");
  let currentTheme = options.theme ?? "dark";

  slotElement.className = "count-scoreboard-slot";
  const container = documentRef.createElement("div");
  container.className = "count-scoreboard";
  slotElement.innerHTML = "";
  slotElement.append(container);

  if (sourceSlot) {
    sourceSlot.className = "count-source-slot";
    sourceSlot.textContent = "Fonte: TSE";
  }

  /**
   * @param {{ bannerState?: "replay" | "nao-iniciada" | "em-apuracao" | "apuracao-pausada" | "matematicamente-definida" | "apuracao-concluida" | "sem-conexao"; bannerAlias?: "replay" | "matematicamente-definida" | "sem-conexao" | "aguardando" | "parcial" | "tse-sem-novidade" | "encerrada"; bannerLabel?: string; isPaused?: boolean; hasConnectionError?: boolean; lastUpdateHour?: string; lastTracking?: { dg?: string; hg?: string; etag?: string; } | null; sectionsCounted?: number; sectionsTotal?: number; sectionsPct: any; readCount?: number; totalMunicipalities?: number; stateResult: any; municipalResults?: Record<string, import("../../domain/election.js").ElectionUnitResult>; proclamation?: { announced: boolean; candidate: { ballotNumber: string; name: string; party: string; status: string; elected: boolean; } | null; announcementText: string | null; } | null; accessibilityMilestone?: string | null; isConcluded?: boolean; consecutiveFailures?: number; }} state
   */
  function render(state) {
    container.innerHTML = "";

    const header = documentRef.createElement("div");
    header.className = "count-scoreboard-header";

    const title = documentRef.createElement("h2");
    title.className = "count-scoreboard-title";
    title.textContent = "Presidente em Sao Paulo";

    const progress = documentRef.createElement("span");
    progress.className = "count-scoreboard-progress";
    const formattedPct = state.sectionsPct.toFixed(2).replace(".", ",");
    progress.textContent = `${formattedPct}% apurado`;

    header.append(title, progress);
    container.append(header);

    const unitResult = state.stateResult;
    const rawCandidates = unitResult?.candidates ?? [];
    if (rawCandidates.length === 0) {
      const emptyNotice = documentRef.createElement("p");
      emptyNotice.className = "count-scoreboard-empty";
      emptyNotice.textContent = "Aguardando votos apurados em Sao Paulo";
      container.append(emptyNotice);
      return;
    }

    // Always sort candidates strictly by ballot number (ELE-11, E34)
    const sortedByBallot = [...rawCandidates].sort(
      (a, b) => Number(a.ballotNumber) - Number(b.ballotNumber),
    );

    // Assign categorical candidate colors with lightness parity (ELE-09, ELE-10)
    const colorAssignment = assignCandidateColors(
      sortedByBallot.map((c) => ({
        ballotNumber: c.ballotNumber,
        name: c.name,
        party: c.party,
        votes: c.validVotes,
      })),
      currentTheme,
    );

    const candidatesList = documentRef.createElement("div");
    candidatesList.className = "count-scoreboard-candidates";

    for (const cand of sortedByBallot) {
      const row = documentRef.createElement("div");
      row.className = "count-candidate-row";

      const colorData = colorAssignment.byBallotNumber.get(cand.ballotNumber);
      const candColor = colorData?.color ?? "#bec2cc";

      const colorIndicator = documentRef.createElement("span");
      colorIndicator.className = "count-candidate-color";
      colorIndicator.style.backgroundColor = candColor;
      colorIndicator.setAttribute("aria-hidden", "true");

      const infoContainer = documentRef.createElement("div");
      infoContainer.className = "count-candidate-info";

      const nameLine = documentRef.createElement("div");
      nameLine.className = "count-candidate-name-line";

      const candName = documentRef.createElement("span");
      candName.className = "count-candidate-name";
      candName.textContent = cand.name;

      const candParty = documentRef.createElement("span");
      candParty.className = "count-candidate-party";
      candParty.textContent = `${cand.party} (${cand.ballotNumber})`;

      nameLine.append(candName, candParty);

      const metricsLine = documentRef.createElement("div");
      metricsLine.className = "count-candidate-metrics-line";

      const candPct = documentRef.createElement("span");
      candPct.className = "count-candidate-pct";
      candPct.textContent = `${cand.sharePct.toFixed(2).replace(".", ",")}%`;

      const candVotes = documentRef.createElement("span");
      candVotes.className = "count-candidate-votes";
      candVotes.textContent = `${cand.validVotes.toLocaleString("pt-BR")} votos`;

      metricsLine.append(candPct, candVotes);
      infoContainer.append(nameLine, metricsLine);

      row.append(colorIndicator, infoContainer);
      candidatesList.append(row);
    }
    container.append(candidatesList);

    // Lead or margin banner if available
    if (unitResult?.leader && unitResult?.runnerUp && unitResult.marginVotes > 0) {
      const marginNotice = documentRef.createElement("div");
      marginNotice.className = "count-scoreboard-margin";
      const marginFormatted = unitResult.marginPp.toFixed(2).replace(".", ",");
      if (typeof options.formatCandidateLeadMessage === "function") {
        marginNotice.textContent = options.formatCandidateLeadMessage(
          unitResult.leader.name,
          marginFormatted,
        );
      }
      if (typeof options.formatCandidateLeadMessage !== "function") {
        marginNotice.textContent = `${unitResult.leader.name} lidera em Sao Paulo com ${marginFormatted} pp a frente`;
      }
      container.append(marginNotice);
    }
  }

  return {
    element: slotElement,
    update(state, isVisible = true, theme) {
      if (theme) {
        currentTheme = theme;
      }
      if (!isVisible) {
        slotElement.hidden = true;
        if (sourceSlot) {
          sourceSlot.hidden = true;
        }
        return;
      }
      slotElement.hidden = false;
      if (sourceSlot) {
        sourceSlot.hidden = false;
      }
      render(state);
    },
    destroy() {
      slotElement.innerHTML = "";
      slotElement.hidden = true;
      if (sourceSlot) {
        sourceSlot.hidden = true;
      }
    },
  };
}
