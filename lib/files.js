export const PDF_BUCKET = 'nh-pdfs'
export const MAX_PDF_BYTES = 10 * 1024 * 1024
export const MAX_PDF_ATTACHMENTS = 5

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const QUOTE_PDF_PATH_RE = /^quotes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i
const MAIL_PDF_PATH_RE = /^mail\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i

export function safePdfName(name) {
  const base = String(name || '')
    .split(/[/\\]/)
    .pop()
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  const cleaned = base || 'offerte.pdf'
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`
}

export function isPdfFile(file) {
  if (!file || typeof file !== 'object') return false
  const name = String(file.name || '').toLowerCase()
  const type = String(file.type || '').toLowerCase()
  if (name && !name.endsWith('.pdf')) return false
  if (type && type !== 'application/pdf' && type !== 'application/x-pdf' && type !== 'application/octet-stream') return false
  return name.endsWith('.pdf') || type === 'application/pdf' || type === 'application/x-pdf'
}

export function assertPdfSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    const err = new Error('Leeg PDF-bestand.')
    err.status = 400
    throw err
  }
  if (bytes > MAX_PDF_BYTES) {
    const err = new Error('PDF is te groot (max 10 MB).')
    err.status = 400
    throw err
  }
}

function requireUuid(value, label = 'id') {
  const id = String(value || '')
  if (!UUID_RE.test(id)) {
    const err = new Error(`Ongeldige ${label}.`)
    err.status = 400
    throw err
  }
  return id.toLowerCase()
}

export function quotePdfPath(quoteId, fileId) {
  return `quotes/${requireUuid(quoteId, 'offerte')}/${requireUuid(fileId, 'bijlage')}.pdf`
}

export function mailPdfPath(fileId) {
  return `mail/${requireUuid(fileId, 'bijlage')}.pdf`
}

export function isOwnedPdfPath(path) {
  const p = String(path || '')
  return QUOTE_PDF_PATH_RE.test(p) || MAIL_PDF_PATH_RE.test(p)
}

export function normalizeMailAttachments(list) {
  const rows = Array.isArray(list) ? list : []
  if (rows.length > MAX_PDF_ATTACHMENTS) {
    const err = new Error(`Maximaal ${MAX_PDF_ATTACHMENTS} PDF-bijlagen.`)
    err.status = 400
    throw err
  }
  const seen = new Set()
  const out = []
  for (const item of rows) {
    const path = String(item?.path || '')
    if (!isOwnedPdfPath(path)) {
      const err = new Error('Ongeldige bijlage.')
      err.status = 400
      throw err
    }
    const key = path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      path,
      filename: safePdfName(item.filename || 'bijlage.pdf'),
      quote_id: item.quote_id || null
    })
  }
  return out
}

export function collectMailAttachments({ quotes = [], quoteIds = [], extra = [] } = {}) {
  const selected = new Set((quoteIds || []).map(String).filter(Boolean))
  const fromQuotes = (quotes || [])
    .filter((q) => selected.has(String(q.id)) && q.pdf_path)
    .map((q) => ({
      path: q.pdf_path,
      filename: q.pdf_name || 'offerte.pdf',
      quote_id: q.id
    }))
  return normalizeMailAttachments([...fromQuotes, ...(extra || [])])
}

export function toResendAttachments(files) {
  return (files || []).map((f) => ({
    filename: f.filename,
    content: f.content,
    content_type: 'application/pdf'
  }))
}

export function storedAttachmentMeta(files) {
  return (files || []).map((f) => ({
    filename: f.filename,
    path: f.path,
    quote_id: f.quote_id || null
  }))
}

export function attachmentNamesKey(attachments) {
  return (attachments || []).map((a) => String(a?.filename || '')).join('|')
}
