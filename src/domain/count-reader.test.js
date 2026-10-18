import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ELECTION_CODE,
  FAILURE_BACKOFF_BASE_SECONDS,
  FAILURE_BACKOFF_THRESHOLD,
  MAX_RECOMMENDED_RATE_PER_SECOND,
  buildMunicipalConfigUrl,
  buildStateTrackingUrl,
  buildTotalizationUrl,
  buildTseBaseUrl,
  buildTseConfigIndexUrl,
  calculateFailureBackoff,
  createSessionBlocklist,
  detectAccessibilityMilestone,
  detectElectedCandidate,
  hasTrackingChanged,
  isBlocked404,
  isStaleGeneration,
  markHttp404,
  padElectionCode,
  parseMunicipalCountPayload,
  parseTseGenerationTimestamp,
  parseTseJson,
  parseTseNumber,
  planMunicipalQueue,
  resolveBannerState,
  shouldFetchMunicipalUpdates,
  sortMunicipalitiesByElectorate,
} from "./count-reader.js";

test("APU-01 safe URL builder validates scopes, 5-digit municipal codes, and blocks repeated 404s", () => {
  assert.equal(padElectionCode("6258"), "006258");
  assert.equal(padElectionCode(6258), "006258");

  const baseUrl = buildTseBaseUrl("6258", "https://resultados.tse.jus.br");
  assert.equal(baseUrl, "https://resultados.tse.jus.br/oficial/ele2026/6258");

  const indexUrl = buildTseConfigIndexUrl("https://resultados.tse.jus.br");
  assert.equal(indexUrl, "https://resultados.tse.jus.br/oficial/comum/config/ele-c.json");

  const munConfigUrl = buildMunicipalConfigUrl("6258", "https://resultados.tse.jus.br");
  assert.equal(
    munConfigUrl,
    "https://resultados.tse.jus.br/oficial/ele2026/6258/config/mun-e006258-cm.json",
  );

  const trackingUrl = buildStateTrackingUrl("6258", "https://resultados.tse.jus.br");
  assert.equal(
    trackingUrl,
    "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/sp/sp-e006258-ab.json",
  );

  // BR national scope
  const brUrl = buildTotalizationUrl({
    electionCode: "6258",
    scope: "br",
    host: "https://resultados.tse.jus.br",
  });
  assert.equal(
    brUrl,
    "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json",
  );

  // SP state scope
  const spStateUrl = buildTotalizationUrl({
    electionCode: "6258",
    scope: "sp",
    host: "https://resultados.tse.jus.br",
  });
  assert.equal(
    spStateUrl,
    "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json",
  );

  // Municipal scope with valid 5-digit code
  const munUrl = buildTotalizationUrl({
    electionCode: "6258",
    scope: "mun",
    tseCode: "71072",
    host: "https://resultados.tse.jus.br",
  });
  assert.equal(
    munUrl,
    "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/sp/sp71072-c0001-e006258-u.json",
  );

  // Rejects invalid scope
  assert.equal(buildTotalizationUrl({ scope: "rj", tseCode: "12345" }), null);
  assert.equal(buildTotalizationUrl({ scope: "unknown" }), null);

  // Rejects invalid municipal code (non-digit or wrong length)
  assert.equal(buildTotalizationUrl({ scope: "mun", tseCode: "abc" }), null);
  assert.equal(buildTotalizationUrl({ scope: "mun", tseCode: "123456" }), null);

  // Valid codes whitelist enforcement
  const validCodes = new Set(["71072", "63770"]);
  assert.notEqual(
    buildTotalizationUrl({ scope: "mun", tseCode: "71072", validCodesSet: validCodes }),
    null,
  );
  assert.equal(
    buildTotalizationUrl({ scope: "mun", tseCode: "99999", validCodesSet: validCodes }),
    null,
  );

  // Permanent 404 blocking across the session
  const blocklist = createSessionBlocklist();
  assert.equal(isBlocked404(blocklist, "63770"), false);
  markHttp404(blocklist, "63770");
  assert.equal(isBlocked404(blocklist, "63770"), true);

  const blockedMunUrl = buildTotalizationUrl({
    scope: "mun",
    tseCode: "63770",
    blocked404Set: blocklist,
  });
  assert.equal(blockedMunUrl, null);

  // Non-blocked code continues to build successfully
  const allowedMunUrl = buildTotalizationUrl({
    scope: "mun",
    tseCode: "71072",
    blocked404Set: blocklist,
  });
  assert.notEqual(allowedMunUrl, null);
});

test("APU-02 zero municipal requests when tracking timestamp dg+hg does not change", () => {
  const previous = {
    dg: "25/10/2026",
    hg: "18:00:00",
    etag: '"abc123hash"',
  };
  const identicalCurrent = {
    dg: "25/10/2026",
    hg: "18:00:00",
    etag: '"abc123hash"',
  };
  const changedCurrent = {
    dg: "25/10/2026",
    hg: "18:01:00",
    etag: '"def456hash"',
  };

  assert.equal(hasTrackingChanged(previous, identicalCurrent), false);
  assert.equal(shouldFetchMunicipalUpdates(previous, identicalCurrent), false);
  assert.equal(hasTrackingChanged(previous, changedCurrent), true);
  assert.equal(shouldFetchMunicipalUpdates(previous, changedCurrent), true);

  // Initial cycle has no previous tracking, so it must return true
  assert.equal(hasTrackingChanged(null, identicalCurrent), true);
  assert.equal(hasTrackingChanged(undefined, identicalCurrent), true);
});

test("APU-03 municipal queue prioritizes by descending electorate with <= 10 req/s rate planning", () => {
  const municipalities = [
    { cd: "70998", name: "Santos", elet: 353684 },
    { cd: "71072", name: "Sao Paulo", elet: 9322444 },
    { cd: "61000", name: "Ficticio", elet: 3500 },
    { cd: "63770", name: "Campinas", elet: 884784 },
  ];

  const sorted = sortMunicipalitiesByElectorate(municipalities);
  assert.equal(sorted[0].cd, "71072");
  assert.equal(sorted[1].cd, "63770");
  assert.equal(sorted[2].cd, "70998");
  assert.equal(sorted[3].cd, "61000");

  const trackingMunicipalities = [
    { cd: "70998", st: 450, dg: "25/10/2026", hg: "18:30:00" },
    { cd: "71072", st: 12500, dg: "25/10/2026", hg: "18:30:00" },
    { cd: "61000", st: 5, dg: "25/10/2026", hg: "18:30:00" },
    { cd: "63770", st: 1100, dg: "25/10/2026", hg: "18:30:00" },
  ];

  const municipalConfigMap = {
    "71072": { cdi: "3550308", nm: "Sao Paulo", elet: 9322444 },
    "63770": { cdi: "3509502", nm: "Campinas", elet: 884784 },
    "70998": { cdi: "3548500", nm: "Santos", elet: 353684 },
    "61000": { cdi: "3599901", nm: "Ficticio", elet: 3500 },
  };

  const processedMap = {
    // 70998 is already processed with the exact same dg, hg, and sections
    "70998": { dg: "25/10/2026", hg: "18:30:00", st: 450 },
  };

  const blocklist = createSessionBlocklist();
  // 61000 returned 404 earlier and is permanently blocked
  markHttp404(blocklist, "61000");

  const planned = planMunicipalQueue({
    trackingMunicipalities,
    municipalConfigMap,
    processedMap,
    blocked404Set: blocklist,
    maxRatePerSecond: 10,
  });

  // Only 71072 and 63770 remain, ordered by descending electorate
  assert.equal(planned.totalPending, 2);
  assert.equal(planned.queue[0].cd, "71072");
  assert.equal(planned.queue[1].cd, "63770");
  assert.equal(planned.intervalMs, 100);
  assert.ok(planned.recommendedRate <= MAX_RECOMMENDED_RATE_PER_SECOND);
});

test("APU-03 discards municipal response with generation timestamp older than or equal to processed", () => {
  const ts1 = parseTseGenerationTimestamp("25/10/2026", "18:00:00");
  const ts2 = parseTseGenerationTimestamp("25/10/2026", "18:05:00");
  assert.ok(ts2 > ts1);

  const processed = { dg: "25/10/2026", hg: "18:30:00" };
  const olderIncoming = { dg: "25/10/2026", hg: "18:25:00" };
  const equalIncoming = { dg: "25/10/2026", hg: "18:30:00" };
  const newerIncoming = { dg: "25/10/2026", hg: "18:35:00" };

  assert.equal(isStaleGeneration(processed, olderIncoming), true);
  assert.equal(isStaleGeneration(processed, equalIncoming), true);
  assert.equal(isStaleGeneration(processed, newerIncoming), false);
});

test("APU-04 resilient number parser handles string numbers and decimal commas", () => {
  assert.equal(parseTseNumber("51,93"), 51.93);
  assert.equal(parseTseNumber("1.234,56"), 1234.56);
  assert.equal(parseTseNumber("100"), 100);
  assert.equal(parseTseNumber(250), 250);
  assert.equal(parseTseNumber("", 0), 0);
  assert.equal(parseTseNumber(null, 42), 42);
  assert.equal(parseTseNumber(undefined, 0), 0);
  assert.equal(parseTseNumber("invalido", 99), 99);
});

test("APU-04 rejects malformed and truncated JSON payloads while retaining last good data", () => {
  const lastGood = {
    code: "3550308",
    sectionsCounted: 500,
    totalValidVotes: 10000,
  };

  const truncatedText = '{"cd":"71072","s":{"ts":25000,"st":';
  const parsedTruncated = parseTseJson(truncatedText);
  assert.equal(parsedTruncated.ok, false);
  assert.equal(parsedTruncated.error, "malformed-json");

  const municipalRes = parseMunicipalCountPayload(truncatedText, lastGood);
  assert.equal(municipalRes.ok, false);
  assert.equal(municipalRes.reason, "malformed-json");
  assert.equal(municipalRes.data, null);
  assert.equal(municipalRes.retainedData, lastGood);
});

test("APU-04 rejects regressive sections counted and retains last valid municipal data", () => {
  const lastValidData = {
    code: "71072",
    sectionsCounted: 1000,
    totalValidVotes: 20000,
  };

  // Regressive incoming payload: only 800 sections counted (less than 1000)
  const regressivePayload = {
    cd: "71072",
    s: { ts: 25000, st: 800, pst: "3,20" },
    v: { vv: 16000, vb: 500, vn: 800 },
    carg: [
      {
        cd: "1",
        agr: [
          {
            cand: [
              { n: "91", nm: "Cand Alfa", vap: "8480", pvap: "53,00", e: "n", st: "2o Turno" },
              { n: "92", nm: "Cand Beta", vap: "7520", pvap: "47,00", e: "n", st: "2o Turno" },
            ],
          },
        ],
      },
    ],
  };

  const parsed = parseMunicipalCountPayload(regressivePayload, lastValidData);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "regressive-sections");
  assert.equal(parsed.data, null);
  assert.equal(parsed.retainedData, lastValidData);

  // Progressive payload with 1200 sections succeeds
  const progressivePayload = {
    ...regressivePayload,
    s: { ts: 25000, st: 1200, pst: "4,80" },
  };
  const successResult = parseMunicipalCountPayload(progressivePayload, lastValidData);
  assert.equal(successResult.ok, true);
  assert.equal(successResult.reason, null);
  assert.equal(successResult.data?.sectionsCounted, 1200);
});

test("APU-05 activates 10-minute backoff with deterministic jitter after 3 consecutive failures", () => {
  assert.equal(calculateFailureBackoff({ consecutiveFailures: 0 }).inBackoff, false);
  assert.equal(calculateFailureBackoff({ consecutiveFailures: 1 }).inBackoff, false);
  assert.equal(calculateFailureBackoff({ consecutiveFailures: 2 }).inBackoff, false);

  const backoff3 = calculateFailureBackoff({
    consecutiveFailures: 3,
    jitterSeed: 5,
    baseSeconds: FAILURE_BACKOFF_BASE_SECONDS,
    maxJitterSeconds: 30,
  });
  assert.equal(backoff3.inBackoff, true);
  assert.equal(backoff3.reason, "consecutive-failures");
  assert.ok(backoff3.waitSeconds >= 600 && backoff3.waitSeconds <= 630);
  assert.equal(backoff3.backoffMs, backoff3.waitSeconds * 1000);

  // Deterministic jitter verification with known seed
  const backoffSeed10 = calculateFailureBackoff({
    consecutiveFailures: 3,
    jitterSeed: 10,
    baseSeconds: 600,
    maxJitterSeconds: 30,
  });
  assert.equal(backoffSeed10.waitSeconds, 610);
});

test("APU-06 banner state machine resolves all states ignoring dv flag and visitor clock", () => {
  // Real 6258 unstarted with 0 sections gives "nao-iniciada" / "aguardando" even when dv="s"
  const unstarted = resolveBannerState({
    and: "n",
    sectionsCounted: 0,
    sectionsTotal: 28110,
    tf: "n",
  });
  assert.equal(unstarted.state, "nao-iniciada");
  assert.equal(unstarted.alias, "aguardando");
  assert.equal(unstarted.isConcluded, false);

  // In-progress count gives "em-apuracao" / "parcial"
  const inProgress = resolveBannerState({
    and: "a",
    sectionsCounted: 14000,
    sectionsTotal: 28110,
    tf: "n",
  });
  assert.equal(inProgress.state, "em-apuracao");
  assert.equal(inProgress.alias, "parcial");

  // Paused / stagnant count gives "apuracao-pausada" / "tse-sem-novidade"
  const paused = resolveBannerState({
    and: "a",
    sectionsCounted: 14000,
    sectionsTotal: 28110,
    tf: "n",
    isPaused: true,
  });
  assert.equal(paused.state, "apuracao-pausada");
  assert.equal(paused.alias, "tse-sem-novidade");

  // Connection error gives "sem-conexao"
  const connError = resolveBannerState({
    hasConnectionError: true,
  });
  assert.equal(connError.state, "sem-conexao");
  assert.equal(connError.alias, "sem-conexao");

  // Mathematically defined flag
  const mathDef = resolveBannerState({
    and: "a",
    sectionsCounted: 26000,
    sectionsTotal: 28110,
    tf: "n",
    isMathematicallyDefined: true,
  });
  assert.equal(mathDef.state, "matematicamente-definida");
  assert.equal(mathDef.alias, "matematicamente-definida");

  // 100% of sections or tf="s" gives "apuracao-concluida" / "encerrada"
  const concludedTf = resolveBannerState({
    and: "f",
    sectionsCounted: 28110,
    sectionsTotal: 28110,
    tf: "s",
  });
  assert.equal(concludedTf.state, "apuracao-concluida");
  assert.equal(concludedTf.alias, "encerrada");
  assert.equal(concludedTf.isConcluded, true);

  // Replay mode gives "replay"
  const replayState = resolveBannerState({
    isReplay: true,
  });
  assert.equal(replayState.state, "replay");
  assert.equal(replayState.alias, "replay");
});

test("APU-10 elected announcement triggers exclusively from national br file with e='s' and st='Eleito'", () => {
  const nationalDoc = {
    tpabr: "br",
    carg: [
      {
        cd: "1",
        agr: [
          {
            cand: [
              {
                n: "91",
                nm: "Candidato Alfa",
                nmu: "Candidato Alfa",
                cc: "PARTIDO-A",
                sgp: "PA",
                vap: "60000000",
                pvap: "52,50",
                st: "Eleito",
                e: "s",
              },
              {
                n: "92",
                nm: "Candidato Beta",
                nmu: "Candidato Beta",
                cc: "PARTIDO-B",
                sgp: "PB",
                vap: "54000000",
                pvap: "47,50",
                st: "Nao eleito",
                e: "n",
              },
            ],
          },
        ],
      },
    ],
  };

  const detected = detectElectedCandidate(nationalDoc);
  assert.equal(detected.announced, true);
  assert.equal(detected.candidate?.ballotNumber, "91");
  assert.equal(detected.candidate?.name, "Candidato Alfa");
  assert.equal(detected.candidate?.party, "PA");
  assert.equal(detected.candidate?.status, "Eleito");
  assert.ok(detected.announcementText?.includes("Segundo o TSE"));
  assert.ok(detected.announcementText?.includes("Candidato Alfa"));
  assert.ok(detected.announcementText?.includes("esta matematicamente eleito"));
});

test("APU-10 state sp file never triggers elected announcement even if candidate has e='s'", () => {
  const stateDoc = {
    tpabr: "sp",
    carg: [
      {
        cd: "1",
        agr: [
          {
            cand: [
              {
                n: "91",
                nm: "Candidato Alfa",
                nmu: "Candidato Alfa",
                cc: "PARTIDO-A",
                sgp: "PA",
                vap: "15000000",
                pvap: "55,00",
                st: "Eleito",
                e: "s",
              },
            ],
          },
        ],
      },
    ],
  };

  const detected = detectElectedCandidate(stateDoc);
  assert.equal(detected.announced, false);
  assert.equal(detected.candidate, null);
  assert.equal(detected.announcementText, null);
});

test("ACE-05 generates accessible status messages in pt-BR without en-dash or em-dash at milestone thresholds", () => {
  // First section counted (initial milestone)
  const milestoneStart = detectAccessibilityMilestone(
    { sectionsCounted: 0, sectionsPct: 0 },
    { sectionsCounted: 10, sectionsPct: 0.1 },
  );
  assert.equal(milestoneStart, "Inicio da apuracao em Sao Paulo");

  // Percentage milestones: 25%, 50%, 75%, 90%, 95%, 99%
  const milestone25 = detectAccessibilityMilestone({ sectionsPct: 24.8 }, { sectionsPct: 25.2 });
  assert.equal(milestone25, "25% das secoes totalizadas em Sao Paulo");

  const milestone50 = detectAccessibilityMilestone({ sectionsPct: 49.9 }, { sectionsPct: 50.1 });
  assert.equal(milestone50, "50% das secoes totalizadas em Sao Paulo");

  const milestone90 = detectAccessibilityMilestone({ sectionsPct: 89.5 }, { sectionsPct: 90.3 });
  assert.equal(milestone90, "90% das secoes totalizadas em Sao Paulo");

  // Concluded milestone
  const milestoneConcluded = detectAccessibilityMilestone(
    { bannerState: "em-apuracao", sectionsPct: 99.8 },
    { bannerState: "apuracao-concluida", sectionsPct: 100 },
  );
  assert.equal(
    milestoneConcluded,
    "Apuracao encerrada em Sao Paulo, 100% das secoes totalizadas",
  );

  // Proclamation of elected
  const milestoneElected = detectAccessibilityMilestone(
    { isElected: false },
    { isElected: true, electedCandidate: { name: "Candidato Alfa", party: "PARTIDO-A" } },
  );
  assert.equal(
    milestoneElected,
    "TSE proclama resultado da eleicao presidencial: Candidato Alfa (PARTIDO-A) eleito",
  );

  // Connection error and resumption
  const milestoneConnLost = detectAccessibilityMilestone(
    { hasConnectionError: false },
    { hasConnectionError: true },
  );
  assert.equal(milestoneConnLost, "Sem conexao com o TSE");

  const milestoneConnResumed = detectAccessibilityMilestone(
    { hasConnectionError: true },
    { hasConnectionError: false },
  );
  assert.equal(milestoneConnResumed, "Transmissao de dados do TSE retomada");

  // No milestone crossed returns null
  const noMilestone = detectAccessibilityMilestone({ sectionsPct: 52.1 }, { sectionsPct: 52.3 });
  assert.equal(noMilestone, null);

  // Verify absence of en-dash (U+2013) and em-dash (U+2014) in all messages
  const sampleMessages = [
    milestoneStart,
    milestone25,
    milestone50,
    milestone90,
    milestoneConcluded,
    milestoneElected,
    milestoneConnLost,
    milestoneConnResumed,
  ];
  for (const msg of sampleMessages) {
    assert.ok(msg !== null);
    assert.ok(!msg.includes("\u2013"), "Message must not contain en-dash");
    assert.ok(!msg.includes("\u2014"), "Message must not contain em-dash");
  }
});
