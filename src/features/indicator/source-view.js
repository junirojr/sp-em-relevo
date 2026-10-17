import { DEFAULT_INDICATOR_ID, findIndicator } from "../../domain/indicator.js";

/**
 * @typedef {import("../../domain/indicator.js").IndicatorDefinition} IndicatorDefinition
 */

/**
 * Mounts the indicator metadata / source banner (indicator, unit, year and source).
 * Follows IND-03, IND-05 and IND-06.
 *
 * @param {Document} documentRef
 * @param {IndicatorDefinition} [initialIndicator]
 * @returns {{
 *   element: HTMLElement,
 *   update: (indicator: IndicatorDefinition | string) => void,
 *   getTitleElement: () => HTMLElement,
 *   getUnitElement: () => HTMLElement,
 *   getYearElement: () => HTMLElement,
 *   getSourceElement: () => HTMLElement,
 *   getSourceLink: () => HTMLAnchorElement | null
 * }}
 */
export function mountSourceView(
  documentRef,
  initialIndicator = findIndicator(DEFAULT_INDICATOR_ID),
) {
  const container = documentRef.createElement("div");
  container.className = "indicator-source-view";
  container.id = "indicator-source-view";

  const title = documentRef.createElement("h2");
  title.className = "source-view-title";

  const meta = documentRef.createElement("div");
  meta.className = "source-view-meta";

  const unit = documentRef.createElement("span");
  unit.className = "source-view-unit";

  const separator1 = documentRef.createElement("span");
  separator1.className = "source-view-separator";
  separator1.textContent = " | ";

  const year = documentRef.createElement("span");
  year.className = "source-view-year";

  const separator2 = documentRef.createElement("span");
  separator2.className = "source-view-separator";
  separator2.textContent = " | ";

  const source = documentRef.createElement("span");
  source.className = "source-view-source";

  const sourceLink = documentRef.createElement("a");
  sourceLink.className = "source-view-link";
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener";
  source.append(sourceLink);

  meta.append(unit, separator1, year, separator2, source);
  container.append(title, meta);

  /**
   * @param {IndicatorDefinition | string} indicator
   */
  function render(indicator) {
    const def = resolveDefinition(indicator);
    title.textContent = def.label;
    unit.textContent = def.unit;
    year.textContent = def.yearDescription || def.year;
    sourceLink.textContent = def.source;
    sourceLink.href = def.sourceUrl;
  }

  /**
   * @param {IndicatorDefinition | string} indicator
   * @returns {IndicatorDefinition}
   */
  function resolveDefinition(indicator) {
    if (typeof indicator === "string") {
      return findIndicator(indicator);
    }
    if (indicator && typeof indicator === "object") {
      return indicator;
    }
    return findIndicator(DEFAULT_INDICATOR_ID);
  }

  render(initialIndicator);

  return {
    element: container,
    update: render,
    getTitleElement: () => title,
    getUnitElement: () => unit,
    getYearElement: () => year,
    getSourceElement: () => source,
    getSourceLink: () => sourceLink,
  };
}
