/**
 * Lightweight mock DOM environment for Node.js native test runner.
 * Provides element hierarchy, query selectors, event handling, attributes,
 * class lists, datasets, and history/location mocks.
 */

export class MockElement {
  /**
   * @param {string} tagName
   * @param {MockDocument} documentRef
   */
  constructor(tagName, documentRef) {
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.ownerDocument = documentRef;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this._textContent = "";
    this._innerHTML = "";
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.type = "";
    this.value = "";
    this.checked = false;
    this.name = "";
    this.tabIndex = 0;
    this.clientWidth = 1280;
    this.scrollWidth = 1280;
  }

  get id() {
    return this.getAttribute("id") || "";
  }

  set id(value) {
    if (value) {
      this.setAttribute("id", value);
    } else {
      this.removeAttribute("id");
    }
  }

  get className() {
    return this.getAttribute("class") || "";
  }

  set className(value) {
    if (value) {
      this.setAttribute("class", value);
    } else {
      this.removeAttribute("class");
    }
  }

  get textContent() {
    if (this.children.length === 0) {
      return this._textContent;
    }
    return this.children.map((c) => c.textContent).join("");
  }

  set textContent(text) {
    this.children = [];
    this._textContent = String(text ?? "");
    this._innerHTML = escapeHtml(this._textContent);
  }

  get innerHTML() {
    if (this._innerHTML) {
      return this._innerHTML;
    }
    return this.children.map((c) => c.outerHTML).join("");
  }

  set innerHTML(html) {
    this.children = [];
    this._innerHTML = String(html ?? "");
    if (html === "") {
      this._textContent = "";
    }
  }

  get outerHTML() {
    const attrs = [];
    for (const [k, v] of this.attributes.entries()) {
      attrs.push(`${k}="${escapeHtml(v)}"`);
    }
    const attrStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
    return `<${this.tagName.toLowerCase()}${attrStr}>${this.innerHTML}</${this.tagName.toLowerCase()}>`;
  }

  get classList() {
    const self = this;
    return {
      add(...classes) {
        const current = new Set(self.className.split(/\s+/).filter(Boolean));
        for (const c of classes) {
          current.add(c);
        }
        self.className = Array.from(current).join(" ");
      },
      remove(...classes) {
        const current = new Set(self.className.split(/\s+/).filter(Boolean));
        for (const c of classes) {
          current.delete(c);
        }
        self.className = Array.from(current).join(" ");
      },
      contains(cls) {
        const current = new Set(self.className.split(/\s+/).filter(Boolean));
        return current.has(cls);
      },
      toggle(cls, force) {
        const current = new Set(self.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force !== undefined ? Boolean(force) : !current.has(cls);
        if (shouldAdd) {
          current.add(cls);
        } else {
          current.delete(cls);
        }
        self.className = Array.from(current).join(" ");
        return shouldAdd;
      },
    };
  }

  setAttribute(name, value) {
    const val = String(value);
    this.attributes.set(name, val);
    if (name === "type") {
      this.type = val;
    }
    if (name === "value") {
      this.value = val;
    }
    if (name === "name") {
      this.name = val;
    }
    if (name.startsWith("data-")) {
      const dataKey = name.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      this.dataset[dataKey] = val;
    }
    if (name === "id") {
      this.ownerDocument._elementsById.set(val, this);
    }
  }

  getAttribute(name) {
    if (this.attributes.has(name)) {
      return this.attributes.get(name);
    }
    if (name === "type" && this.type) {
      return this.type;
    }
    if (name === "value" && this.value) {
      return this.value;
    }
    if (name === "name" && this.name) {
      return this.name;
    }
    return null;
  }

  hasAttribute(name) {
    return this.attributes.has(name) || (name === "type" && Boolean(this.type));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "type") {
      this.type = "";
    }
    if (name.startsWith("data-")) {
      const dataKey = name.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      delete this.dataset[dataKey];
    }
  }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === "string") {
        const textNode = new MockElement("#text", this.ownerDocument);
        textNode._textContent = node;
        this.children.push(textNode);
      } else if (node instanceof MockElement) {
        node.parentNode = this;
        this.children.push(node);
        if (node.id) {
          this.ownerDocument._elementsById.set(node.id, node);
        }
      }
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const list = this.listeners.get(type);
    if (list) {
      const idx = list.indexOf(listener);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    }
  }

  dispatchEvent(event) {
    event.target = this;
    const list = this.listeners.get(event.type) || [];
    for (const listener of list) {
      listener.call(this, event);
    }
    if (this.parentNode && event.bubbles) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    if (this.type === "radio") {
      this.checked = true;
      if (this.name && this.ownerDocument) {
        const radios = this.ownerDocument.querySelectorAll(
          `input[type="radio"][name="${this.name}"]`,
        );
        for (const radio of radios) {
          if (radio !== this) {
            radio.checked = false;
          }
        }
      }
    }
    const event = {
      type: "click",
      target: this,
      bubbles: true,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    this.dispatchEvent(event);
    if (this.type === "radio" || this.type === "checkbox") {
      const changeEvent = {
        type: "change",
        target: this,
        bubbles: true,
      };
      this.dispatchEvent(changeEvent);
    }
  }

  focus() {
    this.ownerDocument.activeElement = this;
    this.dispatchEvent({ type: "focus", target: this, bubbles: false });
  }

  blur() {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
    this.dispatchEvent({ type: "blur", target: this, bubbles: false });
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const matchFn = createMatcher(selector);
    function traverse(el) {
      for (const child of el.children) {
        if (child.tagName !== "#TEXT" && matchFn(child)) {
          results.push(child);
        }
        traverse(child);
      }
    }
    traverse(this);
    return results;
  }
}

export class MockDocument {
  constructor() {
    this.documentElement = new MockElement("HTML", this);
    this.head = new MockElement("HEAD", this);
    this.body = new MockElement("BODY", this);
    this.documentElement.append(this.head, this.body);
    this.activeElement = null;
    this._elementsById = new Map();
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }

  getElementById(id) {
    if (this._elementsById.has(id)) {
      return this._elementsById.get(id);
    }
    return this.querySelector(`#${id}`);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }
}

export function createMockWindow(initialUrl = "http://localhost:4173/") {
  const documentRef = new MockDocument();
  let currentUrl = new URL(initialUrl);
  const popstateListeners = [];

  const windowRef = {
    document: documentRef,
    location: {
      get href() {
        return currentUrl.href;
      },
      set href(val) {
        currentUrl = new URL(val, currentUrl.href);
      },
      get pathname() {
        return currentUrl.pathname;
      },
      get search() {
        return currentUrl.search;
      },
      get hash() {
        return currentUrl.hash;
      },
    },
    history: {
      length: 1,
      replaceState(_state, _title, url) {
        currentUrl = new URL(url, currentUrl.href);
      },
      pushState(_state, _title, url) {
        currentUrl = new URL(url, currentUrl.href);
        this.length += 1;
      },
    },
    matchMedia(query) {
      const isDark = query.includes("dark");
      return {
        matches: !isDark,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      };
    },
    addEventListener(type, listener) {
      if (type === "popstate") {
        popstateListeners.push(listener);
      }
    },
    removeEventListener(type, listener) {
      if (type === "popstate") {
        const idx = popstateListeners.indexOf(listener);
        if (idx !== -1) {
          popstateListeners.splice(idx, 1);
        }
      }
    },
    dispatchPopstate(state = null) {
      const event = { type: "popstate", state };
      for (const l of popstateListeners) {
        l(event);
      }
    },
  };

  return { windowRef, documentRef };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createMatcher(selector) {
  const trimmed = selector.trim();
  if (trimmed.startsWith("#")) {
    const id = trimmed.slice(1);
    return (el) => el.id === id;
  }
  if (trimmed.startsWith(".")) {
    const cls = trimmed.slice(1);
    return (el) => el.classList.contains(cls);
  }
  if (trimmed.includes("[") && trimmed.includes("]")) {
    const tag = trimmed.slice(0, trimmed.indexOf("[")).toUpperCase();
    const attrMatch = trimmed.match(/\[([a-zA-Z0-9_-]+)(?:=([^\]]+))?\]/);
    if (attrMatch) {
      const attrName = attrMatch[1];
      let attrVal = attrMatch[2];
      if (attrVal !== undefined) {
        attrVal = attrVal.trim().replace(/^['"]|['"]$/g, "");
      }
      return (el) => {
        if (tag && el.tagName !== tag) return false;
        if (attrVal === undefined) return el.hasAttribute(attrName);
        return el.getAttribute(attrName) === attrVal;
      };
    }
  }
  const tagUpper = trimmed.toUpperCase();
  return (el) => el.tagName === tagUpper;
}
