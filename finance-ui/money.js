export function parseAmount (value) {
  const raw = String(value ?? '').trim().replace(/€/g, '').replace(/\s/g, '')
  if (!raw) return null
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export function formatMoney (n) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)
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
