import { buildSearchEntries } from "../../domain/search.js";
import {
  describeSearchEntry,
  findSearchMatches,
  findSearchResults,
  formatFoundCount,
  rememberRecent,
} from "../../domain/search-results.js";
import { addRegionAction, toggleMunicipalityAction } from "./selection-slice.js";

/**
 * @typedef {import("../../domain/territory.js").TerritoryIndex} TerritoryIndex
 * @typedef {import("../../domain/search.js").SearchEntry} SearchEntry
 * @typedef {import("../../domain/search-results.js").SearchFilter} SearchFilter
 * @typedef {import("../../domain/search-results.js").SearchResult} SearchResult
 * @typedef {import("../../domain/search-results.js").NamePart} NamePart
 * @typedef {import("../../domain/compare.js").CompareContext} CompareContext
 * @typedef {{ type: string }} Action
 *
 * @typedef {{
 *   territory: TerritoryIndex,
 *   context: CompareContext,
 *   readSelectedCodes: () => readonly string[]
 * }} SearchViewOptions
 *   `context` feeds the position, value and band of each result; `updateContext` replaces it.
 *
 * @typedef {{
 *   query: string,
 *   filter: SearchFilter,
 *   isOpen: boolean,
 *   recents: SearchEntry[],
 *   context: CompareContext
 * }} SearchLocalState
 *   The window belongs to the view. Recent picks live only in this memory, never in storage
 *   (CFG-07), so a reload forgets them.
 *
 * @typedef {"closed" | "results" | "recents"} WindowMode
 * @typedef {{ mode: WindowMode, foundCount: number, options: SearchResult[] }} WindowContent
 *
 * @typedef {{
 *   typeQuery: (query: string) => void,
 *   openWindow: () => void,
 *   closeWindow: () => void,
 *   moveActive: (step: number) => void,
 *   pickActive: () => void,
 *   pickOption: (index: number) => void,
 *   chooseFilter: (filter: SearchFilter) => void,
 *   clearQuery: () => void,
 *   clearHistory: () => void
 * }} SearchActions
 *
 * @typedef {{
 *   element: HTMLDivElement,
 *   filterGroup: HTMLFieldSetElement,
 *   count: HTMLParagraphElement,
 *   clearQueryButton: HTMLButtonElement
 * }} ResultsHeaderParts
 *
 * @typedef {{
 *   element: HTMLDivElement,
 *   clearHistoryButton: HTMLButtonElement
 * }} RecentsHeaderParts
 *
 * @typedef {{
 *   container: HTMLDivElement,
 *   input: HTMLInputElement,
 *   window: HTMLDivElement,
 *   resultsHeader: ResultsHeaderParts,
 *   recentsHeader: RecentsHeaderParts,
 *   listbox: HTMLUListElement,
 *   emptyMessage: HTMLParagraphElement
 * }} SearchParts
 */

const INPUT_ID = "city-search";
const WINDOW_ID = "city-search-window";
const LISTBOX_ID = "city-search-listbox";
const SHORTCUTS_ID = "city-search-shortcuts";
const OPTION_ID_PREFIX = "city-search-option";
const FILTER_NAME = "city-search-filter";
const LABEL_TEXT = "Adicionar cidade ou região";
const PLACEHOLDER_TEXT = "Digite o nome do município ou região";
const FILTERS_LEGEND = "Filtrar resultados";
const RESULTS_LABEL = "Resultados da busca";
const RECENTS_TITLE = "Recentes";
const CLEAR_QUERY_TEXT = "Limpar busca";
const CLEAR_HISTORY_TEXT = "Limpar histórico";
const EMPTY_TEXT = "Nenhum município ou região com esse nome.";
const NO_ACTIVE_OPTION = -1;

/** @type {ReadonlyArray<{ filter: SearchFilter, label: string }>} */
const FILTERS = [
  { filter: "all", label: "Todos" },
  { filter: "regions", label: "Regiões" },
  { filter: "mostPopulous", label: "Mais populosos" },
];

const SHORTCUTS = [
  { keys: ["↑", "↓"], action: "navegar" },
  { keys: ["Enter"], action: "adicionar" },
  { keys: ["Esc"], action: "fechar" },
];

/** @type {SearchFilter} */
const DEFAULT_FILTER = "all";

/** @type {WindowContent} */
const CLOSED_CONTENT = Object.freeze({ mode: "closed", foundCount: 0, options: [] });

/** @type {Omit<SearchLocalState, "context">} */
const INITIAL_LOCAL_STATE = Object.freeze({
  query: "",
  filter: DEFAULT_FILTER,
  isOpen: false,
  recents: [],
});

/**
 * Mounts the search field as an ARIA 1.2 combobox with a results window anchored to it.
 * Follows SEL-02, SEL-14, SEL-15 and SEL-16.
 *
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {SearchViewOptions} options
 */
export function mountSearchView(documentRef, dispatch, options) {
  const entries = buildSearchEntries(options.territory);
  const parts = buildSearchParts(documentRef);
  /** @type {SearchLocalState} */
  let local = { ...INITIAL_LOCAL_STATE, context: options.context };
  let content = CLOSED_CONTENT;
  let activeIndex = NO_ACTIVE_OPTION;

  /** @param {SearchLocalState} next */
  const show = (next) => {
    local = next;
    content = readWindowContent(local, entries);
    activeIndex = NO_ACTIVE_OPTION;
    renderWindow(documentRef, parts, content);
    renderActiveOption(parts, activeIndex);
  };

  const open = () => {
    if (local.isOpen) {
      return;
    }
    show({ ...local, isOpen: true });
  };

  /** @param {SearchEntry | undefined} entry */
  const pick = (entry) => {
    if (!entry) {
      return;
    }
    dispatchAddition(dispatch, entry, options);
    parts.input.value = "";
    show({ ...local, query: "", isOpen: false, recents: rememberRecent(local.recents, entry) });
  };

  wireSearchEvents(parts, {
    typeQuery: (query) => show({ ...local, query, isOpen: true }),
    openWindow: open,
    closeWindow: () => {
      if (!local.isOpen) {
        return;
      }
      show({ ...local, isOpen: false });
    },
    moveActive: (step) => {
      open();
      activeIndex = stepActiveIndex(activeIndex, step, content.options.length);
      renderActiveOption(parts, activeIndex);
    },
    pickActive: () => pick(readEnterEntry(content, activeIndex, { entries, ...local })),
    pickOption: (index) => pick(content.options[index]?.entry),
    chooseFilter: (filter) => show({ ...local, filter }),
    clearQuery: () => show({ ...local, query: "" }),
    clearHistory: () => show({ ...local, recents: [] }),
  });

  return {
    element: parts.container,
    updateContext: (/** @type {CompareContext} */ context) => {
      local = { ...local, context };
      if (content.mode === "closed") {
        return;
      }
      show(local);
    },
  };
}

/**
 * Typing opens the window; with the field empty it shows the recent picks, or stays closed when
 * there are none.
 *
 * @param {SearchLocalState} local
 * @param {SearchEntry[]} entries
 * @returns {WindowContent}
 */
function readWindowContent(local, entries) {
  if (!local.isOpen) {
    return CLOSED_CONTENT;
  }
  if (local.query.trim() !== "") {
    return readResultsContent(local, entries);
  }
  if (local.recents.length === 0) {
    return CLOSED_CONTENT;
  }
  return readRecentsContent(local);
}

/**
 * @param {SearchLocalState} local
 * @param {SearchEntry[]} entries
 * @returns {WindowContent}
 */
function readResultsContent(local, entries) {
  const found = findSearchResults({ entries, ...local });
  return { mode: "results", foundCount: found.foundCount, options: found.results };
}

/**
 * @param {SearchLocalState} local
 * @returns {WindowContent}
 */
function readRecentsContent(local) {
  const options = local.recents.map((entry) => describeSearchEntry(entry, "", local.context));
  return { mode: "recents", foundCount: options.length, options };
}

/**
 * Enter adds the active option, or the first match when no option was moved to (SEL-15).
 *
 * @param {WindowContent} content
 * @param {number} activeIndex
 * @param {import("../../domain/search-results.js").SearchRequest} request
 * @returns {SearchEntry | undefined}
 */
function readEnterEntry(content, activeIndex, request) {
  const activeOption = content.options[activeIndex];
  if (activeOption) {
    return activeOption.entry;
  }
  return findSearchMatches(request)[0];
}

/**
 * Moves the active option and wraps at both ends; up from no option lands on the last one.
 *
 * @param {number} activeIndex
 * @param {number} step 1 or -1.
 * @param {number} optionCount
 * @returns {number}
 */
function stepActiveIndex(activeIndex, step, optionCount) {
  if (optionCount === 0) {
    return NO_ACTIVE_OPTION;
  }
  const isEnteringFromBelow = activeIndex === NO_ACTIVE_OPTION && step < 0;
  if (isEnteringFromBelow) {
    return optionCount - 1;
  }
  return (activeIndex + step + optionCount) % optionCount;
}

/**
 * A region adds every municipality of it; a municipality already in the selection stays there,
 * so the search only adds (SEL-02).
 *
 * @param {(action: Action) => void} dispatch
 * @param {SearchEntry} entry
 * @param {SearchViewOptions} options
 */
function dispatchAddition(dispatch, entry, options) {
  if (entry.kind === "region") {
    dispatch(addRegionAction(entry.code, options.territory));
    return;
  }
  const isAlreadySelected = options.readSelectedCodes().includes(entry.code);
  if (isAlreadySelected) {
    return;
  }
  dispatch(toggleMunicipalityAction(entry.code));
}

/**
 * Pressing inside the window keeps the focus in the field, so a click on an option or a filter
 * never closes the window first. A label still focuses its radio when clicked, so choosing a
 * filter hands the focus back to the field, where the arrows and Enter work.
 *
 * @param {SearchParts} parts
 * @param {SearchActions} actions
 */
function wireSearchEvents(parts, actions) {
  parts.input.addEventListener("input", () => actions.typeQuery(parts.input.value));
  parts.input.addEventListener("click", actions.openWindow);
  parts.input.addEventListener("keydown", (event) => handleFieldKey(event, actions));
  parts.window.addEventListener("mousedown", (event) => event.preventDefault());
  parts.window.addEventListener("keydown", (event) => handleWindowKey(event, parts, actions));
  parts.container.addEventListener("focusout", (event) => {
    closeWhenFocusLeaves(event, parts.container, actions);
  });
  wireWindowControls(parts, actions);
}

/**
 * @param {SearchParts} parts
 * @param {SearchActions} actions
 */
function wireWindowControls(parts, actions) {
  parts.resultsHeader.filterGroup.addEventListener("change", (event) => {
    actions.chooseFilter(readChosenFilter(event.target));
    parts.input.focus();
  });
  parts.resultsHeader.clearQueryButton.addEventListener("click", () => {
    parts.input.value = "";
    actions.clearQuery();
    parts.input.focus();
  });
  parts.recentsHeader.clearHistoryButton.addEventListener("click", () => {
    actions.clearHistory();
    parts.input.focus();
  });
  parts.listbox.addEventListener("click", (event) => {
    pickClickedOption(event.target, actions);
    parts.input.focus();
  });
}

/**
 * @param {KeyboardEvent} event
 * @param {SearchActions} actions
 */
function handleFieldKey(event, actions) {
  const runKey = readFieldKeyAction(event.key, actions);
  if (runKey === null) {
    return;
  }
  event.preventDefault();
  runKey();
}

/**
 * @param {string} key
 * @param {SearchActions} actions
 * @returns {(() => void) | null}
 */
function readFieldKeyAction(key, actions) {
  if (key === "ArrowDown") {
    return () => actions.moveActive(1);
  }
  if (key === "ArrowUp") {
    return () => actions.moveActive(-1);
  }
  if (key === "Enter") {
    return actions.pickActive;
  }
  if (key === "Escape") {
    return actions.closeWindow;
  }
  return null;
}

/**
 * Esc on a filter or a button of the window closes it and hands the focus back to the field.
 *
 * @param {KeyboardEvent} event
 * @param {SearchParts} parts
 * @param {SearchActions} actions
 */
function handleWindowKey(event, parts, actions) {
  if (event.key !== "Escape") {
    return;
  }
  event.preventDefault();
  actions.closeWindow();
  parts.input.focus();
}

/**
 * @param {FocusEvent} event
 * @param {HTMLElement} container
 * @param {SearchActions} actions
 */
function closeWhenFocusLeaves(event, container, actions) {
  const nextFocus = event.relatedTarget;
  const staysInside = nextFocus instanceof Node && container.contains(nextFocus);
  if (staysInside) {
    return;
  }
  actions.closeWindow();
}

/**
 * @param {EventTarget | null} target
 * @returns {SearchFilter}
 */
function readChosenFilter(target) {
  if (!(target instanceof HTMLInputElement)) {
    return DEFAULT_FILTER;
  }
  const chosen = FILTERS.find((choice) => choice.filter === target.value);
  if (!chosen) {
    return DEFAULT_FILTER;
  }
  return chosen.filter;
}

/**
 * @param {EventTarget | null} target
 * @param {SearchActions} actions
 */
function pickClickedOption(target, actions) {
  if (!(target instanceof Element)) {
    return;
  }
  const option = target.closest('[role="option"]');
  if (!(option instanceof HTMLElement)) {
    return;
  }
  actions.pickOption(Number(option.dataset.index));
}

/**
 * @param {Document} documentRef
 * @param {SearchParts} parts
 * @param {WindowContent} content
 */
function renderWindow(documentRef, parts, content) {
  const isShown = content.mode !== "closed";
  const hasOptions = content.options.length > 0;
  const isEmptyResult = content.mode === "results" && !hasOptions;
  parts.window.hidden = !isShown;
  parts.input.setAttribute("aria-expanded", String(isShown));
  parts.resultsHeader.element.hidden = content.mode !== "results";
  parts.recentsHeader.element.hidden = content.mode !== "recents";
  parts.resultsHeader.count.textContent = formatFoundCount(content.foundCount);
  parts.listbox.setAttribute("aria-label", readListboxLabel(content.mode));
  parts.listbox.hidden = !hasOptions;
  parts.listbox.replaceChildren(
    ...content.options.map((result, index) => buildOption(documentRef, result, index)),
  );
  parts.emptyMessage.hidden = !isEmptyResult;
}

/**
 * The active option carries `aria-selected` and is named by `aria-activedescendant`; the focus
 * never leaves the field.
 *
 * @param {SearchParts} parts
 * @param {number} activeIndex
 */
function renderActiveOption(parts, activeIndex) {
  const options = Array.from(parts.listbox.children);
  for (const [index, option] of options.entries()) {
    option.setAttribute("aria-selected", String(index === activeIndex));
  }
  const activeOption = options[activeIndex];
  if (!activeOption) {
    parts.input.removeAttribute("aria-activedescendant");
    return;
  }
  parts.input.setAttribute("aria-activedescendant", activeOption.id);
  scrollOptionIntoList(parts.listbox, activeOption);
}

/**
 * Scrolls only the list: `scrollIntoView` would also scroll the column, which clips its overflow.
 *
 * @param {HTMLElement} listbox positioned, so it is the offset parent of its options.
 * @param {Element} option
 */
function scrollOptionIntoList(listbox, option) {
  if (!(option instanceof HTMLElement)) {
    return;
  }
  const optionBottom = option.offsetTop + option.offsetHeight;
  const visibleBottom = listbox.scrollTop + listbox.clientHeight;
  if (option.offsetTop < listbox.scrollTop) {
    listbox.scrollTop = option.offsetTop;
    return;
  }
  if (optionBottom > visibleBottom) {
    listbox.scrollTop = optionBottom - listbox.clientHeight;
  }
}

/**
 * @param {WindowMode} mode
 * @returns {string}
 */
function readListboxLabel(mode) {
  if (mode === "recents") {
    return RECENTS_TITLE;
  }
  return RESULTS_LABEL;
}

/**
 * One result: swatch and highlighted name, the state position, the region or the municipality
 * count, and the value with unit (SEL-14).
 *
 * @param {Document} documentRef
 * @param {SearchResult} result
 * @param {number} index
 * @returns {HTMLLIElement}
 */
function buildOption(documentRef, result, index) {
  const option = createElement(documentRef, "li", "search-option");
  option.id = `${OPTION_ID_PREFIX}-${result.entry.kind}-${result.entry.code}`;
  option.setAttribute("role", "option");
  option.setAttribute("aria-selected", "false");
  option.dataset.index = String(index);
  option.dataset.kind = result.entry.kind;
  option.dataset.code = result.entry.code;
  option.append(
    buildSwatch(documentRef, result.bandIndex),
    buildOptionName(documentRef, result.nameParts),
    createElement(documentRef, "span", "search-option-rank", result.rankLabel),
    createElement(documentRef, "span", "search-option-context", result.contextLabel),
    createElement(documentRef, "span", "search-option-value", result.valueLabel),
  );
  return option;
}

/**
 * @param {Document} documentRef
 * @param {number} bandIndex
 * @returns {HTMLSpanElement}
 */
function buildSwatch(documentRef, bandIndex) {
  const swatch = createElement(documentRef, "span", "band-swatch search-swatch");
  swatch.dataset.band = String(bandIndex);
  swatch.setAttribute("aria-hidden", "true");
  return swatch;
}

/**
 * @param {Document} documentRef
 * @param {NamePart[]} nameParts
 * @returns {HTMLSpanElement}
 */
function buildOptionName(documentRef, nameParts) {
  const name = createElement(documentRef, "span", "search-option-name");
  name.append(...nameParts.map((part) => buildNamePart(documentRef, part)));
  return name;
}

/**
 * @param {Document} documentRef
 * @param {NamePart} part
 * @returns {HTMLElement | Text}
 */
function buildNamePart(documentRef, part) {
  if (!part.isMatch) {
    return documentRef.createTextNode(part.text);
  }
  return createElement(documentRef, "mark", "search-match", part.text);
}

/**
 * @param {Document} documentRef
 * @returns {SearchParts}
 */
function buildSearchParts(documentRef) {
  const input = buildInput(documentRef);
  const resultsHeader = buildResultsHeader(documentRef);
  const recentsHeader = buildRecentsHeader(documentRef);
  const listbox = buildListbox(documentRef);
  const emptyMessage = createElement(documentRef, "p", "search-empty", EMPTY_TEXT);
  const windowElement = buildWindow(documentRef, [
    resultsHeader.element,
    recentsHeader.element,
    listbox,
    emptyMessage,
    buildShortcuts(documentRef),
  ]);
  const container = createElement(documentRef, "div", "selection-search-field");
  container.append(buildLabel(documentRef), input, windowElement);
  return {
    container,
    input,
    window: windowElement,
    resultsHeader,
    recentsHeader,
    listbox,
    emptyMessage,
  };
}

/**
 * @param {Document} documentRef
 * @returns {HTMLLabelElement}
 */
function buildLabel(documentRef) {
  const label = createElement(documentRef, "label", "field-label", LABEL_TEXT);
  label.htmlFor = INPUT_ID;
  return label;
}

/**
 * @param {Document} documentRef
 * @returns {HTMLInputElement}
 */
function buildInput(documentRef) {
  const input = documentRef.createElement("input");
  input.type = "text";
  input.id = INPUT_ID;
  input.placeholder = PLACEHOLDER_TEXT;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", LISTBOX_ID);
  input.setAttribute("aria-describedby", SHORTCUTS_ID);
  return input;
}

/**
 * The quick filters, then "N encontrados" with the button that clears the query.
 *
 * @param {Document} documentRef
 * @returns {ResultsHeaderParts}
 */
function buildResultsHeader(documentRef) {
  const filterGroup = buildFilterGroup(documentRef);
  const count = createElement(documentRef, "p", "search-count");
  count.setAttribute("role", "status");
  const clearQueryButton = buildTextButton(documentRef, CLEAR_QUERY_TEXT);
  const summary = createElement(documentRef, "div", "search-summary");
  summary.append(count, clearQueryButton);
  const element = createElement(documentRef, "div", "search-header");
  element.append(filterGroup, summary);
  return { element, filterGroup, count, clearQueryButton };
}

/**
 * @param {Document} documentRef
 * @returns {HTMLFieldSetElement}
 */
function buildFilterGroup(documentRef) {
  const fieldset = createElement(documentRef, "fieldset", "search-filters");
  fieldset.append(
    createElement(documentRef, "legend", "search-filters-legend", FILTERS_LEGEND),
    ...FILTERS.map((choice) => buildFilterChoice(documentRef, choice)),
  );
  return fieldset;
}

/**
 * @param {Document} documentRef
 * @param {{ filter: SearchFilter, label: string }} choice
 * @returns {HTMLLabelElement}
 */
function buildFilterChoice(documentRef, choice) {
  const radio = documentRef.createElement("input");
  radio.type = "radio";
  radio.name = FILTER_NAME;
  radio.value = choice.filter;
  radio.checked = choice.filter === DEFAULT_FILTER;
  const label = createElement(documentRef, "label", "search-filter");
  label.append(radio, createElement(documentRef, "span", "search-filter-text", choice.label));
  return label;
}

/**
 * @param {Document} documentRef
 * @returns {RecentsHeaderParts}
 */
function buildRecentsHeader(documentRef) {
  const clearHistoryButton = buildTextButton(documentRef, CLEAR_HISTORY_TEXT);
  const element = createElement(documentRef, "div", "search-summary search-recents-header");
  element.append(
    createElement(documentRef, "p", "search-section-title", RECENTS_TITLE),
    clearHistoryButton,
  );
  return { element, clearHistoryButton };
}

/**
 * @param {Document} documentRef
 * @returns {HTMLUListElement}
 */
function buildListbox(documentRef) {
  const listbox = createElement(documentRef, "ul", "search-listbox");
  listbox.id = LISTBOX_ID;
  listbox.setAttribute("role", "listbox");
  listbox.setAttribute("aria-label", RESULTS_LABEL);
  return listbox;
}

/**
 * The footer lists the keyboard shortcuts (SEL-15).
 *
 * @param {Document} documentRef
 * @returns {HTMLParagraphElement}
 */
function buildShortcuts(documentRef) {
  const shortcuts = createElement(documentRef, "p", "search-shortcuts");
  shortcuts.id = SHORTCUTS_ID;
  shortcuts.append(...SHORTCUTS.map((shortcut) => buildShortcut(documentRef, shortcut)));
  return shortcuts;
}

/**
 * @param {Document} documentRef
 * @param {{ keys: string[], action: string }} shortcut
 * @returns {HTMLSpanElement}
 */
function buildShortcut(documentRef, shortcut) {
  const element = createElement(documentRef, "span", "search-shortcut");
  const keys = shortcut.keys.map((key) => createElement(documentRef, "kbd", "search-key", key));
  element.append(...keys, ` ${shortcut.action}`);
  return element;
}

/**
 * @param {Document} documentRef
 * @param {HTMLElement[]} children
 * @returns {HTMLDivElement}
 */
function buildWindow(documentRef, children) {
  const windowElement = createElement(documentRef, "div", "search-window");
  windowElement.id = WINDOW_ID;
  windowElement.hidden = true;
  windowElement.append(...children);
  return windowElement;
}

/**
 * @param {Document} documentRef
 * @param {string} text
 * @returns {HTMLButtonElement}
 */
function buildTextButton(documentRef, text) {
  const button = createElement(documentRef, "button", "search-text-button", text);
  button.type = "button";
  return button;
}

/**
 * @template {keyof HTMLElementTagNameMap} TagName
 * @param {Document} documentRef
 * @param {TagName} tagName
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[TagName]}
 */
function createElement(documentRef, tagName, className, text) {
  const element = documentRef.createElement(tagName);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}
