import {
  sb, PHASES, PHASE_VALUES, CONTACT_TYPES, CUSTOMER_STATUSES,
  QUOTE_STATUSES, REVENUE_KINDS, COST_CATEGORIES,
  phaseLabel, typeLabel, statusLabel, shiftPhase,
  requireAdmin, loadCustomers, loadCustomer, loadCosts, loadLooseRevenues, replaceAllocations,
  upsert, remove, setPhase,
  daysSince, isoDate, addDays
} from './api.js'

const app = document.getElementById('app')
let session = null
let customers = []
let costs = []
let looseRevenues = []
let notice = ''

const D = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
const DT = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function fmtDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? esc(v) : D.format(d)
}
function fmtDateTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? esc(v) : DT.format(d)
}
function money(v) {
  if (v == null || v === '') return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(v))
}
function hash() {
  const raw = (location.hash || '#/dashboard').replace(/^#/, '')
  const [path, query = ''] = raw.split('?')
  const parts = path.split('/').filter(Boolean)
  const params = Object.fromEntries(new URLSearchParams(query))
  return { parts, params, path: '/' + parts.join('/') }
}
function go(to) {
  location.hash = to.startsWith('#') ? to : '#' + to
}
function flash(msg) {
  notice = msg
  setTimeout(() => { if (notice === msg) { notice = ''; paint() } }, 2200)
  paint()
}

function options(list, selected, extra = []) {
  return [...extra, ...list].map((x) => {
    const id = x.id ?? x
    const label = x.label ?? x
    return `<option value="${esc(id)}" ${String(selected || '') === String(id) ? 'selected' : ''}>${esc(label)}</option>`
  }).join('')
}

function chipForPhase(phase) {
  if (phase === 'akkoord') return 'green'
  if (phase === 'verloren' || phase === 'onhold') return 'red'
  if (phase === 'voorstel' || phase === 'follow-up') return 'yellow'
  return 'blue'
}
function chipForStatus(st) {
  if (st === 'actief') return 'green'
  if (st === 'verloren') return 'red'
  if (st === 'inactief') return 'yellow'
  return 'blue'
}
function prioChip(p) {
  if (p === 'hoog') return 'red'
  if (p === 'laag') return ''
  return 'yellow'
}

function primaryContact(c) {
  return c.contacts.find((x) => x.is_primary) || c.contacts[0] || null
}

function stale(c) {
  return daysSince(c.lastContactAt) >= 30
}

function matchesQuery(c, q) {
  if (!q) return true
  const blob = [
    c.company_name, c.extra_notes, c.website, c.address,
    ...c.contacts.flatMap((p) => [p.name, p.email, p.phone, p.role]),
    ...c.logs.flatMap((l) => [l.summary, l.outcome, l.follow_up]),
    ...c.todos.map((t) => t.title + ' ' + (t.note || '')),
    ...c.notes.map((n) => n.body),
    ...c.ideas.map((i) => i.title + ' ' + (i.body || '')),
    ...c.opps.map((o) => o.title + ' ' + (o.notes || '') + ' ' + (o.next_action || ''))
  ].join(' ').toLowerCase()
  return blob.includes(q)
}

function weekRange() {
  const start = isoDate()
  const end = addDays(7)
  return { start, end }
}

async function refresh() {
  ;[customers, costs, looseRevenues] = await Promise.all([loadCustomers(), loadCosts(), loadLooseRevenues()])
}

function currentCustomerId() {
  const { parts } = hash()
  return (parts[0] === 'klanten' && parts[1]) ? parts[1] : ''
}

function plusBar() {
  const cid = currentCustomerId()
  return `
    <div class="plus" data-plus>
      <button type="button" class="plus-btn" title="Toevoegen" aria-label="Toevoegen">+</button>
      <div class="plus-menu">
        <button type="button" data-open="customer">Nieuwe klant<small>Bedrijf of prospect</small></button>
        <button type="button" data-open="quote" data-customer="${esc(cid)}">Offerte</button>
        <button type="button" data-open="activity" data-customer="${esc(cid)}">Activiteit<small>Contactmoment</small></button>
        <button type="button" data-open="todo" data-customer="${esc(cid)}">Taak</button>
        <button type="button" data-open="opp" data-customer="${esc(cid)}">Kans / upsell</button>
        <button type="button" data-open="contact" data-customer="${esc(cid)}">Contactpersoon</button>
        <button type="button" data-open="cost">Kosten<small>Smeren of los</small></button>
        <button type="button" data-open="revenue" data-customer="${esc(cid)}">Opbrengst</button>
      </div>
    </div>`
}

function customerPicker(selected, { required = true, allowNone = false, name = 'customer_id' } = {}) {
  const first = allowNone
    ? '<option value="">Niet gekoppeld</option>'
    : '<option value="">Kies klant…</option>'
  return `<div class="field"><label>Klant</label><select name="${name}" ${required && !allowNone ? 'required' : ''}>${first}${customers.map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.company_name)}</option>`).join('')}</select></div>`
}

function contactPersonFields(c, selectedId) {
  const person = c?.contacts?.find((p) => p.id === selectedId) || null
  const listId = 'contacts-' + (c?.id || 'all')
  const names = (c?.contacts || []).map((p) => `<option value="${esc(p.name)}">`).join('')
  return `
    <div class="field"><label>Contactpersoon</label>
      <input name="contact_name" list="${listId}" placeholder="Typ een naam of kies uit de lijst" value="${esc(person?.name || '')}">
      <datalist id="${listId}">${names}</datalist>
    </div>
    <div class="field"><label>E-mail</label><input name="contact_email" type="email" value="${esc(person?.email || '')}" placeholder="nieuw of bestaand"></div>
    <div class="field"><label>Telefoon</label><input name="contact_phone" value="${esc(person?.phone || '')}" placeholder="optioneel"></div>
    <div class="field"><label>Rol</label><input name="contact_role" value="${esc(person?.role || '')}" placeholder="optioneel"></div>`
}

function customerCostShare(customerId) {
  return costs.reduce((s, cost) => {
    const a = (cost.allocations || []).find((x) => x.customer_id === customerId)
    return s + Number(a?.amount || 0)
  }, 0)
}

function customerMoneyBlock(c) {
  const rev = Number(c.revenueTotal || 0)
  const cost = customerCostShare(c.id)
  const linkedCosts = costs.filter((x) => (x.allocations || []).some((a) => a.customer_id === c.id))
  return `
    <div class="grid cards" style="margin-bottom:1rem">
      <div class="card"><h3>Opbrengsten</h3><div class="metric good">${money(rev)}</div></div>
      <div class="card"><h3>Kosten (aandeel)</h3><div class="metric bad">${money(cost)}</div></div>
      <div class="card"><h3>Saldo</h3><div class="metric ${rev - cost >= 0 ? 'good' : 'bad'}">${money(rev - cost)}</div></div>
    </div>
    <div class="list">
      ${(c.revenues || []).map((r) => `<div class="item" style="cursor:default"><b>${esc(r.title)}</b><small>${money(r.amount)} · ${fmtDate(r.received_at)} · ${esc(r.kind)}</small></div>`).join('') || '<p class="muted">Nog geen opbrengsten bij deze klant.</p>'}
    </div>
    ${linkedCosts.length ? `<p class="tiny" style="margin-top:.8rem">Kosten meegerekend: ${linkedCosts.map((x) => esc(x.title)).join(', ')}</p>` : '<p class="tiny" style="margin-top:.8rem">Geen kosten gekoppeld aan deze klant.</p>'}`
}

function shell(content, active) {
  const email = session?.user?.email || ''
  return `
    <aside class="sidebar">
      <div class="brand">NH<span>.</span><small>Admin</small></div>
      <button class="nav-btn ${active === 'dashboard' ? 'active' : ''}" data-go="#/dashboard">Dashboard</button>
      <button class="nav-btn ${active === 'customers' ? 'active' : ''}" data-go="#/klanten">Klanten</button>
      <button class="nav-btn ${active === 'sales' ? 'active' : ''}" data-go="#/sales">Sales</button>
      <button class="nav-btn ${active === 'todos' ? 'active' : ''}" data-go="#/todos">To-do’s</button>
      <button class="nav-btn ${active === 'money' ? 'active' : ''}" data-go="#/geld">Geld</button>
      <button class="nav-btn ${active === 'settings' ? 'active' : ''}" data-go="#/instellingen">Instellingen</button>
      <div class="spacer"></div>
      <div class="userbox">Ingelogd als<b>${esc(email)}</b>
        <button class="btn ghost small" data-action="logout">Uitloggen</button>
      </div>
    </aside>
    <main class="main">
      ${notice ? `<p class="tiny" style="color:#6ee7b7;margin-bottom:.8rem">${esc(notice)}</p>` : ''}
      ${content}
    </main>`
}

function loginView(err = '') {
  return `
    <div class="login">
      <div class="login-card card">
        <div class="brand">NH<span>.</span></div>
        <h1>Admin</h1>
        <p class="lead">Alleen voor jou. Log in om het klantlogboek te openen.</p>
        <form class="form" data-form="login">
          <div class="field"><label for="login-email">E-mail</label><input id="login-email" name="email" type="email" autocomplete="username" required></div>
          <div class="field"><label for="login-password">Wachtwoord</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div>
          ${err ? `<p class="err">${esc(err)}</p>` : ''}
          <button class="btn" type="submit">Inloggen</button>
        </form>
      </div>
    </div>`
}

function dashboardView() {
  const openTodos = customers.flatMap((c) => c.openTodos.map((t) => ({ ...t, company: c.company_name, cid: c.id })))
    .sort((a, b) => (a.due_at || '9999').localeCompare(b.due_at || '9999'))
  const recent = customers.flatMap((c) => c.logs.map((l) => ({ ...l, company: c.company_name, cid: c.id })))
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).slice(0, 8)
  const staleList = customers.filter(stale).sort((a, b) => daysSince(b.lastContactAt) - daysSince(a.lastContactAt))
  const sales = customers.flatMap((c) => c.openOpps.map((o) => ({ ...o, company: c.company_name, cid: c.id })))
  const upsell = customers.flatMap((c) => c.opps.filter((o) => o.is_upsell && o.phase !== 'verloren' && o.phase !== 'akkoord')
    .map((o) => ({ ...o, company: c.company_name, cid: c.id })))
  const { start, end } = weekRange()
  const reminders = customers.flatMap((c) => c.reminders.filter((r) => !r.done && r.remind_at >= start && r.remind_at <= end)
    .map((r) => ({ ...r, company: c.company_name, cid: c.id })))
    .sort((a, b) => a.remind_at.localeCompare(b.remind_at))
  const today = isoDate()

  return shell(`
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p class="lead">Wat aandacht nodig heeft.</p>
      </div>
      ${plusBar()}
    </div>
    <div class="grid cards">
      <div class="card"><h3>Open to-do’s</h3><div class="metric">${openTodos.length}</div></div>
      <div class="card"><h3>Lopende sales</h3><div class="metric">${sales.length}</div></div>
      <div class="card"><h3>Geen recent contact</h3><div class="metric">${staleList.length}<span>≥ 30 dagen</span></div></div>
      <div class="card"><h3>Reminders deze week</h3><div class="metric">${reminders.length}</div></div>
    </div>
    <div class="grid cards" style="margin-top:1rem">
      <section class="card">
        <h3>Openstaande to-do’s</h3>
        ${listBlock(openTodos.slice(0, 8), (t) => itemLink(t.cid, t.title, `${t.company} · ${t.due_at ? 'voor ' + fmtDate(t.due_at) : 'geen deadline'} · ${t.priority}`))}
      </section>
      <section class="card">
        <h3>Recente contactmomenten</h3>
        ${listBlock(recent, (l) => itemLink(l.cid, `${l.company} · ${typeLabel(l.type)}`, `${fmtDateTime(l.occurred_at)} — ${l.summary}`))}
      </section>
      <section class="card">
        <h3>Lang geen contact</h3>
        ${listBlock(staleList.slice(0, 8), (c) => itemLink(c.id, c.company_name, c.lastContactAt ? `${daysSince(c.lastContactAt)} dagen geleden` : 'Nog nooit contact'))}
      </section>
      <section class="card">
        <h3>Lopende saleskansen</h3>
        ${listBlock(sales.slice(0, 8), (o) => itemLink(o.cid, `${o.company} · ${o.title}`, `${phaseLabel(o.phase)}${o.next_action ? ' · ' + o.next_action : ''}`))}
      </section>
      <section class="card">
        <h3>Upsell</h3>
        ${listBlock(upsell.slice(0, 8), (o) => itemLink(o.cid, `${o.company} · ${o.title}`, `${money(o.potential_value)}${o.value_period ? ' ' + o.value_period : ''} · ${phaseLabel(o.phase)}`))}
      </section>
      <section class="card">
        <h3>Reminders vandaag / deze week</h3>
        ${listBlock(reminders, (r) => itemLink(r.cid, r.title, `${r.company} · ${r.remind_at === today ? 'vandaag' : fmtDate(r.remind_at)}`))}
      </section>
    </div>
  `, 'dashboard')
}

function itemLink(cid, title, sub) {
  return `<button class="item" data-go="#/klanten/${cid}"><b>${esc(title)}</b><small>${esc(sub)}</small></button>`
}
function listBlock(arr, fn) {
  if (!arr.length) return `<p class="empty">Niets open.</p>`
  return `<div class="list">${arr.map(fn).join('')}</div>`
}

function customersView(params) {
  const q = (params.q || '').trim().toLowerCase()
  const f = params.f || 'alle'
  let rows = customers.filter((c) => matchesQuery(c, q))
  const { start, end } = weekRange()
  if (f === 'taken') rows = rows.filter((c) => c.openTodos.length)
  if (f === 'stil') rows = rows.filter(stale)
  if (f === 'sales') rows = rows.filter((c) => c.openOpps.length)
  if (f === 'upsell') rows = rows.filter((c) => c.opps.some((o) => o.is_upsell && o.phase !== 'verloren'))
  if (f === 'reminders') rows = rows.filter((c) => c.reminders.some((r) => !r.done && r.remind_at >= start && r.remind_at <= end))

  const filters = [
    ['alle', 'Alle'],
    ['taken', 'Openstaande taken'],
    ['stil', 'Geen recent contact'],
    ['sales', 'Openstaande sales'],
    ['upsell', 'Upsell'],
    ['reminders', 'Reminders deze week']
  ]

  return shell(`
    <div class="page-head">
      <div>
        <h1>Klanten</h1>
        <p class="lead">${rows.length} ${rows.length === 1 ? 'klant' : 'klanten'}</p>
      </div>
      ${plusBar()}
    </div>
    <div class="topbar">
      <input class="search" data-search="klanten" value="${esc(params.q || '')}" placeholder="Zoek klant, contactpersoon, notitie, contactmoment of to-do">
    </div>
    <div class="filters">
      ${filters.map(([id, label]) => `<button class="filter ${f === id ? 'active' : ''}" data-go="#/klanten?f=${id}${q ? '&q=' + encodeURIComponent(params.q) : ''}">${label}</button>`).join('')}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Klant</th><th>Contactpersonen</th><th>Status</th><th>Laatste contact</th>
          <th>Volgende actie</th><th>To-do’s</th><th>Sales</th>
        </tr></thead>
        <tbody>
          ${rows.map((c) => `
            <tr data-go="#/klanten/${c.id}">
              <td><b>${esc(c.company_name)}</b><div class="tiny">${esc((c.notes[0]?.body || c.extra_notes || '').slice(0, 80))}</div></td>
              <td>${c.contacts.length ? c.contacts.map((p) => esc(p.name)).join(', ') : '<span class="muted">—</span>'}</td>
              <td><span class="chip ${chipForStatus(c.status)}">${esc(statusLabel(c.status))}</span></td>
              <td>${c.lastContactAt ? `${fmtDate(c.lastContactAt)}<div class="tiny">${esc(c.lastLog?.summary || '')}</div>` : '<span class="muted">Nog geen</span>'}</td>
              <td>${c.nextAction ? `${esc(c.nextAction.label)}${c.nextAction.at ? `<div class="tiny">${fmtDate(c.nextAction.at)}</div>` : ''}` : '—'}</td>
              <td>${c.openTodos.length}</td>
              <td>${c.openOpps.length}</td>
            </tr>`).join('') || `<tr><td colspan="7" class="muted">Nog geen klanten.</td></tr>`}
        </tbody>
      </table>
    </div>
  `, 'customers')
}

function salesView() {
  const rows = customers.flatMap((c) => c.opps.map((o) => {
    const person = c.contacts.find((p) => p.id === o.contact_id) || primaryContact(c)
    return { ...o, company: c.company_name, cid: c.id, person, lastContactAt: c.lastContactAt }
  })).sort((a, b) => PHASE_VALUES.indexOf(a.phase === 'onhold' ? 'verloren' : a.phase) - PHASE_VALUES.indexOf(b.phase === 'onhold' ? 'verloren' : b.phase))

  return shell(`
    <div class="page-head">
      <div>
        <h1>Sales</h1>
        <p class="lead">Eenvoudige lijst, snel een fase opschuiven.</p>
      </div>
      ${plusBar()}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Klant</th><th>Contactpersoon</th><th>Fase</th><th>Laatste contact</th>
          <th>Volgende actie</th><th>Datum</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((o) => {
            const i = PHASE_VALUES.indexOf(o.phase === 'onhold' ? 'verloren' : o.phase)
            return `
            <tr data-go="#/klanten/${o.cid}">
              <td><b>${esc(o.company)}</b><div class="tiny">${esc(o.title)}</div></td>
              <td>${esc(o.person?.name || '—')}</td>
              <td><span class="chip ${chipForPhase(o.phase)}">${esc(phaseLabel(o.phase))}</span></td>
              <td>${fmtDate(o.lastContactAt)}</td>
              <td>${esc(o.next_action || '—')}</td>
              <td>${fmtDate(o.next_action_at)}</td>
              <td class="row-actions" data-stop="1">
                <button class="icon-btn" data-phase="${o.id}" data-dir="-1" ${i <= 0 ? 'disabled' : ''} title="Vorige fase">←</button>
                <button class="icon-btn" data-phase="${o.id}" data-dir="1" ${i >= PHASE_VALUES.length - 1 ? 'disabled' : ''} title="Volgende fase">→</button>
              </td>
            </tr>`
          }).join('') || `<tr><td colspan="7" class="muted">Nog geen kansen. Voeg ze toe in een klantprofiel.</td></tr>`}
        </tbody>
      </table>
    </div>
  `, 'sales')
}

function todosView() {
  const open = customers.flatMap((c) => c.openTodos.map((t) => ({ ...t, company: c.company_name, cid: c.id })))
    .sort((a, b) => (a.due_at || '9999').localeCompare(b.due_at || '9999') || (a.priority === 'hoog' ? -1 : 1))
  const done = customers.flatMap((c) => c.todos.filter((t) => t.status === 'done').map((t) => ({ ...t, company: c.company_name, cid: c.id })))
    .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at)).slice(0, 12)

  return shell(`
    <div class="page-head">
      <div>
        <h1>To-do’s</h1>
        <p class="lead">${open.length} openstaand.</p>
      </div>
      ${plusBar()}
    <div class="table-wrap">
      <table>
        <thead><tr><th>To-do</th><th>Klant</th><th>Deadline</th><th>Prioriteit</th><th></th></tr></thead>
        <tbody>
          ${open.map((t) => `
            <tr data-go="#/klanten/${t.cid}">
              <td><b>${esc(t.title)}</b>${t.note ? `<div class="tiny">${esc(t.note)}</div>` : ''}</td>
              <td>${esc(t.company)}</td>
              <td>${fmtDate(t.due_at)}</td>
              <td><span class="chip ${prioChip(t.priority)}">${esc(t.priority)}</span></td>
              <td data-stop="1"><button class="btn ghost small" data-done="${t.id}">Afronden</button></td>
            </tr>`).join('') || `<tr><td colspan="5" class="muted">Geen open to-do’s.</td></tr>`}
        </tbody>
      </table>
    </div>
    <h3 style="margin:1.4rem 0 .6rem">Recent afgerond</h3>
    <div class="list">${done.map((t) => itemLink(t.cid, t.title, `${t.company} · ${fmtDate(t.completed_at || t.created_at)}`)).join('') || '<p class="muted">Nog niets afgerond.</p>'}</div>
  `, 'todos')
}

function settingsView() {
  return shell(`
    <div class="page-head">
      <div>
        <h1>Instellingen</h1>
        <p class="lead">Eén gebruiker, volledige toegang. Geen mail vanuit deze omgeving.</p>
      </div>
      ${plusBar()}
    </div>
    <div class="stack">
      <section class="section">
        <header><h3>Account</h3></header>
        <div class="body kv">
          <dt>E-mail</dt><dd>${esc(session.user.email)}</dd>
          <dt>Rol</dt><dd>Admin — volledige toegang</dd>
          <dt>Data</dt><dd>Opgeslagen in het bestaande Fluweel Supabase-project (tabellen <code>nh_*</code>), niet in een extra betaald project.</dd>
        </div>
      </section>
    </div>
  `, 'settings')
}

function moneyView() {
  const totalCost = costs.reduce((s, c) => s + Number(c.amount || 0), 0)
  const totalAlloc = costs.reduce((s, c) => s + Number(c.allocated || 0), 0)
  const totalUnlinked = costs.reduce((s, c) => s + Number(c.unlinked || 0), 0)
  const allRevenues = [
    ...customers.flatMap((c) => (c.revenues || []).map((r) => ({ ...r, company: c.company_name, cid: c.id }))),
    ...looseRevenues.map((r) => ({ ...r, company: 'Niet gekoppeld', cid: null }))
  ].sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''))
  const totalRev = allRevenues.reduce((s, r) => s + Number(r.amount || 0), 0)
  const pipeline = customers.flatMap((c) => c.openOpps).reduce((s, o) => s + Number(o.potential_value || 0), 0)
  const acceptedQuotes = customers.flatMap((c) => (c.quotes || []).filter((q) => q.status === 'geaccepteerd'))
    .reduce((s, q) => s + Number(q.amount || 0), 0)
  const perCustomer = customers.map((c) => {
    const rev = Number(c.revenueTotal || 0)
    const cost = customerCostShare(c.id)
    return { ...c, rev, cost, result: rev - cost }
  }).filter((c) => c.rev || c.cost).sort((a, b) => b.result - a.result)

  return shell(`
    <div class="page-head">
      <div>
        <h1>Geld</h1>
        <p class="lead">Kosten smeren over klanten of los laten. Opbrengsten per klant of zonder koppeling.</p>
      </div>
      ${plusBar()}
    </div>
    <div class="grid cards">
      <div class="card"><h3>Opbrengsten</h3><div class="metric good">${money(totalRev)}</div></div>
      <div class="card"><h3>Kosten</h3><div class="metric bad">${money(totalCost)}</div></div>
      <div class="card"><h3>Resultaat</h3><div class="metric ${totalRev - totalCost >= 0 ? 'good' : 'bad'}">${money(totalRev - totalCost)}</div></div>
      <div class="card"><h3>Niet gekoppelde kosten</h3><div class="metric">${money(totalUnlinked)}</div><p class="tiny">${money(totalAlloc)} is verdeeld over klanten</p></div>
      <div class="card"><h3>Openstaande pipeline</h3><div class="metric">${money(pipeline)}</div><p class="tiny">waarde lopende kansen</p></div>
      <div class="card"><h3>Geaccepteerde offertes</h3><div class="metric">${money(acceptedQuotes)}</div></div>
    </div>

    <h3 style="margin:1.4rem 0 .6rem">Per klant</h3>
    <div class="table-wrap static">
      <table>
        <thead><tr><th>Klant</th><th>Opbrengsten</th><th>Kosten</th><th>Saldo</th></tr></thead>
        <tbody>
          ${perCustomer.map((c) => `
            <tr data-go="#/klanten/${c.id}">
              <td><b>${esc(c.company_name)}</b></td>
              <td>${money(c.rev)}</td>
              <td>${money(c.cost)}</td>
              <td>${money(c.result)}</td>
            </tr>`).join('') || `<tr><td colspan="4" class="muted">Nog geen geldstromen per klant.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="page-head" style="margin-top:1.6rem">
      <h3>Kosten</h3>
      <button class="btn ghost small" data-open="cost">Kosten toevoegen</button>
    </div>
    <div class="table-wrap static">
      <table>
        <thead><tr><th>Omschrijving</th><th>Bedrag</th><th>Datum</th><th>Verdeling</th><th></th></tr></thead>
        <tbody>
          ${costs.map((cost) => `
            <tr>
              <td><b>${esc(cost.title)}</b><div class="tiny">${esc(cost.category || '')}</div></td>
              <td>${money(cost.amount)}</td>
              <td>${fmtDate(cost.incurred_at)}</td>
              <td>${cost.allocations.length
                ? cost.allocations.map((a) => {
                    const cust = customers.find((x) => x.id === a.customer_id)
                    return `${esc(cust?.company_name || '?')} ${money(a.amount)}`
                  }).join('<br>') + (cost.unlinked > 0.009 ? `<div class="tiny">Los: ${money(cost.unlinked)}</div>` : '')
                : '<span class="chip">niet gekoppeld</span>'}</td>
              <td class="row-actions" data-stop="1">
                <button type="button" class="btn ghost small" data-open="cost" data-record="${cost.id}">Verdelen</button>
                <button type="button" class="btn ghost small" data-unlink="${cost.id}">Alles los</button>
                <button type="button" class="btn danger small" data-delete="nh_costs" data-id="${cost.id}">Verwijder</button>
              </td>
            </tr>`).join('') || `<tr><td colspan="5" class="muted">Nog geen kosten.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="page-head" style="margin-top:1.6rem">
      <h3>Opbrengsten</h3>
      <button class="btn ghost small" data-open="revenue">Opbrengst toevoegen</button>
    </div>
    <div class="table-wrap static">
      <table>
        <thead><tr><th>Omschrijving</th><th>Klant</th><th>Bedrag</th><th>Datum</th><th>Soort</th></tr></thead>
        <tbody>
          ${allRevenues.map((r) => `
            <tr ${r.cid ? `data-go="#/klanten/${r.cid}"` : ''}>
              <td><b>${esc(r.title)}</b></td>
              <td>${esc(r.company)}</td>
              <td>${money(r.amount)}</td>
              <td>${fmtDate(r.received_at)}</td>
              <td>${esc(r.kind)}</td>
            </tr>`).join('') || `<tr><td colspan="5" class="muted">Nog geen opbrengsten. Voeg ze toe via +.</td></tr>`}
        </tbody>
      </table>
    </div>
  `, 'money')
}

function customerView(c) {
  const person = primaryContact(c)
  const timeline = buildTimeline(c)
  return shell(`
    <div class="page-head">
      <div>
        <p class="tiny"><a href="#/klanten">← Klanten</a></p>
        <h1>${esc(c.company_name)}</h1>
        <p class="lead">
          <span class="chip ${chipForStatus(c.status)}">${esc(statusLabel(c.status))}</span>
          &nbsp;Laatste contact: <b>${c.lastContactAt ? fmtDateTime(c.lastContactAt) : 'nog geen'}</b>
          ${c.lastLog ? ` — ${esc(c.lastLog.summary)}` : ''}
        </p>
      </div>
      ${plusBar()}
    </div>

    <div class="grid cards" style="margin-bottom:1rem">
      <div class="card"><h3>Laatst contact</h3><div class="metric" style="font-size:1.15rem">${c.lastContactAt ? fmtDate(c.lastContactAt) : '—'}</div><p class="tiny">${esc(c.lastLog ? typeLabel(c.lastLog.type) + (person ? ' met ' + person.name : '') : 'Nog geen contactmoment')}</p></div>
      <div class="card"><h3>Nog te doen</h3><div class="metric">${c.openTodos.length}</div></div>
      <div class="card"><h3>Kansen</h3><div class="metric">${c.openOpps.length}</div></div>
      <div class="card"><h3>Volgende actie</h3><div class="metric" style="font-size:1.05rem">${esc(c.nextAction?.label || '—')}</div><p class="tiny">${c.nextAction?.at ? fmtDate(c.nextAction.at) : ''}</p></div>
    </div>

    <section class="section" style="margin-bottom:1rem">
      <header><h3>Nieuw contactmoment</h3><span class="tiny">Snel loggen</span></header>
      <div class="body">
        <form class="form two" data-form="log" data-customer="${c.id}">
          <div class="field"><label>Datum en tijd</label><input type="datetime-local" name="occurred_at" value="${esc(localInput(new Date()))}" required></div>
          <div class="field"><label>Type</label><select name="type">${options(CONTACT_TYPES, 'telefoon')}</select></div>
          ${contactPersonFields(c, person?.id)}
          <div class="field"><label>Korte omschrijving</label><input name="summary" required placeholder="Waar ging het over?"></div>
          <div class="field"><label>Uitkomst</label><input name="outcome" placeholder="Optioneel"></div>
          <div class="field"><label>Vervolgactie</label><input name="follow_up" placeholder="Bijv. over twee weken bellen"></div>
          <div class="field"><label>Reminder</label>
            <select name="remind">
              <option value="">Geen</option>
              <option value="1">Morgen</option>
              <option value="7">Over 7 dagen</option>
              <option value="90">Over 3 maanden</option>
            </select>
          </div>
          <div class="field" style="justify-content:end"><label>&nbsp;</label><button class="btn" type="submit">Log opslaan</button></div>
        </form>
      </div>
    </section>

    <div class="stack">
      <section class="section">
        <header><h3>Tijdlijn</h3></header>
        <div class="body">
          ${timeline.length ? `<div class="timeline">${timeline.map((t) => `
            <article class="tl"><time>${esc(t.when)}</time><div><b>${esc(t.title)}</b><p>${esc(t.body || '')}</p></div></article>`).join('')}</div>` : '<p class="muted">Nog geen activiteiten.</p>'}
        </div>
      </section>

      <section class="section">
        <header><h3>Contactgegevens</h3><span class="tiny">Alles is hier te typen</span></header>
        <div class="body">
          <form class="form two" data-form="customer">
            ${customerForm(c)}
            <div class="actions field full" style="grid-column:1/-1"><button class="btn" type="submit">Klantgegevens opslaan</button></div>
          </form>
          <h3 style="margin:1.3rem 0 .6rem">Contactpersonen</h3>
          <div class="stack">
            ${c.contacts.map((p) => `
              <form class="form two person-form" data-form="contact">
                <input type="hidden" name="id" value="${esc(p.id)}">
                <input type="hidden" name="customer_id" value="${esc(c.id)}">
                <div class="field"><label>Naam</label><input name="name" required value="${esc(p.name)}"></div>
                <div class="field"><label>Rol</label><input name="role" value="${esc(p.role || '')}"></div>
                <div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(p.email || '')}"></div>
                <div class="field"><label>Telefoon</label><input name="phone" value="${esc(p.phone || '')}"></div>
                <div class="field full"><label class="check"><input type="checkbox" name="is_primary" value="1" ${p.is_primary ? 'checked' : ''}> Primair contact</label></div>
                <div class="actions field full" style="grid-column:1/-1">
                  <button type="button" class="btn danger small" data-delete="nh_contacts" data-id="${p.id}">Verwijderen</button>
                  <button class="btn" type="submit">Opslaan</button>
                </div>
              </form>`).join('')}
            <form class="form two person-form" data-form="contact">
              <input type="hidden" name="customer_id" value="${esc(c.id)}">
              <p class="tiny" style="grid-column:1/-1">Nieuwe contactpersoon — typ een naam en sla op.</p>
              <div class="field"><label>Naam</label><input name="name" required placeholder="Voor- en achternaam"></div>
              <div class="field"><label>Rol</label><input name="role" placeholder="bijv. eigenaar"></div>
              <div class="field"><label>E-mail</label><input name="email" type="email"></div>
              <div class="field"><label>Telefoon</label><input name="phone"></div>
              <div class="field full"><label class="check"><input type="checkbox" name="is_primary" value="1" ${c.contacts.length ? '' : 'checked'}> Primair contact</label></div>
              <div class="actions field full" style="grid-column:1/-1"><button class="btn" type="submit">Contactpersoon toevoegen</button></div>
            </form>
          </div>
        </div>
      </section>

      <section class="section">
        <header><h3>Contactlog</h3></header>
        <div class="body">
          ${c.logs.map((l) => {
            const who = c.contacts.find((p) => p.id === l.contact_id)
            return `<div class="item" style="cursor:default">
              <b>${fmtDateTime(l.occurred_at)} — ${esc(typeLabel(l.type))}${who ? ' met ' + esc(who.name) : ''}</b>
              <small>${esc(l.summary)}${l.outcome ? ' · Uitkomst: ' + esc(l.outcome) : ''}${l.follow_up ? ' · Vervolg: ' + esc(l.follow_up) : ''}</small>
            </div>`
          }).join('') || '<p class="muted">Nog geen contactmomenten.</p>'}
        </div>
      </section>

      <section class="section">
        <header><h3>To-do’s</h3><button class="btn ghost small" data-open="todo" data-customer="${c.id}">Toevoegen</button></header>
        <div class="body list">
          ${c.todos.map((t) => `
            <div class="item" style="cursor:default">
              <b>${t.status === 'done' ? '✓ ' : ''}${esc(t.title)} <span class="chip ${prioChip(t.priority)}">${esc(t.priority)}</span></b>
              <small>${t.due_at ? 'Deadline ' + fmtDate(t.due_at) : 'Geen deadline'}${t.note ? ' · ' + esc(t.note) : ''}</small>
              ${t.status === 'open' ? `<div class="actions"><button class="btn ghost small" data-done="${t.id}">Afronden</button></div>` : ''}
            </div>`).join('') || '<p class="muted">Geen to-do’s.</p>'}
        </div>
      </section>

      <section class="section">
        <header><h3>Ideeën</h3><button class="btn ghost small" data-open="idea" data-customer="${c.id}">Toevoegen</button></header>
        <div class="body list">
          ${c.ideas.map((i) => `
            <div class="item" style="cursor:default">
              <b>${esc(i.title)}</b>
              <small>${esc(i.body || '')}</small>
              ${i.converted_todo_id || i.converted_opportunity_id ? `<small>Omgezet</small>` : `
                <div class="actions">
                  <button class="btn ghost small" data-convert="todo" data-idea="${i.id}" data-customer="${c.id}">Maak to-do</button>
                  <button class="btn ghost small" data-convert="opp" data-idea="${i.id}" data-customer="${c.id}">Maak kans</button>
                </div>`}
            </div>`).join('') || '<p class="muted">Nog geen ideeën.</p>'}
        </div>
      </section>

      <section class="section">
        <header><h3>Kansen / upsell</h3><button class="btn ghost small" data-open="opp" data-customer="${c.id}">Toevoegen</button></header>
        <div class="body list">
          ${c.opps.map((o) => {
            const i = PHASE_VALUES.indexOf(o.phase === 'onhold' ? 'verloren' : o.phase)
            return `<div class="item" style="cursor:default">
              <b>${esc(o.title)} ${o.is_upsell ? '<span class="chip yellow">upsell</span>' : ''} <span class="chip ${chipForPhase(o.phase)}">${esc(phaseLabel(o.phase))}</span></b>
              <small>${money(o.potential_value)}${o.value_period ? ' ' + esc(o.value_period) : ''} · ${esc(o.next_action || 'geen volgende actie')}${o.next_action_at ? ' · ' + fmtDate(o.next_action_at) : ''}</small>
              <div class="row-actions" style="margin-top:.45rem">
                <button class="icon-btn" data-phase="${o.id}" data-dir="-1" ${i <= 0 ? 'disabled' : ''}>←</button>
                <button class="icon-btn" data-phase="${o.id}" data-dir="1" ${i >= PHASE_VALUES.length - 1 ? 'disabled' : ''}>→</button>
              </div>
            </div>`
          }).join('') || '<p class="muted">Nog geen kansen.</p>'}
        </div>
      </section>

      <section class="section">
        <header><h3>Notities</h3><button class="btn ghost small" data-open="note" data-customer="${c.id}">Toevoegen</button></header>
        <div class="body list">
          ${c.notes.map((n) => `<div class="item" style="cursor:default"><b>${fmtDateTime(n.created_at)}</b><small>${esc(n.body)}</small></div>`).join('') || '<p class="muted">Nog geen notities.</p>'}
        </div>
      </section>

      <section class="section">
        <header><h3>Reminders</h3><button class="btn ghost small" data-open="reminder" data-customer="${c.id}">Toevoegen</button></header>
        <div class="body list">
          ${c.reminders.map((r) => `
            <div class="item" style="cursor:default">
              <b>${esc(r.title)} ${r.done ? '<span class="chip">klaar</span>' : `<span class="chip yellow">${fmtDate(r.remind_at)}</span>`}</b>
              ${!r.done ? `<div class="actions"><button class="btn ghost small" data-remind-done="${r.id}">Afronden</button></div>` : ''}
            </div>`).join('') || '<p class="muted">Geen reminders.</p>'}
        </div>
      </section>

      <section class="section">
        <header><h3>Offertes</h3><button class="btn ghost small" data-open="quote" data-customer="${c.id}">Toevoegen</button></header>
        <div class="body list">
          ${(c.quotes || []).map((q) => `
            <div class="item" style="cursor:default">
              <b>${esc(q.title)} <span class="chip">${esc(QUOTE_STATUSES.find((s) => s.id === q.status)?.label || q.status)}</span></b>
              <small>${money(q.amount)} · ${fmtDate(q.issued_at)}${q.valid_until ? ' · geldig tot ' + fmtDate(q.valid_until) : ''}</small>
            </div>`).join('') || '<p class="muted">Nog geen offertes.</p>'}
        </div>
      </section>

      <section class="section">
        <header><h3>Opbrengsten & kosten</h3><div class="row-actions"><button class="btn ghost small" data-open="revenue" data-customer="${c.id}">Opbrengst</button><button class="btn ghost small" data-open="cost">Kosten</button></div></header>
        <div class="body">
          ${customerMoneyBlock(c)}
        </div>
      </section>
    </div>
  `, 'customers')
}

function buildTimeline(c) {
  const items = []
  for (const l of c.logs) {
    const who = c.contacts.find((p) => p.id === l.contact_id)
    items.push({
      at: l.occurred_at,
      when: fmtDate(l.occurred_at),
      title: `${typeLabel(l.type)} ${who ? 'met ' + who.name : ''}`.trim(),
      body: [l.summary, l.outcome && ('Uitkomst: ' + l.outcome), l.follow_up && ('Vervolg: ' + l.follow_up)].filter(Boolean).join(' ')
    })
  }
  for (const t of c.todos.filter((x) => x.status === 'done')) {
    items.push({ at: t.completed_at || t.created_at, when: fmtDate(t.completed_at || t.created_at), title: 'To-do afgerond', body: t.title })
  }
  for (const n of c.notes) {
    items.push({ at: n.created_at, when: fmtDate(n.created_at), title: 'Notitie', body: n.body })
  }
  for (const i of c.ideas) {
    items.push({ at: i.created_at, when: fmtDate(i.created_at), title: 'Idee: ' + i.title, body: i.body || '' })
  }
  for (const o of c.opps) {
    items.push({ at: o.created_at, when: fmtDate(o.created_at), title: (o.is_upsell ? 'Upsell: ' : 'Kans: ') + o.title, body: phaseLabel(o.phase) })
  }
  items.sort((a, b) => new Date(b.at) - new Date(a.at))
  return items
}

function localInput(d) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return x.toISOString().slice(0, 16)
}

function modalHtml(title, body, formName) {
  return `<div class="modal-back"><div class="modal">
    <h2>${esc(title)}</h2>
    <form class="form two" data-form="${formName}">${body}
      <div class="actions full field" style="grid-column:1/-1">
        <button type="button" class="btn ghost" data-close="1">Annuleren</button>
        <button class="btn" type="submit">Opslaan</button>
      </div>
    </form>
  </div></div>`
}

function customerForm(c = {}) {
  return `
    <input type="hidden" name="id" value="${esc(c.id || '')}">
    <div class="field"><label>Bedrijfsnaam</label><input name="company_name" required value="${esc(c.company_name || '')}"></div>
    <div class="field"><label>Status</label><select name="status">${options(CUSTOMER_STATUSES, c.status || 'prospect')}</select></div>
    <div class="field"><label>Website</label><input name="website" value="${esc(c.website || '')}" placeholder="https://"></div>
    <div class="field"><label>Adres</label><input name="address" value="${esc(c.address || '')}"></div>
    <div class="field full"><label>Extra notities bij contactgegevens</label><textarea name="extra_notes">${esc(c.extra_notes || '')}</textarea></div>
    <div class="field"><label>Tarief / prijsafspraak</label><input name="price_arrangement" value="${esc(c.price_arrangement || '')}"></div>
    <div class="field"><label>Korting</label><input name="discount" value="${esc(c.discount || '')}"></div>
    <div class="field"><label>Vast / uurtarief</label>
      <select name="billing_type">${options([{ id: '', label: '—' }, { id: 'vast', label: 'Vast bedrag' }, { id: 'uurtarief', label: 'Uurtarief' }, { id: 'anders', label: 'Anders' }], c.billing_type || '')}</select>
    </div>
    <div class="field"><label>Hoe vaak factureren</label><input name="billing_frequency" value="${esc(c.billing_frequency || '')}" placeholder="maandelijks, per project…"></div>
    <div class="field"><label>Betalingstermijn</label><input name="payment_terms" value="${esc(c.payment_terms || '')}" placeholder="14 dagen"></div>
    <div class="field"><label>Facturatie-e-mail</label><input name="billing_email" type="email" value="${esc(c.billing_email || '')}"></div>
    <div class="field full"><label>Bijzonderheden facturatie</label><textarea name="billing_notes">${esc(c.billing_notes || '')}</textarea></div>`
}

function allocRowHtml(row = {}) {
  return `<div class="alloc-row">
    <div class="field"><label>Klant</label>
      <select name="alloc_customer">
        <option value="">—</option>
        ${customers.map((c) => `<option value="${esc(c.id)}" ${c.id === row.customer_id ? 'selected' : ''}>${esc(c.company_name)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Bedrag €</label><input name="alloc_amount" type="number" step="0.01" min="0" value="${esc(row.amount ?? '')}"></div>
    <button type="button" class="icon-btn" data-del-alloc title="Loskoppelen">×</button>
  </div>`
}

function bindAllocUi(root) {
  const box = root.querySelector('[data-allocs]')
  if (!box) return
  const rebind = () => {
    box.querySelectorAll('[data-del-alloc]').forEach((btn) => {
      btn.onclick = () => { btn.closest('.alloc-row')?.remove() }
    })
  }
  root.querySelector('[data-add-alloc]')?.addEventListener('click', () => {
    box.insertAdjacentHTML('beforeend', allocRowHtml())
    rebind()
  })
  root.querySelector('[data-clear-alloc]')?.addEventListener('click', () => {
    box.innerHTML = allocRowHtml()
    rebind()
  })
  root.querySelector('[data-split-alloc]')?.addEventListener('click', () => {
    const total = Number(root.querySelector('[name="amount"]')?.value || 0)
    const rows = [...box.querySelectorAll('.alloc-row')].filter((r) => r.querySelector('[name="alloc_customer"]').value)
    if (!rows.length || !total) return
    const each = Math.round((total / rows.length) * 100) / 100
    rows.forEach((r, i) => {
      r.querySelector('[name="alloc_amount"]').value = i === rows.length - 1
        ? Math.round((total - each * (rows.length - 1)) * 100) / 100
        : each
    })
  })
  rebind()
}

function showModal(kind, payload = {}) {
  const wrap = document.createElement('div')
  wrap.id = 'modal-root'
  const customerId = payload.customerId || payload.customer?.id || ''
  const c = payload.customer || customers.find((x) => x.id === customerId)
  const needCustomer = !c && ['todo', 'opp', 'contact', 'activity', 'quote'].includes(kind)
  if (kind === 'customer') wrap.innerHTML = modalHtml(payload.customer?.id ? 'Klant bewerken' : 'Nieuwe klant', customerForm(payload.customer || {}), 'customer')
  if (kind === 'contact') wrap.innerHTML = modalHtml('Contactpersoon', `
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(customerId)}
    <div class="field"><label>Naam</label><input name="name" required placeholder="Typ de naam"></div>
    <div class="field"><label>Rol</label><input name="role"></div>
    <div class="field"><label>E-mail</label><input name="email" type="email"></div>
    <div class="field"><label>Telefoon</label><input name="phone"></div>
    <div class="field full"><label class="check"><input type="checkbox" name="is_primary" value="1"> Primair contact</label></div>`, 'contact')
  if (kind === 'todo') wrap.innerHTML = modalHtml('Taak', `
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(customerId)}
    <div class="field full"><label>Omschrijving</label><input name="title" required></div>
    <div class="field"><label>Deadline</label><input type="date" name="due_at"></div>
    <div class="field"><label>Prioriteit</label><select name="priority">${options([{ id: 'laag', label: 'Laag' }, { id: 'normaal', label: 'Normaal' }, { id: 'hoog', label: 'Hoog' }], 'normaal')}</select></div>
    <div class="field full"><label>Notitie</label><textarea name="note"></textarea></div>
    <div class="field"><label>Reminder</label>
      <select name="remind"><option value="">Geen</option><option value="due">Op deadline</option><option value="1">Morgen</option><option value="7">Over 7 dagen</option></select>
    </div>`, 'todo')
  if (kind === 'idea') wrap.innerHTML = modalHtml('Idee', `
    <input type="hidden" name="customer_id" value="${esc(customerId)}">
    <div class="field full"><label>Idee</label><input name="title" required></div>
    <div class="field full"><label>Toelichting</label><textarea name="body"></textarea></div>`, 'idea')
  if (kind === 'opp') wrap.innerHTML = modalHtml('Kans / upsell', `
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(customerId)}
    <div class="field full"><label>Omschrijving</label><input name="title" required></div>
    <div class="field"><label>Potentiële waarde (€)</label><input name="potential_value" type="number" step="1"></div>
    <div class="field"><label>Periode</label><input name="value_period" placeholder="eenmalig, per maand"></div>
    <div class="field"><label>Fase</label><select name="phase">${options(PHASES, 'nieuw')}</select></div>
    <div class="field"><label>Verwachte termijn</label><input type="date" name="expected_at"></div>
    <div class="field"><label>Volgende actie</label><input name="next_action"></div>
    <div class="field"><label>Datum volgende actie</label><input type="date" name="next_action_at"></div>
    <div class="field full"><label>Notities</label><textarea name="notes"></textarea></div>
    <div class="field full"><label class="check"><input type="checkbox" name="is_upsell" value="1"> Upsell-mogelijkheid</label></div>
    <div class="field"><label>Reminder</label>
      <select name="remind"><option value="">Geen</option><option value="next">Op volgende actie</option><option value="1">Morgen</option><option value="7">Over 7 dagen</option><option value="90">Over 3 maanden</option></select>
    </div>`, 'opp')
  if (kind === 'note') wrap.innerHTML = modalHtml('Notitie', `
    <input type="hidden" name="customer_id" value="${esc(customerId)}">
    <div class="field full"><label>Notitie</label><textarea name="body" required></textarea></div>`, 'note')
  if (kind === 'reminder') wrap.innerHTML = modalHtml('Reminder', `
    <input type="hidden" name="customer_id" value="${esc(customerId)}">
    <div class="field full"><label>Waarvoor</label><input name="title" required placeholder="Morgen bellen"></div>
    <div class="field"><label>Wanneer</label><input type="date" name="remind_at" required value="${isoDate()}"></div>
    <div class="field"><label>Snel</label>
      <select name="quick"><option value="">Kies datum</option><option value="1">Morgen</option><option value="7">Over 7 dagen</option><option value="90">Over 3 maanden</option></select>
    </div>`, 'reminder')
  if (kind === 'activity') wrap.innerHTML = modalHtml('Activiteit', `
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(customerId)}
    <div class="field"><label>Datum en tijd</label><input type="datetime-local" name="occurred_at" value="${esc(localInput(new Date()))}" required></div>
    <div class="field"><label>Type</label><select name="type">${options(CONTACT_TYPES, 'telefoon')}</select></div>
    ${contactPersonFields(c, primaryContact(c)?.id)}
    <div class="field full"><label>Korte omschrijving</label><input name="summary" required></div>
    <div class="field"><label>Uitkomst</label><input name="outcome"></div>
    <div class="field"><label>Vervolgactie</label><input name="follow_up"></div>`, 'activity')
  if (kind === 'quote') wrap.innerHTML = modalHtml('Offerte', `
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(customerId)}
    <div class="field full"><label>Omschrijving</label><input name="title" required placeholder="Website redesign"></div>
    <div class="field"><label>Bedrag €</label><input name="amount" type="number" step="0.01"></div>
    <div class="field"><label>Status</label><select name="status">${options(QUOTE_STATUSES, 'concept')}</select></div>
    <div class="field"><label>Datum</label><input type="date" name="issued_at" value="${isoDate()}"></div>
    <div class="field"><label>Geldig tot</label><input type="date" name="valid_until"></div>
    <div class="field full"><label>Notities</label><textarea name="notes"></textarea></div>`, 'quote')
  if (kind === 'revenue') wrap.innerHTML = modalHtml('Opbrengst', `
    ${customerPicker(customerId, { required: false, allowNone: true })}
    <div class="field full"><label>Omschrijving</label><input name="title" required placeholder="Factuur #12"></div>
    <div class="field"><label>Bedrag €</label><input name="amount" type="number" step="0.01" required></div>
    <div class="field"><label>Soort</label><select name="kind">${options(REVENUE_KINDS, 'eenmalig')}</select></div>
    <div class="field"><label>Ontvangen op</label><input type="date" name="received_at" value="${isoDate()}"></div>
    <div class="field full"><label>Notities</label><textarea name="notes"></textarea></div>`, 'revenue')
  if (kind === 'cost') {
    const existing = costs.find((x) => x.id === payload.recordId)
    wrap.innerHTML = modalHtml(existing ? 'Kosten verdelen' : 'Kosten', `
      <input type="hidden" name="id" value="${esc(existing?.id || '')}">
      <div class="field full"><label>Omschrijving</label><input name="title" required value="${esc(existing?.title || '')}" placeholder="Hosting, tools, inkoop…"></div>
      <div class="field"><label>Bedrag €</label><input name="amount" type="number" step="0.01" min="0" required value="${esc(existing?.amount ?? '')}"></div>
      <div class="field"><label>Datum</label><input type="date" name="incurred_at" value="${esc(existing?.incurred_at || isoDate())}"></div>
      <div class="field"><label>Categorie</label>
        <input name="category" list="cost-cats" value="${esc(existing?.category || '')}">
        <datalist id="cost-cats">${COST_CATEGORIES.map((x) => `<option value="${esc(x.label)}">`).join('')}</datalist>
      </div>
      <div class="field full"><label>Notities</label><textarea name="notes">${esc(existing?.notes || '')}</textarea></div>
      <div class="field full">
        <label>Verdeling over klanten</label>
        <p class="tiny">Leeg = niet gekoppeld. Bedragen mag je uitsmeren; rest blijft los.</p>
        <div data-allocs>${(existing?.allocations?.length ? existing.allocations : [{ customer_id: customerId || '', amount: '' }]).map(allocRowHtml).join('')}</div>
        <div class="actions">
          <button type="button" class="btn ghost small" data-add-alloc>Klant toevoegen</button>
          <button type="button" class="btn ghost small" data-split-alloc>Verdeel gelijk</button>
          <button type="button" class="btn ghost small" data-clear-alloc>Alles loskoppelen</button>
        </div>
      </div>`, 'cost')
    wrap.querySelector('.modal').classList.add('wide')
  }
  if (!wrap.innerHTML) return
  if (needCustomer && kind !== 'customer' && !c && !wrap.querySelector('[name="customer_id"]')) {
    /* picker already included */
  }
  document.body.appendChild(wrap)
  wrap.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-back')) wrap.remove()
    if (e.target.closest('button[data-close]')) wrap.remove()
  })
  wrap.querySelector('.modal').addEventListener('click', (e) => e.stopPropagation())
  wrap.querySelector('form').addEventListener('submit', (e) => onSubmit(e, wrap))
  const quick = wrap.querySelector('select[name="quick"]')
  if (quick) quick.addEventListener('change', () => {
    if (quick.value) wrap.querySelector('[name="remind_at"]').value = addDays(Number(quick.value))
  })
  bindAllocUi(wrap)
}

function fd(form) {
  const o = Object.fromEntries(new FormData(form).entries())
  for (const [k, v] of Object.entries(o)) if (v === '') o[k] = null
  form.querySelectorAll('input[type="checkbox"]').forEach((el) => { o[el.name] = el.checked })
  return o
}

async function maybeReminder(customerId, title, remind, dueAt, relatedType, relatedId) {
  if (!remind) return
  let at = null
  if (remind === 'due' || remind === 'next') at = dueAt
  else at = addDays(Number(remind))
  if (!at) return
  await upsert('nh_reminders', { customer_id: customerId, title, remind_at: at, related_type: relatedType, related_id: relatedId, done: false })
}

async function resolveContact(customerId, v) {
  const name = (v.contact_name || '').trim()
  if (!name || !customerId) return null
  const cust = customers.find((x) => x.id === customerId)
  let person = cust?.contacts.find((p) => p.name.toLowerCase() === name.toLowerCase())
  const payload = {
    customer_id: customerId,
    name,
    email: v.contact_email || null,
    phone: v.contact_phone || null,
    role: v.contact_role || null
  }
  if (person) {
    const next = {
      ...payload,
      email: v.contact_email || person.email || null,
      phone: v.contact_phone || person.phone || null,
      role: v.contact_role || person.role || null
    }
    await upsert('nh_contacts', next, person.id)
    return person.id
  }
  const row = await upsert('nh_contacts', { ...payload, is_primary: !(cust?.contacts?.length) })
  return row.id
}

function readAllocations(form) {
  const total = Number(form.querySelector('[name="amount"]')?.value || 0)
  const rows = [...form.querySelectorAll('.alloc-row')].map((r) => ({
    customer_id: r.querySelector('[name="alloc_customer"]').value || null,
    amount: r.querySelector('[name="alloc_amount"]').value
  })).filter((r) => r.customer_id)
  const withAmt = rows.filter((r) => Number(r.amount) > 0)
  const without = rows.filter((r) => !(Number(r.amount) > 0))
  if (!rows.length) return []
  if (without.length && !withAmt.length) {
    const each = Math.round((total / without.length) * 100) / 100
    return without.map((r, i) => ({
      customer_id: r.customer_id,
      amount: i === without.length - 1 ? Math.round((total - each * (without.length - 1)) * 100) / 100 : each
    }))
  }
  if (without.length === 1) {
    const used = withAmt.reduce((s, r) => s + Number(r.amount), 0)
    return [...withAmt, { customer_id: without[0].customer_id, amount: Math.max(0, total - used) }]
  }
  return withAmt
}

async function onSubmit(e, modal) {
  e.preventDefault()
  const form = e.target
  const kind = form.dataset.form
  const v = fd(form)
  try {
    if (kind === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password })
      if (error) { app.innerHTML = loginView(error.message); bind(); return }
      await boot()
      return
    }
    if (kind === 'customer') {
      const id = v.id
      delete v.id
      const row = await upsert('nh_customers', v, id)
      await refresh()
      modal?.remove()
      flash('Klant opgeslagen')
      go('#/klanten/' + row.id)
      return
    }
    if (kind === 'contact') {
      const id = v.id
      delete v.id
      await upsert('nh_contacts', { customer_id: v.customer_id, name: v.name, role: v.role, email: v.email, phone: v.phone, is_primary: !!v.is_primary }, id)
    }
    if (kind === 'todo') {
      const row = await upsert('nh_todos', { customer_id: v.customer_id, title: v.title, due_at: v.due_at, priority: v.priority || 'normaal', status: 'open', note: v.note })
      await maybeReminder(v.customer_id, v.title, v.remind, v.due_at, 'todo', row.id)
    }
    if (kind === 'idea') await upsert('nh_ideas', { customer_id: v.customer_id, title: v.title, body: v.body })
    if (kind === 'opp') {
      const row = await upsert('nh_opportunities', {
        customer_id: v.customer_id, title: v.title, phase: v.phase || 'nieuw',
        potential_value: v.potential_value ? Number(v.potential_value) : null,
        value_period: v.value_period, expected_at: v.expected_at, next_action: v.next_action,
        next_action_at: v.next_action_at, notes: v.notes, is_upsell: !!v.is_upsell
      })
      await maybeReminder(v.customer_id, v.title, v.remind, v.next_action_at, 'opportunity', row.id)
    }
    if (kind === 'note') await upsert('nh_notes', { customer_id: v.customer_id, body: v.body })
    if (kind === 'reminder') {
      await upsert('nh_reminders', { customer_id: v.customer_id, title: v.title, remind_at: v.remind_at, related_type: 'standalone', done: false })
    }
    if (kind === 'quote') {
      await upsert('nh_quotes', {
        customer_id: v.customer_id, title: v.title, amount: v.amount ? Number(v.amount) : null,
        status: v.status || 'concept', issued_at: v.issued_at || isoDate(), valid_until: v.valid_until, notes: v.notes
      })
    }
    if (kind === 'revenue') {
      await upsert('nh_revenues', {
        customer_id: v.customer_id, title: v.title, amount: Number(v.amount),
        kind: v.kind || 'eenmalig', received_at: v.received_at || isoDate(), notes: v.notes
      })
    }
    if (kind === 'cost') {
      const id = v.id
      delete v.id
      const row = await upsert('nh_costs', {
        title: v.title, amount: Number(v.amount), incurred_at: v.incurred_at || isoDate(),
        category: v.category, notes: v.notes
      }, id)
      await replaceAllocations(row.id, readAllocations(form))
    }
    if (kind === 'log' || kind === 'activity') {
      const customerId = form.dataset.customer || v.customer_id
      const contactId = await resolveContact(customerId, v)
      const row = await upsert('nh_contact_logs', {
        customer_id: customerId,
        contact_id: contactId,
        occurred_at: new Date(v.occurred_at).toISOString(),
        type: v.type, summary: v.summary, outcome: v.outcome, follow_up: v.follow_up
      })
      await maybeReminder(customerId, v.follow_up || v.summary, v.remind, null, 'contact_log', row.id)
      modal?.remove()
      await refresh()
      flash('Contactmoment gelogd')
      return
    }
    modal?.remove()
    await refresh()
    flash('Opgeslagen')
  } catch (err) {
    alert(err.message || String(err))
  }
}

async function paint() {
  const { parts, params } = hash()
  const page = parts[0] || 'dashboard'
  if (page === 'klanten' && parts[1]) {
    const c = customers.find((x) => x.id === parts[1]) || await loadCustomer(parts[1]).catch(() => null)
    if (!c) { app.innerHTML = shell('<p>Klant niet gevonden.</p>', 'customers'); bind(); return }
    if (!customers.find((x) => x.id === c.id)) customers.push(c)
    app.innerHTML = customerView(c)
  } else if (page === 'klanten') app.innerHTML = customersView(params)
  else if (page === 'sales') app.innerHTML = salesView()
  else if (page === 'todos') app.innerHTML = todosView()
  else if (page === 'geld') app.innerHTML = moneyView()
  else if (page === 'instellingen') app.innerHTML = settingsView()
  else app.innerHTML = dashboardView()
  bind()
}

function bind() {
  app.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.currentTarget.closest('[data-stop]') && e.target.closest('[data-stop]') !== e.currentTarget.closest('td, .row-actions')) return
    e.preventDefault()
    e.stopPropagation()
    go(el.getAttribute('data-go'))
  }))
  app.querySelectorAll('tr[data-go]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) return
    go(el.getAttribute('data-go'))
  }))
  const search = app.querySelector('[data-search="klanten"]')
  if (search) {
    let t
    search.addEventListener('input', () => {
      clearTimeout(t)
      t = setTimeout(() => {
        const f = hash().params.f || 'alle'
        go(`#/klanten?f=${f}&q=${encodeURIComponent(search.value)}`)
      }, 200)
    })
  }
  app.querySelectorAll('[data-action="logout"]').forEach((el) => el.addEventListener('click', async () => {
    await sb.auth.signOut()
    session = null
    customers = []
    app.className = ''
    app.innerHTML = loginView()
    bind()
  }))
  app.querySelectorAll('form[data-form]').forEach((f) => f.addEventListener('submit', (e) => onSubmit(e)))
  app.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    document.querySelectorAll('[data-plus]').forEach((p) => p.classList.remove('open'))
    const kind = el.getAttribute('data-open')
    const customerId = el.getAttribute('data-customer') || currentCustomerId()
    const recordId = el.getAttribute('data-record')
    const customer = (kind === 'customer' && el.getAttribute('data-id'))
      ? customers.find((c) => c.id === el.getAttribute('data-id'))
      : customers.find((c) => c.id === customerId)
    showModal(kind, { customer, customerId: customer?.id || customerId, recordId })
  }))
  app.querySelectorAll('[data-plus] .plus-btn').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    el.closest('[data-plus]').classList.toggle('open')
  }))
  app.querySelectorAll('[data-delete]').forEach((el) => el.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Zeker weten verwijderen?')) return
    await remove(el.getAttribute('data-delete'), el.getAttribute('data-id'))
    await refresh()
    flash('Verwijderd')
  }))
  app.querySelectorAll('[data-unlink]').forEach((el) => el.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    await replaceAllocations(el.getAttribute('data-unlink'), [])
    await refresh()
    flash('Kosten losgekoppeld')
  }))
  app.querySelectorAll('[data-phase]').forEach((el) => el.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation()
    const id = el.getAttribute('data-phase')
    const dir = Number(el.getAttribute('data-dir'))
    const opp = customers.flatMap((c) => c.opps).find((o) => o.id === id)
    if (!opp) return
    await setPhase(id, shiftPhase(opp.phase, dir))
    await refresh()
    flash('Fase aangepast')
  }))
  app.querySelectorAll('[data-done]').forEach((el) => el.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation()
    await upsert('nh_todos', { status: 'done', completed_at: new Date().toISOString() }, el.getAttribute('data-done'))
    await refresh(); flash('To-do afgerond')
  }))
  app.querySelectorAll('[data-remind-done]').forEach((el) => el.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation()
    await upsert('nh_reminders', { done: true }, el.getAttribute('data-remind-done'))
    await refresh(); flash('Reminder klaar')
  }))
  app.querySelectorAll('[data-convert]').forEach((el) => el.addEventListener('click', async () => {
    const idea = customers.flatMap((c) => c.ideas).find((i) => i.id === el.getAttribute('data-idea'))
    const cid = el.getAttribute('data-customer')
    if (!idea) return
    if (el.getAttribute('data-convert') === 'todo') {
      const row = await upsert('nh_todos', { customer_id: cid, title: idea.title, note: idea.body, status: 'open', priority: 'normaal' })
      await upsert('nh_ideas', { converted_todo_id: row.id }, idea.id)
    } else {
      const row = await upsert('nh_opportunities', { customer_id: cid, title: idea.title, notes: idea.body, phase: 'nieuw', is_upsell: false })
      await upsert('nh_ideas', { converted_opportunity_id: row.id }, idea.id)
    }
    await refresh(); flash('Idee omgezet')
  }))
}

async function boot() {
  const gate = await requireAdmin()
  session = gate.session
  if (!session) {
    app.className = ''
    app.innerHTML = loginView()
    bind()
    return
  }
  if (!gate.admin) {
    app.className = ''
    app.innerHTML = loginView('Dit account heeft geen toegang tot de admin.')
    bind()
    return
  }
  app.className = 'shell'
  await refresh()
  await paint()
}

window.addEventListener('hashchange', () => { if (session) paint() })
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-plus]')) return
  document.querySelectorAll('[data-plus].open').forEach((el) => el.classList.remove('open'))
})
boot()
