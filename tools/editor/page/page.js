// The content editor's page (v1.1.4-S12, DL-150 item 7): a table of each list of Traits with their
// effects, excludes, cost and uses; forms to add and change one, the effects offered from its list's
// kinds and its key fixed once made; remove, refused while a Trait is used, naming every use; and
// "Finish", with the test run's progress and result. It works through the editor's API (server.ts).

const $ = (id) => document.getElementById(id);

/** What the API last gave: the forms, the rows and the pending edits. */
let data = { forms: [], rows: [], pending: [] };
/** The row being changed, or null when adding. */
let editing = null;

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'text') node.textContent = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child);
  return node;
}

/** Whether "Finish" runs: every control that changes anything waits for it. */
let busy = false;

async function call(method, url, body) {
  // A change is always JSON: the server refuses any other (server.ts).
  const changes = method !== 'GET';
  const response = await fetch(url, {
    method,
    headers: changes ? { 'content-type': 'application/json' } : {},
    body: changes ? JSON.stringify(body ?? {}) : undefined,
  });
  const json = await response.json();
  return { status: response.status, json };
}

function say(text, tone = '', items = []) {
  const message = $('message');
  message.className = tone;
  message.replaceChildren(element('p', { text }), items.length > 0 ? element('ul', {}, items.map((item) => element('li', { text: item }))) : null);
}

function take(json) {
  if (json.rows !== undefined) data = { forms: json.forms, rows: json.rows, pending: json.pending };
  render();
}

async function load() {
  const { json } = await call('GET', '/api/traits');
  take(json);
}

// ── The tables ─────────────────────────────────────────────────────────────────────────────

function formOf(list) {
  return data.forms.find((form) => form.list === list);
}

function render() {
  const lists = $('lists');
  lists.replaceChildren(
    ...data.forms.map((form) => {
      const rows = data.rows.filter((view) => view.list === form.list);
      const hasCost = form.fields.some((field) => field.name === 'cost');
      return element(
        'section',
        { 'data-list': form.list },
        element('h2', { text: form.title }),
        element(
          'table',
          {},
          element(
            'thead',
            {},
            element('tr', {}, element('th', { text: 'Key' }), element('th', { text: 'Name' }), hasCost ? element('th', { text: 'Cost' }) : null, element('th', { text: 'Effects' }), element('th', { text: 'Excludes' }), element('th', { text: 'Uses' }), element('th', { text: 'Read by' }), element('th', { text: 'Edit' })),
          ),
          element('tbody', {}, rows.map((view) => rowOf(view, hasCost))),
        ),
      );
    }),
  );
  const count = data.pending.length;
  $('pending').textContent = count === 0 ? 'No pending edits' : `${count} pending ${count === 1 ? 'edit' : 'edits'}`;
  $('discard').disabled = count === 0;
  $('finish').disabled = count === 0;
  setBusy(busy);
  filter();
}

/** While "Finish" runs, every control that changes anything is disabled, the open form closed. */
function setBusy(running) {
  busy = running;
  for (const control of document.querySelectorAll('#add-guildmaster, #add-hero, #discard, #finish, #lists button, #form button')) {
    if (running) control.disabled = true;
  }
  if (!running) {
    for (const control of document.querySelectorAll('#add-guildmaster, #add-hero, #lists button, #form button')) control.disabled = false;
    $('discard').disabled = data.pending.length === 0;
    $('finish').disabled = data.pending.length === 0;
  }
  if (running && $('form-dialog').open) $('form-dialog').close();
}

function rowOf(view, hasCost) {
  const excludes = Array.isArray(view.row.excludes) ? view.row.excludes : [];
  return element(
    'tr',
    { 'data-key': view.key, class: view.pending === null ? '' : 'is-pending' },
    element('td', {}, element('code', { text: view.key }), view.pending === null ? null : element('div', { class: 'pending', text: view.pending === 'added' ? 'Added, pending' : 'Changed, pending' })),
    element('td', { text: String(view.row.name) }),
    hasCost ? element('td', { text: String(view.row.cost) }) : null,
    element('td', {}, view.effects.length === 0 ? 'No effect' : element('ul', {}, view.effects.map((words) => element('li', { text: words })))),
    element('td', {}, excludes.length === 0 ? 'None' : element('ul', {}, excludes.map((key) => element('li', {}, element('code', { text: key }))))),
    element(
      'td',
      { class: 'uses' },
      view.uses.length === 0
        ? 'None'
        : element('ul', {}, view.uses.map((use) => element('li', { class: use.blocksRemoval ? '' : 'free', title: use.blocksRemoval ? '' : 'Taken out by the editor on removal', text: use.at }))),
    ),
    element(
      'td',
      {},
      element('details', {}, element('summary', { text: `${view.rules.length} ${view.rules.length === 1 ? 'rule' : 'rules'}` }), element('ul', {}, view.rules.map((rule) => element('li', { title: rule.reads, text: rule.title })))),
    ),
    element(
      'td',
      {},
      element('button', { type: 'button', 'data-action': 'change', onclick: () => openForm(view.list, view) , text: 'Change' }),
      ' ',
      element('button', { type: 'button', 'data-action': 'remove', onclick: () => remove(view.key), text: 'Remove' }),
    ),
  );
}

let found = null;

async function filter() {
  const text = $('find').value.trim();
  if (text === '') found = null;
  else {
    const { json } = await call('GET', `/api/find?text=${encodeURIComponent(text)}`);
    // Refused while "Finish" runs: the table stays as it is.
    if (!Array.isArray(json.found)) return;
    found = new Set(json.found.map((each) => each.key));
  }
  for (const row of document.querySelectorAll('tr[data-key]')) row.classList.toggle('is-hidden', found !== null && !found.has(row.dataset.key));
}

// ── Remove, discard, doctor ────────────────────────────────────────────────────────────────

async function remove(key) {
  if (!window.confirm(`Remove the Trait ${key}? It stays pending until "Finish".`)) return;
  const { status, json } = await call('DELETE', `/api/traits/${encodeURIComponent(key)}`);
  if (json.ok === false) {
    const uses = (json.uses ?? []).map((use) => use.at);
    say(status === 409 ? `Not removed: ${key} is used. Change each use first.` : `Not removed: ${key}.`, 'bad', uses.length > 0 ? uses : json.problems);
    return;
  }
  const stripped = json.removed.stripped.map((use) => `Taken out of ${use.at}`);
  say(`Removed ${key}, pending.`, 'good', stripped);
  take(json);
}

async function discard() {
  if (!window.confirm('Discard every pending edit?')) return;
  const { json } = await call('POST', '/api/discard', {});
  say(json.ok === false ? 'Not discarded.' : `Discarded ${json.discarded.discarded} pending ${json.discarded.discarded === 1 ? 'edit' : 'edits'}.`, json.ok === false ? 'bad' : 'good', json.problems ?? []);
  take(json);
}

async function runDoctor() {
  const { json } = await call('GET', '/api/doctor');
  const problems = [...json.drift.problems, ...json.freshness.problems, ...json.content.problems, ...json.pending.problems];
  say(json.ok ? `The doctor finds nothing wrong: the register lists all ${json.drift.reads} reads of a Trait, the doc is fresh and the content passes its checks.` : 'The doctor finds these:', json.ok ? 'good' : 'bad', problems);
}

// ── The form ───────────────────────────────────────────────────────────────────────────────

function numberInput(name, value, step) {
  return element('input', { type: 'number', step, name, value: value ?? '' });
}

function effectEditor(form, effect) {
  const box = element('div', { class: 'effect' });
  const kinds = element('select', { name: 'kind', 'aria-label': 'Kind of effect' }, form.effects.map((each) => element('option', { value: each.kind, text: each.label, selected: each.kind === effect.kind })));
  const fields = element('div');
  const draw = () => {
    const kind = form.effects.find((each) => each.kind === kinds.value);
    fields.replaceChildren(...kind.fields.map((field) => effectField(field, kinds.value === effect.kind ? effect[field.name] : undefined)));
  };
  kinds.addEventListener('change', draw);
  draw();
  box.append(element('div', { class: 'bar' }, kinds, element('button', { type: 'button', onclick: () => box.remove(), text: 'Remove the effect' })), fields);
  return box;
}

function effectField(field, value) {
  let input;
  switch (field.type) {
    case 'choice':
      input = element('select', { name: field.name }, field.choices.map((choice) => element('option', { value: choice, text: choice, selected: choice === value })));
      break;
    case 'choices':
      input = element('span', { class: 'choices', 'data-name': field.name }, field.choices.map((choice) => element('label', {}, element('input', { type: 'checkbox', value: choice, checked: Array.isArray(value) && value.includes(choice) }), ` ${choice}`)));
      break;
    case 'integer':
      input = numberInput(field.name, value, '1');
      break;
    case 'number':
      input = numberInput(field.name, value, 'any');
      break;
    case 'tags':
      input = element('input', { type: 'text', name: field.name, value: Array.isArray(value) ? value.join(', ') : '', placeholder: 'Tags, with commas between' });
      break;
    case 'stat-changes': {
      input = element('div', { 'data-name': field.name, class: 'stat-changes' });
      const line = (stat, delta) =>
        element(
          'div',
          { class: 'bar stat-change' },
          element('select', { 'aria-label': 'Stat' }, field.choices.map((choice) => element('option', { value: choice, text: choice, selected: choice === stat }))),
          numberInput('delta', delta, '1'),
          element('button', { type: 'button', onclick: (event) => event.target.closest('.stat-change').remove(), text: 'Remove' }),
        );
      for (const [stat, delta] of Object.entries(value ?? {})) input.append(line(stat, delta));
      input.append(element('button', { type: 'button', onclick: (event) => event.target.before(line(field.choices[0], 1)), text: 'Add a Stat change' }));
      break;
    }
  }
  return element('div', { class: 'field', 'data-field': field.name }, element('span', { text: `${field.label}${field.optional ? ' (optional)' : ''}` }), input);
}

function effectOf(box, form) {
  const kind = box.querySelector('select[name=kind]').value;
  const effect = { kind };
  for (const field of form.effects.find((each) => each.kind === kind).fields) {
    const place = box.querySelector(`[data-field="${field.name}"]`);
    switch (field.type) {
      case 'choice':
        effect[field.name] = place.querySelector('select').value;
        break;
      case 'choices': {
        const chosen = [...place.querySelectorAll('input:checked')].map((input) => input.value);
        if (chosen.length > 0 || !field.optional) effect[field.name] = chosen;
        break;
      }
      case 'integer':
      case 'number': {
        const text = place.querySelector('input').value;
        effect[field.name] = text === '' ? null : Number(text);
        break;
      }
      case 'tags': {
        const tags = place.querySelector('input').value.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');
        if (tags.length > 0 || !field.optional) effect[field.name] = tags;
        break;
      }
      case 'stat-changes':
        effect[field.name] = Object.fromEntries([...place.querySelectorAll('.stat-change')].map((line) => [line.querySelector('select').value, Number(line.querySelector('input').value)]));
        break;
    }
  }
  return effect;
}

function openForm(list, view) {
  editing = view;
  const form = formOf(list);
  const keys = data.rows.filter((each) => each.list === list && each.key !== view?.key).map((each) => each.key);
  const row = view?.row ?? { name: '', cost: 0, excludes: [], effects: [] };
  $('form-title').textContent = view === null ? `Add a ${list === 'hero' ? 'Hero' : 'Guildmaster'} Trait` : `Change the Trait ${view.key}`;
  $('form').dataset.list = list;
  $('form-problems').replaceChildren();
  const effects = element('div', { id: 'effects' }, (row.effects ?? []).map((effect) => effectEditor(form, effect)));
  $('form-fields').replaceChildren(
    element('label', { class: 'field' }, element('span', { text: 'Key' }), element('input', { name: 'key', value: view?.key ?? '', readonly: view !== null, required: true, placeholder: 'Lower case and hyphens; fixed once made' })),
    ...form.fields.flatMap((field) => {
      switch (field.type) {
        case 'text':
          return [element('label', { class: 'field' }, element('span', { text: field.label }), element('input', { name: field.name, value: row[field.name] ?? '' }))];
        case 'integer':
          return [element('label', { class: 'field' }, element('span', { text: field.label }), numberInput(field.name, row[field.name], '1'))];
        case 'keys':
          return [
            element(
              'div',
              { class: 'field' },
              element('span', { text: field.label }),
              element('span', { class: 'choices', 'data-name': field.name }, keys.length === 0 ? 'No other Trait' : keys.map((key) => element('label', {}, element('input', { type: 'checkbox', value: key, checked: (row[field.name] ?? []).includes(key) }), ` ${key}`))),
            ),
          ];
        case 'effects':
          return [
            element('div', { class: 'field' }, element('span', { text: field.label }), element('div', {}, effects, element('button', { type: 'button', id: 'add-effect', onclick: () => effects.append(effectEditor(form, { kind: form.effects[0].kind })), text: 'Add an effect' }))),
          ];
        default:
          return [];
      }
    }),
  );
  $('form-dialog').showModal();
}

async function save(event) {
  event.preventDefault();
  const list = $('form').dataset.list;
  const form = formOf(list);
  const values = {};
  for (const field of form.fields) {
    if (field.type === 'text') values[field.name] = $('form').querySelector(`input[name=${field.name}]`).value;
    if (field.type === 'integer') {
      const text = $('form').querySelector(`input[name=${field.name}]`).value;
      values[field.name] = text === '' ? null : Number(text);
    }
    if (field.type === 'keys') values[field.name] = [...$('form').querySelectorAll(`[data-name=${field.name}] input:checked`)].map((input) => input.value);
    if (field.type === 'effects') values[field.name] = [...$('effects').children].map((box) => effectOf(box, form));
  }
  const key = $('form').querySelector('input[name=key]').value.trim();
  const { json } = editing === null ? await call('POST', '/api/traits', { list, key, ...values }) : await call('PUT', `/api/traits/${encodeURIComponent(key)}`, values);
  if (json.ok === false) {
    $('form-problems').replaceChildren(element('p', { text: 'Not saved:' }), element('ul', {}, json.problems.map((problem) => element('li', { text: problem }))));
    return;
  }
  $('form-dialog').close();
  say(`${editing === null ? 'Added' : 'Changed'} ${key}, pending.`, 'good');
  take(json);
}

// ── Finish ─────────────────────────────────────────────────────────────────────────────────

async function finish() {
  if (!window.confirm('Finish: write the pending edits, raise the content version and run the tests? It takes as long as the tests.')) return;
  const { json } = await call('POST', '/api/finish');
  if (json.ok === false) return say('Not finished.', 'bad', json.problems);
  await follow();
}

/** Shows a running "Finish"'s lines until it ends, every control waiting for it. */
async function follow() {
  $('finish-panel').hidden = false;
  setBusy(true);
  const poll = async () => {
    const { json: state } = await call('GET', '/api/finish');
    $('finish-lines').textContent = state.lines.join('\n');
    $('finish-lines').scrollTop = $('finish-lines').scrollHeight;
    if (state.state === 'running') {
      $('finish-state').textContent = `The tests are running: ${state.lines.length} lines so far.`;
      setTimeout(poll, 400);
      return;
    }
    if (state.state === 'passed') {
      const version = state.result.contentVersion;
      $('finish-state').textContent = 'Finished: the tests passed.';
      say(`Finished: ${state.result.changed.join(', ') || 'nothing'} written${version === null ? '' : `, content version ${version.from} → ${version.to}`}. Nothing is committed: read git diff, and commit it yourself.`, 'good');
    } else {
      $('finish-state').textContent = 'Not finished: every file is put back, and the edits stay pending.';
      say('Not finished: every file is put back, and the edits stay pending. The failures:', 'bad', state.problems);
    }
    busy = false;
    await load();
// A page opened while "Finish" runs follows it.
if ((await call('GET', '/api/finish')).json.state === 'running') await follow();
  };
  await poll();
}

$('find').addEventListener('input', () => void filter());
$('add-guildmaster').addEventListener('click', () => openForm('guildmaster', null));
$('add-hero').addEventListener('click', () => openForm('hero', null));
$('discard').addEventListener('click', () => void discard());
$('doctor').addEventListener('click', () => void runDoctor());
$('finish').addEventListener('click', () => void finish());
$('form').addEventListener('submit', (event) => void save(event));
$('form-cancel').addEventListener('click', () => $('form-dialog').close());
await load();
// A page opened while "Finish" runs follows it.
if ((await call('GET', '/api/finish')).json.state === 'running') await follow();
