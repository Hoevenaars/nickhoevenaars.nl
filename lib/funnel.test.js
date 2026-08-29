import test from 'node:test'
import assert from 'node:assert/strict'
import {
  quoteFunnelPhase,
  phaseToQuoteStatus,
  shiftQuoteStatus,
  isOpenQuote,
  openQuotesOf,
  funnelRows,
  pipelineTotal,
  quoteNextAction
} from './funnel.js'

test('quote status maps onto funnel phases', () => {
  assert.equal(quoteFunnelPhase('concept'), 'voorstel')
  assert.equal(quoteFunnelPhase('verstuurd'), 'follow-up')
  assert.equal(quoteFunnelPhase('geaccepteerd'), 'akkoord')
  assert.equal(quoteFunnelPhase('afgewezen'), 'verloren')
})

test('funnel phase maps back onto quote status', () => {
  assert.equal(phaseToQuoteStatus('voorstel'), 'concept')
  assert.equal(phaseToQuoteStatus('follow-up'), 'verstuurd')
  assert.equal(phaseToQuoteStatus('akkoord'), 'geaccepteerd')
  assert.equal(phaseToQuoteStatus('verloren'), 'afgewezen')
  assert.equal(phaseToQuoteStatus('kennismaking'), 'concept')
})

test('shifting a sent quote in the funnel accepts or returns it', () => {
  assert.equal(shiftQuoteStatus('verstuurd', 1), 'geaccepteerd')
  assert.equal(shiftQuoteStatus('verstuurd', -1), 'concept')
  assert.equal(shiftQuoteStatus('concept', 1), 'verstuurd')
  assert.equal(shiftQuoteStatus('geaccepteerd', 1), 'afgewezen')
  assert.equal(shiftQuoteStatus('afgewezen', 1), 'afgewezen')
})

test('funnelRows includes quotes without a kans', () => {
  const rows = funnelRows([
    {
      id: 'c1',
      company_name: 'Centrum Feng Huang',
      opps: [],
      quotes: [{ id: 'q1', title: 'Website redisign', amount: 1450, status: 'verstuurd', issued_at: '2026-08-20' }]
    },
    {
      id: 'c2',
      company_name: 'Ander',
      opps: [{ id: 'o1', title: 'Upsell', phase: 'contact', potential_value: 200, next_action: 'Bellen' }],
      quotes: []
    }
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].kind, 'opp')
  assert.equal(rows[0].company, 'Ander')
  assert.equal(rows[1].kind, 'quote')
  assert.equal(rows[1].company, 'Centrum Feng Huang')
  assert.equal(rows[1].phase, 'follow-up')
  assert.equal(rows[1].amount, 1450)
  assert.equal(rows[1].next_action, 'Offerte verstuurd')
})

test('quoteNextAction only for open quotes', () => {
  assert.equal(quoteNextAction({ status: 'geaccepteerd' }), null)
  assert.equal(quoteNextAction({ status: 'verstuurd', issued_at: '2026-08-20' }).label, 'Offerte verstuurd')
  assert.equal(quoteNextAction({ status: 'concept' }).label, 'Offerte in concept')
})

test('pipelineTotal adds open quotes to open kansen', () => {
  const customers = [{
    openOpps: [{ potential_value: 100 }],
    quotes: [
      { status: 'verstuurd', amount: 1450 },
      { status: 'geaccepteerd', amount: 900 }
    ]
  }]
  assert.equal(pipelineTotal(customers), 1550)
  assert.deepEqual(openQuotesOf(customers[0].quotes).map((q) => q.amount), [1450])
  assert.equal(isOpenQuote('afgewezen'), false)
})
