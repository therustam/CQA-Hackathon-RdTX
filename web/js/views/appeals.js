// Reviewer inbox: queue on the left, the selected case on the right (AI verdict, specialist comment, fragment, decision).
import { h, icon, fmt, CHANNEL, WHO } from "../ui.js";
import { verdict, verdictBox, decisionForm } from "./card.js";

const when = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export async function viewAppeals(ctx, status) {
  const { S, api, toast, main } = ctx;
  let rows = [];
  let counts = { open: S.openAppeals, decided: null };
  try {
    const [open, decided] = await Promise.all([api("/api/appeals?status=open"), api("/api/appeals?status=decided")]);
    counts = { open: open.length, decided: decided.length };
    rows = status === "open" ? open : decided;
  } catch (e) { toast(e.message, true); }
  let selectedId = rows.length ? rows[0].id : null;

  const list = h("div", { class: "cqa-scroll cqa-inbox-list", role: "listbox", "aria-label": "Апелляции" });
  const detail = h("div", { class: "cqa-scroll cqa-case" });

  const tab = (id, label, n) => h("a", { class: "cqa-tab", href: id === "open" ? "#/appeals" : "#/appeals/decided",
    "aria-current": status === id ? "page" : null }, label, n != null ? h("span", { class: "cqa-tab-count" }, n) : null);

  function outcome(a) {
    if (a.status === "open") return h("span", { class: "cqa-tag cqa-tag-warn" }, "ждёт решения");
    return a.action === "change" ? h("span", { class: "cqa-tag cqa-tag-err" }, "изменено") : h("span", { class: "cqa-tag cqa-tag-ok" }, "подтверждено");
  }

  function renderList() {
    if (!rows.length) {
      list.replaceChildren(h("div", { class: "cqa-empty" }, icon("appeals"),
        h("h2", null, status === "open" ? "Открытых апелляций нет" : "Рассмотренных пока нет"),
        h("p", null, "Специалист оспаривает критерий в карточке диалога кнопкой «Оспорить».")));
      return;
    }
    list.replaceChildren(...rows.map((a) => h("button", {
      class: "cqa-inbox-item", type: "button", role: "option", "aria-selected": String(a.id === selectedId),
      onclick: () => { selectedId = a.id; renderList(); renderDetail(); },
    },
    h("div", { class: "cqa-inbox-row" }, h("b", null, `${a.criterion.id} · ${a.criterion.title}`), h("time", null, when(a.decided_at || a.created_at))),
    h("div", { class: "cqa-inbox-row" },
      h("span", { class: "cqa-inbox-meta" }, a.conversation_id, " · ", CHANNEL[a.channel] || a.channel, " · ", a.language),
      outcome(a)),
    h("p", { class: "cqa-inbox-snippet" }, a.comment))));
  }

  function decidedBlock(x, meta) {
    const from = verdict(x.previous || x.original, meta).text, to = verdict(x.decided, meta).text;
    return h("div", { class: "cqa-decision" },
      h("div", { class: "cqa-decision-head" }, outcome(x),
        h("b", null, x.action === "change" ? `${from} → ${to}` : "оценка ИИ подтверждена")),
      h("p", null, x.reason),
      h("div", { class: "cqa-decision-total" }, "Итог диалога: ", h("s", null, fmt(x.total)), " → ", h("b", null, fmt(x.final_total))),
      h("p", { class: "cqa-muted" }, `Проверяющий · ${x.decided_at ? new Date(x.decided_at).toLocaleString("ru-RU") : ""}`));
  }

  function renderDetail() {
    const a = rows.find((r) => r.id === selectedId);
    if (!a) return detail.replaceChildren(h("div", { class: "cqa-empty" }, h("p", null, "Выберите апелляцию слева.")));
    const meta = a.criterion;
    const block = (title, ...kids) => h("section", { class: "cqa-case-block" }, h("h3", null, title), kids);
    let decision;
    if (a.status !== "open") decision = decidedBlock(a, meta);
    else if (S.role === "reviewer") {
      decision = decisionForm(ctx, a, meta, (r) => {
        decision.replaceWith(decidedBlock(r, meta));
        a.status = "decided";
        renderList();
        ctx.refreshShared().then(ctx.renderTop).catch(() => {});
      });
    } else {
      decision = h("div", { class: "cqa-notice" }, "Решение принимает проверяющий — переключите роль внизу меню.");
    }
    detail.replaceChildren(
      h("header", { class: "cqa-case-head" },
        h("div", null,
          h("h2", null, `${meta.id} · ${meta.title}`),
          h("div", { class: "cqa-meta" },
            h("a", { href: `#/c/${encodeURIComponent(a.conversation_id)}` }, a.conversation_id),
            h("span", { class: "cqa-with-icon" }, icon(a.channel === "voice call" ? "phone" : "chat"), CHANNEL[a.channel] || a.channel),
            h("span", { class: "cqa-lang" }, a.language),
            h("span", null, `итог сейчас ${fmt(a.current_total)}`))),
        h("a", { class: "cqa-btn cqa-btn-sm", href: `#/c/${encodeURIComponent(a.conversation_id)}` }, "Открыть диалог", icon("next"))),
      block("Оценка ИИ",
        h("div", { class: "cqa-row" }, verdictBox(a.original, meta),
          a.original.status === "scored" ? h("span", { class: "cqa-muted" }, `${fmt(a.original.points)} из ${fmt(meta.weight)} баллов`) : null),
        a.original.explanation ? h("p", null, a.original.explanation) : null,
        a.original.na_reason ? h("p", { class: "cqa-na-reason" }, h("b", null, "Причина N/A: "), a.original.na_reason) : null),
      block("Комментарий специалиста", h("blockquote", { class: "cqa-quote" }, a.comment)),
      block("Фрагмент диалога", a.fragment.length
        ? h("div", { class: "cqa-fragment" }, a.fragment.map((m) => h("div", { class: `cqa-msg cqa-msg-${m.speaker}` },
          h("span", { class: "cqa-msg-id" }, m.id),
          h("div", null,
            h("div", { class: "cqa-msg-head" }, h("span", { class: "cqa-msg-who" }, WHO[m.speaker] || m.speaker),
              h("span", { class: "cqa-msg-time" }, a.channel === "voice call" && m.timestamp ? m.timestamp.slice(11, 19) : m.timestamp)),
            h("div", { class: "cqa-msg-text" }, m.text)))))
        : h("p", { class: "cqa-muted" }, "Модель не указала реплик — откройте карточку диалога.")),
      block(a.status === "open" ? "Решение" : "Решение проверяющего", decision));
  }

  main.replaceChildren(h("div", { class: "cqa-card" },
    h("div", { class: "cqa-page-head" }, h("div", null, h("h1", null, "Апелляции"),
      h("p", null, "Спорные оценки ИИ по отдельным критериям. Решение проверяющего ложится поверх результата ИИ и пересчитывает итог."))),
    h("div", { class: "cqa-inbox" },
      h("section", { class: "cqa-panel cqa-pane" },
        h("nav", { class: "cqa-tabs", "aria-label": "Статус" }, tab("open", "Открытые", counts.open), tab("decided", "Рассмотренные", counts.decided)),
        list),
      h("section", { class: "cqa-panel cqa-pane", "aria-label": "Апелляция" }, detail))));
  renderList();
  renderDetail();
}
