// Shared DOM kit, icons and formatters. No criterion wording here: it all comes from the API.

export const CHANNEL = { "agent chat": "Чат", "voice call": "Звонок" };
export const WHO = { client: "Клиент", operator: "Оператор", bot: "Бот", system: "Система" };
export const TYPE = { binary: "Да / Нет", scale: "Шкала", flag: "Флаг без баллов" };
export const SUBTYPE_FALLBACK = "нарушение";

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

// Lucide-style outline icons (24 grid, stroke 2), one path string each.
const ICON_PATHS = {
  back: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
  upload: "M12 16V4m0 0l-5 5m5-5l5 5M4 20h16",
  download: "M12 4v12m0 0l-5-5m5 5l5-5M4 20h16",
  play: "M7 5l12 7-12 7z",
  plus: "M12 5v14M5 12h14",
  run: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  x: "M18 6L6 18M6 6l12 12",
  check: "M20 6L9 17l-5-5",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  search: "M21 21l-4.3-4.3M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0",
  overview: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  appeals: "M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1zM2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1zM7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2",
  checklist: "M3 17l2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8",
  panel: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 3v18",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  database: "M3 5a9 3 0 1 0 18 0a9 3 0 1 0-18 0M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0",
  alert: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
};
export function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", ICON_PATHS[name]);
  svg.append(p);
  return svg;
}

export const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 }));
export const usd = (n) => (n == null ? "—" : `$${Number(n).toFixed(n < 0.1 ? 4 : 2)}`);

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { return null; }
}

export function errorText(data, status) {
  const d = data && data.detail;
  if (Array.isArray(d)) return d.map((x) => String(x.msg || x).replace(/^Value error, /, "")).join("; ");
  return d || `Ошибка сервера (HTTP ${status})`;
}

// Native <dialog>: focus trap, Esc and backdrop come from the platform.
export function dialog(root, title, ...body) {
  const dlg = h("dialog", { class: "cqa-dialog", "aria-label": title, onclose: () => dlg.remove(),
    onclick: (e) => { if (e.target === dlg) dlg.close(); } },
  h("div", { class: "cqa-dialog-head" }, h("h2", null, title),
    h("button", { class: "cqa-icon-btn", type: "button", "aria-label": "Закрыть", onclick: () => dlg.close() }, icon("x"))),
  h("div", { class: "cqa-dialog-body" }, body));
  root.append(dlg);
  dlg.showModal();
  return dlg;
}

// One transcript line, messenger-style: client and bot on the left, the evaluated operator on the right,
// system notes centred. Shared by the card and the appeal fragment so speakers look the same everywhere.
export function message(m, time, ...notes) {
  const who = WHO[m.speaker] || m.speaker;
  return h("div", { class: `cqa-msg cqa-msg-${m.speaker}${m.internal ? " cqa-msg-internal" : ""}`, id: `cqa-${m.id}` },
    m.speaker === "system" ? null : h("span", { class: "cqa-avatar", "aria-hidden": "true" }, who[0]),
    h("div", { class: "cqa-bubble" },
      h("div", { class: "cqa-msg-head" },
        h("span", { class: "cqa-msg-who" }, who), h("span", { class: "cqa-msg-time" }, time), h("span", { class: "cqa-msg-id" }, m.id), notes),
      h("div", { class: "cqa-msg-text" }, m.text)));
}

// "<70 / 70–90 / 90+" tone shared by score bars and numbers; always shown next to the number itself.
export const tone = (total) => (total == null ? "none" : total < 70 ? "bad" : total < 90 ? "warn" : "ok");
