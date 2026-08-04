import { DEPARTMENTS, DEPARTMENT_NOTE, ORGANIZATION } from "./config.js";
import {
  addOrUpdateProcedure, applyTheme, canDeleteProcedures, createBackup, departmentsWithCounts, exportProceduresAsJson,
  favoriteProcedures, findProcedure, importProceduresFromJson, initialize, isFavorite, isSearchingProcedures, loadData,
  lock, migrateLegacyProcedures, navigate, notify, openProcedure, procedureText, recentProcedures, refreshBackups, removeProcedure,
  restoreBackup, searchProcedures, setMobileNav, setModal, setPalette, setSearch, setSidebarCompact,
  setTeleprompter, showToast, state, subscribe, toggleExpanded, toggleFavorite, unlock
} from "./core/store.js";
import { icon } from "./ui/icons.js";
import {
  button, departmentTag, emptyState, escapeHtml, iconButton, procedureCard, procedureDetail
} from "./ui/templates.js";

const app = document.getElementById("app");
let teleprompterTimer = 0;
let previousTitle = document.title;
let procedureAutosaveTimer = 0;
let procedureAutosaveFingerprint = "";
let procedureAutosavePromise = null;
let procedureFocus = null;

const DEPARTMENT_LOGOS = {
  go: "./gov_seal-CY5gnciM.png",
  dmv: "./dmv_logo-BH-guDB4.png",
  hhs: "./hhs_dark_logo-CODVnXDo.png",
  irs: "./irs_dark_logo-Ce0G8mme.png",
  irsci: "./irs_ci_logo-pzSvsn3Z.png"
};

function activeView(name, department) {
  return state.view.name === name && (!department || state.view.dept === department);
}

function departmentLogo(department, className) {
  const source = DEPARTMENT_LOGOS[department.id];
  if (!source) return "";
  return "<span class='" + className + "'><img src='" + source + "' alt=''></span>";
}

function navButton(label, iconName, view, options = {}) {
  const active = activeView(view, options.dept);
  const data = options.dept ? "data-dept='" + escapeHtml(options.dept) + "'" : "";
  const count = typeof options.count === "number" ? "<span class='side-nav__count'>" + options.count + "</span>" : "";
  const navigationIcon = options.department ? departmentLogo(options.department, "side-nav__department-logo") || icon(iconName, 17) : icon(iconName, 17);
  return "<button type='button' class='side-nav__item " + (active ? "is-active" : "") + "' data-action='navigate' data-view='" + view + "' " + data + " title='" + escapeHtml(label) + "'>" +
    navigationIcon + "<span class='side-nav__item-text'>" + escapeHtml(label) + "</span>" + count + "</button>";
}

function sidebar() {
  const departments = departmentsWithCounts();
  const civic = departments.filter(function (department) { return department.group === "civic"; });
  const legal = departments.filter(function (department) { return department.group === "legal"; });
  return "<aside class='sidebar' aria-label='Nawigacja główna'>" +
    "<div class='sidebar__brand'><div class='brand-mark'><img src='./great_seal-Daa0xzsN.png' alt='Wielka Pieczęć Stanu San Andreas'></div><div class='brand-copy'><strong>State Capitol</strong><span>Centrum procedur</span></div></div>" +
    "<div class='sidebar__section'><div class='side-nav'>" +
      navButton("Dashboard", "dashboard", "dashboard") +
      navButton("Ulubione", "star", "favorites", { count: state.favoriteIds.size }) +
      navButton("Ostatnio używane", "clock", "recents", { count: state.recentIds.length }) +
      navButton("Historia zmian", "activity", "activity", { count: state.data.log.length }) +
      navButton("Struktura urzędu", "building", "organization") +
      navButton("Panel administratora", "lock", "admin") +
      navButton("Ustawienia", "settings", "settings") +
    "</div></div>" +
    "<div class='sidebar__section'><div class='sidebar__label'>Działy</div><div class='side-nav'>" +
      "<div class='side-nav__group'>Obywatelskie</div>" +
      civic.map(function (department) { return navButton(department.name, "building", "department", { dept: department.id, count: department.count, department: department }); }).join("") +
      "<div class='side-nav__group'>Prawno-śledcze</div>" +
      legal.map(function (department) { return navButton(department.name, "building", "department", { dept: department.id, count: department.count, department: department }); }).join("") +
    "</div></div>" +
    "<div class='sidebar__bottom'><div class='side-nav'>" +
      "<button type='button' class='side-nav__item' data-action='toggle-sidebar' title='Zwiń lub rozwiń panel'>" + icon("panel", 17) + "<span class='side-nav__item-text'>Zwiń panel</span></button>" +
    "</div></div></aside>";
}

function viewMeta() {
  if (state.view.name === "department") {
    const department = departmentsWithCounts().find(function (item) { return item.id === state.view.dept; });
    return { crumb: department && department.group === "legal" ? "Działy prawno-śledcze" : "Działy obywatelskie", title: department ? department.name : "Dział" };
  }
  if (state.view.name === "procedure") {
    const procedure = findProcedure(state.view.id);
    return { crumb: "Procedura", title: procedure ? procedure.title : "Procedura" };
  }
  const meta = {
    dashboard: ["Centrum dowodzenia", "Dashboard"],
    all: ["Centrum procedur", "Wszystkie procedury"],
    departments: ["Centrum procedur", "Wybierz dział"],
    favorites: ["Twoja przestrzeń", "Ulubione"],
    recents: ["Twoja przestrzeń", "Ostatnio używane"],
    activity: ["Rejestr zmian", "Historia zmian"],
    organization: ["State Capitol", "Struktura urzędu"],
    admin: ["Administracja", "Panel administratora"],
    settings: ["Administracja", "Ustawienia danych"],
    search: ["Wyszukiwanie", state.query ? "Wyniki wyszukiwania" : "Szukaj procedur"]
  }[state.view.name] || ["State Capitol", "Centrum procedur"];
  return { crumb: meta[0], title: meta[1] };
}

function topbar() {
  const meta = viewMeta();
  const roleLabel = state.admin.user ? state.admin.user.role : "viewer";
  const modeLabel = state.editMode ? "Wyloguj: " + roleLabel : "Zaloguj edytora lub admina";
  return "<header class='topbar no-print'>" +
    "<div class='topbar__left'>" +
      iconButton("Otwórz nawigację", "toggle-mobile-nav", { icon: "menu", className: "mobile-only" }) +
      "<span class='topbar__crumb'>" + escapeHtml(meta.crumb) + "</span><span class='topbar__separator'></span><span class='topbar__title'>" + escapeHtml(meta.title) + "</span>" +
    "</div>" +
    "<div class='topbar__right'>" +
      "<button type='button' class='search-trigger' data-action='open-palette'>" + icon("search", 16) + "<span>Szukaj procedury lub akcji</span><kbd>Ctrl K</kbd></button>" +
      iconButton("Odśwież dane", "refresh-data", { icon: "refresh" }) +
      iconButton(state.theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw", "toggle-theme", { icon: state.theme === "dark" ? "sun" : "moon" }) +
      iconButton(modeLabel, "toggle-lock", { icon: state.editMode ? "unlock" : "lock", className: state.editMode ? "is-active" : "" }) +
      (state.editMode ? button("Panel", "navigate", { icon: "lock", extra: "data-view='admin'" }) + button("Dodaj", "add-procedure", { icon: "plus", variant: "primary" }) : "") +
    "</div></header>";
}

function quickProcedure(procedure, showDepartment = true) {
  const department = departmentsWithCounts().find(function (item) { return item.id === procedure.dept; });
  return "<button type='button' class='quick-procedure' data-action='open-procedure' data-id='" + escapeHtml(procedure.id) + "'>" +
    "<span class='quick-procedure__icon'>" + icon("command", 17) + "</span><span class='quick-procedure__copy'><strong>" + escapeHtml(procedure.title) + "</strong><span>" + (showDepartment && department ? escapeHtml(department.name) : escapeHtml(procedure.exec || "Procedura")) + "</span></span>" +
    icon("chevron", 16, "quick-procedure__chevron") + "</button>";
}

function departmentTileMark(department) {
  return departmentLogo(department, "department-tile__logo") || "<span class='department-tile__code'>" + escapeHtml(department.short) + "</span>";
}

function logDateTimeValue(entry) {
  const date = String(entry && entry.date || "").trim();
  const time = String(entry && entry.time || "00:00:00").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const legacy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);
  const timeParts = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!timeParts || (!iso && !legacy)) return Number(entry && entry.createdAtMillis || 0);
  const year = Number(iso ? iso[1] : legacy[3]);
  const month = Number(iso ? iso[2] : legacy[1]);
  const day = Number(iso ? iso[3] : legacy[2]);
  return Date.UTC(year, month - 1, day, Number(timeParts[1]), Number(timeParts[2]), Number(timeParts[3] || 0));
}

function sortedLogEntries(entries) {
  return entries.slice().sort(function (left, right) {
    const byRecordedDate = logDateTimeValue(right) - logDateTimeValue(left);
    return byRecordedDate || Number(right.createdAtMillis || 0) - Number(left.createdAtMillis || 0);
  });
}

function dashboardView() {
  const departments = departmentsWithCounts();
  const recents = recentProcedures();
  const favorites = favoriteProcedures().slice(0, 5);
  const latest = sortedLogEntries(state.data.log).slice(0, 5);
  const mostRecent = latest[0];
  const lastUpdated = mostRecent ? mostRecent.date + " " + mostRecent.time : "brak wpisów";
  return "<section class='dashboard-view'>" +
    "<div class='page-hero'><div><div class='eyebrow'>State Capitol / operacje</div><h1>Wszystkie procedury,<br><em>zawsze pod ręką.</em></h1><p>Przejrzysta baza wiedzy dla zespołu State Capitol. Otwieraj, kopiuj, drukuj i prowadź ceremonie bez szukania po wiadomościach.</p><div class='page-hero__actions'>" +
      button("Otwórz wyszukiwarkę", "open-palette", { icon: "search", variant: "primary" }) +
      button("Przeglądaj działy", "navigate", { icon: "building", extra: "data-view='departments'" }) +
    "</div></div><div class='hero-orbit' aria-hidden='true'><div class='hero-orbit__core'><img src='./great_seal-Daa0xzsN.png' alt=''></div><i></i><b></b></div></div>" +
    "<div class='stat-grid'>" +
      statCard(String(state.data.procedures.length), "aktywnych procedur", "command", "brand", "all") +
      statCard(String(state.favoriteIds.size), "ulubionych procedur", "star", "gold", "favorites") +
      statCard(String(state.recentIds.length), "ostatnio używanych", "clock", "teal", "recents") +
      statCard(lastUpdated, "ostatnia aktualizacja", "activity", "muted", "activity") +
    "</div>" +
    "<div class='dashboard-grid'><section class='dashboard-panel dashboard-panel--wide'><div class='panel-heading'><div><span class='section-label'>Kontynuuj pracę</span><h2>Ostatnio używane</h2></div>" + button("Zobacz wszystkie", "navigate", { small: true, variant: "ghost", extra: "data-view='recents'" }) + "</div>" +
      (recents.length ? "<div class='quick-procedure-list'>" + recents.slice(0, 5).map(function (procedure) { return quickProcedure(procedure); }).join("") + "</div>" : emptyInline("Nie otwarto jeszcze żadnej procedury.", "Otwórz wyszukiwarkę", "open-palette")) +
    "</section><section class='dashboard-panel'><div class='panel-heading'><div><span class='section-label'>Skróty</span><h2>Twoje ulubione</h2></div>" + button("Wszystkie", "navigate", { small: true, variant: "ghost", extra: "data-view='favorites'" }) + "</div>" +
      (favorites.length ? "<div class='quick-procedure-list'>" + favorites.map(function (procedure) { return quickProcedure(procedure); }).join("") + "</div>" : emptyInline("Oznacz gwiazdką procedury, których używasz najczęściej.", "", "")) +
    "</section></div>" +
    "<section class='dashboard-panel'><div class='panel-heading'><div><span class='section-label'>Mapa wiedzy</span><h2>Działy i procedury</h2></div></div><div class='department-grid'>" +
      departments.map(departmentTile).join("") +
    "</div></section>" +
    "<section class='dashboard-panel'><div class='panel-heading'><div><span class='section-label'>Rejestr</span><h2>Ostatnie zmiany</h2></div>" + button("Pełna historia", "navigate", { small: true, variant: "ghost", extra: "data-view='activity'" }) + "</div>" +
      (latest.length ? "<div class='activity-list'>" + latest.map(activityItem).join("") + "</div>" : emptyInline("Brak wpisów w rejestrze zmian.", "", "")) +
    "</section></section>";
}

function statCard(value, label, iconName, tone, view) {
  const tag = view ? "button" : "div";
  const action = view ? " type='button' data-action='navigate' data-view='" + escapeHtml(view) + "'" : "";
  const accessibilityLabel = view ? " aria-label='Pokaż " + escapeHtml(label) + "'" : "";
  const clickable = view ? " stat-card--clickable" : "";
  return "<" + tag + " class='stat-card stat-card--" + tone + clickable + "'" + action + accessibilityLabel + "><span class='stat-card__icon'>" + icon(iconName, 17) + "</span><div><strong>" + escapeHtml(value) + "</strong><span>" + escapeHtml(label) + "</span></div></" + tag + ">";
}

function emptyInline(text, actionLabel, action) {
  return "<div class='inline-empty'><span>" + icon("clock", 17) + "</span><p>" + escapeHtml(text) + "</p>" + (action ? button(actionLabel, action, { small: true }) : "") + "</div>";
}

function departmentTile(department) {
  return "<button type='button' class='department-tile " + (department.group === "legal" ? "is-legal" : "") + "' data-action='navigate' data-view='department' data-dept='" + escapeHtml(department.id) + "'>" + departmentTileMark(department) + "<strong>" + escapeHtml(department.name) + "</strong><b>" + department.count + "</b></button>";
}

function departmentsView() {
  const departments = departmentsWithCounts();
  return "<section class='list-view'><header class='view-heading'><div><div class='eyebrow'>Centrum procedur</div><h1>Wybierz dział</h1><p>Wybierz dział, aby zobaczyć przypisane do niego procedury.</p></div></header><div class='department-grid'>" +
    departments.map(departmentTile).join("") +
    "</div></section>";
}

function departmentView() {
  const department = departmentsWithCounts().find(function (item) { return item.id === state.view.dept; });
  if (!department) return emptyState("Nie znaleziono działu", "Wybierz dział z panelu po lewej stronie.", "warning");
  const procedures = state.data.procedures.filter(function (procedure) { return procedure.dept === department.id; });
  const note = department.group === "civic" ? "<div class='context-note'>" + icon("warning", 16) + "<span>" + escapeHtml(DEPARTMENT_NOTE) + "</span></div>" : "";
  return "<section class='list-view'><header class='view-heading'><div><div class='eyebrow'>" + (department.group === "legal" ? "Dział prawno-śledczy" : "Dział obywatelski") + "</div><h1>" + escapeHtml(department.name) + "</h1><p>" + procedures.length + " " + (procedures.length === 1 ? "procedura" : "procedur") + " w tej sekcji.</p></div>" +
    (state.editMode ? button("Dodaj procedurę", "add-procedure", { icon: "plus", variant: "primary" }) : "") + "</header>" + note +
    (procedures.length ? "<div class='procedure-list'>" + procedures.map(function (procedure) {
      return procedureCard(procedure, { showDepartment: false, expanded: state.expanded.has(procedure.id) });
    }).join("") + "</div>" : emptyState("Brak procedur", "Ten dział nie ma jeszcze opisanych procedur.", "command", state.editMode ? button("Dodaj pierwszą", "add-procedure", { icon: "plus", variant: "primary" }) : "")) +
    "</section>";
}

function titledListView(title, eyebrow, procedures, emptyTitle, emptyText) {
  return "<section class='list-view'><header class='view-heading'><div><div class='eyebrow'>" + escapeHtml(eyebrow) + "</div><h1>" + escapeHtml(title) + "</h1><p>" + procedures.length + " " + (procedures.length === 1 ? "procedura" : "procedur") + " do wyświetlenia.</p></div></header>" +
    (procedures.length ? "<div class='procedure-list'>" + procedures.map(function (procedure) {
      return procedureCard(procedure, { showDepartment: true, expanded: state.expanded.has(procedure.id) });
    }).join("") + "</div>" : emptyState(emptyTitle, emptyText, "star", button("Otwórz wyszukiwarkę", "open-palette", { icon: "search", variant: "primary" }))) +
    "</section>";
}

function searchView() {
  const results = searchProcedures(state.query);
  const searching = isSearchingProcedures(state.query);
  return "<section class='list-view'><header class='view-heading'><div><div class='eyebrow'>Wyszukiwanie</div><h1>Wyniki dla „" + escapeHtml(state.query) + "”</h1><p>" + results.length + " " + (results.length === 1 ? "dopasowanie" : "dopasowań") + " w tytułach, krokach, uwagach i działach.</p></div>" + button("Zmień zapytanie", "open-palette", { icon: "search" }) + "</header>" +
    (searching ? emptyState("Szukam procedur", "Przeszukuję kolekcję procedures w Cloud Firestore.", "search") : results.length ? "<div class='procedure-list'>" + results.map(function (procedure) {
      return procedureCard(procedure, { showDepartment: true, expanded: state.expanded.has(procedure.id) });
    }).join("") : emptyState("Brak wyników", "Spróbuj krótszej frazy lub wyszukaj po nazwie działu.", "search", button("Wyczyść wyszukiwanie", "clear-search", { icon: "close" }))) +
    "</section>";
}

function activityItem(entry) {
  const type = entry.type === "create" ? "Dodano" : entry.type === "delete" ? "Usunięto" : "Zmieniono";
  const className = entry.type === "create" ? "activity-item--add" : entry.type === "delete" ? "activity-item--del" : "activity-item--mod";
  return "<article class='activity-item " + className + "'><span class='activity-item__type'>" + escapeHtml(type) + "</span><div class='activity-item__procedure'><strong>" + escapeHtml(entry.procedureTitle || "Nieznana procedura") + "</strong><span>" + escapeHtml(entry.user || "Nieznany użytkownik") + "</span></div><time class='activity-item__date'>" + escapeHtml(entry.date || "—") + "<span>" + escapeHtml(entry.time || "—") + "</span></time></article>";
}

function activityView() {
  return "<section class='list-view'><header class='view-heading'><div><div class='eyebrow'>Cloud Firestore / logs</div><h1>Historia zmian</h1><p>Automatyczny rejestr operacji wykonanych na procedurach.</p></div></header>" +
    (state.data.log.length ? "<div class='activity-list activity-list--full'><div class='activity-list__head'><span>Operacja</span><span>Procedura i użytkownik</span><span>Data i godzina</span></div>" + state.data.log.map(activityItem).join("") + "</div>" : emptyState("Brak wpisów", "Każda zmiana procedury utworzy wpis w kolekcji logs.", "activity")) +
    "</section>";
}

function organizationView() {
  return "<section class='organization-view'><header class='view-heading'><div><div class='eyebrow'>State Capitol</div><h1>Struktura urzędu</h1><p>Podział odpowiedzialności między zespołami obywatelskimi i prawno-śledczymi.</p></div></header>" +
    "<div class='organization-grid'><article class='organization-card'><div class='organization-card__icon'>" + icon("building", 20) + "</div><span class='section-label'>Działy obywatelskie</span><h2>Wspólna odpowiedzialność</h2><p>" + escapeHtml(DEPARTMENT_NOTE) + "</p><div class='organization-card__rule'><span>Osoby odpowiedzialne</span><b>" + escapeHtml(ORGANIZATION.civic) + "</b></div></article>" +
    "<article class='organization-card organization-card--legal'><div class='organization-card__icon'>" + icon("lock", 20) + "</div><span class='section-label'>Działy prawno-śledcze</span><h2>Zakres kompetencji</h2><p>Role odpowiedzialne za procedury prawno-śledcze w poszczególnych jednostkach.</p><ul>" + ORGANIZATION.legal.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul></article></div></section>";
}

function administratorProcedure(procedure) {
  const department = departmentsWithCounts().find(function (item) { return item.id === procedure.dept; });
  const stepCount = Array.isArray(procedure.steps) ? procedure.steps.length : 0;
  return "<article class='admin-procedure'><div class='admin-procedure__main'><span class='admin-procedure__id'>" + escapeHtml(procedure.id) + "</span><div><h2>" + escapeHtml(procedure.title) + "</h2><p>" + escapeHtml(procedure.exec || "Brak wskazanego wykonawcy") + "</p></div></div><div class='admin-procedure__meta'>" +
    departmentTag(department || { name: procedure.dept || "Nieprzypisany" }) + "<span>" + stepCount + " " + (stepCount === 1 ? "krok" : stepCount < 5 ? "kroki" : "kroków") + "</span></div><div class='admin-procedure__actions'>" +
    button("Edytuj", "edit-procedure", { id: procedure.id, small: true, icon: "edit", variant: "ghost" }) +
    (canDeleteProcedures() ? button("Usuń", "confirm-delete", { id: procedure.id, small: true, icon: "trash", variant: "danger" }) : "") +
    "</div></article>";
}

function adminView() {
  if (state.admin.status === "checking") {
    return "<section class='admin-view'><div class='admin-gate'><div class='loading-mark'>" + icon("lock", 22) + "</div><h1>Sprawdzam uprawnienia</h1><p>Łączę się z Firebase Authentication.</p></div></section>";
  }
  if (!state.editMode) {
    const message = state.admin.status === "viewer"
      ? "Rola viewer pozwala wyłącznie przeglądać procedury i historię zmian."
      : "Zaloguj konto Firebase z rolą editor lub admin, aby zarządzać procedurami.";
    return "<section class='admin-view'><div class='admin-gate'><div class='admin-gate__icon'>" + icon("lock", 24) + "</div><span class='section-label'>Dostęp chroniony</span><h1>Panel administratora</h1><p>" + escapeHtml(message) + "</p>" + button("Zaloguj administratora", "open-admin-login", { icon: "unlock", variant: "primary" }) + "</div></section>";
  }

  return "<section class='admin-view'><header class='view-heading'><div><div class='eyebrow'>Cloud Firestore</div><h1>Panel administratora</h1><p>Zarządzaj procedurami bez odświeżania strony. Zmiany synchronizują się automatycznie.</p></div>" + button("Dodaj procedurę", "add-procedure", { icon: "plus", variant: "primary" }) + "</header>" +
    "<div class='admin-status'><span>" + icon("check", 15) + " Połączono jako " + escapeHtml(state.admin.user.email || state.admin.user.uid) + "</span><b>Rola: " + escapeHtml(state.admin.user.role) + " · " + state.data.procedures.length + " procedur</b></div>" +
    (state.data.procedures.length ? "<div class='admin-procedure-list'>" + state.data.procedures.map(administratorProcedure).join("") + "</div>" : emptyState("Brak procedur", "Dodaj pierwszą procedurę do kolekcji procedures.", "command", button("Dodaj procedurę", "add-procedure", { icon: "plus", variant: "primary" }))) +
    "</section>";
}

function backupItem(backup) {
  return "<article class='backup-item'><div><strong>" + escapeHtml(backup.name) + "</strong><span>" + escapeHtml(backup.procedureCount) + " procedur · " + escapeHtml(backup.createdByName) + "</span></div><time>" + escapeHtml(backup.date) + "<br>" + escapeHtml(backup.time) + "</time>" +
    button("Odzyskaj", "restore-backup", { id: backup.id, small: true, icon: "refresh", variant: "ghost" }) + "</article>";
}

function settingsView() {
  const isAdmin = canDeleteProcedures();
  const backups = state.backups.items || [];
  const backupBusy = state.backups.status === "creating" || state.backups.status === "loading";
  const backupStatus = state.backups.status === "creating" ? "Tworzenie kopii w Firestore…" : state.backups.status === "loading" ? "Pobieranie kopii…" : "Kopie przechowują pełny stan kolekcji procedures.";
  const migrationBusy = state.migration.status === "running";
  const migrationResult = state.migration.result;
  const migrationSummary = migrationResult
    ? "Ostatnia migracja: dodano " + migrationResult.created + ", zaktualizowano " + migrationResult.updated + ", pominięto " + migrationResult.skipped + " dokumentów."
    : "Importer odczyta procedury i wpisy log z pliku procedury.json.";
  const adminTools = isAdmin
    ? "<section class='settings-card settings-card--wide'><div class='settings-card__icon'>" + icon("refresh", 19) + "</div><div class='settings-card__content'><span class='section-label'>Cloud Firestore</span><h2>Kopie zapasowe</h2><p>Utwórz niezależny snapshot procedur. Odzyskanie przywraca dokładny stan wybranej kopii i zapisuje operacje w historii zmian.</p><div class='settings-card__actions'>" +
      button(backupBusy ? "Pracuję…" : "Utwórz kopię", "create-backup", { icon: "plus", variant: "primary", disabled: backupBusy }) +
      button("Odśwież listę", "refresh-backups", { icon: "refresh", disabled: backupBusy }) +
      "</div><span class='settings-card__hint'>" + escapeHtml(backupStatus) + "</span>" +
      (backups.length ? "<div class='backup-list'>" + backups.map(backupItem).join("") + "</div>" : "<div class='backup-empty'>Nie utworzono jeszcze żadnej kopii zapasowej.</div>") +
      "</div></section>"
    : "<section class='settings-card settings-card--wide settings-card--locked'><div class='settings-card__icon'>" + icon("lock", 19) + "</div><div class='settings-card__content'><span class='section-label'>Dostęp administratora</span><h2>Import i kopie Firestore</h2><p>Import danych, tworzenie kopii oraz ich odzyskiwanie wymagają roli <b>admin</b>. Eksport jest dostępny dla każdego użytkownika.</p></div></section>";

  return "<section class='settings-view'><header class='view-heading'><div><div class='eyebrow'>Dane aplikacji</div><h1>Ustawienia</h1><p>Przenoś procedury między środowiskami i zarządzaj bezpiecznymi kopiami danych.</p></div></header><div class='settings-grid'>" +
    "<section class='settings-card'><div class='settings-card__icon'>" + icon("copy", 19) + "</div><div class='settings-card__content'><span class='section-label'>Archiwum lokalne</span><h2>Eksport do JSON</h2><p>Pobierz aktualny, przenośny zapis wszystkich procedur bez danych logowania ani historii zmian.</p><div class='settings-card__actions'>" + button("Pobierz JSON", "export-procedures", { icon: "copy", variant: "primary" }) + "</div></div></section>" +
    (isAdmin ? "<section class='settings-card'><div class='settings-card__icon'>" + icon("plus", 19) + "</div><div class='settings-card__content'><span class='section-label'>Cloud Firestore</span><h2>Import z JSON</h2><p>Wczytaj wcześniej wyeksportowany plik. Identyczne procedury są pomijane; nowe i zmienione są zapisywane bez odświeżania strony.</p><input id='import-procedures-file' class='visually-hidden' type='file' accept='application/json,.json'><div class='settings-card__actions'>" + button("Wybierz plik JSON", "select-import-file", { icon: "plus" }) + "</div></div></section>" : "") +
    (isAdmin ? "<section class='settings-card'><div class='settings-card__icon'>" + icon("refresh", 19) + "</div><div class='settings-card__content'><span class='section-label'>Migracja jednorazowa</span><h2>Importuj procedury.json</h2><p>Przenieś archiwalne procedury oraz  wpisy historii do Firestore. Ponowne uruchomienie nie utworzy duplikatów.</p><div class='settings-card__actions'>" + button(migrationBusy ? "Trwa migracja…" : "Uruchom migrację", "migrate-legacy-json", { icon: "refresh", variant: "primary", disabled: migrationBusy }) + "</div><span class='settings-card__hint'>" + escapeHtml(migrationSummary) + "</span></div></section>" : "") +
    adminTools +
    "</div></section>";
}

function mainView() {
  if (state.status === "loading") return "<section class='loading-view'><div class='loading-mark'>" + icon("building", 24) + "</div><h1>Ładowanie rejestru</h1><p>Pobieram najnowszą wersję procedur…</p></section>";
  if (state.status === "error") return emptyState("Nie udało się wczytać rejestru", "Sprawdź konfigurację Firebase, reguły Cloud Firestore oraz połączenie z internetem.", "warning", button("Spróbuj ponownie", "refresh-data", { icon: "refresh", variant: "primary" }));
  if (state.view.name === "dashboard") return dashboardView();
  if (state.view.name === "all") return titledListView("Wszystkie procedury", "Centrum procedur", state.data.procedures, "Brak procedur", "Nie ma jeszcze procedur w kolekcji Firestore.");
  if (state.view.name === "departments") return departmentsView();
  if (state.view.name === "department") return departmentView();
  if (state.view.name === "favorites") return titledListView("Ulubione", "Twoja przestrzeń", favoriteProcedures(), "Brak ulubionych", "Oznacz gwiazdką procedury, które chcesz mieć zawsze pod ręką.");
  if (state.view.name === "recents") return titledListView("Ostatnio używane", "Twoja przestrzeń", recentProcedures(), "Brak ostatnio używanych", "Otwórz procedurę, a pojawi się w tej sekcji.");
  if (state.view.name === "activity") return activityView();
  if (state.view.name === "organization") return organizationView();
  if (state.view.name === "admin") return adminView();
  if (state.view.name === "settings") return settingsView();
  if (state.view.name === "search") return searchView();
  if (state.view.name === "procedure") {
    const procedure = findProcedure(state.view.id);
    return procedure ? procedureDetail(procedure) : emptyState("Nie znaleziono procedury", "Wybrana procedura nie istnieje lub została usunięta.", "warning", button("Wróć do dashboardu", "navigate", { extra: "data-view='dashboard'", variant: "primary" }));
  }
  return dashboardView();
}

function palette() {
  if (!state.palette.open) return "";
  const query = state.palette.query;
  const results = query.trim() ? searchProcedures(query).slice(0, 9) : [];
  const searching = query.trim() && isSearchingProcedures(query);
  const commands = [
    { label: "Przejdź do dashboardu", meta: "Widok główny", icon: "dashboard", action: "palette-navigate", view: "dashboard" },
    { label: "Pokaż wszystkie procedury", meta: String(state.data.procedures.length) + " procedur", icon: "command", action: "palette-navigate", view: "all" },
    { label: "Otwórz ulubione", meta: String(state.favoriteIds.size) + " procedur", icon: "star", action: "palette-navigate", view: "favorites" },
    { label: "Przełącz motyw", meta: state.theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw", icon: state.theme === "dark" ? "sun" : "moon", action: "toggle-theme" }
  ];
  if (state.editMode) commands.push({ label: "Dodaj procedurę", meta: "Tryb edycji", icon: "plus", action: "add-procedure" });
  const commandHtml = commands.map(function (command) {
    return "<button type='button' class='palette__item' data-action='" + command.action + "' " + (command.view ? "data-view='" + command.view + "'" : "") + "><span class='palette__item-icon'>" + icon(command.icon, 16) + "</span><span><span class='palette__item-title'>" + escapeHtml(command.label) + "</span><span class='palette__item-meta'>" + escapeHtml(command.meta) + "</span></span></button>";
  }).join("");
  const resultHtml = results.map(function (procedure) {
    const department = departmentsWithCounts().find(function (item) { return item.id === procedure.dept; });
    return "<button type='button' class='palette__item' data-action='palette-procedure' data-id='" + escapeHtml(procedure.id) + "'><span class='palette__item-icon'>" + icon("command", 16) + "</span><span><span class='palette__item-title'>" + escapeHtml(procedure.title) + "</span><span class='palette__item-meta'>" + escapeHtml(department ? department.name : procedure.dept) + " · " + escapeHtml(procedure.exec || "procedura") + "</span></span></button>";
  }).join("");
  return "<div class='palette-backdrop' data-action='close-palette' data-backdrop='true'><section class='palette' role='dialog' aria-modal='true' aria-label='Szybkie wyszukiwanie'><div class='palette__search'>" + icon("search", 18) + "<input id='palette-input' type='search' autocomplete='off' placeholder='Szukaj procedury lub polecenia…' value='" + escapeHtml(query) + "'><kbd>Esc</kbd></div><div class='palette__results'>" +
    (query.trim() ? "<div class='palette__label'>Procedury</div>" + (searching ? "<div class='palette__empty'>Przeszukuję Cloud Firestore…</div>" : resultHtml || "<div class='palette__empty'>Nie znaleziono procedur dla tego zapytania.</div>") : "<div class='palette__label'>Polecenia</div>" + commandHtml + "<div class='palette__label'>Podpowiedź</div><div class='palette__empty'>Wpisz fragment tytułu, działu, kroku albo uwagi procedury.</div>") +
    "</div></section></div>";
}

function modal() {
  if (!state.modal) return "";
  if (state.modal.type === "edit") return editModal(state.modal.id);
  if (state.modal.type === "delete") return deleteModal(state.modal.id);
  if (state.modal.type === "saved") return savedModal();
  if (state.modal.type === "admin-login") return adminLoginModal();
  if (state.modal.type === "issue-confirmation") return issueConfirmationModal(state.modal.id);
  return "";
}

function modalShell(title, body, footer, small = false, description = "") {
  return "<div class='modal-backdrop' data-action='close-modal' data-backdrop='true'><section class='modal " + (small ? "modal--small" : "") + "' role='dialog' aria-modal='true' aria-label='" + escapeHtml(title) + "'><header class='modal__header'><div><h2>" + escapeHtml(title) + "</h2>" + (description ? "<p>" + escapeHtml(description) + "</p>" : "") + "</div>" + iconButton("Zamknij", "close-modal", { icon: "close" }) + "</header><div class='modal__body'>" + body + "</div>" + (footer ? "<footer class='modal__footer'>" + footer + "</footer>" : "") + "</section></div>";
}

function departmentOptions(selected) {
  const known = DEPARTMENTS.slice();
  if (selected && !known.some(function (department) { return department.id === selected; })) known.push({ id: selected, name: selected });
  return known.map(function (department) {
    return "<option value='" + escapeHtml(department.id) + "' " + (department.id === selected ? "selected" : "") + ">" + escapeHtml(department.name) + "</option>";
  }).join("");
}

function stepEditorRow(value, index) {
  return "<div class='step-editor__row' data-step-row><span class='step-editor__number' data-step-number>" + (index + 1) + "</span><input data-step-input type='text' value='" + escapeHtml(value) + "' placeholder='Opis kroku " + (index + 1) + "' aria-label='Krok " + (index + 1) + "'><div class='step-editor__actions'><button type='button' class='step-editor__button' data-action='step-move-up' aria-label='Przenieś krok wyżej'>↑</button><button type='button' class='step-editor__button' data-action='step-move-down' aria-label='Przenieś krok niżej'>↓</button><button type='button' class='step-editor__button step-editor__button--danger' data-action='step-remove' aria-label='Usuń krok'>×</button></div></div>";
}

function editModal(id) {
  const procedure = id ? findProcedure(id) : null;
  const title = procedure ? "Edytuj procedurę" : "Dodaj procedurę";
  const values = procedure || { title: "", dept: state.view.name === "department" ? state.view.dept : "go", exec: "wszystkie działy State Capitol", steps: [], notes: "" };
  const steps = values.steps && values.steps.length ? values.steps : [""];
  const stepRows = steps.map(stepEditorRow).join("");
  const saveHint = procedure
    ? "<p id='procedure-autosave-status' class='form-save-status' aria-live='polite'>Zmiany zapisują się automatycznie.</p>"
    : "<p class='form-save-status'>Nową procedurę zatwierdź przyciskiem „Zapisz w Firestore”.</p>";
  const body = "<form id='procedure-form' class='form-grid' data-form='procedure'><input type='hidden' name='id' value='" + escapeHtml(procedure ? procedure.id : "") + "'><div class='field'><label for='form-title'>Nazwa procedury</label><input id='form-title' required name='title' value='" + escapeHtml(values.title) + "' placeholder='Np. Wydanie dokumentu tożsamości'></div><div class='field'><label for='form-dept'>Dział zarządzający</label><select id='form-dept' name='dept'>" + departmentOptions(values.dept) + "</select></div><div class='field'><label for='form-exec'>Działy wykonujące</label><input id='form-exec' name='exec' value='" + escapeHtml(values.exec || "") + "'></div><div class='field'><div class='field__label-row'><label>Kroki procedury</label><button type='button' class='text-button' data-action='step-add'>" + icon("plus", 14) + " Dodaj krok</button></div><div id='procedure-step-list' class='step-editor__list'>" + stepRows + "</div><span class='field__hint'>Zmieniaj kolejność strzałkami. Puste kroki nie zostaną zapisane.</span></div><div class='field'><label for='form-notes'>Uwagi i przepisy</label><textarea id='form-notes' name='notes' placeholder='Informacje dodatkowe, opłaty i akty prawne'>" + escapeHtml(values.notes || "") + "</textarea></div>" + saveHint + "</form>";
  const submitLabel = "Zapisz w Firestore";
  return modalShell(title, body, button("Anuluj", "close-modal", { variant: "ghost" }) + "<button class='button button--primary' type='submit' form='procedure-form'>" + icon("check", 15) + "<span>" + submitLabel + "</span></button>");
}

function procedureFieldsFromForm(form) {
  const fields = Object.fromEntries(new FormData(form).entries());
  fields.steps = Array.from(form.querySelectorAll("[data-step-input]")).map(function (input) { return input.value; });
  return fields;
}

function procedureFingerprint(fields) {
  return JSON.stringify({
    title: String(fields.title || "").trim(),
    dept: String(fields.dept || "").trim(),
    exec: String(fields.exec || "").trim(),
    steps: (fields.steps || []).map(function (step) { return String(step || "").trim(); }).filter(Boolean),
    notes: String(fields.notes || "").trim()
  });
}

function setProcedureAutosaveStatus(message, isError = false) {
  const status = document.getElementById("procedure-autosave-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function rememberProcedureFocus(target) {
  const form = target.closest("#procedure-form");
  if (!form) return;
  const steps = Array.from(form.querySelectorAll("[data-step-input]"));
  procedureFocus = {
    name: target.name || "",
    stepIndex: steps.indexOf(target),
    start: Number.isInteger(target.selectionStart) ? target.selectionStart : null,
    end: Number.isInteger(target.selectionEnd) ? target.selectionEnd : null
  };
}

function focusProcedureForm() {
  const form = document.getElementById("procedure-form");
  if (!form) return;
  let input = null;
  if (procedureFocus && procedureFocus.stepIndex >= 0) {
    input = form.querySelectorAll("[data-step-input]")[procedureFocus.stepIndex] || null;
  } else if (procedureFocus && procedureFocus.name) {
    input = form.querySelector("[name='" + procedureFocus.name + "']");
  }
  input = input || document.getElementById("form-title");
  if (!input) return;
  input.focus();
  if (procedureFocus && Number.isInteger(procedureFocus.start) && typeof input.setSelectionRange === "function") {
    const end = Number.isInteger(procedureFocus.end) ? procedureFocus.end : procedureFocus.start;
    input.setSelectionRange(Math.min(input.value.length, procedureFocus.start), Math.min(input.value.length, end));
  }
}

function scheduleProcedureAutosave(form) {
  const id = String(new FormData(form).get("id") || "");
  if (!id || !state.editMode) return;
  clearTimeout(procedureAutosaveTimer);
  setProcedureAutosaveStatus("Zmiany oczekują na zapis…");
  procedureAutosaveTimer = window.setTimeout(async function () {
    const fields = procedureFieldsFromForm(form);
    const fingerprint = procedureFingerprint(fields);
    if (fingerprint === procedureAutosaveFingerprint) {
      setProcedureAutosaveStatus("Wszystkie zmiany są zapisane.");
      return;
    }
    if (!String(fields.title || "").trim() || !String(fields.dept || "").trim()) {
      setProcedureAutosaveStatus("Uzupełnij nazwę i dział, aby zapisać zmiany.", true);
      return;
    }
    try {
      setProcedureAutosaveStatus("Zapisuję w Firestore…");
      procedureAutosavePromise = addOrUpdateProcedure(fields, id);
      await procedureAutosavePromise;
      procedureAutosaveFingerprint = fingerprint;
      setProcedureAutosaveStatus("Wszystkie zmiany są zapisane.");
    } catch (error) {
      setProcedureAutosaveStatus(error.message || "Nie udało się zapisać zmian.", true);
    } finally {
      procedureAutosavePromise = null;
    }
  }, 650);
}

function deleteModal(id) {
  const procedure = findProcedure(id);
  const description = "Usunięcie zostanie zapisane w Cloud Firestore.";
  const body = "<p>" + description + "</p><div class='modal__notice'><b>Do usunięcia:</b> " + escapeHtml(procedure ? procedure.title : "Nieznana procedura") + "</div>";
  return modalShell("Usunąć procedurę?", body, button("Anuluj", "close-modal", { variant: "ghost" }) + button("Usuń procedurę", "delete-procedure", { id: id, icon: "trash", variant: "danger" }), true);
}

function savedModal() {
  const body = "<p class='modal-copy'>Zmiany zostały zapisane w Cloud Firestore i będą widoczne dla wszystkich użytkowników aplikacji po synchronizacji w czasie rzeczywistym.</p>";
  return modalShell("Zmiany zapisane", body, button("Zamknij", "close-modal", { variant: "primary" }), true);
}

function adminLoginModal() {
  const body = "<form id='admin-login-form' class='form-grid' data-form='admin-login'><p class='modal-copy'>Zaloguj się kontem Firebase Authentication z przypisaną rolą <b>editor</b> lub <b>admin</b>.</p><div class='field'><label for='admin-email'>Adres e-mail</label><input id='admin-email' required type='email' name='email' autocomplete='email' placeholder='admin@example.com'></div><div class='field'><label for='admin-password'>Hasło</label><input id='admin-password' required type='password' name='password' autocomplete='current-password' placeholder='Wpisz hasło'><span class='field__hint'>W Firebase Authentication musi być włączony dostawca e-mail i hasło.</span></div></form>";
  return modalShell("Logowanie administratora", body, button("Anuluj", "close-modal", { variant: "ghost" }) + "<button class='button button--primary' type='submit' form='admin-login-form'>" + icon("unlock", 15) + "<span>Zaloguj i otwórz panel</span></button>", true);
}

function issueConfirmationModal(id) {
  const procedure = findProcedure(id);
  if (!procedure) return modalShell("Nie znaleziono procedury", "<p class='modal-copy'>Nie można przygotować potwierdzenia dla nieistniejącej procedury.</p>", button("Zamknij", "close-modal", { variant: "primary" }), true);
  const body = "<form id='issue-confirmation-form' class='form-grid' data-form='issue-confirmation'><input type='hidden' name='id' value='" + escapeHtml(procedure.id) + "'><div class='field'><label for='issue-document-number'>Numer wydanego dokumentu</label><input id='issue-document-number' required name='document-number' autocomplete='off' placeholder='Np. HHS/2026/00421'><span class='field__hint'>Wpisz numer wygenerowany w systemie źródłowym. Nie jest on zapisywany w bazie danych.</span></div><div class='field'><label for='issue-issued-by'>Osoba wydająca</label><input id='issue-issued-by' required name='issued-by' autocomplete='name' placeholder='Imię i nazwisko osoby wydającej'></div></form>";
  const footer = button("Anuluj", "close-modal", { variant: "ghost" }) +
    "<button class='button' type='submit' form='issue-confirmation-form' data-format='clipboard'>" + icon("copy", 15) + "<span>Kopiuj obraz</span></button>" +
    "<button class='button' type='submit' form='issue-confirmation-form' data-format='jpeg'>" + icon("copy", 15) + "<span>Pobierz JPG</span></button>" +
    "<button class='button button--primary' type='submit' form='issue-confirmation-form' data-format='png'>" + icon("check", 15) + "<span>Pobierz PNG</span></button>";
  return modalShell("Potwierdzenie wydania", body, footer, false, "Wygeneruj urzędowy kwitek potwierdzający wydanie dokumentu.");
}

function teleprompter() {
  const setting = state.teleprompter;
  if (!setting) return "";
  const procedure = findProcedure(setting.id);
  if (!procedure) return "";
  const text = procedureText(procedure);
  const percentage = Math.round((setting.progress || 0) * 100);
  return "<section class='teleprompter' role='dialog' aria-modal='true' aria-label='Tryb suflera'><header class='teleprompter__top'><div><span>Tryb suflera</span><strong>" + escapeHtml(procedure.title) + "</strong></div><div class='teleprompter__tools'><button type='button' class='teleprompter__tool' data-action='teleprompter-font-down' aria-label='Zmniejsz tekst'>A−</button><button type='button' class='teleprompter__tool' data-action='teleprompter-font-up' aria-label='Powiększ tekst'>A+</button><button type='button' class='teleprompter__tool' data-action='teleprompter-speed-down' aria-label='Zwolnij przewijanie'>−</button><span class='teleprompter__speed'>" + setting.speed + "</span><button type='button' class='teleprompter__tool' data-action='teleprompter-speed-up' aria-label='Przyspiesz przewijanie'>+</button>" + iconButton("Zamknij sufler", "close-teleprompter", { icon: "close", className: "teleprompter__close" }) + "</div></header><div id='teleprompter-scroll' class='teleprompter__scroll'><article class='teleprompter__text' style='font-size:" + setting.fontSize + "px'>" + escapeHtml(text) + "</article></div><footer class='teleprompter__footer'><div class='teleprompter__progress'><i style='width:" + percentage + "%'></i></div><button type='button' class='button button--primary' data-action='toggle-teleprompter-play'>" + icon(setting.playing ? "pause" : "play", 15) + "<span>" + (setting.playing ? "Pauza" : "Start autoscrolla") + "</span></button><span>Spacja: start/pauza · Esc: zamknij</span></footer></section>";
}

function toast() {
  if (!state.toast) return "<div class='toast' aria-live='polite'></div>";
  const iconName = state.toast.type === "error" ? "warning" : "check";
  return "<div class='toast toast--" + escapeHtml(state.toast.type) + " is-visible' aria-live='polite'>" + icon(iconName, 16) + "<span>" + escapeHtml(state.toast.message) + "</span></div>";
}

function render() {
  const compact = state.sidebarCompact ? " is-compact" : "";
  const mobile = state.mobileNavOpen ? " is-mobile-open" : "";
  app.innerHTML = "<div class='app-shell" + compact + mobile + "'>" + sidebar() + (state.mobileNavOpen ? "<button type='button' class='mobile-scrim' data-action='toggle-mobile-nav' aria-label='Zamknij nawigację'></button>" : "") + "<div class='workspace'>" + topbar() + "<main id='main-content' class='main-content'>" + mainView() + "</main></div></div>" + palette() + modal() + teleprompter() + toast();
  afterRender();
}

function afterRender() {
  if (state.palette.open) {
    window.setTimeout(function () {
      const input = document.getElementById("palette-input");
      if (input) {
        input.focus();
        const start = Math.min(input.value.length, state.palette.selectionStart);
        const end = Math.min(input.value.length, state.palette.selectionEnd);
        input.setSelectionRange(start, end);
      }
    }, 0);
  }
  if (state.modal && state.modal.type === "edit") {
    window.setTimeout(function () {
      const form = document.getElementById("procedure-form");
      if (form && new FormData(form).get("id")) {
        procedureAutosaveFingerprint = procedureFingerprint(procedureFieldsFromForm(form));
      }
      focusProcedureForm();
    }, 0);
  }
  if (state.modal && state.modal.type === "admin-login") {
    window.setTimeout(function () {
      const input = document.getElementById("admin-email");
      if (input) input.focus();
    }, 0);
  }
  if (state.modal && state.modal.type === "issue-confirmation") {
    window.setTimeout(function () {
      const input = document.getElementById("issue-document-number");
      if (input) input.focus();
    }, 0);
  }
  activateTeleprompter();
}

function refreshStepNumbers(list) {
  Array.from(list.querySelectorAll("[data-step-row]")).forEach(function (row, index) {
    const number = row.querySelector("[data-step-number]");
    const input = row.querySelector("[data-step-input]");
    if (number) number.textContent = String(index + 1);
    if (input) {
      input.setAttribute("aria-label", "Krok " + String(index + 1));
      input.setAttribute("placeholder", "Opis kroku " + String(index + 1));
    }
  });
}

function appendStepRow(list) {
  const template = document.createElement("template");
  template.innerHTML = stepEditorRow("", list.querySelectorAll("[data-step-row]").length);
  const row = template.content.firstElementChild;
  list.append(row);
  refreshStepNumbers(list);
  const input = row.querySelector("[data-step-input]");
  if (input) input.focus();
}

function handleStepEditorAction(action, element) {
  const field = element.closest(".field");
  const list = element.closest(".step-editor__list") || (field && field.querySelector(".step-editor__list"));
  const form = element.closest("#procedure-form");
  if (!list) return;
  if (action === "step-add") {
    appendStepRow(list);
    const rows = Array.from(list.querySelectorAll("[data-step-row]"));
    procedureFocus = { name: "", stepIndex: rows.length - 1, start: 0, end: 0 };
    if (form) scheduleProcedureAutosave(form);
    return;
  }

  const row = element.closest("[data-step-row]");
  if (!row) return;
  if (action === "step-remove") {
    const rows = list.querySelectorAll("[data-step-row]");
    if (rows.length === 1) {
      const input = row.querySelector("[data-step-input]");
      if (input) input.value = "";
    } else row.remove();
  }
  if (action === "step-move-up" && row.previousElementSibling) {
    list.insertBefore(row, row.previousElementSibling);
  }
  if (action === "step-move-down" && row.nextElementSibling) {
    list.insertBefore(row.nextElementSibling, row);
  }
  refreshStepNumbers(list);
  const input = row.querySelector("[data-step-input]");
  if (input) {
    input.focus();
    procedureFocus = { name: "", stepIndex: Array.from(list.querySelectorAll("[data-step-row]")).indexOf(row), start: 0, end: 0 };
  }
  if (form) scheduleProcedureAutosave(form);
}

function activateTeleprompter() {
  clearInterval(teleprompterTimer);
  if (!state.teleprompter || !state.teleprompter.playing) return;
  const scroll = document.getElementById("teleprompter-scroll");
  if (!scroll) return;
  let lastTime = performance.now();
  let position = scroll.scrollTop;
  teleprompterTimer = window.setInterval(function () {
    if (!state.teleprompter || !state.teleprompter.playing) {
      clearInterval(teleprompterTimer);
      return;
    }
    const time = performance.now();
    const elapsed = Math.max(1 / 60, (time - lastTime) / 1000);
    lastTime = time;
    const maxScroll = scroll.scrollHeight - scroll.clientHeight;
    if (maxScroll <= 0) {
      state.teleprompter.playing = false;
      notify();
      return;
    }
    const nextPosition = Math.min(maxScroll, position + state.teleprompter.speed * elapsed);
    position = nextPosition;
    scroll.scrollTop = nextPosition;
    state.teleprompter.progress = scroll.scrollTop / maxScroll;
    const progress = document.querySelector(".teleprompter__progress i");
    if (progress) progress.style.width = String(Math.round(state.teleprompter.progress * 100)) + "%";
    if (nextPosition >= maxScroll) {
      state.teleprompter.playing = false;
      notify();
    }
  }, 16);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function downloadProceduresJson() {
  const exported = exportProceduresAsJson();
  const blob = new Blob([JSON.stringify(exported, null, 2) + "\n"], { type: "application/json" });
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = URL.createObjectURL(blob);
  link.download = "procedures-" + timestamp + ".json";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
}

function issueTimestamp() {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date()).replace(",", " ·");
}

function drawCanvasParagraph(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";
  words.forEach(function (word) {
    const nextLine = currentLine ? currentLine + " " + word : word;
    if (currentLine && context.measureText(nextLine).width > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else currentLine = nextLine;
  });
  if (currentLine) lines.push(currentLine);
  lines.slice(0, maxLines).forEach(function (line, index) {
    context.fillText(line, x, y + index * lineHeight);
  });
  return y + Math.min(lines.length, maxLines) * lineHeight;
}

function loadCanvasImageDirectly(source) {
  return new Promise(function (resolve, reject) {
    const image = new Image();
    image.onload = function () { resolve(image); };
    image.onerror = reject;
    image.src = source;
  });
}

async function loadCanvasImage(source) {
  try {
    const response = await fetch(source, { cache: "force-cache" });
    if (!response.ok) throw new Error("Nie udało się pobrać pieczęci.");
    const blob = await response.blob();
    if (typeof createImageBitmap === "function") return await createImageBitmap(blob);
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadCanvasImageDirectly(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    return loadCanvasImageDirectly(source);
  }
}

function drawOfficialSeal(context, x, y, size, ink) {
  const center = x + size / 2;
  context.save();
  context.translate(center, y + size / 2);
  context.rotate(-0.045);
  context.globalAlpha = .78;
  context.strokeStyle = ink;
  context.lineWidth = Math.max(2, Math.round(size * .045));
  context.beginPath();
  context.arc(0, 0, size / 2 - 5, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([Math.max(2, size * .024), Math.max(2, size * .018)]);
  context.lineWidth = Math.max(1.5, Math.round(size * .018));
  context.beginPath();
  context.arc(0, 0, size / 2 - Math.max(12, size * .12), 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = ink;
  context.font = "700 " + Math.round(size * .065) + "px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("STATE CAPITOL", 0, -size * .23);
  context.font = "700 " + Math.round(size * .25) + "px Georgia, serif";
  context.fillText("SC", 0, size * .09);
  context.font = "700 " + Math.round(size * .058) + "px Arial, sans-serif";
  context.fillText("SAN ANDREAS", 0, size * .29);
  context.restore();
}

function drawInkSeal(context, image, x, y, size, ink) {
  const stamp = document.createElement("canvas");
  const stampSize = Math.max(360, Math.round(size * 2));
  stamp.width = stampSize;
  stamp.height = stampSize;
  const stampContext = stamp.getContext("2d", { willReadFrequently: true });
  if (!stampContext) throw new Error("Nie udało się przygotować pieczęci.");
  stampContext.drawImage(image, 0, 0, stampSize, stampSize);
  const pixels = stampContext.getImageData(0, 0, stampSize, stampSize);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    const brightness = red * .2126 + green * .7152 + blue * .0722;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    const coverage = Math.max(0, Math.min(1, (244 - brightness) / 165 + saturation / 580));
    if (coverage < .08) {
      pixels.data[index + 3] = 0;
      continue;
    }
    const grain = .72 + ((index / 4 * 17) % 19) / 100;
    pixels.data[index] = 16;
    pixels.data[index + 1] = 44;
    pixels.data[index + 2] = 88;
    pixels.data[index + 3] = Math.round(pixels.data[index + 3] * Math.min(.92, coverage * grain));
  }
  stampContext.putImageData(pixels, 0, 0);
  context.save();
  context.translate(x + size / 2, y + size / 2);
  context.rotate(-0.045);
  context.globalAlpha = .84;
  context.drawImage(stamp, -size / 2, -size / 2, size, size);
  context.restore();
}

function drawCanvasSignature(context, name, x, y, maxWidth) {
  const text = String(name || "").trim();
  let fontSize = 40;
  context.save();
  context.textAlign = "center";
  do {
    context.font = "italic " + fontSize + "px 'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive";
    fontSize -= 1;
  } while (fontSize > 21 && context.measureText(text).width > maxWidth);
  context.fillText(text, x, y);
  context.restore();
}

function canvasToBlob(canvas, type) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob);
      else reject(new Error("Nie udało się wygenerować obrazu."));
    }, type, type === "image/jpeg" ? 0.94 : undefined);
  });
}

async function createIssueConfirmationBlob(documentNumber, issuedBy, documentTitle, format) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Przeglądarka nie obsługuje generowania dokumentów.");

  canvas.width = 1600;
  canvas.height = 1131;
  const width = canvas.width;
  const height = canvas.height;
  const navy = "#102c58";
  const gold = "#b48935";
  const paper = "#fcfaf3";
  const ink = "#17243a";
  const muted = "#59677c";

  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = navy;
  context.lineWidth = 16;
  context.strokeRect(30, 30, width - 60, height - 60);
  context.strokeStyle = gold;
  context.lineWidth = 3;
  context.strokeRect(54, 54, width - 108, height - 108);

  context.fillStyle = navy;
  context.fillRect(57, 57, width - 114, 166);
  context.fillStyle = gold;
  context.fillRect(57, 218, width - 114, 5);
  context.fillStyle = "#ffffff";
  context.font = "700 48px Georgia, serif";
  context.fillText("STATE CAPITOL", 122, 127);
  context.font = "600 20px Arial, sans-serif";
  context.fillStyle = "#dbe6f6";
  context.fillText("SAN ANDREAS · CENTRUM PROCEDUR", 125, 163);

  let sealImage = null;
  drawOfficialSeal(context, 1304, 62, 132, navy);
  try {
    sealImage = await loadCanvasImage("./great_seal-Daa0xzsN.png");
    drawInkSeal(context, sealImage, 1304, 62, 132, navy);
  } catch (error) {
    // Okrągła pieczęć zastępcza została narysowana przed wczytaniem pliku.
  }

  context.textAlign = "center";
  context.fillStyle = navy;
  context.font = "700 44px Georgia, serif";
  context.fillText("POTWIERDZENIE WYDANIA DOKUMENTU", width / 2, 304);
  context.font = "600 17px Arial, sans-serif";
  context.fillStyle = muted;
  context.fillText("OFICJALNE POTWIERDZENIE CZYNNOŚCI W SYSTEMIE STATE CAPITOL", width / 2, 340);

  context.fillStyle = "#edf2f8";
  context.fillRect(220, 385, width - 440, 142);
  context.strokeStyle = "#c5d2e2";
  context.lineWidth = 2;
  context.strokeRect(220, 385, width - 440, 142);
  context.fillStyle = muted;
  context.font = "700 15px Arial, sans-serif";
  context.fillText("NUMER WYDANEGO DOKUMENTU", width / 2, 430);
  context.fillStyle = navy;
  context.font = "700 36px 'DM Mono', Consolas, monospace";
  context.fillText(documentNumber, width / 2, 483);

  context.textAlign = "center";
  context.fillStyle = ink;
  context.font = "400 26px Georgia, serif";
  context.fillText("Niniejszym potwierdza się wydanie dokumentu:", width / 2, 602);
  context.font = "700 34px Georgia, serif";
  const documentTitleEnd = drawCanvasParagraph(context, documentTitle || "Dokument", width / 2, 651, width - 360, 42, 2);

  const issuerTop = Math.max(770, documentTitleEnd + 42);
  context.font = "700 14px Arial, sans-serif";
  context.fillStyle = muted;
  context.fillText("DOKUMENT WYDAŁ(A)", width / 2, issuerTop);
  context.font = "600 24px Arial, sans-serif";
  context.fillStyle = ink;
  context.fillText(issuedBy, width / 2, issuerTop + 38);

  const signatureY = 980;
  context.strokeStyle = "#8f9db0";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(180, signatureY);
  context.lineTo(590, signatureY);
  context.moveTo(1010, signatureY);
  context.lineTo(1420, signatureY);
  context.stroke();
  drawOfficialSeal(context, 1125, 775, 180, navy);
  if (sealImage) {
    try {
      drawInkSeal(context, sealImage, 1125, 775, 180, navy);
    } catch (error) {
      // Zostaje narysowany wcześniej stempel zastępczy.
    }
    if (typeof sealImage.close === "function") sealImage.close();
  }
  context.font = "600 14px Arial, sans-serif";
  context.fillStyle = muted;
  context.textAlign = "center";
  context.fillStyle = ink;
  drawCanvasSignature(context, issuedBy, 385, signatureY - 12, 350);
  context.font = "600 14px Arial, sans-serif";
  context.fillStyle = muted;
  context.fillText("PODPIS OSOBY WYDAJĄCEJ", 385, signatureY + 34);
  context.fillText("PIECZĘĆ STATE CAPITOL", 1215, signatureY + 30);
  context.font = "600 13px Arial, sans-serif";
  context.fillText("Data wygenerowania: " + issueTimestamp(), 1215, signatureY + 57);
  context.font = "400 13px Arial, sans-serif";
  context.fillText("Wygenerowano cyfrowo w Centrum Procedur State Capitol", width / 2, 1090);

  return canvasToBlob(canvas, format === "jpeg" ? "image/jpeg" : "image/png");
}

async function downloadIssueConfirmation(documentNumber, issuedBy, documentTitle, format) {
  const number = String(documentNumber || "").trim();
  const issuer = String(issuedBy || "").trim();
  if (!number) throw new Error("Wpisz numer wydanego dokumentu.");
  if (!issuer) throw new Error("Wpisz osobę wydającą dokument.");
  const blob = await createIssueConfirmationBlob(number, issuer, documentTitle, format);
  const extension = format === "jpeg" ? "jpg" : "png";
  const safeNumber = number.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "dokument";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "potwierdzenie-wydania-" + safeNumber + "." + extension;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
}

async function copyIssueConfirmationToClipboard(documentNumber, issuedBy, documentTitle) {
  const number = String(documentNumber || "").trim();
  const issuer = String(issuedBy || "").trim();
  if (!number) throw new Error("Wpisz numer wydanego dokumentu.");
  if (!issuer) throw new Error("Wpisz osobę wydającą dokument.");
  if (!navigator.clipboard || typeof navigator.clipboard.write !== "function" || typeof ClipboardItem === "undefined") {
    throw new Error("Ta przeglądarka nie obsługuje kopiowania obrazów do schowka.");
  }
  const blob = await createIssueConfirmationBlob(number, issuer, documentTitle, "png");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

function closeOverlays() {
  if (state.teleprompter) {
    setTeleprompter(null);
    return true;
  }
  if (state.modal) {
    setModal(null);
    return true;
  }
  if (state.palette.open) {
    setPalette(false);
    return true;
  }
  if (state.mobileNavOpen) {
    setMobileNav(false);
    return true;
  }
  return false;
}

app.addEventListener("click", async function (event) {
  const element = event.target.closest("[data-action]");
  if (!element) return;
  if (element.dataset.backdrop === "true" && event.target !== element) return;
  const action = element.dataset.action;
  const id = element.dataset.id;
  if (action === "navigate") {
    const nextView = element.dataset.dept ? { name: "department", dept: element.dataset.dept } : { name: element.dataset.view };
    navigate(nextView);
    if (nextView.name === "settings" && canDeleteProcedures()) {
      refreshBackups().catch(function (error) {
        showToast(error.message || "Nie udało się pobrać kopii zapasowych.", "error");
      });
    }
  } else if (action === "palette-navigate") {
    setPalette(false);
    navigate({ name: element.dataset.view });
  } else if (action === "open-procedure" || action === "palette-procedure") {
    if (action === "palette-procedure") setPalette(false);
    openProcedure(id);
  } else if (action === "toggle-expanded") {
    toggleExpanded(id);
  } else if (action === "toggle-favorite") {
    toggleFavorite(id);
    showToast(isFavorite(id) ? "Dodano do ulubionych." : "Usunięto z ulubionych.", "success");
  } else if (action === "open-palette") {
    setPalette(true, state.query || "");
  } else if (action === "close-palette") {
    setPalette(false);
  } else if (action === "clear-search") {
    setSearch("");
  } else if (action === "toggle-sidebar") {
    setSidebarCompact(!state.sidebarCompact);
  } else if (action === "toggle-mobile-nav") {
    setMobileNav(!state.mobileNavOpen);
  } else if (action === "toggle-theme") {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  } else if (action === "refresh-data") {
    await loadData();
    showToast(state.status === "ready" ? "Rejestr został odświeżony." : "Nie udało się odświeżyć danych.", state.status === "ready" ? "success" : "error");
  } else if (action === "export-procedures") {
    downloadProceduresJson();
    showToast("Pobrano eksport procedur w formacie JSON.", "success");
  } else if (action === "select-import-file") {
    const fileInput = document.getElementById("import-procedures-file");
    if (fileInput) fileInput.click();
  } else if (action === "refresh-backups") {
    try {
      await refreshBackups();
      showToast("Lista kopii zapasowych została odświeżona.", "success");
    } catch (error) {
      showToast(error.message || "Nie udało się odświeżyć kopii zapasowych.", "error");
    }
  } else if (action === "create-backup") {
    try {
      const backup = await createBackup();
      showToast("Utworzono kopię „" + backup.name + "”.", "success");
    } catch (error) {
      showToast(error.message || "Nie udało się utworzyć kopii zapasowej.", "error");
    }
  } else if (action === "migrate-legacy-json") {
    const accepted = window.confirm("Uruchomić migrację procedury.json do Firestore? Import doda nowe i zaktualizuje zmienione procedury oraz przeniesie archiwalne wpisy historii.");
    if (!accepted) return;
    try {
      const result = await migrateLegacyProcedures();
      showToast("Migracja zakończona: dodano " + result.created + ", zaktualizowano " + result.updated + ", pominięto " + result.skipped + " dokumentów. Procedury: " + result.procedures.created + ", logi: " + result.logs.created + ".", "success");
    } catch (error) {
      showToast(error.message || "Nie udało się wykonać migracji procedury.json.", "error");
    }
  } else if (action === "restore-backup") {
    const selected = state.backups.items.find(function (backup) { return backup.id === id; });
    const accepted = window.confirm("Odzyskać kopię „" + (selected ? selected.name : "zapasową") + "”? Bieżące procedury zostaną zastąpione jej stanem. Operacji nie można cofnąć automatycznie.");
    if (!accepted) return;
    try {
      const result = await restoreBackup(id);
      showToast("Odzyskano kopię: dodano " + result.created + ", zmieniono " + result.updated + ", usunięto " + result.deleted + ".", "success");
    } catch (error) {
      showToast(error.message || "Nie udało się odzyskać kopii zapasowej.", "error");
    }
  } else if (action === "toggle-lock") {
    if (state.editMode) {
      try {
        await lock();
        showToast("Administrator został wylogowany.", "success");
      } catch (error) {
        showToast(error.message || "Nie udało się wylogować administratora.", "error");
      }
    } else setModal({ type: "admin-login" });
  } else if (action === "open-admin-login") {
    setModal({ type: "admin-login" });
  } else if (action === "add-procedure") {
    if (!state.editMode) {
      setModal({ type: "admin-login" });
      return;
    }
    setPalette(false);
    procedureFocus = null;
    procedureAutosaveFingerprint = "";
    setModal({ type: "edit", id: "" });
  } else if (action === "edit-procedure") {
    if (state.editMode) {
      procedureFocus = null;
      procedureAutosaveFingerprint = "";
      setModal({ type: "edit", id: id });
    }
    else setModal({ type: "admin-login" });
  } else if (action === "confirm-delete") {
    if (canDeleteProcedures()) setModal({ type: "delete", id: id });
    else if (state.editMode) showToast("Usuwanie procedur jest dostępne tylko dla roli admin.", "error");
    else setModal({ type: "admin-login" });
  } else if (action === "delete-procedure") {
    if (!canDeleteProcedures()) {
      setModal(null);
      showToast("Usuwanie procedur jest dostępne tylko dla roli admin.", "error");
      return;
    }
    const removed = findProcedure(id);
    try {
      if (removed && await removeProcedure(id)) {
      state.view = { name: "department", dept: removed.dept || "go" };
      state.modal = { type: "saved" };
      notify();
      showToast("Procedura została usunięta w Firestore.", "success");
      }
    } catch (error) {
      showToast(error.message || "Nie udało się usunąć procedury.", "error");
    }
  } else if (action === "close-modal") {
    clearTimeout(procedureAutosaveTimer);
    procedureFocus = null;
    setModal(null);
  } else if (action.indexOf("step-") === 0) {
    handleStepEditorAction(action, element);
  } else if (action === "copy-procedure") {
    const procedure = findProcedure(id);
    const copied = procedure && await copyText(procedureText(procedure));
    showToast(copied ? "Skopiowano procedurę do schowka." : "Nie udało się skopiować procedury.", copied ? "success" : "error");
  } else if (action === "open-issue-confirmation") {
    if (findProcedure(id)) setModal({ type: "issue-confirmation", id: id });
    else showToast("Nie znaleziono procedury do potwierdzenia.", "error");
  } else if (action === "go-back") {
    navigate(state.lastBrowseView.name === "procedure" ? { name: "dashboard" } : state.lastBrowseView);
  } else if (action === "open-teleprompter") {
    setTeleprompter({ id: id, playing: false, speed: 24, fontSize: 30, progress: 0 });
  } else if (action === "close-teleprompter") {
    setTeleprompter(null);
  } else if (action === "toggle-teleprompter-play") {
    state.teleprompter.playing = !state.teleprompter.playing;
    notify();
  } else if (action.indexOf("teleprompter-") === 0 && state.teleprompter) {
    if (action === "teleprompter-font-up") state.teleprompter.fontSize = Math.min(58, state.teleprompter.fontSize + 2);
    if (action === "teleprompter-font-down") state.teleprompter.fontSize = Math.max(18, state.teleprompter.fontSize - 2);
    if (action === "teleprompter-speed-up") state.teleprompter.speed = Math.min(90, state.teleprompter.speed + 6);
    if (action === "teleprompter-speed-down") state.teleprompter.speed = Math.max(6, state.teleprompter.speed - 6);
    notify();
  }
});

app.addEventListener("input", function (event) {
  if (event.target.id === "palette-input") {
    setPalette(true, event.target.value, event.target.selectionStart, event.target.selectionEnd);
    return;
  }
  const form = event.target.closest("#procedure-form[data-form='procedure']");
  if (form) {
    rememberProcedureFocus(event.target);
    scheduleProcedureAutosave(form);
  }
});

app.addEventListener("change", async function (event) {
  if (event.target.id === "import-procedures-file") {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const accepted = window.confirm("Zaimportować procedury z pliku „" + file.name + "”? Nowe procedury zostaną dodane, a zmienione zaktualizowane.");
      if (!accepted) return;
      const result = await importProceduresFromJson(payload);
      showToast("Import zakończony: dodano " + result.created + ", zmieniono " + result.updated + ", pominięto " + result.skipped + ".", "success");
    } catch (error) {
      showToast(error.message || "Nie udało się zaimportować pliku JSON.", "error");
    } finally {
      event.target.value = "";
    }
    return;
  }
  const form = event.target.closest("#procedure-form[data-form='procedure']");
  if (form) {
    rememberProcedureFocus(event.target);
    scheduleProcedureAutosave(form);
  }
});

app.addEventListener("submit", async function (event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  if (form.dataset.form === "procedure") {
    try {
      clearTimeout(procedureAutosaveTimer);
      if (procedureAutosavePromise) await procedureAutosavePromise;
      const fields = procedureFieldsFromForm(form);
      const id = String(formData.get("id") || "");
      const fingerprint = procedureFingerprint(fields);
      const saved = id && fingerprint === procedureAutosaveFingerprint
        ? findProcedure(id)
        : await addOrUpdateProcedure(fields, id);
      if (!saved) throw new Error("Nie znaleziono procedury do edycji.");
      procedureAutosaveFingerprint = fingerprint;
      state.view = state.view.name === "admin" ? { name: "admin" } : { name: "department", dept: saved.dept };
      state.lastBrowseView = state.view;
      state.modal = { type: "saved" };
      notify();
      showToast("Zmiany zapisano w Firestore.", "success");
    } catch (error) {
      showToast(error.message || "Nie udało się zapisać procedury.", "error");
    }
  }
  if (form.dataset.form === "admin-login") {
    try {
      await unlock(String(formData.get("email") || ""), String(formData.get("password") || ""));
      setModal(null);
      navigate({ name: "admin" });
      showToast("Zalogowano administratora.", "success");
    } catch (error) {
      showToast(error.message || "Nie udało się zalogować administratora.", "error");
      const input = document.getElementById("admin-password");
      if (input) input.select();
    }
  }
  if (form.dataset.form === "issue-confirmation") {
    const procedure = findProcedure(String(formData.get("id") || ""));
    const output = event.submitter && event.submitter.dataset.format || "png";
    try {
      if (!procedure) throw new Error("Nie znaleziono procedury do potwierdzenia.");
      if (output === "clipboard") {
        await copyIssueConfirmationToClipboard(formData.get("document-number"), formData.get("issued-by"), procedure.title);
        showToast("Skopiowano potwierdzenie wydania jako obraz PNG.", "success");
      } else {
        const format = output === "jpeg" ? "jpeg" : "png";
        await downloadIssueConfirmation(formData.get("document-number"), formData.get("issued-by"), procedure.title, format);
        showToast("Pobrano potwierdzenie wydania w formacie " + (format === "jpeg" ? "JPG" : "PNG") + ".", "success");
      }
    } catch (error) {
      showToast(error.message || "Nie udało się wygenerować potwierdzenia.", "error");
    }
  }
});

document.addEventListener("keydown", function (event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    setPalette(true, state.palette.query);
    return;
  }
  if (event.key === "Escape") {
    if (closeOverlays()) event.preventDefault();
    return;
  }
  const input = event.target.closest("input, textarea, select");
  if (state.teleprompter && !input && event.key === " ") {
    event.preventDefault();
    state.teleprompter.playing = !state.teleprompter.playing;
    notify();
  }
});

subscribe(render);
initialize();
render();
loadData();
