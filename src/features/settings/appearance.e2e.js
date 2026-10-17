import { expect, test } from "@playwright/test";
import { inspect, readState } from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };
const VIEWPORT_1366_768 = { width: 1366, height: 768 };
const SAO_PAULO_CODE = "3550308";
const CAMPINAS_CODE = "3509502";
const HEAT_BAND_COUNT = 7;
const CARD_GAP_PX = 8;
const FLAT_HEIGHT = 1;
const EN_DASH_CODE_POINT = 0x2013;
const EM_DASH_CODE_POINT = 0x2014;
const FORBIDDEN_DASHES = [
  String.fromCodePoint(EN_DASH_CODE_POINT),
  String.fromCodePoint(EM_DASH_CODE_POINT),
];

/**
 * @typedef {import("@playwright/test").Page} Page
 * @typedef {{ count: number, lowest: number, highest: number }} BandHeights
 * @typedef {{ blockTop: number, lowestBorder: number, highestBorder: number }} BorderTop
 * @typedef {{
 *   code: string,
 *   before: number,
 *   target: number,
 *   firstFrame: number,
 *   border: BorderTop
 * }} FirstFrameReading
 */

test.describe("LAY-10 color and height cards in the column", () => {
  test("LAY-10 color and height are two fieldsets of option cards right after Ver por", async ({
    browser,
  }) => {
    const { context, page, consoleProblems } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
    });
    try {
      const colorGroup = findGroupByRadioName(page, "color-mode");
      await expect(colorGroup.locator("legend")).toHaveText("Cor do mapa");
      await expect(colorGroup.locator(".appearance-card-name")).toHaveText([
        "Mapa de calor",
        "Destaque",
      ]);
      await expect(colorGroup.locator(".appearance-card-note")).toHaveText([
        "7 faixas",
        "Só a seleção",
      ]);
      expect(await readRadioValues(colorGroup)).toEqual(["heat", "selection"]);

      const heightGroup = findGroupByRadioName(page, "height-mode");
      await expect(heightGroup.locator("legend")).toHaveText("Altura (eixo Z)");
      await expect(heightGroup.locator(".appearance-card-name")).toHaveText([
        "Plana",
        "Degrau",
        "Proporcional",
      ]);
      await expect(heightGroup.locator(".appearance-card-note")).toHaveText([
        "Igual",
        "Por faixa",
        "Pelo valor",
      ]);
      expect(await readRadioValues(heightGroup)).toEqual(["flat", "step", "data"]);
      await expect(heightGroup.locator("#appearance-exaggeration")).toHaveCount(1);

      const levelBox = await readBox(page, "#level-container");
      const colorBox = await readBox(page, ".appearance-group-color");
      const heightBox = await readBox(page, ".appearance-group-height");
      const bandFilterBox = await readBox(page, "#class-filter");
      expect(colorBox.y).toBeGreaterThanOrEqual(levelBox.y + levelBox.height);
      expect(heightBox.y).toBeGreaterThanOrEqual(colorBox.y + colorBox.height);
      expect(bandFilterBox.y).toBeGreaterThanOrEqual(heightBox.y + heightBox.height);

      expectCardsInOneRow(await readCardBoxes(colorGroup), 2);
      expectCardsInOneRow(await readCardBoxes(heightGroup), 3);

      const markedLook = await page.evaluate(readMarkedLook);
      expect(markedLook.markedCard).toEqual(markedLook.activeIndicator);
      expect(markedLook.restingCard.background).not.toBe(markedLook.markedCard.background);

      const axisLook = await page.evaluate(readAxisLook);
      expect(axisLook.text).toBe("(eixo Z)");
      expect(axisLook.actual).toEqual(axisLook.expected);

      expect(consoleProblems).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("LAY-10 the native radio stays hidden, arrows move inside the group and focus shows on the card", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const radioOpacities = await page
        .locator(".appearance-card > input[type='radio']")
        .evaluateAll((inputs) => inputs.map((input) => getComputedStyle(input).opacity));
      expect(radioOpacities).toEqual(["0", "0", "0", "0", "0"]);

      await page.locator("#appearance-color-heat").focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.locator("#appearance-color-selection")).toBeFocused();
      await expect(page.locator("#appearance-color-selection")).toBeChecked();
      expect((await readState(page)).settings.colorMode).toBe("selection");

      const focusedOutline = await readOutline(page, "#appearance-color-selection");
      expect(focusedOutline).toEqual({ style: "solid", width: "2px" });
      const restingOutline = await readOutline(page, "#appearance-color-heat");
      expect(restingOutline.style).toBe("none");

      await page.keyboard.press("ArrowRight");
      await expect(page.locator("#appearance-color-heat")).toBeFocused();
      await expect(page.locator("#appearance-color-heat")).toBeChecked();

      await page.locator("#appearance-height-data").focus();
      await page.keyboard.press("ArrowLeft");
      await expect(page.locator("#appearance-height-step")).toBeFocused();
      await expect(page.locator("#appearance-height-step")).toBeChecked();
      expect((await readState(page)).settings.heightMode).toBe("step");

      await page.keyboard.press("ArrowLeft");
      await expect(page.locator("#appearance-height-flat")).toBeChecked();
      await page.keyboard.press("ArrowLeft");
      await expect(page.locator("#appearance-height-data")).toBeFocused();
      await expect(page.locator("#appearance-height-data")).toBeChecked();
      expect((await readState(page)).settings.heightMode).toBe("data");
    } finally {
      await context.close();
    }
  });

  test("LAY-10 no card cuts its text or scrolls the column sideways in 1280x900 and 1366x768", async ({
    browser,
  }) => {
    for (const viewport of [VIEWPORT_1280_900, VIEWPORT_1366_768]) {
      const { context, page } = await openPage(browser, { viewport });
      try {
        const fit = await page.evaluate(readCardFit);
        const size = `${viewport.width}x${viewport.height}`;
        expect(fit.cardCount, size).toBe(5);
        expect(fit.columnOverflow, size).toBeLessThanOrEqual(0);
        expect(fit.clippedTexts, size).toEqual([]);
        expect(fit.cardsPastColumn, size).toEqual([]);
      } finally {
        await context.close();
      }
    }
  });
});

test.describe("CFG-05 height, exaggeration and color in the column", () => {
  test("CFG-05 the column cards are born with proportional height, 0.5x and heat color, autocomplete off", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await expect(page.locator("#appearance-height-data")).toBeChecked();
      await expect(page.locator("#appearance-color-heat")).toBeChecked();

      const exaggeration = page.locator("#appearance-exaggeration");
      await expect(exaggeration).toHaveAttribute("min", "0.4");
      await expect(exaggeration).toHaveAttribute("max", "2");
      await expect(exaggeration).toHaveAttribute("step", "0.1");
      await expect(exaggeration).toHaveValue("0.5");
      await expect(exaggeration).toBeEnabled();
      await expect(page.locator(".appearance-exaggeration output")).toHaveText("0,5x");

      const autocompleteValues = await page
        .locator(".appearance input")
        .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("autocomplete")));
      expect(autocompleteValues).toEqual(["off", "off", "off", "off", "off", "off"]);
    } finally {
      await context.close();
    }
  });

  test("CFG-05 the flat card disables the exaggeration, step and proportional enable it, and Settings no longer repeat them", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const exaggeration = page.locator("#appearance-exaggeration");

      await page.locator("#appearance-height-flat").check();
      await settle(page);
      await expect(exaggeration).toBeDisabled();
      expect((await readState(page)).settings.heightMode).toBe("flat");
      expect((await inspect(page, SAO_PAULO_CODE)).heightTarget).toBe(FLAT_HEIGHT);

      await page.locator("#appearance-height-step").check();
      await settle(page);
      await expect(exaggeration).toBeEnabled();
      expect((await readState(page)).settings.heightMode).toBe("step");

      await page.locator("#appearance-height-data").check();
      await settle(page);
      await expect(exaggeration).toBeEnabled();

      await exaggeration.fill("1");
      await settle(page);
      await expect(page.locator(".appearance-exaggeration output")).toHaveText("1x");
      expect((await readState(page)).settings.exaggeration).toBe(1);

      await page.locator("#settings-toggle").click();
      const panel = page.locator("#settings-panel");
      await expect(panel).toBeVisible();
      await expect(panel.locator("input[type='radio']")).toHaveCount(0);
      await expect(panel.locator("input[type='range']")).toHaveCount(1);
      await expect(page.locator("#height-scale, #height-mode-data, #color-mode-heat")).toHaveCount(
        0,
      );
    } finally {
      await context.close();
    }
  });
});

test.describe("ESC-10 to ESC-12 height and color modes on the page", () => {
  test("ESC-10 on the page the step height depends only on the band and the 7 bands rise in order, in both levels", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      for (const levelId of ["municipality", "region"]) {
        await page.locator(`input[name='level'][value='${levelId}']`).check();
        await page.locator("#appearance-height-data").check();
        await settle(page);
        const proportionalMaximum = await readHighestTarget(page);

        await page.locator("#appearance-height-step").check();
        await settle(page);
        const bands = await readBandHeights(page);

        for (const [bandIndex, band] of bands.entries()) {
          const message = `${levelId}, band ${bandIndex + 1}`;
          expect(band.count, message).toBeGreaterThan(0);
          expect(band.highest, message).toBe(band.lowest);
        }
        const sharedBands = bands.filter((band) => band.count >= 2);
        expect(sharedBands.length, levelId).toBeGreaterThanOrEqual(HEAT_BAND_COUNT - 1);
        for (let bandIndex = 1; bandIndex < bands.length; bandIndex += 1) {
          expect(bands[bandIndex].lowest, levelId).toBeGreaterThan(bands[bandIndex - 1].lowest);
        }
        expect(bands[0].lowest, levelId).toBeGreaterThan(FLAT_HEIGHT);
        expect(bands[HEAT_BAND_COUNT - 1].lowest, levelId).toBeCloseTo(proportionalMaximum, 3);
      }
    } finally {
      await context.close();
    }
  });

  test("ESC-11 the legend height row and the Como ler line follow the height mode, and the row is gone with flat height", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const heightTerm = page.locator(".scale-legend .legend-rows dt").first();
      const heightDescription = page.locator(".scale-legend .legend-rows dd").first();
      const howToReadLine = page.locator(".how-to-read-line.line-height");
      await expect(heightTerm).toHaveText("Altura 3D");

      await expect(heightDescription).toHaveText("relevo proporcional ao valor");
      await expect(heightDescription).toBeVisible();
      await expect(howToReadLine).toContainText("proporcional");
      const proportionalLine = await readLineText(howToReadLine);

      await page.locator("#appearance-height-step").check();
      await expect(heightDescription).toHaveText("um degrau por faixa");
      await expect(heightDescription).toBeVisible();
      await expect(howToReadLine).toContainText("degrau");
      const stepLine = await readLineText(howToReadLine);

      await page.locator("#appearance-height-flat").check();
      await expect(heightTerm).toBeHidden();
      await expect(heightDescription).toBeHidden();
      await expect(howToReadLine).toContainText("igual");
      const flatLine = await readLineText(howToReadLine);

      const lines = [proportionalLine, stepLine, flatLine];
      expect(new Set(lines).size).toBe(3);
      for (const line of lines) {
        expect(line.startsWith("Altura:")).toBe(true);
        expect(FORBIDDEN_DASHES.some((dash) => line.includes(dash))).toBe(false);
      }

      await page.locator("#appearance-height-data").check();
      await expect(heightTerm).toBeVisible();
      await expect(heightDescription).toHaveText("relevo proporcional ao valor");
    } finally {
      await context.close();
    }
  });

  test("ESC-12 changing the color mode repaints without building any geometry", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const statsBefore = await readGeometryStats(page);
      expect(statsBefore.geometryIds.length).toBeGreaterThan(0);
      expect((await inspect(page, SAO_PAULO_CODE)).classIndex).toBeGreaterThan(0);

      await page.locator("#appearance-color-selection").check();
      await settle(page);
      expect((await inspect(page, SAO_PAULO_CODE)).classIndex).toBe(0);
      expect(await readGeometryStats(page)).toEqual(statsBefore);

      await page.locator("#appearance-color-heat").check();
      await settle(page);
      expect((await inspect(page, SAO_PAULO_CODE)).classIndex).toBeGreaterThan(0);
      expect(await readGeometryStats(page)).toEqual(statsBefore);
    } finally {
      await context.close();
    }
  });

  test("ESC-12 changing the height mode eases each block toward its target and the borders follow its top", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const restOffset = await readRestBorderOffset(page, SAO_PAULO_CODE);
      const easing = await readHeightEasing(page);

      const readings = await page.evaluate(switchHeightAndReadFirstFrame, {
        codes: [SAO_PAULO_CODE, CAMPINAS_CODE],
        radioId: "appearance-height-flat",
      });

      for (const reading of readings) {
        expect(reading.target, reading.code).toBe(FLAT_HEIGHT);
        expect(reading.before, reading.code).toBeGreaterThan(reading.target);
        expect(reading.firstFrame, reading.code).toBeGreaterThan(reading.target);
        const easedShare =
          (reading.before - reading.firstFrame) / (reading.before - reading.target);
        expect(easedShare, reading.code).toBeCloseTo(easing, 3);
        expectBordersOnTop(reading.border, restOffset);
      }

      await settle(page);
      for (const code of [SAO_PAULO_CODE, CAMPINAS_CODE]) {
        const unit = await inspect(page, code);
        expect(unit.heightCurrent, code).toBe(unit.heightTarget);
        expectBordersOnTop(await readBorderTop(page, code), restOffset);
      }
    } finally {
      await context.close();
    }
  });

  test("ESC-12 with reduced motion the new height arrives in the first frame", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
      reducedMotion: "reduce",
    });
    try {
      const restOffset = await readRestBorderOffset(page, SAO_PAULO_CODE);

      const readings = await page.evaluate(switchHeightAndReadFirstFrame, {
        codes: [SAO_PAULO_CODE, CAMPINAS_CODE],
        radioId: "appearance-height-flat",
      });

      for (const reading of readings) {
        expect(reading.before, reading.code).toBeGreaterThan(reading.target);
        expect(reading.firstFrame, reading.code).toBe(reading.target);
        expectBordersOnTop(reading.border, restOffset);
      }
    } finally {
      await context.close();
    }
  });
});

/**
 * @param {Page} page
 * @param {string} radioName
 */
function findGroupByRadioName(page, radioName) {
  return page.locator("fieldset", { has: page.locator(`input[name='${radioName}']`) });
}

/**
 * @param {import("@playwright/test").Locator} group
 * @returns {Promise<string[]>}
 */
async function readRadioValues(group) {
  return group
    .locator(".appearance-card > input[type='radio']")
    .evaluateAll((inputs) => inputs.map((input) => /** @type {HTMLInputElement} */ (input).value));
}

/**
 * @param {Page} page
 * @param {string} selector
 * @returns {Promise<{ x: number, y: number, width: number, height: number }>}
 */
async function readBox(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} has a box`).not.toBeNull();
  if (!box) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return box;
}

/**
 * @param {import("@playwright/test").Locator} group
 * @returns {Promise<Array<{ x: number, y: number, width: number }>>}
 */
async function readCardBoxes(group) {
  return group.locator(".appearance-card").evaluateAll((cards) =>
    cards.map((card) => {
      const box = card.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width };
    }),
  );
}

/**
 * The cards of a group share one row, left to right, with the 8 px gap between neighbors.
 *
 * @param {Array<{ x: number, y: number, width: number }>} boxes
 * @param {number} columnCount
 */
function expectCardsInOneRow(boxes, columnCount) {
  expect(boxes).toHaveLength(columnCount);
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    expect(boxes[index].y).toBeCloseTo(previous.y, 0);
    expect(boxes[index].x - (previous.x + previous.width)).toBeCloseTo(CARD_GAP_PX, 0);
  }
}

/**
 * Runs in the page: the computed look of the marked card, a resting card and the active indicator.
 */
function readMarkedLook() {
  /** @param {string} selector */
  const readLook = (selector) => {
    const style = getComputedStyle(/** @type {Element} */ (document.querySelector(selector)));
    return { background: style.backgroundColor, border: style.borderTopColor };
  };
  return {
    markedCard: readLook("#appearance-color-heat + .appearance-card-body"),
    restingCard: readLook("#appearance-color-selection + .appearance-card-body"),
    activeIndicator: readLook(".indicator-option:has(input:checked)"),
  };
}

/**
 * Runs in the page: the font and color of "(eixo Z)" next to the mono font and the accent token.
 */
function readAxisLook() {
  const axis = /** @type {Element} */ (document.querySelector(".appearance-legend-axis"));
  const probe = document.createElement("span");
  probe.style.fontFamily = "var(--font-mono)";
  probe.style.color = "var(--coral-text)";
  document.body.append(probe);
  const probeStyle = getComputedStyle(probe);
  const expected = { font: probeStyle.fontFamily, color: probeStyle.color };
  probe.remove();

  const axisStyle = getComputedStyle(axis);
  return {
    text: axis.textContent,
    actual: { font: axisStyle.fontFamily, color: axisStyle.color },
    expected,
  };
}

/**
 * @param {Page} page
 * @param {string} radioSelector
 * @returns {Promise<{ style: string, width: string }>} the outline of the card body after the radio.
 */
async function readOutline(page, radioSelector) {
  return page.locator(`${radioSelector} + .appearance-card-body`).evaluate((body) => {
    const style = getComputedStyle(body);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
}

/**
 * Runs in the page: what overflows the column, which card texts are cut and which cards pass the
 * right edge of the column content.
 */
function readCardFit() {
  const column = /** @type {HTMLElement} */ (document.querySelector("#sidebar .sidebar-content"));
  const columnRight = column.getBoundingClientRect().left + column.clientLeft + column.clientWidth;
  const texts = Array.from(
    document.querySelectorAll(
      ".appearance-card-name, .appearance-card-note, .appearance-legend, .appearance-exaggeration",
    ),
  );
  const cards = Array.from(document.querySelectorAll(".appearance-card"));
  return {
    cardCount: cards.length,
    columnOverflow: column.scrollWidth - column.clientWidth,
    clippedTexts: texts
      .filter((element) => element.scrollWidth > element.clientWidth)
      .map((element) => element.textContent),
    cardsPastColumn: cards
      .filter((card) => card.getBoundingClientRect().right > columnRight + 0.5)
      .map((card) => card.textContent),
  };
}

/**
 * @param {Page} page
 * @returns {Promise<number>} the highest height target on the map.
 */
async function readHighestTarget(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    const targets = inspector
      .readCodes()
      .map((/** @type {string} */ code) => inspector.inspect(code).heightTarget);
    return Math.max(...targets);
  });
}

/**
 * @param {Page} page
 * @returns {Promise<BandHeights[]>} the lowest and highest target of the units of each color band.
 */
async function readBandHeights(page) {
  return page.evaluate((bandCount) => {
    const inspector = /** @type {any} */ (window).mapInspector;
    const bands = Array.from({ length: bandCount }, () => ({
      count: 0,
      lowest: Number.POSITIVE_INFINITY,
      highest: Number.NEGATIVE_INFINITY,
    }));
    for (const code of inspector.readCodes()) {
      const unit = inspector.inspect(code);
      const band = bands[unit.classIndex];
      band.count += 1;
      band.lowest = Math.min(band.lowest, unit.heightTarget);
      band.highest = Math.max(band.highest, unit.heightTarget);
    }
    return bands;
  }, HEAT_BAND_COUNT);
}

/**
 * @param {import("@playwright/test").Locator} line
 * @returns {Promise<string>}
 */
async function readLineText(line) {
  const text = await line.textContent();
  return text ?? "";
}

/**
 * @param {Page} page
 * @returns {Promise<{ geometryCount: number, vertexCount: number, geometryIds: number[] }>}
 */
async function readGeometryStats(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readGeometryStats();
  });
}

/**
 * @param {Page} page
 * @param {string} code
 * @returns {Promise<BorderTop>}
 */
async function readBorderTop(page, code) {
  return page.evaluate((unitCode) => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readBorderTop(unitCode);
  }, code);
}

/**
 * At rest every border vertex of a block sits one same offset above its top.
 *
 * @param {Page} page
 * @param {string} code
 * @returns {Promise<number>}
 */
async function readRestBorderOffset(page, code) {
  const border = await readBorderTop(page, code);
  expect(border).not.toBeNull();
  const restOffset = border.lowestBorder - border.blockTop;
  expect(border.highestBorder - border.blockTop).toBeCloseTo(restOffset, 1);
  return restOffset;
}

/**
 * @param {Page} page
 * @returns {Promise<number>} the share of the height gap a block covers per frame (PAR-02).
 */
async function readHeightEasing(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readAnimationConstants().heightEasingPerFrame;
  });
}

/**
 * Runs in the page: picks a height card by clicking its radio and reads each unit right after the
 * first frame the engine draws for it. Clicking and reading in one task keeps the frame count
 * exact: the engine asked for its frame before this function asked for the next one.
 *
 * @param {{ codes: string[], radioId: string }} request
 * @returns {Promise<FirstFrameReading[]>}
 */
async function switchHeightAndReadFirstFrame({ codes, radioId }) {
  const inspector = /** @type {any} */ (window).mapInspector;
  const before = codes.map((code) => inspector.inspect(code).heightCurrent);
  const radio = /** @type {HTMLInputElement} */ (document.getElementById(radioId));
  radio.click();
  const targets = codes.map((code) => inspector.inspect(code).heightTarget);

  await new Promise((resolve) => requestAnimationFrame(resolve));

  return codes.map((code, index) => ({
    code,
    before: before[index],
    target: targets[index],
    firstFrame: inspector.inspect(code).heightCurrent,
    border: inspector.readBorderTop(code),
  }));
}

/**
 * @param {BorderTop} border
 * @param {number} restOffset
 */
function expectBordersOnTop(border, restOffset) {
  expect(border.lowestBorder - border.blockTop).toBeCloseTo(restOffset, 1);
  expect(border.highestBorder - border.blockTop).toBeCloseTo(restOffset, 1);
}
