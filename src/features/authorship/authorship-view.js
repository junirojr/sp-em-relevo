/**
 * Authorship view creates the footer with attribution and repository link.
 * Follows AUT-01, AUT-02, AUT-03 and AUT-04.
 *
 * @param {Document} documentRef
 * @returns {{ element: HTMLElement }}
 */
export function mountAuthorshipView(documentRef) {
  let footer = documentRef.getElementById("app-footer");
  if (!footer) {
    footer = documentRef.createElement("footer");
    footer.id = "app-footer";
    footer.className = "app-footer";

    const authorLink = documentRef.createElement("a");
    authorLink.href = "https://github.com/junirojr";
    authorLink.target = "_blank";
    authorLink.rel = "noopener";
    authorLink.textContent = "Feito por Manoel Osmi";

    const separator = documentRef.createElement("span");
    separator.className = "footer-separator";
    separator.textContent = " | ";

    const codeLink = documentRef.createElement("a");
    codeLink.href = "https://github.com/junirojr/sp-em-relevo";
    codeLink.target = "_blank";
    codeLink.rel = "noopener";
    codeLink.textContent = "Código";

    footer.append(authorLink, separator, codeLink);
  }

  return { element: footer };
}
