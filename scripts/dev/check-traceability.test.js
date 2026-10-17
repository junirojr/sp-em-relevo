import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectTrace, findMissingCriteria } from "./check-traceability.mjs";

const fixtureRoot = fileURLToPath(new URL("./fixtures/traceability/", import.meta.url));
const emptyRoot = fileURLToPath(new URL("./fixtures/traceability/empty/", import.meta.url));
const scriptPath = fileURLToPath(new URL("./check-traceability.mjs", import.meta.url));

test("TRC-01 collects criteria from every spec.md and flags the manual ones", async () => {
  const trace = await collectTrace(fixtureRoot);
  const ids = trace.criteria.map((criterion) => criterion.id).sort();
  assert.deepEqual(ids, ["ALP-01", "ALP-02", "ALP-03", "ALP-04", "ALP-05", "BET-01"]);
  const manualIds = trace.criteria.filter((criterion) => criterion.manual).map(idOf);
  assert.deepEqual(manualIds, ["ALP-02"]);
});

test("TRC-02 reads test ids written with single quotes, double quotes and backticks", async () => {
  const trace = await collectTrace(fixtureRoot);
  const testedIds = trace.tests.map(idOf).sort();
  assert.deepEqual(testedIds, ["ALP-01", "ALP-04", "ALP-05", "BET-01"]);
});

test("TRC-03 a non-manual criterion without a test is missing", async () => {
  const trace = await collectTrace(fixtureRoot);
  assert.deepEqual(findMissingCriteria(trace, ["ALP"]).map(idOf), ["ALP-03"]);
});

test("TRC-04 a slice whose criteria all have tests has nothing missing", async () => {
  const trace = await collectTrace(fixtureRoot);
  assert.deepEqual(findMissingCriteria(trace, ["BET"]), []);
});

test("TRC-05 no slice filter requires every slice found", async () => {
  const trace = await collectTrace(fixtureRoot);
  assert.deepEqual(findMissingCriteria(trace, []).map(idOf), ["ALP-03"]);
});

test("TRC-06 --require exits non-zero and lists the missing ids", () => {
  const result = runTracker(["--root", fixtureRoot, "--require", "ALP,BET"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ALP-03/);
});

test("TRC-07 --require exits zero when the required slice is covered", () => {
  const result = runTracker(["--root", fixtureRoot, "--require", "BET"]);
  assert.equal(result.status, 0, result.stderr);
});

test("TRC-08 --report lists the ids per file with totals and exits zero", () => {
  const result = runTracker(["--root", fixtureRoot, "--report"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ALP-03/);
  assert.match(result.stdout, /Total: 6 ids in 2 files/);
});

test("TRC-09 --report on a root without specs says 0 and exits zero", () => {
  const result = runTracker(["--root", emptyRoot, "--report"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Total: 0 ids in 0 files/);
});

test("TRC-10 the real repository scan skips the fixtures", async () => {
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  const trace = await collectTrace(repositoryRoot);
  const fromFixtures = trace.criteria.filter((criterion) => criterion.file.includes("fixtures"));
  assert.deepEqual(fromFixtures, []);
});

/**
 * @param {{ id: string }} entry
 */
function idOf(entry) {
  return entry.id;
}

/**
 * @param {string[]} args
 */
function runTracker(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
}
