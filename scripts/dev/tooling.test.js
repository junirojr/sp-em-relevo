import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);

const expectedScripts = {
  build: "node scripts/dev/build-runtime.mjs",
  serve: "npm run build && node scripts/dev/serve.mjs --port 4173",
  lint: "biome check . && node scripts/dev/check-boundaries.mjs",
  typecheck: "tsc -p tsconfig.json && tsc -p tsconfig.domain.json",
  "test:unit":
    'npm run build && node --test "src/**/*.test.js" "scripts/**/*.test.js" "tests/**/*.test.js"',
  "test:e2e": "npm run build && playwright test",
  trace: "node scripts/dev/check-traceability.mjs",
  scan: "node scripts/publish/scan.mjs",
  "data:fetch": "node scripts/data/fetch-sources.mjs",
  "data:build": "node scripts/data/build-data.mjs",
  data: "npm run data:fetch && npm run data:build",
};

test("BAS-06 package.json declares the scripts of the command table", () => {
  for (const [name, command] of Object.entries(expectedScripts)) {
    assert.equal(packageJson.scripts[name], command, name);
  }
});

test("BAS-06 verify chains lint, typecheck, test:unit and test:e2e in order with &&", () => {
  const steps = packageJson.scripts.verify.split(" && ");
  assert.deepEqual(steps, [
    "npm run lint",
    "npm run typecheck",
    "npm run test:unit",
    "npm run test:e2e",
  ]);
});

test("BAS-06 every devDependency has an exact version", () => {
  const exactVersion = /^\d+\.\d+\.\d+$/;
  const entries = Object.entries(packageJson.devDependencies);
  assert.ok(entries.length > 0);
  for (const [name, version] of entries) {
    assert.match(version, exactVersion, name);
  }
});

test("BAS-06 the page has no runtime dependency and the package is private ESM", () => {
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.type, "module");
});
