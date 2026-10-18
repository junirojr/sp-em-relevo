import assert from "node:assert/strict";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createRootSelectors } from "../../app/projection.js";
import { changePointedUnit, createInitialState, reduceRootState } from "../../app/state.js";
import { aggregateIndicator } from "../../domain/aggregation.js";
import { computeTargetHeight } from "../../domain/height.js";
import { INDICATORS } from "../../domain/indicator.js";
import { buildSearchEntries, findSuggestions } from "../../domain/search.js";
import { buildPanelUnits } from "../../domain/selection.js";
import { createTerritory } from "../../domain/territory.js";
import { RAISE_LIFT } from "../../engine/constants.js";
import {
  buildIndexByCode,
  createMapMotion,
  readRaisedUnitIndexes,
  retargetLifts,
} from "../../engine/frame-loop.js";
import { buildMunicipalities } from "../../engine/geometry.js";
import { parseMunicipalities } from "../../app/data-loader.js";
import { buildClearViewModel } from "./clear-view.js";
import { buildRankingUnits } from "./panel-view.js";
import {
  addRegionAction,
  clearRetentionNotice,
  clearSelectionAction,
  createSelectionState,
  formatRetentionNotice,
  reduceSelection,
  removeCodesAction,
  selectClassAction,
  selectIsSelectionEmpty,
  selectRetentionNotice,
  selectSelectedClassIndex,
  selectSelectedCodes,
  setRetentionNotice,
  toggleMunicipalityAction,
  toggleRegionAction,
} from "./selection-slice.js";

function loadRealTerritory() {
  const munJson = JSON.parse(fs.readFileSync("data/municipalities.json", "utf8"));
  const regJson = JSON.parse(fs.readFileSync("data/regions.json", "utf8"));
  return createTerritory({
    municipalities: parseMunicipalities(munJson),
    regions: regJson.regions,
  });
}

test("SEL-01 toggling municipality adds it when absent and removes when present", () => {
  const initial = createSelectionState();
  assert.equal(selectIsSelectionEmpty(initial), true);

  const state1 = reduceSelection(initial, toggleMunicipalityAction("3550308"));
  assert.deepEqual(selectSelectedCodes(state1), ["3550308"]);
  assert.equal(selectIsSelectionEmpty(state1), false);

  const state2 = reduceSelection(state1, toggleMunicipalityAction("3550308"));
  assert.deepEqual(selectSelectedCodes(state2), []);
  assert.equal(selectIsSelectionEmpty(state2), true);
});

test("SEL-01 toggling region adds all region codes and removing takes them away", () => {
  const territory = loadRealTerritory();
  const initial = createSelectionState();
  const santosCodes = territory.municipalitiesInRegion("3").map((m) => m.code);
  assert.ok(santosCodes.length > 0);

  const withSantos = reduceSelection(initial, toggleRegionAction("3", territory));
  assert.equal(selectSelectedCodes(withSantos).length, santosCodes.length);

  const withoutSantos = reduceSelection(withSantos, toggleRegionAction("3", territory));
  assert.equal(selectSelectedCodes(withoutSantos).length, 0);
});

test("SEL-01 addRegionAction adds all codes of a region to existing selection", () => {
  const territory = loadRealTerritory();
  const initial = reduceSelection(createSelectionState(), toggleMunicipalityAction("3550308"));
  const withRegion = reduceSelection(initial, addRegionAction("2", territory));
  const codes = selectSelectedCodes(withRegion);
  assert.ok(codes.includes("3550308"));
  assert.ok(codes.length > 1);
});

test("SEL-02 search finds entries loosely ignoring case and accents, including regions", () => {
  const territory = loadRealTerritory();
  const entries = buildSearchEntries(territory);

  const suggestions = findSuggestions(entries, "sao jose dos campos");
  assert.ok(suggestions.length > 0);
  assert.equal(suggestions[0].label, "São José dos Campos");

  const regionSuggestions = findSuggestions(entries, "campinas");
  const foundRegion = regionSuggestions.find((s) => s.kind === "region");
  assert.ok(foundRegion !== undefined);
});

test("SEL-03 selectClassAction replaces selection with the codes of that class", () => {
  const initial = createSelectionState();
  const classMap = new Map([
    ["3550308", 6],
    ["3509502", 6],
    ["3500105", 2],
  ]);
  const state = reduceSelection(initial, selectClassAction(6, classMap));
  assert.deepEqual(selectSelectedCodes(state), ["3550308", "3509502"]);
  assert.equal(selectSelectedClassIndex(state), 6);
});

test("SEL-04 retention notice formats 'Seleção mantida: N municípios' and clears on next change", () => {
  const initial = createSelectionState();
  const notice = formatRetentionNotice(5);
  assert.equal(notice, "Seleção mantida: 5 municípios");

  const withNotice = reduceSelection(initial, setRetentionNotice(notice));
  assert.equal(selectRetentionNotice(withNotice), "Seleção mantida: 5 municípios");

  const cleared = reduceSelection(withNotice, clearRetentionNotice());
  assert.equal(selectRetentionNotice(cleared), null);

  const withNoticeAgain = reduceSelection(initial, setRetentionNotice(notice));
  const changed = reduceSelection(withNoticeAgain, toggleMunicipalityAction("3550308"));
  assert.equal(selectRetentionNotice(changed), null);
});

const TINY_TOPOLOGY_URL = new URL("../../domain/fixtures/tiny.topo.json", import.meta.url);
const TINY_FIRST_CODE = "3500001";
const TINY_SECOND_CODE = "3500002";
const TINY_THIRD_CODE = "3500003";
const POINTED_ONLY = { pointed: true, selected: false };
const POINTED_AND_SELECTED = { pointed: true, selected: true };

async function buildTinyMotion() {
  const topology = JSON.parse(await readFile(TINY_TOPOLOGY_URL, "utf8"));
  const { municipalities, plate } = buildMunicipalities(topology);
  return { municipalities, motion: createMapMotion(plate, municipalities) };
}

/**
 * @param {import("../../engine/frame-loop.js").MapMotion} motion
 * @param {Array<{ code: string }>} municipalities
 * @param {{ pointed: string | null, selected: string[] }} units
 * @param {{ pointed: boolean, selected: boolean }} isLiftEnabled
 */
function liftUnits(motion, municipalities, units, isLiftEnabled) {
  const indexByCode = buildIndexByCode(municipalities);
  const raised = readRaisedUnitIndexes(indexByCode, units);
  retargetLifts(motion, { ...raised, isLiftEnabled });
  return Array.from(motion.liftTargets);
}

function buildRootStore() {
  const municipalities = [
    { code: "3550308", name: "São Paulo", regionCode: "1", population: 11451999 },
    { code: "3509502", name: "Campinas", regionCode: "6", population: 1139047 },
  ];
  const scale = {
    toColorPositions: (/** @type {Float64Array} */ values) => Uint8Array.from(values, () => 0),
    toHeightTargets: (/** @type {Float64Array} */ values) => Float32Array.from(values),
  };
  const selectors = createRootSelectors(scale);
  const state = createInitialState(/** @type {any} */ ({ municipalities, regions: [] }));
  return { selectors, state };
}

test("SEL-05 selecting keeps the height target and the lift target at zero", async () => {
  const { selectors, state } = buildRootStore();
  const heightsBefore = selectors.selectHeightTargets(state);
  const selected = reduceRootState(state, toggleMunicipalityAction("3550308"));

  assert.equal(selectors.selectHeightTargets(selected), heightsBefore);

  const { motion, municipalities } = await buildTinyMotion();
  const targets = liftUnits(
    motion,
    municipalities,
    { pointed: null, selected: [TINY_FIRST_CODE, TINY_SECOND_CODE] },
    POINTED_ONLY,
  );
  assert.deepEqual(targets, [0, 0, 0]);
  assert.equal(motion.movingLifts.size, 0);
});

test("SEL-05 with height as data only the pointed unit rises, up to 7000", async () => {
  const { motion, municipalities } = await buildTinyMotion();

  const targets = liftUnits(
    motion,
    municipalities,
    { pointed: TINY_SECOND_CODE, selected: [TINY_FIRST_CODE] },
    POINTED_ONLY,
  );

  assert.equal(RAISE_LIFT, 7000);
  assert.deepEqual(targets, [0, 7000, 0]);
});

test("SEL-05 with flat height both selection and hover raise", async () => {
  assert.equal(computeTargetHeight(500, 10, 1000, { heightMode: "flat" }), 1);
  const { motion, municipalities } = await buildTinyMotion();

  const targets = liftUnits(
    motion,
    municipalities,
    { pointed: TINY_SECOND_CODE, selected: [TINY_THIRD_CODE] },
    POINTED_AND_SELECTED,
  );

  assert.deepEqual(targets, [0, 7000, 7000]);
});

test("SEL-05 with reduced motion nothing rises, in either height mode", async () => {
  const { motion, municipalities } = await buildTinyMotion();
  motion.isMotionReduced = true;

  const targets = liftUnits(
    motion,
    municipalities,
    { pointed: TINY_SECOND_CODE, selected: [TINY_THIRD_CODE] },
    POINTED_AND_SELECTED,
  );

  assert.deepEqual(targets, [0, 0, 0]);
});

test("SEL-09 pointing at a panel row raises that unit and leaving drops it", async () => {
  const { selectors, state } = buildRootStore();
  const pointedState = reduceRootState(state, changePointedUnit("3509502"));
  const leftState = reduceRootState(pointedState, changePointedUnit(null));

  assert.deepEqual(selectors.selectRaised(pointedState).pointed, "3509502");
  assert.equal(selectors.selectRaised(leftState).pointed, null);

  const { motion, municipalities } = await buildTinyMotion();
  const raisedTargets = liftUnits(
    motion,
    municipalities,
    { pointed: TINY_SECOND_CODE, selected: [] },
    POINTED_ONLY,
  );
  assert.deepEqual(raisedTargets, [0, 7000, 0]);

  const droppedTargets = liftUnits(
    motion,
    municipalities,
    { pointed: null, selected: [] },
    POINTED_ONLY,
  );
  assert.deepEqual(droppedTargets, [0, 0, 0]);
});

test("SEL-06 fully selected region is collapsed into one row in buildPanelUnits", () => {
  const territory = loadRealTerritory();
  const registroCodes = territory.municipalitiesInRegion("2").map((m) => m.code);
  const units = buildPanelUnits(registroCodes, territory);
  assert.equal(units.length, 1);
  assert.equal(units[0].kind, "region");
  assert.equal(units[0].code, "2");
  assert.equal(units[0].name, "RA Registro");
});

test("SEL-06 removeCodesAction removes specific codes from selection", () => {
  const initial = reduceSelection(createSelectionState(), toggleMunicipalityAction("3550308"));
  const afterRemove = reduceSelection(initial, removeCodesAction(["3550308"]));
  assert.deepEqual(selectSelectedCodes(afterRemove), []);
});

test("SEL-07 panel summary line matches domain aggregation and reference values", () => {
  const munJson = JSON.parse(fs.readFileSync("data/municipalities.json", "utf8"));
  const refJson = JSON.parse(fs.readFileSync("src/domain/fixtures/region-reference.json", "utf8"));
  const municipalities = parseMunicipalities(munJson);

  const rmSpRef = refJson.regions.find((/** @type {any} */ r) => r.code === "1");
  const rmSpMunicipalities = municipalities.filter(
    (/** @type {any} */ m) => String(m.regionCode) === "1",
  );

  const pop = aggregateIndicator(INDICATORS.population, rmSpMunicipalities);
  assert.equal(pop.value, rmSpRef.population);
  assert.equal(pop.label, "Total");

  const density = aggregateIndicator(INDICATORS.density, rmSpMunicipalities);
  assert.ok(density.value !== null);
  assert.ok(Math.abs(density.value - rmSpRef.density) / rmSpRef.density <= 1e-9);
  assert.equal(density.label, "Densidade demográfica do conjunto");
});

test("SEL-08 ranking lists the top 12 units in descending value order when empty", () => {
  const munJson = JSON.parse(fs.readFileSync("data/municipalities.json", "utf8"));
  const regJson = JSON.parse(fs.readFileSync("data/regions.json", "utf8"));
  const municipalities = parseMunicipalities(munJson);
  const territory = createTerritory({
    municipalities,
    regions: regJson.regions,
  });

  const top12Mun = buildRankingUnits(
    INDICATORS.population,
    "municipality",
    territory,
    municipalities,
  );
  assert.equal(top12Mun.length, 12);
  assert.equal(top12Mun[0].name, "São Paulo");
  for (let i = 1; i < top12Mun.length; i += 1) {
    assert.ok(top12Mun[i - 1].value >= top12Mun[i].value);
  }

  const top12Reg = buildRankingUnits(
    INDICATORS.population,
    "region",
    territory,
    municipalities,
  );
  assert.equal(top12Reg.length, 12);
  assert.equal(top12Reg[0].name, "RM São Paulo");
});

test("SEL-10 clear button is disabled with empty selection and enabled otherwise", () => {
  const empty = createSelectionState();
  assert.equal(buildClearViewModel(empty).isDisabled, true);

  const withCode = reduceSelection(empty, toggleMunicipalityAction("3550308"));
  assert.equal(buildClearViewModel(withCode).isDisabled, false);

  const cleared = reduceSelection(withCode, clearSelectionAction());
  assert.equal(buildClearViewModel(cleared).isDisabled, true);
});
