import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Deterministic Mock TSE Server for tests and recordings (APU-15, FIX-01).
 *
 * Supported modes:
 * - "progression": Advances through synthetic count stages (0%, 25%, 50%, 90%, 100%)
 * - "stagnant": Freezes generation timestamp and tracking data (APU-02)
 * - "404-error": Returns HTTP 404 for a designated missing municipal code (APU-01)
 * - "etag-304": Responds with 304 Not Modified when If-None-Match matches payload ETag
 * - "corrupted": Returns malformed or truncated JSON payload for resilience tests (APU-04)
 *
 * Demonstrates simulated worst-case delay <= 5 minutes (APU-15).
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_FIXTURE_PATH = path.join(__dirname, "fixtures", "synthetic-count.json");

export const STAGE_KEYS = ["unstarted", "partial_25", "partial_50", "partial_90", "concluded"];
export const MAX_ALLOWED_DELAY_SECONDS = 300; // 5 minutes (APU-15)

/**
 * Computes an MD5 hex hash for ETag generation.
 *
 * @param {string} content
 * @returns {string}
 */
function computeEtag(content) {
  return crypto.createHash("md5").update(content, "utf8").digest("hex");
}

/**
 * Safely loads fixture JSON from disk or returns provided object.
 *
 * @param {string | Record<string, unknown>} [fixtureOrPath]
 * @returns {{ele_c?: Record<string, unknown>, mun_e006258_cm?: Record<string, unknown>, stages?: Record<string, {tracking?: Record<string, unknown>, sp?: Record<string, unknown>, br?: Record<string, unknown>}>, municipalities?: Record<string, Record<string, unknown>>}}
 */
function loadFixtures(fixtureOrPath) {
  if (fixtureOrPath && typeof fixtureOrPath === "object") {
    return /** @type {ReturnType<typeof loadFixtures>} */ (fixtureOrPath);
  }
  let resolvedPath = DEFAULT_FIXTURE_PATH;
  if (typeof fixtureOrPath === "string") {
    resolvedPath = fixtureOrPath;
  }
  const rawText = fs.readFileSync(resolvedPath, "utf8");
  return JSON.parse(rawText);
}

/**
 * Creates and configures a mock TSE HTTP server instance.
 *
 * @param {{
 *   port?: number,
 *   host?: string,
 *   fixture?: Record<string, unknown> | string,
 *   initialMode?: "progression" | "stagnant" | "404-error" | "etag-304" | "corrupted",
 *   initialStage?: number | string,
 *   errorMunicipalityCode?: string,
 *   clock?: { now: () => number },
 *   simulatedDelaySeconds?: number
 * }} [options]
 * @returns {{
 *   server: http.Server,
 *   start: () => Promise<{ port: number, host: string, baseUrl: string }>,
 *   stop: () => Promise<void>,
 *   setMode: (mode: string) => void,
 *   getMode: () => string,
 *   setStage: (stage: number | string) => void,
 *   advanceStage: () => string,
 *   getStageKey: () => string,
 *   getSimulatedDelaySeconds: () => number,
 *   setSimulatedDelaySeconds: (seconds: number) => void,
 *   getRequestLog: () => Array<{ method: string, url: string, headers: http.IncomingHttpHeaders, status: number, timestamp: number }>,
 *   clearRequestLog: () => void,
 *   getPort: () => number,
 *   getBaseUrl: () => string
 * }}
 */
export function createMockTseServer(options = {}) {
  const host = options.host || "127.0.0.1";
  const requestedPort = options.port || 0;
  const fixtures = loadFixtures(options.fixture);
  const errorMunicipalityCode = String(options.errorMunicipalityCode || "99999");
  const clock = options.clock || { now: () => Date.now() };

  /** @type {string} */
  let currentMode = options.initialMode || "progression";
  let currentStageIndex = 0;
  if (typeof options.initialStage === "number") {
    currentStageIndex = Math.max(0, Math.min(STAGE_KEYS.length - 1, options.initialStage));
  }
  if (typeof options.initialStage === "string") {
    const found = STAGE_KEYS.indexOf(options.initialStage);
    if (found >= 0) {
      currentStageIndex = found;
    }
  }

  let simulatedDelaySeconds = Math.min(
    MAX_ALLOWED_DELAY_SECONDS,
    Math.max(0, options.simulatedDelaySeconds || 45),
  );

  /** @type {Array<{ method: string, url: string, headers: http.IncomingHttpHeaders, status: number, timestamp: number }>} */
  const requestLog = [];

  let assignedPort = 0;

  function getCurrentStageKey() {
    return STAGE_KEYS[currentStageIndex];
  }

  /**
   * Dispatches an HTTP response with CORS and ETag support.
   *
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {number} statusCode
   * @param {unknown} payload
   */
  function sendResponse(req, res, statusCode, payload) {
    let bodyStr = "";
    if (typeof payload === "string") {
      bodyStr = payload;
    }
    if (typeof payload !== "string") {
      bodyStr = JSON.stringify(payload);
    }
    const etag = `"${computeEtag(bodyStr)}"`;

    requestLog.push({
      method: req.method || "GET",
      url: req.url || "/",
      headers: req.headers,
      status: statusCode,
      timestamp: clock.now(),
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, If-None-Match, If-Modified-Since");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("ETag", etag);

    const clientIfNoneMatch = req.headers["if-none-match"];
    if (clientIfNoneMatch && clientIfNoneMatch === etag && statusCode === 200) {
      res.writeHead(304, { "Content-Type": "application/json; charset=utf-8" });
      res.end();
      return;
    }

    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(bodyStr);
  }

  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, If-None-Match, If-Modified-Since",
      );
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = req.url || "/";
    const cleanUrl = reqUrl.split("?")[0];

    // Corrupted payload mode for resilience tests (APU-04)
    if (currentMode === "corrupted" && cleanUrl.endsWith("-u.json")) {
      sendResponse(req, res, 200, '{"ele":"6258","tpabr":"sp","corrupted":true,');
      return;
    }

    // Election configuration index (ele-c.json)
    if (cleanUrl.endsWith("/config/ele-c.json") || cleanUrl === "/ele-c.json") {
      sendResponse(req, res, 200, fixtures.ele_c || {});
      return;
    }

    // Municipal configuration file (mun-e006258-cm.json)
    if (cleanUrl.includes("/config/mun-e") && cleanUrl.endsWith("-cm.json")) {
      sendResponse(req, res, 200, fixtures.mun_e006258_cm || {});
      return;
    }

    // State tracking file (sp-e006258-ab.json)
    if (cleanUrl.includes("/dados/sp/sp-e") && cleanUrl.endsWith("-ab.json")) {
      if (currentMode === "stagnant") {
        const frozenStage = fixtures.stages?.unstarted || fixtures.stages?.[STAGE_KEYS[0]];
        sendResponse(req, res, 200, frozenStage?.tracking || {});
        return;
      }
      const stageKey = getCurrentStageKey();
      const stageData = fixtures.stages?.[stageKey] || fixtures.stages?.[STAGE_KEYS[0]];
      sendResponse(req, res, 200, stageData?.tracking || {});
      return;
    }

    // State totalization file (sp-c0001-e006258-u.json)
    if (cleanUrl.includes("/dados/sp/sp-c0001-e") && cleanUrl.endsWith("-u.json")) {
      const stageKey = getCurrentStageKey();
      const stageData = fixtures.stages?.[stageKey] || fixtures.stages?.[STAGE_KEYS[0]];
      sendResponse(req, res, 200, stageData?.sp || {});
      return;
    }

    // National totalization file (br-c0001-e006258-u.json)
    if (cleanUrl.includes("/dados/br/br-c0001-e") && cleanUrl.endsWith("-u.json")) {
      const stageKey = getCurrentStageKey();
      const stageData = fixtures.stages?.[stageKey] || fixtures.stages?.[STAGE_KEYS[0]];
      sendResponse(req, res, 200, stageData?.br || {});
      return;
    }

    // Municipal count files (sp<TSE>-c0001-e006258-u.json)
    const munMatch = cleanUrl.match(/\/dados\/sp\/sp(\d{5})-c0001-e\d{6}-u\.json$/);
    if (munMatch) {
      const tseCode = munMatch[1];
      if (currentMode === "404-error" && tseCode === errorMunicipalityCode) {
        sendResponse(req, res, 404, {
          erro: "Municipio nao encontrado",
          codigo: tseCode,
          mensagem: "Arquivo inexistente para o codigo informado",
        });
        return;
      }

      const municipalData = fixtures.municipalities?.[tseCode];
      if (municipalData) {
        sendResponse(req, res, 200, municipalData);
        return;
      }

      sendResponse(req, res, 404, {
        erro: "Municipio nao encontrado no corpus sintetico",
        codigo: tseCode,
      });
      return;
    }

    sendResponse(req, res, 404, {
      erro: "Rota nao encontrada no servidor falso do TSE",
      url: cleanUrl,
    });
  });

  return {
    server,
    start() {
      return new Promise((resolve, reject) => {
        server.listen(requestedPort, host, () => {
          const address = server.address();
          if (address && typeof address === "object") {
            assignedPort = address.port;
          }
          resolve({
            port: assignedPort,
            host,
            baseUrl: `http://${host}:${assignedPort}`,
          });
        });
        server.on("error", (err) => {
          reject(err);
        });
      });
    },
    stop() {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
    setMode(mode) {
      currentMode = mode;
    },
    getMode() {
      return currentMode;
    },
    setStage(stage) {
      if (typeof stage === "number") {
        currentStageIndex = Math.max(0, Math.min(STAGE_KEYS.length - 1, stage));
        return;
      }
      const found = STAGE_KEYS.indexOf(stage);
      if (found >= 0) {
        currentStageIndex = found;
      }
    },
    advanceStage() {
      if (currentStageIndex < STAGE_KEYS.length - 1) {
        currentStageIndex += 1;
      }
      return STAGE_KEYS[currentStageIndex];
    },
    getStageKey() {
      return getCurrentStageKey();
    },
    getSimulatedDelaySeconds() {
      return simulatedDelaySeconds;
    },
    setSimulatedDelaySeconds(sec) {
      simulatedDelaySeconds = Math.min(MAX_ALLOWED_DELAY_SECONDS, Math.max(0, sec));
    },
    getRequestLog() {
      return [...requestLog];
    },
    clearRequestLog() {
      requestLog.length = 0;
    },
    getPort() {
      return assignedPort;
    },
    getBaseUrl() {
      return `http://${host}:${assignedPort}`;
    },
  };
}
