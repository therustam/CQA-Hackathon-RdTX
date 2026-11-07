// Conversation card: transcript + per-criterion verdicts with evidence, appeal and decision forms.
import { h, icon, fmt, usd, tone, CHANNEL, WHO, TYPE, SUBTYPE_FALLBACK } from "../ui.js";

export function verdict(row, meta) {
  if (!row || row.status === "missing") return { text: "нет ответа", cls: "cqa-v-missing" };
  if (row.status === "na") return { text: "N/A", cls: "cqa-v-na" };
  if (meta.type === "flag") return row.answer === "yes" ? { text: "ДА", cls: "cqa-v-alert" } : { text: "НЕТ", cls: "cqa-v-yes" };
  if (meta.type === "scale") {
    const max = Math.max(...meta.scale.map((s) => s.value));
    return { text: `${fmt(row.step)} / ${fmt(max)}`, cls: row.step === 0 ? "cqa-v-no" : row.step === max ? "cqa-v-yes" : "cqa-v-step" };
  }
  return row.answer === "yes" ? { text: "ДА", cls: "cqa-v-yes" } : { text: "НЕТ", cls: "cqa-v-no" };
}
export const verdictBox = (row, meta) => {
  const v = verdict(row, meta);
  return h("span", { class: `cqa-verdict ${v.cls}` }, v.text);
};

export function appealForm(ctx, evaluationId, cid, onDone) {
  const { api, toast } = ctx;
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

export function decisionForm(ctx, appeal, meta, onDone) {
  const { api, toast } = ctx;
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

// Layout: summary panel (id, total, sections) → gross-error alert → split: transcript | criteria.
// Criteria are compact rows; the selected one expands to explanation, evidence and appeal tools.
export async function viewCard(ctx, cid) {
  const { S, api, toast, base, main } = ctx;
  let conv, ev;
  try {
    [conv, ev] = await Promise.all([
      api(`/api/conversations/${encodeURIComponent(cid)}`),
      api(`/api/conversations/${encodeURIComponent(cid)}/evaluation?${ctx.checklistQuery()}`),
    ]);
  } catch (e) {
    main.replaceChildren(h("div", { class: "cqa-page" }, h("div", { class: "cqa-notice cqa-notice-error" }, icon("alert"), e.message),
      h("a", { href: "#/dialogs" }, "К списку диалогов")));
    return;
  }
  const isCall = conv.channel === "voice call";
  const msgs = conv.messages;
  const order = new Map(msgs.map((m, i) => [m.id, i]));
  const msgEl = new Map();
  let selected = null;
  let openForm = null; // {cid, kind}
  let busy = false;

  const summarySlot = h("div");
  const alertSlot = h("div", { class: "cqa-stack" });
  const resultsBody = h("div", { class: "cqa-scroll cqa-crits" });
  const resultsCount = h("span", { class: "cqa-panel-note" });
  const audio = conv.has_audio ? h("audio", {
    class: "cqa-audio", controls: true, preload: "none",
    src: `${base}/api/conversations/${encodeURIComponent(cid)}/audio`,
  }) : null;

  // transcript: original order and timestamps, ids match the model's evidence ids
  const transcript = h("div", { class: "cqa-scroll cqa-transcript", tabindex: "0", "aria-label": "Транскрипт" },
    msgs.map((m) => {
      const time = isCall && m.timestamp ? m.timestamp.slice(11, 19) : m.timestamp;
      const timeCell = audio && m.audio_offset != null
        ? h("button", { type: "button", title: `${m.timestamp} · позиция в записи ${Math.round(m.audio_offset)} с`,
          onclick: () => seek(m) }, icon("play"), time)
        : h("span", { title: m.timestamp }, time);
      const el = h("div", { class: `cqa-msg cqa-msg-${m.speaker}${m.internal ? " cqa-msg-internal" : ""}`, id: `cqa-${m.id}` },
        h("span", { class: "cqa-msg-id" }, m.id),
        h("div", { class: "cqa-msg-main" },
          h("div", { class: "cqa-msg-head" },
            h("span", { class: "cqa-msg-who" }, WHO[m.speaker] || m.speaker),
            h("span", { class: "cqa-msg-time" }, timeCell),
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

  // clicking the open criterion again collapses it; an evidence chip always opens and jumps
  function selectCriterion(id, focusId) {
    selected = selected === id && !focusId ? null : id;
    for (const el of resultsBody.querySelectorAll(".cqa-crit")) {
      const on = el.dataset.cid === selected;
      el.classList.toggle("cqa-crit-open", on);
      el.querySelector(".cqa-crit-head").setAttribute("aria-expanded", String(on));
    }
    const row = selected && ev && ev.final.criteria.find((c) => c.id === selected);
    highlight(row, focusId);
    if (focusId && isCall) seek(msgs[order.get(focusId)]);
  }

  const ref = (critId, msgId, label) => h("button", { class: "cqa-ref", type: "button", title: "Перейти к реплике",
    onclick: (e) => { e.stopPropagation(); selectCriterion(critId, msgId); } }, label || msgId);

  function renderTop() {
    const pill = h("label", { class: "cqa-filter" }, h("span", null, "Чек-лист"), ctx.checklistSelect(() => ctx.route_(), ""));
    const evalBtn = h("button", {
      class: `cqa-btn${ev ? "" : " cqa-btn-primary"}`, type: "button", disabled: busy || !ctx.canEvaluate(),
      title: ctx.canEvaluate() ? null : ctx.NO_KEY,
      onclick: async () => {
        busy = true;
        renderTop();
        try {
          ev = await api("/api/evaluate", { body: { conversation_id: cid, checklist_id: S.checklistId, force: !!ev } });
        } catch (e) { toast(e.message, true); }
        busy = false;
        renderAll();
      },
    }, icon("run"), busy ? "Оценивается…" : ev ? "Переоценить" : "Оценить диалог");
    ctx.setTop([["Диалоги", "#/dialogs"], [cid]], [pill, evalBtn]);
  }

  function renderSummary() {
    const fin = ev && ev.final, orig = ev && ev.original;
    const changed = ev && fin.total !== orig.total;
    const meta = [
      h("span", { class: "cqa-with-icon" }, icon(isCall ? "phone" : "chat"), CHANNEL[conv.channel] || conv.channel),
      h("span", { class: "cqa-lang" }, conv.language),
      h("span", null, `${msgs.length} реплик`),
      h("span", null, `набор ${conv.group_id}`),
      ev && ev.status !== "error" ? h("span", null, `${ev.model} · ${usd(ev.cost_usd)} · ${fmt((ev.latency_ms || 0) / 1000)} с`) : null,
    ];
    const sections = fin && fin.sections.length ? h("div", { class: "cqa-secstats" }, fin.sections.map((s) => {
      if (s.available != null) {
        return h("div", { class: "cqa-secstat" },
          h("span", { class: "cqa-secstat-title" }, s.title),
          h("div", { class: "cqa-secstat-value" }, h("b", null, `${fmt(s.percent)}%`), h("span", null, `${fmt(s.earned)} из ${fmt(s.available)}`)),
          h("span", { class: `cqa-minibar cqa-minibar-wide cqa-tone-${tone(s.percent)}`, "aria-hidden": "true" }, h("i", { style: `width:${s.percent}%` })));
      }
      // flag-only (or all-N/A) section: a flag, not an empty meter
      const flags = fin.flags.filter((f) => fin.criteria.some((c) => c.id === f.criterion_id && c.section === s.id));
      const hasFlagCriteria = fin.criteria.some((c) => c.section === s.id && c.type === "flag");
      return h("div", { class: "cqa-secstat" },
        h("span", { class: "cqa-secstat-title" }, s.title),
        h("div", { class: "cqa-secstat-value" }, flags.length
          ? h("span", { class: "cqa-tag cqa-tag-alert" }, "выявлено")
          : h("span", { class: `cqa-tag${hasFlagCriteria ? " cqa-tag-ok" : ""}` }, hasFlagCriteria ? "не выявлено" : "N/A")),
        flags.length ? h("div", { class: "cqa-refs" }, flags.flatMap((f) => f.evidence_ids.map((id) => ref(f.criterion_id, id)))) : null);
    })) : null;
    summarySlot.replaceChildren(h("section", { class: "cqa-panel cqa-summary", "aria-label": "Сводка" },
      h("div", { class: "cqa-summary-top" },
        h("div", { class: "cqa-summary-id" }, h("h1", null, cid), h("div", { class: "cqa-meta" }, meta)),
        h("div", { class: "cqa-summary-score" },
          h("span", { class: "cqa-summary-label" }, changed ? "Итог после апелляций" : "Итог"),
          h("div", { class: "cqa-bignum" }, fin && fin.total != null ? fmt(fin.total) : "—", h("small", null, "/ 100")),
          changed ? h("span", { class: "cqa-summary-trail" }, "ИИ ", h("s", null, fmt(orig.total)), " → ", h("b", null, fmt(fin.total))) : null)),
      sections));

    const alerts = [];
    for (const f of (fin && fin.flags) || []) {
      const m = ev.checklist.data.criteria.find((c) => c.id === f.criterion_id) || {};
      const labels = (f.subtypes.length ? f.subtypes : [null]).map((st) =>
        ((m.subtypes || []).find((x) => x.id === st) || {}).label || st || SUBTYPE_FALLBACK);
      alerts.push(h("div", { class: "cqa-alert", role: "alert" }, icon("alert"),
        h("b", null, f.title), h("span", null, labels.join(", ")),
        h("div", { class: "cqa-refs" }, f.evidence_ids.map((id) => ref(f.criterion_id, id))),
        h("span", { class: "cqa-alert-note" }, "в итог не входит, отмечено отдельно")));
    }
    if (ev && ev.status === "error") alerts.push(h("div", { class: "cqa-notice cqa-notice-error", role: "alert" }, icon("alert"),
      `Оценка не выполнена: ${ev.errors.join("; ")}`));
    if (ev && ev.status === "needs_review") alerts.push(h("div", { class: "cqa-notice cqa-notice-warn" }, icon("alert"),
      `Ответ модели не прошёл проверку после повтора — нужна ручная проверка: ${ev.errors.join("; ")}`));
    alertSlot.replaceChildren(...alerts);
    alertSlot.hidden = !alerts.length;
  }

  function critRow(meta, row, orig) {
    const appeals = ev.appeals.filter((a) => a.criterion_id === meta.id);
    const openAppeal = appeals.find((a) => a.status === "open");
    const scored = row.status === "scored" && meta.type !== "flag";
    const subLabels = (row.subtypes || []).map((st) => ((meta.subtypes || []).find((x) => x.id === st) || {}).label || st);
    const range = row.checked_range || [];
    const formOpen = openForm && openForm.cid === meta.id;
    const isOpen = selected === meta.id;
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
      form = appealForm(ctx, ev.id, meta.id, (view) => { ev = view; openForm = null; renderAll(); });
    } else if (formOpen && openForm.kind === "decision" && openAppeal) {
      form = decisionForm(ctx, { ...openAppeal, original: orig, final: row }, meta, async () => {
        ev = await api(`/api/evaluations/${ev.id}`);
        openForm = null;
        renderAll();
      });
    }
    const pts = meta.type === "flag" ? h("span", { class: "cqa-pts-note" }, "без баллов")
      : scored ? [h("b", null, fmt(row.points)), h("span", null, ` / ${fmt(meta.weight)}`)]
        : h("span", { class: "cqa-pts-note" }, row.status === "na" ? "вес перераспределён" : "не учтён");
    return h("article", { class: `cqa-crit${isOpen ? " cqa-crit-open" : ""}`, "data-cid": meta.id },
      h("button", { class: "cqa-crit-head", type: "button", "aria-expanded": String(isOpen), onclick: () => selectCriterion(meta.id) },
        h("span", { class: "cqa-crit-num" }, meta.id),
        h("span", { class: "cqa-crit-title" }, meta.title,
          openAppeal ? h("span", { class: "cqa-tag cqa-tag-warn" }, "апелляция") : appeals.length ? h("span", { class: "cqa-tag cqa-tag-plain" }, "пересмотрено") : null),
        verdictBox(row, meta),
        h("span", { class: "cqa-pts" }, pts),
        h("span", { class: "cqa-crit-chev", "aria-hidden": "true" }, icon("next"))),
      h("div", { class: "cqa-crit-body" },
        h("div", { class: "cqa-crit-type" }, `${TYPE[meta.type] || meta.type}${meta.na_allowed ? " · N/A допустим" : ""}`,
          scored && row.redistributed_weight !== meta.weight ? ` · вес ${fmt(meta.weight)} → ${fmt(row.redistributed_weight)}` : ""),
        row.explanation ? h("p", { class: "cqa-expl" }, row.explanation) : null,
        row.status === "na" && row.na_reason ? h("p", { class: "cqa-na-reason" }, h("b", null, "Причина N/A: "), row.na_reason) : null,
        subLabels.length ? h("div", { class: "cqa-badges" }, subLabels.map((l) => h("span", { class: "cqa-tag cqa-tag-alert" }, l))) : null,
        (row.evidence_ids || []).length || range.length === 2 ? h("div", { class: "cqa-refs" },
          (row.evidence_ids || []).length ? h("span", { class: "cqa-muted" }, "Основание") : null,
          (row.evidence_ids || []).map((id) => ref(meta.id, id)),
          range.length === 2 ? ref(meta.id, range[0], `участок ${range[0]}–${range[1]}`) : null) : null,
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
      resultsCount.textContent = "";
      resultsBody.replaceChildren(h("div", { class: "cqa-empty" },
        h("h2", null, "Диалог ещё не оценён"),
        h("p", null, `Чек-лист v${(ctx.currentChecklist() || {}).id}. Модель ответит по каждому критерию со ссылками на реплики, баллы и итог посчитает код.`)));
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
    resultsCount.textContent = `${ev.final.criteria.length} · нажмите, чтобы раскрыть`;
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
          h("li", null, h("b", null, `Финальный результат: ${fmt(ev.final.total)}`))),
        h("p", { class: "cqa-meta-line" },
          `Чек-лист v${ev.checklist.id} «${ev.checklist.name}» · токены: вход ${ev.usage?.input_tokens ?? "—"}, кэш ${ev.usage?.cache_read_tokens ?? "—"}, выход ${ev.usage?.output_tokens ?? "—"} · ${usd(ev.cost_usd)}`)));
  }

  function renderAll() {
    renderTop();
    renderSummary();
    renderResults();
    if (selected) { const id = selected; selected = null; selectCriterion(id); }
    ctx.refreshShared().then(ctx.renderTop).catch(() => {});
  }

  main.replaceChildren(h("div", { class: "cqa-card" },
    summarySlot, alertSlot,
    h("div", { class: "cqa-split" },
      h("section", { class: "cqa-panel cqa-pane", "aria-label": "Транскрипт" },
        h("div", { class: "cqa-panel-head" }, h("h2", null, "Транскрипт"),
          h("span", { class: "cqa-panel-note" }, isCall ? "нажмите на время, чтобы прослушать" : "исходные метки времени"),
          conv.has_audio ? h("a", { class: "cqa-panel-link", href: `${base}/api/conversations/${encodeURIComponent(cid)}/audio?player=true`, target: "_blank", rel: "noopener" }, "Открыть запись") : null),
        audio ? h("div", { class: "cqa-audio-bar" }, audio) : null,
        transcript),
      h("section", { class: "cqa-panel cqa-pane", "aria-label": "Результаты по критериям" },
        h("div", { class: "cqa-panel-head" }, h("h2", null, "Критерии"), resultsCount),
        resultsBody))));
  renderTop();
  renderSummary();
  renderResults();
}
