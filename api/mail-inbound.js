import { json, headerValue, readRawBody } from '../lib/http.js'
import { serviceClient } from '../lib/supabase.js'
import { getReceivedEmail } from '../lib/resend.js'
import { verifySvixSignature } from '../lib/webhook.js'
import { headerLookup, inboundRow, matchParty, resolveThreadId } from '../lib/mail.js'

export const config = {
  api: { bodyParser: false }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Methode niet toegestaan.' })
  }
  try {
    const raw = await readRawBody(req)
    verifySvixSignature(raw, {
      'svix-id': headerValue(req, 'svix-id'),
      'svix-timestamp': headerValue(req, 'svix-timestamp'),
      'svix-signature': headerValue(req, 'svix-signature')
    }, process.env.RESEND_WEBHOOK_SECRET)

    const event = JSON.parse(raw || '{}')
    if (event.type && event.type !== 'email.received') {
      return json(res, 200, { ok: true, ignored: event.type })
    }

    const parsed = event.data || {}
    const emailId = parsed.email_id
    if (!emailId) return json(res, 200, { ok: true, ignored: 'no_email_id' })

    const sb = serviceClient()
    const { data: existing } = await sb.from('nh_emails').select('id').eq('resend_id', emailId).maybeSingle()
    if (existing) return json(res, 200, { ok: true, duplicate: true })

    const content = await getReceivedEmail(emailId)
    const inReplyTo = headerLookup(content?.headers, 'in-reply-to')
    const messageId = content?.message_id || parsed.message_id || headerLookup(content?.headers, 'message-id')

    const [{ data: contacts }, { data: customers }, { data: recent }] = await Promise.all([
      sb.from('nh_contacts').select('id, customer_id, email'),
      sb.from('nh_customers').select('id, billing_email'),
      sb.from('nh_emails').select('id, thread_id, message_id, customer_id, contact_id').not('message_id', 'is', null).limit(400)
    ])

    const fromEmail = content?.from || parsed.from || ''
    let match = matchParty(fromEmail, contacts || [], customers || [])
    const threadId = resolveThreadId(recent || [], { inReplyTo, messageId })
    if (threadId && (!match.customer_id || !match.contact_id)) {
      const parent = (recent || []).find((e) => e.id === threadId || e.thread_id === threadId)
      if (parent) {
        match = {
          customer_id: match.customer_id || parent.customer_id,
          contact_id: match.contact_id || parent.contact_id
        }
      }
    }

    const row = inboundRow({ parsed, content, match, threadId, resendId: emailId })
    const { data: saved, error } = await sb.from('nh_emails').insert(row).select().single()
    if (error) {
      if (String(error.message || '').includes('duplicate') || error.code === '23505') {
        return json(res, 200, { ok: true, duplicate: true })
      }
      throw error
    }

    if (saved.customer_id) {
      await sb.from('nh_contact_logs').insert({
        customer_id: saved.customer_id,
        contact_id: saved.contact_id,
        type: 'email',
        summary: `Mail ontvangen: ${saved.subject || '(geen onderwerp)'}`,
        occurred_at: saved.sent_at
      })
    }

    return json(res, 200, { ok: true, id: saved.id })
  } catch (err) {
    console.error(err)
    return json(res, err.status || 500, { ok: false, error: err.message || 'Webhook mislukt.' })
  }
}
