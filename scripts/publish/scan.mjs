import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

const DEFAULT_TERMS_PATH = ".git/info/scan-terms.txt";
const ABSOLUTE_PATH_PATTERNS = [
  { name: "caminho absoluto (unidade)", regex: /(?<![a-zA-Z])[a-zA-Z]:[\\/]/ },
  {
    name: "caminho absoluto (pasta de usuario win-mac)",
    regex: new RegExp("[\\\\/]U" + "sers[\\\\/]", "i"),
  },
  {
    name: "caminho absoluto (pasta de usuario linux)",
    regex: new RegExp("[\\\\/]h" + "ome[\\\\/]", "i"),
  },
];

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (typeof text !== "string") {
    return "";
  }
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * @param {string} [termsPath]
 * @returns {string[]}
 */
export function loadScanTerms(termsPath = DEFAULT_TERMS_PATH) {
  const resolvedPath = path.resolve(termsPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo de termos ausente: ${termsPath}`);
  }

  const rawContent = fs.readFileSync(resolvedPath, "utf-8");
  const lines = rawContent.split(/\r?\n/);
  /** @type {string[]} */
  const terms = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    terms.push(trimmed);
  }

  if (terms.length === 0) {
    throw new Error(`Arquivo de termos vazio: ${termsPath}`);
  }

  return terms;
}

/**
 * @typedef {{ file: string; line: number; term: string }} ScanViolation
 */

/**
 * @param {string} message
 * @param {string[]} [terms]
 * @returns {ScanViolation[]}
 */
export function checkCommitMessage(message, terms = []) {
  /** @type {ScanViolation[]} */
  const violations = [];
  const normalizedMessage = normalizeText(message);

  for (const term of terms) {
    const normalizedTerm = normalizeText(term);
    if (normalizedMessage.includes(normalizedTerm)) {
      violations.push({
        file: "(mensagem)",
        line: 1,
        term,
      });
    }
  }

  for (const pattern of ABSOLUTE_PATH_PATTERNS) {
    if (pattern.regex.test(message)) {
      violations.push({
        file: "(mensagem)",
        line: 1,
        term: pattern.name,
      });
      break;
    }
  }

  return violations;
}

/**
 * @param {string} relativePath
 * @param {string[]} terms
 * @returns {ScanViolation[]}
 */
function checkPathSegment(relativePath, terms) {
  /** @type {ScanViolation[]} */
  const violations = [];
  const normalizedPath = normalizeText(relativePath);

  for (const term of terms) {
    const normalizedTerm = normalizeText(term);
    if (normalizedPath.includes(normalizedTerm)) {
      violations.push({
        file: relativePath,
        line: 1,
        term: `nome: ${term}`,
      });
    }
  }

  return violations;
}

/**
 * @param {unknown} parsed
 * @param {string} relativePath
 * @param {string[]} terms
 * @param {ScanViolation[]} violations
 */
function checkJsonKeys(parsed, relativePath, terms, violations) {
  if (parsed === null || typeof parsed !== "object") {
    return;
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      checkJsonKeys(item, relativePath, terms, violations);
    }
    return;
  }

  const record = /** @type {Record<string, unknown>} */ (parsed);
  for (const key of Object.keys(record)) {
    const normalizedKey = normalizeText(key);
    for (const term of terms) {
      const normalizedTerm = normalizeText(term);
      if (normalizedKey.includes(normalizedTerm)) {
        const alreadyReported = violations.some((v) => v.file === relativePath && v.term === term);
        if (!alreadyReported) {
          violations.push({
            file: relativePath,
            line: 1,
            term: `chave json: ${term}`,
          });
        }
      }
    }
    checkJsonKeys(record[key], relativePath, terms, violations);
  }
}

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
]);

/**
 * @param {string} filePath
 * @param {string} relativePath
 * @param {string[]} terms
 * @returns {ScanViolation[]}
 */
function checkFileContent(filePath, relativePath, terms) {
  /** @type {ScanViolation[]} */
  const violations = [];
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return violations;
  }

  let buffer;

  try {
    buffer = fs.readFileSync(filePath);
  } catch (_error) {
    return violations;
  }

  let textContent = "";
  if (filePath.endsWith(".gz")) {
    try {
      textContent = zlib.gunzipSync(buffer).toString("utf-8");
    } catch (_error) {
      textContent = buffer.toString("utf-8");
    }
  }
  if (!filePath.endsWith(".gz")) {
    textContent = buffer.toString("utf-8");
  }

  const lines = textContent.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const normalizedLine = normalizeText(line);

    for (const term of terms) {
      const normalizedTerm = normalizeText(term);
      if (normalizedLine.includes(normalizedTerm)) {
        violations.push({
          file: relativePath,
          line: lineNumber,
          term,
        });
      }
    }

    for (const pattern of ABSOLUTE_PATH_PATTERNS) {
      if (pattern.regex.test(line)) {
        violations.push({
          file: relativePath,
          line: lineNumber,
          term: pattern.name,
        });
        break;
      }
    }
  }

  if (filePath.endsWith(".json") || filePath.endsWith(".json.gz")) {
    try {
      const parsed = JSON.parse(textContent);
      checkJsonKeys(parsed, relativePath, terms, violations);
    } catch (_ignore) {
      // JSON com erro de sintaxe ja e detectado no conteudo
    }
  }

  return violations;
}

/**
 * @param {string} targetDir
 * @param {string[]} terms
 * @param {string[] | null} [filesToCheck]
 * @returns {ScanViolation[]}
 */
export function scanDirectory(targetDir, terms, filesToCheck = null) {
  /** @type {ScanViolation[]} */
  const violations = [];
  const baseDir = path.resolve(targetDir);

  let targetFiles = filesToCheck;
  if (!targetFiles) {
    targetFiles = collectAllFiles(baseDir);
  }

  for (const relativePath of targetFiles) {
    const fullPath = path.join(baseDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      continue;
    }

    const pathViolations = checkPathSegment(relativePath, terms);
    for (const v of pathViolations) {
      violations.push(v);
    }

    const contentViolations = checkFileContent(fullPath, relativePath, terms);
    for (const v of contentViolations) {
      violations.push(v);
    }
  }

  return violations;
}

/**
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]}
 */
function collectAllFiles(dir, prefix = "") {
  /** @type {string[]} */
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const rel = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      const sub = collectAllFiles(path.join(dir, entry.name), rel);
      for (const s of sub) {
        result.push(s);
      }
      continue;
    }
    result.push(rel);
  }

  return result;
}

/**
 * @param {string[]} args
 * @returns {{ message: string | null; terms: string; dir: string }}
 */
function parseCliArgs(args) {
  const parsed = {
    message: /** @type {string | null} */ (null),
    terms: DEFAULT_TERMS_PATH,
    dir: process.cwd(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--message" && index + 1 < args.length) {
      parsed.message = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--terms" && index + 1 < args.length) {
      parsed.terms = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--dir" && index + 1 < args.length) {
      parsed.dir = args[index + 1];
      index += 1;
    }
  }

  return parsed;
}

function runCli() {
  const args = parseCliArgs(process.argv.slice(2));

  /** @type {string[]} */
  let terms = [];
  try {
    terms = loadScanTerms(args.terms);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }

  if (args.message !== null) {
    const messageViolations = checkCommitMessage(args.message, terms);
    if (messageViolations.length > 0) {
      for (const item of messageViolations) {
        console.error(`${item.file}:${item.line}: ${item.term}`);
      }
      process.exit(1);
    }
    console.log("0 ocorrências");
    process.exit(0);
  }

  const manifestPath = path.join(args.dir, "scripts/publish/public-manifest.json");
  /** @type {string[] | null} */
  let filesToScan = null;

  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const allFiles = collectAllFiles(args.dir);
    filesToScan = filterManifestFiles(allFiles, manifest);
  }

  const violations = scanDirectory(args.dir, terms, filesToScan);
  if (violations.length > 0) {
    for (const item of violations) {
      console.error(`${item.file}:${item.line}: ${item.term}`);
    }
    process.exit(1);
  }

  console.log("0 ocorrências");
  process.exit(0);
}

/**
 * @param {string[]} files
 * @param {{ include: string[]; exclude: string[] }} manifest
 * @returns {string[]}
 */
export function filterManifestFiles(files, manifest) {
  /** @type {string[]} */
  const allowed = [];
  for (const file of files) {
    const normalizedPath = file.replace(/\\/g, "/");
    let isIncluded = false;
    for (const pattern of manifest.include) {
      if (matchGlob(normalizedPath, pattern)) {
        isIncluded = true;
        break;
      }
    }
    if (!isIncluded) {
      continue;
    }

    let isExcluded = false;
    for (const pattern of manifest.exclude) {
      if (matchGlob(normalizedPath, pattern)) {
        isExcluded = true;
        break;
      }
    }
    if (isExcluded) {
      continue;
    }

    allowed.push(file);
  }
  return allowed;
}

/**
 * @param {string} filePath
 * @param {string} pattern
 * @returns {boolean}
 */
function matchGlob(filePath, pattern) {
  const normalizedFile = filePath.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");

  if (normalizedPattern.endsWith("/**")) {
    const base = normalizedPattern.slice(0, -3);
    if (normalizedFile === base || normalizedFile.startsWith(`${base}/`)) {
      return true;
    }
    return false;
  }

  if (normalizedPattern.endsWith("/*")) {
    const base = normalizedPattern.slice(0, -2);
    if (!normalizedFile.startsWith(`${base}/`)) {
      return false;
    }
    const remainder = normalizedFile.slice(base.length + 1);
    if (remainder.includes("/")) {
      return false;
    }
    return true;
  }

  if (normalizedPattern.startsWith("**/")) {
    const suffix = normalizedPattern.slice(3);
    if (normalizedFile === suffix || normalizedFile.endsWith(`/${suffix}`)) {
      return true;
    }
    return false;
  }

  if (normalizedPattern.includes("*")) {
    const regexPattern = normalizedPattern.replace(/\./g, "\\.").replace(/\*/g, "[^/]*");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedFile);
  }

  return normalizedFile === normalizedPattern;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
