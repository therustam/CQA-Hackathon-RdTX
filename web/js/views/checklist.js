// Checklist: structure tree on the left, the selected item on the right. Read-only until «Редактировать»,
// so nothing changes by a stray keystroke; «Отменить» drops the draft. Every save is a new version and
// earlier evaluations keep theirs. Criterion wording lives only in the loaded checklist data.
import { h, icon, fmt, TYPE } from "../ui.js";

const blankCriterion = (id, section) => ({ id, section, title: "", type: "binary", weight: 5, na_allowed: false,
  rule: "", na_condition: "", guidance: "", scale: [], subtypes: [] });
const sumWeights = (list) => list.filter((c) => c.type !== "flag").reduce((t, c) => t + (Number(c.weight) || 0), 0);

export async function viewChecklist(ctx) {
  const { S, api, toast, main } = ctx;
  const version = ctx.currentChecklist() || {};
  let saved;
  try { saved = (await api(`/api/checklists/${version.id}`)).data; } catch (e) { toast(e.message, true); return; }
  saved.sections = saved.sections || [];
  let draft = structuredClone(saved);
  let editing = false;
  let dirty = false;
  let sel = "settings"; // "settings" | "c:<index>" | "s:<section id>"

  const nav = h("div", { class: "cqa-scroll cqa-tree" });
  const navFoot = h("div", { class: "cqa-tree-foot" });
  const editor = h("div", { class: "cqa-scroll cqa-editor" });
  const err = h("p", { class: "cqa-form-error", role: "alert" });

  const touch = () => { if (!dirty) { dirty = true; renderTop(); } renderNav(); };
  const select = (key) => { sel = key; renderNav(); renderEditor(); };
  ctx.guardLeave(() => dirty);

  // ---- edit-mode inputs write straight into the draft; only the tree re-renders, so focus stays put
  const field = (label, input, hint) => h("label", { class: "cqa-field" }, label, input, hint ? h("span", { class: "cqa-hint" }, hint) : null);
  const text = (obj, key, attrs = {}) => h("input", { class: "cqa-input", value: obj[key] ?? "", ...attrs,
    oninput: (e) => { obj[key] = attrs.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value; touch(); } });
  const area = (obj, key, rows = 3, ph = "") => h("textarea", { class: "cqa-textarea", rows: String(rows), placeholder: ph,
    oninput: (e) => { obj[key] = e.target.value; touch(); } }, obj[key] || "");
  // ---- view-mode property
  const prop = (label, value) => h("div", { class: "cqa-prop" }, h("span", { class: "cqa-prop-label" }, label),
    h("div", { class: "cqa-prop-value" }, value || h("span", { class: "cqa-muted" }, "не задано")));

  function renderTop() {
    const actions = editing
      ? [dirty ? h("span", { class: "cqa-tag cqa-tag-warn" }, "не сохранено") : null,
        h("button", { class: "cqa-btn cqa-btn-ghost", type: "button", onclick: cancel }, "Отменить"),
        h("button", { class: "cqa-btn", type: "button", disabled: !dirty, onclick: () => save(false) }, "Сохранить версию"),
        h("button", { class: "cqa-btn cqa-btn-primary", type: "button", onclick: () => save(true),
          disabled: !dirty || !ctx.canEvaluate(), title: ctx.canEvaluate() ? `Сохранить и оценить ${S.group ? `набор ${S.group}` : "все диалоги"}` : ctx.NO_KEY },
        icon("run"), "Сохранить и применить")]
      : [h("label", { class: "cqa-filter" }, h("span", null, "Версия"), ctx.checklistSelect(() => ctx.route_(), "")),
        h("button", { class: "cqa-btn cqa-btn-primary", type: "button", onclick: () => { editing = true; renderAll(); } }, icon("edit"), "Редактировать")];
    ctx.setTop([["Чек-листы"], [`v${version.id}${editing ? " · редактирование" : ""}`]], actions);
  }

  function cancel() {
    if (dirty && !confirm("Отменить все несохранённые изменения?")) return;
    draft = structuredClone(saved);
    editing = dirty = false;
    if (sel.startsWith("c:") && !draft.criteria[+sel.slice(2)]) sel = "settings";
    if (sel.startsWith("s:") && !draft.sections.some((s) => `s:${s.id}` === sel)) sel = "settings";
    renderAll();
  }

  function renderNav() {
    const item = (key, label, extra) => h("button", { class: "cqa-tree-item", type: "button", "aria-current": sel === key ? "true" : null,
      onclick: () => select(key) }, label, extra);
    const indexed = draft.criteria.map((c, i) => [c, i]);
    const groups = draft.sections.map((s) => [s, indexed.filter(([c]) => c.section === s.id)]);
    const loose = indexed.filter(([c]) => !draft.sections.some((s) => s.id === c.section));
    if (loose.length) groups.push([null, loose]);
    nav.replaceChildren(
      item("settings", h("span", { class: "cqa-tree-label" }, icon("checklist"), "Общие настройки")),
      ...groups.map(([s, items]) => h("div", { class: "cqa-tree-group" },
        s ? h("button", { class: "cqa-tree-section", type: "button", "aria-current": sel === `s:${s.id}` ? "true" : null, onclick: () => select(`s:${s.id}`) },
          h("span", null, s.title || "Секция"), h("span", null, fmt(sumWeights(items.map(([c]) => c)))))
          : h("div", { class: "cqa-tree-section" }, h("span", null, "Без секции")),
        items.map(([c, i]) => item(`c:${i}`,
          h("span", { class: "cqa-tree-label" }, h("span", { class: "cqa-tree-num" }, c.id || "?"), h("span", { class: "cqa-tree-title" }, c.title || "Новый критерий")),
          h("span", { class: "cqa-tree-weight" }, c.type === "flag" ? "флаг" : fmt(c.weight)))))),
      editing ? h("div", { class: "cqa-tree-adds" },
        h("button", { class: "cqa-btn cqa-btn-ghost cqa-btn-sm", type: "button", onclick: addCriterion }, icon("plus"), "Критерий"),
        h("button", { class: "cqa-btn cqa-btn-ghost cqa-btn-sm", type: "button", onclick: addSection }, icon("plus"), "Секция")) : "");
    const t = sumWeights(draft.criteria);
    navFoot.replaceChildren(
      h("div", { class: "cqa-tree-sum" }, h("span", null, "Сумма весов"), h("b", { class: t === 100 ? null : "cqa-warn-text" }, `${fmt(t)} / 100`)),
      h("span", { class: `cqa-minibar cqa-minibar-wide cqa-tone-${t === 100 ? "ok" : "warn"}`, "aria-hidden": "true" }, h("i", { style: `width:${Math.min(100, t)}%` })),
      t === 100 ? "" : h("span", { class: "cqa-hint" }, "Итог всё равно нормируется к 100, но по чек-листу сумма обычно 100."));
  }

  function addCriterion() {
    const ids = new Set(draft.criteria.map((c) => c.id));
    let n = draft.criteria.length + 1;
    while (ids.has(String(n).padStart(2, "0"))) n++;
    const section = sel.startsWith("s:") ? sel.slice(2) : (draft.sections[0] || {}).id || "";
    draft.criteria.push(blankCriterion(String(n).padStart(2, "0"), section));
    touch();
    select(`c:${draft.criteria.length - 1}`);
    editor.querySelector("input")?.focus();
  }

  function addSection() {
    const ids = new Set(draft.sections.map((s) => s.id));
    let n = draft.sections.length + 1;
    while (ids.has(`s${n}`)) n++; // service id is generated; only the title is the user's
    draft.sections.push({ id: `s${n}`, title: "Новая секция" });
    touch();
    select(`s:s${n}`);
    editor.querySelector("input")?.select();
  }

  const head = (kicker, title, sub, actions) => h("header", { class: "cqa-ed-head" },
    h("div", null, kicker ? h("span", { class: "cqa-ed-kicker" }, kicker) : null, h("h2", null, title), sub ? h("p", null, sub) : null),
    actions ? h("div", { class: "cqa-row" }, actions) : null);

  function settingsView() {
    const sub = `Версия v${version.id}. Сохранение создаёт новую версию, прежние оценки остаются со своей.`;
    if (!editing) {
      return [head(null, "Общие настройки", sub),
        h("section", { class: "cqa-ed-section" }, prop("Название", draft.name)),
        h("section", { class: "cqa-ed-section" }, prop("Общие правила оценки", draft.instructions && h("p", { class: "cqa-prose" }, draft.instructions)))];
    }
    return [head(null, "Общие настройки", sub),
      h("section", { class: "cqa-ed-section" }, field("Название чек-листа", text(draft, "name"))),
      h("section", { class: "cqa-ed-section" }, field("Общие правила оценки", area(draft, "instructions", 14),
        "Передаются модели вместе с каждым критерием: язык, трактовка «Нет» и N/A, как указывать реплики."))];
  }

  function sectionView(id) {
    const s = draft.sections.find((x) => x.id === id);
    const inside = draft.criteria.map((c, i) => [c, i]).filter(([c]) => c.section === id);
    const list = h("div", { class: "cqa-chips" }, inside.length
      ? inside.map(([c, i]) => h("button", { class: "cqa-chip", type: "button", onclick: () => select(`c:${i}`) }, `${c.id} · ${c.title || "без названия"}`))
      : h("span", { class: "cqa-muted" }, "Критериев нет"));
    const sub = `Результат секции — набранные баллы её критериев из доступных; показывается в карточке диалога. Вес: ${fmt(sumWeights(inside.map(([c]) => c)))}.`;
    if (!editing) return [head("Секция", s.title, sub), h("section", { class: "cqa-ed-section" }, prop("Критерии", list))];
    const del = h("button", { class: "cqa-btn cqa-btn-sm cqa-btn-danger", type: "button", disabled: inside.length > 0,
      title: inside.length ? "Сначала перенесите критерии в другую секцию" : null,
      onclick: () => { draft.sections = draft.sections.filter((x) => x.id !== id); touch(); select("settings"); } }, "Удалить секцию");
    return [head("Секция", s.title || "Новая секция", sub, [del]),
      h("section", { class: "cqa-ed-section" }, field("Название", text(s, "title")), prop("Критерии", list))];
  }

  function listEditor(c, key, first, blank, label) {
    return h("div", { class: "cqa-list-edit" },
      (c[key] || []).map((s, k) => h("div", { class: "cqa-list-row" },
        first(s),
        h("input", { class: "cqa-input", value: s.label || "", placeholder: "Описание", oninput: (e) => { s.label = e.target.value; touch(); } }),
        h("button", { class: "cqa-icon-btn", type: "button", "aria-label": "Удалить", onclick: () => { c[key].splice(k, 1); touch(); renderEditor(); } }, icon("x")))),
      h("div", null, h("button", { class: "cqa-btn cqa-btn-sm", type: "button", onclick: () => { c[key] = [...(c[key] || []), blank()]; touch(); renderEditor(); } },
        icon("plus"), label)));
  }

  function criterionView(i) {
    const c = draft.criteria[i];
    const section = (draft.sections.find((s) => s.id === c.section) || {}).title || "Без секции";
    if (!editing) {
      const steps = (key, fmtRow) => (c[key] || []).length ? h("ul", { class: "cqa-prop-list" }, c[key].map((s) => h("li", null, fmtRow(s)))) : null;
      return [head(`Критерий ${c.id}`, c.title || "Без названия", null),
        h("section", { class: "cqa-ed-section cqa-props-row" },
          prop("Секция", section), prop("Тип ответа", TYPE[c.type] || c.type),
          prop("Вес", c.type === "flag" ? "без баллов" : fmt(c.weight)),
          c.type === "flag" ? null : prop("N/A", c.na_allowed ? "разрешён" : "не допускается")),
        h("section", { class: "cqa-ed-section" },
          prop("Правило", c.rule && h("p", { class: "cqa-prose" }, c.rule)),
          prop("Как проверять", c.guidance && h("p", { class: "cqa-prose" }, c.guidance)),
          c.na_allowed ? prop("Условие N/A", c.na_condition && h("p", { class: "cqa-prose" }, c.na_condition)) : null,
          c.type === "scale" ? prop("Ступени шкалы", steps("scale", (s) => [h("b", null, fmt(s.value)), " — ", s.label || "без описания"])) : null,
          c.type === "flag" ? prop("Подтипы нарушения", steps("subtypes", (s) => s.label || s.id)) : null)];
    }
    const move = (d) => { const j = i + d; [draft.criteria[i], draft.criteria[j]] = [draft.criteria[j], draft.criteria[i]]; touch(); select(`c:${j}`); };
    const setType = (t) => {
      c.type = t;
      if (t === "scale" && !(c.scale || []).length) c.scale = [{ value: 10, label: "" }, { value: 5, label: "" }, { value: 0, label: "" }];
      if (t === "flag") { c.weight = 0; c.na_allowed = false; c.subtypes = c.subtypes || []; }
      touch();
      renderEditor();
    };
    return [
      head(`Критерий ${c.id}`, c.title || "Новый критерий", null, [
        h("button", { class: "cqa-btn cqa-btn-sm", type: "button", disabled: i === 0, onclick: () => move(-1) }, "Выше"),
        h("button", { class: "cqa-btn cqa-btn-sm", type: "button", disabled: i === draft.criteria.length - 1, onclick: () => move(1) }, "Ниже"),
        h("button", { class: "cqa-btn cqa-btn-sm cqa-btn-danger", type: "button",
          onclick: () => { if (confirm(`Удалить критерий ${c.id} «${c.title}»?`)) { draft.criteria.splice(i, 1); touch(); select("settings"); } } }, "Удалить")]),
      h("section", { class: "cqa-ed-section cqa-ed-grid" },
        h("div", { class: "cqa-ed-wide" }, field("Название", text(c, "title", { required: true }))),
        field("Секция", h("select", { class: "cqa-select", onchange: (e) => { c.section = e.target.value; touch(); } },
          h("option", { value: "" }, "Без секции"),
          draft.sections.map((s) => h("option", { value: s.id, selected: c.section === s.id }, s.title)))),
        c.type === "flag" ? field("Вес", h("input", { class: "cqa-input", value: "без баллов", disabled: true }))
          : field("Вес", text(c, "weight", { type: "number", min: "0", step: "any" })),
        h("div", { class: "cqa-ed-wide cqa-field" }, "Тип ответа",
          h("div", { class: "cqa-seg cqa-seg-inline", role: "group", "aria-label": "Тип ответа" },
            Object.entries(TYPE).map(([v, l]) => h("button", { type: "button", "aria-pressed": String(c.type === v), onclick: () => setType(v) }, l))))),
      h("section", { class: "cqa-ed-section" },
        field("Правило", area(c, "rule", 3), "Что значит «Да» или как ставится балл."),
        field("Как проверять", area(c, "guidance", 4), "Подсказка для модели: где искать и что считать основанием.")),
      c.type === "scale" ? h("section", { class: "cqa-ed-section" }, h("h3", null, "Ступени шкалы"),
        h("span", { class: "cqa-hint" }, "Верхняя ступень даёт полный вес."),
        listEditor(c, "scale", (s) => h("input", { class: "cqa-input cqa-input-id", type: "number", step: "any", value: s.value, "aria-label": "Значение",
          oninput: (e) => { s.value = Number(e.target.value); touch(); } }), () => ({ value: 0, label: "" }), "Ступень")) : null,
      c.type === "flag" ? h("section", { class: "cqa-ed-section" }, h("h3", null, "Подтипы нарушения"),
        listEditor(c, "subtypes", (s) => h("input", { class: "cqa-input cqa-input-id", value: s.id, placeholder: "id", "aria-label": "ID подтипа",
          oninput: (e) => { s.id = e.target.value; touch(); } }), () => ({ id: "", label: "" }), "Подтип")) : null,
      c.type !== "flag" ? h("section", { class: "cqa-ed-section" },
        h("label", { class: "cqa-switch" }, h("input", { type: "checkbox", checked: c.na_allowed,
          onchange: (e) => { c.na_allowed = e.target.checked; touch(); renderEditor(); } }),
        h("span", null, h("b", null, "Разрешить N/A"), h("small", null, "Если критерий неприменим, его вес перераспределяется на остальные."))),
        c.na_allowed ? field("Условие N/A", area(c, "na_condition", 2, "Когда критерий неприменим")) : null) : null,
      h("details", { class: "cqa-ed-section cqa-advanced" }, h("summary", null, "Дополнительно"),
        field("ID критерия", text(c, "id", { maxlength: "20", required: true, class: "cqa-input cqa-input-id" }),
          "Используется в ссылках и апелляциях. Меняйте только у нового критерия.")),
    ];
  }

  function renderEditor() {
    let view;
    if (sel.startsWith("c:") && draft.criteria[+sel.slice(2)]) view = criterionView(+sel.slice(2));
    else if (sel.startsWith("s:") && draft.sections.some((s) => s.id === sel.slice(2))) view = sectionView(sel.slice(2));
    else view = settingsView();
    editor.classList.toggle("cqa-editing", editing);
    editor.replaceChildren(...view.filter(Boolean));
    editor.scrollTop = 0;
  }

  function renderAll() { renderTop(); renderNav(); renderEditor(); }

  async function save(apply) {
    err.textContent = "";
    try {
      const { id } = await api("/api/checklists", { body: draft });
      dirty = false; // saved: leaving is safe now
      S.checklistId = null; // the new version is the latest
      if (apply) {
        ctx.startJob(await api("/api/batch", { body: { group_id: S.group || null, checklist_id: id } }));
        toast(`Чек-лист v${id} сохранён, оценка набора запущена`);
        location.hash = "#/dialogs";
      } else {
        toast(`Сохранено как версия v${id}`);
        ctx.route_();
      }
    } catch (e) { err.textContent = e.message; }
  }

  main.replaceChildren(h("div", { class: "cqa-card" },
    h("div", { class: "cqa-page-head" }, h("div", null, h("h1", null, saved.name || "Чек-лист"),
      h("p", null, `${saved.criteria.length} критериев · ${saved.sections.length} секций. Новый критерий начинает работать после сохранения, без изменений в коде.`))),
    err,
    h("div", { class: "cqa-inbox cqa-ed-layout" },
      h("section", { class: "cqa-panel cqa-pane", "aria-label": "Структура" },
        h("div", { class: "cqa-panel-head" }, h("h2", null, "Структура")), nav, navFoot),
      h("section", { class: "cqa-panel cqa-pane", "aria-label": "Редактор" }, editor))));
  renderAll();
}
