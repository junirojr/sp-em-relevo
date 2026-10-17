import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const STATIC_DATA_FILES = [
  "data/mesh.topo.json",
  "data/municipalities.json",
  "data/regions.json",
];

const JS_IMPORT_PATTERN =
  /(?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const CSS_IMPORT_PATTERN = /@import\s+(?:url\(['"]?([^'")]+)['"]?\)|['"]([^'"]+)['"])/g;
const HTML_SCRIPT_PATTERN = /<script\s+[^>]*src=['"]([^'"]+)['"][^>]*>/gi;
const HTML_LINK_PATTERN = /<link\s+[^>]*href=['"]([^'"]+)['"][^>]*>/gi;

/**
 * Computes the transitive closure of runtime files required by index.html and DATA_FILES.
 * Follows PUB-06 and P41.
 *
 * @param {string} [rootDir]
 * @returns {string[]}
 */
export function collectRuntimeFiles(rootDir = process.cwd()) {
  const resolvedRoot = path.resolve(rootDir);
  const visited = new Set();
  const queue = ["index.html", ...STATIC_DATA_FILES];

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
      enqueueJsDependencies(absolutePath, resolvedRoot, queue);
    }
  }

  return [...visited].sort();
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
 */
function enqueueJsDependencies(filePath, rootDir, queue) {
  const content = fs.readFileSync(filePath, "utf-8");

  for (const match of content.matchAll(JS_IMPORT_PATTERN)) {
    const specifier = match[1] || match[2];
    if (!specifier) {
      continue;
    }
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      continue;
    }
    addRelativeReference(specifier, filePath, rootDir, queue);
  }
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
