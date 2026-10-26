import { expect, test } from "@playwright/test";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1366_768 = { width: 1366, height: 768 };
const VIEWPORT_390_844 = { width: 390, height: 844 };

test.describe("N17 Replay view browser suite (RPL-01, RPL-03, RPL-04, RPL-05, ACE-04)", () => {
  test("RPL-01 with replay.available false, replay slot remains hidden without console error", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      await page.evaluate(async () => {
        const { mountReplayView } = await import(
          new URL("/src/features/count/replay-view.js", window.location.href).href
        );
        const slot = document.getElementById("election-replay-slot");
        if (!slot) {
          return;
        }

        mountReplayView(document, slot, {
          isAvailable: false,
          replayDoc: null,
        });
      });
      await settle(page);

      const replaySlot = page.locator("#election-replay-slot");
      await expect(replaySlot).toBeHidden();
      expect(consoleErrors.length).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("RPL-03 opens automatically at last recorded frame with 'Gravacao de 25/10, leitura das HH:MM' and never 'Ao vivo'", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { mountReplayView } = await import(
          new URL("/src/features/count/replay-view.js", window.location.href).href
        );
        const res = await fetch("data/election/replay-presidente-2t.json");
        const replayDoc = await res.json();

        const slot = document.getElementById("election-replay-slot");
        if (!slot) {
          return;
        }

        mountReplayView(document, slot, {
          isAvailable: true,
          replayDoc,
        });
      });
      await settle(page);

      const replaySlot = page.locator("#election-replay-slot");
      await expect(replaySlot).toBeVisible();

      const bannerNotice = replaySlot.locator(".replay-banner-notice");
      await expect(bannerNotice).toBeVisible();
      await expect(bannerNotice).toContainText("Gravacao de 25/10, leitura das 17:20 (Brasilia)");

      // Invariants: Never contains "Ao vivo" and no en-dash or em-dash
      const text = (await bannerNotice.textContent()) || "";
      expect(text).not.toContain("Ao vivo");
      expect(text).not.toContain("\u2013");
      expect(text).not.toContain("\u2014");

      // Verify frame counter is at the last frame
      const counter = replaySlot.locator(".replay-frame-counter");
      await expect(counter).toHaveText("Quadro 15 de 15");
    } finally {
      await context.close();
    }
  });

  test("RPL-04 slider is input range with aria attributes, keyboard operable, without autoplay", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { mountReplayView } = await import(
          new URL("/src/features/count/replay-view.js", window.location.href).href
        );
        const res = await fetch("data/election/replay-presidente-2t.json");
        const replayDoc = await res.json();

        const slot = document.getElementById("election-replay-slot");
        if (!slot) {
          return;
        }

        mountReplayView(document, slot, {
          isAvailable: true,
          replayDoc,
        });
      });
      await settle(page);

      const slider = page.locator("#election-replay-slot .replay-slider");
      await expect(slider).toBeVisible();

      // Range attributes
      await expect(slider).toHaveAttribute("type", "range");
      await expect(slider).toHaveAttribute("min", "0");
      await expect(slider).toHaveAttribute("max", "14");
      await expect(slider).toHaveAttribute("step", "1");
      await expect(slider).toHaveValue("14");

      // Accessibility attributes
      await expect(slider).toHaveAttribute("aria-label", "Controle de tempo do replay");
      await expect(slider).toHaveAttribute("aria-valuemin", "0");
      await expect(slider).toHaveAttribute("aria-valuemax", "14");
      await expect(slider).toHaveAttribute("aria-valuenow", "14");
      await expect(slider).toHaveAttribute("aria-valuetext", "17:20 - 100,00% apurado");

      // Keyboard navigation: Home key jumps to frame 0
      await slider.focus();
      await page.keyboard.press("Home");
      await settle(page);

      await expect(slider).toHaveAttribute("aria-valuenow", "0");
      await expect(slider).toHaveAttribute("aria-valuetext", "17:00 - 8,50% apurado");

      const counter = page.locator("#election-replay-slot .replay-frame-counter");
      await expect(counter).toHaveText("Quadro 1 de 15");

      // Keyboard navigation: ArrowRight advances one frame
      await page.keyboard.press("ArrowRight");
      await settle(page);

      await expect(slider).toHaveAttribute("aria-valuenow", "1");
      await expect(counter).toHaveText("Quadro 2 de 15");

      // Keyboard navigation: End key jumps to frame 14
      await page.keyboard.press("End");
      await settle(page);

      await expect(slider).toHaveAttribute("aria-valuenow", "14");
      await expect(counter).toHaveText("Quadro 15 de 15");
    } finally {
      await context.close();
    }
  });

  test("RPL-05 marks real gaps > 300s on the track and applies frame state immediately", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { mountReplayView } = await import(
          new URL("/src/features/count/replay-view.js", window.location.href).href
        );
        const res = await fetch("data/election/replay-presidente-2t.json");
        const replayDoc = await res.json();

        const slot = document.getElementById("election-replay-slot");
        if (!slot) {
          return;
        }

        const view = mountReplayView(document, slot, {
          isAvailable: true,
          replayDoc,
        });

        const win = /** @type {any} */ (window);
        win.__replayView = view;
      });
      await settle(page);

      // Verify gap indicator on track
      const gapIndicator = page.locator("#election-replay-slot .replay-gap-indicator");
      await expect(gapIndicator).toBeAttached();

      const gapNotice = page.locator("#election-replay-slot .replay-gap-notice");
      await expect(gapNotice).toBeHidden();

      // Jump to frame 6 (following the 420s real gap)
      await page.evaluate(() => {
        const win = /** @type {any} */ (window);
        win.__replayView.setIndex(6);
      });
      await settle(page);

      await expect(gapNotice).toBeVisible();
      await expect(gapNotice).toContainText(
        "Lacuna de transmissao de 7 minutos preservada sem interpolacao",
      );

      // Jump to frame 5 (prior to gap)
      await page.evaluate(() => {
        const win = /** @type {any} */ (window);
        win.__replayView.setIndex(5);
      });
      await settle(page);

      await expect(gapNotice).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test("ACE-04 button navigation targets meet >= 24x24 px CSS requirement and responsive layout in 390x844", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_390_844 });
    try {
      await page.evaluate(async () => {
        const { mountReplayView } = await import(
          new URL("/src/features/count/replay-view.js", window.location.href).href
        );
        const res = await fetch("data/election/replay-presidente-2t.json");
        const replayDoc = await res.json();

        const slot = document.getElementById("election-replay-slot");
        if (!slot) {
          return;
        }

        mountReplayView(document, slot, {
          isAvailable: true,
          replayDoc,
        });
      });
      await settle(page);

      const replaySlot = page.locator("#election-replay-slot");
      await expect(replaySlot).toBeVisible();

      // Verify target size of all buttons >= 24x24 px CSS
      const buttons = replaySlot.locator(".replay-btn");
      const buttonCount = await buttons.count();
      expect(buttonCount).toBe(4);

      for (let i = 0; i < buttonCount; i += 1) {
        const btn = buttons.nth(i);
        const box = await btn.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(24);
          expect(box.height).toBeGreaterThanOrEqual(24);
        }
      }

      // Verify no horizontal overflow in 390x844
      const hasHorizontalScroll = await page.evaluate(() => {
        const scroller = document.scrollingElement;
        if (!scroller) {
          return false;
        }
        return scroller.scrollWidth > scroller.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      await context.close();
    }
  });
});
