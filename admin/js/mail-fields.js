const PLACEHOLDER_RE = /\[([a-zA-Zà-ÿÀ-Ÿ][a-zA-Zà-ÿÀ-Ÿ0-9 _-]{0,39})\]/g

export const MAIL_INSERT_FIELDS = [
  { key: 'naam', label: 'Naam' },
  { key: 'bedrijfsnaam', label: 'Bedrijfsnaam' },
  { key: 'website', label: 'Website' },
  { key: 'datum', label: 'Datum' }
]

export function normalizeMailFieldKey(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function mailFieldLabel(key) {
  const hit = MAIL_INSERT_FIELDS.find((x) => x.key === key)
  if (hit) return hit.label
  const s = String(key || '')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

export function findMailPlaceholders(text) {
  const found = []
  const seen = new Set()
  const re = new RegExp(PLACEHOLDER_RE.source, 'g')
  let m
  while ((m = re.exec(String(text || '')))) {
    const key = normalizeMailFieldKey(m[1])
    if (!key || seen.has(key)) continue
    seen.add(key)
    found.push(key)
  }
  return found
}

export function leftoverMailPlaceholders(text) {
  const withoutQuoted = String(text || '')
    .split('\n')
    .filter((line) => !/^>/.test(line))
    .join('\n')
  return findMailPlaceholders(withoutQuoted)
}

export function leftoverFieldsError(keys) {
  if (!keys?.length) return null
  return 'Vul nog in: ' + keys.map((k) => `[${k}]`).join(', ')
}

export function applyMailPlaceholders(text, values = {}) {
  return String(text || '').replace(new RegExp(PLACEHOLDER_RE.source, 'g'), (all, raw) => {
    const key = normalizeMailFieldKey(raw)
    const v = values[key]
    return (v != null && String(v).trim() !== '') ? String(v) : all
  })
}

export function mailAutofillValues({ customer, contact, now = new Date() } = {}) {
  const full = String(contact?.name || '').trim()
  const first = full.split(/\s+/).filter(Boolean)[0] || ''
  const company = String(customer?.company_name || '').trim()
  const website = String(customer?.website || '').trim()
  const email = String(contact?.email || customer?.billing_email || '').trim()
  const datum = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  const pairs = [
    ['naam', first || full],
    ['voornaam', first],
    ['volledige naam', full],
    ['contact', full],
    ['contactpersoon', full],
    ['bedrijfsnaam', company],
    ['bedrijf', company],
    ['klant', company],
    ['website', website],
    ['email', email],
    ['datum', datum],
    ['vandaag', datum]
  ]
  return Object.fromEntries(pairs.filter(([, v]) => v))
}

export function appendMailFooter(body, footer) {
  const f = String(footer || '').trim()
  if (!f) return String(body || '')
  const b = String(body || '').replace(/[ \t]+$/gm, '').replace(/\s+$/, '')
  if (!b) return f
  if (b.endsWith(f)) return b
  return `${b}\n\n${f}`
}

export function fillFromMailTemplate(template, { isReply = false, currentSubject = '', quoted = '', values = {}, footer = '' } = {}) {
  if (!template) {
    return { subject: currentSubject, body: appendMailFooter('', footer) + quoted }
  }
  const subject = (isReply && currentSubject)
    ? currentSubject
    : applyMailPlaceholders(template.subject || '', values)
  const body = appendMailFooter(applyMailPlaceholders(template.body || '', values), footer) + quoted
  return { subject, body }
}
