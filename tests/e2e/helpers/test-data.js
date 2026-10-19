/**
 * Standard test fixtures and mock generators for E2E tests across Tiers 1-4.
 */

export const MOCK_MUNICIPALITIES = [
  {
    code: "3550308",
    name: "São Paulo",
    regionCode: "1",
    governmentRegionCode: "rg-40",
    population: 11451999,
  },
  {
    code: "3509502",
    name: "Campinas",
    regionCode: "6",
    governmentRegionCode: "rg-11",
    population: 1139047,
  },
  {
    code: "3543402",
    name: "Ribeirão Preto",
    regionCode: "7",
    governmentRegionCode: "rg-31",
    population: 698642,
  },
  {
    code: "3548500",
    name: "Santos",
    regionCode: "3",
    governmentRegionCode: "rg-33",
    population: 418608,
  },
  {
    code: "3549805",
    name: "São José do Rio Preto",
    regionCode: "9",
    governmentRegionCode: "rg-37",
    population: 480393,
  },
];

export const MOCK_ELECTION_2T_DATA = {
  office: "presidente",
  description: "Presidente 2o Turno 2026",
  candidates: [
    ["13", "Lula", "PT"],
    ["22", "Bolsonaro", "PL"],
  ],
  totals: {
    state: {
      validVotes: 25000000,
      blankVotes: 800000,
      nullVotes: 1200000,
      votes: [
        ["13", 13000000],
        ["22", 12000000],
      ],
    },
  },
  municipalResults: {
    3550308: {
      code: "3550308",
      name: "São Paulo",
      totalValidVotes: 7000000,
      sectionsCounted: 100,
      sectionsTotal: 100,
      sectionsPct: 100,
      marginVotes: 700000,
      marginPp: 10,
      status: "leading",
      visualStatus: "leading",
      leader: { ballotNumber: "13", name: "Lula", party: "PT", validVotes: 3850000, sharePct: 55 },
      runnerUp: {
        ballotNumber: "22",
        name: "Bolsonaro",
        party: "PL",
        validVotes: 3150000,
        sharePct: 45,
      },
      candidates: [
        { ballotNumber: "13", name: "Lula", party: "PT", validVotes: 3850000, sharePct: 55 },
        { ballotNumber: "22", name: "Bolsonaro", party: "PL", validVotes: 3150000, sharePct: 45 },
      ],
      color: "#c0392b",
      height: 11,
    },
    3509502: {
      code: "3509502",
      name: "Campinas",
      totalValidVotes: 600000,
      sectionsCounted: 100,
      sectionsTotal: 100,
      sectionsPct: 100,
      marginVotes: 60000,
      marginPp: 10,
      status: "leading",
      visualStatus: "leading",
      leader: {
        ballotNumber: "22",
        name: "Bolsonaro",
        party: "PL",
        validVotes: 330000,
        sharePct: 55,
      },
      runnerUp: { ballotNumber: "13", name: "Lula", party: "PT", validVotes: 270000, sharePct: 45 },
      candidates: [
        { ballotNumber: "22", name: "Bolsonaro", party: "PL", validVotes: 330000, sharePct: 55 },
        { ballotNumber: "13", name: "Lula", party: "PT", validVotes: 270000, sharePct: 45 },
      ],
      color: "#2980b9",
      height: 11,
    },
  },
};

export const MOCK_FIRST_ROUND_OFFICES = [
  "presidente",
  "governador",
  "senador",
  "deputado-federal",
  "deputado-estadual",
];
