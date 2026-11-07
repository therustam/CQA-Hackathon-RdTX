// Checklist editor: structure on the left, the selected item on the right. Every save is a new version;
// earlier evaluations keep theirs. Criterion wording lives only in the loaded checklist data.
import { h, icon, fmt, TYPE } from "../ui.js";

const blankCriterion = (id, section) => ({ id, section, title: "", type: "binary", weight: 5, na_allowed: false,
  rule: "", na_condition: "", guidance: "", scale: [], subtypes: [] });

export async function viewChecklist(ctx) {
  const { S, api, toast, main } = ctx;
  const version = ctx.currentChecklist() || {};
  let draft;
  try { draft = structuredClone((await api(`/api/checklists/${version.id}`)).data); } catch (e) { toast(e.message, true); return; }
  draft.sections = draft.sections || [];
  let sel = "settings"; // "settings" | criterion index

  const nav = h("div", { class: "cqa-scroll cqa-tree" });
  const navFoot = h("div", { class: "cqa-tree-foot" });
  const editor = h("div", { class: "cqa-scroll cqa-editor" });
  const err = h("p", { class: "cqa-form-error", role: "alert" });
  const dirtyBadge = h("span", { class: "cqa-tag cqa-tag-warn", hidden: true }, "не сохранено");

  const touch = () => { dirtyBadge.hidden = false; renderNav(); };
  const total = () => draft.criteria.filter((c) => c.type !== "flag").reduce((s, c) => s + (Number(c.weight) || 0), 0);

  // inputs write straight into the draft; only the structure panel re-renders, so focus stays put
  const field = (label, input, hint) => h("label", { class: "cqa-field" }, label, input, hint ? h("span", { class: "cqa-hint" }, hint) : null);
  const text = (obj, key, attrs = {}) => h("input", { class: "cqa-input", value: obj[key] ?? "", ...attrs,
    oninput: (e) => { obj[key] = attrs.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value; touch(); } });
  const area = (obj, key, rows = 3, ph = "") => h("textarea", { class: "cqa-textarea", rows: String(rows), placeholder: ph,
    oninput: (e) => { obj[key] = e.target.value; touch(); } }, obj[key] || "");

  function renderNav() {
    const item = (key, label, extra) => h("button", { class: "cqa-tree-item", type: "button", "aria-current": sel === key ? "true" : null,
      onclick: () => { sel = key; renderNav(); renderEditor(); } }, label, extra);
    const indexed = draft.criteria.map((c, i) => [c, i]);
    const groups = draft.sections.map((s) => [s, indexed.filter(([c]) => c.section === s.id)]);
    const loose = indexed.filter(([c]) => !draft.sections.some((s) => s.id === c.section));
    if (loose.length) groups.push([{ id: "", title: "Без секции" }, loose]);
    nav.replaceChildren(
      item("settings", h("span", { class: "cqa-tree-label" }, icon("checklist"), "Общие настройки")),
      ...groups.map(([s, items]) => h("div", { class: "cqa-tree-group" },
        h("div", { class: "cqa-tree-section" }, h("span", null, s.title || "Секция"),
          h("span", null, fmt(items.filter(([c]) => c.type !== "flag").reduce((t, [c]) => t + (Number(c.weight) || 0), 0)))),
        items.map(([c, i]) => item(i,
          h("span", { class: "cqa-tree-label" }, h("span", { class: "cqa-tree-num" }, c.id || "?"), h("span", { class: "cqa-tree-title" }, c.title || "Новый критерий")),
          h("span", { class: "cqa-tree-weight" }, c.type === "flag" ? "флаг" : fmt(c.weight)))))),
      h("button", { class: "cqa-btn cqa-btn-ghost cqa-btn-sm cqa-tree-add", type: "button", onclick: addCriterion }, icon("plus"), "Критерий"));
    const t = total();
    navFoot.replaceChildren(
      h("div", { class: "cqa-tree-sum" }, h("span", null, "Сумма весов"), h("b", { class: t === 100 ? null : "cqa-warn-text" }, `${fmt(t)} / 100`)),
      h("span", { class: `cqa-minibar cqa-minibar-wide cqa-tone-${t === 100 ? "ok" : "warn"}`, "aria-hidden": "true" }, h("i", { style: `width:${Math.min(100, t)}%` })),
      t === 100 ? "" : h("span", { class: "cqa-hint" }, "Итог всё равно нормируется к 100, но по чек-листу сумма обычно 100."));
  }

  function addCriterion() {
    const ids = new Set(draft.criteria.map((c) => c.id));
    let n = draft.criteria.length + 1;
    while (ids.has(String(n).padStart(2, "0"))) n++;
    draft.criteria.push(blankCriterion(String(n).padStart(2, "0"), (draft.sections[0] || {}).id || ""));
    sel = draft.criteria.length - 1;
    touch();
    renderEditor();
    editor.querySelector("input")?.focus();
  }

  function settingsEditor() {
    return [
      h("header", { class: "cqa-ed-head" }, h("div", null, h("h2", null, "Общие настройки"),
        h("p", null, `Версия v${version.id}. Сохранение создаёт новую версию, прежние оценки остаются со своей.`))),
      h("section", { class: "cqa-ed-section" }, field("Название чек-листа", text(draft, "name"))),
      h("section", { class: "cqa-ed-section" },
        h("h3", null, "Секции"),
        h("div", { class: "cqa-list-edit" }, draft.sections.map((s, k) => h("div", { class: "cqa-list-row" },
          h("input", { class: "cqa-input", value: s.title, "aria-label": "Название секции", oninput: (e) => { s.title = e.target.value; touch(); } }),
          h("input", { class: "cqa-input cqa-input-id", value: s.id, "aria-label": "ID секции", title: "Служебный ID секции", oninput: (e) => { s.id = e.target.value; touch(); } }),
          h("button", { class: "cqa-icon-btn", type: "button", "aria-label": `Удалить секцию ${s.title}`,
            onclick: () => { draft.sections.splice(k, 1); touch(); renderEditor(); } }, icon("x"))))),
        h("div", null, h("button", { class: "cqa-btn cqa-btn-sm", type: "button",
          onclick: () => { draft.sections.push({ id: `s${draft.sections.length + 1}`, title: "Новая секция" }); touch(); renderEditor(); } }, icon("plus"), "Секция"))),
      h("section", { class: "cqa-ed-section" },
        field("Общие правила оценки", area(draft, "instructions", 14),
          "Передаются модели вместе с каждым критерием: язык, трактовка «Нет» и N/A, как указывать реплики.")),
    ];
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

  function criterionEditor(i) {
    const c = draft.criteria[i];
    const move = (d) => { const j = i + d; [draft.criteria[i], draft.criteria[j]] = [draft.criteria[j], draft.criteria[i]]; sel = j; touch(); renderEditor(); };
    const setType = (t) => {
      c.type = t;
      if (t === "scale" && !(c.scale || []).length) c.scale = [{ value: 10, label: "" }, { value: 5, label: "" }, { value: 0, label: "" }];
      if (t === "flag") { c.weight = 0; c.na_allowed = false; c.subtypes = c.subtypes || []; }
      touch();
      renderEditor();
    };
    return [
      h("header", { class: "cqa-ed-head" },
        h("div", null, h("span", { class: "cqa-ed-kicker" }, `Критерий ${c.id}`), h("h2", null, c.title || "Новый критерий")),
        h("div", { class: "cqa-row" },
          h("button", { class: "cqa-btn cqa-btn-sm", type: "button", disabled: i === 0, onclick: () => move(-1) }, "Выше"),
          h("button", { class: "cqa-btn cqa-btn-sm", type: "button", disabled: i === draft.criteria.length - 1, onclick: () => move(1) }, "Ниже"),
          h("button", { class: "cqa-btn cqa-btn-sm cqa-btn-danger", type: "button",
            onclick: () => { if (confirm(`Удалить критерий ${c.id} «${c.title}»?`)) { draft.criteria.splice(i, 1); sel = "settings"; touch(); renderEditor(); } } }, "Удалить"))),
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
    editor.replaceChildren(...(sel === "settings" || !draft.criteria[sel] ? settingsEditor() : criterionEditor(sel)).filter(Boolean));
    editor.scrollTop = 0;
  }

  async function save(apply) {
    err.textContent = "";
    try {
      const { id } = await api("/api/checklists", { body: draft });
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

  ctx.setTop([["Чек-листы"], [`v${version.id}`]], [
    dirtyBadge,
    h("label", { class: "cqa-filter" }, h("span", null, "Версия"), ctx.checklistSelect(() => ctx.route_(), "")),
    h("button", { class: "cqa-btn", type: "button", onclick: () => save(false) }, "Сохранить версию"),
    h("button", { class: "cqa-btn cqa-btn-primary", type: "button", onclick: () => save(true),
      disabled: !ctx.canEvaluate(), title: ctx.canEvaluate() ? `Сохранить и оценить ${S.group ? `набор ${S.group}` : "все диалоги"}` : ctx.NO_KEY },
    icon("run"), "Сохранить и применить")]);

  main.replaceChildren(h("div", { class: "cqa-card" },
    h("div", { class: "cqa-page-head" }, h("div", null, h("h1", null, draft.name || "Чек-лист"),
      h("p", null, `${draft.criteria.length} критериев · ${draft.sections.length} секций. Новый критерий начинает работать после сохранения, без изменений в коде.`))),
    err,
    h("div", { class: "cqa-inbox cqa-ed-layout" },
      h("section", { class: "cqa-panel cqa-pane", "aria-label": "Структура" },
        h("div", { class: "cqa-panel-head" }, h("h2", null, "Структура")), nav, navFoot),
      h("section", { class: "cqa-panel cqa-pane", "aria-label": "Редактор" }, editor))));
  renderNav();
  renderEditor();
}
