import { buildTableModel, WCAG_FOOTER_BADGE } from "./table-model.js";

/**
 * Alternative table view component mounted inside #alt-table-slot.
 * Follows ACE-01, ACE-02, ACE-03, ACE-04 and ACE-06.
 *
 * @typedef {import("./table-model.js").TableModel} TableModel
 * @typedef {import("./table-model.js").TableRow} TableRow
 * @typedef {import("./table-model.js").TableColumn} TableColumn
 *
 * @typedef {{
 *   open: () => void,
 *   close: () => void,
 *   update: (updatedOptions?: any) => void,
 *   destroy: () => void,
 *   isOpen: () => boolean,
 *   element: HTMLElement
 * }} TableViewController
 */

const ACTION_SELECTION_TOGGLED = "selection/toggled";
const ACTION_SELECTION_CLEARED = "selection/cleared";
const ACTION_INSPECTED_CHANGED = "pointer/inspectedUnitChanged";

/**
 * Ensures the table CSS stylesheet is attached to the document.
 *
 * @param {Document} doc
 */
function ensureStylesheet(doc) {
  const id = "alt-table-stylesheet";
  if (doc.getElementById(id)) {
    return;
  }
  const link = doc.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "./src/features/table/table.css";
  doc.head.appendChild(link);
}

/**
 * Mounts the table view controller inside #alt-table-slot.
 *
 * @param {Document} [documentRef]
 * @param {any} [options]
 * @returns {TableViewController}
 */
export function mountTableView(documentRef = document, options = {}) {
  ensureStylesheet(documentRef);

  const windowRef = documentRef.defaultView || window;
  let slot = documentRef.getElementById("alt-table-slot");
  if (!slot) {
    slot = documentRef.createElement("div");
    slot.id = "alt-table-slot";
    slot.hidden = true;
    documentRef.body.appendChild(slot);
  }

  let lastFocusedElement = null;
  let currentOptions = { ...options };
  let isCurrentlyOpen = !slot.hidden;

  const container = documentRef.createElement("div");
  container.className = "alt-table-dialog";
  container.setAttribute("role", "region");
  container.setAttribute("aria-labelledby", "alt-table-heading");

  slot.replaceChildren(container);

  /**
   * Reads the current application state from store, inspector or options.
   *
   * @returns {any}
   */
  function readCurrentState() {
    if (typeof currentOptions.getState === "function") {
      return currentOptions.getState();
    }
    const store = /** @type {any} */ (windowRef).__appStore;
    if (store && typeof store.getState === "function") {
      return store.getState();
    }
    const inspector = /** @type {any} */ (windowRef).mapInspector;
    if (inspector && typeof inspector.readState === "function") {
      return inspector.readState();
    }
    return {};
  }

  /**
   * Resolves options needed by buildTableModel.
   *
   * @returns {any}
   */
  function resolveModelOptions() {
    const state = readCurrentState();
    const data = currentOptions.data || state.data || {};
    const municipalities = currentOptions.municipalities || data.municipalities || [];
    const regions = currentOptions.regions || data.regions?.regions || data.regions || [];
    const governmentRegions =
      currentOptions.governmentRegions || data.regions?.governmentRegions || [];
    const breaks = currentOptions.breaks || state.scale?.breaks || [];
    const selectedCodes =
      currentOptions.selectedCodes || state.selection?.selectedCodes || [];
    const pointedCode = currentOptions.pointedCode || state.pointer?.pointedCode || null;
    const inspectedCode =
      currentOptions.inspectedCode || state.pointer?.inspectedCode || null;
    const mode = currentOptions.mode || state.tab || "indicators";
    const level = currentOptions.level || state.level?.id || "municipality";
    const indicator = currentOptions.indicator || state.indicator?.definition || null;

    let theme = "dark";
    if (documentRef.documentElement.getAttribute("data-theme") === "light") {
      theme = "light";
    }

    return {
      mode,
      level,
      indicator,
      municipalities,
      regions,
      governmentRegions,
      breaks,
      selectedCodes,
      pointedCode,
      inspectedCode,
      electionUnits: currentOptions.electionUnits,
      theme,
    };
  }

  /**
   * Dispatches an action via options callback, store, or DOM event.
   *
   * @param {any} action
   */
  function dispatchAction(action) {
    if (typeof currentOptions.dispatch === "function") {
      currentOptions.dispatch(action);
      return;
    }
    const store = /** @type {any} */ (windowRef).__appStore;
    if (store && typeof store.dispatch === "function") {
      store.dispatch(action);
      return;
    }
    windowRef.dispatchEvent(new CustomEvent("app:action", { detail: action }));
  }

  function handleSelectUnit(code) {
    if (typeof currentOptions.onSelectUnit === "function") {
      currentOptions.onSelectUnit(code);
      return;
    }
    dispatchAction({ type: ACTION_SELECTION_TOGGLED, code });
  }

  function handleInspectUnit(code) {
    if (typeof currentOptions.onInspectUnit === "function") {
      currentOptions.onInspectUnit(code);
      return;
    }
    dispatchAction({ type: ACTION_INSPECTED_CHANGED, code });
  }

  function handleClearSelection() {
    if (typeof currentOptions.onClearSelection === "function") {
      currentOptions.onClearSelection();
      return;
    }
    dispatchAction({ type: ACTION_SELECTION_CLEARED });
  }

  /**
   * Renders the complete table view preserving active focus (ACE-03).
   */
  function render() {
    const activeEl = documentRef.activeElement;
    let savedCode = null;
    let savedType = null;
    if (activeEl && container.contains(activeEl)) {
      savedCode = activeEl.getAttribute("data-code");
      savedType = activeEl.getAttribute("data-action");
    }

    const modelOptions = resolveModelOptions();
    const model = buildTableModel(modelOptions);

    container.innerHTML = "";

    // Header section
    const header = documentRef.createElement("header");
    header.className = "alt-table-header";

    const headerMain = documentRef.createElement("div");
    headerMain.className = "alt-table-header-main";

    const title = documentRef.createElement("h2");
    title.id = "alt-table-heading";
    title.className = "alt-table-title";
    title.textContent = "Tabela de dados do mapa";
    headerMain.appendChild(title);

    const selectionNotice = documentRef.createElement("span");
    selectionNotice.className = "alt-table-selection-count";
    let selectionText = "Nenhuma unidade selecionada";
    if (model.selectedCount === 1) {
      selectionText = "1 unidade selecionada";
    }
    if (model.selectedCount > 1) {
      selectionText = `${model.selectedCount} unidades selecionadas`;
    }
    selectionNotice.textContent = selectionText;
    headerMain.appendChild(selectionNotice);

    header.appendChild(headerMain);

    // Toolbar section
    const toolbar = documentRef.createElement("div");
    toolbar.className = "alt-table-toolbar";

    if (model.selectedCount > 0) {
      const clearBtn = documentRef.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "alt-table-btn alt-table-clear-btn";
      clearBtn.setAttribute("aria-label", "Limpar seleção");
      clearBtn.textContent = "Limpar seleção";
      clearBtn.addEventListener("click", () => {
        handleClearSelection();
        render();
      });
      toolbar.appendChild(clearBtn);
    }

    const closeBtn = documentRef.createElement("button");
    closeBtn.type = "button";
    closeBtn.id = "close-table-button";
    closeBtn.className = "alt-table-btn alt-table-close-btn";
    closeBtn.setAttribute("aria-label", "Fechar tabela de dados");
    closeBtn.textContent = "Fechar tabela";
    closeBtn.addEventListener("click", () => {
      close();
    });
    toolbar.appendChild(closeBtn);

    header.appendChild(toolbar);
    container.appendChild(header);

    // Scrollable region
    const scroll = documentRef.createElement("div");
    scroll.className = "alt-table-scroll";
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-labelledby", "alt-table-heading");
    scroll.setAttribute("tabindex", "0");

    // Table element
    const table = documentRef.createElement("table");
    table.className = "alt-table";

    // Caption (ACE-03)
    const caption = documentRef.createElement("caption");
    caption.className = "alt-table-caption";
    caption.textContent = model.caption;
    table.appendChild(caption);

    // Table head
    const thead = documentRef.createElement("thead");
    const trHead = documentRef.createElement("tr");

    for (let i = 0; i < model.columns.length; i += 1) {
      const col = model.columns[i];
      const th = documentRef.createElement("th");
      th.setAttribute("scope", "col");
      th.className = `alt-table-col-${col.align}`;
      th.textContent = col.label;
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    // Table body
    const tbody = documentRef.createElement("tbody");

    for (let i = 0; i < model.rows.length; i += 1) {
      const row = model.rows[i];
      const tr = documentRef.createElement("tr");
      tr.className = "alt-table-row";
      if (row.isSelected) {
        tr.classList.add("is-selected");
      }
      if (row.isPointed) {
        tr.classList.add("is-pointed");
      }
      if (row.isInspected) {
        tr.classList.add("is-inspected");
      }

      for (let j = 0; j < model.columns.length; j += 1) {
        const col = model.columns[j];

        if (col.key === "selection") {
          const td = documentRef.createElement("td");
          td.className = "alt-table-col-center";

          const checkbox = documentRef.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "alt-table-select-checkbox";
          checkbox.setAttribute("data-code", row.code);
          checkbox.setAttribute("data-action", "select");
          checkbox.setAttribute("aria-label", `Selecionar ${row.name}`);
          checkbox.checked = row.isSelected;

          checkbox.addEventListener("change", () => {
            handleSelectUnit(row.code);
            render();
          });

          td.appendChild(checkbox);
          tr.appendChild(td);
          continue;
        }

        if (col.key === "actions") {
          const td = documentRef.createElement("td");
          td.className = "alt-table-col-center";

          const inspectBtn = documentRef.createElement("button");
          inspectBtn.type = "button";
          inspectBtn.className = "alt-table-btn alt-table-inspect-btn";
          inspectBtn.setAttribute("data-code", row.code);
          inspectBtn.setAttribute("data-action", "inspect");
          inspectBtn.setAttribute("aria-label", `Inspecionar ${row.name}`);
          inspectBtn.textContent = "Inspecionar";

          inspectBtn.addEventListener("click", () => {
            handleInspectUnit(row.code);
            render();
          });

          td.appendChild(inspectBtn);
          tr.appendChild(td);
          continue;
        }

        if (col.key === "name") {
          const th = documentRef.createElement("th");
          th.setAttribute("scope", "row");
          th.className = "alt-table-unit-name";
          th.textContent = row.name;
          tr.appendChild(th);
          continue;
        }

        const td = documentRef.createElement("td");
        td.className = `alt-table-col-${col.align}`;

        let cellContent = "-";
        if (col.key === "code") {
          cellContent = row.code;
        }
        if (col.key === "value") {
          cellContent = row.formattedValue || "-";
        }
        if (col.key === "classIndex") {
          cellContent = row.classLabel || "-";
        }
        if (col.key === "region") {
          cellContent = row.regionName || "-";
        }
        if (col.key === "count") {
          cellContent = String(row.count || "-");
        }
        if (col.key === "leader") {
          cellContent = row.leader || "-";
        }
        if (col.key === "party") {
          cellContent = row.party || "-";
        }
        if (col.key === "leaderPct") {
          cellContent = row.leaderPct || "-";
        }
        if (col.key === "secondPct") {
          cellContent = row.secondPct || "-";
        }
        if (col.key === "margin") {
          cellContent = row.margin || "-";
        }
        if (col.key === "sectionsPct") {
          cellContent = row.sectionsPct || "-";
        }
        if (col.key === "colorText") {
          cellContent = row.colorText || "-";
        }

        td.textContent = cellContent;
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    // Table footer with WCAG badge (ACE-06)
    const tfoot = documentRef.createElement("tfoot");
    const trFoot = documentRef.createElement("tr");
    const tdFoot = documentRef.createElement("td");
    tdFoot.setAttribute("colspan", String(model.columns.length));
    tdFoot.className = "alt-table-wcag-footer";

    const badge = documentRef.createElement("span");
    badge.className = "alt-table-wcag-badge";
    badge.textContent = WCAG_FOOTER_BADGE;
    tdFoot.appendChild(badge);

    trFoot.appendChild(tdFoot);
    tfoot.appendChild(trFoot);
    table.appendChild(tfoot);

    scroll.appendChild(table);
    container.appendChild(scroll);

    // Restore focus if previously active element was inside table (ACE-03)
    if (savedCode && savedType) {
      const match = container.querySelector(
        `[data-code="${savedCode}"][data-action="${savedType}"]`,
      );
      if (match && typeof match.focus === "function") {
        match.focus();
      }
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  container.addEventListener("keydown", handleKeyDown);

  function open() {
    isCurrentlyOpen = true;
    slot.hidden = false;
    lastFocusedElement = documentRef.activeElement;
    render();

    const closeBtn = container.querySelector(".alt-table-close-btn");
    if (closeBtn && typeof closeBtn.focus === "function") {
      closeBtn.focus();
    }
  }

  function close() {
    isCurrentlyOpen = false;
    slot.hidden = true;

    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
      return;
    }

    const openLink = documentRef.getElementById("open-table-link");
    if (openLink && typeof openLink.focus === "function") {
      openLink.focus();
    }
  }

  function update(updatedOptions = {}) {
    currentOptions = { ...currentOptions, ...updatedOptions };
    if (isCurrentlyOpen) {
      render();
    }
  }

  function destroy() {
    container.removeEventListener("keydown", handleKeyDown);
    slot.replaceChildren();
    if (unsubscribeStore) {
      unsubscribeStore();
    }
  }

  let unsubscribeStore = null;
  const store = /** @type {any} */ (windowRef).__appStore;
  if (store && typeof store.subscribe === "function") {
    unsubscribeStore = store.subscribe(() => {
      if (isCurrentlyOpen) {
        render();
      }
    });
  }

  if (isCurrentlyOpen) {
    render();
  }

  return {
    open,
    close,
    update,
    destroy,
    isOpen() {
      return isCurrentlyOpen;
    },
    element: slot,
  };
}
