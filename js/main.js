import { DEPARTMENTS, DEPARTMENT_NOTE, ORGANIZATION } from "./config.js";
import {
  applyTheme, departmentsWithCounts, favoriteProcedures, findProcedure, githubEditUrl, initialize,
  isFavorite, loadData, lock, navigate, openProcedure, procedureText, recentProcedures, removeProcedure,
  searchProcedures, serializedData, setMobileNav, setModal, setPalette, setSearch, setSidebarCompact,
  setTeleprompter, showToast, state, subscribe, toggleExpanded, toggleFavorite, unlock, addOrUpdateProcedure, notify
} from "./core/store.js";
import { icon } from "./ui/icons.js";
import {
  button, departmentTag, emptyState, escapeHtml, iconButton, procedureCard, procedureDetail
} from "./ui/templates.js";

const app = document.getElementById("app");
let teleprompterFrame = 0;
let previousTitle = document.title;

function activeView(name, department) {
  return state.view.name === name && (!department || state.view.dept === department);
}

function navButton(label, iconName, view, options = {}) {
  const active = activeView(view, options.dept);
  const data = options.dept ? "data-dept='" + escapeHtml(options.dept) + "'" : "";
  const count = typeof options.count === "number" ? "<span class='side-nav__count'>" + options.count + "</span>" : "";
  return "<button type='button' class='side-nav__item " + (active ? "is-active" : "") + "' data-action='navigate' data-view='" + view + "' " + data + " title='" + escapeHtml(label) + "'>" +
    icon(iconName, 17) + "<span class='side-nav__item-text'>" + escapeHtml(label) + "</span>" + count + "</button>";
}

function sidebar() {
  const departments = departmentsWithCounts();
  const civic = departments.filter(function (department) { return department.group === "civic"; });
  const legal = departments.filter(function (department) { return department.group === "legal"; });
  return "<aside class='sidebar' aria-label='Nawigacja główna'>" +
    "<div class='sidebar__brand'><div class='brand-mark'>" + icon("building", 18) + "</div><div class='brand-copy'><strong>State Capitol</strong><span>Centrum procedur</span></div></div>" +
    "<div class='sidebar__section'><div class='side-nav'>" +
      navButton("Dashboard", "dashboard", "dashboard") +
      navButton("Ulubione", "star", "favorites", { count: state.favoriteIds.size }) +
      navButton("Ostatnio używane", "clock", "recents", { count: state.recentIds.length }) +
      navButton("Aktualizacje", "activity", "activity", { count: state.data.log.length }) +
      navButton("Struktura urzędu", "building", "organization") +
    "</div></div>" +
    "<div class='sidebar__section'><div class='sidebar__label'>Działy</div><div class='side-nav'>" +
      "<div class='side-nav__group'>Obywatelskie</div>" +
      civic.map(function (department) { return navButton(department.name, "building", "department", { dept: department.id, count: department.count }); }).join("") +
      "<div class='side-nav__group'>Prawno-śledcze</div>" +
      legal.map(function (department) { return navButton(department.name, "building", "department", { dept: department.id, count: department.count }); }).join("") +
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
    favorites: ["Twoja przestrzeń", "Ulubione"],
    recents: ["Twoja przestrzeń", "Ostatnio używane"],
    activity: ["Rejestr zmian", "Aktualizacje"],
    organization: ["State Capitol", "Struktura urzędu"],
    search: ["Wyszukiwanie", state.query ? "Wyniki wyszukiwania" : "Szukaj procedur"]
  }[state.view.name] || ["State Capitol", "Centrum procedur"];
  return { crumb: meta[0], title: meta[1] };
}

function topbar() {
  const meta = viewMeta();
  const modeLabel = state.editMode ? "Zablokuj edycję" : "Odblokuj edycję";
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
      (state.editMode ? button("Dodaj", "add-procedure", { icon: "plus", variant: "primary" }) : "") +
    "</div></header>";
}

function quickProcedure(procedure, showDepartment = true) {
  const department = departmentsWithCounts().find(function (item) { return item.id === procedure.dept; });
  return "<button type='button' class='quick-procedure' data-action='open-procedure' data-id='" + escapeHtml(procedure.id) + "'>" +
    "<span class='quick-procedure__icon'>" + icon("command", 17) + "</span><span class='quick-procedure__copy'><strong>" + escapeHtml(procedure.title) + "</strong><span>" + (showDepartment && department ? escapeHtml(department.name) : escapeHtml(procedure.exec || "Procedura")) + "</span></span>" +
    icon("chevron", 16, "quick-procedure__chevron") + "</button>";
}

function dashboardView() {
  const departments = departmentsWithCounts();
  const recents = recentProcedures();
  const favorites = favoriteProcedures().slice(0, 5);
  const latest = state.data.log.slice(0, 5);
  const lastUpdated = latest[0] ? latest[0].date : "brak wpisów";
  return "<section class='dashboard-view'>" +
    "<div class='page-hero'><div><div class='eyebrow'>State Capitol / operacje</div><h1>Wszystkie procedury,<br><em>zawsze pod ręką.</em></h1><p>Przejrzysta baza wiedzy dla zespołu State Capitol. Otwieraj, kopiuj, drukuj i prowadź ceremonie bez szukania po wiadomościach.</p><div class='page-hero__actions'>" +
      button("Otwórz wyszukiwarkę", "open-palette", { icon: "search", variant: "primary" }) +
      button("Przeglądaj działy", "navigate", { icon: "building", extra: "data-view='department' data-dept='go'" }) +
    "</div></div><div class='hero-orbit'><div class='hero-orbit__core'>" + icon("building", 30) + "<span>SC</span></div><i></i><b></b></div></div>" +
    "<div class='stat-grid'>" +
      statCard(String(state.data.procedures.length), "aktywnych procedur", "command", "brand") +
      statCard(String(state.favoriteIds.size), "ulubionych procedur", "star", "gold") +
      statCard(String(state.recentIds.length), "ostatnio używanych", "clock", "teal") +
      statCard(lastUpdated, "ostatnia aktualizacja", "activity", "muted") +
    "</div>" +
    "<div class='dashboard-grid'><section class='dashboard-panel dashboard-panel--wide'><div class='panel-heading'><div><span class='section-label'>Kontynuuj pracę</span><h2>Ostatnio używane</h2></div>" + button("Zobacz wszystkie", "navigate", { small: true, variant: "ghost", extra: "data-view='recents'" }) + "</div>" +
      (recents.length ? "<div class='quick-procedure-list'>" + recents.slice(0, 5).map(function (procedure) { return quickProcedure(procedure); }).join("") + "</div>" : emptyInline("Nie otwarto jeszcze żadnej procedury.", "Otwórz wyszukiwarkę", "open-palette")) +
    "</section><section class='dashboard-panel'><div class='panel-heading'><div><span class='section-label'>Skróty</span><h2>Twoje ulubione</h2></div>" + button("Wszystkie", "navigate", { small: true, variant: "ghost", extra: "data-view='favorites'" }) + "</div>" +
      (favorites.length ? "<div class='quick-procedure-list'>" + favorites.map(function (procedure) { return quickProcedure(procedure); }).join("") + "</div>" : emptyInline("Oznacz gwiazdką procedury, których używasz najczęściej.", "", "")) +
    "</section></div>" +
    "<section class='dashboard-panel'><div class='panel-heading'><div><span class='section-label'>Mapa wiedzy</span><h2>Działy i procedury</h2></div></div><div class='department-grid'>" +
      departments.map(function (department) {
        return "<button type='button' class='department-tile " + (department.group === "legal" ? "is-legal" : "") + "' data-action='navigate' data-view='department' data-dept='" + escapeHtml(department.id) + "'><span>" + escapeHtml(department.short) + "</span><strong>" + escapeHtml(department.name) + "</strong><b>" + department.count + "</b></button>";
      }).join("") +
    "</div></section>" +
    "<section class='dashboard-panel'><div class='panel-heading'><div><span class='section-label'>Rejestr</span><h2>Ostatnie aktualizacje</h2></div>" + button("Pełny rejestr", "navigate", { small: true, variant: "ghost", extra: "data-view='activity'" }) + "</div>" +
      (latest.length ? "<div class='activity-list'>" + latest.map(activityItem).join("") + "</div>" : emptyInline("Brak wpisów w rejestrze zmian.", "", "")) +
    "</section></section>";
}

function statCard(value, label, iconName, tone) {
  return "<div class='stat-card stat-card--" + tone + "'><span class='stat-card__icon'>" + icon(iconName, 17) + "</span><div><strong>" + escapeHtml(value) + "</strong><span>" + escapeHtml(label) + "</span></div></div>";
}

function emptyInline(text, actionLabel, action) {
  return "<div class='inline-empty'><span>" + icon("clock", 17) + "</span><p>" + escapeHtml(text) + "</p>" + (action ? button(actionLabel, action, { small: true }) : "") + "</div>";
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
  return "<section class='list-view'><header class='view-heading'><div><div class='eyebrow'>Wyszukiwanie</div><h1>Wyniki dla „" + escapeHtml(state.query) + "”</h1><p>" + results.length + " " + (results.length === 1 ? "dopasowanie" : "dopasowań") + " w tytułach, krokach, uwagach i działach.</p></div>" + button("Zmień zapytanie", "open-palette", { icon: "search" }) + "</header>" +
    (results.length ? "<div class='procedure-list'>" + results.map(function (procedure) {
      return procedureCard(procedure, { showDepartment: true, expanded: state.expanded.has(procedure.id) });
    }).join("") : emptyState("Brak wyników", "Spróbuj krótszej frazy lub wyszukaj po nazwie działu.", "search", button("Wyczyść wyszukiwanie", "clear-search", { icon: "close" }))) +
    "</section>";
}

function activityItem(entry) {
  const type = entry.type === "add" ? "Dodano" : entry.type === "del" ? "Usunięto" : "Zmieniono";
  const className = entry.type === "add" ? "activity-item--add" : entry.type === "del" ? "activity-item--del" : "activity-item--mod";
  return "<div class='activity-item " + className + "'><span class='activity-item__type'>" + escapeHtml(type) + "</span><span class='activity-item__date'>" + escapeHtml(entry.date || "—") + "</span><span>" + escapeHtml(entry.text || "") + "</span></div>";
}

function activityView() {
  return "<section class='list-view'><header class='view-heading'><div><div class='eyebrow'>Rejestr zmian</div><h1>Aktualizacje</h1><p>Historia zmian opublikowanych w pliku procedur.</p></div></header>" +
    (state.data.log.length ? "<div class='activity-list activity-list--full'>" + state.data.log.map(activityItem).join("") + "</div>" : emptyState("Brak wpisów", "Zmiany w procedurach pojawią się tutaj automatycznie.", "activity")) +
    "</section>";
}

function organizationView() {
  return "<section class='organization-view'><header class='view-heading'><div><div class='eyebrow'>State Capitol</div><h1>Struktura urzędu</h1><p>Podział odpowiedzialności między zespołami obywatelskimi i prawno-śledczymi.</p></div></header>" +
    "<div class='organization-grid'><article class='organization-card'><div class='organization-card__icon'>" + icon("building", 20) + "</div><span class='section-label'>Działy obywatelskie</span><h2>Wspólna odpowiedzialność</h2><p>" + escapeHtml(DEPARTMENT_NOTE) + "</p><div class='organization-card__rule'><span>Osoby odpowiedzialne</span><b>" + escapeHtml(ORGANIZATION.civic) + "</b></div></article>" +
    "<article class='organization-card organization-card--legal'><div class='organization-card__icon'>" + icon("lock", 20) + "</div><span class='section-label'>Działy prawno-śledcze</span><h2>Zakres kompetencji</h2><p>Role odpowiedzialne za procedury prawno-śledcze w poszczególnych jednostkach.</p><ul>" + ORGANIZATION.legal.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul></article></div></section>";
}

function mainView() {
  if (state.status === "loading") return "<section class='loading-view'><div class='loading-mark'>" + icon("building", 24) + "</div><h1>Ładowanie rejestru</h1><p>Pobieram najnowszą wersję procedur…</p></section>";
  if (state.status === "error") return emptyState("Nie udało się wczytać rejestru", "Upewnij się, że aplikacja jest uruchomiona przez serwer HTTP oraz że procedury.json znajduje się obok app.html.", "warning", button("Spróbuj ponownie", "refresh-data", { icon: "refresh", variant: "primary" }));
  if (state.view.name === "dashboard") return dashboardView();
  if (state.view.name === "department") return departmentView();
  if (state.view.name === "favorites") return titledListView("Ulubione", "Twoja przestrzeń", favoriteProcedures(), "Brak ulubionych", "Oznacz gwiazdką procedury, które chcesz mieć zawsze pod ręką.");
  if (state.view.name === "recents") return titledListView("Ostatnio używane", "Twoja przestrzeń", recentProcedures(), "Brak ostatnio używanych", "Otwórz procedurę, a pojawi się w tej sekcji.");
  if (state.view.name === "activity") return activityView();
  if (state.view.name === "organization") return organizationView();
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
  const commands = [
    { label: "Przejdź do dashboardu", meta: "Widok główny", icon: "dashboard", action: "palette-navigate", view: "dashboard" },
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
    (query.trim() ? "<div class='palette__label'>Procedury</div>" + (resultHtml || "<div class='palette__empty'>Nie znaleziono procedur dla tego zapytania.</div>") : "<div class='palette__label'>Polecenia</div>" + commandHtml + "<div class='palette__label'>Podpowiedź</div><div class='palette__empty'>Wpisz fragment tytułu, działu, kroku albo uwagi procedury.</div>") +
    "</div></section></div>";
}

function modal() {
  if (!state.modal) return "";
  if (state.modal.type === "edit") return editModal(state.modal.id);
  if (state.modal.type === "delete") return deleteModal(state.modal.id);
  if (state.modal.type === "github") return githubModal();
  if (state.modal.type === "password") return passwordModal();
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

function editModal(id) {
  const procedure = id ? findProcedure(id) : null;
  const title = procedure ? "Edytuj procedurę" : "Dodaj procedurę";
  const values = procedure || { title: "", dept: state.view.name === "department" ? state.view.dept : "go", exec: "wszystkie działy State Capitol", steps: [], notes: "" };
  const body = "<form id='procedure-form' class='form-grid' data-form='procedure'><input type='hidden' name='id' value='" + escapeHtml(procedure ? procedure.id : "") + "'><div class='field'><label for='form-title'>Nazwa procedury</label><input id='form-title' required name='title' value='" + escapeHtml(values.title) + "' placeholder='Np. Wydanie dokumentu tożsamości'></div><div class='field'><label for='form-dept'>Dział zarządzający</label><select id='form-dept' name='dept'>" + departmentOptions(values.dept) + "</select></div><div class='field'><label for='form-exec'>Działy wykonujące</label><input id='form-exec' name='exec' value='" + escapeHtml(values.exec || "") + "'></div><div class='field'><label for='form-steps'>Kroki procedury</label><textarea id='form-steps' name='steps' placeholder='Jeden krok w każdej linii'>" + escapeHtml((values.steps || []).join("\n")) + "</textarea><span class='field__hint'>Każda linia zostanie jednym krokiem. Numerację można pominąć.</span></div><div class='field'><label for='form-notes'>Uwagi i przepisy</label><textarea id='form-notes' name='notes' placeholder='Informacje dodatkowe, opłaty i akty prawne'>" + escapeHtml(values.notes || "") + "</textarea></div></form>";
  return modalShell(title, body, button("Anuluj", "close-modal", { variant: "ghost" }) + "<button class='button button--primary' type='submit' form='procedure-form'>" + icon("check", 15) + "<span>Zapisz i przygotuj JSON</span></button>");
}

function deleteModal(id) {
  const procedure = findProcedure(id);
  const body = "<p>Usunięcie zostanie zastosowane w bieżącej sesji. Aby opublikować zmianę, skopiuj wygenerowany JSON i zatwierdź go na GitHubie.</p><div class='modal__notice'><b>Do usunięcia:</b> " + escapeHtml(procedure ? procedure.title : "Nieznana procedura") + "</div>";
  return modalShell("Usunąć procedurę?", body, button("Anuluj", "close-modal", { variant: "ghost" }) + button("Usuń procedurę", "delete-procedure", { id: id, icon: "trash", variant: "danger" }), true);
}

function githubModal() {
  const body = "<p class='modal-copy'>Zmiany są gotowe. Skopiuj poniższą zawartość, otwórz plik <b>procedury.json</b> na GitHubie, zastąp całą jego treść i wybierz <b>Commit changes</b>.</p><div class='field'><label for='github-json'>Zaktualizowany procedury.json</label><textarea id='github-json' class='code-area' readonly>" + escapeHtml(serializedData()) + "</textarea></div>";
  const footer = button("Zamknij", "close-modal", { variant: "ghost" }) + button("Kopiuj JSON", "copy-json", { icon: "copy" }) + "<a class='button button--primary' href='" + escapeHtml(githubEditUrl()) + "' target='_blank' rel='noopener noreferrer'>" + icon("external", 15) + "<span>Otwórz GitHub</span></a>";
  return modalShell("Opublikuj zmiany", body, footer, false, "Aplikacja nie zapisuje pliku bezpośrednio na serwerze.");
}

function passwordModal() {
  const body = "<form id='password-form' class='form-grid' data-form='password'><p class='modal-copy'>Dodawanie, edycja i usuwanie procedur wymaga autoryzacji.</p><div class='field'><label for='edit-password'>Hasło</label><input id='edit-password' required type='password' name='password' autocomplete='current-password' placeholder='Wpisz hasło'><span class='field__hint'>Autoryzacja jest zapisywana lokalnie w tej przeglądarce.</span></div></form>";
  return modalShell("Tryb edycji", body, button("Anuluj", "close-modal", { variant: "ghost" }) + "<button class='button button--primary' type='submit' form='password-form'>" + icon("unlock", 15) + "<span>Odblokuj</span></button>", true);
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
      if (input) input.focus();
    }, 0);
  }
  if (state.modal && state.modal.type === "edit") {
    window.setTimeout(function () {
      const input = document.getElementById("form-title");
      if (input) input.focus();
    }, 0);
  }
  if (state.modal && state.modal.type === "password") {
    window.setTimeout(function () {
      const input = document.getElementById("edit-password");
      if (input) input.focus();
    }, 0);
  }
  activateTeleprompter();
}

function activateTeleprompter() {
  cancelAnimationFrame(teleprompterFrame);
  if (!state.teleprompter || !state.teleprompter.playing) return;
  const scroll = document.getElementById("teleprompter-scroll");
  if (!scroll) return;
  let lastTime = performance.now();
  const tick = function (time) {
    if (!state.teleprompter || !state.teleprompter.playing) return;
    const elapsed = (time - lastTime) / 1000;
    lastTime = time;
    const maxScroll = Math.max(1, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = Math.min(maxScroll, scroll.scrollTop + state.teleprompter.speed * elapsed);
    state.teleprompter.progress = scroll.scrollTop / maxScroll;
    const progress = document.querySelector(".teleprompter__progress i");
    if (progress) progress.style.width = String(Math.round(state.teleprompter.progress * 100)) + "%";
    if (scroll.scrollTop >= maxScroll) {
      state.teleprompter.playing = false;
      notify();
      return;
    }
    teleprompterFrame = requestAnimationFrame(tick);
  };
  teleprompterFrame = requestAnimationFrame(tick);
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
    navigate(element.dataset.dept ? { name: "department", dept: element.dataset.dept } : { name: element.dataset.view });
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
  } else if (action === "toggle-lock") {
    if (state.editMode) {
      lock();
      showToast("Tryb edycji został zablokowany.", "success");
    } else setModal({ type: "password" });
  } else if (action === "add-procedure") {
    setPalette(false);
    setModal({ type: "edit", id: "" });
  } else if (action === "edit-procedure") {
    setModal({ type: "edit", id: id });
  } else if (action === "confirm-delete") {
    setModal({ type: "delete", id: id });
  } else if (action === "delete-procedure") {
    const removed = findProcedure(id);
    if (removed && removeProcedure(id)) {
      state.view = { name: "department", dept: removed.dept || "go" };
      state.modal = { type: "github" };
      notify();
      showToast("Procedura została usunięta. Przygotowano JSON.", "success");
    }
  } else if (action === "close-modal") {
    setModal(null);
  } else if (action === "copy-procedure") {
    const procedure = findProcedure(id);
    const copied = procedure && await copyText(procedureText(procedure));
    showToast(copied ? "Skopiowano procedurę do schowka." : "Nie udało się skopiować procedury.", copied ? "success" : "error");
  } else if (action === "copy-json") {
    const copied = await copyText(serializedData());
    showToast(copied ? "Skopiowano JSON do schowka." : "Nie udało się skopiować JSON-a.", copied ? "success" : "error");
  } else if (action === "print-procedure") {
    window.print();
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
    setPalette(true, event.target.value);
  }
});

app.addEventListener("submit", async function (event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  if (form.dataset.form === "procedure") {
    try {
      const saved = addOrUpdateProcedure(Object.fromEntries(formData.entries()), formData.get("id"));
      state.view = { name: "department", dept: saved.dept };
      state.lastBrowseView = state.view;
      state.modal = { type: "github" };
      notify();
      showToast("Zmiany przygotowano do publikacji.", "success");
    } catch (error) {
      showToast(error.message || "Nie udało się zapisać procedury.", "error");
    }
  }
  if (form.dataset.form === "password") {
    const valid = await unlock(String(formData.get("password") || ""));
    if (valid) {
      setModal(null);
      showToast("Tryb edycji został odblokowany.", "success");
    } else {
      showToast("Nieprawidłowe hasło.", "error");
      const input = document.getElementById("edit-password");
      if (input) input.select();
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
