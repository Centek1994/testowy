const paths = {
  dashboard: "<rect x='3' y='3' width='7' height='7' rx='1'/><rect x='14' y='3' width='7' height='7' rx='1'/><rect x='3' y='14' width='7' height='7' rx='1'/><rect x='14' y='14' width='7' height='7' rx='1'/>",
  search: "<circle cx='11' cy='11' r='6.5'/><path d='m16 16 4.2 4.2'/>",
  command: "<path d='M5 7.5h14M5 12h8M5 16.5h11'/><path d='m16 14 3 2.5-3 2.5'/>",
  star: "<path d='m12 3 2.75 5.57 6.15.9-4.45 4.34 1.05 6.13L12 17.05l-5.5 2.89 1.05-6.13L3.1 9.47l6.15-.9z'/>",
  clock: "<circle cx='12' cy='12' r='8.5'/><path d='M12 7v5l3.3 2'/>",
  activity: "<path d='M3 12h3.4l2.1-5.3 4.1 10.6 2.1-5.3H21'/>",
  building: "<path d='M3 21h18M5 21V10l7-6 7 6v11M9 21v-5h6v5M3 10h18'/>",
  menu: "<path d='M4 7h16M4 12h16M4 17h16'/>",
  panel: "<rect x='3' y='4' width='18' height='16' rx='2'/><path d='M9 4v16'/>",
  settings: "<circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20.3h-3v-.08A1.7 1.7 0 0 0 10.68 18.66a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 15a1.7 1.7 0 0 0-1.56-1.03H5.4v-3h.06A1.7 1.7 0 0 0 7.02 9.94 1.7 1.7 0 0 0 6.68 8.06L6.62 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V4.65h3v.07a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 8l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.07v3h-.07A1.7 1.7 0 0 0 19.4 15Z'/> ",
  sun: "<circle cx='12' cy='12' r='3.5'/><path d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41'/>",
  moon: "<path d='M20.5 14.1A8.7 8.7 0 0 1 9.9 3.5 8.7 8.7 0 1 0 20.5 14.1Z'/>",
  refresh: "<path d='M20 11a8 8 0 0 0-14.7-4.4L3 9'/><path d='M3 4v5h5M4 13a8 8 0 0 0 14.7 4.4L21 15'/><path d='M21 20v-5h-5'/>",
  lock: "<rect x='5' y='10' width='14' height='11' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/>",
  unlock: "<rect x='5' y='10' width='14' height='11' rx='2'/><path d='M16 10V7a4 4 0 0 0-7.7-2.3'/>",
  plus: "<path d='M12 5v14M5 12h14'/>",
  chevron: "<path d='m9 18 6-6-6-6'/>",
  arrowLeft: "<path d='m14 6-6 6 6 6M8 12h12'/>",
  copy: "<rect x='8' y='8' width='11' height='12' rx='2'/><path d='M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2'/>",
  print: "<path d='M6 9V4h12v5M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'/><path d='M6 14h12v6H6z'/>",
  mic: "<rect x='9' y='3' width='6' height='11' rx='3'/><path d='M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8'/>",
  external: "<path d='M14 4h6v6M20 4l-9 9'/><path d='M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5'/>",
  close: "<path d='m6 6 12 12M18 6 6 18'/>",
  play: "<path d='m8 5 10 7-10 7z' fill='currentColor' stroke='none'/>",
  pause: "<path d='M8 5v14M16 5v14'/>",
  trash: "<path d='M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3'/>",
  edit: "<path d='m4 20 4.1-1 10-10a2.2 2.2 0 0 0-3.1-3.1l-10 10L4 20Z'/><path d='m13.5 6.5 3 3'/>",
  check: "<path d='m5 12 4.2 4.2L19 6.5'/>",
  warning: "<path d='M12 3 2.8 20h18.4L12 3Z'/><path d='M12 9v4M12 17h.01'/>"
};

export function icon(name, size = 18, className = "") {
  const path = paths[name] || paths.warning;
  return "<svg class='icon " + className + "' width='" + size + "' height='" + size + "' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + path + "</svg>";
}
