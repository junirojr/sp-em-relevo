/**
 * Theme switch in the top bar: Claro or Escuro for this visit only. The pick lives in the
 * `data-theme` attribute of the root element and nowhere else, so a reload follows the system
 * again. Follows LAY-08.
 */

export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";

const THEME_OPTIONS = [
  { theme: THEME_LIGHT, label: "Claro", glyph: "☀" },
  { theme: THEME_DARK, label: "Escuro", glyph: "☾" },
];

/**
 * Pure rule: the theme in effect is the one picked in this visit, else the system one.
 *
 * @param {string | undefined} pickedTheme
 * @param {boolean} prefersDark
 * @returns {"light" | "dark"}
 */
export function resolveTheme(pickedTheme, prefersDark) {
  if (pickedTheme === THEME_LIGHT) {
    return THEME_LIGHT;
  }
  if (pickedTheme === THEME_DARK) {
    return THEME_DARK;
  }
  if (prefersDark) {
    return THEME_DARK;
  }
  return THEME_LIGHT;
}

/**
 * @param {Document} documentRef
 * @param {{ prefersDark: () => boolean, onChange: () => void }} options
 * @returns {{ element: HTMLDivElement, refresh: () => void }}
 */
export function mountThemeToggle(documentRef, { prefersDark, onChange }) {
  const root = documentRef.documentElement;
  const group = documentRef.createElement("div");
  group.className = "theme-toggle";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Tema");

  const buttons = THEME_OPTIONS.map((option) => {
    const button = buildThemeButton(documentRef, option);
    button.addEventListener("click", () => {
      root.dataset.theme = option.theme;
      refresh();
      onChange();
    });
    return button;
  });
  group.append(...buttons);

  function refresh() {
    const activeTheme = resolveTheme(root.dataset.theme, prefersDark());
    for (const button of buttons) {
      const isActive = button.dataset.theme === activeTheme;
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  refresh();
  return { element: group, refresh };
}

/**
 * @param {Document} documentRef
 * @param {{ theme: string, label: string, glyph: string }} option
 * @returns {HTMLButtonElement}
 */
function buildThemeButton(documentRef, option) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "theme-toggle-button";
  button.dataset.theme = option.theme;
  button.setAttribute("aria-label", option.label);

  const glyph = documentRef.createElement("span");
  glyph.className = "theme-toggle-glyph";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = option.glyph;

  const label = documentRef.createElement("span");
  label.textContent = option.label;

  button.append(glyph, label);
  return button;
}
