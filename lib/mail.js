export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function parseAddress(raw) {
  const s = String(raw || '').trim()
  if (!s) return { email: '', name: '' }
  const angle = s.match(/^(.*)<([^>]+)>\s*$/)
  if (angle) {
    return {
      name: angle[1].trim().replace(/^["']|["']$/g, ''),
      email: normalizeEmail(angle[2])
    }
  }
  return { name: '', email: normalizeEmail(s) }
}

export function asEmailList(value) {
  if (Array.isArray(value)) return value.map((v) => parseAddress(v).email).filter(Boolean)
  if (!value) return []
  return String(value)
    .split(',')
    .map((part) => parseAddress(part).email)
    .filter(Boolean)
}

export function headerLookup(headers, name) {
  if (!headers || typeof headers !== 'object') return ''
  const want = name.toLowerCase()
  const key = Object.keys(headers).find((k) => k.toLowerCase() === want)
  return key ? String(headers[key] || '') : ''
}

export function matchParty(email, contacts = [], customers = []) {
  const needle = parseAddress(email).email
  if (!needle) return { customer_id: null, contact_id: null }
  const contact = contacts.find((c) => normalizeEmail(c.email) === needle)
  if (contact) return { customer_id: contact.customer_id || null, contact_id: contact.id || null }
  const customer = customers.find((c) => normalizeEmail(c.billing_email) === needle)
  if (customer) return { customer_id: customer.id || null, contact_id: null }
  return { customer_id: null, contact_id: null }
}

export function rootThreadId(email) {
  return email?.thread_id || email?.id || null
}

export function resolveThreadId(emails, { inReplyTo, messageId } = {}) {
  const reply = String(inReplyTo || '').trim()
  const msg = String(messageId || '').trim()
  if (reply) {
    const parent = emails.find((e) => e.message_id && e.message_id === reply)
    if (parent) return rootThreadId(parent)
  }
  if (msg) {
    const existing = emails.find((e) => e.message_id && e.message_id === msg)
    if (existing) return rootThreadId(existing)
  }
  return null
}

export function previewText(email, max = 140) {
  const text = String(email?.text_body || '').replace(/\s+/g, ' ').trim()
  if (text) return text.length > max ? text.slice(0, max - 1) + '…' : text
  const html = String(email?.html_body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!html) return ''
  return html.length > max ? html.slice(0, max - 1) + '…' : html
}

export function inboxThreads(emails = []) {
  const groups = new Map()
  for (const email of emails) {
    const id = rootThreadId(email)
    if (!id) continue
    const list = groups.get(id) || []
    list.push(email)
    groups.set(id, list)
  }
  return [...groups.values()]
    .map((messages) => {
      const sorted = [...messages].sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)))
      const latest = sorted[sorted.length - 1]
      return {
        id: rootThreadId(latest),
        latest,
        messages: sorted,
        unread: sorted.some((m) => m.direction === 'in' && !m.read_at)
      }
    })
    .sort((a, b) => String(b.latest.sent_at).localeCompare(String(a.latest.sent_at)))
}

export function replySubject(subject) {
  const s = String(subject || '').trim()
  if (!s) return 'Re:'
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`
}

export function replyAddress(email) {
  if (!email) return ''
  if (email.direction === 'in') return email.from_email || ''
  return (email.to_emails && email.to_emails[0]) || ''
}

export function fillFromMailTemplate(template, { isReply = false, currentSubject = '', quoted = '' } = {}) {
  if (!template) return { subject: currentSubject, body: quoted }
  return {
    subject: (isReply && currentSubject) ? currentSubject : (template.subject || ''),
    body: (template.body || '') + quoted
  }
}

export function textToHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

export function recentDuplicateOutbound(emails, { to, subject, text }, withinMs = 20000, now = Date.now()) {
  const dest = parseAddress(to).email
  const sub = String(subject || '').trim()
  const body = String(text || '')
  if (!dest) return null
  const cutoff = now - withinMs
  return (emails || []).find((m) => {
    if (m?.direction !== 'out') return false
    const sent = Date.parse(m.sent_at || m.created_at || 0)
    if (!Number.isFinite(sent) || sent < cutoff) return false
    const recipients = asEmailList(m.to_emails)
    return recipients.includes(dest)
      && String(m.subject || '').trim() === sub
      && String(m.text_body || '') === body
  }) || null
}

export function inboundRow({ parsed, content, match, threadId, resendId }) {
  const from = parseAddress(content?.from || parsed?.from)
  return {
    customer_id: match.customer_id,
    contact_id: match.contact_id,
    direction: 'in',
    from_email: from.email || 'unknown@unknown',
    from_name: from.name || null,
    to_emails: asEmailList(content?.to || parsed?.to),
    cc_emails: asEmailList(content?.cc || parsed?.cc),
    subject: content?.subject || parsed?.subject || null,
    text_body: content?.text || null,
    html_body: content?.html || null,
    resend_id: resendId || parsed?.email_id || content?.id || null,
    message_id: content?.message_id || parsed?.message_id || headerLookup(content?.headers, 'message-id') || null,
    in_reply_to: headerLookup(content?.headers, 'in-reply-to') || null,
    thread_id: threadId || null,
    read_at: null,
    sent_at: content?.created_at || parsed?.created_at || new Date().toISOString()
  }
}
