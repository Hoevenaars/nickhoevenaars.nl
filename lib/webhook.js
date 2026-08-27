function header(headers, name) {
  const aliases = {
    'svix-id': ['svix-id', 'Svix-Id'],
    'svix-timestamp': ['svix-timestamp', 'Svix-Timestamp'],
    'svix-signature': ['svix-signature', 'Svix-Signature']
  }
  for (const key of aliases[name] || [name]) {
    if (typeof headers?.get === 'function') {
      const v = headers.get(key)
      if (v) return v
    } else if (headers?.[key]) return headers[key]
  }
  return ''
}

function b64FromBytes(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

export async function verifySvixSignature(rawBody, headers, secret) {
  if (!secret) throw new Error('RESEND_WEBHOOK_SECRET ontbreekt.')
  const id = header(headers, 'svix-id')
  const timestamp = header(headers, 'svix-timestamp')
  const signatureHeader = header(headers, 'svix-signature')
  if (!id || !timestamp || !signatureHeader) {
    const err = new Error('Webhook-handtekening ontbreekt.')
    err.status = 400
    throw err
  }
  const keyBytes = Uint8Array.from(atob(String(secret).replace(/^whsec_/, '')), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)
  )
  const expected = b64FromBytes(new Uint8Array(mac))
  const given = String(signatureHeader)
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice(3))
  const ok = given.some((sig) => timingSafeEqual(sig, expected))
  if (!ok) {
    const err = new Error('Ongeldige webhook-handtekening.')
    err.status = 401
    throw err
  }
  return true
}
