import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkCommitMessage, loadScanTerms, normalizeText, scanDirectory } from "./scan.mjs";

test("PUB-01 normalizeText removes diacritics and converts to lowercase", () => {
  const result = normalizeText("São Paulo - ACENTUAÇÃO");
  assert.equal(result, "sao paulo - acentuacao");
});

test("PUB-01 loadScanTerms throws if file does not exist or is empty", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-"));
  const nonExistent = path.join(tempDir, "missing.txt");
  assert.throws(() => loadScanTerms(nonExistent), /ausente|faltar|não existe/i);

  const emptyFile = path.join(tempDir, "empty.txt");
  fs.writeFileSync(emptyFile, "   \n\n  ", "utf-8");
  assert.throws(() => loadScanTerms(emptyFile), /vazio/i);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("PUB-01 loadScanTerms loads non-empty terms ignoring blank lines", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-"));
  const termsFile = path.join(tempDir, "terms.txt");
  fs.writeFileSync(termsFile, "TermoAlfa\n\nTermoBeta\r\n", "utf-8");

  const terms = loadScanTerms(termsFile);
  assert.deepEqual(terms, ["TermoAlfa", "TermoBeta"]);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("PUB-01 scanDirectory finds term in file content ignoring case and accents", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-"));
  const filePath = path.join(tempDir, "sample.txt");
  fs.writeFileSync(filePath, "Linha 1\nContem termoalfa aqui\nLinha 3", "utf-8");

  const occurrences = scanDirectory(tempDir, ["TermoAlfa"]);
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].term, "TermoAlfa");
  assert.equal(occurrences[0].line, 2);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("PUB-01 scanDirectory finds term in file name and directory name", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-"));
  const nestedDir = path.join(tempDir, "termoalfa-dir");
  fs.mkdirSync(nestedDir);
  const filePath = path.join(nestedDir, "termobeta-file.txt");
  fs.writeFileSync(filePath, "conteudo limpo", "utf-8");

  const occurrences = scanDirectory(tempDir, ["TermoAlfa", "TermoBeta"]);
  assert.equal(occurrences.length, 2);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("PUB-01 scanDirectory detects JSON keys containing prohibited terms", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-"));
  const jsonPath = path.join(tempDir, "data.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ termoalfa: "valor seguro" }), "utf-8");

  const occurrences = scanDirectory(tempDir, ["TermoAlfa"]);
  assert.equal(occurrences.length, 1);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("PUB-01 scanDirectory detects absolute paths", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-"));
  const filePath = path.join(tempDir, "paths.txt");
  const drivePath = ["C", ":", "\\Projeto\\arquivo.js"].join("");
  const linuxPath = ["/h", "ome/user/work"].join("");
  const macPath = ["/U", "sers/dev/code"].join("");
  fs.writeFileSync(
    filePath,
    `Linha com ${drivePath}\nLinha com ${linuxPath}\nLinha com ${macPath}\n`,
    "utf-8",
  );

  const occurrences = scanDirectory(tempDir, ["TermoInexistente"]);
  assert.equal(occurrences.length, 3);
  assert.ok(occurrences.some((item) => item.term.includes("caminho absoluto")));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("PUB-01 checkCommitMessage detects prohibited terms and absolute paths", () => {
  const violations1 = checkCommitMessage("feat: termoalfa adicionado", ["TermoAlfa"]);
  assert.equal(violations1.length, 1);

  const driveRepo = ["C", ":", "\\repo"].join("");
  const violations2 = checkCommitMessage(`fix: corrigido em ${driveRepo}`, []);
  assert.equal(violations2.length, 1);

  const clean = checkCommitMessage("feat(pub): varredura e exportacao", ["TermoAlfa"]);
  assert.equal(clean.length, 0);
});
