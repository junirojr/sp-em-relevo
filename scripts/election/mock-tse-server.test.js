import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createMockTseServer, MAX_ALLOWED_DELAY_SECONDS, STAGE_KEYS } from "./mock-tse-server.mjs";

/**
 * Performs a simple HTTP GET request and returns status, headers, and text body.
 *
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, body: string }>}
 */
function fetchHttp(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const statusCode = res.statusCode || 0;
        resolve({
          status: statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

test("APU-15 mock server starts, responds to TSE URLs, and proves delay <= 5 minutes", async () => {
  const server = createMockTseServer({
    simulatedDelaySeconds: 120,
  });

  const { baseUrl } = await server.start();
  try {
    const delay = server.getSimulatedDelaySeconds();
    assert.ok(delay <= MAX_ALLOWED_DELAY_SECONDS, "delay must be <= 300 seconds");
    assert.equal(delay, 120);

    const configRes = await fetchHttp(`${baseUrl}/oficial/comum/config/ele-c.json`);
    assert.equal(configRes.status, 200);
    const configData = JSON.parse(configRes.body);
    assert.equal(configData.ele[0].cd, "6258");

    const munConfigRes = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/config/mun-e006258-cm.json`,
    );
    assert.equal(munConfigRes.status, 200);
    const munConfigData = JSON.parse(munConfigRes.body);
    assert.ok(Array.isArray(munConfigData.abr[0].mu));
  } finally {
    await server.stop();
  }
});

test("APU-15 / APU-01 mock server returns 404 for designated missing municipality", async () => {
  const server = createMockTseServer({
    initialMode: "404-error",
    errorMunicipalityCode: "99999",
  });

  const { baseUrl } = await server.start();
  try {
    const notFoundRes = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/dados/sp/sp99999-c0001-e006258-u.json`,
    );
    assert.equal(notFoundRes.status, 404);
    const notFoundData = JSON.parse(notFoundRes.body);
    assert.equal(notFoundData.codigo, "99999");

    const capitalRes = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/dados/sp/sp71072-c0001-e006258-u.json`,
    );
    assert.equal(capitalRes.status, 200);
  } finally {
    await server.stop();
  }
});

test("APU-15 / APU-02 mock server supports ETag 304 Not Modified when if-none-match is sent", async () => {
  const server = createMockTseServer({
    initialMode: "etag-304",
  });

  const { baseUrl } = await server.start();
  try {
    const initialRes = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json`,
    );
    assert.equal(initialRes.status, 200);
    const etag = initialRes.headers.etag;
    assert.ok(etag, "ETag header must be present");

    const cachedRes = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json`,
      { "if-none-match": String(etag) },
    );
    assert.equal(cachedRes.status, 304);
    assert.equal(cachedRes.body, "");
  } finally {
    await server.stop();
  }
});

test("APU-15 / APU-04 mock server serves corrupted / truncated JSON in corrupted mode", async () => {
  const server = createMockTseServer({
    initialMode: "corrupted",
  });

  const { baseUrl } = await server.start();
  try {
    const corruptRes = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json`,
    );
    assert.equal(corruptRes.status, 200);
    assert.throws(
      () => JSON.parse(corruptRes.body),
      /Unexpected end of JSON input|SyntaxError/,
      "Payload must be truncated or malformed JSON",
    );
  } finally {
    await server.stop();
  }
});

test("APU-15 / APU-06 mock server progresses deterministically through stages (0%, 25%, 50%, 90%, 100%)", async () => {
  const server = createMockTseServer({
    initialMode: "progression",
    initialStage: 0,
  });

  const { baseUrl } = await server.start();
  try {
    assert.equal(server.getStageKey(), "unstarted");

    const tracking0 = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/dados/sp/sp-e006258-ab.json`,
    );
    const data0 = JSON.parse(tracking0.body);
    assert.equal(data0.and, "n");

    server.setStage("partial_25");
    assert.equal(server.getStageKey(), "partial_25");
    const spRes25 = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json`,
    );
    const sp25 = JSON.parse(spRes25.body);
    assert.equal(sp25.s.pst, "25,00");

    server.advanceStage();
    assert.equal(server.getStageKey(), "partial_50");
    const spRes50 = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json`,
    );
    const sp50 = JSON.parse(spRes50.body);
    assert.equal(sp50.s.pst, "50,00");

    server.setStage("concluded");
    assert.equal(server.getStageKey(), "concluded");
    const brResConcluded = await fetchHttp(
      `${baseUrl}/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json`,
    );
    const brConcluded = JSON.parse(brResConcluded.body);
    assert.equal(brConcluded.tf, "s");
    assert.equal(brConcluded.carg[0].agr[0].cand[0].st, "Eleito");
    assert.equal(brConcluded.carg[0].agr[0].cand[0].e, "s");
  } finally {
    await server.stop();
  }
});

test("FIX-01 mock server fixtures use only fictitious candidate names, numbers, and parties", async () => {
  const server = createMockTseServer();
  const { baseUrl } = await server.start();
  try {
    const res = await fetchHttp(`${baseUrl}/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json`);
    const body = res.body;

    // Check strict neutrality and fictitious identities
    assert.ok(body.includes("Candidato Alfa"));
    assert.ok(body.includes("Candidato Beta"));
    assert.ok(body.includes("PARTIDO-A"));
    assert.ok(body.includes("PARTIDO-B"));

    // Prohibit real political figure names from 2026 presidential dispute in synthetic fixtures
    const forbiddenNames = [
      "Flavio Bolsonaro",
      "Lula",
      "Tarcisio",
      "Haddad",
      "Derrite",
      "Jair Bolsonaro",
    ];
    for (const name of forbiddenNames) {
      assert.ok(
        !body.toLowerCase().includes(name.toLowerCase()),
        `Synthetic fixture must not contain real figure name: ${name}`,
      );
    }
  } finally {
    await server.stop();
  }
});
