import test from 'node:test'
import assert from 'node:assert/strict'
import {
  elapsedSeconds,
  formatElapsed,
  formatDurationNl,
  mapTimeTypeToLogType,
  timeTypeLabel,
  parseLocalDateTime,
  toLocalInput,
  durationParts,
  addDuration,
  resolveTimeRange
} from './time.js'

test('elapsedSeconds rounds to whole seconds', () => {
  assert.equal(elapsedSeconds('2026-08-27T10:00:00.000Z', '2026-08-27T10:01:30.400Z'), 90)
  assert.equal(elapsedSeconds('invalid', new Date()), 0)
})

test('formatElapsed shows m:ss until an hour', () => {
  assert.equal(formatElapsed(0), '0:00')
  assert.equal(formatElapsed(65), '1:05')
  assert.equal(formatElapsed(3661), '1:01:01')
})

test('formatDurationNl is compact Dutch', () => {
  assert.equal(formatDurationNl(12), '12s')
  assert.equal(formatDurationNl(60), '1m')
  assert.equal(formatDurationNl(3720), '1u 2m')
  assert.equal(formatDurationNl(3600), '1u')
})

test('time types map onto existing contact logs', () => {
  assert.equal(timeTypeLabel('ontwikkelen'), 'Ontwikkelen')
  assert.equal(mapTimeTypeToLogType('telefoon'), 'telefoon')
  assert.equal(mapTimeTypeToLogType('mail'), 'email')
  assert.equal(mapTimeTypeToLogType('afspraak'), 'meeting')
  assert.equal(mapTimeTypeToLogType('ontwikkelen'), 'overig')
})

test('parseLocalDateTime reads datetime-local as wall time', () => {
  const d = parseLocalDateTime('2026-08-28T09:30')
  assert.ok(d)
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth(), 7)
  assert.equal(d.getDate(), 28)
  assert.equal(d.getHours(), 9)
  assert.equal(d.getMinutes(), 30)
  assert.equal(toLocalInput(d), '2026-08-28T09:30')
  assert.equal(parseLocalDateTime(''), null)
  assert.equal(parseLocalDateTime('nope'), null)
})

test('durationParts splits hours and leftover minutes', () => {
  assert.deepEqual(durationParts(0), { hours: 0, minutes: 0, seconds: 0 })
  assert.deepEqual(durationParts(90), { hours: 0, minutes: 2, seconds: 90 })
  assert.deepEqual(durationParts(3720), { hours: 1, minutes: 2, seconds: 3720 })
  assert.deepEqual(durationParts(3600), { hours: 1, minutes: 0, seconds: 3600 })
})

test('addDuration sets end from start plus hours and minutes', () => {
  const start = parseLocalDateTime('2026-08-28T09:00')
  const end = addDuration(start, 2, 15)
  assert.equal(toLocalInput(end), '2026-08-28T11:15')
  assert.equal(elapsedSeconds(start, end), 2 * 3600 + 15 * 60)
})

test('resolveTimeRange prefers end time and falls back to duration', () => {
  const fromEnd = resolveTimeRange({ startedAt: '2026-08-28T09:00', endedAt: '2026-08-28T11:00' })
  assert.equal(toLocalInput(fromEnd.started), '2026-08-28T09:00')
  assert.equal(toLocalInput(fromEnd.ended), '2026-08-28T11:00')
  const fromDur = resolveTimeRange({ startedAt: '2026-08-28T09:00', hours: 1, minutes: 30 })
  assert.equal(toLocalInput(fromDur.ended), '2026-08-28T10:30')
  const empty = resolveTimeRange({ startedAt: 'nope' })
  assert.equal(empty.started, null)
  assert.equal(empty.ended, null)
})
