const MONTHS_SHORT = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
const BAR_FALLBACK = ['#93294E', '#E08A3A', '#E6C14A', '#8B6BB5', '#C45C4A', '#3D8B8B']

function roundMoney (n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function parseAmount (value) {
  const raw = String(value ?? '').trim().replace(/€/g, '').replace(/\s/g, '')
  if (!raw) return null
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export function formatMoney (n, { signed = false } = {}) {
  const num = Number(n) || 0
  const cents = Math.round(Math.abs(num) * 100)
  const fractionDigits = cents % 100 === 0 ? 0 : 2
  const body = new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2
  }).format(Math.abs(num))
  const core = `€${body}`
  if (signed && num > 0) return `+${core}`
  if (num < 0) return `−${core}`
  return core
}

export function accountBalance (account, transactions = []) {
  const start = Number(account.opening_balance) || 0
  const openingDate = String(account.opening_date || '0000-01-01').slice(0, 10)
  const delta = transactions.reduce((sum, tx) => {
    const date = String(tx.date || '').slice(0, 10)
    if (date < openingDate) return sum
    const amount = Number(tx.amount) || 0
    if (tx.entry_type === 'income' && tx.account_id === account.id) return sum + amount
    if (tx.entry_type === 'expense' && tx.account_id === account.id) return sum - amount
    if (tx.account_id === account.id) return sum - amount
    if (tx.counterparty_account_id === account.id) return sum + amount
    return sum
  }, 0)
  return Math.round((start + delta) * 100) / 100
}

export function accountTypeLabel (type) {
  if (type === 'checking') return 'Betaalrekening'
  if (type === 'savings') return 'Spaarrekening'
  return 'Overig'
}

export function formatDay (iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
}

export function isoDate (date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function periodRange (now, monthStartDay = 1) {
  const day = Math.min(28, Math.max(1, Number(monthStartDay) || 1))
  const year = now.getFullYear()
  const month = now.getMonth()
  const start = now.getDate() >= day
    ? new Date(year, month, day)
    : new Date(year, month - 1, day)
  const next = new Date(start.getFullYear(), start.getMonth() + 1, day)
  const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1)
  return { start, end, startIso: isoDate(start), endIso: isoDate(end) }
}

export function formatPeriod (start, end) {
  const sameYear = start.getFullYear() === end.getFullYear()
  const left = `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}${sameYear ? '' : ` ${start.getFullYear()}`}`
  const right = `${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`
  return `${left} – ${right}`
}

export function periodTitle (start, end) {
  const next = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
  if (start.getDate() === 1 && next.getDate() === 1) {
    const label = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(start)
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  return formatPeriod(start, end)
}

export function goalsLabel (count) {
  const n = Number(count) || 0
  if (n <= 0) return 'Nog geen'
  return String(n)
}

export function inPeriod (iso, startIso, endIso) {
  const day = String(iso || '').slice(0, 10)
  return day >= startIso && day <= endIso
}

function sumType (rows, type, startIso, endIso) {
  return roundMoney((rows || []).reduce((sum, row) => {
    if (row.entry_type !== type) return sum
    if (!inPeriod(row.date, startIso, endIso)) return sum
    return sum + (Number(row.amount) || 0)
  }, 0))
}

export function periodTotals (transactions, planned, startIso, endIso) {
  const pending = (planned || []).filter((row) => row.status === 'pending')
  const income = roundMoney(
    sumType(transactions, 'income', startIso, endIso) +
    sumType(pending, 'income', startIso, endIso)
  )
  const expense = roundMoney(
    sumType(transactions, 'expense', startIso, endIso) +
    sumType(pending, 'expense', startIso, endIso)
  )
  return { income, expense, result: roundMoney(income - expense) }
}

export function netWorth (accounts, transactions = []) {
  return roundMoney((accounts || [])
    .filter((account) => !account.is_archived)
    .reduce((sum, account) => sum + accountBalance(account, transactions), 0))
}

export function monthlyAmount (item) {
  const amount = Number(item?.amount) || 0
  const interval = Math.max(1, Number(item?.interval_count) || 1)
  if (item?.frequency === 'yearly') return roundMoney(amount / (12 * interval))
  if (item?.frequency === 'weekly') return roundMoney((amount * 52) / (12 * interval))
  return roundMoney(amount / interval)
}

export function fixedCosts (recurring = []) {
  return roundMoney(recurring
    .filter((row) => row.is_active !== false && row.entry_type === 'expense')
    .reduce((sum, row) => sum + monthlyAmount(row), 0))
}

export function topExpenses (transactions, planned, categories, startIso, endIso, limit = 6) {
  const byId = new Map((categories || []).map((cat) => [cat.id, cat]))
  const totals = new Map()
  const add = (row) => {
    if (row.entry_type !== 'expense') return
    if (row.status && row.status !== 'pending') return
    if (!inPeriod(row.date, startIso, endIso)) return
    const key = row.category_id || row.description || 'overig'
    const current = totals.get(key) || { key, name: 'Overig', color: null, amount: 0 }
    const category = byId.get(row.category_id)
    if (category) {
      current.name = category.name
      current.color = category.color || current.color
    } else if (!row.category_id && row.description) {
      current.name = row.description
    }
    current.amount = roundMoney(current.amount + (Number(row.amount) || 0))
    totals.set(key, current)
  }
  ;(transactions || []).forEach(add)
  ;(planned || []).forEach(add)
  const ranked = [...totals.values()].sort((a, b) => b.amount - a.amount).slice(0, limit)
  const max = ranked[0]?.amount || 0
  return ranked.map((row, index) => ({
    ...row,
    color: row.color || BAR_FALLBACK[index % BAR_FALLBACK.length],
    pct: max ? Math.max(8, Math.round((row.amount / max) * 100)) : 0
  }))
}

export function displayName (user, settings) {
  const fromSettings = String(settings?.display_name || '').trim()
  if (fromSettings) return fromSettings
  const meta = user?.user_metadata || {}
  return String(meta.full_name || meta.name || '').trim()
}
