import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectRuntimeFiles,
  collectStaticBootFiles,
  measureStaticBootBytes,
  STATIC_BOOT_CEILING_BYTES,
  STATIC_DATA_FILES,
} from "./runtime-files.mjs";

const FORBIDDEN_CANDIDATE_TERMS = Object.freeze([
  "lula",
  "bolsonaro",
  "flavio",
  "tarcisio",
  "derrite",
  "haddad",
  "boulos",
  "nunes",
  "marcal",
]);

test("PUB-06 collectRuntimeFiles includes entrypoints and static data files", () => {
  const files = collectRuntimeFiles();

  assert.ok(files.includes("index.html"));
  assert.ok(files.includes("src/app/main.js"));
  assert.ok(files.includes("src/app/theme.css"));

  for (const dataFile of STATIC_DATA_FILES) {
    assert.ok(files.includes(dataFile), `Missing data file ${dataFile}`);
  }
});

test("PUB-06 every file returned by collectRuntimeFiles exists on disk", () => {
  const files = collectRuntimeFiles();
  const root = process.cwd();

  assert.ok(files.length > 10, "Expected at least 10 runtime files in the closure");

  for (const file of files) {
    const fullPath = path.resolve(root, file);
    assert.ok(fs.existsSync(fullPath), `File does not exist: ${file}`);
  }
});

test("PUB-06 collectRuntimeFiles does not include test files, scripts or node_modules", () => {
  const files = collectRuntimeFiles();

  for (const file of files) {
    assert.equal(file.includes(".test."), false, `Test file should not be in runtime: ${file}`);
    assert.equal(file.includes(".e2e."), false, `E2E file should not be in runtime: ${file}`);
    assert.equal(file.startsWith("scripts/"), false, `Scripts should not be in runtime: ${file}`);
    assert.equal(
      file.startsWith("node_modules/"),
      false,
      `node_modules should not be in runtime: ${file}`,
    );
    assert.equal(file.startsWith("docs/"), false, `Docs should not be in runtime: ${file}`);
  }
});

test("PUB-06 collectRuntimeFiles is sorted alphabetically and normalized with forward slashes", () => {
  const files = collectRuntimeFiles();

  for (const file of files) {
    assert.equal(file.includes("\\"), false, `File path should not contain backslashes: ${file}`);
  }

  const sorted = [...files].sort();
  assert.deepEqual(files, sorted, "Files must be sorted alphabetically");
});

test("PUB-06 CLI outputs newline-delimited runtime files", () => {
  const output = execFileSync(process.execPath, ["scripts/publish/runtime-files.mjs"], {
    encoding: "utf-8",
  });

  const lines = output.trim().split(/\r?\n/);
  const directFiles = collectRuntimeFiles();

  assert.deepEqual(lines, directFiles);
});

test("PUB-08 static boot closure stays within 819200 bytes and excludes election and dynamic compare modules", () => {
  const report = measureStaticBootBytes();
  const staticFiles = collectStaticBootFiles();
  const allRuntimeFiles = collectRuntimeFiles();

  assert.ok(
    report.totalBytes <= STATIC_BOOT_CEILING_BYTES,
    `Expected static boot bytes (${report.totalBytes}) <= ${STATIC_BOOT_CEILING_BYTES}`,
  );
  assert.deepEqual(
    report.electionModules,
    [],
    `Static boot closure must not include election modules: ${report.electionModules.join(", ")}`,
  );
  assert.equal(
    staticFiles.includes("src/features/selection/compare-view.js"),
    false,
    "compare-view.js should be loaded on demand via dynamic import()",
  );
  assert.equal(
    allRuntimeFiles.includes("src/features/selection/compare-view.js"),
    true,
    "compare-view.js must still be included in full runtime closure for export-tree",
  );
});

test("PUB-10 public-manifest.json and collectRuntimeFiles cover data/election/** and exclude raw election corpus", () => {
  const manifest = JSON.parse(fs.readFileSync("scripts/publish/public-manifest.json", "utf8"));
  assert.ok(manifest.include.includes("data/election/**"), "Manifest must include data/election/**");
  assert.ok(
    manifest.exclude.includes("scripts/election/raw/**"),
    "Manifest must exclude scripts/election/raw/**",
  );

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sp-relevo-pub10-"));
  try {
    for (const file of collectRuntimeFiles()) {
      const srcPath = path.resolve(process.cwd(), file);
      const destPath = path.resolve(tmpRoot, file);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
    const sampleElectionFile = path.resolve(tmpRoot, "data/election/first-round-presidente.json");
    fs.mkdirSync(path.dirname(sampleElectionFile), { recursive: true });
    fs.writeFileSync(sampleElectionFile, "{}", "utf8");

    const discovered = collectRuntimeFiles(tmpRoot);
    assert.ok(
      discovered.includes("data/election/first-round-presidente.json"),
      "collectRuntimeFiles must include files under data/election/**",
    );
    const staticOnly = collectStaticBootFiles(tmpRoot);
    assert.equal(
      staticOnly.includes("data/election/first-round-presidente.json"),
      false,
      "collectStaticBootFiles must not include on-demand data/election/** files",
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("PUB-12 og:title and og:description in index.html are timeless and do not mention candidate names", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"\s*\/?>/i);
  const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"\s*\/?>/i);

  assert.ok(titleMatch, "index.html must contain og:title meta tag");
  assert.ok(descMatch, "index.html must contain og:description meta tag");

  const ogTitle = titleMatch[1].trim();
  const ogDescription = descMatch[1].trim();

  assert.ok(ogTitle.length > 0, "og:title must not be empty");
  assert.ok(ogDescription.length > 0, "og:description must not be empty");
  assert.equal(ogTitle.includes("\u2013"), false, "og:title must not contain en-dash");
  assert.equal(ogTitle.includes("\u2014"), false, "og:title must not contain em-dash");
  assert.equal(ogDescription.includes("\u2013"), false, "og:description must not contain en-dash");
  assert.equal(ogDescription.includes("\u2014"), false, "og:description must not contain em-dash");

  const combinedNormalized = `${ogTitle} ${ogDescription}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  for (const term of FORBIDDEN_CANDIDATE_TERMS) {
    assert.equal(
      combinedNormalized.includes(term),
      false,
      `Open Graph metadata must not mention candidate term "${term}"`,
    );
  }
});
