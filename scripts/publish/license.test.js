import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { LICENSE_CONDITIONS } from "../data/sources.js";

/**
 * @typedef {{ condition: string, credit: string, notice?: string }} DataLicense
 * @typedef {{ year: number[], license: DataLicense }} DataMeta
 * @typedef {{ file: string, meta: DataMeta }} DataFileMeta
 */

const LICENSE_URL = new URL("../../LICENSE", import.meta.url);
const README_URL = new URL("../../README.md", import.meta.url);
const DATA_DIR_URL = new URL("../../data/", import.meta.url);

const DATA_FILES = ["mesh.topo.json", "municipalities.json", "regions.json"];
const MESH_FILE = "mesh.topo.json";
const PENDING_CONDITION = /pending/i;
const LICENSE_SEPARATOR = "; ";
const CREDIT_WITH_SOURCE_AND_YEAR = /^(?:IBGE|Fundação Seade), .*?, (\d{4})\b/;

const ATTRIBUTION_HEADING = "## Atribuição dos dados";
const COPYRIGHT_LINE = "Copyright (c) 2026 Manoel Osmi";
const MARKDOWN_HTTPS_LINK = /\]\(https:\/\/[^)\s]+\)/;
const DAY_MONTH_YEAR = /\b\d{2}\/\d{2}\/\d{4}\b/;

const MIT_CLAUSES = [
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  "The above copyright notice and this permission notice shall be included in all",
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
];

const MESH_PROCESSING_NOTICE = [/process/, /projeç/, /quantiza/, /aproximados/, /não oficiais/];

test("PUB-05 LICENSE opens with the MIT title and the author copyright line", () => {
  const lines = readText(LICENSE_URL).split("\n");

  assert.equal(lines[0], "MIT License");
  assert.equal(lines[2], COPYRIGHT_LINE);
});

test("PUB-05 LICENSE carries the MIT grant, notice condition and warranty disclaimer", () => {
  const license = readText(LICENSE_URL);

  const missingClauses = MIT_CLAUSES.filter((clause) => !license.includes(clause));

  assert.deepEqual(missingClauses, []);
});

test("PUB-05 README credits the IBGE municipal mesh with link and date", () => {
  assertCredited(/IBGE, Malha Municipal, \d{4}/);
});

test("PUB-05 README credits the IBGE 2022 census with link and date", () => {
  assertCredited(/IBGE, SIDRA, tabela 4714, 2022/);
});

test("PUB-05 README credits the IBGE 2023 municipal GDP with link and date", () => {
  assertCredited(/IBGE, SIDRA, tabela 5938, 2023/);
});

test("PUB-05 README credits Seade Municípios do Estado de SP with link and date", () => {
  assertCredited(/Fundação Seade, Municípios do Estado de SP, \d{4}/);
});

test("PUB-05 README names the mesh license and warns it was processed and approximate", () => {
  const section = readAttributionSection();

  const missingPatterns = MESH_PROCESSING_NOTICE.filter((pattern) => !pattern.test(section));

  assert.match(section, /CC BY 4\.0/);
  assert.deepEqual(missingPatterns, []);
});

test("DAD-05 no file in data/ leaves its license condition pending", () => {
  const pendingFiles = readDataFileMetas()
    .filter(({ meta }) => PENDING_CONDITION.test(meta.license.condition))
    .map(({ file }) => file);

  assert.deepEqual(pendingFiles, []);
});

test("DAD-05 every license condition in data/ belongs to the closed vocabulary", () => {
  /** @type {string[]} */
  const vocabulary = Object.values(LICENSE_CONDITIONS);

  const unknownConditions = readDataFileMetas().flatMap(({ file, meta }) =>
    splitParts(meta.license.condition)
      .filter((condition) => !vocabulary.includes(condition))
      .map((condition) => `${file}: ${condition}`),
  );

  assert.deepEqual(unknownConditions, []);
});

test("DAD-05 every credit in data/ cites the source and the year of its files", () => {
  const problems = readDataFileMetas().flatMap(describeCreditProblems);

  assert.deepEqual(problems, []);
});

test("PUB-05 the mesh meta warns that the mesh was processed and its limits are approximate", () => {
  const { notice } = readDataMeta(MESH_FILE).license;

  assert.ok(notice, `${MESH_FILE} has no license.notice`);
  const missingPatterns = MESH_PROCESSING_NOTICE.filter((pattern) => !pattern.test(notice));
  assert.deepEqual(missingPatterns, []);
});

/**
 * @param {RegExp} creditPattern the citation the attribution item must contain.
 */
function assertCredited(creditPattern) {
  const item = readAttributionItems().find((candidate) => creditPattern.test(candidate));

  assert.ok(item, `No attribution item matches ${creditPattern}`);
  assert.match(item, MARKDOWN_HTTPS_LINK, `Attribution item has no https link: ${item}`);
  assert.match(item, DAY_MONTH_YEAR, `Attribution item has no access date: ${item}`);
}

/**
 * @returns {string[]} one entry per markdown list item of the attribution section.
 */
function readAttributionItems() {
  const paragraphs = readAttributionSection().split(/\n\s*\n/);
  const blocks = paragraphs.flatMap((paragraph) => paragraph.split(/\n(?=- )/));
  return blocks.filter((block) => block.startsWith("- "));
}

/**
 * @returns {string} the README text from the attribution heading to the next level 2 heading.
 */
function readAttributionSection() {
  const readme = readText(README_URL);
  const headingStart = readme.indexOf(ATTRIBUTION_HEADING);
  assert.notEqual(headingStart, -1, `README has no "${ATTRIBUTION_HEADING}" section`);

  const afterHeading = readme.slice(headingStart + ATTRIBUTION_HEADING.length);
  const nextSectionStart = afterHeading.search(/\n## /);
  if (nextSectionStart === -1) {
    return afterHeading;
  }
  return afterHeading.slice(0, nextSectionStart);
}

/**
 * @param {DataFileMeta} entry
 * @returns {string[]} what is wrong with the credits of the file; empty when all is well.
 */
function describeCreditProblems({ file, meta }) {
  const credits = splitParts(meta.license.credit);
  const uncited = credits.filter((credit) => !CREDIT_WITH_SOURCE_AND_YEAR.test(credit));
  const problems = uncited.map((credit) => `${file}: credit without source and year: ${credit}`);

  const creditedYears = readCreditedYears(credits);
  const isEveryYearCredited = creditedYears.join() === meta.year.join();
  if (isEveryYearCredited) return problems;

  return [
    ...problems,
    `${file}: credited years ${creditedYears} differ from meta.year ${meta.year}`,
  ];
}

/**
 * @param {string[]} credits
 * @returns {number[]} the distinct years the credits cite, ascending.
 */
function readCreditedYears(credits) {
  const years = credits.flatMap((credit) => {
    const match = CREDIT_WITH_SOURCE_AND_YEAR.exec(credit);
    if (match === null) return [];
    return [Number(match[1])];
  });
  return [...new Set(years)].sort((left, right) => left - right);
}

/**
 * @param {string} joinedParts license text the build joined with "; ".
 * @returns {string[]}
 */
function splitParts(joinedParts) {
  return joinedParts.split(LICENSE_SEPARATOR);
}

/**
 * @returns {DataFileMeta[]} the meta of every file in data/.
 */
function readDataFileMetas() {
  return DATA_FILES.map((file) => ({ file, meta: readDataMeta(file) }));
}

/**
 * @param {string} file name of a file in data/.
 * @returns {DataMeta}
 */
function readDataMeta(file) {
  return JSON.parse(readText(new URL(file, DATA_DIR_URL))).meta;
}

/**
 * @param {URL} fileUrl
 * @returns {string} the file text with LF line endings.
 */
function readText(fileUrl) {
  return fs.readFileSync(fileUrl, "utf8").replace(/\r\n/g, "\n");
}
