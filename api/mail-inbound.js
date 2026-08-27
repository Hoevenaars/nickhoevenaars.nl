import { serviceClient } from '../lib/supabase.js'
import { getReceivedEmail } from '../lib/resend.js'
import { verifySvixSignature } from '../lib/webhook.js'
import { headerLookup, inboundRow, matchParty, resolveThreadId } from '../lib/mail.js'

export const config = { runtime: 'edge' }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Methode niet toegestaan.' }, 405)
  }
  try {
    const raw = await request.text()
    await verifySvixSignature(raw, request.headers, process.env.RESEND_WEBHOOK_SECRET)

    const event = JSON.parse(raw || '{}')
    if (event.type && event.type !== 'email.received') {
      return json({ ok: true, ignored: event.type })
    }

    const parsed = event.data || {}
    const emailId = parsed.email_id
    if (!emailId) return json({ ok: true, ignored: 'no_email_id' })

    const sb = serviceClient()
    const { data: existing } = await sb.from('nh_emails').select('id').eq('resend_id', emailId).maybeSingle()
    if (existing) return json({ ok: true, duplicate: true })

    let content = {}
    try {
      content = await getReceivedEmail(emailId)
    } catch (err) {
      console.error('Resend receiving get failed:', err)
      content = {
        from: parsed.from,
        to: parsed.to,
        subject: parsed.subject,
        text: null,
        html: null,
        message_id: parsed.message_id,
        created_at: parsed.created_at,
        headers: {}
      }
    }

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
        return json({ ok: true, duplicate: true })
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

    return json({ ok: true, id: saved.id })
  } catch (err) {
    console.error(err)
    return json({ ok: false, error: err.message || 'Webhook mislukt.' }, err.status || 500)
  }
}
