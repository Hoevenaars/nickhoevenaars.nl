import { json } from '../lib/http.js'
import { getAnonKey, getServiceKey } from '../lib/supabase.js'
import { fromAddress } from '../lib/resend.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'Methode niet toegestaan.' })
  }
  return json(res, 200, {
    ok: true,
    resendApiKey: Boolean(process.env.RESEND_API_KEY),
    resendWebhookSecret: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    supabaseAnon: Boolean(getAnonKey()),
    supabaseServiceRole: Boolean(getServiceKey()),
    emailFrom: fromAddress()
  })
}
