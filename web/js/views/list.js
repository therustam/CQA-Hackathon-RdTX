// Conversations: one panel = filter toolbar + table. Import and batch run live in the top bar.
import { h, icon, fmt, store, dialog, tone, CHANNEL } from "../ui.js";

const STATUS = [["", "Все"], ["none", "Не оценён"], ["ok", "Оценён"], ["review", "Проверка / ошибка"],
  ["appeal", "Апелляция"], ["flag", "Грубая ошибка"]];
const SCORE = [["", "Любой"], ["low", "до 70"], ["mid", "70–90"], ["high", "90+"]];

function openImport(ctx) {
  const { S, api, toast } = ctx;
  const done = (r, text) => {
    S.group = r.group_id;
    store("cqa.group", S.group);
    toast(text);
    dlg.close();
    ctx.route_();
  };
  const err = h("p", { class: "cqa-form-error", role: "alert" });
  const gid = h("input", { class: "cqa-input", placeholder: "например, DEV", required: true, "aria-label": "group_id" });
  const btn = h("button", { class: "cqa-btn cqa-btn-primary", type: "submit" }, "Импортировать");
  const file = h("input", { type: "file", accept: ".json,.txt,application/json", class: "cqa-hidden-file", id: "cqa-upload",
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await api("/api/upload", { body: fd });
        done(r, `Загружено диалогов: ${r.imported}${r.problems.length ? `, отклонено: ${r.problems.length}` : ""}`);
      } catch (ex) { err.textContent = ex.message; }
    } });
  const dlg = dialog(ctx.root, "Импорт диалогов",
    h("form", { class: "cqa-stack", onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = "Загрузка…";
      try {
        const r = await api("/api/import", { body: { group_id: gid.value.trim() } });
        done(r, `Импортировано из «${r.group_id}»: ${r.imported}`);
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        btn.textContent = "Импортировать";
      }
    } },
    h("label", { class: "cqa-field" }, "Набор организаторов (group_id)", h("div", { class: "cqa-row" }, gid, btn))),
    h("div", { class: "cqa-or" }, "или"),
    h("label", { class: "cqa-drop", for: "cqa-upload", tabindex: "0",
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } } },
    icon("file"), h("b", null, "Загрузить JSON-файл"), h("span", null, "Транскрипты в формате организаторов"), file),
    err);
  gid.focus();
}

export async function viewList(ctx) {
  const { S, api, toast, base } = ctx;
  let items = [];

  const exportLink = h("a", { class: "cqa-btn", download: "results.json",
    title: "Результаты набора в формате организаторов (JSON 1.0)" }, icon("download"), "results.json");
  const runBtn = h("button", {
    class: "cqa-btn cqa-btn-primary", type: "button", disabled: !ctx.canEvaluate(), title: ctx.canEvaluate() ? null : ctx.NO_KEY,
    onclick: async () => {
      try { ctx.startJob(await api("/api/batch", { body: { group_id: S.group || null, checklist_id: S.checklistId } })); }
      catch (err) { toast(err.message, true); }
    },
  }, icon("run"), "Оценить набор");
  ctx.setTop([["Диалоги"]], [
    h("button", { class: "cqa-btn", type: "button", onclick: () => openImport(ctx) }, icon("upload"), "Импорт"),
    exportLink, runBtn]);

  // a pill is "active" when it narrows the list (value other than the first "all" option)
  const filter = (label, el) => {
    const pill = h("label", { class: "cqa-filter", "data-active": el.selectedIndex > 0 }, h("span", null, label), el);
    el.addEventListener("change", () => pill.toggleAttribute("data-active", el.selectedIndex > 0));
    return pill;
  };
  const localSelect = (key, options) => h("select", { onchange: (e) => { S.filters[key] = e.target.value; renderRows(); } },
    options.map(([v, l]) => h("option", { value: v, selected: S.filters[key] === v }, l)));
  const groupSelect = h("select", { onchange: (e) => { S.group = e.target.value; store("cqa.group", S.group); load(); } },
    h("option", { value: "" }, "Все"),
    S.groups.map((g) => h("option", { value: g.group_id, selected: g.group_id === S.group }, `${g.group_id} · ${g.n}`)));

  const toolbar = h("div", { class: "cqa-panel-bar" },
    h("label", { class: "cqa-search" }, icon("search"),
      h("input", { placeholder: "Поиск по ID", value: S.filters.q, "aria-label": "Поиск по ID",
        oninput: (e) => { S.filters.q = e.target.value; renderRows(); } })),
    filter("Набор", groupSelect),
    filter("Чек-лист", ctx.checklistSelect(load, "")),
    filter("Язык", localSelect("lang", [["", "Все"], ["RU", "RU"], ["KZ", "KZ"], ["EN", "EN"]])),
    filter("Канал", localSelect("channel", [["", "Все"], ["agent chat", "Чат"], ["voice call", "Звонок"]])),
    filter("Статус", localSelect("status", STATUS)),
    filter("Итог", localSelect("score", SCORE)));
  const reset = h("button", { class: "cqa-filter-reset", type: "button", hidden: true,
    onclick: () => { Object.assign(S.filters, { lang: "", channel: "", status: "", score: "", q: "" }); viewList(ctx); } }, "Сбросить");
  toolbar.append(reset);

  const tbody = h("tbody");
  const table = h("table", { class: "cqa-table" },
    h("thead", null, h("tr", null,
      h("th", null, "Диалог"), h("th", null, "Канал"), h("th", null, "Язык"), h("th", { class: "cqa-num" }, "Реплик"),
      h("th", null, "Статус"), h("th", { class: "cqa-num" }, "Итог"), h("th", null, h("span", { class: "cqa-sr" }, "Действие")))),
    tbody);
  const foot = h("div", { class: "cqa-panel-foot" });

  ctx.main.replaceChildren(h("div", { class: "cqa-page" },
    h("div", { class: "cqa-page-head" },
      h("div", null, h("h1", null, "Диалоги"),
        h("p", null, "Чаты и звонки операторов, оценённые по чек-листу. Откройте строку, чтобы увидеть основания."))),
    S.config.has_api_key ? null : h("div", { class: "cqa-notice cqa-notice-warn" }, icon("alert"),
      "Модель не подключена: задайте OPENAI_API_KEY или ANTHROPIC_API_KEY в .env. Просмотр, апелляции и редактор работают, новая оценка — нет."),
    h("section", { class: "cqa-panel" }, toolbar, h("div", { class: "cqa-table-wrap" }, table), foot)));

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

  function scoreCell(ev) {
    if (!ev || ev.final_total == null) return h("span", { class: "cqa-muted" }, "—");
    const changed = ev.final_total !== ev.total;
    return h("div", { class: "cqa-score-cell" },
      changed ? h("s", { title: "Итог ИИ до решения проверяющего" }, fmt(ev.total)) : null,
      h("b", null, fmt(ev.final_total)),
      h("span", { class: `cqa-minibar cqa-tone-${tone(ev.final_total)}`, "aria-hidden": "true" },
        h("i", { style: `width:${Math.max(0, Math.min(100, ev.final_total))}%` })));
  }

  function renderRows() {
    const rows = items.filter(matches);
    reset.hidden = !Object.values(S.filters).some(Boolean);
    const evaluated = items.filter((i) => i.evaluation && i.evaluation.status !== "error").length;
    const flagged = items.filter((i) => i.evaluation && i.evaluation.flags.length).length;
    foot.replaceChildren(
      h("span", null, `Показано ${rows.length} из ${items.length}`),
      h("span", null, `оценено ${evaluated}`),
      flagged ? h("span", null, `грубых ошибок ${flagged}`) : null);
    if (!rows.length) {
      tbody.replaceChildren(h("tr", { class: "cqa-empty-row" }, h("td", { colspan: "7" }, h("div", { class: "cqa-empty" },
        items.length
          ? [h("h2", null, "Ничего не найдено"), h("p", null, "Измените фильтры или строку поиска.")]
          : [h("h2", null, "Диалогов пока нет"), h("p", null, "Импортируйте набор организаторов или JSON-файл с транскриптами."),
            h("button", { class: "cqa-btn cqa-btn-primary", type: "button", onclick: () => openImport(ctx) }, icon("upload"), "Импорт")]))));
      return;
    }
    tbody.replaceChildren(...rows.map((it) => {
      const ev = it.evaluation;
      const open = () => { location.hash = `#/c/${encodeURIComponent(it.id)}`; };
      return h("tr", { tabindex: "0", onclick: open, onkeydown: (e) => { if (e.key === "Enter") open(); } },
        h("td", null, h("span", { class: "cqa-id" }, it.id)),
        h("td", null, h("span", { class: "cqa-with-icon" }, icon(it.channel === "voice call" ? "phone" : "chat"), CHANNEL[it.channel] || it.channel)),
        h("td", null, h("span", { class: "cqa-lang" }, it.language)),
        h("td", { class: "cqa-num" }, it.messages),
        h("td", null, h("div", { class: "cqa-badges" }, ctx.statusTags(ev))),
        h("td", { class: "cqa-num" }, scoreCell(ev)),
        h("td", { class: "cqa-num cqa-row-action" }, ev ? icon("next") : h("button", {
          class: "cqa-btn cqa-btn-sm", type: "button", disabled: !ctx.canEvaluate(), title: ctx.canEvaluate() ? null : ctx.NO_KEY,
          onclick: async (e) => {
            e.stopPropagation();
            const b = e.currentTarget;
            b.disabled = true;
            b.textContent = "Оценка…";
            try { await api("/api/evaluate", { body: { conversation_id: it.id, checklist_id: S.checklistId } }); }
            catch (err) { toast(err.message, true); }
            load();
          },
        }, "Оценить")));
    }));
  }

  async function load() {
    const q = new URLSearchParams();
    if (S.group) q.set("group_id", S.group);
    if (S.checklistId) q.set("checklist_id", S.checklistId);
    exportLink.href = `${base}/api/export?${q}`;
    try { items = (await api(`/api/conversations?${q}`)).items; } catch (err) { toast(err.message, true); }
    renderRows();
  }
  ctx.onJob(load);
  await load();
}
