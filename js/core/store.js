import { DEPARTMENTS } from "../config.js";
import {
  isFirebaseConfigured,
  signInAdministrator,
  signOutAdministrator,
  subscribeToAdministratorSession
} from "../firebase.js";
import {
  createFirestoreBackup,
  createProcedureInFirestore,
  deleteProcedureInFirestore,
  importLegacyProceduresFromJson,
  importProceduresToFirestore,
  listFirestoreBackups,
  readRegistry,
  restoreFirestoreBackup,
  searchProceduresInFirestore,
  subscribeToRegistry,
  updateProcedureInFirestore
} from "../data/firestore-repository.js";
import { normalizeSearchText, procedureSearchText, searchTerms } from "../data/search-index.js";

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

function logMoment() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date()).reduce(function (result, part) {
    result[part.type] = part.value;
    return result;
  }, {});
  return {
    date: parts.year + "-" + parts.month + "-" + parts.day,
    time: parts.hour + ":" + parts.minute + ":" + parts.second
  };
}

function procedureLog(type, procedure) {
  return Object.assign({
    type: type,
    procedureId: procedure.id,
    procedureTitle: procedure.title
  }, logMoment());
}

const listeners = new Set();
let toastTimeout = 0;
let unsubscribeFirestore = null;
let unsubscribeAdministratorSession = null;
let searchTimeout = 0;
let searchRequestId = 0;
const searchCache = new Map();

export const state = {
  status: "loading",
  error: null,
  data: { procedures: [], log: [] },
  view: { name: "dashboard" },
  lastBrowseView: { name: "dashboard" },
  query: "",
  search: { normalizedQuery: "", status: "idle", results: [] },
  expanded: new Set(),
  favoriteIds: new Set(readArray("sc-favs")),
  recentIds: readArray("sc-recents").slice(0, 8),
  theme: storage.get("sc-theme", ""),
  editMode: false,
  admin: { status: "signed-out", user: null },
  backups: { status: "idle", items: [] },
  migration: { status: "idle", result: null },
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

function applyData(data) {
  state.data = safeData(data);
  searchCache.clear();
  state.favoriteIds = new Set(Array.from(state.favoriteIds).filter(function (id) { return Boolean(findProcedure(id)); }));
  storage.set("sc-favs", JSON.stringify(Array.from(state.favoriteIds)));
  state.recentIds = state.recentIds.filter(function (id) { return Boolean(findProcedure(id)); });
  storage.set("sc-recents", JSON.stringify(state.recentIds));
}

function handleFirestoreError(error) {
  state.status = "error";
  state.error = error;
  notify();
}

function applyAdministratorSession(session) {
  state.admin = session
    ? { status: session.canEdit ? "ready" : "viewer", user: session }
    : { status: "signed-out", user: null };
  state.editMode = Boolean(session && session.canEdit);
  notify();
}

function handleAdministratorError(error) {
  state.admin = { status: "error", user: null, error: error };
  state.editMode = false;
  notify();
}

async function observeAdministratorSession() {
  if (unsubscribeAdministratorSession) return;
  state.admin = { status: "checking", user: null };
  unsubscribeAdministratorSession = await subscribeToAdministratorSession(
    applyAdministratorSession,
    handleAdministratorError
  );
}

export async function loadData() {
  state.status = "loading";
  state.error = null;
  notify();
  if (unsubscribeFirestore) {
    unsubscribeFirestore();
    unsubscribeFirestore = null;
  }
  try {
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase nie jest skonfigurowany. Uzupełnij FIREBASE_CONFIG w js/config.js.");
    }
    await observeAdministratorSession();
    applyData(await readRegistry());
    unsubscribeFirestore = await subscribeToRegistry(function (data) {
      applyData(data);
      state.status = "ready";
      notify();
    }, handleFirestoreError);
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
  requestProcedureSearch(query);
  notify();
}

function rankProcedures(procedures, tokens) {
  return procedures.map(function (procedure) {
    const title = normalizeSearchText(procedure.title);
    const body = normalizeSearchText(procedureSearchText(procedure));
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

function requestProcedureSearch(query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  const tokens = searchTerms(normalizedQuery);
  const requestId = ++searchRequestId;
  clearTimeout(searchTimeout);

  if (!tokens.length) {
    state.search = { normalizedQuery: "", status: "idle", results: [] };
    return;
  }

  const cached = searchCache.get(normalizedQuery);
  if (cached) {
    state.search = { normalizedQuery: normalizedQuery, status: "ready", results: cached };
    return;
  }

  state.search = { normalizedQuery: normalizedQuery, status: "loading", results: [] };
  searchTimeout = window.setTimeout(async function () {
    try {
      const candidates = await searchProceduresInFirestore(normalizedQuery);
      if (requestId !== searchRequestId) return;
      const results = rankProcedures(candidates, tokens);
      searchCache.set(normalizedQuery, results);
      state.search = { normalizedQuery: normalizedQuery, status: "ready", results: results };
    } catch (error) {
      if (requestId !== searchRequestId) return;
      state.search = { normalizedQuery: normalizedQuery, status: "error", results: [] };
    }
    notify();
  }, 140);
}

export function searchProcedures(query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  return state.search.normalizedQuery === normalizedQuery ? state.search.results : [];
}

export function isSearchingProcedures(query) {
  return state.search.normalizedQuery === normalizeSearchText(query).trim() && state.search.status === "loading";
}

export function canDeleteProcedures() {
  return Boolean(state.admin.user && state.admin.user.canDelete);
}

function assertAdminAccess() {
  if (!canDeleteProcedures()) throw new Error("Ta operacja jest dostępna tylko dla roli admin.");
}

function portableProcedure(procedure) {
  return {
    id: procedure.id,
    title: procedure.title,
    dept: procedure.dept,
    exec: procedure.exec || "",
    steps: Array.isArray(procedure.steps) ? procedure.steps : [],
    notes: procedure.notes || "",
    sortOrder: Number(procedure.sortOrder || 0)
  };
}

export function exportProceduresAsJson() {
  return {
    format: "state-capitol-procedures",
    version: 1,
    exportedAt: new Date().toISOString(),
    procedures: state.data.procedures.map(portableProcedure)
  };
}

export async function importProceduresFromJson(payload) {
  assertAdminAccess();
  return importProceduresToFirestore(payload);
}

export async function migrateLegacyProcedures() {
  assertAdminAccess();
  if (state.migration.status === "running") throw new Error("Migracja procedury.json już trwa.");
  state.migration = { status: "running", result: null };
  notify();
  try {
    const result = await importLegacyProceduresFromJson();
    state.migration = { status: "ready", result: result };
    return result;
  } catch (error) {
    state.migration = { status: "error", result: null };
    throw error;
  } finally {
    notify();
  }
}

export async function refreshBackups() {
  assertAdminAccess();
  state.backups = { status: "loading", items: state.backups.items };
  notify();
  try {
    const items = await listFirestoreBackups();
    state.backups = { status: "ready", items: items };
    return items;
  } catch (error) {
    state.backups = { status: "error", items: [] };
    throw error;
  } finally {
    notify();
  }
}

export async function createBackup() {
  assertAdminAccess();
  if (state.backups.status === "creating") throw new Error("Tworzenie kopii zapasowej już trwa.");
  state.backups = { status: "creating", items: state.backups.items };
  notify();
  try {
    const backup = await createFirestoreBackup();
    await refreshBackups();
    return backup;
  } finally {
    if (state.backups.status === "creating") {
      state.backups = { status: "idle", items: state.backups.items };
      notify();
    }
  }
}

export async function restoreBackup(backupId) {
  assertAdminAccess();
  const result = await restoreFirestoreBackup(backupId);
  await refreshBackups();
  return result;
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
  requestProcedureSearch(query);
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

export async function addOrUpdateProcedure(fields, id) {
  if (!state.editMode) throw new Error("Rola viewer nie może dodawać ani edytować procedur.");
  const rawSteps = Array.isArray(fields.steps) ? fields.steps : String(fields.steps || "").split("\n");
  const clean = {
    title: String(fields.title || "").trim(),
    dept: String(fields.dept || "").trim(),
    exec: String(fields.exec || "").trim(),
    steps: rawSteps.map(function (step) {
      return step.replace(/^\s*\d+[.)]\s*/, "").trim();
    }).filter(Boolean),
    notes: String(fields.notes || "").trim()
  };
  if (!clean.title) throw new Error("Podaj nazwę procedury.");
  if (!clean.dept) throw new Error("Wybierz dział zarządzający.");
  if (id) {
    const existing = findProcedure(id);
    if (!existing) throw new Error("Nie znaleziono procedury do edycji.");
    const updated = Object.assign({}, existing, clean);
    await updateProcedureInFirestore(id, clean, procedureLog("update", updated));
    return updated;
  }
  const created = Object.assign({ id: "u-" + Date.now() }, clean);
  await createProcedureInFirestore(created, procedureLog("create", created));
  return created;
}

export async function removeProcedure(id) {
  if (!canDeleteProcedures()) throw new Error("Usuwanie procedur jest dostępne tylko dla roli admin.");
  const procedure = findProcedure(id);
  if (!procedure) return false;
  await deleteProcedureInFirestore(id, procedureLog("delete", procedure));
  state.data.procedures = state.data.procedures.filter(function (item) { return item.id !== id; });
  state.favoriteIds.delete(id);
  state.recentIds = state.recentIds.filter(function (item) { return item !== id; });
  storage.set("sc-favs", JSON.stringify(Array.from(state.favoriteIds)));
  storage.set("sc-recents", JSON.stringify(state.recentIds));
  return true;
}

export async function unlock(email, password) {
  const session = await signInAdministrator(email, password);
  if (!session || !session.canEdit) {
    await signOutAdministrator();
    throw new Error("To konto ma rolę viewer i nie może edytować procedur.");
  }
  applyAdministratorSession(session);
  return true;
}

export async function lock() {
  try {
    await signOutAdministrator();
  } finally {
    applyAdministratorSession(null);
  }
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
