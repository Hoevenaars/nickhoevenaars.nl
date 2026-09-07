import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAmount,
  formatMoney,
  accountBalance,
  accountTypeLabel,
  periodRange,
  formatPeriod,
  periodTitle,
  periodTotals,
  netWorth,
  fixedCosts,
  topExpenses,
  displayName,
  goalsLabel,
  isoDate
} from './money.js'

test('parseAmount accepts dutch and plain decimals', () => {
  assert.equal(parseAmount('1500,50'), 1500.5)
  assert.equal(parseAmount('1.500,50'), 1500.5)
  assert.equal(parseAmount('0'), 0)
  assert.equal(parseAmount(''), null)
})

test('formatMoney matches compact euro style', () => {
  assert.equal(formatMoney(7382), '€7.382')
  assert.equal(formatMoney(256, { signed: true }), '+€256')
  assert.equal(formatMoney(-20), '−€20')
  assert.equal(formatMoney(12.5), '€12,50')
})

test('accountBalance uses opening balance when there are no transactions', () => {
  const account = { id: 'a', opening_balance: 0, opening_date: '2026-09-03' }
  assert.equal(accountBalance(account, []), 0)
  assert.equal(accountBalance({ ...account, opening_balance: 1250 }, []), 1250)
})

test('accountBalance adds income and subtracts expenses', () => {
  const account = { id: 'a', opening_balance: 100, opening_date: '2026-09-01' }
  const txs = [
    { account_id: 'a', entry_type: 'income', amount: 50, date: '2026-09-02' },
    { account_id: 'a', entry_type: 'expense', amount: 20, date: '2026-09-03' }
  ]
  assert.equal(accountBalance(account, txs), 130)
})

test('accountTypeLabel maps checking accounts', () => {
  assert.equal(accountTypeLabel('checking'), 'Betaalrekening')
})

test('periodRange uses month start day across a month boundary', () => {
  const range = periodRange(new Date(2026, 8, 6), 22)
  assert.equal(isoDate(range.start), '2026-08-22')
  assert.equal(isoDate(range.end), '2026-09-21')
  assert.equal(formatPeriod(range.start, range.end), '22 Aug – 21 Sep 2026')
})

test('periodRange starts on the 1st when that is the cycle day', () => {
  const range = periodRange(new Date(2026, 8, 6), 1)
  assert.equal(range.startIso, '2026-09-01')
  assert.equal(range.endIso, '2026-09-30')
  assert.equal(periodTitle(range.start, range.end), 'september 2026'.replace(/^./, (c) => c.toUpperCase()))
})

test('periodTotals combine booked and pending planned amounts', () => {
  const totals = periodTotals(
    [{ entry_type: 'income', amount: 7000, date: '2026-09-01' }],
    [
      { entry_type: 'income', amount: 382, date: '2026-09-10', status: 'pending' },
      { entry_type: 'expense', amount: 7126, date: '2026-09-12', status: 'pending' },
      { entry_type: 'expense', amount: 99, date: '2026-09-12', status: 'paid' }
    ],
    '2026-09-01',
    '2026-09-30'
  )
  assert.equal(totals.income, 7382)
  assert.equal(totals.expense, 7126)
  assert.equal(totals.result, 256)
})

test('netWorth sums live account balances', () => {
  const accounts = [
    { id: 'a', opening_balance: 200, opening_date: '2026-01-01', is_archived: false },
    { id: 'b', opening_balance: 50, opening_date: '2026-01-01', is_archived: false },
    { id: 'c', opening_balance: 999, opening_date: '2026-01-01', is_archived: true }
  ]
  assert.equal(netWorth(accounts, []), 250)
})

test('fixedCosts converts active recurring expenses to a monthly figure', () => {
  assert.equal(fixedCosts([
    { entry_type: 'expense', amount: 2400, frequency: 'monthly', is_active: true },
    { entry_type: 'expense', amount: 248, frequency: 'yearly', is_active: true },
    { entry_type: 'income', amount: 3000, frequency: 'monthly', is_active: true }
  ]), 2420.67)
})

test('topExpenses ranks categories and scales bars to the largest', () => {
  const rows = topExpenses(
    [{ entry_type: 'expense', amount: 2500, date: '2026-09-02', category_id: 'h' }],
    [{ entry_type: 'expense', amount: 148, date: '2026-09-03', category_id: 'v', status: 'pending' }],
    [
      { id: 'h', name: 'Hypotheek', color: '#93294E' },
      { id: 'v', name: 'Vaste Lasten', color: '#E08A3A' }
    ],
    '2026-09-01',
    '2026-09-30'
  )
  assert.equal(rows[0].name, 'Hypotheek')
  assert.equal(rows[0].pct, 100)
  assert.equal(rows[1].name, 'Vaste Lasten')
  assert.equal(rows[1].amount, 148)
})

test('displayName prefers a real name and stays empty otherwise', () => {
  assert.equal(displayName({ email: 'x@y.nl' }, { display_name: 'Marlot' }), 'Marlot')
  assert.equal(displayName({ email: 'x@y.nl', user_metadata: { full_name: 'Ada' } }, {}), 'Ada')
  assert.equal(displayName({ email: 'nick@site.nl' }, {}), '')
})

test('goalsLabel is plain language for zero', () => {
  assert.equal(goalsLabel(0), 'Nog geen')
  assert.equal(goalsLabel(11), '11')
})
