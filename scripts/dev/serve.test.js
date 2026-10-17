import assert from "node:assert/strict";
import fs from "node:fs";
import { get } from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createProbeServer } from "./serve.mjs";

const probeFiles = [
  { path: "/tests/publish-probe/index.html", mimeType: "text/html" },
  { path: "/tests/publish-probe/probe.js", mimeType: "text/javascript" },
  { path: "/tests/publish-probe/nested/echo.js", mimeType: "text/javascript" },
  { path: "/tests/publish-probe/probe.json", mimeType: "application/json" },
  { path: "/tests/publish-probe/probe.css", mimeType: "text/css" },
];

const servedPaths = [
  "/",
  "/index.html",
  "/src/app/main.js",
  "/data/regions.json",
  "/scripts/data/sources.js",
  "/tests/publish-probe/index.html",
];

const deniedPaths = [
  "/.git/config",
  "/.claude/settings.json",
  "/.gitignore",
  "/HANDOFF.md",
  "/todo.md",
  "/scripts/data/raw/data.csv",
  "/scripts/data/raw/",
  "/scripts/data/raw",
];

test("BAS-02 serves each probe file with status 200 and its MIME type", async () => {
  const server = createProbeServer();
  await listen(server);
  try {
    for (const probeFile of probeFiles) {
      const response = await fetch(urlFor(server, probeFile.path));
      assert.equal(response.status, 200, probeFile.path);
      assert.equal(mimeTypeOf(response), probeFile.mimeType, probeFile.path);
    }
  } finally {
    await close(server);
  }
});

test("BAS-02 answers 404 for a missing file", async () => {
  const server = createProbeServer();
  await listen(server);
  try {
    const response = await fetch(urlFor(server, "/tests/publish-probe/missing.js"));
    assert.equal(response.status, 404);
  } finally {
    await close(server);
  }
});

test("BAS-02 refuses an encoded path that leaves the repository root", async () => {
  const server = createProbeServer();
  await listen(server);
  try {
    const status = await rawStatus(server, "/%2e%2e%2fpackage.json");
    assert.equal(status, 404);
  } finally {
    await close(server);
  }
});

test("BAS-02 sends Cache-Control no-store on served files", async () => {
  const server = createProbeServer();
  await listen(server);
  try {
    const response = await fetch(urlFor(server, "/tests/publish-probe/probe.js"));
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await close(server);
  }
});

test("BAS-02 serves the page files and the data scripts next to the denied paths", async (t) => {
  const served = createServedRoot(t);
  const server = await startServer(t, served.rootDir);

  for (const requestPath of servedPaths) {
    assert.equal(await rawStatus(server, requestPath), 200, requestPath);
  }
});

test("BAS-02 answers 404 for hidden paths, HANDOFF.md, todo.md and scripts/data/raw although they exist", async (t) => {
  const served = createServedRoot(t);
  const server = await startServer(t, served.rootDir);

  for (const requestPath of deniedPaths) {
    assert.equal(await rawStatus(server, requestPath), 404, requestPath);
  }
});

test("BAS-02 answers 404 for denied paths spelled in another case", async (t) => {
  const served = createServedRoot(t);
  const server = await startServer(t, served.rootDir);
  const otherCasePaths = ["/handoff.md", "/TODO.MD", "/Scripts/Data/Raw/data.csv", "/.GIT/config"];

  for (const requestPath of otherCasePaths) {
    assert.equal(await rawStatus(server, requestPath), 404, requestPath);
  }
});

test("BAS-02 answers 404 for denied paths spelled with encoding, backslashes or trailing dots", async (t) => {
  const served = createServedRoot(t);
  const server = await startServer(t, served.rootDir);
  const disguisedPaths = [
    "/%2egit/config",
    "/.git%2fconfig",
    "/src/..%2f.git/config",
    "/src%5c..%5c.git%5cconfig",
    "/scripts%5cdata%5craw%5cdata.csv",
    "/HANDOFF.md.",
    "/HANDOFF.md%20",
  ];

  for (const requestPath of disguisedPaths) {
    assert.equal(await rawStatus(server, requestPath), 404, requestPath);
  }
});

test("BAS-02 answers 404 for a link inside the root that leads to a hidden directory", async (t) => {
  const served = createServedRoot(t);
  linkDirectory(path.join(served.rootDir, ".git"), path.join(served.rootDir, "src", "alias"));
  const server = await startServer(t, served.rootDir);

  assert.equal(await rawStatus(server, "/src/alias/config"), 404);
});

test("BAS-02 answers 404 for a link inside the root that leads outside it", async (t) => {
  const served = createServedRoot(t);
  linkDirectory(served.outsideDir, path.join(served.rootDir, "src", "outside"));
  const server = await startServer(t, served.rootDir);

  assert.equal(await rawStatus(server, "/src/outside/secret.txt"), 404);
});

/**
 * Builds a root that holds every file the tests ask for, so a 404 can only come from a deny
 * rule, plus a sibling directory outside the root that holds a secret.
 * @param {import("node:test").TestContext} t
 * @returns {{ rootDir: string, outsideDir: string }}
 */
function createServedRoot(t) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "serve-work-"));
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

  const rootDir = path.join(workDir, "root");
  const outsideDir = path.join(workDir, "outside");
  const rootFiles = [
    "index.html",
    "src/app/main.js",
    "data/regions.json",
    "scripts/data/sources.js",
    "scripts/data/raw/data.csv",
    "tests/publish-probe/index.html",
    ".git/config",
    ".claude/settings.json",
    ".gitignore",
    "HANDOFF.md",
    "todo.md",
  ];
  for (const rootFile of rootFiles) {
    writeFileWithParents(path.join(rootDir, rootFile), "content");
  }
  writeFileWithParents(path.join(outsideDir, "secret.txt"), "do not serve");

  return { rootDir, outsideDir };
}

/**
 * @param {string} filePath
 * @param {string} content
 */
function writeFileWithParents(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/**
 * A junction needs no privilege on Windows; on other systems the type is ignored and this is
 * an ordinary symbolic link.
 * @param {string} targetDir
 * @param {string} linkPath
 */
function linkDirectory(targetDir, linkPath) {
  fs.symlinkSync(targetDir, linkPath, "junction");
}

/**
 * Starts a server on rootDir and closes it when the test ends.
 * @param {import("node:test").TestContext} t
 * @param {string} rootDir
 * @returns {Promise<import("node:http").Server>}
 */
async function startServer(t, rootDir) {
  const server = createProbeServer({ rootDir });
  await listen(server);
  t.after(() => close(server));
  return server;
}

/**
 * @param {import("node:http").Server} server
 * @returns {Promise<void>}
 */
function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

/**
 * @param {import("node:http").Server} server
 * @returns {Promise<void>}
 */
function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

/**
 * @param {import("node:http").Server} server
 * @param {string} requestPath
 */
function urlFor(server, requestPath) {
  return `http://127.0.0.1:${portOf(server)}${requestPath}`;
}

/**
 * @param {import("node:http").Server} server
 */
function portOf(server) {
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  return address.port;
}

/**
 * @param {Response} response
 */
function mimeTypeOf(response) {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.split(";")[0].trim();
}

/**
 * Sends the path exactly as given: no URL parsing, so "." and ".." segments reach the server.
 * @param {import("node:http").Server} server
 * @param {string} requestPath
 * @returns {Promise<number | undefined>}
 */
function rawStatus(server, requestPath) {
  const requestOptions = { host: "127.0.0.1", port: portOf(server), path: requestPath };
  return new Promise((resolve, reject) => {
    get(requestOptions, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on("error", reject);
  });
}
