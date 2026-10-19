import assert from "node:assert/strict";
import test from "node:test";
import {
  assignCandidateColors,
  getElectionNeutrals,
  getPartyColor,
  MAX_LEADER_DELTA_C,
  MAX_LEADER_DELTA_L,
} from "../../../src/domain/election-colors.js";
import { deltaEOklab, oklab } from "../../support/oklab.js";

test("F11-01: getPartyColor returns distinct colors for major political parties", () => {
  const ptColor = getPartyColor("PT", "dark");
  const plColor = getPartyColor("PL", "dark");
  const psdbColor = getPartyColor("PSDB", "dark");

  assert.ok(ptColor.startsWith("#"));
  assert.ok(plColor.startsWith("#"));
  assert.ok(psdbColor.startsWith("#"));
  assert.notEqual(ptColor, plColor);
  assert.notEqual(plColor, psdbColor);
});

test("F11-02: Leaders palette maintains lightness and chroma parity (|ΔL| <= 0.05, |ΔC| <= 0.03)", () => {
  const palette = assignCandidateColors(
    [
      { ballotNumber: "13", party: "PT", name: "Lula", votes: 10000 },
      { ballotNumber: "22", party: "PL", name: "Bolsonaro", votes: 9000 },
    ],
    "dark",
  );

  const col1 = palette.coloredCandidates[0].color;
  const col2 = palette.coloredCandidates[1].color;

  const lab1 = oklab(col1);
  const lab2 = oklab(col2);

  const deltaL = Math.abs(lab1.L - lab2.L);
  const c1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
  const c2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);
  const deltaC = Math.abs(c1 - c2);

  assert.ok(
    deltaL <= MAX_LEADER_DELTA_L + 1e-3,
    `deltaL ${deltaL} must be <= ${MAX_LEADER_DELTA_L}`,
  );
  assert.ok(
    deltaC <= MAX_LEADER_DELTA_C + 1e-3,
    `deltaC ${deltaC} must be <= ${MAX_LEADER_DELTA_C}`,
  );
});

test("F11-03: getElectionNeutrals returns exactly 3 distinct neutral tokens", () => {
  const neutrals = getElectionNeutrals("dark");
  assert.ok(neutrals.noResult, "must have noResult neutral");
  assert.ok(neutrals.tie, "must have tie neutral");
  assert.ok(neutrals.others, "must have others neutral");

  assert.notEqual(neutrals.noResult, neutrals.tie);
  assert.notEqual(neutrals.tie, neutrals.others);
  assert.notEqual(neutrals.noResult, neutrals.others);
});

test("F11-04: In light mode, neutrals have valid hex strings and proper contrast", () => {
  const neutrals = getElectionNeutrals("light");
  assert.match(neutrals.noResult, /^#[0-9a-fA-F]{6}$/);
  assert.match(neutrals.tie, /^#[0-9a-fA-F]{6}$/);
  assert.match(neutrals.others, /^#[0-9a-fA-F]{6}$/);

  const labNoResult = oklab(neutrals.noResult);
  const labTie = oklab(neutrals.tie);
  const deltaE = deltaEOklab(labNoResult, labTie);
  assert.ok(deltaE > 0.01, "neutrals must be distinguishable");
});

test("F11-05: In dark mode, neutrals are calibrated and different from light mode", () => {
  const darkNeutrals = getElectionNeutrals("dark");
  const lightNeutrals = getElectionNeutrals("light");

  assert.notEqual(darkNeutrals.noResult, lightNeutrals.noResult);
  assert.notEqual(darkNeutrals.tie, lightNeutrals.tie);
});
