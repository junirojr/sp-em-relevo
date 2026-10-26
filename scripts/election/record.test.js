import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  appendNdjsonRecord,
  buildRecordSignature,
  ElectionRecorder,
  parseCliArgs,
  recoverNdjsonLog,
} from "./record.mjs";

/**
 * Creates an isolated temporary directory for test file artifacts.
 *
 * @returns {string}
 */
function createTempTestDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tse-recorder-test-"));
}

/**
 * Safely removes a directory and its contents.
 *
 * @param {string} dirPath
 */
function cleanTempDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

test("parseCliArgs parses custom CLI flags deterministically", () => {
  const customArgs = [
    "--out",
    "tmp/custom.ndjson",
    "--interval",
    "30000",
    "--server",
    "http://127.0.0.1:8080",
    "--election",
    "6257",
    "--rate-limit",
    "5",
    "--dry-run",
    "--single-cycle",
  ];

  const parsed = parseCliArgs(customArgs);
  assert.equal(parsed.outPath, "tmp/custom.ndjson");
  assert.equal(parsed.intervalMs, 30000);
  assert.equal(parsed.serverUrl, "http://127.0.0.1:8080");
  assert.equal(parsed.electionCode, "6257");
  assert.equal(parsed.rateLimit, 5);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.singleCycle, true);
});

test("GRV-01 recoverNdjsonLog discards truncated trailing line and recovers valid records", () => {
  const tempDir = createTempTestDir();
  const filePath = path.join(tempDir, "corrupted.ndjson");

  try {
    const validRecord1 = {
      ts: "2026-10-25T17:01:00.000Z",
      url: "http://example.com/item1",
      status: 200,
      etag: "etag-1",
      sha256: "hash-1",
      payload: { ok: true, id: 1 },
    };
    const validRecord2 = {
      ts: "2026-10-25T17:02:00.000Z",
      url: "http://example.com/item2",
      status: 200,
      etag: "etag-2",
      sha256: "hash-2",
      payload: { ok: true, id: 2 },
    };

    // Construct file with two valid lines and one truncated trailing line
    const content =
      JSON.stringify(validRecord1) +
      "\n" +
      JSON.stringify(validRecord2) +
      "\n" +
      '{"ts":"2026-10-25T17:03:00.000Z","url":"http://example.com/item3","status":200,"etag":'; // truncated!

    fs.writeFileSync(filePath, content, "utf8");

    const recovery = recoverNdjsonLog(filePath);
    assert.equal(recovery.recoveredCount, 2);
    assert.equal(recovery.validRecords.length, 2);
    assert.ok(recovery.discardedLine !== null);
    assert.ok(recovery.discardedLine.startsWith('{"ts":"2026-10-25T17:03:00.000Z"'));

    // Verify repaired file on disk contains exactly the 2 valid lines
    const repairedText = fs.readFileSync(filePath, "utf8");
    const lines = repairedText.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).url, "http://example.com/item1");
    assert.equal(JSON.parse(lines[1]).url, "http://example.com/item2");
  } finally {
    cleanTempDir(tempDir);
  }
});

test("GRV-01 recorder prevents duplicate storage of identical readings on restart", async () => {
  const tempDir = createTempTestDir();
  const filePath = path.join(tempDir, "dedup.ndjson");

  try {
    const preExistingRecord = {
      ts: "2026-10-25T17:00:00.000Z",
      url: "http://mock-server/oficial/ele2026/6258/config/mun-e006258-cm.json",
      status: 200,
      etag: "etag-cfg",
      sha256: "sha-cfg",
      payload: {
        abr: [
          {
            cd: "SP",
            mu: [{ cd: "71072", cdi: "3550308", nm: "Sao Paulo", elet: 9000000 }],
          },
        ],
      },
    };
    appendNdjsonRecord(filePath, preExistingRecord);

    const recorder = new ElectionRecorder({
      outPath: filePath,
      dryRun: false,
    });

    await recorder.init();

    // Verify initial state recovered the signature
    assert.equal(recorder.records.length, 1);
    const expectedSig = buildRecordSignature(
      preExistingRecord.url,
      preExistingRecord.etag,
      preExistingRecord.sha256,
      preExistingRecord.status,
    );
    assert.ok(recorder.knownSignatures.has(expectedSig));

    // Attempting to record identical result should be deduplicated
    const duplicateAttempt = recorder.recordFetch(preExistingRecord.url, {
      status: 200,
      etag: "etag-cfg",
      sha256: "sha-cfg",
      payload: preExistingRecord.payload,
    });
    assert.equal(duplicateAttempt, null);
    assert.equal(recorder.records.length, 1);

    // Recording new result with distinct sha256 should succeed
    const newRecord = recorder.recordFetch(preExistingRecord.url, {
      status: 200,
      etag: "etag-cfg-v2",
      sha256: "sha-cfg-v2",
      payload: preExistingRecord.payload,
    });
    assert.ok(newRecord !== null);
    assert.equal(recorder.records.length, 2);
  } finally {
    cleanTempDir(tempDir);
  }
});

test("GRV-01 logs failed cycles with status, etag, and sha256 format", async () => {
  const tempDir = createTempTestDir();
  const filePath = path.join(tempDir, "failures.ndjson");

  try {
    const recorder = new ElectionRecorder({
      outPath: filePath,
      dryRun: false,
    });
    await recorder.init();

    const failedRecord = recorder.recordFetch("http://mock/network-error", {
      status: 0,
      etag: null,
      sha256: null,
      payload: null,
    });

    assert.ok(failedRecord !== null);
    assert.equal(failedRecord.status, 0);
    assert.equal(failedRecord.etag, null);
    assert.equal(failedRecord.sha256, null);
    assert.equal(failedRecord.payload, null);
    assert.ok(typeof failedRecord.ts === "string");

    const fileContent = fs.readFileSync(filePath, "utf8").trim();
    const parsedLine = JSON.parse(fileContent);
    assert.equal(parsedLine.status, 0);
    assert.equal(parsedLine.url, "http://mock/network-error");
  } finally {
    cleanTempDir(tempDir);
  }
});

test("GRV-02 rate limit <= 10 req/s ensures minimum inter-request interval >= 100ms", async () => {
  const tempDir = createTempTestDir();
  const filePath = path.join(tempDir, "rate-limit.ndjson");

  /**
   * @type {number[]}
   */
  const requestTimestamps = [];
  const fakeFetch = async (/** @type {string | string[]} */ url) => {
    requestTimestamps.push(Date.now());
    const isConfig = url.includes("mun-e");
    if (isConfig) {
      return {
        status: 200,
        headers: new Headers({ etag: "cfg-1" }),
        text: async () =>
          JSON.stringify({
            abr: [
              {
                cd: "SP",
                mu: [
                  { cd: "71072", elet: 9000000, nm: "Sao Paulo" },
                  { cd: "63770", elet: 800000, nm: "Campinas" },
                  { cd: "70998", elet: 300000, nm: "Santos" },
                ],
              },
            ],
          }),
      };
    }
    const isTracking = url.includes("-ab.json");
    if (isTracking) {
      return {
        status: 200,
        headers: new Headers({ etag: "trk-1" }),
        text: async () =>
          JSON.stringify({
            dg: "25/10/2026",
            hg: "17:05:00",
            abr: [
              {
                mu: [
                  { cd: "71072", st: 100, elet: 9000000 },
                  { cd: "63770", st: 80, elet: 800000 },
                  { cd: "70998", st: 30, elet: 300000 },
                ],
              },
            ],
          }),
      };
    }
    const isState = url.includes("sp-c0001-e");
    if (isState) {
      return {
        status: 200,
        headers: new Headers({ etag: "sp-1" }),
        text: async () =>
          JSON.stringify({
            tpabr: "sp",
            st: 210,
            ts: 500,
            vv: 1000,
            cand: [
              { n: "22", vap: 600 },
              { n: "13", vap: 400 },
            ],
          }),
      };
    }

    // Municipal count request
    return {
      status: 200,
      headers: new Headers({ etag: "mun-1" }),
      text: async () =>
        JSON.stringify({
          tpabr: "mu",
          st: 50,
          ts: 100,
          vv: 500,
          cand: [
            { n: "22", vap: 300 },
            { n: "13", vap: 200 },
          ],
        }),
    };
  };

  try {
    const recorder = new ElectionRecorder({
      outPath: filePath,
      rateLimit: 10, // 10 req/s -> 100ms interval
      customFetch: async (input, init) => {
        const stub = await fakeFetch(String(input));
        return new Response(await stub.text(), { status: stub.status, headers: stub.headers });
      },
    });

    await recorder.init();
    await recorder.runCycle();

    // Verify municipal requests were spaced by at least 90ms (allowing small timer jitter)
    // Municipal requests occur after config, tracking, and state requests
    assert.ok(requestTimestamps.length >= 5);
    const munTimestamps = requestTimestamps.slice(3); // The municipal requests
    for (let i = 1; i < munTimestamps.length; i += 1) {
      const interval = munTimestamps[i] - munTimestamps[i - 1];
      assert.ok(
        interval >= 90,
        `request spacing must be >= 90ms for 10 req/s (actual: ${interval}ms)`,
      );
    }
  } finally {
    cleanTempDir(tempDir);
  }
});

test("APU-01 / APU-04 autocheck detects regressions and validates municipal sum vs state aggregate", async () => {
  const tempDir = createTempTestDir();
  const filePath = path.join(tempDir, "autocheck.ndjson");

  try {
    const recorder = new ElectionRecorder({
      outPath: filePath,
    });
    await recorder.init();

    // Populate municipal counts
    recorder.processedMap["71072"] = {
      code: "71072",
      tseCode: "71072",
      sectionsCounted: 100,
      sectionsTotal: 200,
      totalValidVotes: 5000,
    };
    recorder.previousSections["71072"] = 100;

    recorder.processedMap["63770"] = {
      code: "63770",
      tseCode: "63770",
      sectionsCounted: 80,
      sectionsTotal: 150,
      totalValidVotes: 3000,
    };
    recorder.previousSections["63770"] = 80;

    recorder.stateAggregate = {
      code: "SP",
      sectionsCounted: 250,
      sectionsTotal: 500,
      totalValidVotes: 10000,
      tf: "n",
    };

    const firstCheck = recorder.performAutocheck();
    assert.equal(firstCheck.hasRegression, false);
    assert.equal(firstCheck.sumMunicipalSections, 180);
    assert.equal(firstCheck.sumMunicipalValidVotes, 8000);
    assert.equal(firstCheck.sectionsMatch, true); // 180 <= 500

    // Now simulate an anomalous regressive payload for 71072
    recorder.processedMap["71072"] = {
      code: "71072",
      tseCode: "71072",
      sectionsCounted: 90, // Regressed from 100 to 90!
      sectionsTotal: 200,
      totalValidVotes: 4500,
    };

    const regressiveCheck = recorder.performAutocheck();
    assert.equal(regressiveCheck.hasRegression, true);
    assert.equal(regressiveCheck.regressions.length, 1);
    assert.equal(regressiveCheck.regressions[0].code, "71072");
    assert.equal(regressiveCheck.regressions[0].previous, 100);
    assert.equal(regressiveCheck.regressions[0].current, 90);
  } finally {
    cleanTempDir(tempDir);
  }
});

test("3-minute silence warning alert triggers when no success occurs within 180 seconds", async () => {
  const tempDir = createTempTestDir();
  const filePath = path.join(tempDir, "alert.ndjson");

  try {
    let simulatedCurrentTime = 1000000;
    const mockClock = { now: () => simulatedCurrentTime };

    /**
     * @type {{type: string, durationMs: number, timestamp: string}[]}
     */
    const alertsReceived = [];
    const recorder = new ElectionRecorder({
      outPath: filePath,
      clock: mockClock,
      onAlert: (evt) => alertsReceived.push(evt),
    });

    await recorder.init();

    // After 2 minutes (120,000 ms), no alert should fire
    simulatedCurrentTime += 120000;
    recorder.checkSilenceAlert();
    assert.equal(alertsReceived.length, 0);

    // After reaching 3 minutes (180,000 ms), alert must fire
    simulatedCurrentTime += 65000; // total 185,000 ms
    recorder.checkSilenceAlert();
    assert.equal(alertsReceived.length, 1);
    assert.equal(alertsReceived[0].type, "silence-alert");
    assert.ok(alertsReceived[0].durationMs >= 180000);
  } finally {
    cleanTempDir(tempDir);
  }
});
