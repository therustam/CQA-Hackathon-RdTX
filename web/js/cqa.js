// CQA UI. Embeddable: mount(element, { apiBaseUrl }) — one root, cqa- classes, no globals.
// All criterion wording comes from the API (checklist versions); nothing about criteria lives here.

const CHANNEL = { "agent chat": "Чат", "voice call": "Звонок" };
const WHO = { client: "Клиент", operator: "Оператор", bot: "Бот", system: "Система" };
const TYPE = { binary: "Да / Нет", scale: "Шкала", flag: "Флаг без баллов" };
const SUBTYPE_FALLBACK = "нарушение";

// ---------- small DOM kit ----------
function h(tag, props, ...kids) {
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

const ICON_PATHS = {
  back: "M15 18l-6-6 6-6",
  upload: "M12 16V4m0 0l-5 5m5-5l5 5M4 20h16",
  play: "M7 5l12 7-12 7z",
  plus: "M12 5v14M5 12h14",
  run: "M4 12h12m0 0l-5-5m5 5l-5 5M20 5v14",
  download: "M12 4v12m0 0l-5-5m5 5l5-5M4 20h16",
};
function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", ICON_PATHS[name]);
  svg.append(p);
  return svg;
}

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 }));
const usd = (n) => (n == null ? "—" : `$${Number(n).toFixed(n < 0.1 ? 4 : 2)}`);

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { return null; }
}

function errorText(data, status) {
  const d = data && data.detail;
  if (Array.isArray(d)) return d.map((x) => String(x.msg || x).replace(/^Value error, /, "")).join("; ");
  return d || `Ошибка сервера (HTTP ${status})`;
}

// ---------- app ----------
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

  function toast(text, isError) {
    const t = h("div", { class: `cqa-toast${isError ? " cqa-toast-error" : ""}`, role: "status" }, text);
    root.append(t);
    setTimeout(() => t.remove(), isError ? 7000 : 3500);
  }

  root.classList.add("cqa-root");
  root.replaceChildren();
  const top = h("header", { class: "cqa-top" });
  const main = h("main", { class: "cqa-main", id: "cqa-main" });
  root.append(top, main);

  const checklistQuery = () => (S.checklistId ? `checklist_id=${S.checklistId}` : "");
  // evaluation controls stay visible but disabled with the reason when no model key is configured
  const NO_KEY = "Оценка недоступна: задайте OPENAI_API_KEY или ANTHROPIC_API_KEY в .env";
  const canEvaluate = () => !!S.config.has_api_key;
  const currentChecklist = () => S.checklists.find((c) => c.id === S.checklistId) || S.checklists[0];

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

  function renderTop(route) {
    const link = (href, label, name, extra) =>
      h("a", { href, "aria-current": route === name ? "page" : null }, label, extra);
    top.replaceChildren(
      h("div", { class: "cqa-brand" }, "CQA", h("span", null, "контроль качества диалогов")),
      h("nav", { class: "cqa-nav", "aria-label": "Разделы" },
        link("#/", "Диалоги", "list"),
        link("#/appeals", "Апелляции", "appeals",
          S.openAppeals ? h("span", { class: "cqa-count", "aria-label": `открыто ${S.openAppeals}` }, S.openAppeals) : null),
        link("#/checklist", "Чек-лист", "checklist")),
      h("div", { class: "cqa-top-right" },
        h("div", { class: "cqa-model" }, S.config.has_api_key
          ? ["Модель ", h("b", null, S.config.model || "—")]
          : ["Модель не подключена — ", h("b", null, "нет API-ключа")]),
        h("div", { class: "cqa-seg", role: "group", "aria-label": "Роль" },
          ...[["specialist", "Специалист"], ["reviewer", "Проверяющий"]].map(([id, label]) =>
            h("button", {
              type: "button", "aria-pressed": String(S.role === id),
              onclick: () => { S.role = id; store("cqa.role", id); route_(); },
            }, label)))),
    );
  }

  // ---------- router ----------
  let leaving = () => {};
  async function route_() {
    leaving();
    leaving = () => {};
    const hash = location.hash || "#/";
    try {
      await refreshShared();
    } catch (e) {
      main.replaceChildren(h("div", { class: "cqa-page" }, h("div", { class: "cqa-notice cqa-notice-error" },
        `Сервер недоступен: ${e.message}`)));
      return;
    }
    if (hash.startsWith("#/c/")) {
      renderTop("list");
      return viewCard(decodeURIComponent(hash.slice(4)));
    }
    if (hash.startsWith("#/appeals")) {
      renderTop("appeals");
      return viewAppeals(hash.includes("decided") ? "decided" : "open");
    }
    if (hash.startsWith("#/checklist")) {
      renderTop("checklist");
      return viewChecklist();
    }
    renderTop("list");
    return viewList();
  }
  window.addEventListener("hashchange", route_);

  // ---------- shared pieces ----------
  function checklistSelect(onchange, cls = "cqa-select") {
    const latest = S.checklists[0];
    return h("select", {
      class: cls, "aria-label": "Версия чек-листа",
      onchange: (e) => { S.checklistId = Number(e.target.value) === latest.id ? null : Number(e.target.value); onchange(); },
    }, S.checklists.map((c) => h("option", { value: c.id, selected: c.id === (currentChecklist() || {}).id },
      `Чек-лист v${c.id}${c.id === latest.id ? " (текущий)" : ""} · ${c.criteria} крит.`)));
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

  // ---------- batch progress ----------
  let pollTimer = null;
  function startPolling(onTick) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!S.job) return clearInterval(pollTimer);
      try {
        S.job = await api(`/api/batch/${S.job.id}`);
      } catch {
        S.job = null;
      }
      onTick();
      if (S.job && !S.job.running) {
        clearInterval(pollTimer);
        const j = S.job;
        toast(`Пакет завершён: оценено ${j.done}, пропущено ${j.skipped}, ошибок ${j.failed}`, j.failed > 0);
      }
    }, 1500);
  }

  function batchBar() {
    const j = S.job;
    if (!j) return null;
    const pct = (n) => (j.total ? (100 * n) / j.total : 0);
    return h("div", { class: "cqa-batch", role: "status", "aria-live": "polite" },
      h("span", null, j.running ? "Идёт оценка набора" : "Оценка набора завершена"),
      h("div", { class: "cqa-meter", "aria-hidden": "true" },
        h("i", { style: `width:${pct(j.done + j.skipped)}%` }),
        h("i", { class: "cqa-meter-fail", style: `width:${pct(j.failed)}%` })),
      h("span", null, h("b", null, `${j.done + j.skipped + j.failed} из ${j.total}`),
        j.failed ? ` · ошибок ${j.failed}` : "", ` · ${usd(j.cost_usd)}`),
      j.running ? null : h("button", { class: "cqa-btn cqa-btn-sm", type: "button", onclick: () => { S.job = null; route_(); } }, "Скрыть"));
  }

  // ---------- list ----------
  async function viewList() {
    const page = h("div", { class: "cqa-page" });
    main.replaceChildren(page);
    let items = [];

    const fileInput = h("input", {
      type: "file", accept: ".json,.txt,application/json", class: "cqa-hidden-file", id: "cqa-upload",
      onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        try {
          const r = await api("/api/upload", { body: fd });
          S.group = r.group_id;
          store("cqa.group", S.group);
          toast(`Загружено диалогов: ${r.imported}${r.problems.length ? `, отклонено: ${r.problems.length}` : ""}`);
          route_();
        } catch (err) { toast(err.message, true); }
      },
    });
    const groupInput = h("input", { class: "cqa-input", placeholder: "например, DEV", value: "", "aria-label": "group_id" });
    const importBtn = h("button", { class: "cqa-btn", type: "submit" }, "Импортировать");
    const importForm = h("form", {
      class: "cqa-form-row",
      onsubmit: async (e) => {
        e.preventDefault();
        const gid = groupInput.value.trim();
        if (!gid) return groupInput.focus();
        importBtn.disabled = true;
        importBtn.textContent = "Загрузка…";
        try {
          const r = await api("/api/import", { body: { group_id: gid } });
          S.group = r.group_id;
          store("cqa.group", S.group);
          toast(`Импортировано из «${r.group_id}»: ${r.imported}`);
          route_();
        } catch (err) {
          toast(err.message, true);
          importBtn.disabled = false;
          importBtn.textContent = "Импортировать";
        }
      },
    }, h("label", { class: "cqa-field" }, "Набор организаторов (group_id)", groupInput), importBtn);

    const groupSelect = h("select", {
      class: "cqa-select", "aria-label": "Набор диалогов",
      onchange: (e) => { S.group = e.target.value; store("cqa.group", S.group); load(); },
    }, h("option", { value: "" }, "Все наборы"),
      S.groups.map((g) => h("option", { value: g.group_id, selected: g.group_id === S.group }, `${g.group_id} · ${g.n}`)));

    const runBtn = h("button", {
      class: "cqa-btn cqa-btn-primary", type: "button", disabled: !canEvaluate(), title: canEvaluate() ? null : NO_KEY,
      onclick: async () => {
        try {
          S.job = await api("/api/batch", { body: { group_id: S.group || null, checklist_id: S.checklistId } });
          renderBody();
          startPolling(load);
        } catch (err) { toast(err.message, true); }
      },
    }, icon("run"), "Оценить набор");

    const exportLink = h("a", {
      class: "cqa-btn", download: "results.json",
      title: "Результаты набора в формате организаторов (JSON 1.0)",
    }, icon("download"), "Скачать results.json");

    const head = h("div", { class: "cqa-page-head" },
      h("h1", null, "Диалоги"),
      h("span", { class: "cqa-sub" }, "Импорт, оценка по чек-листу и результаты"));
    const toolbar = h("div", { class: "cqa-toolbar" },
      importForm,
      h("div", { class: "cqa-form-row" },
        h("label", { class: "cqa-btn", for: "cqa-upload", tabindex: "0",
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } } },
        icon("upload"), "Загрузить JSON"), fileInput),
      h("div", { class: "cqa-spacer" }),
      h("label", { class: "cqa-field" }, "Набор", groupSelect),
      h("label", { class: "cqa-field" }, "Чек-лист", checklistSelect(load)),
      exportLink, runBtn);

    const chips = (key, options) => h("div", { class: "cqa-chips", role: "group" },
      options.map(([value, label]) => h("button", {
        type: "button", class: "cqa-chip", "aria-pressed": String(S.filters[key] === value),
        onclick: () => { S.filters[key] = value; renderBody(); },
      }, label)));
    const search = h("input", {
      class: "cqa-input", placeholder: "Поиск по ID", value: S.filters.q, "aria-label": "Поиск по ID",
      oninput: (e) => { S.filters.q = e.target.value; renderBody(true); },
    });
    const group = (label, el) => h("div", { class: "cqa-filter-group" }, h("span", { class: "cqa-filter-label" }, label), el);
    const filters = () => h("div", { class: "cqa-toolbar" },
      group("Язык", chips("lang", [["", "Все"], ["RU", "RU"], ["KZ", "KZ"], ["EN", "EN"]])),
      group("Канал", chips("channel", [["", "Все"], ["agent chat", "Чат"], ["voice call", "Звонок"]])),
      group("Статус", chips("status", [["", "Все"], ["none", "Не оценён"], ["ok", "Оценён"],
        ["review", "Проверка/ошибка"], ["appeal", "Апелляция"], ["flag", "Грубая ошибка"]])),
      group("Итог", chips("score", [["", "Любой"], ["low", "до 70"], ["mid", "70–90"], ["high", "90+"]])),
      h("div", { class: "cqa-spacer" }), search);

    const body = h("div");
    page.append(head, toolbar, body);
    if (!S.config.has_api_key) {
      toolbar.after(h("div", { class: "cqa-notice cqa-notice-warn" },
        "API-ключ модели не задан (OPENAI_API_KEY или ANTHROPIC_API_KEY в .env): импорт, просмотр, апелляции и редактор работают, новая оценка — нет."));
    }

    function matches(it) {
      const f = S.filters, ev = it.evaluation, total = ev ? ev.final_total : null;
      if (f.lang && it.language !== f.lang) return false;
      if (f.channel && it.channel !== f.channel) return false;
      if (f.q && !it.id.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.status === "none" && ev) return false;
      if (f.status === "ok" && !(ev && ev.status === "ok")) return false;
      if (f.status === "review" && !(ev && ev.status !== "ok")) return false;
      if (f.status === "appeal" && !(ev && ev.appeals_open)) return false;
      if (f.status === "flag" && !(ev && ev.flags.length)) return false;
      if (f.score === "low" && !(total != null && total < 70)) return false;
      if (f.score === "mid" && !(total != null && total >= 70 && total < 90)) return false;
      if (f.score === "high" && !(total != null && total >= 90)) return false;
      return true;
    }

    function renderBody(keepFilters) {
      const rows = items.filter(matches);
      const evaluated = items.filter((i) => i.evaluation && i.evaluation.status !== "error");
      const flagged = items.filter((i) => i.evaluation && i.evaluation.flags.length).length;
      const cost = evaluated.reduce((s, i) => s + (i.evaluation.cost_usd || 0), 0);
      const summary = h("p", { class: "cqa-sub", style: "margin:4px 0 12px" },
        `Показано ${rows.length} из ${items.length} · оценено ${evaluated.length} · грубых ошибок ${flagged}`,
        evaluated.length ? ` · средняя стоимость оценки ${usd(cost / evaluated.length)}` : "");
      const table = rows.length ? h("table", { class: "cqa-table" },
        h("thead", null, h("tr", null,
          h("th", null, "ID"), h("th", null, "Канал"), h("th", null, "Язык"), h("th", { class: "cqa-num" }, "Реплик"),
          h("th", null, "Статус"), h("th", { class: "cqa-num" }, "Итог"), h("th", null, ""))),
        h("tbody", null, rows.map((it) => {
          const ev = it.evaluation;
          const open = () => { location.hash = `#/c/${encodeURIComponent(it.id)}`; };
          const changed = ev && ev.final_total !== ev.total;
          return h("tr", { tabindex: "0", onclick: open, onkeydown: (e) => { if (e.key === "Enter") open(); } },
            h("td", { class: "cqa-id" }, it.id),
            h("td", null, CHANNEL[it.channel] || it.channel),
            h("td", null, it.language),
            h("td", { class: "cqa-num" }, it.messages),
            h("td", null, h("div", { class: "cqa-chips" }, statusTags(ev))),
            h("td", { class: "cqa-num" },
              changed ? h("span", { class: "cqa-total-was" }, fmt(ev.total)) : null,
              h("span", { class: "cqa-total" }, ev ? fmt(ev.final_total) : "—")),
            h("td", { class: "cqa-num" }, ev ? null : h("button", {
              class: "cqa-btn cqa-btn-sm", type: "button", disabled: !canEvaluate(), title: canEvaluate() ? null : NO_KEY,
              onclick: async (e) => {
                e.stopPropagation();
                e.target.disabled = true;
                e.target.textContent = "Оценка…";
                try {
                  await api("/api/evaluate", { body: { conversation_id: it.id, checklist_id: S.checklistId } });
                } catch (err) { toast(err.message, true); }
                load();
              },
            }, "Оценить")));
        })))
        : h("div", { class: "cqa-empty" }, items.length
          ? [h("h2", null, "Ничего не найдено"), h("p", null, "Измените фильтры.")]
          : [h("h2", null, "Диалогов пока нет"), h("p", null, "Введите group_id организаторов (например, DEV) или загрузите JSON-файл с транскриптами.")]);
      const filterBar = filters();
      body.replaceChildren(batchBar() || "", filterBar, summary, table);
      if (keepFilters) {
        const s = filterBar.querySelector("input");
        s.replaceWith(search);
        search.focus();
      }
    }

    async function load() {
      const exportQuery = new URLSearchParams();
      if (S.group) exportQuery.set("group_id", S.group);
      if (S.checklistId) exportQuery.set("checklist_id", S.checklistId);
      exportLink.href = `${base}/api/export?${exportQuery}`;
      try {
        const q = new URLSearchParams();
        if (S.group) q.set("group_id", S.group);
        if (S.checklistId) q.set("checklist_id", S.checklistId);
        items = (await api(`/api/conversations?${q}`)).items;
      } catch (err) { toast(err.message, true); }
      renderBody();
    }
    await load();
    if (S.job && S.job.running) startPolling(load);
    leaving = () => clearInterval(pollTimer);
  }

  // ---------- verdict helpers ----------
  function verdict(row, meta) {
    if (!row || row.status === "missing") return { text: "нет ответа", cls: "cqa-v-missing" };
    if (row.status === "na") return { text: "N/A", cls: "cqa-v-na" };
    if (meta.type === "flag") return row.answer === "yes" ? { text: "ДА", cls: "cqa-v-alert" } : { text: "НЕТ", cls: "cqa-v-yes" };
    if (meta.type === "scale") {
      const max = Math.max(...meta.scale.map((s) => s.value));
      return { text: `${fmt(row.step)} / ${fmt(max)}`, cls: row.step === 0 ? "cqa-v-no" : row.step === max ? "cqa-v-yes" : "cqa-v-step" };
    }
    return row.answer === "yes" ? { text: "ДА", cls: "cqa-v-yes" } : { text: "НЕТ", cls: "cqa-v-no" };
  }
  const verdictBox = (row, meta) => {
    const v = verdict(row, meta);
    return h("span", { class: `cqa-verdict ${v.cls}` }, v.text);
  };

  function appealForm(evaluationId, cid, onDone) {
    const ta = h("textarea", { class: "cqa-textarea", rows: "3", required: true,
      placeholder: "Почему оценка неверна: что упущено, на какие реплики смотреть" });
    const err = h("div", { class: "cqa-form-error", role: "alert" });
    return h("form", {
      class: "cqa-form", onclick: (e) => e.stopPropagation(),
      onsubmit: async (e) => {
        e.preventDefault();
        if (!ta.value.trim()) return ta.focus();
        try {
          onDone(await api(`/api/evaluations/${evaluationId}/appeals`, { body: { criterion_id: cid, comment: ta.value.trim() } }));
          toast("Апелляция сохранена и передана проверяющему");
        } catch (ex) { err.textContent = ex.message; }
      },
    }, h("label", { class: "cqa-field" }, `Апелляция по критерию ${cid}`, ta), err,
    h("div", { class: "cqa-form-row" }, h("button", { class: "cqa-btn cqa-btn-primary", type: "submit" }, "Сохранить апелляцию")));
  }

  function decisionForm(appeal, meta, onDone) {
    const current = appeal.final || appeal.original;
    let action = "confirm", applicable = current?.applicable !== false;
    let answer = current && current.answer;
    let step = current && current.step;
    const reason = h("textarea", { class: "cqa-textarea", rows: "3", required: true, placeholder: "Обоснование решения" });
    const err = h("div", { class: "cqa-form-error", role: "alert" });
    const changeBox = h("div", { class: "cqa-form-row" });
    const name = `cqa-act-${appeal.id}`;

    function renderChange() {
      if (action !== "change") return changeBox.replaceChildren();
      const opts = [];
      if (meta.type === "scale") {
        for (const s of meta.scale) opts.push([`s${s.value}`, `${fmt(s.value)}`, () => { applicable = true; step = s.value; }, applicable && step === s.value]);
      } else {
        opts.push(["yes", "Да", () => { applicable = true; answer = "yes"; }, applicable && answer === "yes"]);
        opts.push(["no", "Нет", () => { applicable = true; answer = "no"; }, applicable && answer === "no"]);
      }
      if (meta.na_allowed) opts.push(["na", "N/A", () => { applicable = false; }, !applicable]);
      changeBox.replaceChildren(h("span", { class: "cqa-filter-label" }, "Новая оценка"),
        h("div", { class: "cqa-chips", role: "group" }, opts.map(([id, label, set, on]) =>
          h("button", { type: "button", class: "cqa-chip", "aria-pressed": String(!!on), onclick: () => { set(); renderChange(); } }, label))));
    }

    const radio = (value, label) => h("label", { class: "cqa-check" },
      h("input", { type: "radio", name, value, checked: value === action,
        onchange: () => { action = value; renderChange(); } }), label);
    return h("form", {
      class: "cqa-form", onclick: (e) => e.stopPropagation(),
      onsubmit: async (e) => {
        e.preventDefault();
        if (!reason.value.trim()) return reason.focus();
        const body = { action, reason: reason.value.trim(), applicable, answer: applicable ? answer : null, step: applicable ? step : null };
        try {
          const r = await api(`/api/appeals/${appeal.id}/decision`, { body });
          toast(`Решение сохранено. Итог: ${fmt(r.total)} → ${fmt(r.final_total)}`);
          onDone(r);
        } catch (ex) { err.textContent = ex.message; }
      },
    }, h("div", { class: "cqa-form-row" }, radio("confirm", "Подтвердить оценку"), radio("change", "Изменить оценку")),
    changeBox, h("label", { class: "cqa-field" }, "Причина", reason), err,
    h("div", { class: "cqa-form-row" }, h("button", { class: "cqa-btn cqa-btn-primary", type: "submit" }, "Сохранить решение")));
  }

  // ---------- card ----------
  async function viewCard(cid) {
    let conv, ev;
    try {
      [conv, ev] = await Promise.all([
        api(`/api/conversations/${encodeURIComponent(cid)}`),
        api(`/api/conversations/${encodeURIComponent(cid)}/evaluation?${checklistQuery()}`),
      ]);
    } catch (e) {
      main.replaceChildren(h("div", { class: "cqa-page" }, h("div", { class: "cqa-notice cqa-notice-error" }, e.message),
        h("a", { href: "#/" }, "К списку диалогов")));
      return;
    }
    const isCall = conv.channel === "voice call";
    const msgs = conv.messages;
    const order = new Map(msgs.map((m, i) => [m.id, i]));
    const msgEl = new Map();
    let selected = null;
    let openForm = null; // {cid, kind}
    let busy = false;

    const card = h("div", { class: "cqa-card" });
    const vitalsSlot = h("div");
    const bandSlot = h("div");
    const resultsBody = h("div", { class: "cqa-results-body" });
    const audio = conv.has_audio ? h("audio", {
      class: "cqa-audio", controls: true, preload: "none",
      src: `${base}/api/conversations/${encodeURIComponent(cid)}/audio`,
    }) : null;

    // transcript: original order and timestamps, ids match the model's evidence ids
    const transcript = h("div", { class: "cqa-transcript", tabindex: "0", "aria-label": "Транскрипт" },
      msgs.map((m) => {
        const time = isCall && m.timestamp ? m.timestamp.slice(11, 19) : m.timestamp;
        const timeCell = audio && m.audio_offset != null
          ? h("button", { type: "button", title: `${m.timestamp} · позиция в записи ${Math.round(m.audio_offset)} с`,
            onclick: () => seek(m) }, time)
          : h("span", { title: m.timestamp }, time);
        const el = h("div", { class: `cqa-msg cqa-msg-${m.speaker}${m.internal ? " cqa-msg-internal" : ""}`, id: `cqa-${m.id}` },
          h("span", { class: "cqa-msg-id" }, m.id),
          h("span", { class: "cqa-msg-time" }, timeCell),
          h("div", null,
            h("div", { class: "cqa-msg-who" }, WHO[m.speaker] || m.speaker,
              m.internal ? h("span", { class: "cqa-msg-note" }, "внутренняя консультация, клиент на удержании") : null,
              m.duplicate ? h("span", { class: "cqa-msg-note" }, "дубль") : null),
            h("div", { class: "cqa-msg-text" }, m.text)));
        msgEl.set(m.id, el);
        return el;
      }));

    function seek(m) {
      if (!audio || m.audio_offset == null) return;
      const position = Math.max(0, m.audio_offset - 1);
      // Browsers discard the first seek before the recording metadata has loaded.
      if (audio.readyState === 0) audio.addEventListener("loadedmetadata", () => { audio.currentTime = position; }, { once: true });
      else audio.currentTime = position;
      audio.play().catch(() => {});
    }
    if (audio) {
      let playing = null;
      audio.addEventListener("timeupdate", () => {
        let cur = null;
        for (const m of msgs) if (m.audio_offset != null && m.audio_offset <= audio.currentTime + 0.5 && m.speaker !== "system") cur = m;
        if (cur && cur.id !== playing) {
          if (playing) msgEl.get(playing).classList.remove("cqa-msg-playing");
          playing = cur.id;
          const el = msgEl.get(playing);
          el.classList.add("cqa-msg-playing");
          if (!audio.paused) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      });
      audio.addEventListener("error", () => toast("Запись не воспроизводится — откройте её по ссылке «Открыть запись»", true));
    }

    function highlight(row, focusId) {
      for (const el of msgEl.values()) el.classList.remove("cqa-msg-hl", "cqa-msg-range", "cqa-msg-flash");
      if (!row) return;
      const range = row.checked_range || [];
      if (range.length === 2 && order.has(range[0]) && order.has(range[1])) {
        const [a, b] = [order.get(range[0]), order.get(range[1])].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) msgEl.get(msgs[i].id).classList.add("cqa-msg-range");
      }
      for (const id of row.evidence_ids || []) msgEl.get(id)?.classList.add("cqa-msg-hl");
      const target = msgEl.get(focusId || (row.evidence_ids || [])[0] || range[0]);
      if (target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        void target.offsetWidth;
        target.classList.add("cqa-msg-flash");
      }
    }

    function selectCriterion(id, focusId) {
      selected = id;
      for (const el of resultsBody.querySelectorAll(".cqa-crit")) el.setAttribute("aria-selected", String(el.dataset.cid === id));
      const row = ev && ev.final.criteria.find((c) => c.id === id);
      highlight(row, focusId);
      if (focusId && isCall) seek(msgs[order.get(focusId)]);
    }

    function renderVitals() {
      const fin = ev && ev.final, orig = ev && ev.original;
      const changed = ev && fin.total !== orig.total;
      const evalBtn = h("button", {
        class: `cqa-btn ${ev ? "" : "cqa-btn-signal"}`, type: "button", disabled: busy || !canEvaluate(),
        title: canEvaluate() ? null : NO_KEY,
        onclick: async () => {
          busy = true;
          renderVitals();
          try {
            ev = await api("/api/evaluate", { body: { conversation_id: cid, checklist_id: S.checklistId, force: !!ev } });
          } catch (e) { toast(e.message, true); }
          busy = false;
          renderAll();
        },
      }, busy ? "Оценивается…" : ev ? "Переоценить" : "Оценить диалог");
      vitalsSlot.replaceChildren(h("section", { class: "cqa-vitals", "aria-label": "Сводка" },
        h("div", null,
          h("a", { class: "cqa-back", href: "#/" }, icon("back"), "Диалоги"),
          h("h1", null, cid),
          h("div", { class: "cqa-vitals-meta" },
            h("span", null, h("b", null, CHANNEL[conv.channel] || conv.channel)),
            h("span", null, "Язык ", h("b", null, conv.language)),
            h("span", null, h("b", null, msgs.length), " реплик"),
            h("span", null, "Набор ", h("b", null, conv.group_id)),
            ev && ev.status !== "error" ? h("span", null, h("b", null, ev.model), ` · ${usd(ev.cost_usd)} · ${fmt((ev.latency_ms || 0) / 1000)} с`) : null)),
        h("div", { class: "cqa-score" },
          h("div", { class: "cqa-score-label" }, changed ? "Итог после решения" : "Итог"),
          h("div", { class: "cqa-score-value" }, fin ? fmt(fin.total) : "—", h("small", null, "/ 100")),
          changed ? h("div", { class: "cqa-score-trail" }, "Исходно ", h("s", null, fmt(orig.total)), " → ", h("b", null, fmt(fin.total))) : null),
        h("div", { class: "cqa-vitals-actions" }, checklistSelect(() => route_()), evalBtn),
        fin && fin.sections.length ? h("div", { class: "cqa-sections" }, fin.sections.map((s) => {
          if (s.available != null) {
            return h("div", { class: "cqa-section-cell" },
              h("span", null, s.title), h("b", null, `${fmt(s.percent)}%`),
              h("span", { class: "cqa-section-bar", "aria-hidden": "true" }, h("i", { style: `width:${s.percent}%` })),
              h("span", { style: "grid-column:1/-1" }, `${fmt(s.earned)} из ${fmt(s.available)} баллов`));
          }
          // flag-only (or all-N/A) section: a flag, not an empty meter
          const flags = fin.flags.filter((f) => fin.criteria.some((c) => c.id === f.criterion_id && c.section === s.id));
          const hasFlagCriteria = fin.criteria.some((c) => c.section === s.id && c.type === "flag");
          return h("div", { class: "cqa-section-cell" },
            h("span", null, s.title),
            flags.length
              ? h("span", { class: "cqa-section-flag" }, "выявлено",
                flags.flatMap((f) => f.evidence_ids).map((id) => h("button", { class: "cqa-ref", type: "button",
                  onclick: () => selectCriterion(flags[0].criterion_id, id) }, id)))
              : h("b", null, hasFlagCriteria ? "не выявлено" : "N/A"));
        })) : null));

      const bands = [];
      if (fin && fin.flags.length) {
        for (const f of fin.flags) {
          const meta = ev.checklist.data.criteria.find((c) => c.id === f.criterion_id) || {};
          const labels = (f.subtypes.length ? f.subtypes : [null]).map((st) =>
            ((meta.subtypes || []).find((x) => x.id === st) || {}).label || st || SUBTYPE_FALLBACK);
          bands.push(h("div", { class: "cqa-band cqa-band-alert", role: "alert" },
            h("b", null, `${f.criterion_id} · ${f.title}:`), h("span", null, labels.join(", ")),
            f.evidence_ids.map((id) => h("button", { class: "cqa-ref", type: "button", onclick: () => selectCriterion(f.criterion_id, id) }, id)),
            h("span", null, "в итог не входит, отмечена отдельно")));
        }
      }
      if (ev && ev.status === "error") bands.push(h("div", { class: "cqa-band cqa-band-err", role: "alert" }, `Оценка не выполнена: ${ev.errors.join("; ")}`));
      if (ev && ev.status === "needs_review") bands.push(h("div", { class: "cqa-band cqa-band-warn" },
        `Ответ модели не прошёл проверку после повтора — нужна ручная проверка: ${ev.errors.join("; ")}`));
      bandSlot.replaceChildren(...bands);
    }

    function critRow(meta, row, orig) {
      const appeals = ev.appeals.filter((a) => a.criterion_id === meta.id);
      const openAppeal = appeals.find((a) => a.status === "open");
      const scored = row.status === "scored" && meta.type !== "flag";
      const subLabels = (row.subtypes || []).map((st) => ((meta.subtypes || []).find((x) => x.id === st) || {}).label || st);
      const range = row.checked_range || [];
      const formOpen = openForm && openForm.cid === meta.id;
      const actions = [];
      if (S.role === "specialist" && !openAppeal && ev.status !== "error") {
        actions.push(h("button", { class: "cqa-btn cqa-btn-sm", type: "button",
          onclick: (e) => { e.stopPropagation(); openForm = formOpen ? null : { cid: meta.id, kind: "appeal" }; renderResults(); } },
        formOpen ? "Отмена" : "Оспорить"));
      }
      if (S.role === "reviewer" && openAppeal) {
        actions.push(h("button", { class: "cqa-btn cqa-btn-sm cqa-btn-primary", type: "button",
          onclick: (e) => { e.stopPropagation(); openForm = formOpen ? null : { cid: meta.id, kind: "decision" }; renderResults(); } },
        formOpen ? "Отмена" : "Рассмотреть апелляцию"));
      }
      let form = null;
      if (formOpen && openForm.kind === "appeal") {
        form = appealForm(ev.id, meta.id, (view) => { ev = view; openForm = null; renderAll(); });
      } else if (formOpen && openForm.kind === "decision" && openAppeal) {
        form = decisionForm({ ...openAppeal, original: orig, final: row }, meta, async () => {
          ev = await api(`/api/evaluations/${ev.id}`);
          openForm = null;
          renderAll();
        });
      }
      return h("article", {
        class: "cqa-crit", "data-cid": meta.id, tabindex: "0", "aria-selected": String(selected === meta.id),
        onclick: () => selectCriterion(meta.id),
        onkeydown: (e) => { if (e.key === "Enter" && e.target === e.currentTarget) selectCriterion(meta.id); },
      },
      h("span", { class: "cqa-crit-num" }, meta.id),
      h("div", null, h("div", { class: "cqa-crit-title" }, meta.title),
        h("div", { class: "cqa-crit-type" }, `${TYPE[meta.type] || meta.type}${meta.na_allowed ? " · N/A допустим" : ""}`)),
      verdictBox(row, meta),
      h("div", { class: "cqa-pts" }, meta.type === "flag"
        ? [h("b", null, "—"), h("span", null, "без баллов")]
        : scored
          ? [h("b", null, `${fmt(row.points)} из ${fmt(meta.weight)}`), h("span", null, `вес ${fmt(meta.weight)} → ${fmt(row.redistributed_weight)}`)]
          : [h("b", null, "—"), h("span", null, row.status === "na" ? `вес ${fmt(meta.weight)} перераспределён` : "не учтён")]),
      h("div", { class: "cqa-crit-body" },
        row.explanation ? h("p", { class: "cqa-expl" }, row.explanation) : null,
        row.status === "na" && row.na_reason ? h("p", { class: "cqa-na-reason" }, h("b", null, "Причина N/A: "), row.na_reason) : null,
        subLabels.length ? h("div", { class: "cqa-chips" }, subLabels.map((l) => h("span", { class: "cqa-tag cqa-tag-alert" }, l))) : null,
        (row.evidence_ids || []).length || range.length === 2 ? h("div", { class: "cqa-refs" },
          (row.evidence_ids || []).length ? "Основание:" : null,
          (row.evidence_ids || []).map((id) => h("button", { class: "cqa-ref", type: "button", title: "Перейти к реплике",
            onclick: (e) => { e.stopPropagation(); selectCriterion(meta.id, id); } }, id)),
          range.length === 2 ? h("button", { class: "cqa-ref", type: "button", title: "Перейти к проверенному участку",
            onclick: (e) => { e.stopPropagation(); selectCriterion(meta.id, range[0]); } },
          `Проверен участок ${range[0]}–${range[1]}`) : null) : null,
        typeof row.confidence === "number" && row.confidence < 0.6 ? h("span", { class: "cqa-tag cqa-tag-warn" }, "низкая уверенность модели") : null,
        appeals.length ? h("dl", { class: "cqa-trail" }, appeals.flatMap((a) => [
          h("dt", null, "Апелляция"), h("dd", null, a.comment),
          a.status === "open" ? [h("dt", null, "Статус"), h("dd", null, "ждёт решения проверяющего")]
            : [h("dt", null, "Исходно (ИИ)"), h("dd", null, verdict(orig, meta).text),
              h("dt", null, "Решение"), h("dd", null, a.action === "confirm" ? "оценка подтверждена" :
                `изменено на ${verdict({ ...row, ...a.override, status: a.override?.applicable === false ? "na" : meta.type === "flag" ? "flag" : "scored" }, meta).text}`, ` — ${a.reason}`)],
        ])) : null,
        actions.length ? h("div", { class: "cqa-crit-actions" }, actions) : null,
        form));
    }

    function renderResults() {
      if (!ev) {
        resultsBody.replaceChildren(h("div", { class: "cqa-empty" },
          h("h2", null, "Диалог ещё не оценён"),
          h("p", null, `Чек-лист v${(currentChecklist() || {}).id}. Модель вернёт ответ по каждому критерию со ссылками на реплики; баллы и итог посчитает код.`)));
        return;
      }
      const metaById = new Map(ev.checklist.data.criteria.map((c) => [c.id, c]));
      const origById = new Map(ev.original.criteria.map((c) => [c.id, c]));
      const sections = ev.checklist.data.sections || [];
      const groups = sections.map((s) => [s, ev.final.criteria.filter((c) => c.section === s.id)]);
      const loose = ev.final.criteria.filter((c) => !sections.some((s) => s.id === c.section));
      if (loose.length) groups.push([{ id: "", title: "Без секции" }, loose]);
      const secScore = new Map(ev.final.sections.map((s) => [s.id, s]));
      const decided = ev.appeals.filter((a) => a.status === "decided");
      resultsBody.replaceChildren(
        ...groups.filter(([, rows]) => rows.length).map(([s, rows]) => h("section", null,
          h("h3", { class: "cqa-sec-title" }, s.title, h("span", null, secScore.get(s.id) && secScore.get(s.id).available != null
            ? `${fmt(secScore.get(s.id).earned)} из ${fmt(secScore.get(s.id).available)}` : "")),
          rows.map((row) => critRow(metaById.get(row.id), row, origById.get(row.id))))),
        h("section", { class: "cqa-history" },
          h("h3", null, "История оценки"),
          h("ol", null,
            h("li", null, `Оценка ИИ (${ev.model || "—"}, ${new Date(ev.created_at).toLocaleString("ru-RU")}): итог ${fmt(ev.original.total)}`),
            decided.map((a) => h("li", null, `Решение проверяющего по критерию ${a.criterion_id}: ${a.action === "confirm" ? "подтверждено" : "изменено"} — ${a.reason}`)),
            h("li", null, h("b", null, `Финальный результат: ${fmt(ev.final.total)}`)))),
        h("p", { class: "cqa-meta-line" },
          `Чек-лист v${ev.checklist.id} «${ev.checklist.name}» · токены: вход ${ev.usage?.input_tokens ?? "—"}, кэш ${ev.usage?.cache_read_tokens ?? "—"}, выход ${ev.usage?.output_tokens ?? "—"} · стоимость ${usd(ev.cost_usd)}`));
    }

    function renderAll() {
      renderVitals();
      renderResults();
      if (selected) selectCriterion(selected);
      refreshShared().then(() => renderTop("list")).catch(() => {});
    }

    card.append(vitalsSlot, bandSlot, h("div", { class: "cqa-chart" },
      h("section", { class: "cqa-notes", "aria-label": "Транскрипт" },
        h("div", { class: "cqa-notes-head" }, h("h2", null, "Транскрипт"),
          h("span", { class: "cqa-muted" }, isCall ? "время звонка — нажмите, чтобы прослушать" : "исходные метки времени"),
          audio, conv.has_audio ? h("a", { href: `${base}/api/conversations/${encodeURIComponent(cid)}/audio?player=true`, target: "_blank", rel: "noopener" }, "Открыть запись") : null),
        transcript),
      h("section", { class: "cqa-results", "aria-label": "Результаты по критериям" },
        h("div", { class: "cqa-results-head" }, h("h2", null, "Оценка по критериям"),
          ev ? h("span", { class: "cqa-muted" }, "нажмите на критерий или реплику-основание") : null),
        resultsBody)));
    main.replaceChildren(card);
    renderVitals();
    renderResults();
  }

  // ---------- appeals queue ----------
  async function viewAppeals(status) {
    const page = h("div", { class: "cqa-page" });
    main.replaceChildren(page);
    let rows = [];
    try { rows = await api(`/api/appeals?status=${status}`); } catch (e) { toast(e.message, true); }
    const tab = (id, label) => h("a", { class: "cqa-chip", style: "display:inline-flex;align-items:center;text-decoration:none",
      href: id === "open" ? "#/appeals" : "#/appeals/decided", "aria-pressed": String(status === id) }, label);
    page.append(h("div", { class: "cqa-page-head" }, h("h1", null, "Апелляции"),
      h("div", { class: "cqa-chips" }, tab("open", "Открытые"), tab("decided", "Рассмотренные"))));
    if (status === "open" && S.role !== "reviewer" && rows.length) {
      page.append(h("div", { class: "cqa-notice" }, "Решение принимает проверяющий — переключите роль в правом верхнем углу."));
    }
    if (!rows.length) {
      page.append(h("div", { class: "cqa-empty" }, h("h2", null, status === "open" ? "Открытых апелляций нет" : "Рассмотренных апелляций пока нет"),
        h("p", null, "Специалист оспаривает критерий в карточке диалога кнопкой «Оспорить».")));
      return;
    }
    const queue = h("div", { class: "cqa-queue" });
    page.append(queue);
    for (const a of rows) {
      const meta = a.criterion;
      const decidedBlock = (x) => {
        const from = verdict(x.previous || x.original, meta).text, to = verdict(x.decided, meta).text;
        const changed = x.action === "change";
        return h("div", { class: "cqa-case-col" },
          h("h3", { class: "cqa-case-title" }, "Решение проверяющего: ",
            h("span", { class: "cqa-case-outcome" }, changed ? `изменено ${from} → ${to}` : "оценка подтверждена")),
          h("p", null, x.reason),
          h("p", null, "Итог диалога этим решением: ", h("b", { class: "cqa-total" }, `${fmt(x.total)} → ${fmt(x.final_total)}`)),
          h("p", { class: "cqa-sign" }, `Проверяющий · ${x.decided_at ? new Date(x.decided_at).toLocaleString("ru-RU") : ""}`));
      };
      const right = a.status === "open"
        ? h("div", { class: "cqa-case-col" }, h("h3", { class: "cqa-case-title" }, "Решение"),
          S.role === "reviewer"
            ? decisionForm(a, meta, (r) => { right.replaceWith(decidedBlock(r)); refreshShared().then(() => renderTop("appeals")); })
            : h("p", { class: "cqa-muted" }, "Доступно в роли «Проверяющий»."))
        : decidedBlock(a);
      queue.append(h("article", { class: "cqa-case" },
        h("div", { class: "cqa-case-head" },
          h("h2", null, `${meta.id} · ${meta.title}`),
          h("a", { href: `#/c/${encodeURIComponent(a.conversation_id)}`, class: "cqa-id" }, a.conversation_id),
          h("span", { class: "cqa-tag cqa-tag-plain" }, CHANNEL[a.channel] || a.channel),
          h("span", { class: "cqa-tag cqa-tag-plain" }, a.language),
          h("span", { class: "cqa-muted" }, `итог сейчас ${fmt(a.current_total)}`)),
        h("div", { class: "cqa-case-body" },
          h("div", { class: "cqa-case-col" },
            h("h3", { class: "cqa-case-title" },"Спорная оценка ИИ"),
            h("div", { class: "cqa-form-row" }, verdictBox(a.original, meta),
              a.original.status === "scored" ? h("span", null, `${fmt(a.original.points)} из ${fmt(meta.weight)} баллов`) : null),
            a.original.explanation ? h("p", null, a.original.explanation) : null,
            a.original.na_reason ? h("p", { class: "cqa-na-reason" }, h("b", null, "Причина N/A: "), a.original.na_reason) : null,
            h("h3", { class: "cqa-case-title" },"Комментарий специалиста"),
            h("p", { class: "cqa-quote" }, a.comment),
            h("h3", { class: "cqa-case-title" },"Фрагмент диалога"),
            a.fragment.length ? h("div", { class: "cqa-fragment" }, a.fragment.map((m) =>
              h("div", { class: `cqa-msg cqa-msg-${m.speaker}` },
                h("span", { class: "cqa-msg-id" }, m.id),
                h("span", { class: "cqa-msg-time" }, a.channel === "voice call" && m.timestamp ? m.timestamp.slice(11, 19) : m.timestamp),
                h("div", null, h("div", { class: "cqa-msg-who" }, WHO[m.speaker] || m.speaker), h("div", { class: "cqa-msg-text" }, m.text)))))
              : h("p", { class: "cqa-muted" }, "Модель не указала реплик — откройте карточку диалога.")),
          right)));
    }
  }

  // ---------- checklist editor ----------
  async function viewChecklist() {
    const page = h("div", { class: "cqa-page" });
    main.replaceChildren(page);
    const versionId = (currentChecklist() || {}).id;
    let draft;
    try { draft = structuredClone((await api(`/api/checklists/${versionId}`)).data); } catch (e) { toast(e.message, true); return; }
    draft.sections = draft.sections || [];
    const err = h("div", { class: "cqa-form-error", role: "alert" });
    const body = h("div", { class: "cqa-editor" });

    const field = (label, input, cls) => h("label", { class: `cqa-field ${cls || ""}` }, label, input);
    const text = (obj, key, attrs = {}) => h("input", { class: "cqa-input", value: obj[key] ?? "", ...attrs,
      oninput: (e) => { obj[key] = attrs.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value; updateSum(); } });
    const area = (obj, key, rows = 2, ph = "") => h("textarea", { class: "cqa-textarea", rows: String(rows), placeholder: ph,
      oninput: (e) => { obj[key] = e.target.value; } }, obj[key] || "");

    const sum = h("span", { class: "cqa-weightsum" });
    function updateSum() {
      const total = draft.criteria.filter((c) => c.type !== "flag").reduce((s, c) => s + (Number(c.weight) || 0), 0);
      sum.textContent = `Сумма весов: ${fmt(total)}`;
      sum.classList.toggle("cqa-off", total !== 100);
      sum.title = total !== 100 ? "Итог всё равно нормируется к 100, но по чек-листу сумма весов обычно 100" : "";
    }

    function criterionBlock(c, i) {
      const move = (d) => { const j = i + d; [draft.criteria[i], draft.criteria[j]] = [draft.criteria[j], draft.criteria[i]]; render(); };
      const typeSel = h("select", { class: "cqa-select", onchange: (e) => {
        c.type = e.target.value;
        if (c.type === "scale" && !(c.scale || []).length) c.scale = [{ value: 10, label: "" }, { value: 5, label: "" }, { value: 0, label: "" }];
        if (c.type === "flag") { c.weight = 0; c.na_allowed = false; if (!(c.subtypes || []).length) c.subtypes = []; }
        render();
      } }, Object.entries(TYPE).map(([v, l]) => h("option", { value: v, selected: c.type === v }, l)));
      const secSel = h("select", { class: "cqa-select", onchange: (e) => { c.section = e.target.value; } },
        h("option", { value: "" }, "Без секции"),
        draft.sections.map((s) => h("option", { value: s.id, selected: c.section === s.id }, s.title)));
      const listEditor = (key, cols) => h("div", { class: "cqa-steps" },
        (c[key] || []).map((s, k) => h("div", { class: "cqa-step-row" },
          cols[0](s), h("input", { class: "cqa-input", value: s.label || "", placeholder: "Описание",
            oninput: (e) => { s.label = e.target.value; } }),
          h("button", { class: "cqa-btn cqa-btn-ghost cqa-btn-sm", type: "button", onclick: () => { c[key].splice(k, 1); render(); } }, "Удалить"))),
        h("div", null, h("button", { class: "cqa-btn cqa-btn-sm", type: "button",
          onclick: () => { c[key] = [...(c[key] || []), cols[1]()]; render(); } }, icon("plus"), key === "scale" ? "Ступень" : "Подтип")));
      return h("section", { class: "cqa-ed-block" },
        h("div", { class: "cqa-ed-head" },
          h("span", { class: "cqa-crit-num" }, c.id || "?"),
          h("h2", null, c.title || "Новый критерий"),
          h("span", { class: "cqa-muted" }, `${TYPE[c.type]}${c.type !== "flag" ? ` · вес ${fmt(c.weight)}` : ""}`),
          h("div", { class: "cqa-spacer" }),
          h("button", { class: "cqa-btn cqa-btn-ghost cqa-btn-sm", type: "button", disabled: i === 0, onclick: () => move(-1) }, "Выше"),
          h("button", { class: "cqa-btn cqa-btn-ghost cqa-btn-sm", type: "button", disabled: i === draft.criteria.length - 1, onclick: () => move(1) }, "Ниже"),
          h("button", { class: "cqa-btn cqa-btn-ghost cqa-btn-sm", type: "button",
            onclick: () => { if (confirm(`Удалить критерий ${c.id} «${c.title}»?`)) { draft.criteria.splice(i, 1); render(); } } }, "Удалить")),
        h("div", { class: "cqa-ed-grid" },
          field("ID", text(c, "id", { maxlength: "20", required: true })),
          field("Название", text(c, "title", { required: true })),
          field("Секция", secSel),
          field("Тип ответа", typeSel),
          c.type === "flag" ? field("Вес", h("input", { class: "cqa-input", value: "0", disabled: true }))
            : field("Вес", text(c, "weight", { type: "number", min: "0", step: "any" })),
          field("Правило (что значит «Да» / как ставить балл)", area(c, "rule", 2), "cqa-ed-wide"),
          c.type !== "flag" ? h("div", { class: "cqa-field cqa-ed-wide" },
            h("label", { class: "cqa-check" }, h("input", { type: "checkbox", checked: c.na_allowed,
              onchange: (e) => { c.na_allowed = e.target.checked; render(); } }), "Разрешить N/A"),
            c.na_allowed ? area(c, "na_condition", 2, "Условие, при котором ставится N/A") : null) : null,
          field("Как проверять (подсказка для модели)", area(c, "guidance", 3), "cqa-ed-wide"),
          c.type === "scale" ? h("div", { class: "cqa-field cqa-ed-wide" }, "Ступени шкалы (верхняя даёт полный вес)",
            listEditor("scale", [(s) => h("input", { class: "cqa-input", type: "number", step: "any", value: s.value, "aria-label": "Значение",
              oninput: (e) => { s.value = Number(e.target.value); } }), () => ({ value: 0, label: "" })])) : null,
          c.type === "flag" ? h("div", { class: "cqa-field cqa-ed-wide" }, "Подтипы нарушения",
            listEditor("subtypes", [(s) => h("input", { class: "cqa-input", value: s.id, placeholder: "id", "aria-label": "ID подтипа",
              oninput: (e) => { s.id = e.target.value; } }), () => ({ id: "", label: "" })])) : null));
    }

    function render() {
      body.replaceChildren(
        h("section", { class: "cqa-ed-block" },
          h("div", { class: "cqa-ed-head" }, h("h2", null, "Чек-лист")),
          h("div", { class: "cqa-ed-grid" },
            field("Название", text(draft, "name"), "cqa-ed-two"),
            h("div", { class: "cqa-field cqa-ed-wide" }, "Секции",
              h("div", { class: "cqa-steps" }, draft.sections.map((s, k) => h("div", { class: "cqa-step-row" },
                h("input", { class: "cqa-input", value: s.id, "aria-label": "ID секции", oninput: (e) => { s.id = e.target.value; } }),
                h("input", { class: "cqa-input", value: s.title, "aria-label": "Название секции", oninput: (e) => { s.title = e.target.value; } }),
                h("button", { class: "cqa-btn cqa-btn-ghost cqa-btn-sm", type: "button", onclick: () => { draft.sections.splice(k, 1); render(); } }, "Удалить"))),
              h("div", null, h("button", { class: "cqa-btn cqa-btn-sm", type: "button",
                onclick: () => { draft.sections.push({ id: `s${draft.sections.length + 1}`, title: "Новая секция" }); render(); } }, icon("plus"), "Секция")))),
            field("Общие правила оценки (для модели)", area(draft, "instructions", 5), "cqa-ed-wide"))),
        ...draft.criteria.map(criterionBlock),
        h("div", null, h("button", { class: "cqa-btn", type: "button", onclick: () => {
          const ids = new Set(draft.criteria.map((c) => c.id));
          let n = draft.criteria.length + 1;
          while (ids.has(String(n).padStart(2, "0"))) n++;
          draft.criteria.push({ id: String(n).padStart(2, "0"), section: (draft.sections[0] || {}).id || "", title: "", type: "binary",
            weight: 5, na_allowed: false, rule: "", na_condition: "", guidance: "", scale: [], subtypes: [] });
          render();
          body.lastElementChild.previousElementSibling.scrollIntoView({ behavior: "smooth", block: "center" });
        } }, icon("plus"), "Добавить критерий")));
      updateSum();
    }

    async function save(apply) {
      err.textContent = "";
      try {
        const { id } = await api("/api/checklists", { body: draft });
        S.checklistId = null; // the new version is the latest
        if (apply) {
          S.job = await api("/api/batch", { body: { group_id: S.group || null, checklist_id: id } });
          toast(`Чек-лист v${id} сохранён, оценка набора запущена`);
          location.hash = "#/";
        } else {
          toast(`Сохранено как версия v${id}`);
          route_();
        }
      } catch (e) { err.textContent = e.message; err.scrollIntoView({ block: "center" }); }
    }

    page.append(
      h("div", { class: "cqa-page-head" }, h("h1", null, "Чек-лист"),
        h("span", { class: "cqa-sub" }, "Критерии, веса, шкалы и правила N/A. Каждое сохранение — новая версия; прежние оценки остаются."),
        h("div", { class: "cqa-spacer" }), h("label", { class: "cqa-field" }, "Открыть версию", checklistSelect(() => route_()))),
      body,
      h("div", { class: "cqa-sticky-bar" }, sum, err, h("div", { class: "cqa-spacer" }),
        h("button", { class: "cqa-btn", type: "button", onclick: () => save(false) }, "Сохранить версию"),
        h("button", { class: "cqa-btn cqa-btn-primary", type: "button", onclick: () => save(true),
          disabled: !canEvaluate(), title: canEvaluate() ? null : NO_KEY }, icon("run"),
          `Сохранить и применить к ${S.group ? `набору ${S.group}` : "всем диалогам"}`)));
    render();
  }

  route_();
  return { destroy: () => window.removeEventListener("hashchange", route_) };
}
