#!/usr/bin/env node
/**
 * Dependency rule check (BAS-07). Reads static imports, `export ... from` and
 * `import("literal")` in src/ and scripts/, and reports every import that the
 * folder table forbids. Comments never count as dependencies.
 *
 * Usage: node scripts/dev/check-boundaries.mjs [rootDir]   (default: repository root)
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ignoredPaths = ["legacy", "node_modules", ".git", ".claude", "scripts/dev/fixtures"];
const scannedAreas = ["src/domain", "src/engine", "src/features", "src/app", "scripts"];
const sourceExtensions = new Set([".js", ".mjs"]);
const toolDependencies = new Map([
  ["scripts/dev/build-runtime.mjs", new Set(["esbuild"])],
  ["scripts/publish/runtime-files.mjs", new Set(["typescript"])],
]);

/**
 * @typedef {{ kind: string, slice?: string }} Place
 * @typedef {{ file: string, specifier: string, rule: string }} Violation
 */

/**
 * Finds every forbidden import under rootDir.
 * @param {string} [rootDir] defaults to the repository root.
 * @returns {Promise<Violation[]>} violations with root-relative, forward-slash file paths.
 */
export async function findViolations(rootDir = defaultRoot) {
  const files = await listSourceFiles(rootDir, "");
  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    violations.push(...(await violationsOfFile(rootDir, file)));
  }
  return violations;
}

/**
 * @param {string} rootDir
 * @param {string} file
 * @returns {Promise<Violation[]>}
 */
async function violationsOfFile(rootDir, file) {
  const source = await readFile(path.join(rootDir, file), "utf8");
  const from = classifyFile(file);
  /** @type {Violation[]} */
  const violations = [];
  for (const specifier of importSpecifiersOf(source)) {
    if (toolDependencies.get(file)?.has(specifier)) continue;
    const to = classifyImport(file, specifier);
    if (!isAllowed(from, to)) {
      violations.push({ file, specifier, rule: describeRule(from, to) });
    }
  }
  return violations;
}

/**
 * @param {string} rootDir
 * @param {string} relativeDir
 * @returns {Promise<string[]>}
 */
async function listSourceFiles(rootDir, relativeDir) {
  const entries = await readdir(path.join(rootDir, relativeDir), { withFileTypes: true });
  /** @type {string[]} */
  const files = [];
  for (const entry of entries) {
    const relativePath = joinPosix(relativeDir, entry.name);
    files.push(...(await sourceFilesOf(rootDir, entry, relativePath)));
  }
  return files;
}

/**
 * @param {string} rootDir
 * @param {import("node:fs").Dirent} entry
 * @param {string} relativePath
 * @returns {Promise<string[]>}
 */
async function sourceFilesOf(rootDir, entry, relativePath) {
  if (ignoredPaths.includes(relativePath)) {
    return [];
  }
  if (entry.isDirectory()) {
    return listSourceFiles(rootDir, relativePath);
  }
  if (!isScannedSource(relativePath)) {
    return [];
  }
  return [relativePath];
}

/**
 * @param {string} relativePath
 */
function isScannedSource(relativePath) {
  if (relativePath.endsWith(".test.js") || relativePath.endsWith(".e2e.js")) {
    return false;
  }
  if (!sourceExtensions.has(path.posix.extname(relativePath))) {
    return false;
  }
  return scannedAreas.some((area) => relativePath.startsWith(`${area}/`));
}

/**
 * @param {string} directory
 * @param {string} name
 */
function joinPosix(directory, name) {
  if (directory === "") {
    return name;
  }
  return `${directory}/${name}`;
}

// Matches a string literal (kept) or a comment (dropped), so quotes inside
// comments and "//" inside strings do not confuse the scan.
const stringOrComment =
  /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

const importPatterns = [
  /\b(?:import|export)\s[^;"'`]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

/**
 * @param {string} source
 * @returns {string[]}
 */
function importSpecifiersOf(source) {
  const code = source.replace(stringOrComment, (_match, text) => text ?? " ");
  /** @type {string[]} */
  const specifiers = [];
  for (const pattern of importPatterns) {
    for (const match of code.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

/**
 * @param {string} file root-relative POSIX path.
 * @returns {Place}
 */
function classifyFile(file) {
  const parts = file.split("/");
  if (parts[0] === "scripts") {
    return { kind: "scripts" };
  }
  return classifySourceParts(parts.slice(1));
}

/**
 * @param {string[]} parts path parts below src/.
 * @returns {Place}
 */
function classifySourceParts(parts) {
  if (parts[0] === "features") {
    return { kind: "feature", slice: parts[1] };
  }
  return { kind: parts[0] };
}

/**
 * @param {string} file importing file, root-relative POSIX path.
 * @param {string} specifier
 * @returns {Place}
 */
function classifyImport(file, specifier) {
  if (specifier.startsWith("node:")) {
    return { kind: "node" };
  }
  if (specifier === "three" || specifier.startsWith("three/")) {
    return { kind: "three" };
  }
  if (!specifier.startsWith(".")) {
    return { kind: "package" };
  }
  const resolved = path.posix.join(path.posix.dirname(file), specifier);
  return classifyResolved(resolved);
}

/**
 * @param {string} resolved
 * @returns {Place}
 */
function classifyResolved(resolved) {
  if (resolved.startsWith("src/")) {
    return classifyFile(resolved);
  }
  if (resolved.startsWith("scripts/")) {
    return { kind: "scripts" };
  }
  return { kind: "outside" };
}

/** @type {Record<string, (to: Place, from: Place) => boolean>} */
const allowedTargets = {
  domain: (to) => to.kind === "domain",
  engine: (to) => ["three", "domain", "engine"].includes(to.kind),
  feature: (to, from) => to.kind === "domain" || isSameSlice(to, from),
  app: (to) => to.kind !== "scripts" && to.kind !== "outside",
  scripts: (to) => ["node", "domain", "scripts"].includes(to.kind),
};

/**
 * @param {Place} to
 * @param {Place} from
 */
function isSameSlice(to, from) {
  return to.kind === "feature" && to.slice === from.slice;
}

/**
 * @param {Place} from
 * @param {Place} to
 */
function isAllowed(from, to) {
  const rule = allowedTargets[from.kind];
  if (rule === undefined) {
    return true;
  }
  return rule(to, from);
}

/**
 * @param {Place} from
 * @param {Place} to
 */
function describeRule(from, to) {
  return `${placeName(from)} must not import ${placeName(to)}`;
}

/**
 * @param {Place} place
 */
function placeName(place) {
  if (place.kind === "feature") {
    return `src/features/${place.slice}`;
  }
  return place.kind;
}

/**
 * @param {string[]} argv
 */
async function runCommandLine(argv) {
  const rootDir = path.resolve(argv[0] ?? defaultRoot);
  const violations = await findViolations(rootDir);
  for (const violation of violations) {
    console.error(`${violation.file}: "${violation.specifier}" (${violation.rule})`);
  }
  if (violations.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log("Boundaries OK: no forbidden imports.");
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
