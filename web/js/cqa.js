// CQA UI. Embeddable: mount(element, { apiBaseUrl }) — one root, cqa- classes, no globals.
// All criterion wording comes from the API (checklist versions); nothing about criteria lives here.
// Shell: fixed sidebar + top bar; only the content area scrolls, so switching screens never shifts the frame.
import { h, icon, usd, store, errorText } from "./ui.js";
import { viewList } from "./views/list.js";
import { viewOverview } from "./views/overview.js";
import { viewCard } from "./views/card.js";
import { viewAppeals } from "./views/appeals.js";
import { viewChecklist } from "./views/checklist.js";

const ROLES = [["specialist", "Специалист"], ["reviewer", "Проверяющий"]];
// Authors shown in the sidebar footer.
const TEAM = { name: "RdTX", members: ["Мусин Рустам", "Жусупов Даниал", "Болат Темірлан", "Шефер Владислав"] };

export function mount(root, config = {}) {
  const base = (config.apiBaseUrl || "").replace(/\/$/, "");
  const S = {
    role: store("cqa.role") || "specialist",
    group: store("cqa.group") || "",
    checklistId: null, // null = latest version
    checklists: [],
    groups: [],
    config: {},
    job: null,
    filters: { lang: "", channel: "", status: "", score: "", q: "" },
    openAppeals: 0,
  };

  async function api(path, opts = {}) {
    const init = { method: opts.method || (opts.body !== undefined ? "POST" : "GET"), headers: {} };
    if (opts.body instanceof FormData) init.body = opts.body;
    else if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
      init.headers["Content-Type"] = "application/json";
    }
    const r = await fetch(base + path, init);
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(errorText(data, r.status));
    return data;
  }

  const toasts = h("div", { class: "cqa-toasts", "aria-live": "polite" });
  function toast(text, isError) {
    const t = h("div", { class: `cqa-toast${isError ? " cqa-toast-error" : ""}`, role: isError ? "alert" : "status" },
      icon(isError ? "alert" : "check"), h("span", null, text));
    toasts.append(t);
    setTimeout(() => t.remove(), isError ? 7000 : 3500);
  }

  root.classList.add("cqa-root");
  root.toggleAttribute("data-collapsed", store("cqa.nav") === "collapsed");
  const side = h("aside", { class: "cqa-side" });
  const top = h("header", { class: "cqa-topbar" });
  const main = h("main", { class: "cqa-content", id: "cqa-main" });
  const jobSlot = h("div", { class: "cqa-job-slot" });
  root.replaceChildren(side, h("div", { class: "cqa-shell" }, top, main), jobSlot, toasts);

  // evaluation controls stay visible but disabled with the reason when no model key is configured
  const NO_KEY = "Оценка недоступна: задайте OPENAI_API_KEY или ANTHROPIC_API_KEY в .env";
  const canEvaluate = () => !!S.config.has_api_key;
  const currentChecklist = () => S.checklists.find((c) => c.id === S.checklistId) || S.checklists[0];
  const checklistQuery = () => (S.checklistId ? `checklist_id=${S.checklistId}` : "");

  async function refreshShared() {
    const [cfg, lists, groups, appeals] = await Promise.all([
      api("/api/config"), api("/api/checklists"), api("/api/groups"), api("/api/appeals?status=open"),
    ]);
    S.config = cfg;
    S.checklists = lists;
    S.groups = groups;
    S.openAppeals = appeals.length;
    if (S.checklistId && !lists.some((c) => c.id === S.checklistId)) S.checklistId = null;
    if (S.group && !groups.some((g) => g.group_id === S.group)) S.group = "";
  }

  // ---------- sidebar ----------
  let current = "list";
  function renderSide() {
    const item = (href, name, label, ic, count) => h("a", {
      class: "cqa-nav-item", href, title: label, "aria-current": current === name ? "page" : null },
    icon(ic), h("span", { class: "cqa-nav-label" }, label),
    count ? h("span", { class: "cqa-count", "aria-label": `открыто ${count}` }, count) : null);
    const collapsed = root.hasAttribute("data-collapsed");
    side.replaceChildren(
      h("div", { class: "cqa-side-head" },
        h("a", { class: "cqa-brand", href: "#/", title: "Контроль качества диалогов" },
          h("span", { class: "cqa-logo", "aria-hidden": "true" }, "Q"),
          h("span", { class: "cqa-brand-text" }, h("b", null, "CQA"), h("small", null, "Контроль качества"))),
        h("button", { class: "cqa-icon-btn cqa-collapse", type: "button",
          "aria-label": collapsed ? "Развернуть меню" : "Свернуть меню", "aria-expanded": String(!collapsed),
          onclick: () => { root.toggleAttribute("data-collapsed"); store("cqa.nav", root.hasAttribute("data-collapsed") ? "collapsed" : "open"); renderSide(); } },
        icon("panel"))),
      h("nav", { class: "cqa-nav", "aria-label": "Разделы" },
        item("#/", "overview", "Обзор", "overview"),
        item("#/dialogs", "list", "Диалоги", "chat"),
        item("#/appeals", "appeals", "Апелляции", "appeals", S.openAppeals),
        item("#/checklist", "checklist", "Чек-листы", "checklist")),
      h("div", { class: "cqa-side-foot" },
        h("div", { class: "cqa-team", title: ["Команда " + TEAM.name, ...TEAM.members].join(", ") },
          h("span", { class: "cqa-team-label" }, "Сделано командой"), h("b", null, TEAM.name),
          TEAM.members.length ? h("ul", { class: "cqa-team-members" }, TEAM.members.map((n) => h("li", null, n))) : null),
        h("div", { class: `cqa-model${S.config.has_api_key ? "" : " cqa-model-off"}`,
          title: S.config.has_api_key ? `Модель ${S.config.model}` : NO_KEY },
        h("i", { "aria-hidden": "true" }),
        h("span", { class: "cqa-nav-label" }, S.config.has_api_key ? S.config.model || "модель" : "Модель не подключена")),
        h("div", { class: "cqa-seg", role: "group", "aria-label": "Роль" },
          ROLES.map(([id, label]) => h("button", {
            type: "button", "aria-pressed": String(S.role === id), title: label,
            onclick: () => { S.role = id; store("cqa.role", id); route_(); },
          }, collapsed ? label[0] : label)))));
  }

  // ---------- top bar: breadcrumbs left, page actions right ----------
  function setTop(crumbs, actions = []) {
    top.replaceChildren(
      h("nav", { class: "cqa-crumbs", "aria-label": "Путь" }, crumbs.map(([label, href], i) =>
        [i ? h("span", { class: "cqa-crumb-sep", "aria-hidden": "true" }, "/") : null,
          href ? h("a", { href }, label) : h("span", { "aria-current": "page" }, label)])),
      h("div", { class: "cqa-top-actions" }, actions));
  }

  // ---------- batch job: floating panel owned by the shell, survives navigation ----------
  let pollTimer = null;
  let jobListener = null;
  function renderJob() {
    const j = S.job;
    if (!j) return jobSlot.replaceChildren();
    const pct = (n) => (j.total ? (100 * n) / j.total : 0);
    const finished = j.done + j.skipped + j.failed;
    jobSlot.replaceChildren(h("div", { class: "cqa-job", role: "status", "aria-live": "polite" },
      h("div", { class: "cqa-job-head" },
        h("b", null, j.running ? "Идёт оценка набора" : "Оценка набора завершена"),
        h("span", null, `${finished} из ${j.total}`),
        j.running ? null : h("button", { class: "cqa-icon-btn", type: "button", "aria-label": "Скрыть",
          onclick: () => { S.job = null; renderJob(); } }, icon("x"))),
      h("div", { class: "cqa-meter", "aria-hidden": "true" },
        h("i", { style: `width:${pct(j.done + j.skipped)}%` }),
        h("i", { class: "cqa-meter-fail", style: `width:${pct(j.failed)}%` })),
      h("div", { class: "cqa-job-meta" }, `оценено ${j.done} · пропущено ${j.skipped} · ошибок ${j.failed} · ${usd(j.cost_usd)}`)));
  }
  function startJob(job) {
    S.job = job;
    renderJob();
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!S.job) return clearInterval(pollTimer);
      try { S.job = await api(`/api/batch/${S.job.id}`); } catch { S.job = null; }
      renderJob();
      if (jobListener) jobListener();
      if (S.job && !S.job.running) {
        clearInterval(pollTimer);
        const j = S.job;
        toast(`Пакет завершён: оценено ${j.done}, пропущено ${j.skipped}, ошибок ${j.failed}`, j.failed > 0);
        refreshShared().then(renderSide).catch(() => {});
      }
    }, 1500);
  }

  // ---------- shared pieces ----------
  function checklistSelect(onchange, cls = "cqa-select") {
    const latest = S.checklists[0];
    return h("select", {
      class: cls || null, "aria-label": "Версия чек-листа",
      onchange: (e) => { S.checklistId = Number(e.target.value) === latest.id ? null : Number(e.target.value); onchange(); },
    }, S.checklists.map((c) => h("option", { value: c.id, selected: c.id === (currentChecklist() || {}).id },
      `v${c.id}${c.id === latest.id ? " (текущий)" : ""} · ${c.criteria} крит.`)));
  }

  function statusTags(ev) {
    if (!ev) return [h("span", { class: "cqa-tag" }, "Не оценён")];
    const tags = [];
    if (ev.status === "error") tags.push(h("span", { class: "cqa-tag cqa-tag-err" }, "Ошибка оценки"));
    else if (ev.status === "needs_review" || !ev.complete) tags.push(h("span", { class: "cqa-tag cqa-tag-warn" }, "Нужна проверка"));
    else tags.push(h("span", { class: "cqa-tag cqa-tag-ok" }, "Оценён"));
    if (ev.flags && ev.flags.length) tags.push(h("span", { class: "cqa-tag cqa-tag-alert" }, "Грубая ошибка"));
    if (ev.appeals_open) tags.push(h("span", { class: "cqa-tag cqa-tag-warn" }, "Апелляция"));
    else if (ev.appeals_total) tags.push(h("span", { class: "cqa-tag cqa-tag-plain" }, "Пересмотрено"));
    return tags;
  }

  const ctx = {
    S, base, root, main, api, toast, refreshShared, canEvaluate, NO_KEY, currentChecklist, checklistQuery,
    checklistSelect, statusTags, setTop, startJob,
    route_: () => route_(),
    renderTop: () => renderSide(), // views call this after data changes (open-appeal count)
    onJob: (fn) => { jobListener = fn; },
    // a screen with unsaved work registers isDirty(); leaving then asks first
    guardLeave: (isDirty) => { dirtyCheck = isDirty; },
  };

  // ---------- router ----------
  let dirtyCheck = null;
  let lastHash = location.hash;
  const onUnload = (e) => { if (dirtyCheck && dirtyCheck()) e.preventDefault(); };
  window.addEventListener("beforeunload", onUnload);
  async function route_() {
    if (dirtyCheck && dirtyCheck() && !confirm("Есть несохранённые изменения. Уйти без сохранения?")) {
      if (location.hash !== lastHash) history.replaceState(null, "", lastHash || "#/");
      return;
    }
    dirtyCheck = null;
    lastHash = location.hash;
    jobListener = null;
    const hash = location.hash || "#/";
    try {
      await refreshShared();
    } catch (e) {
      renderSide();
      setTop([["Ошибка"]]);
      main.replaceChildren(h("div", { class: "cqa-page" }, h("div", { class: "cqa-notice cqa-notice-error" }, icon("alert"),
        `Сервер недоступен: ${e.message}`)));
      return;
    }
    main.scrollTop = 0;
    if (hash.startsWith("#/c/")) {
      const cid = decodeURIComponent(hash.slice(4));
      current = "list";
      renderSide();
      setTop([["Диалоги", "#/dialogs"], [cid]]);
      return viewCard(ctx, cid);
    }
    if (hash.startsWith("#/appeals")) {
      current = "appeals";
      renderSide();
      setTop([["Апелляции"]]);
      return viewAppeals(ctx, hash.includes("decided") ? "decided" : "open");
    }
    if (hash.startsWith("#/checklist")) {
      current = "checklist";
      renderSide();
      setTop([["Чек-листы"]]);
      return viewChecklist(ctx);
    }
    if (hash.startsWith("#/dialogs")) {
      current = "list";
      renderSide();
      return viewList(ctx);
    }
    current = "overview";
    renderSide();
    return viewOverview(ctx);
  }
  window.addEventListener("hashchange", route_);

  route_();
  return { destroy: () => { window.removeEventListener("hashchange", route_); window.removeEventListener("beforeunload", onUnload); clearInterval(pollTimer); } };
}
