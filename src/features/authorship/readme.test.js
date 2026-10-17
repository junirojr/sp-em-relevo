import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT_DIR = process.cwd();
const README_PATH = path.join(ROOT_DIR, "README.md");

test("AUT-05 README contains all required sections", () => {
  const content = readReadmeContent();
  const sections = extractMarkdownSections(content);

  const requiredSections = ["O que é", "Captura", "Como rodar", "Decisões", "Fontes", "Licença"];

  for (const required of requiredSections) {
    assert.ok(sections.includes(required), `README missing section: ${required}`);
  }
});

test("AUT-05 README captures image reference and image exists on disk", () => {
  const content = readReadmeContent();
  const images = extractImageReferences(content);

  assert.ok(images.length > 0, "README should contain at least one image reference");
  assert.ok(images.includes("docs/captura.png"), "README should reference docs/captura.png");

  for (const image of images) {
    const fullPath = path.resolve(ROOT_DIR, image);
    assert.ok(fs.existsSync(fullPath), `Referenced image does not exist on disk: ${image}`);
  }
});

test("AUT-05 README relative links point to existing files or directories", () => {
  const content = readReadmeContent();
  const links = extractRelativeLinks(content);

  assert.ok(links.length > 0, "README should have relative links");

  for (const link of links) {
    const targetPath = path.resolve(ROOT_DIR, link);
    assert.ok(fs.existsSync(targetPath), `Relative link does not exist on disk: ${link}`);
  }
});

test("AUT-05 README sources section contains years and external links", () => {
  const content = readReadmeContent();
  const sourcesIndex = content.indexOf("## Fontes");
  const licenseIndex = content.indexOf("## Licença");
  assert.ok(sourcesIndex !== -1, "Missing Fontes section");
  assert.ok(licenseIndex > sourcesIndex, "Licença should come after Fontes");

  const sourcesText = content.slice(sourcesIndex, licenseIndex);

  assert.ok(sourcesText.includes("IBGE"), "Missing IBGE source");
  assert.ok(sourcesText.includes("Seade"), "Missing Seade source");
  assert.ok(sourcesText.includes("2022"), "Missing year 2022 in sources");
  assert.ok(sourcesText.includes("https://"), "Missing external links in sources");
});

test("AUT-05 README contains no forbidden dashes U+2013 or U+2014", () => {
  const content = readReadmeContent();
  assert.equal(content.includes("\u2013"), false, "README contains U+2013 en-dash");
  assert.equal(content.includes("\u2014"), false, "README contains U+2014 em-dash");
});

function readReadmeContent() {
  return fs.readFileSync(README_PATH, "utf-8");
}

/**
 * @param {string} content
 * @returns {string[]}
 */
function extractMarkdownSections(content) {
  const headingMatches = [...content.matchAll(/^##\s+(.+)$/gm)];
  return headingMatches.map((match) => match[1].trim());
}

/**
 * @param {string} content
 * @returns {string[]}
 */
function extractRelativeLinks(content) {
  const linkMatches = [...content.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)];
  const relativeLinks = [];
  for (const match of linkMatches) {
    const url = match[2].trim();
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("#")) {
      continue;
    }
    relativeLinks.push(url);
  }
  return relativeLinks;
}

/**
 * @param {string} content
 * @returns {string[]}
 */
function extractImageReferences(content) {
  const imageMatches = [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  return imageMatches.map((match) => match[2].trim());
}
