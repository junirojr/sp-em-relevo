import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  decodeArc,
  decodeRings,
  readArcUsage,
  readSharedArcs,
  validateTopology,
} from "./topology.js";

const tinyTopology = JSON.parse(
  readFileSync(new URL("./fixtures/tiny.topo.json", import.meta.url), "utf8"),
);

test("DAD-04 decodes quantized delta arcs into absolute coordinates", () => {
  const arc0 = decodeArc(tinyTopology.arcs[0], tinyTopology.transform);
  assert.deepEqual(arc0, [
    [0, 0],
    [10, 0],
  ]);

  const arc1 = decodeArc(tinyTopology.arcs[1], tinyTopology.transform);
  assert.deepEqual(arc1, [
    [10, 0],
    [10, 10],
  ]);
});

test("DAD-04 decodes all rings for each geometry in the topology", () => {
  const geometries = tinyTopology.objects.municipalities.geometries;
  const rings0 = decodeRings(geometries[0], tinyTopology.arcs, tinyTopology.transform);

  assert.equal(rings0.length, 1);
  assert.equal(rings0[0].length, 5);
  assert.deepEqual(rings0[0][0], [0, 0]);
  assert.deepEqual(rings0[0][4], [0, 0]);
});

test("DAD-04 validates that every arc is used by 1 or 2 geometries and rings are non-empty", () => {
  const validation = validateTopology(tinyTopology);
  assert.equal(validation.valid, true);
  assert.equal(validation.maxArcUsage <= 2, true);
  assert.equal(validation.minArcUsage >= 1, true);
  assert.equal(validation.emptyRingCount, 0);
});

test("DAD-04 computes arc usage map accurately", () => {
  const usage = readArcUsage(tinyTopology);
  assert.equal(usage.get(0)?.length, 1);
  assert.equal(usage.get(1)?.length, 2);
  assert.equal(usage.get(5)?.length, 2);
  assert.equal(usage.get(9)?.length, 1);
});

test("NIV-07 readSharedArcs identifies arcs shared by geometries of different groups", () => {
  const regionByMunicipality = new Map([
    ["3500001", "01"],
    ["3500002", "01"],
    ["3500003", "02"],
  ]);

  /**
   * @param {string} code
   */
  const groupOf = (code) => regionByMunicipality.get(code) ?? "";
  const shared = readSharedArcs(tinyTopology, groupOf);

  assert.deepEqual(shared, [5]);
});
