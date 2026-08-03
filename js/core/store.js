import { DATA_FILE, DEPARTMENTS, EDIT_HASH, GITHUB_REPO, GITHUB_BRANCH } from "../config.js";

const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (error) { /* local storage is optional */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (error) { /* local storage is optional */ }
  }
};

function readArray(key) {
  try {
    const value = JSON.parse(storage.get(key, "[]"));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isProcedure(value) {
  return value && typeof value === "object" && typeof value.id === "string" && typeof value.title === "string";
}

function safeData(value) {
  const data = value && typeof value === "object" ? value : {};
  return Object.assign({}, data, {
    procedures: Array.isArray(data.procedures) ? data.procedures.filter(isProcedure) : [],
    log: Array.isArray(data.log) ? data.log.filter(function (entry) { return entry && typeof entry === "object"; }) : []
  });
}

function today() {
  const date = new Date();
  return String(date.getMonth() + 1).padStart(2, "0") + "/" + String(date.getDate()).padStart(2, "0") + "/" + date.getFullYear();
}

const listeners = new Set();
let toastTimeout = 0;

export const state = {
  status: "loading",
  error: null,
  data: { procedures: [], log: [] },
  view: { name: "dashboard" },
  lastBrowseView: { name: "dashboard" },
  query: "",
  expanded: new Set(),
  favoriteIds: new Set(readArray("sc-favs")),
  recentIds: readArray("sc-recents").slice(0, 8),
  theme: storage.get("sc-theme", ""),
  editMode: storage.get("sc-edithash", "") === EDIT_HASH,
  sidebarCompact: storage.get("sc-sidebar-compact", "false") === "true",
  mobileNavOpen: false,
  palette: { open: false, query: "", selectionStart: 0, selectionEnd: 0 },
  modal: null,
  teleprompter: null,
  toast: null
};

export function subscribe(listener) {
  listeners.add(listener);
  return function () { listeners.delete(listener); };
}

export function notify() {
  listeners.forEach(function (listener) { listener(state); });
}

export function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  storage.set("sc-theme", theme);
  notify();
}

export function initialize() {
  if (!state.theme) {
    state.theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = state.theme;
}

export async function loadData() {
  state.status = "loading";
  state.error = null;
  notify();
  try {
    const response = await fetch(DATA_FILE + "?ts=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    state.data = safeData(await response.json());
    state.favoriteIds = new Set(Array.from(state.favoriteIds).filter(function (id) { return Boolean(findProcedure(id)); }));
    storage.set("sc-favs", JSON.stringify(Array.from(state.favoriteIds)));
    state.recentIds = state.recentIds.filter(function (id) { return Boolean(findProcedure(id)); });
    storage.set("sc-recents", JSON.stringify(state.recentIds));
    state.status = "ready";
  } catch (error) {
    state.status = "error";
    state.error = error;
  }
  notify();
}

export function departmentFor(id) {
  return DEPARTMENTS.find(function (department) { return department.id === id; }) || {
    id: id || "other",
    name: id || "Nieprzypisany dział",
    group: "other",
    short: "?"
  };
}

export function departmentsWithCounts() {
  const counts = {};
  state.data.procedures.forEach(function (procedure) {
    counts[procedure.dept] = (counts[procedure.dept] || 0) + 1;
  });
  const known = DEPARTMENTS.map(function (department) {
    return Object.assign({}, department, { count: counts[department.id] || 0 });
  });
  const extra = Object.keys(counts).filter(function (id) {
    return !DEPARTMENTS.some(function (department) { return department.id === id; });
  }).map(function (id) {
    return Object.assign({}, departmentFor(id), { count: counts[id] });
  });
  return known.concat(extra);
}

export function findProcedure(id) {
  return state.data.procedures.find(function (procedure) { return procedure.id === id; }) || null;
}

export function favoriteProcedures() {
  return state.data.procedures.filter(function (procedure) { return state.favoriteIds.has(procedure.id); });
}

export function recentProcedures() {
  return state.recentIds.map(findProcedure).filter(Boolean);
}

export function isFavorite(id) {
  return state.favoriteIds.has(id);
}

export function toggleFavorite(id) {
  if (state.favoriteIds.has(id)) state.favoriteIds.delete(id);
  else state.favoriteIds.add(id);
  storage.set("sc-favs", JSON.stringify(Array.from(state.favoriteIds)));
  notify();
}

export function recordRecent(id) {
  state.recentIds = [id].concat(state.recentIds.filter(function (item) { return item !== id; })).slice(0, 8);
  storage.set("sc-recents", JSON.stringify(state.recentIds));
}

export function navigate(view) {
  state.view = view;
  if (view.name !== "search") state.lastBrowseView = view;
  state.query = "";
  state.expanded.clear();
  state.mobileNavOpen = false;
  notify();
}

export function openProcedure(id) {
  const procedure = findProcedure(id);
  if (!procedure) return;
  recordRecent(id);
  if (state.view.name !== "procedure") state.lastBrowseView = state.view;
  state.view = { name: "procedure", id: id };
  state.query = "";
  state.mobileNavOpen = false;
  notify();
}

export function setSearch(query) {
  state.query = query;
  if (query.trim()) {
    if (state.view.name !== "search") state.lastBrowseView = state.view;
    state.view = { name: "search" };
  } else if (state.view.name === "search") {
    state.view = state.lastBrowseView;
  }
  notify();
}

export function searchProcedures(query) {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return state.data.procedures.map(function (procedure) {
    const department = departmentFor(procedure.dept);
    const title = normalize(procedure.title);
    const body = normalize([procedure.exec, procedure.notes, department.name].concat(procedure.steps || []).join(" "));
    let score = 0;
    tokens.forEach(function (token) {
      if (title.startsWith(token)) score += 80;
      else if (title.includes(token)) score += 45;
      if (body.includes(token)) score += 12;
    });
    return { procedure: procedure, score: score };
  }).filter(function (item) { return item.score > 0; }).sort(function (a, b) {
    return b.score - a.score || a.procedure.title.localeCompare(b.procedure.title, "pl");
  }).map(function (item) { return item.procedure; });
}

export function toggleExpanded(id) {
  if (state.expanded.has(id)) state.expanded.delete(id);
  else state.expanded.add(id);
  notify();
}

export function setSidebarCompact(compact) {
  state.sidebarCompact = compact;
  storage.set("sc-sidebar-compact", String(compact));
  notify();
}

export function setMobileNav(open) {
  state.mobileNavOpen = open;
  notify();
}

export function setPalette(open, query = "", selectionStart, selectionEnd) {
  const fallbackPosition = String(query).length;
  state.palette = {
    open: open,
    query: query,
    selectionStart: Number.isInteger(selectionStart) ? selectionStart : fallbackPosition,
    selectionEnd: Number.isInteger(selectionEnd) ? selectionEnd : fallbackPosition
  };
  notify();
}

export function setModal(modal) {
  state.modal = modal;
  notify();
}

export function setTeleprompter(value) {
  state.teleprompter = value;
  notify();
}

export function showToast(message, type = "info") {
  state.toast = { message: message, type: type };
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(function () {
    state.toast = null;
    notify();
  }, 3600);
  notify();
}

export function addOrUpdateProcedure(fields, id) {
  const clean = {
    title: String(fields.title || "").trim(),
    dept: String(fields.dept || "").trim(),
    exec: String(fields.exec || "").trim(),
    steps: String(fields.steps || "").split("\n").map(function (step) {
      return step.replace(/^\s*\d+[.)]\s*/, "").trim();
    }).filter(Boolean),
    notes: String(fields.notes || "").trim()
  };
  if (!clean.title) throw new Error("Podaj nazwę procedury.");
  if (!clean.dept) throw new Error("Wybierz dział zarządzający.");
  if (id) {
    const existing = findProcedure(id);
    if (!existing) throw new Error("Nie znaleziono procedury do edycji.");
    Object.assign(existing, clean);
    addLog("mod", "Zmieniono procedurę „" + clean.title + "” w " + departmentFor(clean.dept).name);
    return existing;
  }
  const created = Object.assign({ id: "u-" + Date.now() }, clean);
  state.data.procedures.push(created);
  addLog("add", "Dodano procedurę „" + clean.title + "” w " + departmentFor(clean.dept).name);
  return created;
}

export function removeProcedure(id) {
  const procedure = findProcedure(id);
  if (!procedure) return false;
  state.data.procedures = state.data.procedures.filter(function (item) { return item.id !== id; });
  state.favoriteIds.delete(id);
  state.recentIds = state.recentIds.filter(function (item) { return item !== id; });
  storage.set("sc-favs", JSON.stringify(Array.from(state.favoriteIds)));
  storage.set("sc-recents", JSON.stringify(state.recentIds));
  addLog("del", "Usunięto procedurę „" + procedure.title + "” w " + departmentFor(procedure.dept).name);
  return true;
}

export function addLog(type, text) {
  state.data.log.unshift({ date: today(), type: type, text: text });
}

export async function unlock(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest)).map(function (value) {
    return value.toString(16).padStart(2, "0");
  }).join("");
  if (hash !== EDIT_HASH) return false;
  state.editMode = true;
  storage.set("sc-edithash", EDIT_HASH);
  notify();
  return true;
}

export function lock() {
  state.editMode = false;
  storage.remove("sc-edithash");
  notify();
}

export function serializedData() {
  return JSON.stringify(state.data, null, 2);
}

export function githubEditUrl() {
  if (!GITHUB_REPO) return "";
  return "https://github.com/" + GITHUB_REPO + "/edit/" + GITHUB_BRANCH + "/procedury.json";
}

export function procedureText(procedure) {
  const department = departmentFor(procedure.dept);
  const sections = [
    procedure.title,
    "Dział zarządzający: " + department.name,
    "Działy wykonujące: " + (procedure.exec || "—")
  ];
  if (procedure.steps && procedure.steps.length) {
    sections.push("", "Procedura:", procedure.steps.map(function (step, index) { return String(index + 1) + ". " + step; }).join("\n"));
  }
  if (procedure.notes) sections.push("", "Uwagi i przepisy:", procedure.notes);
  return sections.join("\n");
}
