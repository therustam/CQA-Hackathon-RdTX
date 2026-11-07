// Reviewer queue: open and decided appeals.
import { h, fmt, CHANNEL, WHO } from "../ui.js";
import { verdict, verdictBox, decisionForm } from "./card.js";

export async function viewAppeals(ctx, status) {
  const { S, api, toast, base, main, route_, refreshShared, renderTop, canEvaluate, NO_KEY, checklistQuery, currentChecklist, checklistSelect } = ctx;

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
          ? decisionForm(ctx, a, meta, (r) => { right.replaceWith(decidedBlock(r)); refreshShared().then(() => renderTop("appeals")); })
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
