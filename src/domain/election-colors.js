/**
 * Pure electoral color domain: sRGB <-> OKLab/OKLCH conversions, perceptual distance
 * (Delta E OKLab), three distinct neutrals per theme (ELE-07), party color table with
 * lightness and chroma parity between leaders (ELE-09, E25), deterministic hue shift
 * on collision, and up to 8 categorical candidate colors per office (TUR-05).
 *
 * @typedef {"light" | "dark"} ThemeMode
 * @typedef {{ L: number, a: number, b: number }} OklabColor
 * @typedef {{ L: number, C: number, h: number }} OklchColor
 * @typedef {{ r: number, g: number, b: number }} RgbColor
 * @typedef {{ noResult: string, tie: string, others: string }} ElectionNeutrals
 * @typedef {{
 *   ballotNumber: number | string,
 *   party?: string,
 *   name?: string,
 *   votes?: number,
 *   validVotes?: number,
 *   stateVotes?: number,
 *   ledMunicipalities?: number,
 *   municipalitiesLed?: number
 * }} CandidateColorInput
 * @typedef {{
 *   ballotNumber: string,
 *   numericBallot: number,
 *   party: string,
 *   name: string,
 *   votes: number,
 *   ledMunicipalities: number,
 *   color: string,
 *   isOthers: boolean,
 *   hueShifted: boolean,
 *   rank: number
 * }} CandidateColorAssignment
 * @typedef {{
 *   theme: ThemeMode,
 *   neutrals: ElectionNeutrals,
 *   coloredCandidates: CandidateColorAssignment[],
 *   othersCandidates: CandidateColorAssignment[],
 *   orderedCandidates: CandidateColorAssignment[],
 *   byBallotNumber: Map<string, CandidateColorAssignment>,
 *   colorByBallotNumber: Record<string, string>,
 *   othersVotes: number,
 *   totalVotes: number,
 *   othersFraction: number,
 *   othersSharePct: number
 * }} AssignedCandidatePalette
 */

export const MAX_CANDIDATE_COLORS = 8;
export const MIN_OKLAB_DELTA_E = 0.08;
export const MAX_LEADER_DELTA_L = 0.05;
export const MAX_LEADER_DELTA_C = 0.03;
export const MIN_HUE_SEPARATION_DEG = 25;

const TARGET_CHROMA = 0.12;
const TARGET_LIGHTNESS_BY_THEME = {
  light: 0.6,
  dark: 0.68,
};

/**
 * Three distinct neutrals per theme (ELE-07).
 * "noResult" reuses the "--heat-plate" ("Sem dado") token from the base palette.
 * All three maintain Delta E OKLab >= 0.08 among themselves and against every candidate color.
 *
 * @type {Record<ThemeMode, ElectionNeutrals>}
 */
export const ELECTION_NEUTRALS = {
  light: {
    noResult: "#bec2cc",
    others: "#8f949e",
    tie: "#535761",
  },
  dark: {
    noResult: "#33353c",
    others: "#525661",
    tie: "#858a96",
  },
};

/**
 * Base OKLCH hue angles (in degrees) by normalized party acronym.
 * Chosen so party families match editorial expectations while staying outside
 * low-gamut cyan regions.
 *
 * @type {Record<string, number>}
 */
export const PARTY_BASE_HUES = {
  PT: 25,
  PL: 258,
  REPUBLICANOS: 232,
  PP: 244,
  PSB: 62,
  REDE: 162,
  MDB: 142,
  PSD: 292,
  PSDB: 250,
  UNIAO: 238,
  PSOL: 348,
  NOVO: 48,
  PDT: 36,
  PODE: 152,
  PODEMOS: 152,
  AVANTE: 54,
  SOLIDARIEDADE: 44,
  CIDADANIA: 328,
  PCDOB: 18,
  PV: 132,
  PRD: 268,
  MOBILIZA: 312,
  DC: 280,
  PRTB: 120,
  PMB: 336,
  AGIR: 274,
  UP: 12,
  PCB: 15,
  PSTU: 20,
  PCO: 22,
  MISSAO: 75,
};

const HUE_SHIFT_OFFSETS = [
  0, 45, -45, 90, -90, 135, -135, 180, 30, -30, 60, -60, 105, -105, 150, -150, 75, -75, 120, -120,
  165, -165,
];

/**
 * Fixed table of party hex colors for "light" and "dark" themes (ELE-09).
 *
 * @type {Record<ThemeMode, Record<string, string>>}
 */
export const PARTY_COLOR_TABLE = {
  light: buildThemePartyTable("light"),
  dark: buildThemePartyTable("dark"),
};

/**
 * Returns the three neutral hex colors for the requested theme (ELE-07).
 *
 * @param {ThemeMode} [theme]
 * @returns {ElectionNeutrals}
 */
export function getElectionNeutrals(theme = "dark") {
  const resolvedTheme = normalizeTheme(theme);
  return ELECTION_NEUTRALS[resolvedTheme];
}

/**
 * Returns the base party color for a given party acronym and theme (ELE-09).
 *
 * @param {string | undefined | null} party
 * @param {ThemeMode} [theme]
 * @returns {string}
 */
export function getPartyColor(party, theme = "dark") {
  const resolvedTheme = normalizeTheme(theme);
  const key = normalizePartyKey(party);
  const table = PARTY_COLOR_TABLE[resolvedTheme];
  if (table[key]) {
    return table[key];
  }
  const fallbackHue = computeDeterministicPartyHue(key);
  return synthesizeCandidateHex(
    TARGET_LIGHTNESS_BY_THEME[resolvedTheme],
    TARGET_CHROMA,
    fallbackHue,
  );
}

/**
 * Rotates a candidate or party color hue deterministically in OKLCH while keeping
 * lightness L and chroma C within parity bounds (ELE-09, E25).
 *
 * @param {string} baseColorOrParty hex color or party acronym
 * @param {number} [stepIndex] collision step index (1, 2, ...)
 * @param {ThemeMode} [theme]
 * @returns {string}
 */
export function shiftCandidateHue(baseColorOrParty, stepIndex = 1, theme = "dark") {
  const resolvedTheme = normalizeTheme(theme);
  const baseHex = resolveBaseHex(baseColorOrParty, resolvedTheme);
  const baseLch = oklch(baseHex);
  const offset = readHueShiftOffset(stepIndex);
  const shiftedHue = normalizeHueDegrees(baseLch.h + offset);
  return synthesizeCandidateHex(
    TARGET_LIGHTNESS_BY_THEME[resolvedTheme],
    TARGET_CHROMA,
    shiftedHue,
  );
}

/**
 * Assigns up to 8 distinct categorical colors to candidates and maps the remaining
 * candidates to the "others" neutral (TUR-05, ELE-09, E25, ELE-11).
 *
 * @param {CandidateColorInput[]} candidates
 * @param {ThemeMode} [theme]
 * @param {{ unlistedOthersVotes?: number }} [options]
 * @returns {AssignedCandidatePalette}
 */
export function assignCandidateColors(candidates, theme = "dark", options = {}) {
  const resolvedTheme = normalizeTheme(theme);
  const neutrals = getElectionNeutrals(resolvedTheme);
  const neutralLabs = [oklab(neutrals.noResult), oklab(neutrals.tie), oklab(neutrals.others)];

  const normalized = candidates.map((c) => normalizeCandidateInput(c));
  const hasMunicipalityLeaders = normalized.some((c) => c.ledMunicipalities > 0);
  const ranked = [...normalized].sort((a, b) =>
    compareCandidatesForColorPriority(a, b, hasMunicipalityLeaders),
  );

  /** @type {CandidateColorAssignment[]} */
  const coloredCandidates = [];
  /** @type {CandidateColorAssignment[]} */
  const othersCandidates = [];
  /** @type {OklabColor[]} */
  const assignedLabs = [];
  /** @type {OklchColor[]} */
  const assignedLchs = [];

  for (let i = 0; i < ranked.length; i += 1) {
    const item = ranked[i];
    const eligibleForColor = isCandidateEligibleForColor(
      item,
      coloredCandidates.length,
      hasMunicipalityLeaders,
    );
    if (!eligibleForColor) {
      othersCandidates.push({
        ...item,
        color: neutrals.others,
        isOthers: true,
        hueShifted: false,
        rank: i + 1,
      });
      continue;
    }

    const baseHue = resolvePartyBaseHue(item.party, item.numericBallot);
    const resolved = pickNonCollidingColor(
      baseHue,
      resolvedTheme,
      assignedLabs,
      assignedLchs,
      neutralLabs,
    );

    assignedLabs.push(oklab(resolved.color));
    assignedLchs.push(oklch(resolved.color));
    coloredCandidates.push({
      ...item,
      color: resolved.color,
      isOthers: false,
      hueShifted: resolved.hueShifted,
      rank: i + 1,
    });
  }

  const allAssigned = [...coloredCandidates, ...othersCandidates];
  const orderedCandidates = [...allAssigned].sort((a, b) =>
    compareByBallotAsc(a.numericBallot, a.ballotNumber, b.numericBallot, b.ballotNumber),
  );

  /** @type {Map<string, CandidateColorAssignment>} */
  const byBallotNumber = new Map();
  /** @type {Record<string, string>} */
  const colorByBallotNumber = {};
  for (const entry of orderedCandidates) {
    byBallotNumber.set(entry.ballotNumber, entry);
    colorByBallotNumber[entry.ballotNumber] = entry.color;
  }

  const extraOthersVotes = Math.max(0, options.unlistedOthersVotes ?? 0);
  let listedVotesSum = 0;
  for (const entry of allAssigned) {
    listedVotesSum += entry.votes;
  }
  let assignedOthersVotes = extraOthersVotes;
  for (const entry of othersCandidates) {
    assignedOthersVotes += entry.votes;
  }
  const totalVotes = listedVotesSum + extraOthersVotes;
  const othersFraction = computeSafeRatio(assignedOthersVotes, totalVotes);

  return {
    theme: resolvedTheme,
    neutrals,
    coloredCandidates,
    othersCandidates,
    orderedCandidates,
    byBallotNumber,
    colorByBallotNumber,
    othersVotes: assignedOthersVotes,
    totalVotes,
    othersFraction,
    othersSharePct: othersFraction * 100,
  };
}

/**
 * Calculates Euclidean distance in OKLab color space between two colors (hex or OklabColor).
 *
 * @param {string | OklabColor} colorA
 * @param {string | OklabColor} colorB
 * @returns {number}
 */
export function deltaEOklab(colorA, colorB) {
  const lab1 = toOklabColor(colorA);
  const lab2 = toOklabColor(colorB);
  const dl = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * Converts a hex string into OKLab coordinates.
 *
 * @param {string} hex
 * @returns {OklabColor}
 */
export function oklab(hex) {
  const rgb = parseHexToRgb(hex);
  return rgbToOklab(rgb.r, rgb.g, rgb.b);
}

/**
 * Converts a hex string or OklabColor into cylindrical OKLCH coordinates.
 *
 * @param {string | OklabColor} color
 * @returns {OklchColor}
 */
export function oklch(color) {
  const lab = toOklabColor(color);
  return oklabToOklch(lab);
}

/**
 * Converts standard sRGB values [0..1] to OKLab coordinates.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {OklabColor}
 */
export function rgbToOklab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/**
 * Converts OKLab coordinates to clamped sRGB values [0..1].
 *
 * @param {number} L
 * @param {number} a
 * @param {number} b
 * @returns {RgbColor}
 */
export function oklabToRgb(L, a, b) {
  const linear = oklabToLinearRgb(L, a, b);
  return {
    r: clampUnit(linearToSrgb(clampUnit(linear.r))),
    g: clampUnit(linearToSrgb(clampUnit(linear.g))),
    b: clampUnit(linearToSrgb(clampUnit(linear.b))),
  };
}

/**
 * Converts OKLab coordinates to OKLCH (h in [0, 360) degrees).
 *
 * @param {OklabColor} lab
 * @returns {OklchColor}
 */
export function oklabToOklch(lab) {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  if (C < 1e-7) {
    return { L: lab.L, C: 0, h: 0 };
  }
  const degrees = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return {
    L: lab.L,
    C,
    h: normalizeHueDegrees(degrees),
  };
}

/**
 * Converts OKLCH coordinates (h in degrees) to OKLab.
 *
 * @param {number} L
 * @param {number} C
 * @param {number} h
 * @returns {OklabColor}
 */
export function oklchToOklab(L, C, h) {
  const radians = (normalizeHueDegrees(h) * Math.PI) / 180;
  return {
    L,
    a: C * Math.cos(radians),
    b: C * Math.sin(radians),
  };
}

/**
 * Shortest angular distance in degrees [0..180] between two hue angles.
 *
 * @param {number} h1
 * @param {number} h2
 * @returns {number}
 */
export function hueDistanceDegrees(h1, h2) {
  const diff = Math.abs(normalizeHueDegrees(h1) - normalizeHueDegrees(h2)) % 360;
  if (diff > 180) {
    return 360 - diff;
  }
  return diff;
}

/**
 * Parses a #rgb or #rrggbb hex string into normalized [0..1] sRGB channels.
 *
 * @param {string} hex
 * @returns {RgbColor}
 */
export function parseHexToRgb(hex) {
  const cleanHex = hex.trim().replace("#", "");
  if (cleanHex.length === 3) {
    return {
      r: Number.parseInt(cleanHex[0] + cleanHex[0], 16) / 255,
      g: Number.parseInt(cleanHex[1] + cleanHex[1], 16) / 255,
      b: Number.parseInt(cleanHex[2] + cleanHex[2], 16) / 255,
    };
  }
  if (cleanHex.length === 6) {
    return {
      r: Number.parseInt(cleanHex.slice(0, 2), 16) / 255,
      g: Number.parseInt(cleanHex.slice(2, 4), 16) / 255,
      b: Number.parseInt(cleanHex.slice(4, 6), 16) / 255,
    };
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

/**
 * Formats normalized [0..1] sRGB channels into a lowercase #rrggbb string.
 *
 * @param {RgbColor} rgb
 * @returns {string}
 */
export function formatRgbToHex(rgb) {
  const r = toHexByte(rgb.r);
  const g = toHexByte(rgb.g);
  const b = toHexByte(rgb.b);
  return `#${r}${g}${b}`;
}

/**
 * @param {ThemeMode} theme
 * @returns {Record<string, string>}
 */
function buildThemePartyTable(theme) {
  const targetL = TARGET_LIGHTNESS_BY_THEME[theme];
  /** @type {Record<string, string>} */
  const table = {};
  for (const [party, hue] of Object.entries(PARTY_BASE_HUES)) {
    table[party] = synthesizeCandidateHex(targetL, TARGET_CHROMA, hue);
  }
  return table;
}

/**
 * Synthesizes an in-gamut hex color at the requested OKLCH coordinates, adjusting
 * chroma slightly inside [0.108, targetC] if needed so sRGB clamping never distorts L.
 *
 * @param {number} targetL
 * @param {number} targetC
 * @param {number} hueDegrees
 * @returns {string}
 */
function synthesizeCandidateHex(targetL, targetC, hueDegrees) {
  let chroma = targetC;
  while (chroma >= 0.105) {
    const lab = oklchToOklab(targetL, chroma, hueDegrees);
    const linear = oklabToLinearRgb(lab.L, lab.a, lab.b);
    if (isLinearRgbInGamut(linear)) {
      return formatRgbToHex({
        r: linearToSrgb(linear.r),
        g: linearToSrgb(linear.g),
        b: linearToSrgb(linear.b),
      });
    }
    chroma -= 0.002;
  }
  const fallbackLab = oklchToOklab(targetL, 0.108, hueDegrees);
  return formatRgbToHex(oklabToRgb(fallbackLab.L, fallbackLab.a, fallbackLab.b));
}

/**
 * @param {number} baseHue
 * @param {ThemeMode} theme
 * @param {OklabColor[]} assignedLabs
 * @param {OklchColor[]} assignedLchs
 * @param {OklabColor[]} neutralLabs
 * @returns {{ color: string, hueShifted: boolean }}
 */
function pickNonCollidingColor(baseHue, theme, assignedLabs, assignedLchs, neutralLabs) {
  const targetL = TARGET_LIGHTNESS_BY_THEME[theme];
  for (let i = 0; i < HUE_SHIFT_OFFSETS.length; i += 1) {
    const offset = HUE_SHIFT_OFFSETS[i];
    const candidateHue = normalizeHueDegrees(baseHue + offset);
    const hex = synthesizeCandidateHex(targetL, TARGET_CHROMA, candidateHue);
    const lab = oklab(hex);
    const lch = oklabToOklch(lab);
    if (isValidCandidateColor(lab, lch, assignedLabs, assignedLchs, neutralLabs)) {
      return { color: hex, hueShifted: offset !== 0 };
    }
  }

  for (let step = 0; step < 72; step += 1) {
    const candidateHue = normalizeHueDegrees(baseHue + step * 5);
    const hex = synthesizeCandidateHex(targetL, TARGET_CHROMA, candidateHue);
    const lab = oklab(hex);
    if (isFarEnoughFromAll(lab, assignedLabs, neutralLabs)) {
      return { color: hex, hueShifted: step !== 0 };
    }
  }

  const fallbackHex = synthesizeCandidateHex(targetL, TARGET_CHROMA, baseHue);
  return { color: fallbackHex, hueShifted: false };
}

/**
 * @param {OklabColor} lab
 * @param {OklchColor} lch
 * @param {OklabColor[]} assignedLabs
 * @param {OklchColor[]} assignedLchs
 * @param {OklabColor[]} neutralLabs
 * @returns {boolean}
 */
function isValidCandidateColor(lab, lch, assignedLabs, assignedLchs, neutralLabs) {
  if (!isFarEnoughFromAll(lab, assignedLabs, neutralLabs)) {
    return false;
  }
  for (let i = 0; i < assignedLchs.length; i += 1) {
    const prevLch = assignedLchs[i];
    if (hueDistanceDegrees(lch.h, prevLch.h) < MIN_HUE_SEPARATION_DEG) {
      return false;
    }
    if (Math.abs(lch.L - prevLch.L) > MAX_LEADER_DELTA_L) {
      return false;
    }
    if (Math.abs(lch.C - prevLch.C) > MAX_LEADER_DELTA_C) {
      return false;
    }
  }
  return true;
}

/**
 * @param {OklabColor} lab
 * @param {OklabColor[]} assignedLabs
 * @param {OklabColor[]} neutralLabs
 * @returns {boolean}
 */
function isFarEnoughFromAll(lab, assignedLabs, neutralLabs) {
  for (const nLab of neutralLabs) {
    if (deltaEOklab(lab, nLab) < MIN_OKLAB_DELTA_E) {
      return false;
    }
  }
  for (const aLab of assignedLabs) {
    if (deltaEOklab(lab, aLab) < MIN_OKLAB_DELTA_E) {
      return false;
    }
  }
  return true;
}

/**
 * @param {{ ledMunicipalities: number }} candidate
 * @param {number} currentColoredCount
 * @param {boolean} hasMunicipalityLeaders
 * @returns {boolean}
 */
function isCandidateEligibleForColor(candidate, currentColoredCount, hasMunicipalityLeaders) {
  if (currentColoredCount >= MAX_CANDIDATE_COLORS) {
    return false;
  }
  if (hasMunicipalityLeaders && candidate.ledMunicipalities <= 0) {
    return false;
  }
  return true;
}

/**
 * @param {CandidateColorInput} input
 */
function normalizeCandidateInput(input) {
  const rawBallot = String(input.ballotNumber ?? "").trim();
  const parsedBallot = Number.parseInt(rawBallot, 10);
  let numericBallot = Number.MAX_SAFE_INTEGER;
  if (Number.isFinite(parsedBallot)) {
    numericBallot = parsedBallot;
  }
  const votes = Math.max(0, input.votes ?? input.validVotes ?? input.stateVotes ?? 0);
  const ledMunicipalities = Math.max(
    0,
    input.ledMunicipalities ?? input.municipalitiesLed ?? 0,
  );
  return {
    ballotNumber: rawBallot,
    numericBallot,
    party: normalizePartyKey(input.party),
    name: String(input.name ?? rawBallot),
    votes,
    ledMunicipalities,
  };
}

/**
 * Ranks candidates by municipalities led (when available), then by state votes descending,
 * breaking ties by ascending ballot number (TUR-05, E25, E34).
 *
 * @param {ReturnType<typeof normalizeCandidateInput>} a
 * @param {ReturnType<typeof normalizeCandidateInput>} b
 * @param {boolean} hasMunicipalityLeaders
 * @returns {number}
 */
function compareCandidatesForColorPriority(a, b, hasMunicipalityLeaders) {
  if (hasMunicipalityLeaders && b.ledMunicipalities !== a.ledMunicipalities) {
    return b.ledMunicipalities - a.ledMunicipalities;
  }
  if (b.votes !== a.votes) {
    return b.votes - a.votes;
  }
  return compareByBallotAsc(a.numericBallot, a.ballotNumber, b.numericBallot, b.ballotNumber);
}

/**
 * @param {number} numA
 * @param {string} strA
 * @param {number} numB
 * @param {string} strB
 * @returns {number}
 */
function compareByBallotAsc(numA, strA, numB, strB) {
  if (numA !== numB) {
    return numA - numB;
  }
  return strA.localeCompare(strB);
}

/**
 * @param {string} partyKey
 * @param {number} numericBallot
 * @returns {number}
 */
function resolvePartyBaseHue(partyKey, numericBallot) {
  const knownHue = PARTY_BASE_HUES[partyKey];
  if (knownHue !== undefined) {
    return knownHue;
  }
  if (partyKey.length > 0) {
    return computeDeterministicPartyHue(partyKey);
  }
  return normalizeHueDegrees(numericBallot * 47);
}

/**
 * @param {string} partyKey
 * @returns {number}
 */
function computeDeterministicPartyHue(partyKey) {
  let hash = 2166136261;
  for (let i = 0; i < partyKey.length; i += 1) {
    hash ^= partyKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return normalizeHueDegrees(Math.abs(hash) % 360);
}

/**
 * @param {string | undefined | null} party
 * @returns {string}
 */
function normalizePartyKey(party) {
  if (!party) {
    return "";
  }
  return party
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/**
 * @param {string | undefined} theme
 * @returns {ThemeMode}
 */
function normalizeTheme(theme) {
  if (theme === "light") {
    return "light";
  }
  return "dark";
}

/**
 * @param {string} baseColorOrParty
 * @param {ThemeMode} theme
 * @returns {string}
 */
function resolveBaseHex(baseColorOrParty, theme) {
  if (baseColorOrParty.trim().startsWith("#")) {
    return baseColorOrParty.trim();
  }
  return getPartyColor(baseColorOrParty, theme);
}

/**
 * @param {number} stepIndex
 * @returns {number}
 */
function readHueShiftOffset(stepIndex) {
  const normalizedStep = Math.max(1, Math.trunc(Math.abs(stepIndex)));
  if (normalizedStep < HUE_SHIFT_OFFSETS.length) {
    return HUE_SHIFT_OFFSETS[normalizedStep];
  }
  return normalizedStep * 45;
}

/**
 * @param {string | OklabColor} input
 * @returns {OklabColor}
 */
function toOklabColor(input) {
  if (typeof input === "string") {
    return oklab(input);
  }
  return input;
}

/**
 * @param {number} L
 * @param {number} a
 * @param {number} b
 * @returns {RgbColor}
 */
function oklabToLinearRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/**
 * @param {RgbColor} linear
 * @returns {boolean}
 */
function isLinearRgbInGamut(linear) {
  if (linear.r < 0 || linear.r > 1) {
    return false;
  }
  if (linear.g < 0 || linear.g > 1) {
    return false;
  }
  if (linear.b < 0 || linear.b > 1) {
    return false;
  }
  return true;
}

/**
 * @param {number} c
 * @returns {number}
 */
function srgbToLinear(c) {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {number} linear
 * @returns {number}
 */
function linearToSrgb(linear) {
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  return 1.055 * linear ** (1 / 2.4) - 0.055;
}

/**
 * @param {number} value
 * @returns {number}
 */
function clampUnit(value) {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

/**
 * @param {number} channel
 * @returns {string}
 */
function toHexByte(channel) {
  const byte = Math.round(clampUnit(channel) * 255);
  return byte.toString(16).padStart(2, "0");
}

/**
 * @param {number} degrees
 * @returns {number}
 */
function normalizeHueDegrees(degrees) {
  const mod = degrees % 360;
  if (mod < 0) {
    return mod + 360;
  }
  return mod;
}

/**
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number}
 */
function computeSafeRatio(numerator, denominator) {
  if (denominator <= 0 || numerator <= 0) {
    return 0;
  }
  return numerator / denominator;
}
