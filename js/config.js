export const DATA_FILE = "./procedury.json";
export const GITHUB_REPO = "Centek1994/state-capitol-procedury";
export const GITHUB_BRANCH = "main";
export const EDIT_HASH = "8402860947e2986a67bc7b8c6fbd68760688f778f2f4c366c9bcd8dba903c590";

export const DEPARTMENTS = [
  { id: "go", name: "Governor's Office", group: "civic", short: "GO" },
  { id: "dmv", name: "Department of Motor Vehicles", group: "civic", short: "DMV" },
  { id: "irs", name: "Internal Revenue Services", group: "civic", short: "IRS" },
  { id: "hhs", name: "Health and Human Services", group: "civic", short: "HHS" },
  { id: "oag", name: "Office of the Attorney General", group: "legal", short: "OAG" },
  { id: "irsci", name: "IRS Criminal Investigation", group: "legal", short: "IRSCI" },
  { id: "mec", name: "Dept. of Medical Examiner-Coroner", group: "legal", short: "MEC" },
  { id: "sb", name: "State Bar", group: "legal", short: "SB" },
  { id: "sup", name: "Supreme Court", group: "legal", short: "SC" }
];

export const DEPARTMENT_NOTE = "Każdy pracownik State Capitolu, także działów prawno-śledczych, wykonuje zadania związane z działami obywatelskimi.";

export const ORGANIZATION = {
  civic: "Director oraz Deputy Director konkretnego działu.",
  legal: [
    "Attorney General oraz Chief Deputy Attorney General — Office of the Attorney General",
    "Director (IRS) oraz Deputy Director (IRS) — IRS Criminal Investigation",
    "President oraz Secretary — State Bar",
    "Chief Justice — Supreme Court"
  ]
};
