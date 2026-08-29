export const FUNNEL_PHASES = ['nieuw', 'contact', 'kennismaking', 'voorstel', 'follow-up', 'akkoord', 'verloren']

const QUOTE_TO_PHASE = {
  concept: 'voorstel',
  verstuurd: 'follow-up',
  geaccepteerd: 'akkoord',
  afgewezen: 'verloren'
}

const PHASE_TO_QUOTE = {
  nieuw: 'concept',
  contact: 'concept',
  kennismaking: 'concept',
  voorstel: 'concept',
  'follow-up': 'verstuurd',
  akkoord: 'geaccepteerd',
  verloren: 'afgewezen',
  onhold: 'afgewezen'
}

export function isOpenQuote(status) {
  return status === 'concept' || status === 'verstuurd'
}

export function quoteFunnelPhase(status) {
  return QUOTE_TO_PHASE[status] || 'voorstel'
}

export function phaseToQuoteStatus(phase) {
  const key = phase === 'onhold' ? 'verloren' : phase
  return PHASE_TO_QUOTE[key] || 'concept'
}

export function shiftQuoteStatus(status, dir) {
  const phase = quoteFunnelPhase(status)
  const i = FUNNEL_PHASES.indexOf(phase)
  const next = FUNNEL_PHASES[i + Number(dir)]
  if (!next) return status
  return phaseToQuoteStatus(next)
}

export function openQuotesOf(quotes) {
  return (quotes || []).filter((q) => isOpenQuote(q.status))
}

export function quoteNextAction(q) {
  if (!q || !isOpenQuote(q.status)) return null
  return {
    label: q.status === 'verstuurd' ? 'Offerte verstuurd' : 'Offerte in concept',
    at: q.valid_until || q.issued_at || null,
    kind: 'quote'
  }
}

export function funnelRows(customers = []) {
  const opps = customers.flatMap((c) => (c.opps || []).map((o) => ({
    kind: 'opp',
    id: o.id,
    cid: c.id,
    company: c.company_name,
    title: o.title,
    phase: o.phase === 'onhold' ? 'verloren' : o.phase,
    amount: o.potential_value,
    next_action: o.next_action,
    next_action_at: o.next_action_at
  })))
  const quotes = customers.flatMap((c) => (c.quotes || []).map((q) => {
    const next = quoteNextAction(q)
    return {
      kind: 'quote',
      id: q.id,
      cid: c.id,
      company: c.company_name,
      title: q.title,
      phase: quoteFunnelPhase(q.status),
      amount: q.amount,
      next_action: next?.label || null,
      next_action_at: next?.at || q.valid_until || q.issued_at,
      quote_status: q.status
    }
  }))
  return [...opps, ...quotes].sort((a, b) => {
    const phase = FUNNEL_PHASES.indexOf(a.phase) - FUNNEL_PHASES.indexOf(b.phase)
    if (phase) return phase
    return String(a.company || '').localeCompare(String(b.company || ''), 'nl')
  })
}

export function pipelineTotal(customers = []) {
  const fromOpps = customers.flatMap((c) => c.openOpps || []).reduce((s, o) => s + Number(o.potential_value || 0), 0)
  const fromQuotes = customers.flatMap((c) => openQuotesOf(c.quotes)).reduce((s, q) => s + Number(q.amount || 0), 0)
  return fromOpps + fromQuotes
}
