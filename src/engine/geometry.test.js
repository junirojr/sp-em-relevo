import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildMunicipalities, buildOwnedLines } from "./geometry.js";

const TINY_TOPOLOGY_URL = new URL("../domain/fixtures/tiny.topo.json", import.meta.url);

async function readTinyTopology() {
  return JSON.parse(await readFile(TINY_TOPOLOGY_URL, "utf8"));
}

test("BAS-03 buildMunicipalities puts every municipality in one plate with one instance each", async () => {
  const { municipalities, plate } = buildMunicipalities(await readTinyTopology());

  assert.deepEqual(
    municipalities.map((municipality) => municipality.code),
    ["3500001", "3500002", "3500003"],
  );
  assert.equal(plate.instanceCount, 3);
  assert.deepEqual(
    municipalities.map((municipality) => municipality.instanceId),
    [0, 1, 2],
  );
});

test("BAS-03 buildMunicipalities centers outlines and bounds on the map center", async () => {
  const { municipalities, mapCenter } = buildMunicipalities(await readTinyTopology());
  const first = municipalities[0];

  assert.deepEqual([mapCenter.x, mapCenter.y], [15, 5]);
  assert.deepEqual([first.bounds.min.x, first.bounds.max.x], [-15, -5]);
  assert.deepEqual([first.bounds.min.y, first.bounds.max.y], [-5, 5]);
  assert.equal(first.outline.length, 4 * 4);
});

test("BAS-03 buildOwnedLines records the owner of every vertex", async () => {
  const { municipalities } = buildMunicipalities(await readTinyTopology());

  const lines = buildOwnedLines(municipalities, [2, 0]);

  const owners = Array.from(lines.userData.owners);
  assert.equal(owners.length, 16);
  assert.deepEqual(owners.slice(0, 8), [2, 2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(owners.slice(8), [0, 0, 0, 0, 0, 0, 0, 0]);
});
