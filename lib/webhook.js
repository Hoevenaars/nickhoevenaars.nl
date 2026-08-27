import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifySvixSignature(rawBody, headers, secret) {
  if (!secret) throw new Error('RESEND_WEBHOOK_SECRET ontbreekt.')
  const id = headers['svix-id'] || headers['Svix-Id'] || ''
  const timestamp = headers['svix-timestamp'] || headers['Svix-Timestamp'] || ''
  const signatureHeader = headers['svix-signature'] || headers['Svix-Signature'] || ''
  if (!id || !timestamp || !signatureHeader) {
    const err = new Error('Webhook-handtekening ontbreekt.')
    err.status = 400
    throw err
  }
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64')
  const given = String(signatureHeader)
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice(3))
  const ok = given.some((sig) => {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  })
  if (!ok) {
    const err = new Error('Ongeldige webhook-handtekening.')
    err.status = 401
    throw err
  }
  return true
}
