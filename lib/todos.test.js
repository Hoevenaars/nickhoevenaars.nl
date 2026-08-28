import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checklistStats,
  isOverdue,
  formatDueShort,
  fieldsForDone,
  fieldsForProgress,
  sortTodosInBucket,
  todosByBucket,
  nextSortOrder,
  newChecklistItem,
  relativeTimeNl,
  labelColor
} from './todos.js'

test('checklistStats counts done items', () => {
  assert.deepEqual(checklistStats(null), { total: 0, done: 0 })
  assert.deepEqual(checklistStats([
    { id: 'a', title: 'x', done: true },
    { id: 'b', title: 'y', done: false }
  ]), { total: 2, done: 1 })
})

test('isOverdue ignores completed tasks', () => {
  assert.equal(isOverdue('2026-08-01', 'open', '2026-08-28'), true)
  assert.equal(isOverdue('2026-08-01', 'done', '2026-08-28'), false)
  assert.equal(isOverdue('2026-09-01', 'open', '2026-08-28'), false)
  assert.equal(isOverdue(null, 'open', '2026-08-28'), false)
})

test('formatDueShort is day-month', () => {
  assert.equal(formatDueShort('2026-09-04'), '04-09')
  assert.equal(formatDueShort(''), '')
})

test('fieldsForProgress keeps dashboard status in sync', () => {
  const done = fieldsForDone(true)
  assert.equal(done.status, 'done')
  assert.equal(done.progress, 'voltooid')
  assert.ok(done.completed_at)
  const open = fieldsForProgress('bezig')
  assert.equal(open.status, 'open')
  assert.equal(open.completed_at, null)
})

test('todosByBucket splits unassigned and sorts', () => {
  const buckets = [{ id: 'b1', name: 'Nu', position: 0 }]
  const todos = [
    { id: '2', bucket_id: 'b1', sort_order: 2, created_at: '2026-01-02' },
    { id: '1', bucket_id: 'b1', sort_order: 1, created_at: '2026-01-01' },
    { id: 'x', bucket_id: null, sort_order: 0, created_at: '2026-01-03' }
  ]
  const { grouped, unassigned } = todosByBucket(todos, buckets)
  assert.deepEqual(grouped.get('b1').map((t) => t.id), ['1', '2'])
  assert.deepEqual(unassigned.map((t) => t.id), ['x'])
  assert.equal(nextSortOrder(grouped.get('b1')), 3)
})

test('newChecklistItem trims title', () => {
  const item = newChecklistItem('  bel  ', 'c1')
  assert.deepEqual(item, { id: 'c1', title: 'bel', done: false })
})

test('relativeTimeNl is compact Dutch', () => {
  const now = new Date('2026-08-28T10:00:00')
  assert.equal(relativeTimeNl('2026-08-28T09:59:50', now), 'zojuist')
  assert.equal(relativeTimeNl('2026-08-28T09:00:00', now), '1 uur geleden')
  assert.equal(relativeTimeNl('2026-08-27T10:00:00', now), 'gisteren')
})

test('labelColor falls back to pink', () => {
  assert.equal(labelColor('peach').bg, '#f5c9a8')
  assert.equal(labelColor('nope').id, 'pink')
})
