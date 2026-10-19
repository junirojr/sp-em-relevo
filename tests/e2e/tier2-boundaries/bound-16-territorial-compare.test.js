import assert from "node:assert/strict";
import test from "node:test";
import {
  buildElectionCompareModel,
  describeElectionCompareSide,
} from "../../../src/features/election/election-compare-model.js";

test("B16-01: Comparing a municipality against itself results in difference 'Iguais'", () => {
  const lookup = {
    3550308: {
      code: "3550308",
      name: "São Paulo",
      validVotes: 1000,
      candidates: [
        { ballotNumber: "13", validVotes: 600 },
        { ballotNumber: "22", validVotes: 400 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  const model = buildElectionCompareModel(
    [
      { code: "3550308", name: "São Paulo" },
      { code: "3550308", name: "São Paulo" },
    ],
    lookup,
  );

  const marginMetric = model.metrics.find((m) => m.id === "marginPp");
  assert.equal(marginMetric?.difference, "Iguais");
});

test("B16-02: Comparing municipality with votes against unit with 0 votes handles difference cleanly", () => {
  const lookup = {
    3550308: {
      code: "3550308",
      name: "São Paulo",
      validVotes: 1000,
      candidates: [{ ballotNumber: "13", validVotes: 1000 }],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    3500105: {
      code: "3500105",
      name: "Adamantina",
      validVotes: 0,
      candidates: [],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  const model = buildElectionCompareModel([{ code: "3550308" }, { code: "3500105" }], lookup);

  assert.equal(model.sides[0].totalValidVotes, 1000);
  assert.equal(model.sides[1].totalValidVotes, 0);
});

test("B16-03: Units with identical margin percentage points display 'Iguais'", () => {
  const lookup = {
    3550308: {
      code: "3550308",
      validVotes: 1000,
      candidates: [
        { ballotNumber: "13", validVotes: 550 },
        { ballotNumber: "22", validVotes: 450 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
    3509502: {
      code: "3509502",
      validVotes: 2000,
      candidates: [
        { ballotNumber: "22", validVotes: 1100 },
        { ballotNumber: "13", validVotes: 900 },
      ],
      sectionsCounted: 100,
      sectionsTotal: 100,
    },
  };

  // Both have 10.00 pp margin
  const model = buildElectionCompareModel([{ code: "3550308" }, { code: "3509502" }], lookup);

  const marginMetric = model.metrics.find((m) => m.id === "marginPp");
  assert.equal(marginMetric?.difference, "Iguais");
});

test("B16-04: describeElectionCompareSide with empty lookup map produces safe fallback side", () => {
  const side = describeElectionCompareSide({ code: "3599999" }, new Map());
  assert.equal(side.code, "3599999");
  assert.equal(side.totalValidVotes, 0);
  assert.equal(side.status, "no-result");
});

test("B16-05: Unknown office parameter in buildElectionCompareModel falls back to Presidente", () => {
  const model = buildElectionCompareModel(
    [{ code: "3550308" }, { code: "3509502" }],
    {},
    { office: "cargo-inexistente" },
  );

  assert.equal(model.officeLabel, "Presidente");
});
