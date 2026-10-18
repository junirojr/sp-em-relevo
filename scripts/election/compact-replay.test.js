import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";

import {
  MAX_REPLAY_SIZE_BYTES,
  SCHEMA_VERSION,
  buildReplayFrames,
  calculateLeaderAndMargin,
  compactReplayLog,
  extractElectoralEvents,
  parseCliArgs,
  parseNdjson,
} from "./compact-replay.mjs";

test("parseCliArgs parses custom CLI options deterministically", () => {
  const customArgs = [
    "--input",
    "data/custom-records.ndjson",
    "--output",
    "data/custom-replay.json",
    "--interval",
    "60",
    "--gap-threshold",
    "600",
  ];

  const parsed = parseCliArgs(customArgs);
  assert.equal(parsed.inputPath, "data/custom-records.ndjson");
  assert.equal(parsed.outputPath, "data/custom-replay.json");
  assert.equal(parsed.samplingIntervalSeconds, 60);
  assert.equal(parsed.gapThresholdSeconds, 600);
});

test("parseNdjson ignores blank lines and malformed entries", () => {
  const raw = [
    '{"url":"http://item1","status":200}',
    "",
    "   ",
    "{invalid-json-text",
    '{"url":"http://item2","status":200}',
  ].join("\n");

  const records = parseNdjson(raw);
  assert.equal(records.length, 2);
  assert.equal(records[0].url, "http://item1");
  assert.equal(records[1].url, "http://item2");
});

test("calculateLeaderAndMargin accurately extracts leader, margin pp, and handles tie state", () => {
  // Normal case: candidate 22 leads over 13
  const normalData = {
    sectionsCounted: 100,
    sectionsTotal: 200,
    totalValidVotes: 1000,
    candidates: [
      { ballotNumber: "22", validVotes: 550, sharePct: 55 },
      { ballotNumber: "13", validVotes: 450, sharePct: 45 },
    ],
  };

  const normalCalc = calculateLeaderAndMargin(normalData);
  assert.equal(normalCalc.leader, "22");
  assert.equal(normalCalc.marginPp, 10);
  assert.equal(normalCalc.pctCounted, 50);

  // Tie condition (ELE-02): equal votes result in empty string leader and 0 margin
  const tieData = {
    sectionsCounted: 100,
    sectionsTotal: 200,
    totalValidVotes: 1000,
    candidates: [
      { ballotNumber: "22", validVotes: 500, sharePct: 50 },
      { ballotNumber: "13", validVotes: 500, sharePct: 50 },
    ],
  };

  const tieCalc = calculateLeaderAndMargin(tieData);
  assert.equal(tieCalc.leader, "");
  assert.equal(tieCalc.marginPp, 0);

  // Unstarted count (0 sections)
  const unstartedData = {
    sectionsCounted: 0,
    sectionsTotal: 200,
    totalValidVotes: 0,
    candidates: [],
  };

  const unstartedCalc = calculateLeaderAndMargin(unstartedData);
  assert.equal(unstartedCalc.leader, "");
  assert.equal(unstartedCalc.marginPp, 0);
  assert.equal(unstartedCalc.pctCounted, 0);
});

test("GRV-04 compactReplayLog produces schema_version 1 document with delta-encoded frames", () => {
  const baseTime = new Date("2026-10-25T17:00:00.000Z").getTime();

  // Construct a sequence of records spanning 2 time intervals
  const mockRecords = [
    // Interval 0 (T=0s): Initial state
    {
      ts: new Date(baseTime).toISOString(),
      url: "http://tse/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json",
      status: 200,
      payload: {
        tpabr: "sp",
        st: 100,
        ts: 1000,
        vv: 2000,
        cand: [
          { n: "22", nm: "Candidato A", sgp: "PL", vap: 1100, pvap: "55,00" },
          { n: "13", nm: "Candidato B", sgp: "PT", vap: 900, pvap: "45,00" },
        ],
      },
    },
    {
      ts: new Date(baseTime + 1000).toISOString(),
      url: "http://tse/oficial/ele2026/6258/dados/sp/sp71072-c0001-e006258-u.json",
      status: 200,
      payload: {
        tpabr: "mu",
        cd: "71072",
        st: 50,
        ts: 500,
        vv: 1000,
        cand: [
          { n: "22", vap: 520, pvap: "52,00" },
          { n: "13", vap: 480, pvap: "48,00" },
        ],
      },
    },
    {
      ts: new Date(baseTime + 2000).toISOString(),
      url: "http://tse/oficial/ele2026/6258/dados/sp/sp63770-c0001-e006258-u.json",
      status: 200,
      payload: {
        tpabr: "mu",
        cd: "63770",
        st: 30,
        ts: 300,
        vv: 600,
        cand: [
          { n: "13", vap: 330, pvap: "55,00" },
          { n: "22", vap: 270, pvap: "45,00" },
        ],
      },
    },

    // Interval 1 (T=35s): Only municipality 71072 updates; 63770 remains unchanged
    {
      ts: new Date(baseTime + 35000).toISOString(),
      url: "http://tse/oficial/ele2026/6258/dados/sp/sp71072-c0001-e006258-u.json",
      status: 200,
      payload: {
        tpabr: "mu",
        cd: "71072",
        st: 75,
        ts: 500,
        vv: 1500,
        cand: [
          { n: "22", vap: 810, pvap: "54,00" },
          { n: "13", vap: 690, pvap: "46,00" },
        ],
      },
    },
  ];

  const replay = compactReplayLog(mockRecords, {
    samplingIntervalSeconds: 30,
  });

  assert.equal(replay.schema_version, SCHEMA_VERSION);
  assert.equal(replay.election_code, "6258");
  assert.equal(replay.candidates.length, 2);
  assert.equal(replay.candidates[0].ballotNumber, "13");
  assert.equal(replay.candidates[1].ballotNumber, "22");

  // Verify frames and delta encoding
  assert.equal(replay.frames.length, 2);

  // Frame 0: contains initial entries for both 71072 and 63770
  const frame0 = replay.frames[0];
  assert.ok(frame0.muns["71072"]);
  assert.ok(frame0.muns["63770"]);
  assert.equal(frame0.muns["71072"][0], "22"); // leader 22
  assert.equal(frame0.muns["71072"][1], 4); // margin 52 - 48 = 4 pp
  assert.equal(frame0.muns["63770"][0], "13"); // leader 13

  // Frame 1: delta encoding ensures ONLY 71072 is recorded; 63770 is NOT duplicated!
  const frame1 = replay.frames[1];
  assert.ok(frame1.muns["71072"]);
  assert.equal(frame1.muns["63770"], undefined); // Unchanged -> omitted from delta!
  assert.equal(frame1.muns["71072"][0], "22");
  assert.equal(frame1.muns["71072"][1], 8); // margin updated to 54 - 46 = 8 pp
  assert.equal(frame1.muns["71072"][2], 15); // 75/500 = 15%
});

test("GRV-04 preserves real temporal gaps > 5 minutes without synthetic interpolation", () => {
  const baseTime = new Date("2026-10-25T17:00:00.000Z").getTime();

  // Construct events with an explicit 12-minute gap (720 seconds) between readings
  const recordsWithGap = [
    {
      ts: new Date(baseTime).toISOString(),
      url: "http://tse/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json",
      status: 200,
      payload: {
        tpabr: "sp",
        st: 10,
        ts: 100,
        vv: 100,
        cand: [{ n: "22", vap: 60, pvap: "60,00" }, { n: "13", vap: 40, pvap: "40,00" }],
      },
    },
    // Real 12-minute silence in the log (720,000 ms)
    {
      ts: new Date(baseTime + 720000).toISOString(),
      url: "http://tse/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json",
      status: 200,
      payload: {
        tpabr: "sp",
        st: 20,
        ts: 100,
        vv: 200,
        cand: [{ n: "22", vap: 120, pvap: "60,00" }, { n: "13", vap: 80, pvap: "40,00" }],
      },
    },
  ];

  const replay = compactReplayLog(recordsWithGap, {
    samplingIntervalSeconds: 30,
    gapThresholdSeconds: 300, // 5 minutes
  });

  // Verify gap detection
  assert.equal(replay.total_gaps, 1);
  assert.equal(replay.frames.length, 2);

  // The second frame must record the real gap without artificial intermediate frames
  const secondFrame = replay.frames[1];
  assert.equal(secondFrame.is_gap, true);
  assert.equal(secondFrame.gap_before_seconds, 720);
  assert.equal(secondFrame.t, 720); // Time leaped directly by 720 seconds
});

test("PUB-09 compacted replay file size strictly respects <= 300 KB budget for all 645 municipalities", () => {
  const baseTime = new Date("2026-10-25T17:00:00.000Z").getTime();
  const records = [];

  // Simulate initial state for all 645 municipalities of SP
  for (let munIdx = 1; munIdx <= 645; munIdx += 1) {
    const cd = String(60000 + munIdx);
    records.push({
      ts: new Date(baseTime + munIdx * 10).toISOString(),
      url: `http://tse/oficial/ele2026/6258/dados/sp/sp${cd}-c0001-e006258-u.json`,
      status: 200,
      payload: {
        tpabr: "mu",
        cd,
        st: 20,
        ts: 100,
        vv: 500,
        cand: [
          { n: "22", vap: 260, pvap: "52,00" },
          { n: "13", vap: 240, pvap: "48,00" },
        ],
      },
    });
  }

  // Simulate 10 subsequent delta frames where 30 municipalities update in each frame
  for (let frameIdx = 1; frameIdx <= 10; frameIdx += 1) {
    const frameTime = baseTime + frameIdx * 60000;
    for (let j = 1; j <= 30; j += 1) {
      const cd = String(60000 + ((frameIdx * 30 + j) % 645) + 1);
      records.push({
        ts: new Date(frameTime + j * 10).toISOString(),
        url: `http://tse/oficial/ele2026/6258/dados/sp/sp${cd}-c0001-e006258-u.json`,
        status: 200,
        payload: {
          tpabr: "mu",
          cd,
          st: 20 + frameIdx * 5,
          ts: 100,
          vv: 500 + frameIdx * 100,
          cand: [
            { n: "22", vap: 300, pvap: "53,00" },
            { n: "13", vap: 260, pvap: "47,00" },
          ],
        },
      });
    }
  }

  const replay = compactReplayLog(records, {
    samplingIntervalSeconds: 60,
  });

  const serialized = JSON.stringify(replay);
  const byteSize = Buffer.byteLength(serialized, "utf8");

  // Must strictly respect the 300 KB budget ceiling
  assert.ok(
    byteSize <= MAX_REPLAY_SIZE_BYTES,
    `replay size must be <= 300 KB (${byteSize} bytes exceeds ${MAX_REPLAY_SIZE_BYTES})`,
  );
  assert.ok(replay.frames.length >= 10);
});
