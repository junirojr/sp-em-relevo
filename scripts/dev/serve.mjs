#!/usr/bin/env node
/**
 * Static file server for the São Paulo em relevo pages and the publish probe.
 * Serves the repository root with no cache. Hidden paths (any segment starting with "."),
 * HANDOFF.md, todo.md and scripts/data/raw/ answer 404, the same as a missing file.
 *
 * Usage: node scripts/dev/serve.mjs [--port <number>]   (default port 4173)
 */
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultPort = 4173;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const mimeTypeByExtension = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
]);
// Lower case on purpose: Windows and macOS ignore case, so "/handoff.md" would reach HANDOFF.md.
const deniedRelativePaths = ["handoff.md", "todo.md", "scripts/data/raw"];

/**
 * Creates an HTTP server that serves files under rootDir. Call listen() on the result.
 * @param {{ rootDir?: string }} [options] rootDir defaults to the repository root.
 * @returns {import("node:http").Server}
 */
export function createProbeServer({ rootDir = repositoryRoot } = {}) {
  return createServer((request, response) => {
    handleRequest({ rootDir, request, response });
  });
}

/**
 * @param {{ rootDir: string, request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse }} context
 */
async function handleRequest({ rootDir, request, response }) {
  if (!isReadMethod(request.method)) {
    return sendText(response, 405, "Method not allowed");
  }
  const filePath = await resolveServableFile(rootDir, request.url);
  if (filePath === null) {
    return sendText(response, 404, "Not found");
  }
  const body = await readFileOrNull(filePath);
  if (body === null) {
    return sendText(response, 404, "Not found");
  }
  return sendFile({ response, filePath, body, method: request.method });
}

/**
 * @param {string | undefined} method
 */
function isReadMethod(method) {
  return method === "GET" || method === "HEAD";
}

/**
 * Maps a request URL to the real file that may be served, or null when it must answer 404.
 * The deny rules run twice: on the path the URL spells and on the path the file system
 * resolves, so a link, a short name or a trailing dot cannot reach a denied file.
 * @param {string} rootDir
 * @param {string | undefined} requestUrl
 */
async function resolveServableFile(rootDir, requestUrl) {
  const requestedPath = resolveRequestPath(rootDir, requestUrl);
  if (requestedPath === null) {
    return null;
  }
  const realRootDir = await realPathOrNull(rootDir);
  if (realRootDir === null) {
    return null;
  }
  const realFilePath = await realPathOrNull(requestedPath);
  if (realFilePath === null) {
    return null;
  }
  if (!isServablePath(realRootDir, realFilePath)) {
    return null;
  }
  return realFilePath;
}

/**
 * Maps a request URL to the path it spells inside rootDir, or null when the URL is not servable.
 * @param {string} rootDir
 * @param {string | undefined} requestUrl
 */
function resolveRequestPath(rootDir, requestUrl) {
  const pathname = decodedPathnameOf(requestUrl);
  if (pathname === null) {
    return null;
  }
  let relativePath = pathname;
  if (pathname.endsWith("/")) {
    relativePath = `${pathname}index.html`;
  }
  const filePath = path.resolve(rootDir, `.${relativePath}`);
  if (!isServablePath(rootDir, filePath)) {
    return null;
  }
  return filePath;
}

/**
 * @param {string | undefined} requestUrl
 */
function decodedPathnameOf(requestUrl) {
  try {
    return decodeURIComponent(new URL(requestUrl ?? "/", "http://localhost").pathname);
  } catch {
    return null;
  }
}

/**
 * @param {string} rootDir
 * @param {string} filePath
 */
function isServablePath(rootDir, filePath) {
  if (!isInsideRoot(rootDir, filePath)) {
    return false;
  }
  return !isDeniedRelativePath(path.relative(rootDir, filePath));
}

/**
 * @param {string} rootDir
 * @param {string} filePath
 */
function isInsideRoot(rootDir, filePath) {
  const relative = path.relative(rootDir, filePath);
  if (relative === "") {
    return false;
  }
  return relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative);
}

/**
 * Splits on both separators because Windows accepts "\" in a URL path as a directory separator.
 * @param {string} relativePath path relative to the served root
 */
function isDeniedRelativePath(relativePath) {
  const segments = relativePath.split(/[\\/]/);
  const hasHiddenSegment = segments.some((segment) => segment.startsWith("."));
  if (hasHiddenSegment) {
    return true;
  }
  const lowerCasePath = segments.join("/").toLowerCase();
  return deniedRelativePaths.some((deniedPath) => isSameOrBelow(lowerCasePath, deniedPath));
}

/**
 * @param {string} lowerCasePath
 * @param {string} deniedPath
 */
function isSameOrBelow(lowerCasePath, deniedPath) {
  const isTheDeniedPath = lowerCasePath === deniedPath;
  const isBelowTheDeniedPath = lowerCasePath.startsWith(`${deniedPath}/`);
  return isTheDeniedPath || isBelowTheDeniedPath;
}

/**
 * @param {string} somePath
 */
async function realPathOrNull(somePath) {
  try {
    return await realpath(somePath);
  } catch {
    return null;
  }
}

/**
 * @param {string} filePath
 */
async function readFileOrNull(filePath) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

/**
 * @param {{ response: import("node:http").ServerResponse, filePath: string, body: Buffer, method: string | undefined }} context
 */
function sendFile({ response, filePath, body, method }) {
  response.writeHead(200, {
    "Content-Type": mimeTypeFor(filePath),
    "Cache-Control": "no-store",
  });
  if (method === "HEAD") {
    return response.end();
  }
  return response.end(body);
}

/**
 * @param {string} filePath
 */
function mimeTypeFor(filePath) {
  return (
    mimeTypeByExtension.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream"
  );
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} statusCode
 * @param {string} message
 */
function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

/**
 * @param {string[]} argv
 */
function startCommandLine(argv) {
  const port = readPort(argv);
  if (!isValidPort(port)) {
    console.error("Invalid --port value. Use an integer from 0 to 65535.");
    process.exitCode = 1;
    return;
  }
  const server = createProbeServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Serving ${repositoryRoot} at http://127.0.0.1:${listeningPortOf(server)}`);
  });
}

/**
 * @param {import("node:http").Server} server
 */
function listeningPortOf(server) {
  const address = server.address();
  if (address === null || typeof address === "string") {
    return String(address);
  }
  return address.port;
}

/**
 * @param {string[]} argv
 */
function readPort(argv) {
  const portIndex = argv.indexOf("--port");
  if (portIndex === -1) {
    return defaultPort;
  }
  return Number(argv[portIndex + 1]);
}

/**
 * @param {number} port
 */
function isValidPort(port) {
  return Number.isInteger(port) && port >= 0 && port <= 65535;
}

function isEntryPoint() {
  if (process.argv[1] === undefined) {
    return false;
  }
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isEntryPoint()) {
  startCommandLine(process.argv.slice(2));
}
