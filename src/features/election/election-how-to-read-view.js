import {
  OFFICE_FEDERAL_DEPUTY,
  OFFICE_GOVERNOR,
  OFFICE_PRESIDENT,
  OFFICE_SENATOR,
  OFFICE_STATE_DEPUTY,
} from "./election-slice.js";

/**
 * First-round "Como ler" instructional view component (N15, TUR-08, ELE-04, ELE-22, ACE-04).
 *
 * Implements:
 * - ELE-04: Linear relief height explanation dismantling margin over valid nominal votes (0 to 100 pp).
 * - TUR-08: Didactic explanation for the Senator office detailing the dynamic of two votes per voter
 *   and percentages over valid nominal votes.
 * - Dynamic guidance tailored to the active office (Presidente, Governador, Senador, Deputados).
 * - Accessible collapsible container with aria-expanded and aria-controls.
 *
 * @typedef {import("./election-slice.js").ElectionOffice} ElectionOffice
 *
 * @typedef {{
 *   office?: ElectionOffice,
 *   initiallyExpanded?: boolean,
 *   onToggle?: (expanded: boolean) => void
 * }} HowToReadOptions
 */

/**
 * Injects required CSS styles for the "Como ler" component if not present.
 *
 * @param {Document} documentRef
 */
function ensureHowToReadStyles(documentRef) {
  if (!documentRef?.head) {
    return;
  }
  if (documentRef.getElementById("how-to-read-injected-styles")) {
    return;
  }
  const styleEl = documentRef.createElement("style");
  styleEl.id = "how-to-read-injected-styles";
  styleEl.textContent = `
    .how-to-read-card {
      border: 1px solid var(--border-color, #70737f);
      border-radius: var(--radius-sm, 6px);
      margin: 0 0 var(--space-sm, 8px) 0;
      background-color: var(--card-bg, rgba(25, 26, 31, 0.7));
      overflow: hidden;
      font-size: var(--font-size-xs, 12px);
      color: var(--text-primary, #eceef4);
    }
    .how-to-read-toggle-button {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-xs, 6px) var(--space-sm, 8px);
      background: transparent;
      border: none;
      color: var(--text-primary, #eceef4);
      font-size: var(--font-size-xs, 12px);
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      user-select: none;
      min-height: 32px;
    }
    .how-to-read-toggle-button:hover {
      background-color: var(--hover-bg, rgba(255, 255, 255, 0.06));
    }
    .how-to-read-toggle-icon {
      font-size: 11px;
      color: var(--text-muted, #858a96);
      transition: transform 0.2s ease;
    }
    .how-to-read-toggle-button[aria-expanded="true"] .how-to-read-toggle-icon {
      transform: rotate(180deg);
    }
    .how-to-read-content {
      padding: 0 var(--space-sm, 8px) var(--space-sm, 8px) var(--space-sm, 8px);
      display: flex;
      flex-direction: column;
      gap: 8px;
      line-height: 1.45;
      color: var(--text-secondary, #b4b8c5);
    }
    .how-to-read-content[hidden] {
      display: none;
    }
    .how-to-read-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-primary, #eceef4);
      margin: 4px 0 2px 0;
    }
    .how-to-read-paragraph {
      margin: 0;
    }
    .how-to-read-office-box {
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.04);
      border-left: 3px solid var(--text-muted, #858a96);
      border-radius: var(--radius-xs, 4px);
    }
    .how-to-read-office-box-title {
      font-weight: 600;
      color: var(--text-primary, #eceef4);
      margin-bottom: 2px;
    }
  `;
  documentRef.head.append(styleEl);
}

/**
 * Returns specific instructional text for the Senate office (TUR-08).
 *
 * @returns {string}
 */
export function getSenateExplanationText() {
  return "Na eleicao para o Senado em 2026, cada eleitor vota em dois candidatos distintos para as duas vagas abertas. Como cada eleitor deposita dois votos nominais, o total de votos nominais validos corresponde ao dobro dos eleitores que votaram em candidatos ao Senado. Os percentuais individuais sao calculados sobre a soma de votos validos nominais, e a altura no mapa indica a diferenca percentual (margem) entre o primeiro e o segundo colocado mais votado no municipio.";
}

/**
 * Returns specific instructional text for executive offices (Presidente, Governador).
 *
 * @param {ElectionOffice} office
 * @returns {string}
 */
export function getExecutiveExplanationText(office) {
  if (office === OFFICE_GOVERNOR) {
    return "Na eleicao para Governador de Sao Paulo, o pleito e majoritario com um unico voto por eleitor. A altura do bloco 3D reflete a margem percentual direta entre o lider e o segundo colocado mais votado naquele municipio, calculada estritamente sobre os votos nominais validos.";
  }
  return "Na eleicao presidencial, o pleito e majoritario em todo o pais. No mapa de Sao Paulo, cada municipio reflete a preferencia do seu eleitorado local: a cor indica o candidato com mais votos na cidade e a altura representa a vantagem percentual sobre o segundo mais votado localmente.";
}

/**
 * Returns specific instructional text for legislative deputy offices.
 *
 * @param {ElectionOffice} office
 * @returns {string}
 */
export function getDeputyExplanationText(office) {
  if (office === OFFICE_STATE_DEPUTY) {
    return "Para Deputado Estadual, as 94 cadeiras sao distribuidas pelo sistema proporcional em todo o Estado de Sao Paulo. No mapa municipal, o relevo destaca o candidato mais votado nominalmente no municipio e sua margem percentual local sobre o segundo colocado da cidade.";
  }
  return "Para Deputado Federal, as 70 vagas de Sao Paulo na Camara sao definidas pelo sistema proporcional com quociente eleitoral e partidario. A visualizacao por municipio mostra quem obteve mais votos nominais locais e a margem percentual sobre o concorrente mais proximo naquela unidade.";
}

/**
 * Resolves the didactic explanation text for a given office (TUR-08).
 *
 * @param {ElectionOffice} office
 * @returns {{ title: string, body: string }}
 */
export function resolveOfficeDidacticContent(office) {
  if (office === OFFICE_SENATOR) {
    return {
      title: "Como ler a eleicao para o Senado (dois votos por eleitor):",
      body: getSenateExplanationText(),
    };
  }
  if (office === OFFICE_FEDERAL_DEPUTY) {
    return {
      title: "Eleicao proporcional (Deputado federal):",
      body: getDeputyExplanationText(office),
    };
  }
  if (office === OFFICE_STATE_DEPUTY) {
    return {
      title: "Eleicao proporcional (Deputado estadual):",
      body: getDeputyExplanationText(office),
    };
  }
  if (office === OFFICE_GOVERNOR) {
    return {
      title: "Eleicao majoritaria (Governador):",
      body: getExecutiveExplanationText(office),
    };
  }
  return {
    title: "Eleicao majoritaria (Presidente):",
    body: getExecutiveExplanationText(OFFICE_PRESIDENT),
  };
}

/**
 * Mounts the "Como ler o mapa do 1º turno" explanatory view.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} slotElement
 * @param {HowToReadOptions} [options]
 * @returns {{
 *   element: HTMLElement,
 *   update: (office: ElectionOffice, expanded?: boolean) => void,
 *   setExpanded: (expanded: boolean) => void,
 *   isExpanded: () => boolean,
 *   destroy: () => void
 * }}
 */
export function mountElectionHowToReadView(documentRef, slotElement, options = {}) {
  let currentOffice = options.office ?? OFFICE_PRESIDENT;
  let isCurrentlyExpanded = options.initiallyExpanded ?? false;
  const onToggle = options.onToggle;

  ensureHowToReadStyles(documentRef);

  slotElement.innerHTML = "";
  slotElement.hidden = false;

  const card = documentRef.createElement("div");
  card.className = "how-to-read-card";
  card.setAttribute("role", "region");
  card.setAttribute("aria-label", "Instrucoes de como ler o mapa do 1º turno");

  const toggleBtn = documentRef.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "how-to-read-toggle-button";
  toggleBtn.id = "how-to-read-first-round-toggle";
  toggleBtn.setAttribute("aria-expanded", String(isCurrentlyExpanded));
  toggleBtn.setAttribute("aria-controls", "how-to-read-first-round-content");

  const titleSpan = documentRef.createElement("span");
  titleSpan.textContent = "Como ler o mapa do 1º turno";

  const iconSpan = documentRef.createElement("span");
  iconSpan.className = "how-to-read-toggle-icon";
  iconSpan.setAttribute("aria-hidden", "true");
  iconSpan.textContent = "▼";

  toggleBtn.append(titleSpan, iconSpan);
  card.append(toggleBtn);

  const content = documentRef.createElement("div");
  content.id = "how-to-read-first-round-content";
  content.className = "how-to-read-content";
  content.hidden = !isCurrentlyExpanded;

  // 1. Height explanation section (ELE-04)
  const heightTitle = documentRef.createElement("div");
  heightTitle.className = "how-to-read-section-title";
  heightTitle.textContent = "Altura do relevo (Margem percentual)";

  const heightParagraph = documentRef.createElement("p");
  heightParagraph.className = "how-to-read-paragraph";
  heightParagraph.textContent =
    "A altura de cada municipio e proporcional a margem de votos do primeiro colocado sobre o segundo colocado, calculada em pontos percentuais (pp) sobre os votos nominais validos. O dominio e linear e fixo de 0 a 100 pp: disputas acirradas ficam rentes a base, enquanto vantagens expressivas elevam o relevo proporcionalmente.";

  content.append(heightTitle, heightParagraph);

  // 2. Dynamic office explanation section (TUR-08)
  const officeBox = documentRef.createElement("div");
  officeBox.className = "how-to-read-office-box";

  const officeBoxTitle = documentRef.createElement("div");
  officeBoxTitle.className = "how-to-read-office-box-title";

  const officeBoxBody = documentRef.createElement("p");
  officeBoxBody.className = "how-to-read-paragraph";

  officeBox.append(officeBoxTitle, officeBoxBody);
  content.append(officeBox);

  // 3. Base denominator section (ELE-22)
  const baseTitle = documentRef.createElement("div");
  baseTitle.className = "how-to-read-section-title";
  baseTitle.textContent = "Base de calculo e votos validos";

  const baseParagraph = documentRef.createElement("p");
  baseParagraph.className = "how-to-read-paragraph";
  baseParagraph.textContent =
    "Todas as margens e porcentagens sao calculadas sobre os votos nominais validos. Votos em branco, votos nulos e votos anulados sub judice sao excluidos do calculo da margem e das alturas, respeitando a legislacao eleitoral do TSE.";

  content.append(baseTitle, baseParagraph);
  card.append(content);
  slotElement.append(card);

  function renderOfficeExplanation() {
    const didactic = resolveOfficeDidacticContent(currentOffice);
    officeBoxTitle.textContent = didactic.title;
    officeBoxBody.textContent = didactic.body;
  }

  function applyExpandedState(expanded) {
    isCurrentlyExpanded = expanded;
    toggleBtn.setAttribute("aria-expanded", String(expanded));
    content.hidden = !expanded;
    if (typeof onToggle === "function") {
      onToggle(expanded);
    }
  }

  toggleBtn.addEventListener("click", () => {
    applyExpandedState(!isCurrentlyExpanded);
  });

  renderOfficeExplanation();

  function update(office, expanded) {
    currentOffice = office;
    renderOfficeExplanation();
    if (expanded !== undefined) {
      applyExpandedState(expanded);
    }
  }

  function destroy() {
    slotElement.innerHTML = "";
  }

  return {
    element: card,
    update,
    setExpanded: (expanded) => applyExpandedState(expanded),
    isExpanded: () => isCurrentlyExpanded,
    destroy,
  };
}
