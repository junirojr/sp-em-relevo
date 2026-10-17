import { aggregateIndicator } from "./aggregation.js";
import { describeCompareSide } from "./compare.js";
import { INDICATORS } from "./indicator.js";
import { findSuggestions, normalizeName } from "./search.js";

/**
 * Results of the search window: matching, quick filters, recent picks and the highlighted name.
 * Follows SEL-14, SEL-15 and SEL-16.
 *
 * @typedef {import("./search.js").SearchEntry} SearchEntry
 * @typedef {import("./selection.js").PanelUnit} PanelUnit
 * @typedef {import("./compare.js").CompareContext} CompareContext
 * @typedef {import("./territory.js").TerritoryIndex} TerritoryIndex
 *
 * @typedef {"all" | "regions" | "mostPopulous"} SearchFilter
 *   "all" keeps every match, "regions" keeps only regions, "mostPopulous" orders by population.
 *
 * @typedef {{ text: string, isMatch: boolean }} NamePart
 *   A slice of the label; `isMatch` marks the slice the query found.
 *
 * @typedef {{
 *   entry: SearchEntry,
 *   nameParts: NamePart[],
 *   rankLabel: string,
 *   contextLabel: string,
 *   valueLabel: string,
 *   bandIndex: number
 * }} SearchResult
 *   `rankLabel`, `contextLabel`, `valueLabel` and `bandIndex` follow the comparison side (SEL-11).
 *
 * @typedef {{
 *   entries: SearchEntry[],
 *   query: string,
 *   filter: SearchFilter,
 *   context: CompareContext
 * }} SearchRequest
 *
 * @typedef {{ foundCount: number, results: SearchResult[] }} SearchResults
 *   `foundCount` counts every match; `results` holds the first RESULT_LIMIT of them.
 *
 * @typedef {{ entry: SearchEntry, population: number | null }} MeasuredEntry
 *
 * @typedef {{ text: string, starts: number[], ends: number[] }} FoldedLabel
 *   The label without accents and case. Each folded character keeps the start and the end of
 *   the label character it came from.
 *
 * @typedef {{ text: string, start: number, end: number }} FoldedPiece
 *   The folding of one label character, which spans `start` to `end` in the label.
 */

export const RESULT_LIMIT = 8;
export const RECENT_LIMIT = 3;

/**
 * The matches of the query under the filter, described for the window.
 *
 * @param {SearchRequest} request
 * @returns {SearchResults}
 */
export function findSearchResults(request) {
  const matches = findSearchMatches(request);
  const shownMatches = matches.slice(0, RESULT_LIMIT);
  return {
    foundCount: matches.length,
    results: shownMatches.map((entry) =>
      describeSearchEntry(entry, request.query, request.context),
    ),
  };
}

/**
 * Every entry the query finds, ignoring accents and case (SEL-02), under the quick filter. The
 * typed name comes first, so Enter picks it.
 *
 * @param {SearchRequest} request
 * @returns {SearchEntry[]}
 */
export function findSearchMatches(request) {
  const matches = findRankedMatches(request.entries, request.query);
  return applyFilter(matches, request.filter, request.context.territory);
}

/**
 * One window line: the highlighted name, the state position by the active indicator, the region
 * or the municipality count, the value with unit and the band.
 *
 * @param {SearchEntry} entry
 * @param {string} query
 * @param {CompareContext} context
 * @returns {SearchResult}
 */
export function describeSearchEntry(entry, query, context) {
  const side = describeCompareSide(toPanelUnit(entry, context.territory), context);
  return {
    entry,
    nameParts: highlightMatch(entry.label, query),
    rankLabel: side.rankLabel,
    contextLabel: side.contextLabel,
    valueLabel: side.valueLabel,
    bandIndex: side.bandIndex,
  };
}

/**
 * Splits the label around the first slice the query finds, ignoring accents and case.
 *
 * @param {string} label
 * @param {string} query
 * @returns {NamePart[]}
 */
export function highlightMatch(label, query) {
  const needle = normalizeName(query);
  const wholeLabel = [{ text: label, isMatch: false }];
  if (needle === "") {
    return wholeLabel;
  }
  const folded = foldLabel(label);
  const foundAt = folded.text.indexOf(needle);
  if (foundAt < 0) {
    return wholeLabel;
  }
  return splitLabel(label, folded.starts[foundAt], folded.ends[foundAt + needle.length - 1]);
}

/**
 * The recent picks with the new one first, without repeats, at most RECENT_LIMIT (SEL-16).
 *
 * @param {readonly SearchEntry[]} recents
 * @param {SearchEntry} entry
 * @returns {SearchEntry[]}
 */
export function rememberRecent(recents, entry) {
  const otherRecents = recents.filter((recent) => !isSameEntry(recent, entry));
  return [entry, ...otherRecents].slice(0, RECENT_LIMIT);
}

/**
 * @param {number} count
 * @returns {string}
 */
export function formatFoundCount(count) {
  if (count === 1) {
    return "1 encontrado";
  }
  return `${count} encontrados`;
}

/**
 * Exact names first, then the order of `findSuggestions`: prefix matches, then inner ones. The
 * exact check also reads the label, so "Nome (região)" typed in full still finds its entry.
 *
 * @param {SearchEntry[]} entries
 * @param {string} query
 * @returns {SearchEntry[]}
 */
function findRankedMatches(entries, query) {
  const needle = normalizeName(query);
  if (needle === "") {
    return [];
  }
  const exactMatches = entries.filter((entry) => isExactMatch(entry, needle));
  const otherMatches = findSuggestions(entries, query, entries.length).filter(
    (entry) => !exactMatches.includes(entry),
  );
  return [...exactMatches, ...otherMatches];
}

/**
 * @param {SearchEntry} entry
 * @param {string} needle
 * @returns {boolean}
 */
function isExactMatch(entry, needle) {
  if (entry.key === needle) {
    return true;
  }
  return normalizeName(entry.label) === needle;
}

/**
 * @param {SearchEntry[]} matches
 * @param {SearchFilter} filter
 * @param {TerritoryIndex} territory
 * @returns {SearchEntry[]}
 */
function applyFilter(matches, filter, territory) {
  if (filter === "regions") {
    return matches.filter((entry) => entry.kind === "region");
  }
  if (filter === "mostPopulous") {
    return orderByPopulation(matches, territory);
  }
  return matches;
}

/**
 * Decreasing population, units without it last, ties by label in pt-BR.
 *
 * @param {SearchEntry[]} matches
 * @param {TerritoryIndex} territory
 * @returns {SearchEntry[]}
 */
function orderByPopulation(matches, territory) {
  const measuredEntries = matches.map((entry) => ({
    entry,
    population: readPopulation(entry, territory),
  }));
  measuredEntries.sort(compareByPopulation);
  return measuredEntries.map((measured) => measured.entry);
}

/**
 * @param {MeasuredEntry} first
 * @param {MeasuredEntry} second
 * @returns {number}
 */
function compareByPopulation(first, second) {
  const firstPopulation = first.population ?? Number.NEGATIVE_INFINITY;
  const secondPopulation = second.population ?? Number.NEGATIVE_INFINITY;
  if (firstPopulation !== secondPopulation) {
    return secondPopulation - firstPopulation;
  }
  return first.entry.label.localeCompare(second.entry.label, "pt-BR");
}

/**
 * The population of the unit, from the domain aggregation over its municipalities.
 *
 * @param {SearchEntry} entry
 * @param {TerritoryIndex} territory
 * @returns {number | null}
 */
function readPopulation(entry, territory) {
  const unit = toPanelUnit(entry, territory);
  const records = unit.codes
    .map((code) => territory.municipalityByCode(code))
    .filter((record) => record !== undefined);
  return aggregateIndicator(INDICATORS.population, records).value;
}

/**
 * The unit the entry adds to the selection: one municipality, or every municipality of a region.
 *
 * @param {SearchEntry} entry
 * @param {TerritoryIndex} territory
 * @returns {PanelUnit}
 */
function toPanelUnit(entry, territory) {
  if (entry.kind === "region") {
    const codes = territory.municipalitiesInRegion(entry.code).map((record) => record.code);
    return { kind: "region", code: entry.code, name: entry.label, codes };
  }
  const name = territory.nameByCode(entry.code) ?? entry.label;
  return { kind: "municipality", code: entry.code, name, codes: [entry.code] };
}

/**
 * Folds the label the way `normalizeName` folds a query, one character at a time, so a match in
 * the folded text points back to the label.
 *
 * @param {string} label
 * @returns {FoldedLabel}
 */
function foldLabel(label) {
  const pieces = foldPieces(label);
  return {
    text: pieces.map((piece) => piece.text).join(""),
    starts: pieces.flatMap((piece) => repeatOffset(piece.start, piece.text.length)),
    ends: pieces.flatMap((piece) => repeatOffset(piece.end, piece.text.length)),
  };
}

/**
 * @param {string} label
 * @returns {FoldedPiece[]}
 */
function foldPieces(label) {
  /** @type {FoldedPiece[]} */
  const pieces = [];
  let foldedSoFar = "";
  let start = 0;
  for (const character of label) {
    const text = foldCharacter(character, foldedSoFar);
    pieces.push({ text, start, end: start + character.length });
    foldedSoFar += text;
    start += character.length;
  }
  return pieces;
}

/**
 * Whitespace collapses to one space and never leads, as in `normalizeName`.
 *
 * @param {string} character
 * @param {string} foldedSoFar
 * @returns {string}
 */
function foldCharacter(character, foldedSoFar) {
  const isWhitespace = /\s/u.test(character);
  if (!isWhitespace) {
    return normalizeName(character);
  }
  const isRepeatedSpace = foldedSoFar === "" || foldedSoFar.endsWith(" ");
  if (isRepeatedSpace) {
    return "";
  }
  return " ";
}

/**
 * @param {number} offset
 * @param {number} count
 * @returns {number[]}
 */
function repeatOffset(offset, count) {
  return new Array(count).fill(offset);
}

/**
 * @param {string} label
 * @param {number} start
 * @param {number} end
 * @returns {NamePart[]}
 */
function splitLabel(label, start, end) {
  const parts = [
    { text: label.slice(0, start), isMatch: false },
    { text: label.slice(start, end), isMatch: true },
    { text: label.slice(end), isMatch: false },
  ];
  return parts.filter((part) => part.text !== "");
}

/**
 * @param {SearchEntry} first
 * @param {SearchEntry} second
 * @returns {boolean}
 */
function isSameEntry(first, second) {
  return first.kind === second.kind && first.code === second.code;
}
