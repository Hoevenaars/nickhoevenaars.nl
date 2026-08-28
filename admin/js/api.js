import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'
import {
  TIME_TYPES, timeTypeLabel, mapTimeTypeToLogType,
  elapsedSeconds, formatElapsed, formatDurationNl,
  parseLocalDateTime, toLocalInput, durationParts, addDuration, resolveTimeRange
} from '../../lib/time.js'

export {
  TIME_TYPES, timeTypeLabel, mapTimeTypeToLogType,
  elapsedSeconds, formatElapsed, formatDurationNl,
  parseLocalDateTime, toLocalInput, durationParts, addDuration, resolveTimeRange
}

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
})

export const PHASES = [
  { id: 'nieuw', label: 'Nieuw' },
  { id: 'contact', label: 'Contact' },
  { id: 'kennismaking', label: 'Kennismaking' },
  { id: 'voorstel', label: 'Voorstel' },
  { id: 'follow-up', label: 'Follow-up' },
  { id: 'akkoord', label: 'Akkoord' },
  { id: 'verloren', label: 'Verloren / on hold' }
]

export const PHASE_VALUES = PHASES.map((p) => p.id)

export const CONTACT_TYPES = [
  { id: 'telefoon', label: 'Telefoon' },
  { id: 'email', label: 'E-mail' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'bezoek', label: 'Bezoek' },
  { id: 'overig', label: 'Overig' }
]

export const CUSTOMER_STATUSES = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'actief', label: 'Actief' },
  { id: 'inactief', label: 'Inactief' },
  { id: 'verloren', label: 'Verloren' }
]

export const QUOTE_STATUSES = [
  { id: 'concept', label: 'Concept' },
  { id: 'verstuurd', label: 'Verstuurd' },
  { id: 'geaccepteerd', label: 'Geaccepteerd' },
  { id: 'afgewezen', label: 'Afgewezen' }
]

export const REVENUE_KINDS = [
  { id: 'eenmalig', label: 'Eenmalig' },
  { id: 'maandelijks', label: 'Maandelijks' },
  { id: 'offerte', label: 'Uit offerte' },
  { id: 'overig', label: 'Overig' }
]

export const COST_CATEGORIES = [
  { id: 'software', label: 'Software' },
  { id: 'hosting', label: 'Hosting' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'inkoop', label: 'Inkoop' },
  { id: 'reis', label: 'Reis / onkosten' },
  { id: 'overig', label: 'Overig' }
]

export const COST_CADENCES = [
  { id: 'eenmalig', label: 'Eenmalig' },
  { id: 'maandelijks', label: 'Maandelijks' }
]

export function cadenceLabel(id) {
  return COST_CADENCES.find((c) => c.id === id)?.label || 'Eenmalig'
}

export function phaseLabel(id) {
  if (id === 'onhold') return 'On hold'
  return PHASES.find((p) => p.id === id)?.label || id || '—'
}

export function typeLabel(id) {
  return CONTACT_TYPES.find((t) => t.id === id)?.label || timeTypeLabel(id) || id || '—'
}

export function statusLabel(id) {
  return CUSTOMER_STATUSES.find((s) => s.id === id)?.label || id || '—'
}

export function shiftPhase(phase, dir) {
  const i = PHASE_VALUES.indexOf(phase === 'onhold' ? 'verloren' : phase)
  const next = PHASE_VALUES[i + dir]
  return next || phase
}

const CUSTOMER_EMBED = `
  *,
  nh_contacts (*),
  nh_contact_logs (*),
  nh_todos (*),
  nh_opportunities (*),
  nh_ideas (*),
  nh_notes (*),
  nh_reminders (*),
  nh_quotes (*),
  nh_revenues (*)
`

export async function requireAdmin() {
  const { data: { session } } = await sb.auth.getSession()
  if (!session) return { session: null, admin: false }
  const { data, error } = await sb.from('nh_admins').select('email,user_id').limit(1)
  if (error || !data?.length) return { session, admin: false }
  return { session, admin: true }
}

export async function loadCustomers() {
  const { data, error } = await sb
    .from('nh_customers')
    .select(CUSTOMER_EMBED)
    .order('company_name')
  if (error) throw error
  return (data || []).map(normalizeCustomer)
}

export async function loadCustomer(id) {
  const { data, error } = await sb
    .from('nh_customers')
    .select(CUSTOMER_EMBED)
    .eq('id', id)
    .single()
  if (error) throw error
  return normalizeCustomer(data)
}

function normalizeCustomer(c) {
  const logs = (c.nh_contact_logs || []).sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
  const contacts = (c.nh_contacts || []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name, 'nl'))
  const todos = (c.nh_todos || []).sort((a, b) => (a.due_at || '9999').localeCompare(b.due_at || '9999'))
  const opps = (c.nh_opportunities || []).sort((a, b) => (a.next_action_at || '9999').localeCompare(b.next_action_at || '9999'))
  const ideas = (c.nh_ideas || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const notes = (c.nh_notes || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const reminders = (c.nh_reminders || []).sort((a, b) => a.remind_at.localeCompare(b.remind_at))
  const quotes = (c.nh_quotes || []).sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || ''))
  const revenues = (c.nh_revenues || []).sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''))
  const lastLog = logs[0] || null
  const openTodos = todos.filter((t) => t.status === 'open')
  const openOpps = opps.filter((o) => o.phase !== 'akkoord' && o.phase !== 'verloren' && o.phase !== 'onhold')
  const nextAction = nextActionFor(c, { logs, openTodos, openOpps, reminders })
  return {
    ...c,
    contacts,
    logs,
    todos,
    opps,
    ideas,
    notes,
    reminders,
    quotes,
    revenues,
    lastLog,
    lastContactAt: lastLog?.occurred_at || null,
    openTodos,
    openOpps,
    nextAction,
    revenueTotal: revenues.reduce((s, r) => s + Number(r.amount || 0), 0)
  }
}

export async function loadCosts() {
  const { data, error } = await sb
    .from('nh_costs')
    .select('*, nh_cost_allocations (*)')
    .order('incurred_at', { ascending: false })
  if (error) throw error
  return (data || []).map((cost) => {
    const allocations = cost.nh_cost_allocations || []
    const allocated = allocations.reduce((s, a) => s + Number(a.amount || 0), 0)
    const total = Number(cost.amount || 0)
    return {
      ...cost,
      allocations,
      allocated,
      unlinked: Math.max(0, total - allocated)
    }
  })
}

export async function loadLooseRevenues() {
  const { data, error } = await sb
    .from('nh_revenues')
    .select('*')
    .is('customer_id', null)
    .order('received_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadLooseTodos() {
  const { data, error } = await sb
    .from('nh_todos')
    .select('*')
    .is('customer_id', null)
    .order('due_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function loadMailTemplates() {
  const { data, error } = await sb
    .from('nh_mail_templates')
    .select('*')
    .order('name')
  if (error) {
    console.warn('nh_mail_templates:', error.message)
    return []
  }
  return data || []
}

export async function loadEmails() {
  const { data, error } = await sb
    .from('nh_emails')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(400)
  if (error) {
    console.warn('nh_emails:', error.message)
    return []
  }
  return data || []
}

export async function loadTimeEntries() {
  const { data, error } = await sb
    .from('nh_time_entries')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(80)
  if (error) {
    console.warn('nh_time_entries:', error.message)
    return []
  }
  return data || []
}

export async function sendMailApi(payload) {
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.access_token) throw new Error('Niet ingelogd.')
  const res = await fetch('/api/mail-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token
    },
    body: JSON.stringify(payload)
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 404) throw new Error('Mail versturen werkt zodra nickhoevenaars.nl op Vercel staat.')
  if (!res.ok || !json.ok) throw new Error(json.error || 'Versturen mislukt.')
  return json.email
}

export async function replaceAllocations(costId, rows) {
  const { error: delErr } = await sb.from('nh_cost_allocations').delete().eq('cost_id', costId)
  if (delErr) throw delErr
  const clean = rows.filter((r) => r.customer_id && Number(r.amount) > 0)
    .map((r) => ({ cost_id: costId, customer_id: r.customer_id, amount: Number(r.amount) }))
  if (!clean.length) return []
  const { data, error } = await sb.from('nh_cost_allocations').insert(clean).select()
  if (error) throw error
  return data
}

function nextActionFor(c, { logs, openTodos, openOpps, reminders }) {
  const bits = []
  const soonestTodo = openTodos.find((t) => t.due_at) || openTodos[0]
  const soonestOpp = openOpps.find((o) => o.next_action)
  const soonestRem = reminders.find((r) => !r.done)
  if (soonestTodo) bits.push({ label: soonestTodo.title, at: soonestTodo.due_at, kind: 'todo' })
  if (soonestOpp) bits.push({ label: soonestOpp.next_action, at: soonestOpp.next_action_at, kind: 'sales' })
  if (soonestRem) bits.push({ label: soonestRem.title, at: soonestRem.remind_at, kind: 'reminder' })
  const follow = logs[0]?.follow_up
  if (follow) bits.push({ label: follow, at: null, kind: 'follow' })
  bits.sort((a, b) => (a.at || '9999').localeCompare(b.at || '9999'))
  return bits[0] || null
}

export async function upsert(table, payload, id) {
  if (id) {
    const { data, error } = await sb.from(table).update(payload).eq('id', id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await sb.from(table).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function remove(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id)
  if (error) throw error
}

export async function setPhase(id, phase) {
  const { error } = await sb.from('nh_opportunities').update({ phase }).eq('id', id)
  if (error) throw error
}

export function daysSince(iso) {
  if (!iso) return Infinity
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export function isoDate(d = new Date()) {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return isoDate(d)
}
