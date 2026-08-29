export const GENDERS = [
  { id: 'heer', label: 'Heer' },
  { id: 'mevrouw', label: 'Mevrouw' }
]

export function splitFullName(name) {
  const t = String(name || '').trim()
  if (!t) return { first_name: '', last_name: '' }
  const i = t.indexOf(' ')
  if (i < 0) return { first_name: t, last_name: '' }
  return { first_name: t.slice(0, i), last_name: t.slice(i + 1).trim() }
}

export function namesOf(person) {
  const first = String(person?.first_name || '').trim()
  const last = String(person?.last_name || '').trim()
  if (first || last) return { first_name: first, last_name: last }
  return splitFullName(person?.name)
}

export function fullName(person) {
  const { first_name, last_name } = namesOf(person)
  const joined = [first_name, last_name].filter(Boolean).join(' ')
  return joined || String(person?.name || '').trim()
}

export function normalizeGender(value) {
  return value === 'heer' || value === 'mevrouw' ? value : null
}

export function contactRecord(v) {
  const first = String(v.first_name || '').trim()
  const last = String(v.last_name || '').trim()
  if (!first) {
    const err = new Error('Vul een voornaam in.')
    err.status = 400
    throw err
  }
  return {
    customer_id: v.customer_id,
    first_name: first,
    last_name: last || null,
    gender: normalizeGender(v.gender),
    name: [first, last].filter(Boolean).join(' '),
    role: v.role || null,
    email: v.email || null,
    phone: v.phone || null,
    is_primary: !!v.is_primary
  }
}

export function formalGreetingReady(person) {
  const { last_name } = namesOf(person)
  return !!(normalizeGender(person?.gender) && last_name)
}
