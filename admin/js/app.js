import {
  sb, PHASES, PHASE_VALUES, CONTACT_TYPES, CUSTOMER_STATUSES,
  QUOTE_STATUSES, REVENUE_KINDS, COST_CATEGORIES, COST_CADENCES, cadenceLabel,
  phaseLabel, typeLabel, statusLabel, shiftPhase,
  TIME_TYPES, timeTypeLabel, mapTimeTypeToLogType, elapsedSeconds, formatElapsed, formatDurationNl,
  requireAdmin, loadCustomers, loadCustomer, loadCosts, loadLooseRevenues, loadLooseTodos, loadEmails, loadMailTemplates, loadTimeEntries, sendMailApi, replaceAllocations,
  upsert, remove, setPhase,
  daysSince, isoDate, addDays
} from './api.js'

const app = document.getElementById('app')
let session = null
let customers = []
let costs = []
let looseRevenues = []
let looseTodos = []
let emails = []
let mailTemplates = []
let timeEntries = []
let notice = ''
let timerTick = null

const MAIL_FOOTER = 'Met vriendelijke groet,\nNick Hoevenaars'
function withMailFooter(body) {
  const f = MAIL_FOOTER
  const b = String(body || '').replace(/[ \t]+$/gm, '').replace(/\s+$/, '')
  if (b.includes(f)) return b
  if (!b) return `\n\n${f}`
  return `${b}\n\n${f}`
}

function closeModal(el) {
  el?.remove()
  if (!document.getElementById('modal-root')) document.body.classList.remove('modal-open')
}

function syncAppViewport() {
  const vv = window.visualViewport
  const height = Math.round(vv?.height || window.innerHeight)
  const top = Math.round(vv?.offsetTop || 0)
  document.documentElement.style.setProperty('--app-height', height + 'px')
  document.documentElement.style.setProperty('--app-top', top + 'px')
}

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
function costCadence(c) {
  return c?.cadence === 'maandelijks' ? 'maandelijks' : 'eenmalig'
}
function isMonthlyCost(c) {
  return costCadence(c) === 'maandelijks'
}
function moneyWithCadence(amount, cadence) {
  const label = money(amount)
  return cadence === 'maandelijks' ? `${label} /mnd` : label
}
function moneyStack(oneOff, monthly) {
  const lines = []
  if (oneOff) lines.push(money(oneOff))
  if (monthly) lines.push(money(monthly) + ' /mnd')
  return lines.join('<br>') || money(0)
}
function periodRange(p) {
  const now = new Date()
  if (p === 'jaar') {
    const y = now.getFullYear()
    return { start: `${y}-01-01`, end: `${y}-12-31` }
  }
  if (p === 'alles') return null
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { start: isoDate(start), end: isoDate(end) }
}
function inPeriod(dateStr, p) {
  const range = periodRange(p)
  if (!range) return true
  const d = String(dateStr || '').slice(0, 10)
  return d >= range.start && d <= range.end
}
function isMonthlyActive(c, onDate = isoDate()) {
  if (!isMonthlyCost(c)) return false
  const start = String(c.incurred_at || '').slice(0, 10)
  const end = c.ended_at ? String(c.ended_at).slice(0, 10) : null
  if (start && start > onDate) return false
  if (end && end < onDate) return false
  return true
}
function moneyPeriod() {
  const p = hash().params.p || 'maand'
  return ['maand', 'jaar', 'alles'].includes(p) ? p : 'maand'
}
function telHref(phone) {
  return 'tel:' + String(phone || '').replace(/[^\d+]/g, '')
}
function waHref(phone) {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '31' + d.slice(1)
  return 'https://wa.me/' + d
}
function contactLinks(p) {
  const bits = []
  if (p?.email) bits.push(`<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`)
  if (p?.phone) {
    bits.push(`<a href="${esc(telHref(p.phone))}">${esc(p.phone)}</a>`)
    bits.push(`<a href="${esc(waHref(p.phone))}" target="_blank" rel="noopener">WhatsApp</a>`)
  }
  return bits.join(' · ')
}
function allQuotes() {
  return customers.flatMap((c) => (c.quotes || []).map((q) => ({ ...q, company: c.company_name, cid: c.id })))
}
function allRevenuesList() {
  return [
    ...customers.flatMap((c) => (c.revenues || []).map((r) => ({ ...r, company: c.company_name, cid: c.id }))),
    ...looseRevenues.map((r) => ({ ...r, company: 'Niet gekoppeld', cid: null }))
  ].sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''))
}
function bookedQuoteIds() {
  return new Set(allRevenuesList().map((r) => r.quote_id).filter(Boolean))
}
function findOpp(id) {
  for (const c of customers) {
    const o = (c.opps || []).find((x) => x.id === id)
    if (o) return { ...o, cid: c.id }
  }
  return null
}
function findLog(id) {
  for (const c of customers) {
    const l = (c.logs || []).find((x) => x.id === id)
    if (l) return { ...l, cid: c.id }
  }
  return null
}
function findTodo(id) {
  const loose = (looseTodos || []).find((t) => t.id === id)
  if (loose) return { ...loose, cid: null, company: 'Persoonlijk' }
  for (const c of customers) {
    const t = (c.todos || []).find((x) => x.id === id)
    if (t) return { ...t, cid: c.id, company: c.company_name }
  }
  return null
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
  return c?.contacts?.find((x) => x.is_primary) || c?.contacts?.[0] || null
}

function stale(c) {
  return daysSince(c.lastContactAt) >= 30
}

function matchesQuery(c, q) {
  if (!q) return true
  const blob = [
    c.company_name, c.extra_notes, c.website, c.address, c.phone,
    ...c.contacts.flatMap((p) => [p.name, p.email, p.phone, p.role]),
    ...c.logs.flatMap((l) => [l.summary, l.outcome, l.follow_up]),
    ...c.todos.map((t) => t.title + ' ' + (t.note || '')),
    ...c.notes.map((n) => n.body),
    ...c.ideas.map((i) => i.title + ' ' + (i.body || '')),
    ...c.opps.map((o) => o.title + ' ' + (o.notes || '') + ' ' + (o.next_action || '')),
    ...(c.emails || []).flatMap((m) => [m.subject, m.from_email, ...(m.to_emails || [])])
  ].join(' ').toLowerCase()
  return blob.includes(q)
}

function attachEmails() {
  for (const c of customers) {
    c.emails = emails.filter((m) => m.customer_id === c.id)
  }
}

function unreadMailCount() {
  return emails.filter((m) => m.direction === 'in' && !m.read_at).length
}

function threadRoot(email) {
  return email?.thread_id || email?.id || ''
}

function threadOf(id) {
  const start = emails.find((m) => m.id === id)
  if (!start) return []
  const root = threadRoot(start)
  return emails
    .filter((m) => m.id === root || m.thread_id === root)
    .sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)))
}

function latestThreads(list = emails) {
  const groups = new Map()
  for (const email of list) {
    const id = threadRoot(email)
    const cur = groups.get(id)
    if (!cur || String(email.sent_at) > String(cur.sent_at)) groups.set(id, email)
  }
  return [...groups.values()].sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
}

function companyForMail(m) {
  return customers.find((c) => c.id === m.customer_id)?.company_name || m.from_name || m.from_email || 'Onbekend'
}

async function refresh() {
  ;[customers, costs, looseRevenues, looseTodos, emails, mailTemplates, timeEntries] = await Promise.all([
    loadCustomers(), loadCosts(), loadLooseRevenues(), loadLooseTodos(), loadEmails(), loadMailTemplates(), loadTimeEntries()
  ])
  attachEmails()
}

function currentCustomerId() {
  const { parts } = hash()
  return (parts[0] === 'klanten' && parts[1]) ? parts[1] : ''
}

function runningTimer() {
  return timeEntries.find((t) => !t.ended_at) || null
}

function companyName(id) {
  return customers.find((c) => c.id === id)?.company_name || 'Onbekend'
}

function startTimerTick() {
  clearInterval(timerTick)
  const els = [...app.querySelectorAll('[data-elapsed]')]
  if (!els.length) return
  const tick = () => {
    for (const el of els) el.textContent = formatElapsed(elapsedSeconds(el.getAttribute('data-elapsed')))
  }
  tick()
  timerTick = setInterval(tick, 1000)
}

function timerCard() {
  const run = runningTimer()
  if (run) {
    return `<button type="button" class="timer-strip running" data-go="#/uren">
      <span class="time-clock small" data-elapsed="${esc(run.started_at)}">0:00</span>
      <span><b>${esc(companyName(run.customer_id))}</b> · ${esc(timeTypeLabel(run.type))} · openen om te stoppen</span>
    </button>`
  }
  return `<button type="button" class="timer-strip" data-go="#/uren">
    <b>Start uren</b>
    <span class="muted">Kies type en opdrachtgever, daarna start</span>
  </button>`
}

function todayTimeRows() {
  const today = isoDate()
  return timeEntries.filter((t) => t.ended_at && isoDate(new Date(t.started_at)) === today)
}

function timeTodayList() {
  const run = runningTimer()
  const done = todayTimeRows()
  const todaySec = done.reduce((s, t) => s + Number(t.seconds || 0), 0) + (run ? elapsedSeconds(run.started_at) : 0)
  return `
    <section class="section" style="margin-top:1.2rem">
      <header><h3>Vandaag${todaySec ? ' · ' + formatDurationNl(todaySec) : ''}</h3></header>
      <div class="body">
        ${done.length ? `<div class="list">${done.map((t) => `
          <div class="item" style="cursor:default">
            <b>${esc(timeTypeLabel(t.type))} · ${esc(formatDurationNl(t.seconds))}</b>
            <small>${esc(companyName(t.customer_id))}${t.note ? ' · ' + esc(t.note) : ''} · ${fmtDateTime(t.started_at)}</small>
          </div>`).join('')}</div>` : '<p class="muted">Nog geen gestopte uren vandaag.</p>'}
      </div>
    </section>`
}

function urenView() {
  const run = runningTimer()
  const preselect = hash().params.customer || currentCustomerId() || ''
  if (run) {
    return shell(`
      <div class="page-head">
        <div>
          <h1>Uren</h1>
          <p class="lead">Timer loopt. Stop als je klaar bent.</p>
        </div>
        ${plusBar()}
      </div>
      <div class="time-run">
        <p class="time-clock" data-elapsed="${esc(run.started_at)}">0:00</p>
        <p class="lead">${esc(companyName(run.customer_id))} · ${esc(timeTypeLabel(run.type))}</p>
        <form class="form" data-form="time-stop">
          <input type="hidden" name="id" value="${esc(run.id)}">
          <div class="field full"><label>Toelichting</label><input name="note" value="${esc(run.note || '')}" placeholder="Optioneel, bijv. homepage of belletje over offerte"></div>
          <button class="btn time-go stop" type="submit">Stop</button>
        </form>
      </div>
      ${timeTodayList()}
    `, 'time')
  }
  return shell(`
    <div class="page-head">
      <div>
        <h1>Uren</h1>
        <p class="lead">Kies type, kies opdrachtgever, start. Eén timer tegelijk.</p>
      </div>
      ${plusBar()}
    </div>
    ${customers.length ? `
    <form class="form time-start-form" data-form="time-start">
      <div class="field full"><label>Type</label>
        <div class="time-types">
          ${TIME_TYPES.map((t) => `
            <label class="time-type">
              <input type="radio" name="type" value="${esc(t.id)}" required>
              <span>${esc(t.label)}</span>
            </label>`).join('')}
        </div>
      </div>
      ${customerPicker(preselect)}
      <button class="btn time-go" type="submit">Start</button>
    </form>` : '<p class="muted">Voeg eerst een opdrachtgever toe via + → Klant.</p>'}
    ${timeTodayList()}
  `, 'time')
}

function plusBar() {
  const cid = currentCustomerId()
  const items = cid ? [
    ['todo', 'Taak', cid],
    ['opp', 'Kans', cid],
    ['quote', 'Offerte', cid],
    ['mail', 'E-mail', cid],
    ['revenue', 'Opbrengst', cid],
    ['contact', 'Contactpersoon', cid],
    ['cost', 'Kosten', cid]
  ] : [
    ['customer', 'Klant', ''],
    ['todo', 'Taak', ''],
    ['activity', 'Contact', ''],
    ['quote', 'Offerte', ''],
    ['mail', 'E-mail', ''],
    ['cost', 'Kosten', ''],
    ['revenue', 'Opbrengst', '']
  ]
  return `
    <div class="plus" data-plus>
      <button type="button" class="plus-btn" title="Toevoegen" aria-label="Toevoegen">+</button>
      <div class="plus-menu">
        ${items.map(([open, label, customer]) =>
          `<button type="button" data-open="${open}"${customer ? ` data-customer="${esc(customer)}"` : ''}>${label}</button>`
        ).join('')}
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

function customerCostShare(customerId, cadence) {
  return costs.reduce((s, cost) => {
    if (cadence && costCadence(cost) !== cadence) return s
    if (cadence === 'maandelijks' && !isMonthlyActive(cost)) return s
    const a = (cost.allocations || []).find((x) => x.customer_id === customerId)
    return s + Number(a?.amount || 0)
  }, 0)
}

function customerMoneyBlock(c) {
  const revOnce = (c.revenues || []).reduce((s, r) => s + (r.kind === 'maandelijks' ? 0 : Number(r.amount || 0)), 0)
  const revMonth = (c.revenues || []).reduce((s, r) => s + (r.kind === 'maandelijks' ? Number(r.amount || 0) : 0), 0)
  const costOnce = customerCostShare(c.id, 'eenmalig')
  const costMonth = customerCostShare(c.id, 'maandelijks')
  const linkedCosts = costs.filter((x) => (x.allocations || []).some((a) => a.customer_id === c.id))
  return `
    <div class="strip">
      <span>Eenmalig <b class="${revOnce - costOnce >= 0 ? 'good' : 'bad'}">${money(revOnce - costOnce)}</b></span>
      <span class="muted">/mnd <b class="${revMonth - costMonth >= 0 ? 'good' : 'bad'}">${money(revMonth - costMonth)}</b></span>
    </div>
    <div class="list">
      ${(c.revenues || []).map((r) => `<div class="item" style="cursor:default"><b>${esc(r.title)}</b><small>${moneyWithCadence(r.amount, r.kind)} · ${fmtDate(r.received_at)} · ${esc(r.kind)}</small><div class="actions"><button class="btn ghost small" data-open="revenue" data-record="${r.id}" data-customer="${c.id}">Bewerken</button></div></div>`).join('') || '<p class="muted">Nog geen opbrengsten bij deze klant.</p>'}
    </div>
    ${linkedCosts.length ? `<p class="tiny" style="margin-top:.8rem">Kosten: ${linkedCosts.map((x) => `${esc(x.title)} (${cadenceLabel(costCadence(x))})`).join(', ')}</p>` : '<p class="tiny" style="margin-top:.8rem">Geen kosten gekoppeld.</p>'}`
}

function shell(content, active) {
  const email = session?.user?.email || ''
  return `
    <aside class="sidebar">
      <div class="brand">NH<span>.</span><small>Admin</small></div>
      <button class="nav-btn ${active === 'dashboard' ? 'active' : ''}" data-go="#/dashboard">Dashboard</button>
      <button class="nav-btn ${active === 'time' ? 'active' : ''}" data-go="#/uren">Uren${runningTimer() ? ' <span class="chip blue">aan</span>' : ''}</button>
      <button class="nav-btn ${active === 'customers' ? 'active' : ''}" data-go="#/klanten">Opdrachtgevers</button>
      <button class="nav-btn ${active === 'sales' ? 'active' : ''}" data-go="#/sales">Funnel</button>
      <button class="nav-btn ${active === 'todos' ? 'active' : ''}" data-go="#/todos">Taken</button>
      <button class="nav-btn ${active === 'mail' ? 'active' : ''}" data-go="#/mail">Mail${unreadMailCount() ? ` <span class="chip blue">${unreadMailCount()}</span>` : ''}</button>
      <button class="nav-btn ${active === 'money' ? 'active' : ''}" data-go="#/geld">Finance</button>
      <button class="nav-btn ${active === 'settings' ? 'active' : ''}" data-go="#/instellingen">Instellingen</button>
      <div class="spacer"></div>
      <div class="userbox">
        <button type="button" class="who" data-go="#/instellingen">Ingelogd als<b>${esc(email)}</b></button>
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

function dateBucket(dateStr) {
  if (!dateStr) return null
  const d = String(dateStr).slice(0, 10)
  const today = isoDate()
  if (d < today) return 'overdue'
  if (d === today) return 'today'
  if (d <= addDays(7)) return 'week'
  return null
}

function workItems() {
  const today = isoDate()
  const items = []
  const push = (kind, title, sub, href, at, meta) => {
    items.push({ kind, title, sub, href, at: at || '9999', meta })
  }
  const hrefFor = (cid) => cid ? `#/klanten/${cid}` : '#/todos'

  const openTodos = [
    ...customers.flatMap((c) => c.openTodos.map((t) => ({ ...t, company: c.company_name, cid: c.id }))),
    ...looseTodos.filter((t) => t.status === 'open').map((t) => ({ ...t, company: 'Persoonlijk', cid: null }))
  ]
  for (const t of openTodos) {
    const kind = dateBucket(t.due_at) || (t.priority === 'hoog' && !t.due_at ? 'today' : null)
    if (!kind) continue
    push(kind, t.title, `Taak · ${t.company}`, hrefFor(t.cid), t.due_at, t.due_at ? (String(t.due_at).slice(0, 10) === today ? 'vandaag' : fmtDate(t.due_at)) : 'geen datum')
  }
  for (const c of customers) {
    for (const r of c.reminders.filter((x) => !x.done)) {
      const kind = dateBucket(r.remind_at)
      if (!kind) continue
      push(kind, r.title, `Herinnering · ${c.company_name}`, `#/klanten/${c.id}`, r.remind_at, String(r.remind_at).slice(0, 10) === today ? 'vandaag' : fmtDate(r.remind_at))
    }
    for (const o of c.openOpps) {
      const kind = dateBucket(o.next_action_at)
      if (!kind) continue
      push(kind, o.title, `Sales · ${c.company_name}`, `#/klanten/${c.id}?tab=werk`, o.next_action_at, o.next_action || fmtDate(o.next_action_at))
    }
    if (c.status === 'inactief' || c.status === 'verloren') continue
    if (!c.lastContactAt) {
      push('overdue', c.company_name, 'Nog geen contact', `#/klanten/${c.id}`, '0000', '—')
    } else if (stale(c)) {
      push('week', c.company_name, `Stil · ${daysSince(c.lastContactAt)} dagen`, `#/klanten/${c.id}`, c.lastContactAt, daysSince(c.lastContactAt) + ' d')
    }
  }
  for (const m of emails.filter((e) => e.direction === 'in' && !e.read_at)) {
    push('today', m.subject || '(geen onderwerp)', `Mail · ${companyForMail(m)}`, `#/mail/${m.id}`, m.sent_at, 'ongelezen')
  }

  const order = { overdue: 0, today: 1, week: 2 }
  items.sort((a, b) => (order[a.kind] - order[b.kind]) || a.at.localeCompare(b.at) || a.title.localeCompare(b.title, 'nl'))
  return items.slice(0, 24)
}

function queueHtml(items) {
  if (!items.length) return '<p class="muted">Niets openstaand. Lekker.</p>'
  return [['overdue', 'Te laat'], ['today', 'Vandaag'], ['week', 'Deze week / stil']].map(([kind, label]) => {
    const rows = items.filter((i) => i.kind === kind)
    if (!rows.length) return ''
    return `<div class="queue ${kind === 'overdue' ? 'overdue' : ''}">
      <h3>${label}</h3>
      ${rows.map((r) => `
        <div class="queue-row">
          <button type="button" class="queue-main" data-go="${esc(r.href)}">
            <b>${esc(r.title)}</b>
            <small>${esc(r.sub)}</small>
          </button>
          <span class="tiny">${esc(r.meta)}</span>
        </div>`).join('')}
    </div>`
  }).join('')
}

function dashboardView() {
  const today = isoDate()
  const monthRevOnce = allRevenuesList().reduce((s, r) => s + (r.kind === 'maandelijks' || !inPeriod(r.received_at, 'maand') ? 0 : Number(r.amount || 0)), 0)
  const monthCostOnce = costs.reduce((s, c) => s + (isMonthlyCost(c) || !inPeriod(c.incurred_at, 'maand') ? 0 : Number(c.amount || 0)), 0)
  const monthRevRecurring = allRevenuesList().reduce((s, r) => s + (r.kind === 'maandelijks' ? Number(r.amount || 0) : 0), 0)
  const monthCostRecurring = costs.reduce((s, c) => s + (isMonthlyActive(c, today) ? Number(c.amount || 0) : 0), 0)
  const resultOnce = monthRevOnce - monthCostOnce
  const resultMonth = monthRevRecurring - monthCostRecurring

  return shell(`
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p class="lead">Eén lijst. Wat te laat is, wat vandaag moet, wat deze week stilstaat.</p>
      </div>
      ${plusBar()}
    </div>
    ${timerCard()}
    ${queueHtml(workItems())}
    <button type="button" class="strip" data-go="#/geld">
      <span>Deze maand <b class="${resultOnce >= 0 ? 'good' : 'bad'}">${money(resultOnce)}</b></span>
      <span class="muted">Vaste last ${money(resultMonth)} /mnd · Finance →</span>
    </button>
  `, 'dashboard')
}

function itemLink(cid, title, sub) {
  const href = cid ? `#/klanten/${cid}?tab=werk` : '#/todos'
  return `<button class="item" data-go="${href}"><b>${esc(title)}</b><small>${esc(sub)}</small></button>`
}
function customersView(params) {
  const q = (params.q || '').trim().toLowerCase()
  const f = params.f || 'alle'
  let rows = customers.filter((c) => matchesQuery(c, q))
  if (f === 'taken') rows = rows.filter((c) => c.openTodos.length)
  if (f === 'stil') rows = rows.filter(stale)
  if (f === 'sales') rows = rows.filter((c) => c.openOpps.length)

  const filters = [
    ['alle', 'Alle'],
    ['taken', 'Taken'],
    ['stil', 'Stil'],
    ['sales', 'Sales']
  ]

  return shell(`
    <div class="page-head">
      <div>
        <h1>Opdrachtgevers</h1>
        <p class="lead">${rows.length} ${rows.length === 1 ? 'klant' : 'klanten'}</p>
      </div>
      ${plusBar()}
    </div>
    <div class="topbar">
      <input class="search" data-search="klanten" value="${esc(params.q || '')}" placeholder="Zoek klant of contact">
    </div>
    <div class="filters">
      ${filters.map(([id, label]) => `<button class="filter ${f === id ? 'active' : ''}" data-go="#/klanten?f=${id}${q ? '&q=' + encodeURIComponent(params.q) : ''}">${label}</button>`).join('')}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Klant</th><th>Status</th><th>Laatst</th><th>Volgende</th>
        </tr></thead>
        <tbody>
          ${rows.map((c) => `
            <tr data-go="#/klanten/${c.id}">
              <td><b>${esc(c.company_name)}</b>${c.openTodos.length || c.openOpps.length ? `<div class="tiny">${c.openTodos.length ? c.openTodos.length + ' taak' : ''}${c.openTodos.length && c.openOpps.length ? ' · ' : ''}${c.openOpps.length ? c.openOpps.length + ' kans' : ''}</div>` : ''}</td>
              <td><span class="chip ${chipForStatus(c.status)}">${esc(statusLabel(c.status))}</span></td>
              <td>${c.lastContactAt ? `${fmtDate(c.lastContactAt)}${stale(c) ? '<div class="tiny">stil</div>' : ''}` : '<span class="muted">Nog geen</span>'}</td>
              <td>${c.nextAction ? `${esc(c.nextAction.label)}${c.nextAction.at ? `<div class="tiny">${fmtDate(c.nextAction.at)}</div>` : ''}` : '—'}</td>
            </tr>`).join('') || `<tr><td colspan="4" class="muted">Nog geen klanten.</td></tr>`}
        </tbody>
      </table>
    </div>
  `, 'customers')
}

function salesView() {
  const rows = customers.flatMap((c) => c.opps.map((o) => ({ ...o, company: c.company_name, cid: c.id })))
    .sort((a, b) => PHASE_VALUES.indexOf(a.phase === 'onhold' ? 'verloren' : a.phase) - PHASE_VALUES.indexOf(b.phase === 'onhold' ? 'verloren' : b.phase))

  return shell(`
    <div class="page-head">
      <div>
        <h1>Funnel</h1>
        <p class="lead">Fase opschuiven. De rest staat bij de klant.</p>
      </div>
      ${plusBar()}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Klant</th><th>Fase</th><th>Volgende</th><th>Datum</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((o) => {
            const i = PHASE_VALUES.indexOf(o.phase === 'onhold' ? 'verloren' : o.phase)
            return `
            <tr data-go="#/klanten/${o.cid}?tab=werk">
              <td><b>${esc(o.company)}</b><div class="tiny">${esc(o.title)}</div></td>
              <td><span class="chip ${chipForPhase(o.phase)}">${esc(phaseLabel(o.phase))}</span></td>
              <td>${esc(o.next_action || '—')}</td>
              <td>${fmtDate(o.next_action_at)}</td>
              <td class="row-actions" data-stop="1">
                <button type="button" class="btn ghost small" data-open="opp" data-record="${o.id}" data-customer="${o.cid}">Bewerken</button>
                <button class="icon-btn" data-phase="${o.id}" data-dir="-1" ${i <= 0 ? 'disabled' : ''} title="Vorige fase">←</button>
                <button class="icon-btn" data-phase="${o.id}" data-dir="1" ${i >= PHASE_VALUES.length - 1 ? 'disabled' : ''} title="Volgende fase">→</button>
              </td>
            </tr>`
          }).join('') || `<tr><td colspan="5" class="muted">Nog geen kansen.</td></tr>`}
        </tbody>
      </table>
    </div>
  `, 'sales')
}

function todosView() {
  const open = [
    ...customers.flatMap((c) => c.openTodos.map((t) => ({ ...t, company: c.company_name, cid: c.id }))),
    ...looseTodos.filter((t) => t.status === 'open').map((t) => ({ ...t, company: 'Persoonlijk', cid: null }))
  ].sort((a, b) => (a.due_at || '9999').localeCompare(b.due_at || '9999') || (a.priority === 'hoog' ? -1 : 1))
  const done = [
    ...customers.flatMap((c) => c.todos.filter((t) => t.status === 'done').map((t) => ({ ...t, company: c.company_name, cid: c.id }))),
    ...looseTodos.filter((t) => t.status === 'done').map((t) => ({ ...t, company: 'Persoonlijk', cid: null }))
  ].sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at)).slice(0, 8)

  return shell(`
    <div class="page-head">
      <div>
        <h1>Taken</h1>
        <p class="lead">${open.length} open. Mag ook zonder klant.</p>
      </div>
      ${plusBar()}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Taak</th><th>Klant</th><th>Deadline</th><th>Prio</th><th></th></tr></thead>
        <tbody>
          ${open.map((t) => `
            <tr ${t.cid ? `data-go="#/klanten/${t.cid}?tab=werk"` : ''}>
              <td><b>${esc(t.title)}</b>${t.note ? `<div class="tiny">${esc(t.note)}</div>` : ''}</td>
              <td>${esc(t.company)}</td>
              <td>${fmtDate(t.due_at)}</td>
              <td><span class="chip ${prioChip(t.priority)}">${esc(t.priority)}</span></td>
              <td data-stop="1">
                <button class="btn ghost small" data-open="todo" data-record="${t.id}" ${t.cid ? `data-customer="${t.cid}"` : ''}>Bewerken</button>
                <button class="btn ghost small" data-done="${t.id}">Afronden</button>
              </td>
            </tr>`).join('') || `<tr><td colspan="5" class="muted">Geen open taken.</td></tr>`}
        </tbody>
      </table>
    </div>
    ${done.length ? `<h3 style="margin:1.2rem 0 .5rem">Recent afgerond</h3>
    <div class="list">${done.map((t) => itemLink(t.cid, t.title, `${t.company} · ${fmtDate(t.completed_at || t.created_at)}`)).join('')}</div>` : ''}
  `, 'todos')
}

function settingsView() {
  return shell(`
    <div class="page-head">
      <div>
        <h1>Instellingen</h1>
        <p class="lead">Account, voettekst en mailtemplates.</p>
      </div>
    </div>
    <div class="stack">
      <section class="section">
        <header><h3>Account</h3></header>
        <div class="body kv">
          <dt>E-mail</dt><dd>${esc(session.user.email)}</dd>
          <dt>Rol</dt><dd>Admin</dd>
          <dt>Data</dt><dd>Fluweel Supabase, tabellen <code>nh_*</code>.</dd>
          <dt>Versturen</dt><dd>Resend, vanaf <code>contact@nickhoevenaars.nl</code> (Vercel-env <code>EMAIL_FROM</code>).</dd>
          <dt>Ontvangen</dt><dd>Webhook <code>/api/mail-inbound</code>. Zet in TransIP doorsturen aan naar je Resend inbound-adres, MX niet omgooien.</dd>
        </div>
      </section>
      <section class="section">
        <header><h3>Voettekst</h3></header>
        <div class="body">
          <p class="tiny">Onder elke mail, automatisch. Niet in het tekstvak typen.</p>
          <div class="mail-footer">${esc(MAIL_FOOTER)}</div>
        </div>
      </section>
      <section class="section">
        <header>
          <h3>Mailtemplates</h3>
          <button class="btn ghost small" data-open="template">Toevoegen</button>
        </header>
        <div class="body">
          ${mailTemplates.length ? `<div class="list">${mailTemplates.map((t) => `
            <div class="item" style="cursor:default">
              <b>${esc(t.name)}</b>
              <small>${esc(t.subject || '(geen onderwerp)')}</small>
              <div class="actions">
                <button type="button" class="btn ghost small" data-open="template" data-record="${t.id}">Bewerken</button>
                <button type="button" class="btn ghost small" data-delete="nh_mail_templates" data-id="${t.id}">Verwijderen</button>
              </div>
            </div>`).join('')}</div>` : '<p class="muted">Nog geen templates. Voeg de eerste toe; ze verschijnen daarna in de mailmodule.</p>'}
        </div>
      </section>
    </div>
  `, 'settings')
}

function moneyView() {
  const p = moneyPeriod()
  const today = isoDate()
  const oneOffCosts = costs.filter((c) => !isMonthlyCost(c) && inPeriod(c.incurred_at, p))
  const monthlyCosts = costs.filter((c) => isMonthlyActive(c, today))
  const totalCostOnce = oneOffCosts.reduce((s, c) => s + Number(c.amount || 0), 0)
  const totalCostMonth = monthlyCosts.reduce((s, c) => s + Number(c.amount || 0), 0)
  const totalUnlinkedOnce = oneOffCosts.reduce((s, c) => s + Number(c.unlinked || 0), 0)
  const totalUnlinkedMonth = monthlyCosts.reduce((s, c) => s + Number(c.unlinked || 0), 0)
  const allRevenues = allRevenuesList()
  const periodRevenues = allRevenues.filter((r) => r.kind === 'maandelijks' || inPeriod(r.received_at, p))
  const totalRevOnce = periodRevenues.reduce((s, r) => s + (r.kind === 'maandelijks' ? 0 : Number(r.amount || 0)), 0)
  const totalRevMonth = allRevenues.reduce((s, r) => s + (r.kind === 'maandelijks' ? Number(r.amount || 0) : 0), 0)
  const pipeline = customers.flatMap((c) => c.openOpps).reduce((s, o) => s + Number(o.potential_value || 0), 0)
  const acceptedQuotes = customers.flatMap((c) => (c.quotes || []).filter((q) => q.status === 'geaccepteerd'))
    .reduce((s, q) => s + Number(q.amount || 0), 0)
  const perCustomer = customers.map((c) => {
    const revOnce = (c.revenues || []).reduce((s, r) => s + (r.kind === 'maandelijks' || !inPeriod(r.received_at, p) ? 0 : Number(r.amount || 0)), 0)
    const revMonth = (c.revenues || []).reduce((s, r) => s + (r.kind === 'maandelijks' ? Number(r.amount || 0) : 0), 0)
    const costOnce = costs.reduce((s, cost) => {
      if (isMonthlyCost(cost) || !inPeriod(cost.incurred_at, p)) return s
      const a = (cost.allocations || []).find((x) => x.customer_id === c.id)
      return s + Number(a?.amount || 0)
    }, 0)
    const costMonth = customerCostShare(c.id, 'maandelijks')
    return { ...c, revOnce, revMonth, costOnce, costMonth, resultOnce: revOnce - costOnce, resultMonth: revMonth - costMonth }
  }).filter((c) => c.revOnce || c.revMonth || c.costOnce || c.costMonth)
    .sort((a, b) => (b.resultOnce - a.resultOnce) || (b.resultMonth - a.resultMonth))
  const periods = [['maand', 'Deze maand'], ['jaar', 'Dit jaar'], ['alles', 'Alles']]
  const periodLabel = periods.find((x) => x[0] === p)?.[1] || 'Deze maand'

  return shell(`
    <div class="page-head">
      <div>
        <h1>Finance</h1>
        <p class="lead">Eenmalig over ${periodLabel.toLowerCase()}. Maandlast is wat nu loopt.</p>
      </div>
      ${plusBar()}
    </div>
    <div class="filters">
      ${periods.map(([id, label]) => `<button class="filter ${p === id ? 'active' : ''}" data-go="#/geld?p=${id}">${label}</button>`).join('')}
    </div>
    <div class="grid cards">
      <div class="card"><h3>Resultaat eenmalig</h3><div class="metric ${totalRevOnce - totalCostOnce >= 0 ? 'good' : 'bad'}">${money(totalRevOnce - totalCostOnce)}</div><p class="tiny">${money(totalRevOnce)} in · ${money(totalCostOnce)} uit</p></div>
      <div class="card"><h3>Resultaat /mnd</h3><div class="metric ${totalRevMonth - totalCostMonth >= 0 ? 'good' : 'bad'}">${money(totalRevMonth - totalCostMonth)} /mnd</div><p class="tiny">${money(totalRevMonth)} in · ${money(totalCostMonth)} uit</p></div>
      <div class="card"><h3>Pipeline</h3><div class="metric">${money(pipeline)}</div><p class="tiny">${money(acceptedQuotes)} geaccepteerde offertes${totalUnlinkedOnce || totalUnlinkedMonth ? ' · ' + moneyStack(totalUnlinkedOnce, totalUnlinkedMonth) + ' los' : ''}</p></div>
    </div>

    <h3 style="margin:1.4rem 0 .6rem">Per klant</h3>
    <div class="table-wrap static">
      <table>
        <thead><tr><th>Klant</th><th>Opbrengsten</th><th>Kosten</th><th>Saldo</th></tr></thead>
        <tbody>
          ${perCustomer.map((c) => `
            <tr data-go="#/klanten/${c.id}?tab=geld">
              <td><b>${esc(c.company_name)}</b></td>
              <td>${moneyStack(c.revOnce, c.revMonth)}</td>
              <td>${moneyStack(c.costOnce, c.costMonth)}</td>
              <td>${moneyStack(c.resultOnce, c.resultMonth)}</td>
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
        <thead><tr><th>Omschrijving</th><th>Soort</th><th>Bedrag</th><th>Datum</th><th>Verdeling</th><th></th></tr></thead>
        <tbody>
          ${costs.filter((cost) => isMonthlyCost(cost) || inPeriod(cost.incurred_at, p)).map((cost) => `
            <tr>
              <td><b>${esc(cost.title)}</b><div class="tiny">${esc(cost.category || '')}${cost.ended_at ? ' · gestopt ' + fmtDate(cost.ended_at) : ''}</div></td>
              <td><span class="chip ${isMonthlyCost(cost) && !isMonthlyActive(cost, today) ? 'red' : ''}">${esc(cadenceLabel(costCadence(cost)))}${isMonthlyCost(cost) && !isMonthlyActive(cost, today) ? ' · gestopt' : ''}</span></td>
              <td>${moneyWithCadence(cost.amount, costCadence(cost))}</td>
              <td>${isMonthlyCost(cost) ? `<span class="tiny">vanaf</span> ${fmtDate(cost.incurred_at)}${cost.ended_at ? `<div class="tiny">tot ${fmtDate(cost.ended_at)}</div>` : ''}` : fmtDate(cost.incurred_at)}</td>
              <td>${cost.allocations.length
                ? cost.allocations.map((a) => {
                    const cust = customers.find((x) => x.id === a.customer_id)
                    return `${esc(cust?.company_name || '?')} ${moneyWithCadence(a.amount, costCadence(cost))}`
                  }).join('<br>') + (cost.unlinked > 0.009 ? `<div class="tiny">Los: ${moneyWithCadence(cost.unlinked, costCadence(cost))}</div>` : '')
                : '<span class="chip">niet gekoppeld</span>'}</td>
              <td class="row-actions" data-stop="1">
                <button type="button" class="btn ghost small" data-open="cost" data-record="${cost.id}">Bewerken</button>
                <button type="button" class="btn ghost small" data-unlink="${cost.id}">Alles los</button>
                <button type="button" class="btn danger small" data-delete="nh_costs" data-id="${cost.id}">Verwijder</button>
              </td>
            </tr>`).join('') || `<tr><td colspan="6" class="muted">Nog geen kosten.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="page-head" style="margin-top:1.6rem">
      <h3>Opbrengsten</h3>
      <button class="btn ghost small" data-open="revenue">Opbrengst toevoegen</button>
    </div>
    <div class="table-wrap static">
      <table>
        <thead><tr><th>Omschrijving</th><th>Klant</th><th>Bedrag</th><th>Datum</th><th>Soort</th><th></th></tr></thead>
        <tbody>
          ${periodRevenues.map((r) => `
            <tr>
              <td><b>${esc(r.title)}</b></td>
              <td>${r.cid ? `<a href="#/klanten/${r.cid}">${esc(r.company)}</a>` : esc(r.company)}</td>
              <td>${moneyWithCadence(r.amount, r.kind)}</td>
              <td>${fmtDate(r.received_at)}</td>
              <td>${esc(r.kind)}</td>
              <td class="row-actions" data-stop="1">
                <button type="button" class="btn ghost small" data-open="revenue" data-record="${r.id}">Bewerken</button>
                <button type="button" class="btn danger small" data-delete="nh_revenues" data-id="${r.id}">Verwijder</button>
              </td>
            </tr>`).join('') || `<tr><td colspan="6" class="muted">Nog geen opbrengsten in deze periode.</td></tr>`}
        </tbody>
      </table>
    </div>
  `, 'money')
}

function logBar(c) {
  const person = primaryContact(c)
  return `
    <form class="log-bar" data-form="log" data-customer="${c.id}">
      <select name="type" aria-label="Type">${options(CONTACT_TYPES, 'telefoon')}</select>
      <select name="contact_name" aria-label="Wie">
        <option value="">Wie</option>
        ${c.contacts.map((p) => `<option value="${esc(p.name)}" ${p.id === person?.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
      <input name="summary" required placeholder="Wat is er gebeurd?" autocomplete="off">
      <button class="btn small" type="submit">Log</button>
      <button type="button" class="btn ghost small" data-toggle-more>Meer</button>
      <div class="log-more">
        <input name="outcome" placeholder="Uitkomst">
        <input name="follow_up" placeholder="Vervolgactie">
        <select name="remind" aria-label="Reminder">
          <option value="">Geen reminder</option>
          <option value="1">Morgen</option>
          <option value="7">Over 7 dagen</option>
          <option value="90">Over 3 maanden</option>
        </select>
        <input type="datetime-local" name="occurred_at" value="${esc(localInput(new Date()))}" aria-label="Wanneer">
      </div>
    </form>`
}

function customerTabs(c, tab) {
  const unread = (c.emails || []).filter((m) => m.direction === 'in' && !m.read_at).length
  const tabs = [['werk', 'Werk'], ['mail', unread ? `Mail (${unread})` : 'Mail'], ['tijdlijn', 'Tijdlijn'], ['gegevens', 'Gegevens'], ['geld', 'Geld']]
  return `<div class="tabs">${tabs.map(([id, label]) =>
    `<button type="button" class="tab ${tab === id ? 'active' : ''}" data-go="#/klanten/${c.id}?tab=${id}">${label}</button>`
  ).join('')}</div>`
}

function customerWorkTab(c) {
  const openReminders = c.reminders.filter((r) => !r.done)
  const openIdeas = c.ideas.filter((i) => !i.converted_todo_id && !i.converted_opportunity_id)
  const empty = !c.openTodos.length && !c.openOpps.length && !openReminders.length && !openIdeas.length
  const today = isoDate()
  const hoursToday = timeEntries.filter((t) => t.customer_id === c.id && t.ended_at && isoDate(new Date(t.started_at)) === today)
  const run = runningTimer()
  const hourSec = hoursToday.reduce((s, t) => s + Number(t.seconds || 0), 0) + (run?.customer_id === c.id ? elapsedSeconds(run.started_at) : 0)
  return `
    ${hourSec ? `<p class="tiny">Uren vandaag: ${esc(formatDurationNl(hourSec))}${run?.customer_id === c.id ? ' (loopt)' : ''}</p>` : ''}
    ${empty ? '<p class="muted">Niets open. Log contact of voeg een taak toe.</p>' : ''}
    ${c.openTodos.length ? `<section class="section">
      <header><h3>Taken</h3><button class="btn ghost small" data-open="todo" data-customer="${c.id}">Toevoegen</button></header>
      <div class="body list">${c.openTodos.map((t) => `
        <div class="item" style="cursor:default">
          <b>${esc(t.title)} <span class="chip ${prioChip(t.priority)}">${esc(t.priority)}</span></b>
          <small>${t.due_at ? 'Deadline ' + fmtDate(t.due_at) : 'Geen deadline'}${t.note ? ' · ' + esc(t.note) : ''}</small>
          <div class="actions"><button class="btn ghost small" data-open="todo" data-record="${t.id}" data-customer="${c.id}">Bewerken</button><button class="btn ghost small" data-done="${t.id}">Afronden</button></div>
        </div>`).join('')}</div>
    </section>` : ''}
    ${c.openOpps.length ? `<section class="section">
      <header><h3>Kansen</h3><button class="btn ghost small" data-open="opp" data-customer="${c.id}">Toevoegen</button></header>
      <div class="body list">${c.openOpps.map((o) => {
        const i = PHASE_VALUES.indexOf(o.phase === 'onhold' ? 'verloren' : o.phase)
        return `<div class="item" style="cursor:default">
          <b>${esc(o.title)} ${o.is_upsell ? '<span class="chip yellow">upsell</span>' : ''} <span class="chip ${chipForPhase(o.phase)}">${esc(phaseLabel(o.phase))}</span></b>
          <small>${money(o.potential_value)}${o.value_period ? ' ' + esc(o.value_period) : ''} · ${esc(o.next_action || 'geen volgende actie')}${o.next_action_at ? ' · ' + fmtDate(o.next_action_at) : ''}</small>
          <div class="row-actions" style="margin-top:.45rem">
            <button type="button" class="btn ghost small" data-open="opp" data-record="${o.id}" data-customer="${c.id}">Bewerken</button>
            <button class="icon-btn" data-phase="${o.id}" data-dir="-1" ${i <= 0 ? 'disabled' : ''}>←</button>
            <button class="icon-btn" data-phase="${o.id}" data-dir="1" ${i >= PHASE_VALUES.length - 1 ? 'disabled' : ''}>→</button>
          </div>
        </div>`
      }).join('')}</div>
    </section>` : ''}
    ${openReminders.length ? `<section class="section">
      <header><h3>Herinneringen</h3></header>
      <div class="body list">${openReminders.map((r) => `
        <div class="item" style="cursor:default">
          <b>${esc(r.title)} <span class="chip yellow">${fmtDate(r.remind_at)}</span></b>
          <div class="actions"><button class="btn ghost small" data-remind-done="${r.id}">Afronden</button></div>
        </div>`).join('')}</div>
    </section>` : ''}
    ${openIdeas.length ? `<section class="section">
      <header><h3>Ideeën</h3><button class="btn ghost small" data-open="idea" data-customer="${c.id}">Toevoegen</button></header>
      <div class="body list">${openIdeas.map((i) => `
        <div class="item" style="cursor:default">
          <b>${esc(i.title)}</b>
          <small>${esc(i.body || '')}</small>
          <div class="actions">
            <button class="btn ghost small" data-convert="todo" data-idea="${i.id}" data-customer="${c.id}">Maak taak</button>
            <button class="btn ghost small" data-convert="opp" data-idea="${i.id}" data-customer="${c.id}">Maak kans</button>
          </div>
        </div>`).join('')}</div>
    </section>` : ''}
    ${empty ? `<p class="tiny" style="margin-top:.35rem">
      <button class="btn ghost small" data-open="todo" data-customer="${c.id}">Taak</button>
      <button class="btn ghost small" data-open="opp" data-customer="${c.id}">Kans</button>
      <button class="btn ghost small" data-open="idea" data-customer="${c.id}">Idee</button>
    </p>` : ''}`
}

function customerTimelineTab(c) {
  const timeline = buildTimeline(c)
  return `
    <section class="section">
      <header><h3>Tijdlijn</h3><button class="btn ghost small" data-open="note" data-customer="${c.id}">Notitie</button></header>
      <div class="body">
        ${timeline.length ? `<div class="timeline">${timeline.map((t) => `
          <article class="tl">
            <time>${esc(t.when)}</time>
            <div>
              <b>${esc(t.title)}</b>
              <p>${esc(t.body || '')}</p>
              ${t.logId ? `<div class="actions"><button class="btn ghost small" data-open="activity" data-record="${t.logId}" data-customer="${c.id}">Bewerken</button></div>` : ''}
            </div>
          </article>`).join('')}</div>` : '<p class="muted">Nog geen activiteiten. Log hierboven een contact.</p>'}
      </div>
    </section>`
}

function customerDetailsTab(c) {
  return `
    <section class="section">
      <header><h3>Klant</h3></header>
      <div class="body">
        <form class="form two" data-form="customer">
          ${customerForm(c)}
          <div class="actions field full" style="grid-column:1/-1"><button class="btn" type="submit">Opslaan</button></div>
        </form>
      </div>
    </section>
    <section class="section">
      <header><h3>Contactpersonen</h3><button class="btn ghost small" data-open="contact" data-customer="${c.id}">Toevoegen</button></header>
      <div class="body stack">
        ${c.contacts.map((p) => `
          <form class="form two person-form" data-form="contact">
            <input type="hidden" name="id" value="${esc(p.id)}">
            <input type="hidden" name="customer_id" value="${esc(c.id)}">
            <div class="field"><label>Naam</label><input name="name" required value="${esc(p.name)}"></div>
            <div class="field"><label>Rol</label><input name="role" value="${esc(p.role || '')}"></div>
            <div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(p.email || '')}"></div>
            <div class="field"><label>Telefoon</label><input name="phone" value="${esc(p.phone || '')}"></div>
            <div class="field full"><label class="check"><input type="checkbox" name="is_primary" value="1" ${p.is_primary ? 'checked' : ''}> Primair contact</label></div>
            ${contactLinks(p) ? `<p class="tiny field full" style="grid-column:1/-1">${contactLinks(p)}</p>` : ''}
            <div class="actions field full" style="grid-column:1/-1">
              <button type="button" class="btn danger small" data-delete="nh_contacts" data-id="${p.id}">Verwijderen</button>
              <button class="btn" type="submit">Opslaan</button>
            </div>
          </form>`).join('') || '<p class="muted">Nog geen contactpersonen.</p>'}
      </div>
    </section>`
}

function customerMoneyTab(c) {
  return `
    <section class="section">
      <header><h3>Offertes</h3><button class="btn ghost small" data-open="quote" data-customer="${c.id}">Toevoegen</button></header>
      <div class="body list">
        ${(c.quotes || []).map((q) => {
          const booked = bookedQuoteIds().has(q.id)
          return `
          <div class="item" style="cursor:default">
            <b>${esc(q.title)}</b>
            <small>${money(q.amount)} · ${fmtDate(q.issued_at)}${q.valid_until ? ' · geldig tot ' + fmtDate(q.valid_until) : ''}</small>
            <div class="row-actions" style="margin-top:.45rem">
              <select data-quote-status="${q.id}" aria-label="Offertestatus">
                ${options(QUOTE_STATUSES, q.status)}
              </select>
              <button type="button" class="btn ghost small" data-open="quote" data-record="${q.id}" data-customer="${c.id}">Bewerken</button>
              ${q.status === 'geaccepteerd' && !booked ? `<button type="button" class="btn small" data-book-quote="${q.id}">Boek als opbrengst</button>` : ''}
              ${booked ? '<span class="chip green">geboekt</span>' : ''}
            </div>
          </div>`
        }).join('') || '<p class="muted">Nog geen offertes.</p>'}
      </div>
    </section>
    <section class="section">
      <header><h3>Opbrengsten & kosten</h3><div class="row-actions"><button class="btn ghost small" data-open="revenue" data-customer="${c.id}">Opbrengst</button><button class="btn ghost small" data-open="cost" data-customer="${c.id}">Kosten</button></div></header>
      <div class="body">${customerMoneyBlock(c)}</div>
    </section>`
}

function customerView(c) {
  const person = primaryContact(c)
  const tab = ['werk', 'mail', 'tijdlijn', 'gegevens', 'geld'].includes(hash().params.tab) ? hash().params.tab : 'werk'
  const tabBody = tab === 'tijdlijn' ? customerTimelineTab(c)
    : tab === 'gegevens' ? customerDetailsTab(c)
    : tab === 'geld' ? customerMoneyTab(c)
    : tab === 'mail' ? customerMailTab(c)
    : customerWorkTab(c)
  return shell(`
    <div class="page-head">
      <div>
        <p class="tiny"><a href="#/klanten">← Opdrachtgevers</a></p>
        <h1>${esc(c.company_name)}</h1>
        <p class="lead cust-meta">
          <span class="chip ${chipForStatus(c.status)}">${esc(statusLabel(c.status))}</span>
          ${person ? `<span>${esc(person.name)}${contactLinks(person) ? ' · ' + contactLinks(person) : ''}</span>` : ''}
          ${c.phone && c.phone !== person?.phone ? `<span>${contactLinks({ phone: c.phone })}</span>` : ''}
          ${!person && !c.phone ? '<span class="muted">Geen contactpersoon</span>' : ''}
          <span class="muted">Laatst ${c.lastContactAt ? fmtDate(c.lastContactAt) : '—'}</span>
          <span>Volgende ${esc(c.nextAction?.label || '—')}${c.nextAction?.at ? ' · ' + fmtDate(c.nextAction.at) : ''}</span>
        </p>
      </div>
      ${plusBar()}
    </div>
    <p class="tiny" style="margin-bottom:.7rem"><a href="#/uren?customer=${esc(c.id)}">Start uren voor deze opdrachtgever</a></p>
    ${logBar(c)}
    ${customerTabs(c, tab)}
    <div class="stack">${tabBody}</div>
  `, 'customers')
}

function buildTimeline(c) {
  const items = []
  for (const l of c.logs) {
    const who = c.contacts.find((p) => p.id === l.contact_id)
    items.push({
      at: l.occurred_at,
      when: fmtDateTime(l.occurred_at),
      title: `${typeLabel(l.type)} ${who ? 'met ' + who.name : ''}`.trim(),
      body: [l.summary, l.outcome && ('Uitkomst: ' + l.outcome), l.follow_up && ('Vervolg: ' + l.follow_up)].filter(Boolean).join(' '),
      logId: l.id
    })
  }
  for (const t of c.todos.filter((x) => x.status === 'done')) {
    items.push({ at: t.completed_at || t.created_at, when: fmtDate(t.completed_at || t.created_at), title: 'Taak afgerond', body: t.title })
  }
  for (const n of c.notes) {
    items.push({ at: n.created_at, when: fmtDateTime(n.created_at), title: 'Notitie', body: n.body })
  }
  items.sort((a, b) => new Date(b.at) - new Date(a.at))
  return items
}

function localInput(d) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return x.toISOString().slice(0, 16)
}

function customerMailTab(c) {
  const rows = latestThreads(c.emails || [])
  return `
    <section class="section">
      <header>
        <h3>Mail</h3>
        <button class="btn ghost small" data-open="mail" data-customer="${c.id}">Nieuwe mail</button>
      </header>
      <div class="body">
        ${rows.length ? `<div class="list">${rows.map((m) => mailRow(m)).join('')}</div>` : '<p class="muted">Nog geen mail met deze klant. Stuur de eerste vanuit + of hierboven.</p>'}
      </div>
    </section>`
}

function mailRow(m) {
  const unread = m.direction === 'in' && !m.read_at
  const who = m.direction === 'in' ? (m.from_name || m.from_email) : (m.to_emails || []).join(', ')
  return `<button type="button" class="item ${unread ? 'unread' : ''}" data-go="#/mail/${m.id}">
    <b>${esc(m.subject || '(geen onderwerp)')} ${unread ? '<span class="chip blue">nieuw</span>' : ''} <span class="chip">${m.direction === 'in' ? 'In' : 'Uit'}</span></b>
    <small>${esc(companyForMail(m))} · ${esc(who)} · ${fmtDateTime(m.sent_at)}</small>
  </button>`
}

function mailListView(params) {
  const q = (params.q || '').trim().toLowerCase()
  const f = params.f || 'alle'
  let rows = latestThreads()
  if (f === 'ongelezen') rows = rows.filter((m) => threadOf(m.id).some((x) => x.direction === 'in' && !x.read_at))
  if (f === 'in') rows = rows.filter((m) => m.direction === 'in')
  if (f === 'uit') rows = rows.filter((m) => m.direction === 'out')
  if (q) {
    rows = rows.filter((m) => {
      const blob = [m.subject, m.from_email, m.from_name, ...(m.to_emails || []), companyForMail(m), m.text_body].join(' ').toLowerCase()
      return blob.includes(q)
    })
  }
  const filters = [['alle', 'Alle'], ['ongelezen', 'Ongelezen'], ['in', 'Ontvangen'], ['uit', 'Verstuurd']]
  return shell(`
    <div class="page-head">
      <div>
        <h1>Mail</h1>
        <p class="lead">${unreadMailCount() ? unreadMailCount() + ' ongelezen. ' : ''}Versturen en lezen op één plek.</p>
      </div>
      ${plusBar()}
    </div>
    <div class="topbar">
      <input class="search" data-search="mail" value="${esc(params.q || '')}" placeholder="Zoek onderwerp of adres">
    </div>
    <div class="filters">
      ${filters.map(([id, label]) => `<button class="filter ${f === id ? 'active' : ''}" data-go="#/mail?f=${id}${q ? '&q=' + encodeURIComponent(params.q) : ''}">${label}</button>`).join('')}
    </div>
    <div class="list">${rows.map(mailRow).join('') || '<p class="muted">Nog geen mail. Stuur er een via + → E-mail.</p>'}</div>
  `, 'mail')
}

function mailBodyHtml(m) {
  if (m.html_body) {
    return `<iframe class="mail-frame" sandbox="" srcdoc="${esc(m.html_body)}" title="Mailinhoud"></iframe>`
  }
  return `<pre class="mail-text">${esc(m.text_body || '(geen inhoud)')}</pre>`
}

function mailThreadView(id) {
  const messages = threadOf(id)
  if (!messages.length) {
    return shell('<p>Mail niet gevonden.</p><p class="tiny"><a href="#/mail">← Inbox</a></p>', 'mail')
  }
  const latest = messages[messages.length - 1]
  const company = companyForMail(latest)
  const cid = latest.customer_id
  return shell(`
    <div class="page-head">
      <div>
        <p class="tiny"><a href="#/mail">← Inbox</a>${cid ? ` · <a href="#/klanten/${cid}?tab=mail">${esc(company)}</a>` : ''}</p>
        <h1>${esc(latest.subject || '(geen onderwerp)')}</h1>
        <p class="lead">${esc(company)} · ${messages.length} ${messages.length === 1 ? 'bericht' : 'berichten'}</p>
      </div>
      <div class="row-actions">
        <button class="btn" data-open="mail" data-record="${latest.id}"${cid ? ` data-customer="${cid}"` : ''}>Beantwoorden</button>
      </div>
    </div>
    ${!cid ? `<form class="log-bar" data-form="link-mail" data-mail="${latest.id}">
      <span class="tiny">Niet gekoppeld</span>
      <select name="customer_id" required aria-label="Klant">${customers.map((c) => `<option value="${esc(c.id)}">${esc(c.company_name)}</option>`).join('')}</select>
      <span></span>
      <button class="btn small" type="submit">Koppelen</button>
    </form>` : ''}
    <div class="stack">${messages.map((m) => `
      <article class="section mail-msg ${m.direction === 'in' && !m.read_at ? 'unread' : ''}">
        <header>
          <h3>${m.direction === 'in' ? 'Ontvangen' : 'Verstuurd'} · ${esc(m.from_name || m.from_email)}</h3>
          <span class="tiny">${fmtDateTime(m.sent_at)}</span>
        </header>
        <div class="body">
          <p class="tiny">Van ${esc(m.from_email)} → ${esc((m.to_emails || []).join(', ') || '—')}</p>
          ${mailBodyHtml(m)}
        </div>
      </article>`).join('')}
    </div>
  `, 'mail')
}

function mailTemplatePicker() {
  const options = [`<option value="">Geen template</option>`]
    .concat(mailTemplates.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`))
    .join('')
  return `<div class="field full"><label>Template</label>
    ${mailTemplates.length
      ? `<select name="template_id">${options}</select>`
      : '<p class="tiny">Nog geen templates. Voeg ze toe via Instellingen → Mailtemplates.</p>'}</div>`
}

function quotedMailBody(existingMail) {
  if (!existingMail?.text_body) return ''
  return `\n\n\n> ${String(existingMail.text_body).split('\n').join('\n> ')}`
}

function bindMailTemplateSelect(wrap, isReply) {
  const sel = wrap.querySelector('select[name="template_id"]')
  if (!sel) return
  sel.addEventListener('change', () => {
    const t = mailTemplates.find((x) => x.id === sel.value)
    if (!t) return
    const subjectEl = wrap.querySelector('[name="subject"]')
    const bodyEl = wrap.querySelector('[name="text"]')
    const quoted = wrap.querySelector('[name="quoted"]')?.value || ''
    const filled = {
      subject: (isReply && subjectEl.value) ? subjectEl.value : (t.subject || ''),
      body: (t.body || '') + quoted
    }
    subjectEl.value = filled.subject
    bodyEl.value = filled.body
  })
}

function modalHtml(title, body, formName, submitLabel = 'Opslaan') {
  return `<div class="modal-back"><div class="modal">
    <h2>${esc(title)}</h2>
    <form class="form two" data-form="${formName}">${body}
      <div class="actions full field" style="grid-column:1/-1">
        <button type="button" class="btn ghost" data-close="1">Annuleren</button>
        <button class="btn" type="submit">${esc(submitLabel)}</button>
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
    <div class="field"><label>Telefoon</label><input name="phone" value="${esc(c.phone || '')}" placeholder="06 12345678" inputmode="tel"></div>
    <div class="field full"><label>Adres</label><input name="address" value="${esc(c.address || '')}"></div>
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
  const existingTodo = kind === 'todo' && payload.recordId ? findTodo(payload.recordId) : null
  const existingOpp = kind === 'opp' && payload.recordId ? findOpp(payload.recordId) : null
  const existingLog = kind === 'activity' && payload.recordId ? findLog(payload.recordId) : null
  const existingQuote = kind === 'quote' && payload.recordId ? allQuotes().find((q) => q.id === payload.recordId) : null
  const existingRev = kind === 'revenue' && payload.recordId ? allRevenuesList().find((r) => r.id === payload.recordId) : null
  const existingCost = kind === 'cost' && payload.recordId ? costs.find((x) => x.id === payload.recordId) : null
  const existingMail = kind === 'mail' && payload.recordId ? emails.find((m) => m.id === payload.recordId) : null
  const existingTemplate = kind === 'template' && payload.recordId ? mailTemplates.find((t) => t.id === payload.recordId) : null
  const customerId = payload.customerId || payload.customer?.id || existingTodo?.cid || existingOpp?.cid || existingLog?.cid || existingQuote?.cid || existingRev?.cid || existingMail?.customer_id || ''
  const c = payload.customer || customers.find((x) => x.id === customerId)
  const needCustomer = !c && ['opp', 'contact', 'activity', 'quote'].includes(kind) && !payload.recordId
  if (kind === 'customer') wrap.innerHTML = modalHtml(payload.customer?.id ? 'Klant bewerken' : 'Nieuwe klant', customerForm(payload.customer || {}), 'customer')
  if (kind === 'contact') wrap.innerHTML = modalHtml('Contactpersoon', `
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(customerId)}
    <div class="field"><label>Naam</label><input name="name" required placeholder="Typ de naam"></div>
    <div class="field"><label>Rol</label><input name="role"></div>
    <div class="field"><label>E-mail</label><input name="email" type="email"></div>
    <div class="field"><label>Telefoon</label><input name="phone"></div>
    <div class="field full"><label class="check"><input type="checkbox" name="is_primary" value="1"> Primair contact</label></div>`, 'contact')
  if (kind === 'todo') wrap.innerHTML = modalHtml(existingTodo ? 'Taak bewerken' : 'Taak', `
    <input type="hidden" name="id" value="${esc(existingTodo?.id || '')}">
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(existingTodo?.cid || customerId, { required: false, allowNone: true })}
    <div class="field full"><label>Omschrijving</label><input name="title" required value="${esc(existingTodo?.title || '')}"></div>
    <div class="field"><label>Deadline</label><input type="date" name="due_at" value="${esc(existingTodo?.due_at || '')}"></div>
    <div class="field"><label>Prioriteit</label><select name="priority">${options([{ id: 'laag', label: 'Laag' }, { id: 'normaal', label: 'Normaal' }, { id: 'hoog', label: 'Hoog' }], existingTodo?.priority || 'normaal')}</select></div>
    <div class="field full"><label>Notitie</label><textarea name="note">${esc(existingTodo?.note || '')}</textarea></div>
    ${existingTodo ? '' : `<div class="field"><label>Reminder</label>
      <select name="remind"><option value="">Geen</option><option value="due">Op deadline</option><option value="1">Morgen</option><option value="7">Over 7 dagen</option></select>
    </div>`}`, 'todo')
  if (kind === 'idea') wrap.innerHTML = modalHtml('Idee', `
    <input type="hidden" name="customer_id" value="${esc(customerId)}">
    <div class="field full"><label>Idee</label><input name="title" required></div>
    <div class="field full"><label>Toelichting</label><textarea name="body"></textarea></div>`, 'idea')
  if (kind === 'opp') wrap.innerHTML = modalHtml(existingOpp ? 'Kans bewerken' : 'Kans / upsell', `
    <input type="hidden" name="id" value="${esc(existingOpp?.id || '')}">
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(existingOpp?.cid || customerId)}
    <div class="field full"><label>Omschrijving</label><input name="title" required value="${esc(existingOpp?.title || '')}"></div>
    <div class="field"><label>Potentiële waarde (€)</label><input name="potential_value" type="number" step="1" value="${esc(existingOpp?.potential_value ?? '')}"></div>
    <div class="field"><label>Periode</label><input name="value_period" placeholder="eenmalig, per maand" value="${esc(existingOpp?.value_period || '')}"></div>
    <div class="field"><label>Fase</label><select name="phase">${options(PHASES, existingOpp?.phase || 'nieuw')}</select></div>
    <div class="field"><label>Verwachte termijn</label><input type="date" name="expected_at" value="${esc(existingOpp?.expected_at || '')}"></div>
    <div class="field"><label>Volgende actie</label><input name="next_action" value="${esc(existingOpp?.next_action || '')}"></div>
    <div class="field"><label>Datum volgende actie</label><input type="date" name="next_action_at" value="${esc(existingOpp?.next_action_at || '')}"></div>
    <div class="field full"><label>Notities</label><textarea name="notes">${esc(existingOpp?.notes || '')}</textarea></div>
    <div class="field full"><label class="check"><input type="checkbox" name="is_upsell" value="1" ${existingOpp?.is_upsell ? 'checked' : ''}> Upsell-mogelijkheid</label></div>
    ${existingOpp ? '' : `<div class="field"><label>Reminder</label>
      <select name="remind"><option value="">Geen</option><option value="next">Op volgende actie</option><option value="1">Morgen</option><option value="7">Over 7 dagen</option><option value="90">Over 3 maanden</option></select>
    </div>`}`, 'opp')
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
  if (kind === 'activity') wrap.innerHTML = modalHtml(existingLog ? 'Activiteit bewerken' : 'Activiteit', `
    <input type="hidden" name="id" value="${esc(existingLog?.id || '')}">
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(existingLog?.cid || customerId)}
    <div class="field"><label>Datum en tijd</label><input type="datetime-local" name="occurred_at" value="${esc(existingLog ? localInput(new Date(existingLog.occurred_at)) : localInput(new Date()))}" required></div>
    <div class="field"><label>Type</label><select name="type">${options(CONTACT_TYPES, existingLog?.type || 'telefoon')}</select></div>
    ${contactPersonFields(c, existingLog?.contact_id || primaryContact(c)?.id)}
    <div class="field full"><label>Korte omschrijving</label><input name="summary" required value="${esc(existingLog?.summary || '')}"></div>
    <div class="field"><label>Uitkomst</label><input name="outcome" value="${esc(existingLog?.outcome || '')}"></div>
    <div class="field"><label>Vervolgactie</label><input name="follow_up" value="${esc(existingLog?.follow_up || '')}"></div>`, 'activity')
  if (kind === 'quote') wrap.innerHTML = modalHtml(existingQuote ? 'Offerte bewerken' : 'Offerte', `
    <input type="hidden" name="id" value="${esc(existingQuote?.id || '')}">
    ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(existingQuote?.cid || customerId)}
    <div class="field full"><label>Omschrijving</label><input name="title" required placeholder="Website redesign" value="${esc(existingQuote?.title || '')}"></div>
    <div class="field"><label>Bedrag €</label><input name="amount" type="number" step="0.01" value="${esc(existingQuote?.amount ?? '')}"></div>
    <div class="field"><label>Status</label><select name="status">${options(QUOTE_STATUSES, existingQuote?.status || 'concept')}</select></div>
    <div class="field"><label>Datum</label><input type="date" name="issued_at" value="${esc(existingQuote?.issued_at || isoDate())}"></div>
    <div class="field"><label>Geldig tot</label><input type="date" name="valid_until" value="${esc(existingQuote?.valid_until || '')}"></div>
    <div class="field full"><label>Notities</label><textarea name="notes">${esc(existingQuote?.notes || '')}</textarea></div>`, 'quote')
  if (kind === 'revenue') wrap.innerHTML = modalHtml(existingRev ? 'Opbrengst bewerken' : 'Opbrengst', `
    <input type="hidden" name="id" value="${esc(existingRev?.id || '')}">
    <input type="hidden" name="quote_id" value="${esc(existingRev?.quote_id || '')}">
    ${customerPicker(existingRev?.cid || customerId, { required: false, allowNone: true })}
    <div class="field full"><label>Omschrijving</label><input name="title" required placeholder="Factuur #12" value="${esc(existingRev?.title || '')}"></div>
    <div class="field"><label>Bedrag €</label><input name="amount" type="number" step="0.01" required value="${esc(existingRev?.amount ?? '')}"></div>
    <div class="field"><label>Soort</label><select name="kind">${options(REVENUE_KINDS, existingRev?.kind || 'eenmalig')}</select></div>
    <div class="field"><label>Ontvangen op</label><input type="date" name="received_at" value="${esc(existingRev?.received_at || isoDate())}"></div>
    <div class="field full"><label>Notities</label><textarea name="notes">${esc(existingRev?.notes || '')}</textarea></div>`, 'revenue')
  if (kind === 'cost') {
    const existing = existingCost
    wrap.innerHTML = modalHtml(existing ? 'Kosten bewerken' : 'Kosten', `
      <input type="hidden" name="id" value="${esc(existing?.id || '')}">
      <div class="field full"><label>Omschrijving</label><input name="title" required value="${esc(existing?.title || '')}" placeholder="Hosting, tools, inkoop…"></div>
      <div class="field"><label>Bedrag €</label><input name="amount" type="number" step="0.01" min="0" required value="${esc(existing?.amount ?? '')}"><p class="tiny">Bij maandelijks: bedrag per maand</p></div>
      <div class="field"><label>Soort</label><select name="cadence">${options(COST_CADENCES, existing?.cadence || 'eenmalig')}</select></div>
      <div class="field"><label>Datum</label><input type="date" name="incurred_at" value="${esc(existing?.incurred_at || isoDate())}"><p class="tiny">Bij maandelijks: startdatum</p></div>
      <div class="field"><label>Einddatum</label><input type="date" name="ended_at" value="${esc(existing?.ended_at || '')}"><p class="tiny">Alleen maandelijks. Leeg = loopt nog</p></div>
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
    wrap.querySelector('.modal')?.classList.add('wide')
  }
  if (kind === 'template') {
    wrap.innerHTML = modalHtml(existingTemplate ? 'Template bewerken' : 'Nieuw template', `
      <input type="hidden" name="id" value="${esc(existingTemplate?.id || '')}">
      <div class="field full"><label>Naam</label><input name="name" required value="${esc(existingTemplate?.name || '')}" placeholder="Bijv. Introductie"></div>
      <div class="field full"><label>Onderwerp</label><input name="subject" value="${esc(existingTemplate?.subject || '')}"></div>
      <div class="field full"><label>Bericht</label><textarea name="body" rows="10" placeholder="Hoi,">${esc(existingTemplate?.body || '')}</textarea></div>
    `, 'template')
    wrap.querySelector('.modal')?.classList.add('wide')
  }
  if (kind === 'mail') {
    const person = primaryContact(c)
    const to = existingMail
      ? (existingMail.direction === 'in' ? existingMail.from_email : ((existingMail.to_emails || [])[0] || ''))
      : (person?.email || '')
    const subject = existingMail
      ? (/^re\s*:/i.test(existingMail.subject || '') ? existingMail.subject : `Re: ${existingMail.subject || ''}`)
      : ''
    const contactsWithMail = (c?.contacts || []).filter((p) => p.email)
    const quoted = quotedMailBody(existingMail)
    wrap.innerHTML = modalHtml(existingMail ? 'Beantwoorden' : 'Nieuwe mail', `
      <input type="hidden" name="reply_to_id" value="${esc(existingMail?.id || '')}">
      <input type="hidden" name="contact_id" value="${esc((existingMail?.contact_id || person?.id) || '')}">
      <input type="hidden" name="send_token" value="${esc(crypto.randomUUID())}">
      <textarea name="quoted" hidden>${esc(quoted)}</textarea>
      ${c ? `<input type="hidden" name="customer_id" value="${esc(c.id)}">` : customerPicker(customerId, { required: false, allowNone: true })}
      ${mailTemplatePicker()}
      <div class="field full"><label>Aan</label>
        <input name="to" type="email" required value="${esc(to)}" list="mail-to" placeholder="naam@bedrijf.nl" autocomplete="email">
        <datalist id="mail-to">${contactsWithMail.map((p) => `<option value="${esc(p.email)}">${esc(p.name)}</option>`).join('')}</datalist>
      </div>
      <div class="field full"><label>Onderwerp</label><input name="subject" required value="${esc(subject)}" autocomplete="off"></div>
      <div class="field full"><label>Bericht</label><textarea name="text" required placeholder="Hoi,">${esc(quoted)}</textarea></div>
      <div class="field full">
        <label>Voettekst (automatisch)</label>
        <div class="mail-footer">${esc(MAIL_FOOTER)}</div>
      </div>
    `, 'mail', 'Versturen')
    wrap.querySelector('.modal')?.classList.add('wide')
  }
  if (!wrap.innerHTML) return
  document.body.classList.add('modal-open')
  document.body.appendChild(wrap)
  wrap.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      closeModal(wrap)
    })
  })
  wrap.querySelector('form')?.addEventListener('submit', (e) => onSubmit(e, wrap))
  const quick = wrap.querySelector('select[name="quick"]')
  if (quick) quick.addEventListener('change', () => {
    if (quick.value) wrap.querySelector('[name="remind_at"]').value = addDays(Number(quick.value))
  })
  bindAllocUi(wrap)
  bindMailTemplateSelect(wrap, !!existingMail)
  if (kind === 'mail') wrap.querySelector('textarea[name="text"]')?.setSelectionRange(0, 0)
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

const claimedMailSends = new Set()

function setFormSending(form, sending) {
  const submit = form.querySelector('button[type="submit"]')
  if (sending) {
    form.dataset.busy = '1'
    if (submit) {
      if (!submit.dataset.label) submit.dataset.label = submit.textContent
      submit.disabled = true
      if (form.dataset.form === 'mail') submit.textContent = 'Versturen…'
    }
    form.querySelectorAll('[data-close]').forEach((el) => { el.disabled = true })
  } else {
    form.dataset.busy = ''
    if (submit) {
      submit.disabled = false
      if (submit.dataset.label) submit.textContent = submit.dataset.label
    }
    form.querySelectorAll('[data-close]').forEach((el) => { el.disabled = false })
  }
}

async function onSubmit(e, modal) {
  e.preventDefault()
  const form = e.target
  if (form.dataset.busy === '1') return
  setFormSending(form, true)
  const kind = form.dataset.form
  const v = fd(form)
  try {
    if (kind === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password })
      if (error) { app.innerHTML = loginView(error.message); bind(); return }
      await boot()
      return
    }
    if (kind === 'time-start') {
      if (runningTimer()) { flash('Er loopt al een timer'); return }
      if (!v.customer_id || !v.type) throw new Error('Kies type en opdrachtgever.')
      await upsert('nh_time_entries', {
        customer_id: v.customer_id,
        type: v.type,
        started_at: new Date().toISOString()
      })
      await refresh()
      flash('Timer gestart')
      go('#/uren')
      return
    }
    if (kind === 'time-stop') {
      const row = timeEntries.find((t) => t.id === v.id) || runningTimer()
      if (!row) throw new Error('Geen lopende timer.')
      const ended = new Date()
      const seconds = elapsedSeconds(row.started_at, ended)
      const note = (v.note || '').trim()
      const summary = [timeTypeLabel(row.type), formatDurationNl(seconds), note].filter(Boolean).join(' · ')
      let logId = null
      if (row.customer_id) {
        const log = await upsert('nh_contact_logs', {
          customer_id: row.customer_id,
          type: mapTimeTypeToLogType(row.type),
          summary,
          occurred_at: new Date(row.started_at).toISOString()
        })
        logId = log.id
      }
      await upsert('nh_time_entries', {
        ended_at: ended.toISOString(),
        seconds,
        note: note || null,
        contact_log_id: logId
      }, row.id)
      await refresh()
      flash('Gestopt · ' + formatDurationNl(seconds))
      go('#/uren')
      return
    }
    if (kind === 'customer') {
      const id = v.id
      delete v.id
      const row = await upsert('nh_customers', v, id)
      await refresh()
      closeModal(modal)
      flash('Klant opgeslagen')
      go('#/klanten/' + row.id + (hash().params.tab ? '?tab=' + hash().params.tab : ''))
      return
    }
    if (kind === 'contact') {
      const id = v.id
      delete v.id
      await upsert('nh_contacts', { customer_id: v.customer_id, name: v.name, role: v.role, email: v.email, phone: v.phone, is_primary: !!v.is_primary }, id)
    }
    if (kind === 'todo') {
      const id = v.id
      delete v.id
      const payload = {
        customer_id: v.customer_id, title: v.title, due_at: v.due_at,
        priority: v.priority || 'normaal', note: v.note
      }
      if (!id) payload.status = 'open'
      const row = await upsert('nh_todos', payload, id)
      if (!id) await maybeReminder(v.customer_id, v.title, v.remind, v.due_at, 'todo', row.id)
    }
    if (kind === 'idea') await upsert('nh_ideas', { customer_id: v.customer_id, title: v.title, body: v.body })
    if (kind === 'opp') {
      const id = v.id
      delete v.id
      const row = await upsert('nh_opportunities', {
        customer_id: v.customer_id, title: v.title, phase: v.phase || 'nieuw',
        potential_value: v.potential_value ? Number(v.potential_value) : null,
        value_period: v.value_period, expected_at: v.expected_at, next_action: v.next_action,
        next_action_at: v.next_action_at, notes: v.notes, is_upsell: !!v.is_upsell
      }, id)
      if (!id) await maybeReminder(v.customer_id, v.title, v.remind, v.next_action_at, 'opportunity', row.id)
    }
    if (kind === 'note') await upsert('nh_notes', { customer_id: v.customer_id, body: v.body })
    if (kind === 'reminder') {
      await upsert('nh_reminders', { customer_id: v.customer_id, title: v.title, remind_at: v.remind_at, related_type: 'standalone', done: false })
    }
    if (kind === 'quote') {
      const id = v.id
      delete v.id
      await upsert('nh_quotes', {
        customer_id: v.customer_id, title: v.title, amount: v.amount ? Number(v.amount) : null,
        status: v.status || 'concept', issued_at: v.issued_at || isoDate(), valid_until: v.valid_until, notes: v.notes
      }, id)
    }
    if (kind === 'revenue') {
      const id = v.id
      delete v.id
      await upsert('nh_revenues', {
        customer_id: v.customer_id, quote_id: v.quote_id, title: v.title, amount: Number(v.amount),
        kind: v.kind || 'eenmalig', received_at: v.received_at || isoDate(), notes: v.notes
      }, id)
    }
    if (kind === 'cost') {
      const id = v.id
      delete v.id
      const row = await upsert('nh_costs', {
        title: v.title, amount: Number(v.amount), incurred_at: v.incurred_at || isoDate(),
        cadence: v.cadence === 'maandelijks' ? 'maandelijks' : 'eenmalig',
        ended_at: v.cadence === 'maandelijks' ? (v.ended_at || null) : null,
        category: v.category, notes: v.notes
      }, id)
      await replaceAllocations(row.id, readAllocations(form))
    }
    if (kind === 'log' || kind === 'activity') {
      const customerId = form.dataset.customer || v.customer_id
      const contactId = await resolveContact(customerId, v)
      const id = v.id
      delete v.id
      const row = await upsert('nh_contact_logs', {
        customer_id: customerId,
        contact_id: contactId,
        occurred_at: new Date(v.occurred_at || Date.now()).toISOString(),
        type: v.type, summary: v.summary, outcome: v.outcome, follow_up: v.follow_up
      }, id)
      if (!id) await maybeReminder(customerId, v.follow_up || v.summary, v.remind, null, 'contact_log', row.id)
      closeModal(modal)
      await refresh()
      flash(id ? 'Contactmoment aangepast' : 'Contactmoment gelogd')
      return
    }
    if (kind === 'template') {
      const id = v.id
      delete v.id
      await upsert('nh_mail_templates', {
        name: (v.name || '').trim(),
        subject: v.subject || '',
        body: v.body || ''
      }, id)
      closeModal(modal)
      await refresh()
      flash(id ? 'Template aangepast' : 'Template toegevoegd')
      return
    }
    if (kind === 'mail') {
      const token = v.send_token
      if (token && claimedMailSends.has(token)) {
        closeModal(modal)
        return
      }
      if (token) claimedMailSends.add(token)
      let sent
      try {
        sent = await sendMailApi({
          to: v.to,
          subject: v.subject,
          text: withMailFooter(v.text),
          customer_id: v.customer_id,
          contact_id: v.contact_id,
          reply_to_id: v.reply_to_id
        })
      } catch (err) {
        if (token) claimedMailSends.delete(token)
        throw err
      }
      closeModal(modal)
      await refresh()
      flash('Mail verstuurd')
      go('#/mail/' + sent.id)
      return
    }
    if (kind === 'link-mail') {
      const id = form.dataset.mail
      const thread = threadOf(id)
      for (const m of thread) {
        await upsert('nh_emails', { customer_id: v.customer_id }, m.id)
      }
      closeModal(modal)
      await refresh()
      flash('Gekoppeld aan klant')
      return
    }
    closeModal(modal)
    await refresh()
    flash('Opgeslagen')
  } catch (err) {
    setFormSending(form, false)
    alert(err.message || String(err))
  }
}

async function paint() {
  const { parts, params } = hash()
  const page = parts[0] || 'dashboard'
  if (page === 'mail' && parts[1]) {
    const thread = threadOf(parts[1])
    const unread = thread.filter((m) => m.direction === 'in' && !m.read_at)
    if (unread.length) {
      await Promise.all(unread.map((m) => upsert('nh_emails', { read_at: new Date().toISOString() }, m.id)))
      await refresh()
    }
    app.innerHTML = mailThreadView(parts[1])
  } else if (page === 'mail') app.innerHTML = mailListView(params)
  else if (page === 'klanten' && parts[1]) {
    const c = customers.find((x) => x.id === parts[1]) || await loadCustomer(parts[1]).catch(() => null)
    if (!c) { app.innerHTML = shell('<p>Klant niet gevonden.</p>', 'customers'); bind(); return }
    if (!customers.find((x) => x.id === c.id)) customers.push(c)
    c.emails = emails.filter((m) => m.customer_id === c.id)
    app.innerHTML = customerView(c)
  } else if (page === 'klanten') app.innerHTML = customersView(params)
  else if (page === 'sales') app.innerHTML = salesView()
  else if (page === 'todos') app.innerHTML = todosView()
  else if (page === 'uren') app.innerHTML = urenView()
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
  const mailSearch = app.querySelector('[data-search="mail"]')
  if (mailSearch) {
    let t
    mailSearch.addEventListener('input', () => {
      clearTimeout(t)
      t = setTimeout(() => {
        const f = hash().params.f || 'alle'
        go(`#/mail?f=${f}&q=${encodeURIComponent(mailSearch.value)}`)
      }, 200)
    })
  }
  app.querySelectorAll('[data-action="logout"]').forEach((el) => el.addEventListener('click', async () => {
    await sb.auth.signOut()
    session = null
    customers = []
    timeEntries = []
    clearInterval(timerTick)
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
    try {
      showModal(kind, { customer, customerId: customer?.id || customerId, recordId })
    } catch (err) {
      console.error(err)
      alert(err.message || String(err))
    }
  }))
  app.querySelectorAll('[data-toggle-more]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault()
    const bar = el.closest('.log-bar')
    if (!bar) return
    bar.classList.toggle('show-more')
    el.textContent = bar.classList.contains('show-more') ? 'Minder' : 'Meer'
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
    await refresh(); flash('Taak afgerond')
  }))
  app.querySelectorAll('[data-remind-done]').forEach((el) => el.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation()
    await upsert('nh_reminders', { done: true }, el.getAttribute('data-remind-done'))
    await refresh(); flash('Reminder klaar')
  }))
  app.querySelectorAll('[data-quote-status]').forEach((el) => el.addEventListener('change', async (e) => {
    e.stopPropagation()
    await upsert('nh_quotes', { status: el.value }, el.getAttribute('data-quote-status'))
    await refresh()
    flash('Offertestatus aangepast')
  }))
  app.querySelectorAll('[data-book-quote]').forEach((el) => el.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const q = allQuotes().find((x) => x.id === el.getAttribute('data-book-quote'))
    if (!q) return
    if (bookedQuoteIds().has(q.id)) { flash('Al geboekt'); return }
    await upsert('nh_revenues', {
      customer_id: q.cid || q.customer_id,
      quote_id: q.id,
      title: q.title,
      amount: Number(q.amount || 0),
      kind: 'offerte',
      received_at: isoDate(),
      notes: q.notes || null
    })
    await refresh()
    flash('Opbrengst geboekt')
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
  startTimerTick()
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
  if (e.target.closest('.plus-btn') || e.target.closest('.plus-menu')) return
  document.querySelectorAll('[data-plus].open').forEach((el) => el.classList.remove('open'))
})
syncAppViewport()
window.visualViewport?.addEventListener('resize', syncAppViewport)
window.visualViewport?.addEventListener('scroll', syncAppViewport)
window.addEventListener('orientationchange', syncAppViewport)
boot()
