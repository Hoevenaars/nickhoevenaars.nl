import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/admin/js/config.js'

export {
  parseAmount,
  formatMoney,
  accountBalance,
  accountTypeLabel,
  formatDay,
  isoDate,
  periodRange,
  formatPeriod,
  periodTitle,
  periodTotals,
  netWorth,
  fixedCosts,
  topExpenses,
  displayName,
  goalsLabel
} from './money.js'

const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>',
  budget: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h4"/></svg>',
  inzicht: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9M10 19V5M16 19v-7M20 19H3"/></svg>',
  sparen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 8c0-2.2-3.1-4-7-4S5 5.8 5 8c0 1.3.9 2.5 2.3 3.2C5.9 12 5 13.4 5 15c0 2.2 3.1 4 7 4s7-1.8 7-4c0-1.6-.9-3-2.3-3.8C18.1 10.5 19 9.3 19 8z"/><path d="M12 4v16"/></svg>',
  meer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/></svg>'
}

const NAV = [
  { id: 'home', href: '/finance/', label: 'Home', icon: ICON.home },
  { id: 'budget', href: '/finance/budget', label: 'Budget', icon: ICON.budget },
  { id: 'inzicht', href: '/finance/transactions', label: 'In & uit', icon: ICON.inzicht },
  { id: 'sparen', href: '/finance/goals', label: 'Sparen', icon: ICON.sparen },
  { id: 'meer', href: '/finance/more', label: 'Meer', icon: ICON.meer }
]

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

export function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]))
}

export function mountNav (active) {
  const html = `<nav class="nav" aria-label="Hoofdmenu"><div class="inner">${
    NAV.map((item) => `<a href="${item.href}" class="${item.id === active ? 'active' : ''}">${item.icon}<span>${item.label}</span></a>`).join('')
  }</div></nav>`
  document.body.insertAdjacentHTML('beforeend', html)
}
