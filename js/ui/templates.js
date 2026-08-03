import { icon } from "./icons.js";
import { canDeleteProcedures, departmentFor, isFavorite, state } from "../core/store.js";

export function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

export function linkify(value) {
  const text = escapeHtml(value);
  return text.replace(/(https?:\/\/[^\s<)]+)/g, function (match) {
    let url = match;
    let suffix = "";
    while (/[.,;:]$/.test(url)) {
      suffix = url.slice(-1) + suffix;
      url = url.slice(0, -1);
    }
    return "<a href='" + url + "' target='_blank' rel='noopener noreferrer'>" + url + "</a>" + suffix;
  });
}

export function button(label, action, options = {}) {
  const classes = ["button"];
  if (options.variant) classes.push("button--" + options.variant);
  if (options.small) classes.push("button--small");
  if (options.className) classes.push(options.className);
  const attributes = [
    "type='button'",
    "class='" + classes.join(" ") + "'",
    "data-action='" + action + "'"
  ];
  if (options.id) attributes.push("data-id='" + escapeHtml(options.id) + "'");
  if (options.extra) attributes.push(options.extra);
  if (options.disabled) attributes.push("disabled");
  const iconHtml = options.icon ? icon(options.icon, 15) : "";
  return "<button " + attributes.join(" ") + ">" + iconHtml + "<span>" + escapeHtml(label) + "</span></button>";
}

export function iconButton(label, action, options = {}) {
  const attributes = [
    "type='button'",
    "class='icon-button " + (options.className || "") + "'",
    "data-action='" + action + "'",
    "aria-label='" + escapeHtml(label) + "'",
    "title='" + escapeHtml(label) + "'"
  ];
  if (options.id) attributes.push("data-id='" + escapeHtml(options.id) + "'");
  if (options.extra) attributes.push(options.extra);
  return "<button " + attributes.join(" ") + ">" + icon(options.icon || "warning", options.size || 18) + "</button>";
}

export function departmentTag(department) {
  const className = department.group === "civic" ? "tag--civic" : department.group === "legal" ? "tag--legal" : "tag--brand";
  return "<span class='tag " + className + "'>" + escapeHtml(department.short || department.name) + "</span>";
}

export function emptyState(title, text, iconName = "search", actionHtml = "") {
  return "<section class='empty-state'><div><div class='empty-state__icon'>" + icon(iconName, 22) + "</div><h2>" + escapeHtml(title) + "</h2><p>" + escapeHtml(text) + "</p>" + (actionHtml ? "<div class='empty-state__actions'>" + actionHtml + "</div>" : "") + "</div></section>";
}

export function procedureSections(procedure) {
  const sections = [];
  if (procedure.steps && procedure.steps.length) {
    const steps = procedure.steps.map(function (step, index) {
      return "<li class='document-step'><span class='document-step__number'>" + String(index + 1).padStart(2, "0") + "</span><span>" + linkify(step) + "</span></li>";
    }).join("");
    sections.push("<section class='document-section'><div class='section-label'>Przebieg procedury</div><ol class='document-steps'>" + steps + "</ol></section>");
  }
  if (procedure.notes) {
    sections.push("<section class='document-section'><div class='section-label'>Uwagi i przepisy</div><div class='document-note'>" + linkify(procedure.notes) + "</div></section>");
  }
  if (!sections.length) {
    sections.push("<p class='document-empty'>Ta procedura nie ma jeszcze opisanych kroków ani uwag.</p>");
  }
  return sections.join("");
}

export function procedureActions(procedure, compact = false) {
  const favorite = isFavorite(procedure.id);
  const favoriteLabel = favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych";
  const favoriteClass = favorite ? "button--star is-on" : "button--star";
  const primary = compact
    ? button("Otwórz", "open-procedure", { id: procedure.id, small: true, icon: "chevron" })
    : "";
  const edit = state.editMode
    ? button("Edytuj", "edit-procedure", { id: procedure.id, small: true, icon: "edit", variant: "ghost" }) +
      (canDeleteProcedures() ? button("Usuń", "confirm-delete", { id: procedure.id, small: true, icon: "trash", variant: "danger" }) : "")
    : "";
  return "<div class='procedure-actions'>" +
    primary +
    "<button type='button' class='button button--small " + favoriteClass + "' data-action='toggle-favorite' data-id='" + escapeHtml(procedure.id) + "' aria-label='" + favoriteLabel + "' title='" + favoriteLabel + "'>" + icon("star", 15) + "</button>" +
    edit +
    "</div>";
}

export function procedureCard(procedure, options = {}) {
  const department = departmentFor(procedure.dept);
  const expanded = Boolean(options.expanded);
  const showDepartment = options.showDepartment !== false;
  const ceremony = /CEREMONI/i.test(procedure.notes || "");
  return "<article class='procedure-card " + (expanded ? "is-expanded" : "") + "'>" +
    "<div class='procedure-card__head'>" +
      "<button type='button' class='procedure-card__toggle' data-action='toggle-expanded' data-id='" + escapeHtml(procedure.id) + "' aria-expanded='" + expanded + "'>" +
        "<span class='procedure-card__sequence'>" + escapeHtml(procedure.id) + "</span>" +
        "<span class='procedure-card__title-wrap'><strong>" + escapeHtml(procedure.title) + "</strong><span>" + escapeHtml(procedure.exec || "Brak informacji o wykonawcy") + "</span></span>" +
        (showDepartment ? departmentTag(department) : "") +
        "<span class='procedure-card__chevron'>" + icon("chevron", 17) + "</span>" +
      "</button>" +
      "<button type='button' class='procedure-card__fav " + (isFavorite(procedure.id) ? "is-on" : "") + "' data-action='toggle-favorite' data-id='" + escapeHtml(procedure.id) + "' aria-label='" + (isFavorite(procedure.id) ? "Usuń z ulubionych" : "Dodaj do ulubionych") + "'>" + icon("star", 18) + "</button>" +
    "</div>" +
    (expanded ? "<div class='procedure-card__body'><div class='procedure-card__meta'><span><b>Dział</b>" + escapeHtml(department.name) + "</span><span><b>Wykonujący</b>" + escapeHtml(procedure.exec || "—") + "</span></div>" +
      procedureSections(procedure) +
      "<div class='procedure-card__footer'>" +
        (ceremony ? "<span class='tag tag--brand'>" + icon("mic", 12) + " Ceremonia</span>" : "") +
        procedureActions(procedure, true) +
      "</div></div>" : "") +
    "</article>";
}

export function procedureDetail(procedure) {
  const department = departmentFor(procedure.dept);
  const favorite = isFavorite(procedure.id);
  const ceremony = /CEREMONI/i.test(procedure.notes || "");
  const edit = state.editMode
    ? button("Edytuj", "edit-procedure", { id: procedure.id, icon: "edit", variant: "ghost" }) +
      (canDeleteProcedures() ? button("Usuń", "confirm-delete", { id: procedure.id, icon: "trash", variant: "danger" }) : "")
    : "";
  return "<div class='detail-page printable-procedure'>" +
    "<div class='detail-top no-print'>" + button("Wróć", "go-back", { icon: "arrowLeft", variant: "ghost" }) + "</div>" +
    "<header class='detail-hero'>" +
      "<div class='detail-hero__tags'>" + departmentTag(department) + (ceremony ? "<span class='tag tag--brand'>" + icon("mic", 12) + " Ceremonia</span>" : "") + "</div>" +
      "<h1>" + escapeHtml(procedure.title) + "</h1>" +
      "<p>" + escapeHtml(procedure.exec || "Brak informacji o działach wykonujących") + "</p>" +
      "<div class='detail-actions no-print'>" +
        "<button type='button' class='button " + (favorite ? "button--star is-on" : "button--star") + "' data-action='toggle-favorite' data-id='" + escapeHtml(procedure.id) + "'>" + icon("star", 15) + "<span>" + (favorite ? "Ulubiona" : "Ulubione") + "</span></button>" +
        button("Kopiuj", "copy-procedure", { id: procedure.id, icon: "copy" }) +
        button("Drukuj", "print-procedure", { id: procedure.id, icon: "print" }) +
        button("Sufler", "open-teleprompter", { id: procedure.id, icon: "mic", variant: "primary" }) +
        edit +
      "</div>" +
    "</header>" +
    "<article class='procedure-document'>" +
      "<div class='document-meta'><div><span>Dział zarządzający</span><b>" + escapeHtml(department.name) + "</b></div><div><span>Działy wykonujące</span><b>" + escapeHtml(procedure.exec || "—") + "</b></div><div><span>Identyfikator</span><b>" + escapeHtml(procedure.id) + "</b></div></div>" +
      procedureSections(procedure) +
    "</article></div>";
}
