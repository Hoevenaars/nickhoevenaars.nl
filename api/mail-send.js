import { json, bearerToken } from '../lib/http.js'
import { userClient } from '../lib/supabase.js'
import { sendResendEmail, fromAddress } from '../lib/resend.js'
import { parseAddress, replySubject, textToHtml, rootThreadId, recentDuplicateOutbound, appendMailFooter } from '../lib/mail.js'
import {
  PDF_BUCKET,
  MAX_PDF_BYTES,
  normalizeMailAttachments,
  toResendAttachments,
  storedAttachmentMeta
} from '../lib/files.js'

async function requireAdmin(req) {
  const token = bearerToken(req)
  if (!token) {
    const err = new Error('Niet ingelogd.')
    err.status = 401
    throw err
  }
  const sb = userClient(token)
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) {
    const err = new Error('Niet ingelogd.')
    err.status = 401
    throw err
  }
  const { data, error: adminErr } = await sb.from('nh_admins').select('user_id').limit(1)
  if (adminErr || !data?.length) {
    const err = new Error('Dit account heeft geen toegang tot de admin.')
    err.status = 403
    throw err
  }
  return { sb, user }
}

async function fileToBuffer(data) {
  if (!data) return null
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  if (typeof data.arrayBuffer === 'function') return Buffer.from(await data.arrayBuffer())
  return null
}

async function loadPdfAttachments(sb, list) {
  const wanted = normalizeMailAttachments(list)
  const files = []
  for (const item of wanted) {
    const { data, error } = await sb.storage.from(PDF_BUCKET).download(item.path)
    const buf = error ? null : await fileToBuffer(data)
    if (!buf) {
      const err = new Error(`PDF '${item.filename}' kon niet worden geladen.`)
      err.status = 400
      throw err
    }
    if (buf.length > MAX_PDF_BYTES) {
      const err = new Error('PDF is te groot (max 10 MB).')
      err.status = 400
      throw err
    }
    files.push({
      ...item,
      content: buf.toString('base64')
    })
  }
  return files
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Methode niet toegestaan.' })
  }
  try {
    const { sb } = await requireAdmin(req)
    const { to, subject, text, customer_id, contact_id, reply_to_id, attachments } = req.body || {}
    const dest = parseAddress(to).email
    if (!dest || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
      return json(res, 400, { ok: false, error: 'Vul een geldig e-mailadres in.' })
    }
    const body = appendMailFooter(text)
    if (!String(subject || '').trim() || !String(body || '').trim()) {
      return json(res, 400, { ok: false, error: 'Onderwerp en bericht zijn verplicht.' })
    }
    const wanted = normalizeMailAttachments(attachments)

    const { data: recentOut } = await sb
      .from('nh_emails')
      .select('*')
      .eq('direction', 'out')
      .gte('sent_at', new Date(Date.now() - 20000).toISOString())
      .order('sent_at', { ascending: false })
      .limit(20)
    const duplicate = recentDuplicateOutbound(recentOut, { to: dest, subject, text: body, attachments: wanted })
    if (duplicate) {
      return json(res, 200, { ok: true, email: duplicate })
    }

    let parent = null
    if (reply_to_id) {
      const { data, error } = await sb.from('nh_emails').select('*').eq('id', reply_to_id).maybeSingle()
      if (error) throw error
      parent = data
    }

    const files = wanted.length ? await loadPdfAttachments(sb, wanted) : []
    const sent = await sendResendEmail({
      to: dest,
      subject: parent ? replySubject(subject || parent.subject) : subject,
      text: body,
      html: textToHtml(body),
      inReplyTo: parent?.message_id || undefined,
      references: parent?.message_id || undefined,
      attachments: files.length ? toResendAttachments(files) : undefined
    })

    const from = parseAddress(fromAddress())
    const row = {
      customer_id: customer_id || parent?.customer_id || null,
      contact_id: contact_id || parent?.contact_id || null,
      direction: 'out',
      from_email: from.email || 'contact@nickhoevenaars.nl',
      from_name: from.name || 'Nick Hoevenaars',
      to_emails: [dest],
      cc_emails: [],
      subject: parent ? replySubject(subject || parent.subject) : subject,
      text_body: body,
      html_body: textToHtml(body),
      resend_id: sent?.id || null,
      message_id: sent?.id ? `<${sent.id}@resend.dev>` : null,
      in_reply_to: parent?.message_id || null,
      thread_id: parent ? rootThreadId(parent) : null,
      attachments: storedAttachmentMeta(files),
      read_at: new Date().toISOString(),
      sent_at: new Date().toISOString()
    }

    const { data: saved, error: saveErr } = await sb.from('nh_emails').insert(row).select().single()
    if (saveErr) throw saveErr

    if (saved.customer_id) {
      await sb.from('nh_contact_logs').insert({
        customer_id: saved.customer_id,
        contact_id: saved.contact_id,
        type: 'email',
        summary: `Mail verstuurd: ${saved.subject || '(geen onderwerp)'}`,
        occurred_at: saved.sent_at
      })
    }

    return json(res, 200, { ok: true, email: saved })
  } catch (err) {
    console.error(err)
    return json(res, err.status || 500, { ok: false, error: err.message || 'Versturen mislukt.' })
  }
}
