export function json(res, status, body) {
  res.status(status).json(body)
}

export function bearerToken(req) {
  const headers = req.headers || {}
  const auth = headers.authorization || headers.Authorization || ''
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null
  }
  return null
}

export function headerValue(req, name) {
  const headers = req.headers || {}
  const direct = headers[name] || headers[name.toLowerCase()]
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  if (found && typeof found[1] === 'string' && found[1].trim()) return found[1].trim()
  return ''
}

export function readRawBody(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body)
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'))
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
