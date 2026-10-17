import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  clickUnit,
  findScreenPoint,
  inspect,
  readCamera,
  readSelection,
  readState,
} from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";
import { aggregateIndicator } from "../../domain/aggregation.js";
import { classify } from "../../domain/classification.js";
import { INDICATORS } from "../../domain/indicator.js";
import { SYNTHETIC_INDICATOR } from "../../domain/synthetic.js";

/**
 * @typedef {import("@playwright/test").Page} Page
 * @typedef {import("@playwright/test").Locator} Locator
 * @typedef {import("../../domain/indicator.js").IndicatorDefinition} IndicatorDefinition
 * @typedef {{ code: string, name: string, regionCode: string, population: number, areaKm2: number, gdpThousandBrl: number }} MunicipalityRecord
 * @typedef {{ code: string, label: string }} RegionRecord
 * @typedef {{ code: string, name: string, codes: string[] }} ComparedUnit
 * @typedef {{ name: string, value: number | null }} NamedValue
 * @typedef {{ x: number, y: number, width: number, height: number }} Box
 */

const VIEWPORT_1280_900 = { width: 1280, height: 900 };
const STAGE_GUTTER_PX = 16;
const COMPARED_INDICATORS = [
  INDICATORS.population,
  INDICATORS.density,
  INDICATORS.gdpPerCapita,
  INDICATORS.area,
];

/** @type {MunicipalityRecord[]} */
const MUNICIPALITIES = readJson("data/municipalities.json").municipalities;
/** @type {RegionRecord[]} */
const REGIONS = readJson("data/regions.json").regions;

const GUARULHOS = municipalityUnit("Guarulhos");
const PIRACICABA = municipalityUnit("Piracicaba");
const OSASCO = municipalityUnit("Osasco");
const SAO_JOSE_DO_RIO_PRETO = municipalityUnit("São José do Rio Preto");
const RA_REGISTRO = regionUnit("RA Registro");
const RA_SANTOS = regionUnit("RA Santos");

test.describe("SEL comparison panel (SEL-11 to SEL-13)", () => {
  test("SEL-11 the panel shows only with exactly two panel units, a whole region counting as one", async ({
    browser,
  }) => {
    const { context, page, consoleProblems } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
    });
    try {
      await expect(page.locator("#compare-dock")).toBeHidden();

      await chooseInSearch(page, GUARULHOS.name);
      await expect(page.locator("#compare-dock")).toBeHidden();

      await chooseInSearch(page, PIRACICABA.name);
      await expect(comparisonRegion(page, "Comparativo de Municípios")).toBeVisible();

      await chooseInSearch(page, OSASCO.name);
      await expect(page.locator("#compare-dock")).toBeHidden();

      await removeFromSelection(page, OSASCO);
      await expect(comparisonRegion(page, "Comparativo de Municípios")).toBeVisible();

      await removeFromSelection(page, GUARULHOS);
      await chooseInSearch(page, RA_REGISTRO.name);
      await expect(comparisonRegion(page, "Comparativo")).toBeVisible();
      await expect(sideName(page, "a")).toHaveText(PIRACICABA.name);
      await expect(sideName(page, "b")).toHaveText(RA_REGISTRO.name);

      await removeFromSelection(page, PIRACICABA);
      await chooseInSearch(page, RA_SANTOS.name);
      await expect(comparisonRegion(page, "Comparativo de Regiões")).toBeVisible();
      expect(consoleProblems).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("SEL-11 each side shows its state position, region or municipality count, band color and value with unit", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await chooseInSearch(page, GUARULHOS.name);
      await chooseInSearch(page, RA_REGISTRO.name);
      const indicator = INDICATORS.population;
      const legend = await readLegend(page);

      const guarulhosValue = aggregateValue(indicator, GUARULHOS.codes);
      const sideA = page.locator('.compare-side[data-side="a"]');
      await expect(sideName(page, "a")).toHaveText(GUARULHOS.name);
      await expect(sideA.locator(".compare-rank")).toHaveText(
        `#${municipalityPosition(indicator, GUARULHOS)} no Estado`,
      );
      await expect(sideA.locator(".compare-context")).toHaveText(regionLabelOf(GUARULHOS));
      await expect(sideA.locator(".compare-side-value")).toHaveText(
        `${indicator.format(guarulhosValue)} ${indicator.unit}`,
      );
      const guarulhosBand = classify(guarulhosValue, legend.breaks);
      expect((await inspect(page, GUARULHOS.code)).classIndex).toBe(guarulhosBand);
      await expectSwatchBand(page, "a", guarulhosBand);

      const registroValue = aggregateValue(indicator, RA_REGISTRO.codes);
      const sideB = page.locator('.compare-side[data-side="b"]');
      await expect(sideName(page, "b")).toHaveText(RA_REGISTRO.name);
      await expect(sideB.locator(".compare-rank")).toHaveText(
        `#${regionPosition(indicator, RA_REGISTRO)} no Estado`,
      );
      await expect(sideB.locator(".compare-context")).toHaveText(
        `${RA_REGISTRO.codes.length} municípios`,
      );
      await expect(sideB.locator(".compare-side-value")).toHaveText(
        `${indicator.format(registroValue)} ${indicator.unit}`,
      );
      await expectSwatchBand(page, "b", classify(registroValue, legend.breaks));
    } finally {
      await context.close();
    }
  });

  test("SEL-12 population, density, GDP per capita and area come from the domain aggregation over each unit", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await chooseInSearch(page, RA_REGISTRO.name);
      await chooseInSearch(page, PIRACICABA.name);
      await expect(comparisonRegion(page, "Comparativo")).toBeVisible();

      const labels = await page.locator("#compare-panel .compare-metric-label").allTextContents();
      expect(labels.map((label) => label.trim())).toEqual(
        COMPARED_INDICATORS.map(describeMetricLabel),
      );

      for (const indicator of COMPARED_INDICATORS) {
        const metric = page.locator(
          `#compare-panel .compare-metric[data-metric="${indicator.id}"]`,
        );
        const registro = {
          name: RA_REGISTRO.name,
          value: aggregateValue(indicator, RA_REGISTRO.codes),
        };
        const piracicaba = {
          name: PIRACICABA.name,
          value: aggregateValue(indicator, PIRACICABA.codes),
        };
        await expect(metricValue(metric, "a")).toHaveText(indicator.format(registro.value));
        await expect(metricValue(metric, "b")).toHaveText(indicator.format(piracicaba.value));
        await expect(metric.locator(".compare-metric-diff")).toHaveText(
          describeExpectedDifference(registro, piracicaba),
        );
      }
    } finally {
      await context.close();
    }
  });

  test("SEL-12 with the demo on only the synthetic value is compared", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await chooseInSearch(page, GUARULHOS.name);
      await chooseInSearch(page, PIRACICABA.name);
      await turnDemoOn(page);

      const metrics = page.locator("#compare-panel .compare-metric");
      await expect(metrics).toHaveCount(1);
      const metric = metrics.first();
      await expect(metric.locator(".compare-metric-label")).toHaveText(
        describeMetricLabel(SYNTHETIC_INDICATOR),
      );

      const guarulhos = {
        name: GUARULHOS.name,
        value: (await inspect(page, GUARULHOS.code)).value,
      };
      const piracicaba = {
        name: PIRACICABA.name,
        value: (await inspect(page, PIRACICABA.code)).value,
      };
      await expect(metricValue(metric, "a")).toHaveText(
        SYNTHETIC_INDICATOR.format(guarulhos.value),
      );
      await expect(metricValue(metric, "b")).toHaveText(
        SYNTHETIC_INDICATOR.format(piracicaba.value),
      );
      await expect(metric.locator(".compare-metric-diff")).toHaveText(
        describeExpectedDifference(guarulhos, piracicaba),
      );
      await expect(page.locator('.compare-side[data-side="a"] .compare-side-value')).toHaveText(
        `${SYNTHETIC_INDICATOR.format(guarulhos.value)} ${SYNTHETIC_INDICATOR.unit}`,
      );
    } finally {
      await context.close();
    }
  });

  test("SEL-13 Inverter posições swaps A and B in the panel without changing readSelection()", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await chooseInSearch(page, GUARULHOS.name);
      await chooseInSearch(page, PIRACICABA.name);
      const selectionBefore = await readSelection(page);
      const population = page.locator('#compare-panel .compare-metric[data-metric="population"]');

      await page.getByRole("button", { name: "Inverter posições" }).click();
      await expect(sideName(page, "a")).toHaveText(PIRACICABA.name);
      await expect(sideName(page, "b")).toHaveText(GUARULHOS.name);
      await expect(metricValue(population, "a")).toHaveText(
        INDICATORS.population.format(aggregateValue(INDICATORS.population, PIRACICABA.codes)),
      );
      expect(await readSelection(page)).toEqual(selectionBefore);

      await page.getByRole("button", { name: "Inverter posições" }).click();
      await expect(sideName(page, "a")).toHaveText(GUARULHOS.name);
      expect(await readSelection(page)).toEqual(selectionBefore);
    } finally {
      await context.close();
    }
  });

  test("SEL-13 Minimizar collapses the panel into a button that reopens it, and a new pair reopens it", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await chooseInSearch(page, GUARULHOS.name);
      await chooseInSearch(page, PIRACICABA.name);
      const panel = page.locator("#compare-panel");
      const reopenButton = page.getByRole("button", { name: "Reabrir comparativo" });

      await page.getByRole("button", { name: "Minimizar" }).click();
      await expect(panel).toBeHidden();
      await expect(reopenButton).toBeFocused();

      await reopenButton.click();
      await expect(panel).toBeVisible();
      await expect(reopenButton).toBeHidden();
      await expect(page.getByRole("button", { name: "Minimizar" })).toBeFocused();

      await page.getByRole("button", { name: "Minimizar" }).click();
      await expect(panel).toBeHidden();
      await removeFromSelection(page, PIRACICABA);
      await chooseInSearch(page, OSASCO.name);
      await expect(panel).toBeVisible();
      await expect(sideName(page, "b")).toHaveText(OSASCO.name);
    } finally {
      await context.close();
    }
  });

  test("SEL-13 Focar no relevo frames both units even with automatic framing off", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await setFraming(page, false);
      const homeCamera = await readCamera(page);
      await chooseInSearch(page, GUARULHOS.name);
      await chooseInSearch(page, PIRACICABA.name);
      expect(await readCamera(page)).toEqual(homeCamera);

      await page.getByRole("button", { name: "Focar no relevo" }).click();
      await settle(page);
      const focusedCamera = await readCamera(page);
      expect(focusedCamera.zoomTarget).toBeGreaterThan(homeCamera.zoomTarget);
      expect((await readState(page)).settings.isFramingOn).toBe(false);

      await page.locator("#zoom-reset").click();
      await settle(page);
      await setFraming(page, true);
      const automaticCamera = await readCamera(page);
      expect(automaticCamera.zoomTarget).toBe(focusedCamera.zoomTarget);
      expect(automaticCamera.panX).toBeCloseTo(focusedCamera.panX, 3);
      expect(automaticCamera.panY).toBeCloseTo(focusedCamera.panY, 3);
    } finally {
      await context.close();
    }
  });

  test("SEL-13 Focar no relevo leaves automatic framing off for the next selection change", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await setFraming(page, false);
      await chooseInSearch(page, GUARULHOS.name);
      await chooseInSearch(page, PIRACICABA.name);
      await page.getByRole("button", { name: "Focar no relevo" }).click();
      await settle(page);
      const focusedCamera = await readCamera(page);

      await removeFromSelection(page, PIRACICABA);
      expect(await readCamera(page)).toEqual(focusedCamera);
    } finally {
      await context.close();
    }
  });

  test("SEL-13 Trocar B removes B from the selection, focuses the search, and the next unit chosen becomes B", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await chooseInSearch(page, GUARULHOS.name);
      await chooseInSearch(page, PIRACICABA.name);

      await page.getByRole("button", { name: "Trocar B" }).click();
      await settle(page);
      expect(await readSelection(page)).toEqual(GUARULHOS.codes);
      await expect(page.locator("#city-search")).toBeFocused();
      await expect(page.locator("#compare-dock")).toBeHidden();

      await page.keyboard.type(OSASCO.name);
      await page.keyboard.press("Enter");
      await settle(page);
      await expect(sideName(page, "a")).toHaveText(GUARULHOS.name);
      await expect(sideName(page, "b")).toHaveText(OSASCO.name);

      await page.getByRole("button", { name: "Inverter posições" }).click();
      await page.getByRole("button", { name: "Trocar B" }).click();
      await settle(page);
      expect(await readSelection(page)).toEqual(OSASCO.codes);
    } finally {
      await context.close();
    }
  });

  test("SEL-11 the panel sits at the bottom right of the stage, clear of the zoom buttons, and map clicks outside it still reach the map", async ({
    browser,
  }) => {
    const { context, page, consoleProblems } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
    });
    try {
      await setFraming(page, false);
      await chooseInSearch(page, GUARULHOS.name);
      await chooseInSearch(page, PIRACICABA.name);
      await waitForAnimations(page.locator("#compare-panel"));
      const panelBox = await readBox(page.locator("#compare-panel"));
      const stageBox = await readBox(page.locator("#map-stage"));

      expect(stageBox.x + stageBox.width - (panelBox.x + panelBox.width)).toBeCloseTo(
        STAGE_GUTTER_PX,
        0,
      );
      expect(stageBox.y + stageBox.height - (panelBox.y + panelBox.height)).toBeCloseTo(
        STAGE_GUTTER_PX,
        0,
      );
      for (const zoomButtonId of ["zoom-in", "zoom-out", "zoom-reset"]) {
        const zoomButtonBox = await readBox(page.locator(`#${zoomButtonId}`));
        expect(boxesOverlap(panelBox, zoomButtonBox)).toBe(false);
        expect(await readTopElementId(page, centerOf(zoomButtonBox))).toBe(zoomButtonId);
      }

      const besidePanel = { x: panelBox.x - 4, y: panelBox.y + panelBox.height / 2 };
      expect(await readTopElementId(page, besidePanel)).toBe("map-canvas");

      const outsidePoint = await findScreenPoint(page, SAO_JOSE_DO_RIO_PRETO.code);
      expect(outsidePoint).not.toBeNull();
      expect(isInside(/** @type {{ x: number, y: number }} */ (outsidePoint), panelBox)).toBe(
        false,
      );
      await clickUnit(page, SAO_JOSE_DO_RIO_PRETO.code);
      expect(await readSelection(page)).toContain(SAO_JOSE_DO_RIO_PRETO.code);
      await expect(page.locator("#compare-dock")).toBeHidden();
      expect(consoleProblems).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("SEL-13 the minimized panel lets map clicks through where the panel was", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await chooseInSearch(page, GUARULHOS.name);
      await chooseInSearch(page, PIRACICABA.name);
      const panelBox = await readBox(page.locator("#compare-panel"));

      await page.getByRole("button", { name: "Minimizar" }).click();
      const formerPanelCenter = { x: panelBox.x + panelBox.width / 2, y: panelBox.y + 40 };
      expect(await readTopElementId(page, formerPanelCenter)).toBe("map-canvas");
    } finally {
      await context.close();
    }
  });
});

/**
 * Picks a unit the way a person does: types its name in the search field and presses Enter.
 *
 * @param {Page} page
 * @param {string} name
 */
async function chooseInSearch(page, name) {
  const searchInput = page.locator("#city-search");
  await searchInput.fill(name);
  await searchInput.press("Enter");
  await settle(page);
}

/**
 * @param {Page} page
 * @param {ComparedUnit} unit
 */
async function removeFromSelection(page, unit) {
  await page.getByRole("button", { name: `Tirar ${unit.name} da seleção` }).click();
  await settle(page);
}

/**
 * @param {Page} page
 * @param {string} title
 * @returns {Locator}
 */
function comparisonRegion(page, title) {
  return page.getByRole("region", { name: title, exact: true });
}

/**
 * @param {Page} page
 * @param {"a" | "b"} side
 * @returns {Locator}
 */
function sideName(page, side) {
  return page.locator(`.compare-side[data-side="${side}"]`).getByRole("heading", { level: 3 });
}

/**
 * @param {Locator} metric
 * @param {"a" | "b"} side
 * @returns {Locator}
 */
function metricValue(metric, side) {
  return metric.locator(`.compare-metric-value[data-side="${side}"]`);
}

/**
 * The swatch carries the band and paints it with the legend color of that band.
 *
 * @param {Page} page
 * @param {"a" | "b"} side
 * @param {number} band
 */
async function expectSwatchBand(page, side, band) {
  const swatch = page.locator(`.compare-side[data-side="${side}"] .compare-swatch`);
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
 * @param {Page} page
 * @returns {Promise<{ breaks: number[] }>}
 */
async function readLegend(page) {
  return page.evaluate(() => /** @type {any} */ (window).mapInspector.readLegend());
}

/**
 * @param {Page} page
 */
async function turnDemoOn(page) {
  await page.locator("#settings-toggle").click();
  await page.locator("#demo-active-toggle").check();
  await expect.poll(async () => (await readState(page)).demo.isActive).toBe(true);
  await settle(page);
}

/**
 * @param {Page} page
 * @param {boolean} isFramingOn
 */
async function setFraming(page, isFramingOn) {
  await page.evaluate((value) => {
    const store = /** @type {any} */ (window).__appStore;
    store.dispatch({ type: "settings/changed", name: "isFramingOn", value });
  }, isFramingOn);
  await settle(page);
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
 * Waits for the entrance animation, which moves the panel by 8px while it runs.
 * @param {import("@playwright/test").Locator} locator
 */
async function waitForAnimations(locator) {
  await locator.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
}

/**
 * The id of the element a click at the point would reach, or of its nearest ancestor with one.
 *
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
 * @param {{ x: number, y: number }} point
 * @param {Box} box
 * @returns {boolean}
 */
function isInside(point, box) {
  const isWithinX = point.x >= box.x && point.x <= box.x + box.width;
  const isWithinY = point.y >= box.y && point.y <= box.y + box.height;
  return isWithinX && isWithinY;
}

/**
 * @param {Box} box
 * @returns {{ x: number, y: number }}
 */
function centerOf(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * The label the panel shows: the indicator name, then its unit when the values do not carry it.
 *
 * @param {Pick<IndicatorDefinition, "label" | "unit" | "format">} indicator
 * @returns {string}
 */
function describeMetricLabel(indicator) {
  const sampleText = indicator.format(1);
  if (sampleText.includes(indicator.unit)) {
    return indicator.label;
  }
  return `${indicator.label} ${indicator.unit}`;
}

/**
 * Written from SEL-12, apart from the domain: "+N,N% <larger name>", "Iguais" or "Sem dado".
 *
 * @param {NamedValue} first
 * @param {NamedValue} second
 * @returns {string}
 */
function describeExpectedDifference(first, second) {
  if (first.value === null || second.value === null) {
    return "Sem dado";
  }
  if (first.value === second.value) {
    return "Iguais";
  }
  const [larger, smaller] = [first, second].sort(
    (left, right) => Number(right.value) - Number(left.value),
  );
  if (Number(smaller.value) <= 0) {
    return "Sem dado";
  }
  const percent = (Number(larger.value) / Number(smaller.value) - 1) * 100;
  const percentText = percent.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `+${percentText}% ${larger.name}`;
}

/**
 * @param {IndicatorDefinition} indicator
 * @param {readonly string[]} codes
 * @returns {number | null}
 */
function aggregateValue(indicator, codes) {
  const records = MUNICIPALITIES.filter((record) => codes.includes(record.code));
  return aggregateIndicator(indicator, records).value;
}

/**
 * Position among the 645 municipalities: decreasing value, ties broken by name.
 *
 * @param {IndicatorDefinition} indicator
 * @param {ComparedUnit} unit
 * @returns {number}
 */
function municipalityPosition(indicator, unit) {
  const entries = MUNICIPALITIES.map((record) => ({
    code: record.code,
    name: record.name,
    value: aggregateValue(indicator, [record.code]),
  }));
  return readPosition(entries, unit.code);
}

/**
 * Position among the 16 administrative regions: decreasing value, ties broken by name.
 *
 * @param {IndicatorDefinition} indicator
 * @param {ComparedUnit} unit
 * @returns {number}
 */
function regionPosition(indicator, unit) {
  const entries = REGIONS.map((region) => ({
    code: region.code,
    name: region.label,
    value: aggregateValue(indicator, regionUnit(region.label).codes),
  }));
  return readPosition(entries, unit.code);
}

/**
 * @param {Array<{ code: string, name: string, value: number | null }>} entries
 * @param {string} code
 * @returns {number}
 */
function readPosition(entries, code) {
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
 * @param {ComparedUnit} unit
 * @returns {string}
 */
function regionLabelOf(unit) {
  const record = MUNICIPALITIES.find((municipality) => municipality.code === unit.code);
  const region = REGIONS.find((candidate) => candidate.code === record?.regionCode);
  return region?.label ?? "";
}

/**
 * @param {string} name
 * @returns {ComparedUnit}
 */
function municipalityUnit(name) {
  const record = MUNICIPALITIES.find((municipality) => municipality.name === name);
  if (!record) {
    throw new Error(`Municipality ${name} is missing from data/municipalities.json`);
  }
  return { code: record.code, name: record.name, codes: [record.code] };
}

/**
 * @param {string} label
 * @returns {ComparedUnit}
 */
function regionUnit(label) {
  const region = REGIONS.find((candidate) => candidate.label === label);
  if (!region) {
    throw new Error(`Region ${label} is missing from data/regions.json`);
  }
  const codes = MUNICIPALITIES.filter((record) => record.regionCode === region.code).map(
    (record) => record.code,
  );
  return { code: region.code, name: region.label, codes };
}

/**
 * @param {string} path
 */
function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
