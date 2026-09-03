import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/admin/js/config.js'

export {
  parseAmount,
  formatMoney,
  accountBalance,
  accountTypeLabel,
  formatDay
} from './money.js'

export function createSb () {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

export async function requireUser (sb) {
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) {
    window.location.replace('/finance/login')
    throw new Error('not authenticated')
  }
  return session.user
}

export function showMsg (el, text, kind) {
  el.hidden = !text
  el.className = kind === 'ok' ? 'ok' : 'err'
  el.textContent = text || ''
}
