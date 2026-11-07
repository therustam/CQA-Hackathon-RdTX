// Overview (home): how the set scored and where operators lose points. Every number comes from /api/stats,
// which aggregates the code-computed final scores; nothing here is calculated from model output.
import { h, icon, fmt, usd, store, tone, CHANNEL } from "../ui.js";

const pct = (n, of) => (of ? Math.round((100 * n) / of) : 0);

export async function viewOverview(ctx) {
  const { S, api, toast } = ctx;
  const q = new URLSearchParams();
  if (S.group) q.set("group_id", S.group);
  if (S.checklistId) q.set("checklist_id", S.checklistId);
  let st;
  try { st = await api(`/api/stats?${q}`); } catch (e) { toast(e.message, true); return; }

  const groupSelect = h("select", { onchange: (e) => { S.group = e.target.value; store("cqa.group", S.group); ctx.route_(); } },
    h("option", { value: "" }, "Все"),
    S.groups.map((g) => h("option", { value: g.group_id, selected: g.group_id === S.group }, `${g.group_id} · ${g.n}`)));
  ctx.setTop([["Обзор"]], [
    h("label", { class: "cqa-filter", "data-active": !!S.group }, h("span", null, "Набор"), groupSelect),
    h("label", { class: "cqa-filter" }, h("span", null, "Чек-лист"), ctx.checklistSelect(() => ctx.route_(), "")),
    h("a", { class: "cqa-btn", href: "#/dialogs" }, "Все диалоги", icon("next"))]);

  const head = h("div", { class: "cqa-page-head" }, h("div", null, h("h1", null, "Обзор"),
    h("p", null, `${st.checklist_name} v${st.checklist_id}${S.group ? ` · набор ${S.group}` : " · все наборы"}. Итоги посчитаны кодом по ответам модели и решениям проверяющих.`)));

  if (!st.evaluated) {
    ctx.main.replaceChildren(h("div", { class: "cqa-page" }, head, h("section", { class: "cqa-panel" }, h("div", { class: "cqa-empty" },
      icon("overview"), h("h2", null, st.conversations ? "Диалоги ещё не оценены" : "Диалогов пока нет"),
      h("p", null, st.conversations ? `Загружено ${st.conversations}. Запустите оценку набора — здесь появятся итоги и проблемные критерии.`
        : "Импортируйте набор организаторов или JSON-файл с транскриптами."),
      h("a", { class: "cqa-btn cqa-btn-primary", href: "#/dialogs" }, "Перейти к диалогам")))));
    return;
  }

  const kpi = (label, value, sub, extra) => h("div", { class: "cqa-panel cqa-kpi" },
    h("span", { class: "cqa-kpi-label" }, label), h("div", { class: "cqa-kpi-value" }, value), h("span", { class: "cqa-kpi-sub" }, sub), extra);
  const kpis = h("div", { class: "cqa-kpis" },
    kpi("Средний итог", [fmt(st.avg_total), h("small", null, "/ 100")], `по ${st.scored} оценённым диалогам`,
      h("span", { class: `cqa-minibar cqa-minibar-wide cqa-tone-${tone(st.avg_total)}`, "aria-hidden": "true" }, h("i", { style: `width:${st.avg_total || 0}%` }))),
    kpi("Оценено", [st.evaluated, h("small", null, ` из ${st.conversations}`)],
      st.errors ? `ошибок оценки ${st.errors}` : st.cost_usd != null ? `стоимость ${usd(st.cost_usd)}` : "",
      h("span", { class: "cqa-minibar cqa-minibar-wide", "aria-hidden": "true" }, h("i", { style: `width:${pct(st.evaluated, st.conversations)}%` }))),
    kpi("Грубые нарушения", st.flagged, `${pct(st.flagged, st.evaluated)}% оценённых диалогов`,
      st.flagged ? h("a", { class: "cqa-kpi-link", href: "#/dialogs", onclick: () => { S.filters.status = "flag"; } }, "Показать", icon("next")) : null),
    kpi("Апелляции", st.appeals_open, `открыто по v${st.checklist_id} · рассмотрено ${st.appeals_decided} · итог изменён в ${st.changed_by_appeal}`,
      st.appeals_open ? h("a", { class: "cqa-kpi-link", href: "#/appeals" }, "К очереди", icon("next")) : null));

  const total = st.scored || 1;
  const dist = h("section", { class: "cqa-panel" },
    h("div", { class: "cqa-panel-head" }, h("h2", null, "Распределение итогов")),
    h("div", { class: "cqa-bars" }, [["high", "90 и выше", "ok"], ["mid", "70–90", "warn"], ["low", "ниже 70", "bad"]].map(([k, label, t]) => {
      const n = st.buckets[k];
      return h("a", { class: "cqa-bar-row", href: "#/dialogs", onclick: () => { S.filters.score = k; } },
        h("span", { class: "cqa-bar-label" }, label),
        h("span", { class: `cqa-minibar cqa-minibar-wide cqa-minibar-lg cqa-tone-${t}`, "aria-hidden": "true" }, h("i", { style: `width:${pct(n, total)}%` })),
        h("span", { class: "cqa-bar-value" }, h("b", null, n), ` · ${pct(n, total)}%`));
    })));

  const split = (title, rows, label) => h("div", { class: "cqa-mini-table" }, h("h3", null, title),
    rows.map((r) => h("div", { class: "cqa-mini-row" }, h("span", null, label(r.key)), h("span", { class: "cqa-muted" }, `${r.n}`),
      h("span", { class: `cqa-minibar cqa-tone-${tone(r.avg)}`, "aria-hidden": "true" }, h("i", { style: `width:${r.avg || 0}%` })),
      h("b", null, fmt(r.avg)))));
  const segments = h("section", { class: "cqa-panel" },
    h("div", { class: "cqa-panel-head" }, h("h2", null, "Средний итог по сегментам")),
    h("div", { class: "cqa-segments" },
      split("Язык", st.by_language, (k) => k || "—"),
      split("Канал", st.by_channel, (k) => CHANNEL[k] || k || "—")));

  // weakest first: share of conversations where the criterion lost points (or the flag was raised)
  const crits = [...st.criteria].sort((a, b) => pct(b.missed, b.judged) - pct(a.missed, a.judged));
  const critTable = h("section", { class: "cqa-panel" },
    h("div", { class: "cqa-panel-head" }, h("h2", null, "Где теряются баллы"),
      h("span", { class: "cqa-panel-note" }, "доля диалогов, где критерий не набрал полный вес; для флага — где нарушение выявлено")),
    h("div", { class: "cqa-table-wrap" }, h("table", { class: "cqa-table cqa-table-static" },
      h("thead", null, h("tr", null, h("th", null, "Критерий"), h("th", null, "Потери"), h("th", { class: "cqa-num" }, "Средний балл"),
        h("th", { class: "cqa-num" }, "N/A"))),
      h("tbody", null, crits.map((c) => {
        const share = pct(c.missed, c.judged);
        return h("tr", null,
          h("td", null, h("span", { class: "cqa-tree-num" }, c.id), " ", c.title, c.type === "flag" ? h("span", { class: "cqa-tag cqa-tag-plain cqa-ml" }, "флаг") : null),
          h("td", null, h("div", { class: "cqa-loss" },
            h("span", { class: `cqa-minibar cqa-minibar-wide cqa-tone-${c.type === "flag" ? (c.missed ? "bad" : "ok") : share > 30 ? "bad" : share > 10 ? "warn" : "ok"}`, "aria-hidden": "true" },
              h("i", { style: `width:${share}%` })),
            h("span", null, h("b", null, c.missed), ` из ${c.judged} · ${share}%`))),
          h("td", { class: "cqa-num" }, c.earned_percent == null ? "—" : `${fmt(c.earned_percent)}%`),
          h("td", { class: "cqa-num cqa-muted" }, c.na || "—"));
      })))));

  ctx.main.replaceChildren(h("div", { class: "cqa-page" }, head, kpis,
    h("div", { class: "cqa-grid-2" }, dist, segments), critTable));
}
