/**
 * Count status banner view component (APU-07, APU-08, APU-09, APU-10, ACE-05, ELE-21).
 *
 * Renders into `#election-banner-slot` on the stage outside the collapsible bottom panel (APU-07, MOB-02).
 * Has `role="status"` and `aria-live="polite"`.
 * Distinguishes TSE stopped from visitor connection loss (APU-08).
 * Never recommends "Recarregue a pagina" upon network failures (APU-08).
 *
 * @typedef {import("./count-slice.js").CountState} CountState
 * @typedef {{
 *   formatTseStoppedMessage?: (hour: string) => string,
 *   formatNoConnectionMessage?: (hour: string) => string,
 *   formatPartialCountMessage?: (pct: number | string, readCount: number, total: number) => string,
 *   formatElectedAnnouncement?: (name: string, party: string) => string,
 *   strings?: Record<string, any>
 * }} BannerFormatters
 */

/**
 * Mounts the count banner into the specified slot container.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} slotElement
 * @param {BannerFormatters} [formatters={}]
 * @returns {{
 *   element: HTMLElement,
 *   update: (state: CountState, isVisible?: boolean) => void,
 *   destroy: () => void
 * }}
 */
export function mountCountBannerView(documentRef, slotElement, formatters = {}) {
  slotElement.setAttribute("role", "status");
  slotElement.setAttribute("aria-live", "polite");
  slotElement.className = "count-banner-slot";

  const bannerContent = documentRef.createElement("div");
  bannerContent.className = "count-banner";

  const statusIcon = documentRef.createElement("span");
  statusIcon.className = "count-banner-indicator";
  statusIcon.setAttribute("aria-hidden", "true");

  const messageText = documentRef.createElement("span");
  messageText.className = "count-banner-message";

  bannerContent.append(statusIcon, messageText);
  slotElement.innerHTML = "";
  slotElement.append(bannerContent);

  /**
   * @param {{ bannerState?: "replay" | "nao-iniciada" | "em-apuracao" | "apuracao-pausada" | "matematicamente-definida" | "apuracao-concluida" | "sem-conexao"; bannerAlias: any; bannerLabel?: string; isPaused: any; hasConnectionError: any; lastUpdateHour: any; lastTracking?: { dg?: string; hg?: string; etag?: string; } | null; sectionsCounted: any; sectionsTotal?: number; sectionsPct: any; readCount: any; totalMunicipalities: any; stateResult?: import("../../domain/election.js").ElectionUnitResult | null; municipalResults?: Record<string, import("../../domain/election.js").ElectionUnitResult>; proclamation: any; accessibilityMilestone?: string | null; isConcluded: any; consecutiveFailures?: number; }} state
   */
  function resolveMessage(state) {
    if (state.proclamation && state.proclamation.announced && state.proclamation.announcementText) {
      return state.proclamation.announcementText;
    }

    if (state.hasConnectionError) {
      if (typeof formatters.formatNoConnectionMessage === "function") {
        return formatters.formatNoConnectionMessage(state.lastUpdateHour);
      }
      let hourStr = "(Brasilia)";
      if (state.lastUpdateHour) {
        hourStr = `${state.lastUpdateHour} (Brasilia)`;
      }
      return `Sem conexao com o TSE desde ${hourStr}`;
    }

    if (state.isConcluded) {
      return "Apuracao encerrada em Sao Paulo, 100% das secoes";
    }

    if (state.isPaused) {
      if (typeof formatters.formatTseStoppedMessage === "function") {
        return formatters.formatTseStoppedMessage(state.lastUpdateHour);
      }
      let hourStr = "(Brasilia)";
      if (state.lastUpdateHour) {
        hourStr = `${state.lastUpdateHour} (Brasilia)`;
      }
      return `O TSE nao publicou dados novos desde ${hourStr}`;
    }

    if (state.bannerAlias === "aguardando" || state.sectionsCounted === 0) {
      return "Aguardando inicio da totalizacao em Sao Paulo";
    }

    if (typeof formatters.formatPartialCountMessage === "function") {
      const formattedPct = state.sectionsPct.toFixed(2).replace(".", ",");
      return formatters.formatPartialCountMessage(
        formattedPct,
        state.readCount,
        state.totalMunicipalities,
      );
    }

    const formattedPct = state.sectionsPct.toFixed(2).replace(".", ",");
    return `Em apuracao em Sao Paulo: ${formattedPct}% das secoes (${state.readCount} de ${state.totalMunicipalities} municipios lidos)`;
  }

  /**
   * @param {{ bannerState?: "replay" | "nao-iniciada" | "em-apuracao" | "apuracao-pausada" | "matematicamente-definida" | "apuracao-concluida" | "sem-conexao"; bannerAlias?: "replay" | "matematicamente-definida" | "sem-conexao" | "aguardando" | "parcial" | "tse-sem-novidade" | "encerrada"; bannerLabel?: string; isPaused: any; hasConnectionError: any; lastUpdateHour?: string; lastTracking?: { dg?: string; hg?: string; etag?: string; } | null; sectionsCounted: any; sectionsTotal?: number; sectionsPct?: number; readCount?: number; totalMunicipalities?: number; stateResult?: import("../../domain/election.js").ElectionUnitResult | null; municipalResults?: Record<string, import("../../domain/election.js").ElectionUnitResult>; proclamation?: { announced: boolean; candidate: { ballotNumber: string; name: string; party: string; status: string; elected: boolean; } | null; announcementText: string | null; } | null; accessibilityMilestone?: string | null; isConcluded: any; consecutiveFailures?: number; }} state
   */
  function resolveStatusClass(state) {
    if (state.hasConnectionError) {
      return "count-banner-error";
    }
    if (state.isConcluded) {
      return "count-banner-concluded";
    }
    if (state.isPaused) {
      return "count-banner-paused";
    }
    if (state.sectionsCounted > 0) {
      return "count-banner-live";
    }
    return "count-banner-waiting";
  }

  return {
    element: slotElement,
    update(state, isVisible = true) {
      if (!isVisible) {
        slotElement.hidden = true;
        return;
      }
      slotElement.hidden = false;

      const message = resolveMessage(state);
      messageText.textContent = message;

      const statusClass = resolveStatusClass(state);
      bannerContent.className = `count-banner ${statusClass}`;
    },
    destroy() {
      slotElement.innerHTML = "";
      slotElement.hidden = true;
    },
  };
}
