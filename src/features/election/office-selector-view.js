import {
  OFFICE_FEDERAL_DEPUTY,
  OFFICE_GOVERNOR,
  OFFICE_PRESIDENT,
  OFFICE_SENATOR,
  OFFICE_STATE_DEPUTY,
} from "./election-slice.js";

/**
 * 1st round election office selector view component (N15, ACE-04, ELE-18).
 *
 * Implements accessible native radio controls for the 5 offices of the 1st round:
 * 1. Presidente
 * 2. Governador
 * 3. Senador
 * 4. Deputado federal
 * 5. Deputado estadual
 *
 * Provides:
 * - Native radio group inside a fieldset with semantic legend
 * - Keyboard navigation (Tab, Arrow keys, Space)
 * - Accessible live announcement of office changes via role="status" aria-live="polite"
 * - Touch targets >= 24x24 px (WCAG 2.5.8, ACE-04)
 *
 * @typedef {import("./election-slice.js").ElectionOffice} ElectionOffice
 *
 * @typedef {{
 *   id: ElectionOffice,
 *   label: string,
 *   code: number
 * }} FirstRoundOfficeDescriptor
 *
 * @typedef {{
 *   office?: ElectionOffice,
 *   onOfficeChange?: (office: ElectionOffice) => void
 * }} OfficeSelectorOptions
 */

/**
 * Ordered descriptor of the 5 official first-round offices.
 *
 * @type {readonly FirstRoundOfficeDescriptor[]}
 */
export const FIRST_ROUND_OFFICES = Object.freeze([
  { id: OFFICE_PRESIDENT, label: "Presidente", code: 1 },
  { id: OFFICE_GOVERNOR, label: "Governador", code: 3 },
  { id: OFFICE_SENATOR, label: "Senador", code: 5 },
  { id: OFFICE_FEDERAL_DEPUTY, label: "Deputado federal", code: 6 },
  { id: OFFICE_STATE_DEPUTY, label: "Deputado estadual", code: 7 },
]);

/**
 * Map of office identifiers to human-readable labels in Brazilian Portuguese.
 *
 * @type {Record<string, string>}
 */
export const OFFICE_LABELS = Object.freeze({
  [OFFICE_PRESIDENT]: "Presidente",
  [OFFICE_GOVERNOR]: "Governador",
  [OFFICE_SENATOR]: "Senador",
  [OFFICE_FEDERAL_DEPUTY]: "Deputado federal",
  [OFFICE_STATE_DEPUTY]: "Deputado estadual",
});

/**
 * Resolves the display label for an office identifier.
 *
 * @param {string | undefined | null} officeId
 * @returns {string}
 */
export function resolveOfficeLabel(officeId) {
  if (!officeId) {
    return OFFICE_LABELS[OFFICE_PRESIDENT];
  }
  const label = OFFICE_LABELS[officeId];
  if (label) {
    return label;
  }
  return OFFICE_LABELS[OFFICE_PRESIDENT];
}

/**
 * Injects required styling rules for the office selector if not present.
 *
 * @param {Document} documentRef
 */
function ensureOfficeSelectorStyles(documentRef) {
  if (!documentRef?.head) {
    return;
  }
  if (documentRef.getElementById("office-selector-injected-styles")) {
    return;
  }
  const styleEl = documentRef.createElement("style");
  styleEl.id = "office-selector-injected-styles";
  styleEl.textContent = `
    .office-selector-group {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: var(--radius-md, 8px);
      padding: var(--space-xs, 6px);
      margin: 0 0 var(--space-sm, 8px) 0;
      background: rgba(18, 19, 24, 0.75);
    }
    .office-selector-legend {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-muted, #94a3b8);
      padding: 0 4px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 4px;
    }
    .office-selector-options {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
    }
    .office-selector-option {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted, #94a3b8);
      cursor: pointer;
      min-height: 30px;
      padding: 4px 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
      user-select: none;
      transition: all 0.15s ease;
    }
    .office-selector-option:hover {
      background-color: rgba(255, 255, 255, 0.08);
      color: #f1f5f9;
    }
    .office-selector-option:has(input:checked) {
      background: rgba(255, 255, 255, 0.14);
      color: #ffffff;
      font-weight: 600;
      border-color: rgba(255, 255, 255, 0.25);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }
    .office-selector-option-deputado-estadual {
      grid-column: span 2;
    }
    .office-selector-radio {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .office-selector-label-text {
      white-space: nowrap;
    }
    @media (max-width: 600px) {
      .office-selector-options {
        gap: 3px;
      }
      .office-selector-option {
        font-size: 11px;
        min-height: 28px;
        padding: 3px 4px;
      }
    }
  `;
  documentRef.head.append(styleEl);
}

/**
 * Mounts the first-round office selector view component.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} slotElement
 * @param {OfficeSelectorOptions} [options]
 * @returns {{
 *   element: HTMLElement,
 *   update: (office: ElectionOffice) => void,
 *   getOffice: () => ElectionOffice,
 *   destroy: () => void
 * }}
 */
export function mountOfficeSelectorView(documentRef, slotElement, options = {}) {
  let currentOffice = options.office ?? OFFICE_PRESIDENT;
  const onOfficeChange = options.onOfficeChange;

  ensureOfficeSelectorStyles(documentRef);

  slotElement.innerHTML = "";
  slotElement.hidden = false;

  const fieldset = documentRef.createElement("fieldset");
  fieldset.className = "office-selector-group";
  fieldset.setAttribute("role", "radiogroup");
  fieldset.setAttribute("aria-label", "Cargo do 1º turno");

  const legend = documentRef.createElement("legend");
  legend.className = "office-selector-legend";
  legend.textContent = "Cargo em disputa";
  fieldset.append(legend);

  const optionsContainer = documentRef.createElement("div");
  optionsContainer.className = "office-selector-options";
  fieldset.append(optionsContainer);

  const liveAnnouncer = documentRef.createElement("div");
  liveAnnouncer.className = "visually-hidden";
  liveAnnouncer.setAttribute("role", "status");
  liveAnnouncer.setAttribute("aria-live", "polite");
  fieldset.append(liveAnnouncer);

  /** @type {Map<ElectionOffice, HTMLInputElement>} */
  const radioInputs = new Map();

  for (const descriptor of FIRST_ROUND_OFFICES) {
    const label = documentRef.createElement("label");
    label.className = `office-selector-option office-selector-option-${descriptor.id}`;

    const radio = documentRef.createElement("input");
    radio.type = "radio";
    radio.name = "election-first-round-office";
    radio.value = descriptor.id;
    radio.className = "office-selector-radio";
    radio.checked = descriptor.id === currentOffice;

    radio.addEventListener("change", () => {
      if (!radio.checked) {
        return;
      }
      if (radio.value === currentOffice) {
        return;
      }
      const nextOffice = /** @type {ElectionOffice} */ (radio.value);
      currentOffice = nextOffice;
      const officeLabel = resolveOfficeLabel(nextOffice);
      liveAnnouncer.textContent = `Cargo selecionado: ${officeLabel} no 1º turno em Sao Paulo`;
      if (typeof onOfficeChange === "function") {
        onOfficeChange(nextOffice);
      }
    });

    const labelSpan = documentRef.createElement("span");
    labelSpan.className = "office-selector-label-text";
    labelSpan.textContent = descriptor.label;

    label.append(radio, labelSpan);
    optionsContainer.append(label);
    radioInputs.set(descriptor.id, radio);
  }

  slotElement.append(fieldset);

  function update(office) {
    if (office === currentOffice) {
      return;
    }
    currentOffice = office;
    for (const [id, input] of radioInputs.entries()) {
      input.checked = id === currentOffice;
    }
    const officeLabel = resolveOfficeLabel(currentOffice);
    liveAnnouncer.textContent = `Cargo selecionado: ${officeLabel} no 1º turno em Sao Paulo`;
  }

  function destroy() {
    radioInputs.clear();
    slotElement.innerHTML = "";
  }

  return {
    element: fieldset,
    update,
    getOffice: () => currentOffice,
    destroy,
  };
}
