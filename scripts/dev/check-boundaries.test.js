import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findViolations } from "./check-boundaries.mjs";

const fixtureRoot = fileURLToPath(new URL("./fixtures/boundaries/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

test("BAS-07 src/domain/ importing src/engine/ is a violation", async () => {
  await assertViolates("src/domain/imports-engine.fixture.js", "../engine/x.js");
});

test("BAS-07 src/domain/ importing three is a violation", async () => {
  await assertViolates("src/domain/imports-three.fixture.js", "three");
});

test("BAS-07 src/domain/ importing node: is a violation", async () => {
  await assertViolates("src/domain/imports-node.fixture.js", "node:fs");
});

test("BAS-07 a dynamic import with a string literal is checked", async () => {
  await assertViolates("src/domain/dynamic-import.fixture.js", "../engine/x.js");
});

test("BAS-07 an export from is checked", async () => {
  await assertViolates("src/domain/export-from.fixture.js", "../engine/x.js");
});

test("BAS-07 src/engine/ importing a feature slice is a violation", async () => {
  await assertViolates("src/engine/imports-feature.fixture.js", "../features/map/y.js");
});

test("BAS-07 a feature slice importing three is a violation", async () => {
  await assertViolates("src/features/map/imports-three.fixture.js", "three");
});

test("BAS-07 a feature slice importing src/engine/ is a violation", async () => {
  await assertViolates("src/features/map/imports-engine.fixture.js", "../../engine/x.js");
});

test("BAS-07 a feature slice importing another slice is a violation", async () => {
  await assertViolates("src/features/map/imports-other-slice.fixture.js", "../list/z.js");
});

test("BAS-07 a feature slice importing src/app/ is a violation", async () => {
  await assertViolates("src/features/map/imports-app.fixture.js", "../../app/main.js");
});

test("BAS-07 scripts/ importing src/engine/ is a violation", async () => {
  await assertViolates("scripts/imports-engine.fixture.js", "../src/engine/x.js");
});

test("BAS-07 scripts/ importing a bare package is a violation", async () => {
  await assertViolates("scripts/imports-package.fixture.js", "lodash");
});

test("BAS-07 allowed imports produce no violation", async () => {
  const violations = await findViolations(fixtureRoot);
  const allowedFiles = [
    "src/domain/ok.fixture.js",
    "src/engine/ok.fixture.js",
    "src/features/map/ok.fixture.js",
    "src/app/ok.fixture.js",
    "scripts/ok.fixture.js",
  ];
  for (const file of allowedFiles) {
    assert.deepEqual(violationsIn(violations, file), [], file);
  }
});

test("BAS-07 an @import in a JSDoc comment does not count as a dependency", async () => {
  const violations = await findViolations(fixtureRoot);
  assert.deepEqual(violationsIn(violations, "src/features/map/jsdoc-import.fixture.js"), []);
});

test("BAS-07 an import inside a line comment does not count as a dependency", async () => {
  const violations = await findViolations(fixtureRoot);
  assert.deepEqual(violationsIn(violations, "src/domain/commented-import.fixture.js"), []);
});

test("BAS-07 the real repository has no violation and the scan skips fixtures", async () => {
  const violations = await findViolations(repositoryRoot);
  assert.deepEqual(violations, []);
});

/**
 * @param {string} file
 * @param {string} specifier
 */
async function assertViolates(file, specifier) {
  const violations = await findViolations(fixtureRoot);
  const found = violationsIn(violations, file);
  assert.equal(found.length, 1, file);
  assert.equal(found[0].specifier, specifier);
}

/**
 * @param {import("./check-boundaries.mjs").Violation[]} violations
 * @param {string} file
 */
function violationsIn(violations, file) {
  return violations.filter((violation) => violation.file === file);
}
