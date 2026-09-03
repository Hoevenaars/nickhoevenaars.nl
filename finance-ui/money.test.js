import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAmount, accountBalance, accountTypeLabel } from './money.js'

test('parseAmount accepts dutch and plain decimals', () => {
  assert.equal(parseAmount('1500,50'), 1500.5)
  assert.equal(parseAmount('1.500,50'), 1500.5)
  assert.equal(parseAmount('0'), 0)
  assert.equal(parseAmount(''), null)
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
