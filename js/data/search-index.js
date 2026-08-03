import { DEPARTMENTS } from "../config.js";

const MAX_PREFIX_LENGTH = 32;
const MAX_PREFIXES = 1200;

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl-PL")
    .replace(/ł/g, "l");
}

export function searchTerms(value) {
  return normalizeSearchText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function departmentName(id) {
  const department = DEPARTMENTS.find(function (item) { return item.id === id; });
  return department ? department.name : id;
}

export function procedureSearchText(procedure) {
  return [
    procedure.title,
    procedure.dept,
    departmentName(procedure.dept),
    procedure.exec,
    procedure.notes
  ].concat(Array.isArray(procedure.steps) ? procedure.steps : []).join(" ");
}

export function buildSearchPrefixes(procedure) {
  const prefixes = new Set();
  searchTerms(procedureSearchText(procedure)).forEach(function (term) {
    if (prefixes.size >= MAX_PREFIXES) return;
    const end = Math.min(term.length, MAX_PREFIX_LENGTH);
    for (let length = 1; length <= end; length += 1) {
      prefixes.add(term.slice(0, length));
      if (prefixes.size >= MAX_PREFIXES) break;
    }
  });
  return Array.from(prefixes);
}
