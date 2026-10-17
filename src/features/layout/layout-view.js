/**
 * Mounts the sidebar collapse toggle button and wires accessibility attributes.
 * Follows LAY-05.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} sidebarElement
 * @param {(expanded: boolean) => void} [onToggle]
 * @returns {{
 *   element: HTMLButtonElement,
 *   isExpanded: () => boolean,
 *   toggle: () => boolean
 * }}
 */
export function mountLayoutToggle(documentRef, sidebarElement, onToggle = undefined) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "collapse-toggle";
  button.id = "sidebar-toggle";
  button.setAttribute("aria-expanded", "true");
  button.setAttribute("aria-label", "Recolher barra lateral");
  button.setAttribute("aria-controls", "sidebar");
  button.textContent = "◀";

  function isExpanded() {
    return button.getAttribute("aria-expanded") === "true";
  }

  function toggle() {
    const currentlyExpanded = isExpanded();
    const nextExpanded = !currentlyExpanded;

    if (nextExpanded) {
      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-label", "Recolher barra lateral");
      button.textContent = "◀";
      sidebarElement.classList.remove("collapsed");
    }
    if (!nextExpanded) {
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Expandir barra lateral");
      button.textContent = "▶";
      sidebarElement.classList.add("collapsed");
    }

    if (onToggle) {
      onToggle(nextExpanded);
    }

    return nextExpanded;
  }

  button.addEventListener("click", () => {
    toggle();
  });

  return {
    element: button,
    isExpanded,
    toggle,
  };
}
