/**
 * Mobile bottom navigation bar view component (matching mobile Stitch UI).
 *
 * Provides a fixed 5-tab bar at the bottom of the viewport on narrow screens:
 * 1. [Mapa 3D] - Minimizes the sheet, focusing on the 3D relief canvas
 * 2. [Indicadores / Eleições] - Opens mode selector & indicator/election office lists
 * 3. [Municípios] - Opens search bar, filter tags, and city ranking list
 * 4. [Comparativo] - Opens paired comparison view
 * 5. [Camadas] - Opens territorial level (Ver por) and map colors/settings
 *
 * @typedef {"mapa" | "indicadores" | "municipios" | "comparativo" | "camadas"} MobileNavTab
 *
 * @typedef {{
 *   activeTab?: MobileNavTab,
 *   isElection?: boolean,
 *   onTabSelect?: (tab: MobileNavTab) => void
 * }} BottomNavOptions
 */

export const NAV_TAB_MAP = "mapa";
export const NAV_TAB_INDICATORS = "indicadores";
export const NAV_TAB_MUNICIPALITIES = "municipios";
export const NAV_TAB_COMPARE = "comparativo";
export const NAV_TAB_LAYERS = "camadas";

const ICONS = {
  mapa: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>',
  indicadores: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
  eleicoes: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>',
  municipios: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>',
  comparativo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>',
  camadas: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
};

/**
 * Mounts the mobile bottom navigation bar into container.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} container
 * @param {BottomNavOptions} [options={}]
 * @returns {{
 *   element: HTMLElement,
 *   setActiveTab: (tab: MobileNavTab) => void,
 *   setElectionMode: (isElection: boolean) => void,
 *   destroy: () => void
 * }}
 */
export function mountBottomNavView(documentRef, container, options = {}) {
  let activeTab = options.activeTab ?? NAV_TAB_MAP;
  let isElection = options.isElection ?? false;
  const onTabSelect = options.onTabSelect;

  container.innerHTML = "";
  container.className = "mobile-bottom-nav";

  let indicatorLabel = "Indicadores";
  let indicatorIcon = "indicadores";
  if (isElection) {
    indicatorLabel = "Eleições";
    indicatorIcon = "eleicoes";
  }

  const tabsConfig = [
    { id: NAV_TAB_MAP, label: "Mapa 3D", iconKey: "mapa" },
    {
      id: NAV_TAB_INDICATORS,
      label: indicatorLabel,
      iconKey: indicatorIcon,
    },
    { id: NAV_TAB_MUNICIPALITIES, label: "Municípios", iconKey: "municipios" },
    { id: NAV_TAB_COMPARE, label: "Comparativo", iconKey: "comparativo" },
    { id: NAV_TAB_LAYERS, label: "Camadas", iconKey: "camadas" },
  ];

  const buttonMap = new Map();

  function renderTabs() {
    container.innerHTML = "";
    buttonMap.clear();

    for (let i = 0; i < tabsConfig.length; i += 1) {
      const tab = tabsConfig[i];
      const btn = documentRef.createElement("button");
      btn.type = "button";
      btn.className = "bottom-nav-item";
      btn.setAttribute("data-nav-tab", tab.id);
      btn.setAttribute("aria-label", tab.label);

      if (tab.id === activeTab) {
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
      }
      if (tab.id !== activeTab) {
        btn.setAttribute("aria-selected", "false");
      }

      const iconSpan = documentRef.createElement("span");
      iconSpan.className = "bottom-nav-icon";
      const iconMarkup = ICONS[tab.iconKey] ?? ICONS.mapa;
      iconSpan.innerHTML = iconMarkup;

      const labelSpan = documentRef.createElement("span");
      labelSpan.className = "bottom-nav-label";
      labelSpan.textContent = tab.label;

      btn.append(iconSpan, labelSpan);

      btn.addEventListener("click", () => {
        setActiveTab(tab.id);
        if (typeof onTabSelect === "function") {
          onTabSelect(tab.id);
        }
      });

      container.append(btn);
      buttonMap.set(tab.id, btn);
    }
  }

  function setActiveTab(nextTab) {
    activeTab = nextTab;
    for (const [id, btn] of buttonMap.entries()) {
      if (id === activeTab) {
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
      }
      if (id !== activeTab) {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
      }
    }
  }

  function setElectionMode(isElec) {
    if (isElection === isElec) {
      return;
    }
    isElection = isElec;
    const tabDef = tabsConfig.find((t) => t.id === NAV_TAB_INDICATORS);
    if (tabDef) {
      if (isElection) {
        tabDef.label = "Eleições";
        tabDef.iconKey = "eleicoes";
      }
      if (!isElection) {
        tabDef.label = "Indicadores";
        tabDef.iconKey = "indicadores";
      }
    }
    renderTabs();
  }

  renderTabs();

  return {
    element: container,
    setActiveTab,
    setElectionMode,
    destroy() {
      container.innerHTML = "";
    },
  };
}
