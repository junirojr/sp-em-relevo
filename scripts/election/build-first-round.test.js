import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildDeputyTopTen,
  buildFirstRound,
  buildPreaggregatedTotals,
  formatCompactJson,
  isTseSubJudiceText,
  loadMunicipalitiesCatalog,
  parseTseCsvLine,
  streamTseCsv,
} from "./build-first-round.mjs";
import {
  EXPECTED_MUNICIPALITY_COUNT,
  MAX_FILE_SIZE_BYTES,
  checkFileSizeCeiling,
  checkMunicipalityCoverage,
  hydrateUnitFromRow,
} from "./first-round-checks.js";
import { computeDeputyBoundsCertificate } from "../../src/domain/election.js";
import { runOracleVerification } from "./oracle-first-round.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_ELECTION_DIR = path.resolve(__dirname, "../../data/election");

test("TUR-01 parseTseCsvLine correctly parses semicolon delimited and quoted fields with CRLF", () => {
  const lineA = '"6257";"SP";"71072";"SAO PAULO";"0001";"1";"22";"FLAVIO BOLSONARO";"PL";"1500"\r';
  const colsA = parseTseCsvLine(lineA);
  assert.equal(colsA.length, 10);
  assert.equal(colsA[0], "6257");
  assert.equal(colsA[1], "SP");
  assert.equal(colsA[2], "71072");
  assert.equal(colsA[3], "SAO PAULO");
  assert.equal(colsA[6], "22");
  assert.equal(colsA[7], "FLAVIO BOLSONARO");
  assert.equal(colsA[8], "PL");
  assert.equal(colsA[9], "1500");

  const lineWithQuotes = '"Item com ""aspas escapadas""";"Valor"\r\n';
  const colsB = parseTseCsvLine(lineWithQuotes);
  assert.equal(colsB.length, 2);
  assert.equal(colsB[0], 'Item com "aspas escapadas"');
  assert.equal(colsB[1], "Valor");
});

test("TUR-01 streamTseCsv streams Latin-1 encoded content with semicolon delimiter", async () => {
  // Latin-1 characters: S\xe3o Paulo (São Paulo)
  const latin1Buffer = Buffer.from(
    'CD_MUNICIPIO;NM_MUNICIPIO;QT_VOTOS\r\n"71072";"S\xe3o Paulo";"5000"\r\n"63770";"Campinas";"2000"\r\n',
    "latin1",
  );

  const stream = Readable.from(latin1Buffer);
  const rows = [];
  const count = await streamTseCsv({
    stream,
    encoding: "latin1",
    onRow: (cols) => {
      rows.push(cols);
    },
  });

  assert.equal(count, 3);
  assert.equal(rows.length, 3);
  assert.equal(rows[0][0], "CD_MUNICIPIO");
  assert.equal(rows[1][1], "São Paulo");
  assert.equal(rows[1][2], "5000");
  assert.equal(rows[2][1], "Campinas");
  assert.equal(rows[2][2], "2000");
});

test("TUR-01 isTseSubJudiceText identifies annulled sub judice statuses", () => {
  assert.equal(isTseSubJudiceText("Válido"), false);
  assert.equal(isTseSubJudiceText("Nominal"), false);
  assert.equal(isTseSubJudiceText("Anulado sub judice"), true);
  assert.equal(isTseSubJudiceText("Voto anulado sub judice"), true);
  assert.equal(isTseSubJudiceText("Sub Judice"), true);
});

test("TUR-01 loadMunicipalitiesCatalog maps 645 municipalities and verifies divergent names by code", () => {
  const catalog = loadMunicipalitiesCatalog();
  assert.equal(catalog.length, EXPECTED_MUNICIPALITY_COUNT);

  const coverageProblems = checkMunicipalityCoverage(catalog.map((c) => c.code));
  assert.equal(coverageProblems.length, 0);

  // Divergent names between TSE and IBGE must be mapped strictly by 7-digit IBGE code
  const itaoca = catalog.find((c) => c.code === "3522158");
  assert.ok(itaoca);
  assert.equal(itaoca.name, "Itaoca");

  const biritiba = catalog.find((c) => c.code === "3506607");
  assert.ok(biritiba);
  assert.equal(biritiba.name, "Biritiba Mirim");

  const embu = catalog.find((c) => c.code === "3515004");
  assert.ok(embu);
  assert.equal(embu.name, "Embu das Artes");

  const florinea = catalog.find((c) => c.code === "3516101");
  assert.ok(florinea);
  assert.equal(florinea.name, "Florínea");

  const mogiMirim = catalog.find((c) => c.code === "3530805");
  assert.ok(mogiMirim);
  assert.equal(mogiMirim.name, "Mogi Mirim");
});

test("TUR-03 buildDeputyTopTen retains top 10 candidates, exact remainder demais, and tenthPlaceVotes", () => {
  const candidatePool = [
    ["1010", 5000],
    ["2020", 4000],
    ["3030", 3000],
    ["4040", 2500],
    ["5050", 2000],
    ["6060", 1500],
    ["7070", 1200],
    ["8080", 1000],
    ["9090", 800],
    ["1001", 600],
    ["1101", 400], // 11th candidate (should go into demais)
    ["1201", 300], // 12th candidate (should go into demais)
  ];
  const totalValid = 23000;

  const result = buildDeputyTopTen(candidatePool, totalValid);
  assert.equal(result.topTen.length, 10);
  assert.equal(result.topTen[0][0], "1010");
  assert.equal(result.topTen[0][1], 5000);
  assert.equal(result.topTen[9][0], "1001");
  assert.equal(result.topTen[9][1], 600);
  assert.equal(result.tenthPlaceVotes, 600);

  // Sum of top 10: 5000+4000+3000+2500+2000+1500+1200+1000+800+600 = 21600
  // demais = 23000 - 21600 = 1400
  assert.equal(result.demais, 1400);
});

test("TUR-03 deputy top ten rows integrate with domain computeDeputyBoundsCertificate (TUR-04)", () => {
  const catalog = loadMunicipalitiesCatalog();
  const rawFed = JSON.parse(
    fs.readFileSync(path.resolve(DATA_ELECTION_DIR, "deputado-federal-1t.json"), "utf8"),
  );

  const candidatesMeta = rawFed.candidates;
  const sampleRows = rawFed.rows.slice(0, 5);
  const hydratedUnits = sampleRows.map((r) => hydrateUnitFromRow(r, candidatesMeta));

  assert.equal(hydratedUnits.length, 5);
  for (const u of hydratedUnits) {
    assert.ok(u.validVotes > 0);
    assert.ok(u.candidates.length <= 10);
    assert.ok(u.otherVotes >= 0);
  }

  const certificate = computeDeputyBoundsCertificate(hydratedUnits);
  assert.ok(certificate);
  assert.ok(certificate.bounds.minVotes >= 0);
  assert.ok(certificate.bounds.maxVotes >= certificate.bounds.minVotes);
  assert.ok(typeof certificate.certified === "boolean");
});

test("TUR-03 buildPreaggregatedTotals pre-sums State, 16 RAs, and 43 RGs", () => {
  const catalog = loadMunicipalitiesCatalog();
  const sampleMunicipalities = catalog.slice(0, 10).map((m) => ({
    code: m.code,
    validVotes: 10000,
    blankVotes: 100,
    nullVotes: 200,
    demais: 1000,
    votes: [
      ["10", 6000],
      ["20", 3000],
    ],
  }));

  const totals = buildPreaggregatedTotals(sampleMunicipalities, catalog);
  assert.equal(totals.state.validVotes, 100000);
  assert.equal(totals.state.blankVotes, 1000);
  assert.equal(totals.state.nullVotes, 2000);
  assert.equal(totals.state.demais, 10000);
  assert.equal(Object.keys(totals.ra).length, 16);
  assert.equal(Object.keys(totals.rg).length, 43);
});

test("PUB-09 all generated 1st round election files respect the 120,000 bytes budget ceiling", async () => {
  const buildResult = await buildFirstRound();
  assert.equal(buildResult.fileSizeProblems.length, 0);

  const filesToCheck = [
    "presidente-1t.json",
    "governador-1t.json",
    "senador-1t.json",
    "deputado-federal-1t.json",
    "deputado-estadual-1t.json",
  ];

  for (const fileName of filesToCheck) {
    const fullPath = path.resolve(DATA_ELECTION_DIR, fileName);
    assert.ok(fs.existsSync(fullPath), `Arquivo ${fileName} deve existir.`);
    const stat = fs.statSync(fullPath);
    const sizeProblems = checkFileSizeCeiling(stat.size, MAX_FILE_SIZE_BYTES);
    assert.equal(
      sizeProblems.length,
      0,
      `Arquivo ${fileName} (${stat.size} bytes) excedeu o teto de 120.000 bytes.`,
    );
    assert.ok(stat.size <= MAX_FILE_SIZE_BYTES);
  }
});

test("TUR-02 generated election files pass 100% of independent oracle checks for SP", () => {
  const oracleResult = runOracleVerification(DATA_ELECTION_DIR);
  assert.equal(oracleResult.valid, true);
  assert.equal(oracleResult.problems.length, 0);

  const presReport = oracleResult.reports.presidente;
  assert.ok(presReport);
  assert.equal(presReport.valid, true);

  const flavio = presReport.diffs.find((d) => d.ballotNumber === "22");
  assert.ok(flavio);
  assert.equal(flavio.expectedPct, 51.93);
  assert.ok(flavio.diffPp <= 0.01);

  const lula = presReport.diffs.find((d) => d.ballotNumber === "13");
  assert.ok(lula);
  assert.equal(lula.expectedPct, 38.2);
  assert.ok(lula.diffPp <= 0.01);

  const govReport = oracleResult.reports.governador;
  assert.ok(govReport);
  assert.equal(govReport.valid, true);

  const tarcisio = govReport.diffs.find((d) => d.ballotNumber === "10");
  assert.ok(tarcisio);
  assert.equal(tarcisio.expectedPct, 62.65);
  assert.ok(tarcisio.diffPp <= 0.01);

  const senReport = oracleResult.reports.senador;
  assert.ok(senReport);
  assert.equal(senReport.valid, true);

  const derrite = senReport.diffs.find((d) => d.ballotNumber === "111");
  assert.ok(derrite);
  assert.equal(derrite.expectedPct, 30.6);
  assert.ok(derrite.diffPp <= 0.01);

  const andre = senReport.diffs.find((d) => d.ballotNumber === "222");
  assert.ok(andre);
  assert.equal(andre.expectedPct, 29.28);
  assert.ok(andre.diffPp <= 0.01);
});
