import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_CALCULATION_SENATE,
  BASE_CALCULATION_VALID_VOTES,
  buildElectionCompareModel,
} from "../../../src/features/election/election-compare-model.js";

test("F16-01: buildElectionCompareModel produces side-by-side comparison for 2 municipalities", () => {
  const lookup = {
    3550308: {
      code: "3550308",
      name: "São Paulo",
      validVotes: 1000000,
      candidates: [
        { ballotNumber: "13", validVotes: 600000, name: "Lula" },
        { ballotNumber: "22", validVotes: 400000, name: "Bolsonaro" },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    3509502: {
      code: "3509502",
      name: "Campinas",
      validVotes: 500000,
      candidates: [
        { ballotNumber: "13", validVotes: 200000, name: "Lula" },
        { ballotNumber: "22", validVotes: 300000, name: "Bolsonaro" },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  const model = buildElectionCompareModel(
    [
      { code: "3550308", name: "São Paulo" },
      { code: "3509502", name: "Campinas" },
    ],
    lookup,
    { office: "presidente" },
  );

  assert.ok(model, "model must be created");
  assert.equal(model.sides.length, 2);
  assert.equal(model.sides[0].name, "São Paulo");
  assert.equal(model.sides[1].name, "Campinas");
});

test("F16-02: Comparison model includes total valid votes and leaders for both sides", () => {
  const lookup = {
    3550308: {
      code: "3550308",
      validVotes: 1000,
      candidates: [
        { ballotNumber: "13", validVotes: 700 },
        { ballotNumber: "22", validVotes: 300 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    3509502: {
      code: "3509502",
      validVotes: 800,
      candidates: [
        { ballotNumber: "13", validVotes: 300 },
        { ballotNumber: "22", validVotes: 500 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  const model = buildElectionCompareModel([{ code: "3550308" }, { code: "3509502" }], lookup);

  assert.equal(model.sides[0].leader?.ballotNumber, "13");
  assert.equal(model.sides[1].leader?.ballotNumber, "22");
  assert.equal(model.sides[0].totalValidVotes, 1000);
  assert.equal(model.sides[1].totalValidVotes, 800);
});

test("F16-03: Comparison metrics calculate difference between metrics", () => {
  const lookup = {
    3550308: {
      code: "3550308",
      validVotes: 1000,
      candidates: [
        { ballotNumber: "13", validVotes: 600 },
        { ballotNumber: "22", validVotes: 400 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    3509502: {
      code: "3509502",
      validVotes: 1000,
      candidates: [
        { ballotNumber: "13", validVotes: 700 },
        { ballotNumber: "22", validVotes: 300 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  const model = buildElectionCompareModel([{ code: "3550308" }, { code: "3509502" }], lookup);

  assert.ok(model.metrics.length > 0, "metrics array must be present");
  const marginMetric = model.metrics.find((m) => m.id === "marginPp");
  assert.ok(marginMetric, "marginPp metric must be calculated");
});

test("F16-04: Comparison supports declared calculation base for valid votes", () => {
  const lookup = {
    3550308: { code: "3550308", candidates: [], sectionsCounted: 100, sectionsTotal: 100 },
    3509502: { code: "3509502", candidates: [], sectionsCounted: 100, sectionsTotal: 100 },
  };

  const modelPres = buildElectionCompareModel([{ code: "3550308" }, { code: "3509502" }], lookup, {
    office: "presidente",
  });
  assert.equal(modelPres.calculationBase, BASE_CALCULATION_VALID_VOTES);

  const modelSen = buildElectionCompareModel([{ code: "3550308" }, { code: "3509502" }], lookup, {
    office: "senador",
  });
  assert.equal(modelSen.calculationBase, BASE_CALCULATION_SENATE);
});

test("F16-05: Pair key is formatted deterministically as codeA|codeB", () => {
  const lookup = {
    3550308: { code: "3550308", candidates: [], sectionsCounted: 100, sectionsTotal: 100 },
    3509502: { code: "3509502", candidates: [], sectionsCounted: 100, sectionsTotal: 100 },
  };

  const model = buildElectionCompareModel([{ code: "3550308" }, { code: "3509502" }], lookup);
  assert.equal(model.pairKey, "3550308|3509502");
});
