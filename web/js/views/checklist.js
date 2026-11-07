// Checklist editor: every save is a new version; earlier evaluations keep theirs.
import { h, icon, fmt, TYPE } from "../ui.js";

export async function viewChecklist(ctx) {
  const { S, api, toast, base, main, route_, refreshShared, renderTop, canEvaluate, NO_KEY, checklistQuery, currentChecklist, checklistSelect } = ctx;

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
        ctx.startJob(await api("/api/batch", { body: { group_id: S.group || null, checklist_id: id } }));
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
