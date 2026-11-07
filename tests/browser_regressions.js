// Run this function on a blank/404 page served beside web/ (not index.html).
// Example server: python -m http.server 8011 --bind 127.0.0.1 --directory web
// Uses the real frontend with mocked fetch; no model, source API or database is accessed.
async function browserRegressions() {
  const { mount } = await import('/js/cqa.js');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (condition) => {
    for (let i = 0; i < 150; i++) { if (condition()) return; await sleep(20); }
    throw new Error('Timed out waiting for UI');
  };
  const meta = { id: 's', title: 'Test scale', type: 'scale', weight: 100, scale: [{ value: 20 }, { value: 15 }], subtypes: [] };
  const original = { id: 's', status: 'scored', applicable: true, answer: null, step: 15, weight: 100,
    points: 75, evidence_ids: ['m0'], checked_range: [], explanation: 'Test explanation' };
  const message = { id: 'm0', speaker: 'client', text: 'Test request', timestamp: '00:00' };
  const appeal = { id: 1, status: 'open', action: null, criterion: meta, conversation_id: 'test',
    channel: 'agent chat', language: 'RU', comment: 'Review test', fragment: [message],
    original, previous: original, final: original, decided: original, total: 75, final_total: 75, current_total: 75 };
  const stats = { checklist_id: 1, checklist_name: 'Test', conversations: 1, evaluated: 1, scored: 1,
    avg_total: 75, errors: 0, flagged: 0, appeals_open: 1, appeals_decided: 0, changed_by_appeal: 0,
    buckets: { low: 0, mid: 1, high: 0 }, by_language: [], by_channel: [], criteria: [] };
  const score = { total: 75, criteria: [original], sections: [], flags: [] };
  const evaluation = { id: 1, status: 'ok', model: 'test', original: score, final: score, raw: {}, errors: [],
    checklist: { id: 1, name: 'Test', data: { criteria: [meta], sections: [] } }, appeals: [], usage: {} };
  const nativeFetch = window.fetch;
  const previousRole = localStorage.getItem('cqa.role');
  const root = document.createElement('div');
  let holdPath = null, release = null, app, statsCalls = 0;
  window.fetch = async (path, init = {}) => {
    const url = new URL(path, location.href);
    if (url.pathname === holdPath) {
      holdPath = null;
      await new Promise((resolve) => { release = resolve; });
    }
    let data;
    if (url.pathname === '/api/config') data = { has_api_key: true, model: 'test' };
    else if (url.pathname === '/api/checklists') data = [{ id: 1, name: 'Test', criteria: 1 }];
    else if (url.pathname === '/api/checklists/1') data = { data: { name: 'Test', criteria: [meta], sections: [] } };
    else if (url.pathname === '/api/groups') data = [];
    else if (url.pathname === '/api/stats') { statsCalls++; data = stats; }
    else if (url.pathname === '/api/appeals') data = url.searchParams.get('status') === appeal.status ? [appeal] : [];
    else if (url.pathname === '/api/appeals/1/decision') {
      const body = JSON.parse(init.body);
      const final = { ...original, step: body.step, points: 100 };
      Object.assign(appeal, { status: 'decided', action: body.action, reason: body.reason,
        decided_at: '2026-11-08T00:00:00Z', final, decided: final, final_total: 100, current_total: 100 });
      data = appeal;
    } else if (url.pathname === '/api/conversations/test') data = {
      conversation_id: 'test', channel: 'agent chat', language: 'RU', messages: [message], has_audio: false };
    else if (url.pathname === '/api/conversations/test/evaluation') data = evaluation;
    else throw new Error(`Unexpected request ${path}`);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    localStorage.setItem('cqa.role', 'reviewer');
    history.replaceState(null, '', '#/appeals');
    document.body.replaceChildren(root);
    app = mount(root);
    await wait(() => root.querySelector('.cqa-case form'));
    const form = root.querySelector('.cqa-case form');
    const change = form.querySelector('input[value="change"]');
    change.checked = true;
    change.dispatchEvent(new Event('change', { bubbles: true }));
    [...form.querySelectorAll('button')].find((b) => b.textContent === '20').click();
    form.querySelector('textarea').value = 'Regression review';
    form.requestSubmit();
    await wait(() => root.querySelector('.cqa-decision'));
    root.querySelector('.cqa-inbox-item').click();
    const reopened = root.querySelector('.cqa-decision').textContent;
    assert(reopened.includes('15 / 20 → 20 / 20') && reopened.includes('Regression review') && reopened.includes('100'),
      'Reopened appeal lost the saved decision');

    const overview = () => root.querySelector('main h1')?.textContent === 'Обзор';
    location.hash = '#/';
    await wait(overview);
    // Cover a delayed view response, a delayed shared refresh and a delayed editor response.
    for (const [path, hash] of [['/api/conversations/test', '#/c/test'],
      ['/api/config', '#/c/test'], ['/api/checklists/1', '#/checklist']]) {
      release = null;
      holdPath = path;
      const previousStats = statsCalls;
      location.hash = hash;
      await wait(() => release);
      location.hash = '#/';
      await wait(() => statsCalls > previousStats && overview());
      release();
      await sleep(150);
      assert(overview() && location.hash === '#/', `Stale ${path} replaced Overview`);
      assert(root.querySelector('.cqa-nav a[aria-current="page"]').textContent.includes('Обзор'), 'Navigation is stale');
    }
    return { appealState: 'passed', staleView: 'passed', staleRefresh: 'passed', staleEditor: 'passed' };
  } finally {
    app?.destroy();
    window.fetch = nativeFetch;
    if (previousRole === null) localStorage.removeItem('cqa.role');
    else localStorage.setItem('cqa.role', previousRole);
  }
}
