export const TABLE_OPEN = "table/open";
export const TABLE_CLOSE = "table/close";

export const openTable = () => ({ type: TABLE_OPEN });
export const closeTable = () => ({ type: TABLE_CLOSE });
export const createTableState = () => ({ isOpen: false });

export function reduceTable(state = createTableState(), action = {}) {
  if (action.type === TABLE_OPEN) return { isOpen: true };
  if (action.type === TABLE_CLOSE) return { isOpen: false };
  return state;
}

export function mountTableFeature(doc = document, opts = {}) {
  const link = doc.getElementById("open-table-link");
  if (!link) return null;
  let view = null;
  const onOpen = (e) => {
    e.preventDefault();
    if (view) {
      view.open();
      return;
    }
    import("./table-view.js").then((m) => {
      view = m.mountTableView(doc, opts);
      view.open();
    });
  };
  link.addEventListener("click", onOpen);
  return () => {
    link.removeEventListener("click", onOpen);
    if (view) view.destroy();
  };
}
