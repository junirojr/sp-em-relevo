#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const docsDir = path.join(repoRoot, "docs");
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173";

/**
 * Espera o mapa 3D estabilizar os quadros de renderizacao.
 *
 * @param {import("@playwright/test").Page} page
 * @param {number} [timeoutMs]
 */
async function settle(page, timeoutMs = 15000) {
  await page.waitForTimeout(200);
  await page.waitForFunction(
    () => {
      const inspector = /** @type {any} */ (window).mapInspector;
      if (!inspector) {
        return false;
      }
      return inspector.isSettled() === true;
    },
    null,
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(300);
}

/**
 * Registra capturas em alta resolucao da visao nacional e do drill-down.
 */
async function capturePreviews() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();

    console.log("Registrando visao nacional Brasil...");
    await page.goto(`${baseUrl}/?uf=br`);
    await settle(page);

    const nationalPath = path.join(docsDir, "captura-nacional.png");
    await page.screenshot({ path: nationalPath });
    console.log("Gravado:", nationalPath);

    console.log("Registrando visao drill-down detalhada...");
    await page.goto(`${baseUrl}/?uf=35`);
    await settle(page);

    const drilldownPath = path.join(docsDir, "captura-drilldown.png");
    await page.screenshot({ path: drilldownPath });
    console.log("Gravado:", drilldownPath);

    const drilldownSpPath = path.join(docsDir, "captura-drilldown-sp.png");
    await page.screenshot({ path: drilldownSpPath });
    console.log("Gravado:", drilldownSpPath);

    await context.close();
  } finally {
    await browser.close();
  }
}

capturePreviews().catch((error) => {
  console.error("Falha ao registrar capturas:", error);
  process.exit(1);
});
