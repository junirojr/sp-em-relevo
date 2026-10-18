/**
 * Central immutable catalog of UI text strings for election and count interfaces (TXT-01).
 * Adheres strictly to:
 * - ELE-21: "em Sao Paulo" scope, "(Brasilia)" timezone for hours, neutral verbs ("lidera", "a frente")
 * - ELE-08: Explicit textual reasons for units without result or below 50% threshold
 * - ELE-17: "Selecao mantida" notice on mode transitions
 * - APU-07: "Fonte: TSE" credit and concluded banner
 * - APU-08: Distinct messages for TSE stopped vs visitor connection failure
 * - APU-09: Municipal read count progress
 * - APU-10: Mathematical proclamation quoting TSE
 * - APU-14: Timeless notice for artifact environment
 * - ACE-05: Accessibility milestones for aria-live role="status"
 * - FLG-03: Graceful dynamic import error and retry labels
 *
 * PROHIBITIONS:
 * - No en-dash (U+2013) or em-dash (U+2014).
 * - No else or ternary operators in helper functions.
 */

export const ELECTION_STRINGS = Object.freeze({
  mode: Object.freeze({
    legend: "Modo de exibicao",
    indicators: "Indicadores",
    firstRound: "1º turno",
    secondRound: "2º turno",
    selectionMaintained: "Selecao mantida",
  }),

  scope: Object.freeze({
    stateLabel: "em Sao Paulo",
    nationalLabel: "no Brasil",
    timezoneSuffix: "(Brasilia)",
  }),

  verbs: Object.freeze({
    leads: "lidera",
    ahead: "a frente",
  }),

  credits: Object.freeze({
    sourceTse: "Fonte: TSE",
    sourceTseAggregated: "Fonte: TSE (CC-BY), dados agregados por este projeto",
    license: "Dados abertos do Tribunal Superior Eleitoral",
  }),

  noResultReasons: Object.freeze({
    noSections: "Nenhuma secao apurada",
    reading: "Ainda lendo",
    failed: "Leitura falhou",
    insufficientSections: "Secoes insuficientes (< 50%)",
    uncertainLeader: "Lideranca indefinida (intervalo sobreposto)",
    zeroVotes: "Sem votos apurados",
  }),

  banner: Object.freeze({
    waiting: "Aguardando inicio da totalizacao em Sao Paulo",
    concluded: "Apuracao encerrada em Sao Paulo, 100% das secoes",
    replayNoticePrefix: "Gravacao de 25/10, leitura das",
    liveNotice: "Ao vivo",
  }),

  artifact: Object.freeze({
    timelessNotice:
      "A apuracao ao vivo do 2º turno e transmitida em https://junirojr.github.io/sp-em-relevo/?aba=2turno durante a contagem de 25/10.",
  }),

  errors: Object.freeze({
    importFailed: "Nao foi possivel carregar os dados eleitorais.",
    retryButton: "Tentar de novo",
  }),
});

/**
 * Formats a time string with Brasilia timezone suffix (ELE-21).
 *
 * @param {string | undefined | null} hour
 * @returns {string}
 */
export function formatBrasiliaHour(hour) {
  const trimmed = String(hour ?? "").trim();
  if (trimmed.length === 0) {
    return "(Brasilia)";
  }
  return `${trimmed} (Brasilia)`;
}

/**
 * Formats the TSE stopped banner text (APU-08, ELE-21).
 *
 * @param {string} hour
 * @returns {string}
 */
export function formatTseStoppedMessage(hour) {
  const formattedHour = formatBrasiliaHour(hour);
  return `O TSE nao publicou dados novos desde ${formattedHour}`;
}

/**
 * Formats the no connection banner text (APU-08, ELE-21).
 *
 * @param {string} hour
 * @returns {string}
 */
export function formatNoConnectionMessage(hour) {
  const formattedHour = formatBrasiliaHour(hour);
  return `Sem conexao com o TSE desde ${formattedHour}`;
}

/**
 * Formats the partial count progress banner text (APU-09, ELE-21).
 *
 * @param {number | string} sectionsPct
 * @param {number} readCount
 * @param {number} [totalCount=645]
 * @returns {string}
 */
export function formatPartialCountMessage(sectionsPct, readCount, totalCount = 645) {
  const safePct = String(sectionsPct ?? "0,00");
  return `Em apuracao em Sao Paulo: ${safePct}% das secoes (${readCount} de ${totalCount} municipios lidos)`;
}

/**
 * Formats candidate lead sentence using neutral terminology (ELE-21).
 *
 * @param {string} candidateName
 * @param {number | string} marginPp
 * @returns {string}
 */
export function formatCandidateLeadMessage(candidateName, marginPp) {
  return `${candidateName} lidera em Sao Paulo com ${marginPp} pp a frente`;
}

/**
 * Formats the mathematical elected candidate announcement quoting TSE (APU-10).
 *
 * @param {string} name
 * @param {string} party
 * @returns {string}
 */
export function formatElectedAnnouncement(name, party) {
  return `Segundo o TSE, ${name} (${party}) esta matematicamente eleito para a Presidencia da Republica.`;
}

/**
 * Formats accessibility milestone announcements for role="status" (ACE-05).
 *
 * @param {string} milestoneType
 * @param {Record<string, unknown>} [params]
 * @returns {string | null}
 */
export function formatAccessibilityMilestone(milestoneType, params = {}) {
  if (milestoneType === "start") {
    return "Inicio da apuracao em Sao Paulo";
  }
  if (milestoneType === "concluded") {
    return "Apuracao encerrada em Sao Paulo, 100% das secoes totalizadas";
  }
  if (milestoneType === "sectionsPct") {
    const pct = params.pct ?? 0;
    return `${pct}% das secoes totalizadas em Sao Paulo`;
  }
  if (milestoneType === "stopped") {
    const hour = String(params.hour ?? "").trim();
    if (hour.length > 0) {
      return `O TSE nao publicou dados novos desde ${hour}`;
    }
    return "O TSE nao publicou dados novos no ultimo ciclo";
  }
  if (milestoneType === "noConnection") {
    return "Sem conexao com o TSE";
  }
  if (milestoneType === "resumed") {
    return "Transmissao de dados do TSE retomada";
  }
  if (milestoneType === "elected") {
    const name = String(params.name ?? "");
    const party = String(params.party ?? "");
    return `TSE proclama resultado da eleicao presidencial: ${name} (${party}) eleito`;
  }
  return null;
}
