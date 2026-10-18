import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateElectionUnits,
  applyMunicipalityUpdate,
  buildElectionMapState,
  computeCandidateSharePct,
  computeDeputyBoundsCertificate,
  computeElectionHeight,
  computeMarginPp,
  computeUnitElectionResult,
  formatTieText,
  isBelowSectionsThreshold,
  sortCandidates,
  sortCandidatesByBallotNumber,
} from "./election.js";
import { getElectionNeutrals } from "./election-colors.js";
import { BASE_HEIGHT } from "./height.js";

test("ELE-01 computes leader and marginPp from nominal valid votes excluding blank, null, and annulled sub judice", () => {
  const unit = {
    code: "3550308",
    name: "Municipio Exemplo",
    blankVotes: 400,
    nullVotes: 600,
    candidates: [
      { ballotNumber: 91, name: "Candidato Alfa", party: "PA", validVotes: 6000 },
      { ballotNumber: 92, name: "Candidato Beta", party: "PB", validVotes: 4000 },
      {
        ballotNumber: 93,
        name: "Candidato Sub Judice",
        party: "PC",
        validVotes: 9000,
        voteDestination: "Anulado sub judice",
      },
    ],
  };

  const result = computeUnitElectionResult(unit, {
    mode: "first-round",
    selectedCandidateBallot: 92,
  });

  assert.equal(result.status, "leading");
  assert.equal(result.totalValidVotes, 10000);
  assert.equal(result.annulledSubJudiceVotes, 9000);
  assert.equal(result.leader?.ballotNumber, "91");
  assert.equal(result.runnerUp?.ballotNumber, "92");
  assert.equal(result.marginVotes, 2000);
  assert.ok(Math.abs(result.marginPp - 20) < 1e-12);
  assert.ok(Math.abs(computeMarginPp(6000, 4000, 10000) - 20) < 1e-12);
  assert.ok(Math.abs(computeCandidateSharePct(4000, 10000) - 40) < 1e-12);
  assert.equal(result.selectedCandidateVotes, 4000);
  assert.ok(Math.abs((result.selectedCandidateSharePct ?? 0) - 40) < 1e-12);
});

test("ELE-02 equal top votes produce tie state, base height, tie text, and invariance under input permutation", () => {
  const candidatesOrderA = [
    { ballotNumber: 95, name: "Candidato Cinco", party: "PA", validVotes: 1250 },
    { ballotNumber: 91, name: "Candidato Um", party: "PB", validVotes: 1250 },
    { ballotNumber: 93, name: "Candidato Tres", party: "PC", validVotes: 500 },
  ];
  const candidatesOrderB = [candidatesOrderA[2], candidatesOrderA[1], candidatesOrderA[0]];

  const resA = computeUnitElectionResult(
    { code: "3500105", candidates: candidatesOrderA },
    { theme: "dark" },
  );
  const resB = computeUnitElectionResult(
    { code: "3500105", candidates: candidatesOrderB },
    { theme: "dark" },
  );

  assert.equal(resA.status, "tie");
  assert.equal(resA.label, "Empate");
  assert.equal(resA.tieText, formatTieText(1250));
  assert.ok(resA.tieText?.startsWith("Empate:"));
  assert.ok(resA.tieText?.endsWith("votos cada"));
  assert.equal(resA.leader, null);
  assert.equal(resA.marginPp, 0);
  assert.equal(resA.height, BASE_HEIGHT);
  assert.equal(resA.colorKey, "tie");
  assert.equal(resA.color, getElectionNeutrals("dark").tie);

  assert.deepEqual(resA, resB);
  assert.equal(resA.tiedCandidates[0].ballotNumber, "91");
  assert.equal(resA.tiedCandidates[1].ballotNumber, "95");
});

test("ELE-02 zero valid votes produce no-result state with zero margin and base height", () => {
  const resZero = computeUnitElectionResult(
    {
      code: "3500204",
      candidates: [
        { ballotNumber: 92, name: "Candidato Beta", party: "PB", validVotes: 0 },
        { ballotNumber: 91, name: "Candidato Alfa", party: "PA", validVotes: 0 },
      ],
    },
    { theme: "light" },
  );

  assert.equal(resZero.status, "no-result");
  assert.equal(resZero.visualStatus, "no-result");
  assert.equal(resZero.leader, null);
  assert.equal(resZero.totalValidVotes, 0);
  assert.equal(resZero.marginPp, 0);
  assert.equal(resZero.height, BASE_HEIGHT);
  assert.equal(resZero.colorKey, "noResult");
  assert.equal(resZero.color, getElectionNeutrals("light").noResult);
});

test("ELE-03 regional aggregation sums votes across member municipalities and finds regional leader even when leading fewer municipalities", () => {
  // Candidate 91 leads 1 large municipality; Candidate 92 leads 3 small municipalities.
  // Sum of votes gives Candidate 91: 8000 + 400 + 400 + 400 = 9200 vs Candidate 92: 2000 + 600 + 600 + 600 = 3800.
  const municipalities = [
    {
      code: "35001",
      name: "Polo Regional",
      candidates: [
        { ballotNumber: 91, name: "Candidato Alfa", party: "PA", validVotes: 8000 },
        { ballotNumber: 92, name: "Candidato Beta", party: "PB", validVotes: 2000 },
      ],
    },
    {
      code: "35002",
      name: "Municipio B",
      candidates: [
        { ballotNumber: 91, name: "Candidato Alfa", party: "PA", validVotes: 400 },
        { ballotNumber: 92, name: "Candidato Beta", party: "PB", validVotes: 600 },
      ],
    },
    {
      code: "35003",
      name: "Municipio C",
      candidates: [
        { ballotNumber: 91, name: "Candidato Alfa", party: "PA", validVotes: 400 },
        { ballotNumber: 92, name: "Candidato Beta", party: "PB", validVotes: 600 },
      ],
    },
    {
      code: "35004",
      name: "Municipio D",
      candidates: [
        { ballotNumber: 91, name: "Candidato Alfa", party: "PA", validVotes: 400 },
        { ballotNumber: 92, name: "Candidato Beta", party: "PB", validVotes: 600 },
      ],
    },
  ];

  const regional = aggregateElectionUnits(municipalities, {
    code: "RA-01",
    name: "Regiao Exemplo",
  });

  assert.equal(regional.ledMunicipalitiesByBallot["91"], 1);
  assert.equal(regional.ledMunicipalitiesByBallot["92"], 3);
  assert.equal(regional.leader?.ballotNumber, "91");
  assert.equal(regional.leader?.validVotes, 9200);
  assert.equal(regional.runnerUp?.validVotes, 3800);
  assert.equal(regional.totalValidVotes, 13000);
  assert.ok(Math.abs(regional.marginPp - ((9200 - 3800) / 13000) * 100) < 1e-12);
});

test("ELE-04 linear height maps 0 to 100 pp on fixed domain with exaggeration and identical height across offices", () => {
  assert.equal(computeElectionHeight(0), BASE_HEIGHT);
  assert.equal(computeElectionHeight(100, { baseHeight: 1, span: 9, exaggeration: 1 }), 10);
  assert.equal(computeElectionHeight(50, { baseHeight: 1, span: 9, exaggeration: 1 }), 5.5);
  assert.equal(computeElectionHeight(50, { baseHeight: 1, span: 9, exaggeration: 2 }), 10);
  assert.equal(computeElectionHeight(50, { minHeight: 0, maxHeight: 10, exaggeration: 2 }), 10);
  assert.equal(computeElectionHeight(80, { heightMode: "flat", exaggeration: 2 }), BASE_HEIGHT);

  const presUnit = computeUnitElectionResult({
    code: "35100",
    candidates: [
      { ballotNumber: 91, name: "Cand A", party: "PA", validVotes: 650 },
      { ballotNumber: 92, name: "Cand B", party: "PB", validVotes: 350 },
    ],
  });
  const govUnit = computeUnitElectionResult({
    code: "35200",
    candidates: [
      { ballotNumber: 71, name: "Cand C", party: "PC", validVotes: 6500 },
      { ballotNumber: 72, name: "Cand D", party: "PD", validVotes: 3500 },
    ],
  });

  assert.equal(presUnit.marginPp, 30);
  assert.equal(govUnit.marginPp, 30);
  assert.equal(presUnit.height, govUnit.height);
});

test("ELE-05 enforces 50% sections threshold at 49.99% and 50.00% in live and replay modes while first-round has no threshold", () => {
  assert.equal(
    isBelowSectionsThreshold({ sectionsCounted: 4999, sectionsTotal: 10000, mode: "live" }),
    true,
  );
  assert.equal(
    isBelowSectionsThreshold({ sectionsCounted: 5000, sectionsTotal: 10000, mode: "live" }),
    false,
  );
  assert.equal(isBelowSectionsThreshold({ pst: "49,99", mode: "replay" }), true);
  assert.equal(isBelowSectionsThreshold({ pst: "50,00", mode: "replay" }), false);
  assert.equal(
    isBelowSectionsThreshold({ sectionsCounted: 10, sectionsTotal: 1000, mode: "first-round" }),
    false,
  );

  const rawUnit4999 = {
    code: "35010",
    sectionsCounted: 4999,
    sectionsTotal: 10000,
    candidates: [
      { ballotNumber: 91, name: "Cand Alfa", party: "PA", validVotes: 700 },
      { ballotNumber: 92, name: "Cand Beta", party: "PB", validVotes: 300 },
    ],
  };
  const rawUnit5000 = {
    ...rawUnit4999,
    sectionsCounted: 5000,
  };

  const live4999 = computeUnitElectionResult(rawUnit4999, { mode: "live", theme: "dark" });
  const live5000 = computeUnitElectionResult(rawUnit5000, { mode: "live", theme: "dark" });
  const firstRound4999 = computeUnitElectionResult(rawUnit4999, {
    mode: "first-round",
    theme: "dark",
  });

  assert.equal(live4999.belowSectionsThreshold, true);
  assert.equal(live4999.visualStatus, "insufficient-sections");
  assert.equal(live4999.height, BASE_HEIGHT);
  assert.equal(live4999.leader?.ballotNumber, "91");
  assert.equal(live4999.marginPp, 40);
  assert.equal(live4999.color, live5000.color);

  assert.equal(live5000.belowSectionsThreshold, false);
  assert.equal(live5000.visualStatus, "leading");
  assert.ok(live5000.height > BASE_HEIGHT);

  assert.equal(firstRound4999.belowSectionsThreshold, false);
  assert.equal(firstRound4999.height, live5000.height);
});

test("ELE-06 applyMunicipalityUpdate updates only the target municipality without mutating or altering any other municipality", () => {
  const initialInputs = [
    {
      code: "35001",
      name: "Mun A",
      candidates: [
        { ballotNumber: 91, name: "Cand A", party: "PA", validVotes: 600 },
        { ballotNumber: 92, name: "Cand B", party: "PB", validVotes: 400 },
      ],
    },
    {
      code: "35002",
      name: "Mun B",
      candidates: [
        { ballotNumber: 91, name: "Cand A", party: "PA", validVotes: 300 },
        { ballotNumber: 92, name: "Cand B", party: "PB", validVotes: 700 },
      ],
    },
    {
      code: "35003",
      name: "Mun C",
      candidates: [
        { ballotNumber: 91, name: "Cand A", party: "PA", validVotes: 500 },
        { ballotNumber: 92, name: "Cand B", party: "PB", validVotes: 500 },
      ],
    },
  ];

  const state0 = buildElectionMapState(initialInputs, { mode: "live", theme: "dark" });
  const refMunB = state0.municipalities["35002"];
  const refMunC = state0.municipalities["35003"];
  const colorB = state0.colorsByCode["35002"];
  const heightB = state0.heightsByCode["35002"];

  const updatedState = applyMunicipalityUpdate(
    state0,
    "35001",
    {
      code: "35001",
      name: "Mun A",
      candidates: [
        { ballotNumber: 91, name: "Cand A", party: "PA", validVotes: 200 },
        { ballotNumber: 92, name: "Cand B", party: "PB", validVotes: 800 },
      ],
    },
    {
      mode: "live",
      theme: "dark",
      colorByBallotNumber: state0.palette.colorByBallotNumber,
    },
  );

  assert.equal(updatedState.changed, true);
  assert.equal(updatedState.municipalities["35001"].leader?.ballotNumber, "92");
  assert.equal(updatedState.municipalities["35002"], refMunB);
  assert.equal(updatedState.municipalities["35003"], refMunC);
  assert.equal(updatedState.colorsByCode["35002"], colorB);
  assert.equal(updatedState.heightsByCode["35002"], heightB);
  assert.equal(state0.municipalities["35001"].leader?.ballotNumber, "91");
});

test("ELE-11 orders candidates by ballotNumber when votes are zero and by descending votes with ballotNumber tie-break when votes exist", () => {
  const zeroList = [
    { ballotNumber: 99, name: "Cand 99", party: "PA", validVotes: 0 },
    { ballotNumber: 12, name: "Cand 12", party: "PB", validVotes: 0 },
    { ballotNumber: 45, name: "Cand 45", party: "PC", validVotes: 0 },
  ];

  const orderedZero = sortCandidates(zeroList, 0);
  assert.deepEqual(
    orderedZero.map((c) => c.ballotNumber),
    [12, 45, 99],
  );

  const votedList = [
    { ballotNumber: 99, name: "Cand 99", party: "PA", validVotes: 500 },
    { ballotNumber: 12, name: "Cand 12", party: "PB", validVotes: 500 },
    { ballotNumber: 45, name: "Cand 45", party: "PC", validVotes: 800 },
  ];

  const byVotes = sortCandidates(votedList, 1800);
  const byVotesPermuted = sortCandidates([...votedList].reverse(), 1800);
  assert.deepEqual(
    byVotes.map((c) => c.ballotNumber),
    [45, 12, 99],
  );
  assert.deepEqual(byVotes, byVotesPermuted);

  const byBallot = sortCandidatesByBallotNumber(votedList);
  const byBallotPermuted = sortCandidatesByBallotNumber([...votedList].reverse());
  assert.deepEqual(
    byBallot.map((c) => c.ballotNumber),
    [12, 45, 99],
  );
  assert.deepEqual(byBallot, byBallotPermuted);
});

test("TUR-04 deputy bounds certificate certifies exact leader when minVotes > maxVotes of all others and flags uncertainLeader on overlap", () => {
  const certifiedUnits = [
    {
      code: "35001",
      otherVotes: 300,
      tenthPlaceVotes: 80,
      candidates: [
        { ballotNumber: 9001, name: "Dep Alfa", party: "PA", validVotes: 1000 },
        { ballotNumber: 9002, name: "Dep Beta", party: "PB", validVotes: 600 },
      ],
    },
    {
      code: "35002",
      otherVotes: 250,
      tenthPlaceVotes: 70,
      candidates: [
        { ballotNumber: 9002, name: "Dep Beta", party: "PB", validVotes: 200 },
        { ballotNumber: 9003, name: "Dep Gama", party: "PC", validVotes: 150 },
      ],
    },
  ];

  // Dep Alfa: listed in 35001 (1000), unlisted in 35002 -> minVotes=1000, maxVotes=1000+min(70,250)=1070
  // Dep Beta: listed in both (600+200) -> minVotes=800, maxVotes=800
  // Since 1000 > 800, Dep Alfa is certified leader!
  const certExact = computeDeputyBoundsCertificate(certifiedUnits);
  assert.equal(certExact.uncertainLeader, false);
  assert.equal(certExact.certified, true);
  assert.equal(certExact.leader?.ballotNumber, "9001");
  assert.equal(certExact.bounds.minVotes, 1000);
  assert.equal(certExact.bounds.maxVotes, 1070);

  const overlappingUnits = [
    {
      code: "35001",
      otherVotes: 400,
      tenthPlaceVotes: 150,
      candidates: [
        { ballotNumber: 9001, name: "Dep Alfa", party: "PA", validVotes: 500 },
        { ballotNumber: 9002, name: "Dep Beta", party: "PB", validVotes: 450 },
      ],
    },
    {
      code: "35002",
      otherVotes: 500,
      tenthPlaceVotes: 120,
      candidates: [
        { ballotNumber: 9001, name: "Dep Alfa", party: "PA", validVotes: 50 },
        { ballotNumber: 9003, name: "Dep Gama", party: "PC", validVotes: 120 },
      ],
    },
  ];

  // Dep Alfa: listed in both -> minVotes=550, maxVotes=550
  // Dep Beta: listed in 35001 (450), unlisted in 35002 -> minVotes=450, maxVotes=450+min(120,500)=570
  // Since Dep Alfa minVotes (550) <= Dep Beta maxVotes (570), leader is uncertain!
  const certUncertain = computeDeputyBoundsCertificate(overlappingUnits);
  assert.equal(certUncertain.uncertainLeader, true);
  assert.equal(certUncertain.certified, false);
  assert.equal(certUncertain.leader, null);
  assert.equal(certUncertain.colorKey, "others");

  const aggUncertain = aggregateElectionUnits(overlappingUnits, {
    theme: "dark",
    isDeputyFreeSelection: true,
  });
  assert.equal(aggUncertain.uncertainLeader, true);
  assert.equal(aggUncertain.leader, null);
  assert.equal(aggUncertain.colorKey, "others");
  assert.equal(aggUncertain.color, getElectionNeutrals("dark").others);
});
