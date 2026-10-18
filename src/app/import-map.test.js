import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("BAS-08 exact three version in devDependencies matches both import map entries in index.html", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const devDeps = packageJson.devDependencies ?? {};
  const threeVersion = devDeps.three;
  const axeVersion = devDeps["@axe-core/playwright"];

  assert.ok(threeVersion, "three version must be present in devDependencies");
  assert.equal(threeVersion.startsWith("^"), false, "version must be exact, without ^");
  assert.equal(threeVersion.startsWith("~"), false, "version must be exact, without ~");

  assert.ok(axeVersion, "@axe-core/playwright version must be present in devDependencies");
  assert.equal(axeVersion.startsWith("^"), false, "axe version must be exact, without ^");
  assert.equal(axeVersion.startsWith("~"), false, "axe version must be exact, without ~");

  const indexHtml = fs.readFileSync("index.html", "utf8");
  const match = indexHtml.match(/<script\s+type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html must contain an import map script");

  const importMap = JSON.parse(match[1]);
  const imports = importMap.imports ?? {};

  const expectedModuleUrl = `https://cdn.jsdelivr.net/npm/three@${threeVersion}/build/three.module.js`;
  const expectedAddonsUrl = `https://cdn.jsdelivr.net/npm/three@${threeVersion}/examples/jsm/`;

  assert.equal(imports.three, expectedModuleUrl);
  assert.equal(imports["three/addons/"], expectedAddonsUrl);
});
