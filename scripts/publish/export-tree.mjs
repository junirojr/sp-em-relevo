import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { filterManifestFiles, loadScanTerms, scanDirectory } from "./scan.mjs";

/**
 * @param {string} filePath
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchPattern(filePath, pattern) {
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
 * @typedef {{ include: string[]; exclude: string[] }} Manifest
 */

/**
 * Copies the files allowed by the manifest into an empty directory outside the repository.
 * Every source is validated before the first byte is copied, so a refused export leaves no
 * partial tree behind and never deletes a directory the caller handed in.
 *
 * @param {{
 *   repoDir?: string;
 *   targetDir: string;
 *   manifest?: Manifest | null;
 *   skipScan?: boolean;
 *   termsPath?: string;
 * }} options
 * @returns {string[]}
 */
export function exportTree({
  repoDir = process.cwd(),
  targetDir,
  manifest = null,
  skipScan = false,
  termsPath = ".git/info/scan-terms.txt",
}) {
  const resolvedRepo = path.resolve(repoDir);
  const resolvedTarget = path.resolve(targetDir);

  assertTargetOutsideRepository(resolvedRepo, resolvedTarget);
  assertTargetIsEmpty(resolvedTarget);

  const activeManifest = manifest ?? loadPublicManifest(resolvedRepo);
  const canonicalRepo = fs.realpathSync(resolvedRepo);
  const filesToExport = listSafeFilesToExport(canonicalRepo, activeManifest);

  fs.mkdirSync(resolvedTarget, { recursive: true });
  const exported = copyFiles(canonicalRepo, resolvedTarget, filesToExport);

  if (!skipScan) {
    assertExportedTreeIsClean(path.join(resolvedRepo, termsPath), resolvedTarget);
  }

  return exported;
}

/**
 * @param {string} resolvedRepo
 * @param {string} resolvedTarget
 */
function assertTargetOutsideRepository(resolvedRepo, resolvedTarget) {
  if (!isWithinDirectory(resolvedRepo, resolvedTarget)) {
    return;
  }
  throw new Error(`Diretório de destino não pode estar dentro do repositório: ${resolvedTarget}`);
}

/**
 * @param {string} resolvedTarget
 */
function assertTargetIsEmpty(resolvedTarget) {
  if (!fs.existsSync(resolvedTarget)) {
    return;
  }
  if (fs.readdirSync(resolvedTarget).length === 0) {
    return;
  }
  throw new Error(`Diretório de destino não vazio: ${resolvedTarget}`);
}

/**
 * @param {string} resolvedRepo
 * @returns {Manifest}
 */
function loadPublicManifest(resolvedRepo) {
  const manifestPath = path.join(resolvedRepo, "scripts/publish/public-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifesto público ausente em ${manifestPath}`);
  }
  return /** @type {Manifest} */ (JSON.parse(fs.readFileSync(manifestPath, "utf-8")));
}

/**
 * @param {string} canonicalRepo
 * @param {Manifest} manifest
 * @returns {string[]}
 */
function listSafeFilesToExport(canonicalRepo, manifest) {
  const allRepoFiles = collectAllFiles(canonicalRepo);
  const filesToExport = filterManifestFiles(allRepoFiles, manifest);

  assertSourcesAreSafe(canonicalRepo, filesToExport);

  return filesToExport;
}

/**
 * Only files that would be copied are judged: a link the manifest never selects is not copied,
 * so it cannot leak and must not block the export (for example links under node_modules).
 *
 * @param {string} canonicalRepo
 * @param {string[]} relativeFiles
 */
function assertSourcesAreSafe(canonicalRepo, relativeFiles) {
  const refusals = collectRefusals(canonicalRepo, relativeFiles);
  if (refusals.length === 0) {
    return;
  }
  throw new Error(`Exportação recusada, nada foi copiado:\n${refusals.join("\n")}`);
}

/**
 * @param {string} canonicalRepo
 * @param {string[]} relativeFiles
 * @returns {string[]}
 */
function collectRefusals(canonicalRepo, relativeFiles) {
  /** @type {string[]} */
  const refusals = [];

  for (const relativeFile of relativeFiles) {
    const reason = findUnsafeSourceReason(canonicalRepo, relativeFile);
    if (reason === null) {
      continue;
    }
    refusals.push(`- ${toPosixPath(relativeFile)}: ${reason}`);
  }

  return refusals;
}

/**
 * @param {string} canonicalRepo
 * @param {string} relativeFile
 * @returns {string | null} why the source cannot be exported, or null when it is safe
 */
function findUnsafeSourceReason(canonicalRepo, relativeFile) {
  const sourceFile = path.join(canonicalRepo, relativeFile);

  if (fs.lstatSync(sourceFile).isSymbolicLink()) {
    return "link simbólico ou junção não pode ser exportado";
  }

  const realSourceFile = fs.realpathSync(sourceFile);
  const resolvesOutsideRepository = !isWithinDirectory(canonicalRepo, realSourceFile);
  if (resolvesOutsideRepository) {
    return "o caminho real resolve fora da raiz do repositório";
  }

  return null;
}

/**
 * @param {string} rootDir
 * @param {string} candidatePath
 * @returns {boolean} true when candidatePath is rootDir itself or sits below it
 */
function isWithinDirectory(rootDir, candidatePath) {
  const relativePath = path.relative(rootDir, candidatePath);
  if (path.isAbsolute(relativePath)) {
    return false;
  }
  const [firstSegment] = relativePath.split(path.sep);
  return firstSegment !== "..";
}

/**
 * @param {string} sourceRoot
 * @param {string} targetRoot
 * @param {string[]} relativeFiles
 * @returns {string[]}
 */
function copyFiles(sourceRoot, targetRoot, relativeFiles) {
  /** @type {string[]} */
  const exported = [];

  for (const relativeFile of relativeFiles) {
    copyFile(sourceRoot, targetRoot, relativeFile);
    exported.push(toPosixPath(relativeFile));
  }

  return exported;
}

/**
 * @param {string} sourceRoot
 * @param {string} targetRoot
 * @param {string} relativeFile
 */
function copyFile(sourceRoot, targetRoot, relativeFile) {
  const destFile = path.join(targetRoot, relativeFile);
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, relativeFile), destFile);
}

/**
 * @param {string} termsFile
 * @param {string} exportedDir
 */
function assertExportedTreeIsClean(termsFile, exportedDir) {
  const terms = loadScanTerms(termsFile);
  const violations = scanDirectory(exportedDir, terms);
  if (violations.length === 0) {
    return;
  }
  fs.rmSync(exportedDir, { recursive: true, force: true });
  throw new Error(`Varredura reprovou ${violations.length} ocorrência(s) na árvore exportada`);
}

/**
 * @param {string} relativeFile
 * @returns {string}
 */
function toPosixPath(relativeFile) {
  return relativeFile.replace(/\\/g, "/");
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Uso: node scripts/publish/export-tree.mjs <diretório-destino>");
    process.exit(1);
  }

  const targetDir = args[0];
  try {
    const list = exportTree({ targetDir });
    console.log(`Exportados ${list.length} arquivos com sucesso:`);
    for (const item of list) {
      console.log(`- ${item}`);
    }
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erro ao exportar árvore: ${message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
