import { selectClassAction } from "./selection-slice.js";

/**
 * @typedef {{ type: string }} Action
 *
 * @typedef {{
 *   labels: readonly string[],
 *   classIndexByCode: Map<string, number>,
 *   selectedClassIndex: number | null
 * }} ClassFilterProps
 */

const DEFAULT_PROMPT = "Selecionar por faixa";

/**
 * Mounts the select dropdown for choosing a heat band.
 * Follows SEL-03.
 *
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {ClassFilterProps} initialProps
 */
export function mountClassFilterView(documentRef, dispatch, initialProps) {
  const container = documentRef.createElement("div");
  container.className = "selection-class-filter-field";

  const label = documentRef.createElement("label");
  label.className = "field-label";
  label.htmlFor = "class-filter";
  label.textContent = DEFAULT_PROMPT;

  const select = documentRef.createElement("select");
  select.id = "class-filter";
  select.className = "class-filter";

  let currentMap = initialProps.classIndexByCode;
  populateOptions(select, initialProps.labels, documentRef);
  syncSelectValue(select, initialProps.selectedClassIndex);

  select.addEventListener("change", () => {
    if (select.value === "") {
      dispatch(selectClassAction(null, currentMap));
      return;
    }
    const chosenIndex = Number(select.value);
    dispatch(selectClassAction(chosenIndex, currentMap));
  });

  container.append(label, select);

  return {
    element: container,
    update: (
      /** @type {readonly string[]} */ labels,
      /** @type {number | null} */ selectedClassIndex,
      /** @type {Map<string, number>} */ classIndexByCode,
    ) => {
      currentMap = classIndexByCode;
      populateOptions(select, labels, documentRef);
      syncSelectValue(select, selectedClassIndex);
    },
  };
}

/**
 * @param {HTMLSelectElement} select
 * @param {readonly string[]} labels
 * @param {Document} documentRef
 */
function populateOptions(select, labels, documentRef) {
  select.replaceChildren();
  const emptyOption = documentRef.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Escolha uma faixa";
  select.append(emptyOption);

  for (let i = 0; i < labels.length; i += 1) {
    const option = documentRef.createElement("option");
    option.value = String(i);
    option.textContent = labels[i];
    select.append(option);
  }
}

/**
 * @param {HTMLSelectElement} select
 * @param {number | null} selectedClassIndex
 */
function syncSelectValue(select, selectedClassIndex) {
  if (selectedClassIndex === null) {
    select.value = "";
    return;
  }
  select.value = String(selectedClassIndex);
}
