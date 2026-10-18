import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const STATIC_DATA_FILES = [
  "data/mesh.topo.json",
  "data/municipalities.json",
  "data/regions.json",
  "data/status.json",
];

export const STATIC_BOOT_CEILING_BYTES = 819200;

const JS_STATIC_IMPORT_PATTERN = /(?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g;
const JS_DYNAMIC_IMPORT_PATTERN = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
const CSS_IMPORT_PATTERN = /@import\s+(?:url\(['"]?([^'")]+)['"]?\)|['"]([^'"]+)['"])/g;
const HTML_SCRIPT_PATTERN = /<script\s+[^>]*src=['"]([^'"]+)['"][^>]*>/gi;
const HTML_LINK_PATTERN = /<link\s+[^>]*href=['"]([^'"]+)['"][^>]*>/gi;

/**
 * Computes the transitive closure of runtime files required by index.html and STATIC_DATA_FILES.
 * Follows PUB-06, PUB-08, PUB-10 and P41.
 *
 * @param {string} [rootDir]
 * @param {{ followDynamicImports?: boolean, includeElectionData?: boolean }} [options]
 * @returns {string[]}
 */
export function collectRuntimeFiles(rootDir = process.cwd(), options = {}) {
  const followDynamicImports = options.followDynamicImports !== false;
  const includeElectionData = options.includeElectionData !== false;
  const resolvedRoot = path.resolve(rootDir);
  const visited = new Set();
  const queue = ["index.html", ...STATIC_DATA_FILES];

  if (includeElectionData) {
    enqueueElectionDataFiles(resolvedRoot, queue);
  }

  while (queue.length > 0) {
    const relativePath = queue.shift();
    if (!relativePath) {
      continue;
    }
    const normalized = relativePath.replace(/\\/g, "/");
    if (visited.has(normalized)) {
      continue;
    }

    const absolutePath = path.resolve(resolvedRoot, normalized);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Arquivo de runtime não encontrado: ${normalized}`);
    }

    visited.add(normalized);

    const ext = path.extname(normalized).toLowerCase();
    if (ext === ".html") {
      enqueueHtmlDependencies(absolutePath, resolvedRoot, queue);
      continue;
    }
    if (ext === ".css") {
      enqueueCssDependencies(absolutePath, resolvedRoot, queue);
      continue;
    }
    if (ext === ".js" || ext === ".mjs") {
      enqueueJsDependencies(absolutePath, resolvedRoot, queue, followDynamicImports);
    }
  }

  return [...visited].sort();
}

/**
 * Computes the static boot closure of `index.html` and `STATIC_DATA_FILES` without following
 * dynamic `import()` edges or on-demand `data/election/**` payloads (PUB-08).
 *
 * @param {string} [rootDir]
 * @returns {string[]}
 */
export function collectStaticBootFiles(rootDir = process.cwd()) {
  return collectRuntimeFiles(rootDir, {
    followDynamicImports: false,
    includeElectionData: false,
  });
}

/**
 * Measures the byte weight of the static boot closure and checks for leaked election modules (PUB-08).
 *
 * @param {string} [rootDir]
 * @returns {{
 *   files: string[],
 *   totalBytes: number,
 *   ceilingBytes: number,
 *   electionModules: string[]
 * }}
 */
export function measureStaticBootBytes(rootDir = process.cwd()) {
  const resolvedRoot = path.resolve(rootDir);
  const files = collectStaticBootFiles(resolvedRoot);
  let totalBytes = 0;
  for (const file of files) {
    const stat = fs.statSync(path.resolve(resolvedRoot, file));
    totalBytes += stat.size;
  }
  const electionModules = files.filter(isElectionRuntimeArtifact);
  return {
    files,
    totalBytes,
    ceilingBytes: STATIC_BOOT_CEILING_BYTES,
    electionModules,
  };
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function isElectionRuntimeArtifact(relativePath) {
  return (
    relativePath.startsWith("src/features/election/") ||
    relativePath.startsWith("src/features/count/") ||
    relativePath.startsWith("data/election/")
  );
}

/**
 * Enqueues any existing runtime files under `data/election/**` so `export-tree` includes them (PUB-10).
 *
 * @param {string} rootDir
 * @param {string[]} queue
 */
function enqueueElectionDataFiles(rootDir, queue) {
  const electionDir = path.resolve(rootDir, "data/election");
  if (!fs.existsSync(electionDir)) {
    return;
  }
  walkDirectoryFiles(electionDir, rootDir, queue);
}

/**
 * @param {string} currentDir
 * @param {string} rootDir
 * @param {string[]} queue
 */
function walkDirectoryFiles(currentDir, rootDir, queue) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkDirectoryFiles(fullPath, rootDir, queue);
      continue;
    }
    if (entry.isFile()) {
      const rel = path.relative(rootDir, fullPath).replace(/\\/g, "/");
      queue.push(rel);
    }
  }
}

/**
 * @param {string} filePath
 * @param {string} rootDir
 * @param {string[]} queue
 */
function enqueueHtmlDependencies(filePath, rootDir, queue) {
  const content = fs.readFileSync(filePath, "utf-8");

  for (const match of content.matchAll(HTML_SCRIPT_PATTERN)) {
    const src = match[1];
    addRelativeReference(src, filePath, rootDir, queue);
  }

  for (const match of content.matchAll(HTML_LINK_PATTERN)) {
    const href = match[1];
    if (href.startsWith("data:")) {
      continue;
    }
    addRelativeReference(href, filePath, rootDir, queue);
  }
}

/**
 * @param {string} filePath
 * @param {string} rootDir
 * @param {string[]} queue
 */
function enqueueCssDependencies(filePath, rootDir, queue) {
  const content = fs.readFileSync(filePath, "utf-8");

  for (const match of content.matchAll(CSS_IMPORT_PATTERN)) {
    const url = match[1] || match[2];
    if (!url) {
      continue;
    }
    addRelativeReference(url, filePath, rootDir, queue);
  }
}

/**
 * @param {string} filePath
 * @param {string} rootDir
 * @param {string[]} queue
 * @param {boolean} followDynamicImports
 */
function enqueueJsDependencies(filePath, rootDir, queue, followDynamicImports) {
  const content = fs.readFileSync(filePath, "utf-8");

  for (const match of content.matchAll(JS_STATIC_IMPORT_PATTERN)) {
    const specifier = match[1];
    enqueueSpecifierIfRelative(specifier, filePath, rootDir, queue);
  }

  if (!followDynamicImports) {
    return;
  }

  for (const match of content.matchAll(JS_DYNAMIC_IMPORT_PATTERN)) {
    const specifier = match[1];
    enqueueSpecifierIfRelative(specifier, filePath, rootDir, queue);
  }
}

/**
 * @param {string | undefined} specifier
 * @param {string} filePath
 * @param {string} rootDir
 * @param {string[]} queue
 */
function enqueueSpecifierIfRelative(specifier, filePath, rootDir, queue) {
  if (!specifier) {
    return;
  }
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return;
  }
  addRelativeReference(specifier, filePath, rootDir, queue);
}

/**
 * @param {string} reference
 * @param {string} fromFile
 * @param {string} rootDir
 * @param {string[]} queue
 */
function addRelativeReference(reference, fromFile, rootDir, queue) {
  if (
    reference.startsWith("http://") ||
    reference.startsWith("https://") ||
    reference.startsWith("//")
  ) {
    return;
  }
  const cleanRef = reference.split("?")[0].split("#")[0];
  const fileDir = path.dirname(fromFile);
  const targetAbs = path.resolve(fileDir, cleanRef);
  const relToRoot = path.relative(rootDir, targetAbs).replace(/\\/g, "/");
  queue.push(relToRoot);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const files = collectRuntimeFiles();
  for (const file of files) {
    console.log(file);
  }
}
