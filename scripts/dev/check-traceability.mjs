#!/usr/bin/env node
/**
 * Traceability check. Every criterion line "- **XXX-NN.** text" in a spec.md needs
 * a test named test("XXX-NN ...") in a *.test.js or *.e2e.js file, unless the
 * criterion ends with "(manual)". Every criterion id in a spec.md must match
 * the pattern ^[A-Z]{3}-\d{2}$ (VER-01).
 *
 * Usage: node scripts/dev/check-traceability.mjs [--report] [--require BAS,ERR] [--root <dir>]
 *   --report   lists the criteria per spec file and exits 0 (unless an id is malformed).
 *   --require  fails when a non-manual criterion of those slices has no test.
 *   (neither)  requires every slice found.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scannedFolders = ["src", "scripts", "tests"];
const ignoredPaths = ["node_modules", "scripts/dev/fixtures"];
const criterionCandidateLine = /^- \*\*([^*]+)\*\*\s*(.*)$/gm;
const validCriterionToken = /^([A-Z]{3}-\d{2})\.$/;
export const VALID_CRITERION_ID = /^[A-Z]{3}-\d{2}$/;
const testName = /\btest\(\s*(["'`])([A-Z]+-\d+)\b/g;
const testFileName = /\.(?:test|e2e)(?:\.fixture)?\.js$/;

/**
 * @typedef {{ id: string, file: string, manual: boolean }} Criterion
 * @typedef {{ id: string, file: string }} InvalidCriterion
 * @typedef {{ id: string, file: string }} TestId
 * @typedef {{ criteria: Criterion[], invalidCriteria: InvalidCriterion[], tests: TestId[] }} Trace
 */

/**
 * Reads every spec.md and every test file under rootDir.
 * @param {string} [rootDir] defaults to the repository root.
 * @returns {Promise<Trace>}
 */
export async function collectTrace(rootDir = defaultRoot) {
  /** @type {string[]} */
  const files = [];
  for (const folder of scannedFolders) {
    files.push(...(await listFiles(rootDir, folder)));
  }
  /** @type {Criterion[]} */
  const criteria = [];
  /** @type {InvalidCriterion[]} */
  const invalidCriteria = [];
  /** @type {TestId[]} */
  const tests = [];
  for (const file of files) {
    const parsedSpec = await criteriaOf(rootDir, file);
    criteria.push(...parsedSpec.criteria);
    invalidCriteria.push(...parsedSpec.invalidCriteria);
    tests.push(...(await testsOf(rootDir, file)));
  }
  return { criteria, invalidCriteria, tests };
}

/**
 * Lists malformed criterion identifiers found in any spec.md (VER-01).
 *
 * @param {Trace} trace
 * @returns {InvalidCriterion[]}
 */
export function findInvalidCriteria(trace) {
  const explicitInvalid = trace.invalidCriteria ?? [];
  const fromCriteria = trace.criteria
    .filter((criterion) => !VALID_CRITERION_ID.test(criterion.id))
    .map((criterion) => ({ id: criterion.id, file: criterion.file }));
  return [...explicitInvalid, ...fromCriteria];
}

/**
 * Lists non-manual criteria without a test.
 * @param {Trace} trace
 * @param {string[]} slices id prefixes such as "BAS"; empty means every slice found.
 * @returns {Criterion[]}
 */
export function findMissingCriteria(trace, slices) {
  const testedIds = new Set(trace.tests.map((test) => test.id));
  return trace.criteria
    .filter((criterion) => isInSlices(criterion, slices))
    .filter((criterion) => !criterion.manual)
    .filter((criterion) => !testedIds.has(criterion.id));
}

/**
 * @param {Criterion} criterion
 * @param {string[]} slices
 */
function isInSlices(criterion, slices) {
  if (slices.length === 0) {
    return true;
  }
  return slices.includes(sliceOf(criterion.id));
}

/**
 * @param {string} id
 */
function sliceOf(id) {
  return id.split("-")[0];
}

/**
 * @param {string} rootDir
 * @param {string} relativeDir
 * @returns {Promise<string[]>}
 */
async function listFiles(rootDir, relativeDir) {
  if (ignoredPaths.includes(relativeDir)) {
    return [];
  }
  const entries = await readDirectoryOrEmpty(path.join(rootDir, relativeDir));
  /** @type {string[]} */
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(rootDir, relativePath)));
      continue;
    }
    files.push(relativePath);
  }
  return files;
}

/**
 * @param {string} directory
 * @returns {Promise<import("node:fs").Dirent[]>}
 */
async function readDirectoryOrEmpty(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * @param {unknown} error
 */
function isMissingPathError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  return /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT";
}

/**
 * @param {string} rootDir
 * @param {string} file
 * @returns {Promise<{ criteria: Criterion[], invalidCriteria: InvalidCriterion[] }>}
 */
async function criteriaOf(rootDir, file) {
  if (path.posix.basename(file) !== "spec.md") {
    return { criteria: [], invalidCriteria: [] };
  }
  const text = await readFile(path.join(rootDir, file), "utf8");
  /** @type {Criterion[]} */
  const criteria = [];
  /** @type {InvalidCriterion[]} */
  const invalidCriteria = [];
  for (const match of text.matchAll(criterionCandidateLine)) {
    const rawToken = match[1].trim();
    const tokenMatch = rawToken.match(validCriterionToken);
    if (!tokenMatch) {
      invalidCriteria.push({
        id: rawToken.replace(/\.$/, ""),
        file,
      });
      continue;
    }
    criteria.push({
      id: tokenMatch[1],
      file,
      manual: match[2].trimEnd().endsWith("(manual)"),
    });
  }
  return { criteria, invalidCriteria };
}

/**
 * @param {string} rootDir
 * @param {string} file
 * @returns {Promise<TestId[]>}
 */
async function testsOf(rootDir, file) {
  if (!testFileName.test(file)) {
    return [];
  }
  const text = await readFile(path.join(rootDir, file), "utf8");
  return [...text.matchAll(testName)].map((match) => ({ id: match[2], file }));
}

/**
 * @param {Trace} trace
 */
function formatReport(trace) {
  const testedIds = new Set(trace.tests.map((test) => test.id));
  /** @type {string[]} */
  const lines = [];
  const specFiles = [...new Set(trace.criteria.map((criterion) => criterion.file))];
  for (const specFile of specFiles) {
    lines.push(specFile);
    for (const criterion of trace.criteria.filter((entry) => entry.file === specFile)) {
      lines.push(`  ${criterion.id} ${statusOf(criterion, testedIds)}`);
    }
  }
  lines.push(`Total: ${trace.criteria.length} ids in ${specFiles.length} files`);
  return lines.join("\n");
}

/**
 * @param {Criterion} criterion
 * @param {Set<string>} testedIds
 */
function statusOf(criterion, testedIds) {
  if (testedIds.has(criterion.id)) {
    return "tested";
  }
  if (criterion.manual) {
    return "manual";
  }
  return "MISSING";
}

/**
 * @param {string[]} argv
 * @returns {{ report: boolean, slices: string[], rootDir: string }}
 */
function parseArguments(argv) {
  return {
    report: argv.includes("--report"),
    slices: flagValueOf(argv, "--require")?.split(",").filter(Boolean) ?? [],
    rootDir: path.resolve(flagValueOf(argv, "--root") ?? defaultRoot),
  };
}

/**
 * @param {string[]} argv
 * @param {string} flag
 * @returns {string | undefined}
 */
function flagValueOf(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

/**
 * @param {string[]} argv
 */
async function runCommandLine(argv) {
  const options = parseArguments(argv);
  const trace = await collectTrace(options.rootDir);
  const invalid = findInvalidCriteria(trace);
  if (invalid.length > 0) {
    for (const entry of invalid) {
      console.error(`Invalid criterion id "${entry.id}" in ${entry.file} (expected XXX-NN, VER-01)`);
    }
    process.exitCode = 1;
    return;
  }
  if (options.report) {
    console.log(formatReport(trace));
    return;
  }
  const missing = findMissingCriteria(trace, options.slices);
  if (missing.length === 0) {
    console.log(`Traceability OK: ${trace.criteria.length} ids checked.`);
    return;
  }
  for (const criterion of missing) {
    console.error(`${criterion.id} has no test (${criterion.file})`);
  }
  process.exitCode = 1;
}

function isEntryPoint() {
  if (process.argv[1] === undefined) {
    return false;
  }
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isEntryPoint()) {
  await runCommandLine(process.argv.slice(2));
}
