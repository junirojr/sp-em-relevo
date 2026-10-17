import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { collectRuntimeFiles, STATIC_DATA_FILES } from "./runtime-files.mjs";

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
