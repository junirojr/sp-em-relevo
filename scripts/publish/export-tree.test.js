import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { exportTree, matchPattern } from "./export-tree.mjs";

test("PUB-02 matchPattern matches glob patterns correctly", () => {
  assert.equal(matchPattern("index.html", "index.html"), true);
  assert.equal(matchPattern("src/app/main.js", "src/**"), true);
  assert.equal(matchPattern("legacy/src/lab.js", "legacy/**"), true);
  assert.equal(matchPattern("data/mesh.topo.json", "data/*.json"), true);
  assert.equal(matchPattern("scripts/data/raw/data.csv", "scripts/data/*"), false);
  assert.equal(matchPattern("scripts/data/sources.js", "scripts/data/*"), true);
});

test("PUB-02 exportTree rejects target directory inside repository", () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "export-repo-"));
  const insideDir = path.join(repoDir, "export-output");

  assert.throws(
    () => exportTree({ repoDir, targetDir: insideDir }),
    /dentro do repositório|inside repository/i,
  );

  fs.rmSync(repoDir, { recursive: true, force: true });
});

test("PUB-02 exportTree rejects non-empty target directory", () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "export-repo-"));
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "export-target-"));
  fs.writeFileSync(path.join(targetDir, "existing.txt"), "hello");

  assert.throws(() => exportTree({ repoDir, targetDir }), /não vazi[ao]|not empty/i);

  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
});

test("PUB-02 exportTree copies files according to manifest and returns list", () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "export-repo-"));
  const targetDir = path.join(os.tmpdir(), `export-target-${Date.now()}`);

  // Create repo structure
  fs.writeFileSync(path.join(repoDir, "index.html"), "<html></html>");
  fs.mkdirSync(path.join(repoDir, "src", "app"), { recursive: true });
  fs.writeFileSync(path.join(repoDir, "src", "app", "main.js"), "console.log('ok');");
  fs.mkdirSync(path.join(repoDir, "legacy"), { recursive: true });
  fs.writeFileSync(path.join(repoDir, "legacy", "old.js"), "console.log('old');");

  // Manifest
  const manifest = {
    include: ["index.html", "src/**"],
    exclude: ["legacy/**"],
  };

  const exportedFiles = exportTree({
    repoDir,
    targetDir,
    manifest,
    skipScan: true,
  });

  assert.ok(fs.existsSync(path.join(targetDir, "index.html")));
  assert.ok(fs.existsSync(path.join(targetDir, "src", "app", "main.js")));
  assert.equal(fs.existsSync(path.join(targetDir, "legacy", "old.js")), false);

  assert.ok(exportedFiles.includes("index.html"));
  assert.ok(exportedFiles.some((f) => f.includes("main.js")));

  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
});

test("PUB-02 exportTree refuses a source file that is a symbolic link to a file outside the repository", {
  skip: fileSymlinkSkipReason(),
}, (t) => {
  const fixture = createExportFixture(t);
  const linkPath = path.join(fixture.repoDir, "src", "leak.txt");
  fs.symlinkSync(fixture.outsideSecretFile, linkPath, "file");

  assert.throws(() => exportFixture(fixture), /src\/leak\.txt: link simbólico/);

  assertNothingWasCopied(fixture);
});

test("PUB-02 exportTree refuses a directory link that points outside the repository", (t) => {
  const fixture = createExportFixture(t);
  linkDirectory(fixture.outsideDir, path.join(fixture.repoDir, "src", "escape-dir"));

  assert.throws(() => exportFixture(fixture), /src\/escape-dir: link simbólico/);

  assertNothingWasCopied(fixture);
});

test("PUB-02 exportTree names every refused link and still copies nothing", (t) => {
  const fixture = createExportFixture(t);
  linkDirectory(fixture.outsideDir, path.join(fixture.repoDir, "src", "escape-a"));
  linkDirectory(fixture.outsideDir, path.join(fixture.repoDir, "src", "escape-b"));

  assert.throws(
    () => exportFixture(fixture),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /src\/escape-a: link simbólico/);
      assert.match(error.message, /src\/escape-b: link simbólico/);
      assert.doesNotMatch(error.message, /index\.html/);
      return true;
    },
  );

  assertNothingWasCopied(fixture);
});

test("PUB-02 exportTree refuses a directory link even when it points inside the repository", (t) => {
  const fixture = createExportFixture(t);
  linkDirectory(
    path.join(fixture.repoDir, "src", "app"),
    path.join(fixture.repoDir, "src", "alias"),
  );

  assert.throws(() => exportFixture(fixture), /src\/alias: link simbólico/);

  assertNothingWasCopied(fixture);
});

test("PUB-02 exportTree ignores a link that the manifest does not select", (t) => {
  const fixture = createExportFixture(t);
  linkDirectory(fixture.outsideDir, path.join(fixture.repoDir, "legacy", "linked"));

  const exportedFiles = exportFixture(fixture);

  assert.deepEqual(exportedFiles.sort(), ["index.html", "src/app/main.js"]);
  assert.equal(fs.existsSync(path.join(fixture.targetDir, "legacy")), false);
});

test("PUB-02 exportTree exports a repository that is reached through a directory link", (t) => {
  const fixture = createExportFixture(t);
  const repoLink = path.join(fixture.workDir, "repo-link");
  linkDirectory(fixture.repoDir, repoLink);

  const exportedFiles = exportTree({
    repoDir: repoLink,
    targetDir: fixture.targetDir,
    manifest: fixture.manifest,
    skipScan: true,
  });

  assert.deepEqual(exportedFiles.sort(), ["index.html", "src/app/main.js"]);
  assert.equal(
    fs.readFileSync(path.join(fixture.targetDir, "src", "app", "main.js"), "utf-8"),
    "console.log('ok');",
  );
});

/**
 * @typedef {{
 *   workDir: string;
 *   repoDir: string;
 *   targetDir: string;
 *   outsideDir: string;
 *   outsideSecretFile: string;
 *   manifest: { include: string[]; exclude: string[] };
 * }} ExportFixture
 */

/**
 * Builds a small repository, a directory outside it that holds a secret, and an unused target.
 * @param {import("node:test").TestContext} t
 * @returns {ExportFixture}
 */
function createExportFixture(t) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "export-work-"));
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

  const repoDir = path.join(workDir, "repo");
  const outsideDir = path.join(workDir, "outside");
  const outsideSecretFile = path.join(outsideDir, "secret.txt");
  fs.mkdirSync(path.join(repoDir, "src", "app"), { recursive: true });
  fs.mkdirSync(path.join(repoDir, "legacy"), { recursive: true });
  fs.mkdirSync(outsideDir);
  fs.writeFileSync(path.join(repoDir, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(repoDir, "src", "app", "main.js"), "console.log('ok');");
  fs.writeFileSync(outsideSecretFile, "do not publish");

  return {
    workDir,
    repoDir,
    targetDir: path.join(workDir, "target"),
    outsideDir,
    outsideSecretFile,
    manifest: { include: ["index.html", "src/**"], exclude: ["legacy/**"] },
  };
}

/**
 * @param {ExportFixture} fixture
 * @returns {string[]}
 */
function exportFixture(fixture) {
  return exportTree({
    repoDir: fixture.repoDir,
    targetDir: fixture.targetDir,
    manifest: fixture.manifest,
    skipScan: true,
  });
}

/**
 * @param {ExportFixture} fixture
 */
function assertNothingWasCopied(fixture) {
  assert.equal(fs.existsSync(fixture.targetDir), false);
  assert.equal(fs.readFileSync(fixture.outsideSecretFile, "utf-8"), "do not publish");
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
 * @returns {string | false} the reason to skip, or false when file symbolic links can be created
 */
function fileSymlinkSkipReason() {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "export-symlink-probe-"));
  try {
    fs.symlinkSync(path.join(probeDir, "target.txt"), path.join(probeDir, "link.txt"), "file");
    return false;
  } catch (error) {
    if (isPermissionError(error)) {
      return "creating a file symbolic link needs a privilege this machine does not grant (EPERM)";
    }
    throw error;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isPermissionError(error) {
  return error instanceof Error && "code" in error && error.code === "EPERM";
}
