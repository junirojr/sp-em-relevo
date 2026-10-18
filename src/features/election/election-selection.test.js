import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTerritory } from "../../domain/territory.js";
import {
  BASE_CALCULATION_SENATE,
  BASE_CALCULATION_VALID_VOTES,
  buildElectionCompareModel,
  computeDisplayedMarginPp,
  describeElectionCompareSide,
  formatCandidateMargin,
  formatCandidateShare,
  resolveCalculationBase,
  resolveColorText,
  resolveOfficeLabel,
  UNCERTAIN_LEADER_MESSAGE,
} from "./election-compare-model.js";
import {
  buildElectionSearchEntries,
  findElectionSearchResults,
} from "./election-search-model.js";
import {
  buildElectionTableColumns,
  buildElectionTableModel,
  buildElectionTableRows,
} from "./election-table-model.js";

// Fixtures for testing
const MOCK_MUNICIPALITIES = [
  {
    code: "3550308",
    name: "Sao Paulo",
    regionCode: "1",
    governmentRegionCode: "rg-40",
    governmentRegionName: "RG de Sao Paulo",
    population: 11451245,
    areaKm2: 1521.1,
    gdpThousandBrl: 828980608,
  },
  {
    code: "3509502",
    name: "Campinas",
    regionCode: "6",
    governmentRegionCode: "rg-11",
    governmentRegionName: "RG de Campinas",
    population: 1139047,
    areaKm2: 795.7,
    gdpThousandBrl: 72946774,
  },
  {
    code: "3549904",
    name: "Sao Jose dos Campos",
    regionCode: "4",
    governmentRegionCode: "rg-38",
    governmentRegionName: "RG de Sao Jose dos Campos",
    population: 697054,
    areaKm2: 1099.4,
    gdpThousandBrl: 39515000,
  },
];

const MOCK_REGIONS = [
  { code: "1", label: "RM Sao Paulo" },
  { code: "4", label: "RA Sao Jose dos Campos" },
  { code: "6", label: "RA Campinas" },
];

const MOCK_GOV_REGIONS = [
  { code: "rg-11", label: "RG de Campinas" },
  { code: "rg-38", label: "RG de Sao Jose dos Campos" },
  { code: "rg-40", label: "RG de Sao Paulo" },
];

const territory = createTerritory({
  municipalities: MOCK_MUNICIPALITIES,
  regions: MOCK_REGIONS,
  governmentRegions: MOCK_GOV_REGIONS,
});

describe("Election Selection, Compare, Search and Table Model (ELE-11, ELE-22, RGV-03, ACE-02, TUR-04)", () => {
  it("ELE-11 orders candidates by ballot number when zero votes, and by descending votes with ballot tie-break", () => {
    const zeroVotesData = {
      code: "3550308",
      name: "Sao Paulo",
      validVotes: 0,
      candidates: [
        { ballotNumber: 22, name: "Cand B", party: "PL", validVotes: 0 },
        { ballotNumber: 13, name: "Cand A", party: "PT", validVotes: 0 },
        { ballotNumber: 15, name: "Cand C", party: "MDB", validVotes: 0 },
      ],
    };

    const sideZero = describeElectionCompareSide(
      { code: "3550308", name: "Sao Paulo" },
      { "3550308": zeroVotesData },
    );
    // Before count / zero votes: ballot number ascending (13, 15, 22)
    const ballotsZero = sideZero.candidates.map((c) => c.ballotNumber);
    assert.deepEqual(ballotsZero, ["13", "15", "22"]);

    const withVotesData = {
      code: "3550308",
      name: "Sao Paulo",
      validVotes: 1000,
      candidates: [
        { ballotNumber: 15, name: "Cand C", party: "MDB", validVotes: 100 },
        { ballotNumber: 22, name: "Cand B", party: "PL", validVotes: 450 },
        { ballotNumber: 13, name: "Cand A", party: "PT", validVotes: 450 },
      ],
    };

    const sideVotes = describeElectionCompareSide(
      { code: "3550308", name: "Sao Paulo" },
      { "3550308": withVotesData },
    );
    // With votes: 450 votes tied between 13 and 22 -> 13 comes first by tie-break, then 22, then 15
    const ballotsVotes = sideVotes.candidates.map((c) => c.ballotNumber);
    assert.deepEqual(ballotsVotes, ["13", "22", "15"]);
  });

  it("ELE-22 declares calculation base as valid nominal votes and senate as two votes per voter", () => {
    assert.equal(resolveCalculationBase("presidente"), BASE_CALCULATION_VALID_VOTES);
    assert.equal(resolveCalculationBase("governador"), BASE_CALCULATION_VALID_VOTES);
    assert.equal(resolveCalculationBase("deputado-federal"), BASE_CALCULATION_VALID_VOTES);
    assert.equal(resolveCalculationBase("deputado-estadual"), BASE_CALCULATION_VALID_VOTES);
    assert.equal(resolveCalculationBase("senador"), BASE_CALCULATION_SENATE);
    assert.equal(resolveCalculationBase("senado"), BASE_CALCULATION_SENATE);
  });

  it("ELE-22 displays margin as direct difference of displayed percentages with two decimal places", () => {
    // Example: leader 51.934% (rounds to 51.93%), second 38.204% (rounds to 38.20%)
    // Direct difference: 51.93 - 38.20 = 13.73 pp
    const p1 = 51.934;
    const p2 = 38.204;
    const diff = computeDisplayedMarginPp(p1, p2);
    assert.equal(diff, 13.73);
    assert.equal(formatCandidateMargin(diff), "13,73 pp");

    // Exact match test
    const mockElectionUnits = {
      "3550308": {
        code: "3550308",
        name: "Sao Paulo",
        totalValidVotes: 100000,
        candidates: [
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 51934 },
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 38204 },
        ],
      },
    };

    const side = describeElectionCompareSide(
      { code: "3550308", name: "Sao Paulo" },
      mockElectionUnits,
    );

    assert.equal(side.leaderPct, "51,93%");
    assert.equal(side.secondPct, "38,20%");
    assert.equal(side.marginPp, 13.73);
    assert.equal(side.formattedMargin, "13,73 pp");
  });

  it("ELE-22 projects votes, shares, and margin in election comparison model", () => {
    const mockUnits = {
      "3550308": {
        code: "3550308",
        name: "Sao Paulo",
        totalValidVotes: 100000,
        sectionsCounted: 100,
        sectionsTotal: 100,
        candidates: [
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 60000 },
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 40000 },
        ],
      },
      "3509502": {
        code: "3509502",
        name: "Campinas",
        totalValidVotes: 50000,
        sectionsCounted: 50,
        sectionsTotal: 50,
        candidates: [
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 35000 },
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 15000 },
        ],
      },
    };

    const compareModel = buildElectionCompareModel(
      [{ code: "3550308", name: "Sao Paulo" }, { code: "3509502", name: "Campinas" }],
      mockUnits,
      { office: "presidente" },
    );

    assert.equal(compareModel.calculationBase, BASE_CALCULATION_VALID_VOTES);
    assert.equal(compareModel.sides[0].leaderPct, "60,00%");
    assert.equal(compareModel.sides[0].secondPct, "40,00%");
    assert.equal(compareModel.sides[0].formattedMargin, "20,00 pp");

    assert.equal(compareModel.sides[1].leaderPct, "70,00%");
    assert.equal(compareModel.sides[1].secondPct, "30,00%");
    assert.equal(compareModel.sides[1].formattedMargin, "40,00 pp");

    assert.equal(compareModel.metrics.length, 3);
    assert.equal(compareModel.metrics[0].id, "totalValidVotes");
    assert.equal(compareModel.metrics[1].id, "sectionsPct");
    assert.equal(compareModel.metrics[2].id, "marginPp");
  });

  it("ELE-22 projects votes, shares, declared base and margin in election search model", () => {
    const entries = buildElectionSearchEntries(territory);
    assert.ok(entries.length > 0);

    const mockUnits = {
      "3550308": {
        code: "3550308",
        name: "Sao Paulo",
        totalValidVotes: 100000,
        sectionsCounted: 100,
        sectionsTotal: 100,
        candidates: [
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 60000 },
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 40000 },
        ],
      },
    };

    const searchResults = findElectionSearchResults({
      query: "Sao Paulo",
      entries,
      electionLookup: mockUnits,
      office: "senador",
    });

    assert.ok(searchResults.foundCount >= 1);
    const munMatch = searchResults.results.find((r) => r.entry.code === "3550308");
    assert.ok(munMatch);
    assert.equal(munMatch.calculationBase, BASE_CALCULATION_SENATE);
    assert.equal(munMatch.leaderPct, "60,00%");
    assert.equal(munMatch.secondPct, "40,00%");
    assert.equal(munMatch.marginPp, 20);
    assert.equal(munMatch.formattedMargin, "20,00 pp");
  });

  it("RGV-03 consumes groupOf across Municipality, RG and RA aggregating votes and recalculating leader", () => {
    // 3 municipalities:
    // Mun 1: Campinas (RG: rg-11, RA: 6) -> PL: 3000, PT: 2000
    // Mun 2: SJC (RG: rg-38, RA: 4) -> PL: 1000, PT: 1500
    // Mun 3: SP (RG: rg-40, RA: 1) -> PL: 4000, PT: 6000
    const mockUnits = {
      "3509502": {
        code: "3509502",
        name: "Campinas",
        totalValidVotes: 5000,
        candidates: [
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 3000 },
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 2000 },
        ],
      },
      "3549904": {
        code: "3549904",
        name: "Sao Jose dos Campos",
        totalValidVotes: 2500,
        candidates: [
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 1000 },
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 1500 },
        ],
      },
      "3550308": {
        code: "3550308",
        name: "Sao Paulo",
        totalValidVotes: 10000,
        candidates: [
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 4000 },
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 6000 },
        ],
      },
    };

    // Test Government Region level
    const govRows = buildElectionTableRows({
      level: "governmentRegion",
      mode: "second-round",
      office: "presidente",
      municipalities: MOCK_MUNICIPALITIES,
      governmentRegions: MOCK_GOV_REGIONS,
      electionUnits: mockUnits,
      territory,
    });

    assert.equal(govRows.length, 3);
    const rgCampinas = govRows.find((r) => r.code === "rg-11");
    assert.ok(rgCampinas);
    assert.equal(rgCampinas.leader, "Candidato B");
    assert.equal(rgCampinas.party, "PL");
    assert.equal(rgCampinas.leaderPct, "60,00%");
    assert.equal(rgCampinas.secondPct, "40,00%");
    assert.equal(rgCampinas.margin, "20,00 pp");

    // Test Administrative Region level
    const regRows = buildElectionTableRows({
      level: "region",
      mode: "second-round",
      office: "presidente",
      municipalities: MOCK_MUNICIPALITIES,
      regions: MOCK_REGIONS,
      electionUnits: mockUnits,
      territory,
    });

    assert.equal(regRows.length, 3);
    const raSp = regRows.find((r) => r.code === "1");
    assert.ok(raSp);
    assert.equal(raSp.leader, "Candidato A");
    assert.equal(raSp.party, "PT");
    assert.equal(raSp.leaderPct, "60,00%");
    assert.equal(raSp.secondPct, "40,00%");
    assert.equal(raSp.margin, "20,00 pp");
  });

  it("ACE-02 alternative table displays unit name, office, leader, party, percentages, margin, pst and color text", () => {
    const mockUnits = {
      "3550308": {
        code: "3550308",
        name: "Sao Paulo",
        totalValidVotes: 10000,
        sectionsCounted: 95,
        sectionsTotal: 100,
        candidates: [
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 5500 },
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 4500 },
        ],
      },
    };

    const columns = buildElectionTableColumns({ level: "municipality" });
    const colKeys = columns.map((c) => c.key);
    assert.deepEqual(colKeys, [
      "selection",
      "code",
      "name",
      "office",
      "leader",
      "party",
      "leaderPct",
      "secondPct",
      "margin",
      "sectionsPct",
      "colorText",
      "actions",
    ]);

    const tableModel = buildElectionTableModel({
      level: "municipality",
      office: "governador",
      mode: "first-round",
      municipalities: [MOCK_MUNICIPALITIES[0]],
      electionUnits: mockUnits,
    });

    assert.equal(tableModel.rows.length, 1);
    const row = tableModel.rows[0];
    assert.equal(row.name, "Sao Paulo");
    assert.equal(row.office, "Governador");
    assert.equal(row.leader, "Candidato A");
    assert.equal(row.party, "PT");
    assert.equal(row.leaderPct, "55,00%");
    assert.equal(row.secondPct, "45,00%");
    assert.equal(row.margin, "10,00 pp");
    assert.equal(row.sectionsPct, "95,00%");
    assert.equal(row.colorText, "Vermelho");
  });

  it("TUR-04 bounds certificate provides [minVotes, maxVotes] and detects uncertain leader when intervals overlap", () => {
    // 2 municipalities with deputy top-10 plus unlisted others ("demais")
    // Mun 1: Candidate X has 1000 votes, tenthPlace has 200 votes, otherVotes is 500
    // Mun 2: Candidate Y has 1000 votes, tenthPlace has 200 votes, otherVotes is 500
    // Both candidates can obtain up to min(200, 500) = 200 in the unlisted municipality.
    // Candidate X: [1000, 1200]
    // Candidate Y: [1000, 1200]
    // Since 1000 is not > 1200, leader is uncertain!
    const mun1 = {
      code: "mun1",
      name: "Municipio 1",
      totalValidVotes: 5000,
      otherVotes: 500,
      tenthPlaceVotes: 200,
      candidates: [
        { ballotNumber: 10101, name: "Deputado X", party: "PSOL", validVotes: 1000 },
      ],
    };

    const mun2 = {
      code: "mun2",
      name: "Municipio 2",
      totalValidVotes: 5000,
      otherVotes: 500,
      tenthPlaceVotes: 200,
      candidates: [
        { ballotNumber: 20202, name: "Deputado Y", party: "NOVO", validVotes: 1000 },
      ],
    };

    const sideUncertain = describeElectionCompareSide(
      { code: "group1", name: "Grupo Incerto" },
      { mun1, mun2 },
      {
        level: "region",
        municipalities: [
          { code: "mun1", name: "Municipio 1", regionCode: "group1" },
          { code: "mun2", name: "Municipio 2", regionCode: "group1" },
        ],
        territory: createTerritory({
          municipalities: [
            { code: "mun1", name: "Municipio 1", regionCode: "group1" },
            { code: "mun2", name: "Municipio 2", regionCode: "group1" },
          ],
          regions: [{ code: "group1", label: "Grupo Incerto" }],
        }),
        office: "deputado-federal",
        isDeputyFreeSelection: true,
      },
    );

    assert.equal(sideUncertain.uncertainLeader, true);
    assert.equal(sideUncertain.leader, null);
    assert.equal(sideUncertain.uncertainMessage, UNCERTAIN_LEADER_MESSAGE);
    assert.ok(sideUncertain.boundsCertificate);
    assert.equal(sideUncertain.boundsCertificate.certified, false);

    // Now test a certified leader:
    // Candidate X has 5000 votes in Mun 1, unlisted cap in Mun 2 is 200.
    // Candidate Y has 1000 votes in Mun 2, unlisted cap in Mun 1 is 200.
    // Candidate X minVotes: 5000 > Candidate Y maxVotes: 1200 -> Certified!
    const mun3 = {
      code: "mun1",
      name: "Municipio 1",
      totalValidVotes: 10000,
      otherVotes: 500,
      tenthPlaceVotes: 200,
      candidates: [
        { ballotNumber: 10101, name: "Deputado X", party: "PSOL", validVotes: 5000 },
      ],
    };

    const sideCertified = describeElectionCompareSide(
      { code: "group2", name: "Grupo Certificado" },
      { mun1: mun3, mun2 },
      {
        level: "region",
        municipalities: [
          { code: "mun1", name: "Municipio 1", regionCode: "group2" },
          { code: "mun2", name: "Municipio 2", regionCode: "group2" },
        ],
        territory: createTerritory({
          municipalities: [
            { code: "mun1", name: "Municipio 1", regionCode: "group2" },
            { code: "mun2", name: "Municipio 2", regionCode: "group2" },
          ],
          regions: [{ code: "group2", label: "Grupo Certificado" }],
        }),
        office: "deputado-federal",
        isDeputyFreeSelection: true,
      },
    );

    assert.equal(sideCertified.uncertainLeader, false);
    assert.ok(sideCertified.leader);
    assert.equal(sideCertified.leader.name, "Deputado X");
    assert.equal(sideCertified.boundsCertificate.certified, true);
    assert.equal(sideCertified.boundsCertificate.bounds.minVotes, 5000);
  });
});
