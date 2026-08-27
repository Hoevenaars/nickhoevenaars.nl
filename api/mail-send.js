import { json, bearerToken } from '../lib/http.js'
import { userClient } from '../lib/supabase.js'
import { sendResendEmail, fromAddress } from '../lib/resend.js'
import { parseAddress, replySubject, textToHtml, rootThreadId } from '../lib/mail.js'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Methode niet toegestaan.' })
  }
  try {
    const { sb } = await requireAdmin(req)
    const { to, subject, text, customer_id, contact_id, reply_to_id } = req.body || {}
    const dest = parseAddress(to).email
    if (!dest || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
      return json(res, 400, { ok: false, error: 'Vul een geldig e-mailadres in.' })
    }
    if (!String(subject || '').trim() || !String(text || '').trim()) {
      return json(res, 400, { ok: false, error: 'Onderwerp en bericht zijn verplicht.' })
    }

    let parent = null
    if (reply_to_id) {
      const { data, error } = await sb.from('nh_emails').select('*').eq('id', reply_to_id).maybeSingle()
      if (error) throw error
      parent = data
    }

    const sent = await sendResendEmail({
      to: dest,
      subject: parent ? replySubject(subject || parent.subject) : subject,
      text,
      html: textToHtml(text),
      inReplyTo: parent?.message_id || undefined,
      references: parent?.message_id || undefined
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
      text_body: text,
      html_body: textToHtml(text),
      resend_id: sent?.id || null,
      message_id: sent?.id ? `<${sent.id}@resend.dev>` : null,
      in_reply_to: parent?.message_id || null,
      thread_id: parent ? rootThreadId(parent) : null,
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
