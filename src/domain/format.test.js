import assert from "node:assert/strict";
import test from "node:test";
import { formatAbbreviated, formatValue } from "./format.js";

test("IND-03 formatValue formats population with dot thousands separator", () => {
  assert.equal(formatValue(11451999, "population"), "11.451.999");
  assert.equal(formatValue(8500, "population"), "8.500");
  assert.equal(formatValue(0, "population"), "0");
});

test("IND-03 formatValue formats area with comma decimal and dot thousands separator", () => {
  assert.equal(formatValue(1521.11, "area"), "1.521,1");
  assert.equal(formatValue(248219.5, "area"), "248.219,5");
});

test("IND-03 formatValue formats density with one decimal place", () => {
  assert.equal(formatValue(7528.26, "density"), "7.528,3");
  assert.equal(formatValue(15.42, "density"), "15,4");
});

test("IND-03 formatValue formats gdpPerCapita as Brazilian Real currency", () => {
  assert.equal(formatValue(58300, "gdpPerCapita"), "R$ 58.300");
  assert.equal(formatValue(123456.78, "gdpPerCapita"), "R$ 123.457");
});

test("IND-03 formatValue returns Sem dado for null, undefined or NaN", () => {
  assert.equal(formatValue(null, "population"), "Sem dado");
  assert.equal(formatValue(undefined, "area"), "Sem dado");
  assert.equal(formatValue(Number.NaN, "density"), "Sem dado");
});

test("IND-03 formatAbbreviated formats numbers with mil and mi suffix", () => {
  assert.equal(formatAbbreviated(500, "population"), "500");
  assert.equal(formatAbbreviated(50000, "population"), "50 mil");
  assert.equal(formatAbbreviated(1200000, "population"), "1,2 mi");
  assert.equal(formatAbbreviated(11451999, "population"), "11,5 mi");
});

test("IND-03 formatAbbreviated formats gdpPerCapita with currency prefix and compact suffix", () => {
  assert.equal(formatAbbreviated(45000, "gdpPerCapita"), "R$ 45 mil");
  assert.equal(formatAbbreviated(1200000, "gdpPerCapita"), "R$ 1,2 mi");
});
