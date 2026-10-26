import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { inspect, readSelection } from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";
import { parseMunicipalities } from "../../app/data-loader.js";
import { aggregateIndicator } from "../../domain/aggregation.js";
import { classify } from "../../domain/classification.js";
import { INDICATORS } from "../../domain/indicator.js";

/**
 * @typedef {import("@playwright/test").Page} Page
 * @typedef {import("@playwright/test").Locator} Locator
 * @typedef {import("@playwright/test").Browser} Browser
 * @typedef {{ code: string, name: string, regionCode: string, governmentRegionCode?: string, population: number, areaKm2: number, gdpThousandBrl: number }} MunicipalityRecord
 * @typedef {{ code: string, label: string }} RegionRecord
 * @typedef {{ kind: "municipality" | "governmentRegion" | "region", code: string, name: string, codes: string[] }} SearchUnit
 * @typedef {{ x: number, y: number, width: number, height: number }} Box
 */

const VIEWPORT_1280_900 = { width: 1280, height: 900 };
const VIEWPORT_1366_768 = { width: 1366, height: 768 };
const FIELD_NAME = "Adicionar cidade ou região";
const RESULTS_NAME = "Resultados da busca";
const RECENTS_NAME = "Recentes";

/** @type {MunicipalityRecord[]} */
const MUNICIPALITIES = parseMunicipalities(readJson("data/municipalities.json"));
/** @type {RegionRecord[]} */
const REGIONS = readJson("data/regions.json").regions;
/** @type {RegionRecord[]} */
const GOVERNMENT_REGIONS = readJson("data/regions.json").governmentRegions;

const SAO_JOSE_DOS_CAMPOS = municipalityUnit("São José dos Campos");
const RA_SAO_JOSE_DOS_CAMPOS = regionUnit("RA São José dos Campos");
const OSASCO = municipalityUnit("Osasco");
const GUARULHOS = municipalityUnit("Guarulhos");
const PIRACICABA = municipalityUnit("Piracicaba");
const SANTOS = municipalityUnit("Santos");
const RA_SANTOS = regionUnit("RA Santos");

test.describe("SEL search window (SEL-14 to SEL-16)", () => {
  test("SEL-14 typing opens a combobox window anchored to the field, with N encontrados and a button that clears the search", async ({
    browser,
  }) => {
    const { context, page, consoleProblems } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
    });
    try {
      const field = searchField(page);
      await expect(field).toHaveAttribute("aria-expanded", "false");
      await expect(field).toHaveAttribute("aria-autocomplete", "list");
      const listboxId = await field.getAttribute("aria-controls");
      expect(listboxId).toBeTruthy();

      await field.pressSequentially("Campinas");
      await expect(field).toHaveAttribute("aria-expanded", "true");
      const listbox = resultsList(page);
      await expect(listbox).toBeVisible();
      await expect(listbox).toHaveAttribute("id", String(listboxId));
      await expect(listbox.getByRole("option")).toHaveCount(countMatches("Campinas").length);
      await expect(page.locator(".search-count")).toHaveText(
        describeFoundCount(countMatches("Campinas").length),
      );

      await page.getByRole("button", { name: "Limpar busca" }).click();
      await expect(field).toHaveValue("");
      await expect(field).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#city-search-window")).toBeHidden();
      await expect(field).toBeFocused();
      expect(await readSelection(page)).toEqual([]);
      expect(consoleProblems).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("SEL-14 the window hangs under the field inside the column, uncut and clear of the collapse button, in 1280x900 and 1366x768", async ({
    browser,
  }) => {
    for (const viewport of [VIEWPORT_1280_900, VIEWPORT_1366_768]) {
      await expectWindowInsideColumn(browser, viewport);
    }
  });

  test("SEL-14 each result shows the highlighted name, the state position, the region or count, the value with unit and the band color", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const indicator = INDICATORS.population;
      const legend = await readLegend(page);
      await searchField(page).fill("sao jose dos");

      const municipality = optionOf(page, SAO_JOSE_DOS_CAMPOS);
      const municipalityValue = aggregateValue(indicator, SAO_JOSE_DOS_CAMPOS.codes);
      await expect(municipality.locator("mark")).toHaveText("São José dos");
      await expect(municipality.locator(".search-option-name")).toHaveText(
        SAO_JOSE_DOS_CAMPOS.name,
      );
      await expect(municipality.locator(".search-option-rank")).toHaveText(
        `#${positionAmong(municipalityStandings(indicator), SAO_JOSE_DOS_CAMPOS.code)} no Estado`,
      );
      await expect(municipality.locator(".search-option-context")).toHaveText(
        regionLabelOf(SAO_JOSE_DOS_CAMPOS),
      );
      await expect(municipality.locator(".search-option-value")).toHaveText(
        `${indicator.format(municipalityValue)} ${indicator.unit}`,
      );
      const municipalityBand = (await inspect(page, SAO_JOSE_DOS_CAMPOS.code)).classIndex;
      await expectSwatchBand(municipality, municipalityBand);

      const region = optionOf(page, RA_SAO_JOSE_DOS_CAMPOS);
      const regionValue = aggregateValue(indicator, RA_SAO_JOSE_DOS_CAMPOS.codes);
      await expect(region.locator("mark")).toHaveText("São José dos");
      await expect(region.locator(".search-option-rank")).toHaveText(
        `#${positionAmong(regionStandings(indicator), RA_SAO_JOSE_DOS_CAMPOS.code)} no Estado`,
      );
      await expect(region.locator(".search-option-context")).toHaveText(
        `${RA_SAO_JOSE_DOS_CAMPOS.codes.length} municípios`,
      );
      await expect(region.locator(".search-option-value")).toHaveText(
        `${indicator.format(regionValue)} ${indicator.unit}`,
      );
      await expectSwatchBand(region, classify(Number(regionValue), legend.breaks));
    } finally {
      await context.close();
    }
  });

  test("SEL-15 ArrowDown and ArrowUp move the active option, Enter adds it, and Enter without moving adds the first", async ({
    browser,
  }) => {
    const { context, page, consoleProblems } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
    });
    try {
      const field = searchField(page);
      await field.fill("santos");
      const options = resultsList(page).getByRole("option");
      await expect(options).toHaveCount(countMatches("santos").length);
      const optionIds = await options.evaluateAll((elements) => elements.map((item) => item.id));
      await expect(field).not.toHaveAttribute("aria-activedescendant", /./);

      await field.press("ArrowDown");
      await expectActiveOption(field, options, optionIds[0]);
      await field.press("ArrowDown");
      await expectActiveOption(field, options, optionIds[1]);
      await field.press("ArrowUp");
      await expectActiveOption(field, options, optionIds[0]);
      await field.press("ArrowUp");
      await expectActiveOption(field, options, optionIds[optionIds.length - 1]);

      await field.press("ArrowDown");
      await field.press("ArrowDown");
      await expectActiveOption(field, options, optionIds[1]);
      await expect(options.nth(1)).toHaveAttribute("data-code", RA_SANTOS.code);
      await field.press("Enter");
      await settle(page);
      expect(sortedCodes(await readSelection(page))).toEqual(sortedCodes(RA_SANTOS.codes));
      await expect(field).toHaveValue("");
      await expect(field).toHaveAttribute("aria-expanded", "false");
      await expect(field).toBeFocused();

      await removeAllFromSelection(page);
      await field.fill("santos");
      await field.press("Enter");
      await settle(page);
      expect(await readSelection(page)).toEqual(SANTOS.codes);
      expect(consoleProblems).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("SEL-15 Esc closes the window and hands the focus back to the field without changing readSelection()", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const field = searchField(page);
      await chooseInSearch(page, GUARULHOS.name);
      const selectionBefore = await readSelection(page);

      await field.fill("osasco");
      await field.press("ArrowDown");
      await expect(field).toHaveAttribute("aria-activedescendant", /./);
      await field.press("Escape");
      await expect(field).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#city-search-window")).toBeHidden();
      await expect(field).not.toHaveAttribute("aria-activedescendant", /./);
      await expect(field).toBeFocused();
      await expect(field).toHaveValue("osasco");
      expect(await readSelection(page)).toEqual(selectionBefore);

      await field.press("ArrowDown");
      await expect(field).toHaveAttribute("aria-expanded", "true");
      await field.press("Tab");
      await expect(page.getByRole("radio", { name: "Todos" })).toBeFocused();
      await expect(field).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(field).toHaveAttribute("aria-expanded", "false");
      await expect(field).toBeFocused();
      expect(await readSelection(page)).toEqual(selectionBefore);
    } finally {
      await context.close();
    }
  });

  test("SEL-15 clicking a result adds it, and the footer lists the shortcuts", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const field = searchField(page);
      await field.fill("osa");
      const shortcuts = page.locator(".search-shortcuts");
      await expect(shortcuts).toBeVisible();
      await expect(shortcuts.locator("kbd")).toHaveText(["↑", "↓", "Enter", "Esc"]);
      await expect(shortcuts).toContainText("navegar");
      await expect(shortcuts).toContainText("adicionar");
      await expect(shortcuts).toContainText("fechar");

      await optionOf(page, OSASCO).click();
      await settle(page);
      expect(await readSelection(page)).toEqual(OSASCO.codes);
      await expect(field).toHaveAttribute("aria-expanded", "false");
      await expect(field).toHaveValue("");
      await expect(field).toBeFocused();
    } finally {
      await context.close();
    }
  });

  test("SEL-16 Regiões keeps only the regions and Todos brings every match back", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const field = searchField(page);
      const count = page.locator(".search-count");
      const allMatches = countMatches("sa");
      const regionMatches = allMatches.filter((unit) => unit.kind === "region");
      await field.fill("sa");
      await expect(count).toHaveText(describeFoundCount(allMatches.length));

      await chooseFilter(page, "Regiões");
      await expect(page.getByRole("radio", { name: "Regiões" })).toBeChecked();
      await expect(field).toBeFocused();
      await expect(count).toHaveText(describeFoundCount(regionMatches.length));
      const kinds = await resultsList(page)
        .getByRole("option")
        .evaluateAll((elements) => elements.map((item) => item.getAttribute("data-kind")));
      expect(kinds.length).toBeGreaterThan(0);
      expect(new Set(kinds)).toEqual(new Set(["region"]));

      await chooseFilter(page, "Todos");
      await expect(count).toHaveText(describeFoundCount(allMatches.length));
    } finally {
      await context.close();
    }
  });

  test("SEL-16 Mais populosos orders the results by population", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const field = searchField(page);
      const matches = countMatches("sa");
      await field.fill("sa");
      await chooseFilter(page, "Mais populosos");
      await expect(page.locator(".search-count")).toHaveText(describeFoundCount(matches.length));

      const shownUnits = await readShownUnits(page);
      const shownPopulations = shownUnits.map((unit) => populationOf(unit));
      expect(shownPopulations).toEqual([...shownPopulations].sort((left, right) => right - left));
      const mostPopulous = [...matches].sort(
        (left, right) =>
          populationOf(right) - populationOf(left) || left.name.localeCompare(right.name, "pt-BR"),
      )[0];
      expect(shownUnits[0]).toEqual({ kind: mostPopulous.kind, code: mostPopulous.code });

      await field.press("Enter");
      await settle(page);
      expect(sortedCodes(await readSelection(page))).toEqual(sortedCodes(mostPopulous.codes));
    } finally {
      await context.close();
    }
  });

  test("SEL-16 Recentes shows up to three units picked in this visit, newest first, and Limpar histórico empties it", async ({
    browser,
  }) => {
    const { context, page, consoleProblems } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
    });
    try {
      const field = searchField(page);
      await field.click();
      await expect(field).toHaveAttribute("aria-expanded", "false");

      for (const unit of [OSASCO, GUARULHOS, RA_SANTOS, PIRACICABA]) {
        await chooseInSearch(page, unit.name);
      }
      await field.click();
      const recents = recentsList(page);
      await expect(recents).toBeVisible();
      await expect(recents.locator(".search-option-name")).toHaveText([
        PIRACICABA.name,
        RA_SANTOS.name,
        GUARULHOS.name,
      ]);

      await chooseInSearch(page, GUARULHOS.name);
      expect(await readSelection(page)).toContain(GUARULHOS.code);
      await field.click();
      await expect(recents.locator(".search-option-name")).toHaveText([
        GUARULHOS.name,
        PIRACICABA.name,
        RA_SANTOS.name,
      ]);

      await field.press("ArrowDown");
      await field.press("ArrowDown");
      const selectionBefore = await readSelection(page);
      await page.getByRole("button", { name: "Limpar histórico" }).click();
      await expect(field).toHaveAttribute("aria-expanded", "false");
      await expect(field).toBeFocused();
      expect(await readSelection(page)).toEqual(selectionBefore);
      await field.click();
      await expect(field).toHaveAttribute("aria-expanded", "false");
      expect(consoleProblems).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("SEL-16 Recentes lives only in memory: nothing is stored and a reload forgets it", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await chooseInSearch(page, OSASCO.name);
      await searchField(page).click();
      await expect(recentsList(page).getByRole("option")).toHaveCount(1);

      const stored = await page.evaluate(async () => ({
        local: localStorage.length,
        session: sessionStorage.length,
        cookie: document.cookie,
        databases: (await indexedDB.databases()).length,
      }));
      expect(stored).toEqual({ local: 0, session: 0, cookie: "", databases: 0 });

      await page.reload();
      await settle(page);
      await searchField(page).click();
      await expect(searchField(page)).toHaveAttribute("aria-expanded", "false");
      await expect(recentsList(page)).toBeHidden();
    } finally {
      await context.close();
    }
  });
});

/**
 * @param {Page} page
 * @returns {Locator}
 */
function searchField(page) {
  return page.getByRole("combobox", { name: FIELD_NAME });
}

/**
 * @param {Page} page
 * @returns {Locator}
 */
function resultsList(page) {
  return page.getByRole("listbox", { name: RESULTS_NAME });
}

/**
 * @param {Page} page
 * @returns {Locator}
 */
function recentsList(page) {
  return page.getByRole("listbox", { name: RECENTS_NAME });
}

/**
 * @param {Page} page
 * @param {SearchUnit} unit
 * @returns {Locator}
 */
function optionOf(page, unit) {
  return resultsList(page).locator(
    `[role="option"][data-kind="${unit.kind}"][data-code="${unit.code}"]`,
  );
}

/**
 * @param {readonly string[]} codes
 * @returns {string[]}
 */
function sortedCodes(codes) {
  return [...codes].sort();
}

/**
 * Picks a unit the way a person does: types its name in the search field and presses Enter.
 *
 * @param {Page} page
 * @param {string} name
 */
async function chooseInSearch(page, name) {
  const field = searchField(page);
  await field.fill(name);
  await field.press("Enter");
  await settle(page);
}

/**
 * @param {Page} page
 * @param {string} label
 */
async function chooseFilter(page, label) {
  await page.locator("label.search-filter", { hasText: label }).click();
}

/**
 * @param {Page} page
 */
async function removeAllFromSelection(page) {
  await page.locator("#clear-selection").click();
  await settle(page);
}

/**
 * @param {Locator} field
 * @param {Locator} options
 * @param {string} activeId
 */
async function expectActiveOption(field, options, activeId) {
  await expect(field).toHaveAttribute("aria-activedescendant", activeId);
  await expect(options.and(field.page().locator(`[id="${activeId}"]`))).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(options.and(field.page().locator('[aria-selected="true"]'))).toHaveCount(1);
}

/**
 * @param {Page} page
 * @returns {Promise<Array<{ kind: string, code: string }>>}
 */
async function readShownUnits(page) {
  return resultsList(page)
    .getByRole("option")
    .evaluateAll((elements) =>
      elements.map((item) => ({
        kind: String(item.getAttribute("data-kind")),
        code: String(item.getAttribute("data-code")),
      })),
    );
}

/**
 * The swatch carries the band and paints it with the legend color of that band.
 *
 * @param {Locator} option
 * @param {number} band
 */
async function expectSwatchBand(option, band) {
  const swatch = option.locator(".search-swatch");
  await expect(swatch).toHaveAttribute("data-band", String(band));
  const colors = await swatch.evaluate((element, bandIndex) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = `var(--heat-${bandIndex + 1})`;
    document.body.append(probe);
    const legendColor = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { swatchColor: getComputedStyle(element).backgroundColor, legendColor };
  }, band);
  expect(colors.swatchColor).toBe(colors.legendColor);
}

/**
 * Opens the page at the viewport, fills the window with the longest list and checks it is whole.
 *
 * @param {Browser} browser
 * @param {{ width: number, height: number }} viewport
 */
async function expectWindowInsideColumn(browser, viewport) {
  const { context, page, consoleProblems } = await openPage(browser, { viewport });
  try {
    await searchField(page).fill("sa");
    const windowElement = page.locator("#city-search-window");
    await expect(windowElement).toBeVisible();
    const windowBox = await readBox(windowElement);
    const fieldBox = await readBox(searchField(page));
    const columnBox = await readBox(page.locator("#sidebar"));
    const toggleBox = await readBox(page.locator("#sidebar-toggle"));

    expect(windowBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height);
    expect(windowBox.y).toBeLessThanOrEqual(fieldBox.y + fieldBox.height + 12);
    expect(windowBox.x).toBeCloseTo(fieldBox.x, 0);
    expect(windowBox.x + windowBox.width).toBeCloseTo(fieldBox.x + fieldBox.width, 0);
    expect(windowBox.x + windowBox.width).toBeLessThanOrEqual(columnBox.x + columnBox.width);
    expect(windowBox.y + windowBox.height).toBeLessThanOrEqual(viewport.height);
    expect(boxesOverlap(windowBox, toggleBox)).toBe(false);

    const footerBox = await readBox(page.locator(".search-shortcuts"));
    expect(await readWindowAt(page, centerOf(footerBox))).toBe(true);
    const bottomEdge = {
      x: windowBox.x + windowBox.width / 2,
      y: windowBox.y + windowBox.height - 2,
    };
    expect(await readWindowAt(page, bottomEdge)).toBe(true);
    expect(await readTopElementId(page, centerOf(toggleBox))).toBe("sidebar-toggle");
    expect(consoleProblems).toEqual([]);
  } finally {
    await context.close();
  }
}

/**
 * Whether a click at the point reaches the search window, so nothing covers or cuts it there.
 *
 * @param {Page} page
 * @param {{ x: number, y: number }} point
 * @returns {Promise<boolean>}
 */
async function readWindowAt(page, point) {
  return page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return Boolean(element?.closest("#city-search-window"));
  }, point);
}

/**
 * @param {Page} page
 * @param {{ x: number, y: number }} point
 * @returns {Promise<string | null>}
 */
async function readTopElementId(page, point) {
  return page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest("[id]")?.id ?? null;
  }, point);
}

/**
 * @param {Page} page
 * @returns {Promise<{ breaks: number[] }>}
 */
async function readLegend(page) {
  return page.evaluate(() => /** @type {any} */ (window).mapInspector.readLegend());
}

/**
 * @param {Locator} locator
 * @returns {Promise<Box>}
 */
async function readBox(locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return /** @type {Box} */ (box);
}

/**
 * @param {Box} first
 * @param {Box} second
 * @returns {boolean}
 */
function boxesOverlap(first, second) {
  const isApartHorizontally =
    first.x + first.width <= second.x || second.x + second.width <= first.x;
  const isApartVertically =
    first.y + first.height <= second.y || second.y + second.height <= first.y;
  return !isApartHorizontally && !isApartVertically;
}

/**
 * @param {Box} box
 * @returns {{ x: number, y: number }}
 */
function centerOf(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Written from SEL-02, apart from the domain: every municipality and region whose name holds the
 * query, ignoring accents, case and repeated spaces.
 *
 * @param {string} query
 * @returns {SearchUnit[]}
 */
function countMatches(query) {
  const needle = foldName(query);
  const municipalities = MUNICIPALITIES.filter((record) => foldName(record.name).includes(needle));
  const regions = REGIONS.filter((region) => foldName(region.label).includes(needle));
  return [
    ...municipalities.map((record) => municipalityUnit(record.name)),
    ...regions.map((region) => regionUnit(region.label)),
    ...GOVERNMENT_REGIONS.filter((region) => foldName(region.label).includes(needle)).map(
      (region) => ({
        kind: /** @type {const} */ ("governmentRegion"),
        code: region.code,
        name: region.label,
        codes: MUNICIPALITIES.filter((record) => record.governmentRegionCode === region.code).map(
          (record) => record.code,
        ),
      }),
    ),
  ];
}

/**
 * @param {string} text
 * @returns {string}
 */
function foldName(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {number} count
 * @returns {string}
 */
function describeFoundCount(count) {
  if (count === 1) {
    return "1 encontrado";
  }
  return `${count} encontrados`;
}

/**
 * @param {{ kind: string, code: string }} unit
 * @returns {number}
 */
function populationOf(unit) {
  const codes = unitCodes(unit);
  return Number(aggregateValue(INDICATORS.population, codes));
}

/**
 * @param {{ kind: string, code: string }} unit
 * @returns {string[]}
 */
function unitCodes(unit) {
  if (unit.kind === "region") {
    return MUNICIPALITIES.filter((record) => record.regionCode === unit.code).map(
      (record) => record.code,
    );
  }
  if (unit.kind === "governmentRegion")
    return MUNICIPALITIES.filter((record) => record.governmentRegionCode === unit.code).map(
      (record) => record.code,
    );
  return [unit.code];
}

/**
 * @param {import("../../domain/indicator.js").IndicatorDefinition} indicator
 * @param {readonly string[]} codes
 * @returns {number | null}
 */
function aggregateValue(indicator, codes) {
  const records = MUNICIPALITIES.filter((record) => codes.includes(record.code));
  return aggregateIndicator(indicator, records).value;
}

/**
 * @param {import("../../domain/indicator.js").IndicatorDefinition} indicator
 * @returns {Array<{ code: string, name: string, value: number | null }>}
 */
function municipalityStandings(indicator) {
  return MUNICIPALITIES.map((record) => ({
    code: record.code,
    name: record.name,
    value: aggregateValue(indicator, [record.code]),
  }));
}

/**
 * @param {import("../../domain/indicator.js").IndicatorDefinition} indicator
 * @returns {Array<{ code: string, name: string, value: number | null }>}
 */
function regionStandings(indicator) {
  return REGIONS.map((region) => ({
    code: region.code,
    name: region.label,
    value: aggregateValue(indicator, regionUnit(region.label).codes),
  }));
}

/**
 * Position by decreasing value, ties broken by name in pt-BR.
 *
 * @param {Array<{ code: string, name: string, value: number | null }>} entries
 * @param {string} code
 * @returns {number}
 */
function positionAmong(entries, code) {
  const ranked = entries
    .filter((entry) => entry.value !== null)
    .sort((left, right) => {
      const difference = Number(right.value) - Number(left.value);
      if (difference !== 0) {
        return difference;
      }
      return left.name.localeCompare(right.name, "pt-BR");
    });
  return ranked.findIndex((entry) => entry.code === code) + 1;
}

/**
 * @param {SearchUnit} unit
 * @returns {string}
 */
function regionLabelOf(unit) {
  const record = MUNICIPALITIES.find((municipality) => municipality.code === unit.code);
  const region = REGIONS.find((candidate) => candidate.code === record?.regionCode);
  return region?.label ?? "";
}

/**
 * @param {string} name
 * @returns {SearchUnit}
 */
function municipalityUnit(name) {
  const record = MUNICIPALITIES.find((municipality) => municipality.name === name);
  if (!record) {
    throw new Error(`Municipality ${name} is missing from data/municipalities.json`);
  }
  return { kind: "municipality", code: record.code, name: record.name, codes: [record.code] };
}

/**
 * @param {string} label
 * @returns {SearchUnit}
 */
function regionUnit(label) {
  const region = REGIONS.find((candidate) => candidate.label === label);
  if (!region) {
    throw new Error(`Region ${label} is missing from data/regions.json`);
  }
  const codes = MUNICIPALITIES.filter((record) => record.regionCode === region.code).map(
    (record) => record.code,
  );
  return { kind: "region", code: region.code, name: region.label, codes };
}

/**
 * @param {string} path
 */
function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
