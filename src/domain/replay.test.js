import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_MIN_GAP_SECONDS,
  extractReplayTimeline,
  findReplayGaps,
  formatReplayBannerText,
  formatReplayHourBrasilia,
  formatReplayTimeBrasilia,
  REPLAY_SCHEMA_VERSION,
  reconstructReplayFrame,
} from "./replay.js";

const FIXTURE_PATH = "data/election/replay-presidente-2t.json";

function loadFixture() {
  const content = fs.readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(content);
}

describe("Replay Domain Unit Suite (N17, RPL-02, RPL-03, RPL-04, RPL-05)", () => {
  it("validates synthetic fixture adheres to schema version 1 and size budget", () => {
    const fixture = loadFixture();
    assert.equal(fixture.schema_version, REPLAY_SCHEMA_VERSION);
    assert.equal(fixture.candidates.length, 2);
    // FIX-01: Fictitious candidate names and parties
    assert.equal(fixture.candidates[0].ballotNumber, "10");
    assert.equal(fixture.candidates[0].name, "Candidato Alfa");
    assert.equal(fixture.candidates[0].party, "PARTIDO-A");
    assert.equal(fixture.candidates[1].ballotNumber, "20");
    assert.equal(fixture.candidates[1].name, "Candidato Beta");
    assert.equal(fixture.candidates[1].party, "PARTIDO-B");
    assert.ok(fixture.frames.length >= 10);
    assert.ok(fixture.frames.length <= 20);
  });

  describe("RPL-02: Cumulative state reconstruction", () => {
    it("RPL-02 reconstructs initial frame index 0 exactly matching initial readings", () => {
      const fixture = loadFixture();
      const state = reconstructReplayFrame(fixture, 0);

      assert.equal(state.index, 0);
      assert.equal(state.t, 0);
      assert.equal(state.iso, "2026-10-25T20:00:00.000Z");
      assert.equal(state.sp.leader, "10");
      assert.equal(state.sp.marginPp, 2.1);
      assert.equal(state.sp.pctCounted, 8.5);
      assert.equal(state.sp.sectionsCounted, 8500);
      assert.equal(state.sp.sectionsTotal, 100000);
      assert.equal(state.isGap, false);
      assert.equal(state.gapBeforeSeconds, 0);

      // Verify municipality initial state
      assert.deepEqual(state.muns["3550308"], ["10", 3.2, 10.0]);
      assert.deepEqual(state.muns["3509502"], ["20", 1.8, 9.5]);
      assert.equal(Object.keys(state.muns).length, 15);
    });

    it("reconstructs intermediate frame k with cumulative delta preservation", () => {
      const fixture = loadFixture();
      // In frame 0: 3550308 was ["10", 3.2, 10.0]
      // In frame 1: 3550308 updated to ["10", 3.4, 16.5]
      // In frame 2: 3550308 was not in delta, but 3543402 was updated to ["20", 2.0, 21.5]
      const state1 = reconstructReplayFrame(fixture, 1);
      assert.equal(state1.index, 1);
      assert.deepEqual(state1.muns["3550308"], ["10", 3.4, 16.5]);
      // 3509502 updated in frame 1
      assert.deepEqual(state1.muns["3509502"], ["20", 1.6, 15.2]);
      // 3548500 was also in frame 1
      assert.deepEqual(state1.muns["3548500"], ["10", 4.2, 14.8]);
      // Municipalities not in delta 1 retain frame 0 values
      assert.deepEqual(state1.muns["3543402"], ["20", 2.1, 8.0]);

      const state2 = reconstructReplayFrame(fixture, 2);
      assert.equal(state2.index, 2);
      assert.deepEqual(state2.muns["3550308"], ["10", 3.4, 16.5]);
      assert.deepEqual(state2.muns["3543402"], ["20", 2.0, 21.5]);
    });

    it("reconstructs final frame containing all cumulative readings across all frames", () => {
      const fixture = loadFixture();
      const lastIndex = fixture.frames.length - 1;
      const state = reconstructReplayFrame(fixture, lastIndex);

      assert.equal(state.index, lastIndex);
      assert.equal(state.sp.pctCounted, 100.0);
      assert.equal(state.sp.sectionsCounted, 100000);
      assert.equal(state.sp.sectionsTotal, 100000);
      assert.equal(state.sp.leader, "10");
      assert.equal(state.sp.marginPp, 4.5);

      // Final readings of changed municipalities
      assert.deepEqual(state.muns["3550308"], ["10", 4.2, 98.5]);
      assert.deepEqual(state.muns["3509502"], ["20", 1.0, 100.0]);
      assert.deepEqual(state.muns["3548500"], ["10", 4.8, 100.0]);
      assert.deepEqual(state.muns["3549904"], ["10", 3.4, 100.0]);
      assert.deepEqual(state.muns["3543402"], ["20", 1.3, 100.0]);
    });

    it("clamps out-of-bound indices safely without throwing", () => {
      const fixture = loadFixture();
      const stateNeg = reconstructReplayFrame(fixture, -10);
      assert.equal(stateNeg.index, 0);

      const stateExcess = reconstructReplayFrame(fixture, 9999);
      assert.equal(stateExcess.index, fixture.frames.length - 1);
    });

    it("handles null or empty document gracefully", () => {
      const stateNull = reconstructReplayFrame(null, 0);
      assert.equal(stateNull.index, -1);
      assert.deepEqual(stateNull.muns, {});

      const stateEmpty = reconstructReplayFrame({ frames: [] }, 0);
      assert.equal(stateEmpty.index, -1);
      assert.deepEqual(stateEmpty.muns, {});
    });
  });

  describe("RPL-04: Timeline markers extraction", () => {
    it("extracts timeline markers for all frames", () => {
      const fixture = loadFixture();
      const timeline = extractReplayTimeline(fixture);

      assert.equal(timeline.length, fixture.frames.length);

      const first = timeline[0];
      assert.equal(first.index, 0);
      assert.equal(first.t, 0);
      assert.equal(first.iso, "2026-10-25T20:00:00.000Z");
      assert.equal(first.formattedTime, "17:00");
      assert.equal(first.formattedBrasilia, "17:00 (Brasilia)");
      assert.equal(first.pctCounted, 8.5);
      assert.equal(first.isGap, false);

      const last = timeline[timeline.length - 1];
      assert.equal(last.index, fixture.frames.length - 1);
      assert.equal(last.pctCounted, 100.0);
    });

    it("handles empty or invalid document safely", () => {
      assert.deepEqual(extractReplayTimeline(null), []);
      assert.deepEqual(extractReplayTimeline({}), []);
    });
  });

  describe("RPL-05: Real temporal gap detection (> 300s)", () => {
    it("identifies real gaps exceeding threshold", () => {
      const fixture = loadFixture();
      const gaps = findReplayGaps(fixture, DEFAULT_MIN_GAP_SECONDS);

      assert.equal(gaps.length, 1);
      const gap = gaps[0];
      assert.equal(gap.startIndex, 5);
      assert.equal(gap.endIndex, 6);
      assert.equal(gap.durationSeconds, 420);
      assert.equal(gap.startIso, "2026-10-25T20:05:00.000Z");
      assert.equal(gap.endIso, "2026-10-25T20:12:00.000Z");
    });

    it("returns empty when threshold exceeds all gap durations", () => {
      const fixture = loadFixture();
      const gaps = findReplayGaps(fixture, 600);
      assert.equal(gaps.length, 0);
    });

    it("returns empty array for documents with fewer than 2 frames", () => {
      assert.deepEqual(findReplayGaps(null), []);
      assert.deepEqual(findReplayGaps({ frames: [] }), []);
      assert.deepEqual(findReplayGaps({ frames: [{ t: 0, iso: "2026-10-25T20:00:00.000Z" }] }), []);
    });
  });

  describe("ELE-21 & RPL-03: Brasilia time and banner formatting", () => {
    it("formats ISO string deterministically in America/Sao_Paulo timezone", () => {
      // 20:00 UTC = 17:00 BRT
      const hour = formatReplayHourBrasilia("2026-10-25T20:00:00.000Z");
      assert.equal(hour, "17:00");

      const timeWithSuffix = formatReplayTimeBrasilia("2026-10-25T20:00:00.000Z");
      assert.equal(timeWithSuffix, "17:00 (Brasilia)");

      // 22:30 UTC = 19:30 BRT
      const hourLate = formatReplayHourBrasilia("2026-10-25T22:30:00.000Z");
      assert.equal(hourLate, "19:30");
    });

    it("returns fallback for invalid or missing timestamp", () => {
      assert.equal(formatReplayHourBrasilia("invalid"), "--:--");
      assert.equal(formatReplayHourBrasilia(null), "--:--");
      assert.equal(formatReplayTimeBrasilia(""), "--:-- (Brasilia)");
      assert.equal(formatReplayBannerText(""), "Gravacao de 25/10");
    });

    it("formats banner text adhering to RPL-03 and TXT-01 without en-dash or em-dash", () => {
      const bannerText = formatReplayBannerText("2026-10-25T20:15:00.000Z");
      assert.equal(bannerText, "Gravacao de 25/10, leitura das 17:15 (Brasilia)");
      // Strict invariants
      assert.equal(bannerText.includes("\u2013"), false); // No en-dash
      assert.equal(bannerText.includes("\u2014"), false); // No em-dash
      assert.equal(bannerText.includes("Ao vivo"), false); // Never "Ao vivo"
    });
  });
});
