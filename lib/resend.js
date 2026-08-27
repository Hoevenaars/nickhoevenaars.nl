const RESEND_API = 'https://api.resend.com'

function apiKey() {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    const err = new Error('RESEND_API_KEY ontbreekt in Vercel.')
    err.status = 502
    throw err
  }
  return key
}

export function fromAddress() {
  return process.env.EMAIL_FROM || 'Nick Hoevenaars <nick@nickhoevenaars.nl>'
}

export async function sendResendEmail({ to, subject, text, html, inReplyTo, references }) {
  const payload = {
    from: fromAddress(),
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html: html || text
  }
  const headers = {}
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo
  if (references) headers.References = references
  if (Object.keys(headers).length) payload.headers = headers

  const res = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.message || 'E-mail versturen via Resend mislukt.')
    err.status = 502
    throw err
  }
  return body
}

export async function getReceivedEmail(emailId) {
  const res = await fetch(`${RESEND_API}/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey()}` }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.message || 'Binnenkomende mail ophalen mislukt.')
    err.status = 502
    throw err
  }
  return body
}
