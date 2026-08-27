import test from 'node:test'
import assert from 'node:assert/strict'
import {
  elapsedSeconds,
  formatElapsed,
  formatDurationNl,
  mapTimeTypeToLogType,
  timeTypeLabel
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
