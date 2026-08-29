import test from 'node:test'
import assert from 'node:assert/strict'
import { plusContextFromRoute, plusItems } from './plus.js'

test('mail inbox plus is taak and nieuwe mail', () => {
  const ctx = plusContextFromRoute(['mail'], {})
  const items = plusItems(ctx)
  assert.deepEqual(items.map((i) => i.open), ['todo', 'mail'])
  assert.equal(items[1].label, 'Nieuwe mail')
})

test('funnel plus is taak, offerte and kans', () => {
  const items = plusItems(plusContextFromRoute(['sales'], {}))
  assert.deepEqual(items.map((i) => [i.open, i.label]), [
    ['todo', 'Taak'],
    ['quote', 'Offerte'],
    ['opp', 'Kans']
  ])
})

test('todo is always first even on the taken board', () => {
  const items = plusItems(plusContextFromRoute(['todos'], {}))
  assert.deepEqual(items, [{ open: 'todo', label: 'Taak' }])
})

test('customer mail tab keeps the customer on nieuwe mail', () => {
  const ctx = plusContextFromRoute(['klanten', 'c1'], { tab: 'mail' })
  assert.equal(ctx.page, 'customer')
  assert.equal(ctx.tab, 'mail')
  const items = plusItems(ctx)
  assert.deepEqual(items.map((i) => i.open), ['todo', 'mail'])
  assert.equal(items[0].customerId, 'c1')
  assert.equal(items[1].customerId, 'c1')
  assert.equal(items[1].label, 'Nieuwe mail')
})

test('customer finance tab is offerte, opbrengst and kosten', () => {
  const items = plusItems(plusContextFromRoute(['klanten', 'c1'], { tab: 'geld' }))
  assert.deepEqual(items.map((i) => i.open), ['todo', 'quote', 'revenue', 'cost'])
})

test('customer werk tab is kans and idee, not mail', () => {
  const items = plusItems(plusContextFromRoute(['klanten', 'abc'], {}))
  assert.deepEqual(items.map((i) => i.open), ['todo', 'opp', 'idea'])
})

test('opdrachtgevers list plus is klant', () => {
  const items = plusItems(plusContextFromRoute(['klanten'], {}))
  assert.deepEqual(items.map((i) => i.open), ['todo', 'customer'])
})

test('finance page plus matches money actions', () => {
  const items = plusItems(plusContextFromRoute(['geld'], {}))
  assert.deepEqual(items.map((i) => i.open), ['todo', 'quote', 'revenue', 'cost'])
})
