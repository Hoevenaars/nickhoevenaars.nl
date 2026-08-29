import test from 'node:test'
import assert from 'node:assert/strict'
import {
  splitFullName,
  namesOf,
  fullName,
  contactRecord,
  formalGreetingReady,
  normalizeGender
} from './contacts.js'

test('splitFullName keeps tussenvoegsels on the last name', () => {
  assert.deepEqual(splitFullName('Ada Jansen'), { first_name: 'Ada', last_name: 'Jansen' })
  assert.deepEqual(splitFullName('Jan de Vries'), { first_name: 'Jan', last_name: 'de Vries' })
  assert.deepEqual(splitFullName('Madonna'), { first_name: 'Madonna', last_name: '' })
  assert.deepEqual(splitFullName('  '), { first_name: '', last_name: '' })
})

test('namesOf prefers stored first/last and falls back to name', () => {
  assert.deepEqual(namesOf({ first_name: 'Ada', last_name: 'Jansen', name: 'Oud' }), { first_name: 'Ada', last_name: 'Jansen' })
  assert.deepEqual(namesOf({ name: 'Jan de Vries' }), { first_name: 'Jan', last_name: 'de Vries' })
})

test('fullName joins parts', () => {
  assert.equal(fullName({ first_name: 'Ada', last_name: 'Jansen' }), 'Ada Jansen')
  assert.equal(fullName({ first_name: 'Ada' }), 'Ada')
  assert.equal(fullName({ name: 'Oud' }), 'Oud')
})

test('contactRecord writes name from first and last', () => {
  assert.deepEqual(contactRecord({
    customer_id: 'k1',
    first_name: ' Ada ',
    last_name: ' Jansen ',
    gender: 'mevrouw',
    email: 'ada@x.nl',
    is_primary: true
  }), {
    customer_id: 'k1',
    first_name: 'Ada',
    last_name: 'Jansen',
    gender: 'mevrouw',
    name: 'Ada Jansen',
    role: null,
    email: 'ada@x.nl',
    phone: null,
    is_primary: true
  })
  assert.throws(() => contactRecord({ first_name: '  ' }), /voornaam/)
  assert.equal(normalizeGender('x'), null)
})

test('formalGreetingReady needs gender and last name', () => {
  assert.equal(formalGreetingReady({ gender: 'heer', last_name: 'Jansen' }), true)
  assert.equal(formalGreetingReady({ gender: 'heer', first_name: 'Jan' }), false)
  assert.equal(formalGreetingReady({ last_name: 'Jansen' }), false)
})
