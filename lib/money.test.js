import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAllocations, allocationsToSave } from './money.js'

test('explicit 0 keeps a customer linked (coulance)', () => {
  assert.deepEqual(
    resolveAllocations([{ customer_id: 'c1', amount: '0' }], 120),
    [{ customer_id: 'c1', amount: 0 }]
  )
})

test('empty amount on a 0 euro cost still links the customer', () => {
  assert.deepEqual(
    resolveAllocations([{ customer_id: 'c1', amount: '' }], 0),
    [{ customer_id: 'c1', amount: 0 }]
  )
})

test('empty amount still splits the leftover', () => {
  assert.deepEqual(
    resolveAllocations([{ customer_id: 'c1', amount: '' }], 100),
    [{ customer_id: 'c1', amount: 100 }]
  )
  assert.deepEqual(
    resolveAllocations([
      { customer_id: 'c1', amount: '40' },
      { customer_id: 'c2', amount: '' }
    ], 100),
    [
      { customer_id: 'c1', amount: 40 },
      { customer_id: 'c2', amount: 60 }
    ]
  )
  assert.deepEqual(
    resolveAllocations([
      { customer_id: 'c1', amount: '0' },
      { customer_id: 'c2', amount: '' }
    ], 80),
    [
      { customer_id: 'c1', amount: 0 },
      { customer_id: 'c2', amount: 80 }
    ]
  )
})

test('allocationsToSave keeps 0 and drops rows without a customer', () => {
  assert.deepEqual(
    allocationsToSave([
      { customer_id: 'c1', amount: 0 },
      { customer_id: '', amount: 10 },
      { customer_id: 'c2', amount: 12.5 }
    ]),
    [
      { customer_id: 'c1', amount: 0 },
      { customer_id: 'c2', amount: 12.5 }
    ]
  )
})
