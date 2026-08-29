import { createHmac } from 'node:crypto'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAddress,
  asEmailList,
  matchParty,
  resolveThreadId,
  inboxThreads,
  replySubject,
  replyAddress,
  fillFromMailTemplate,
  inboundRow,
  previewText,
  recentDuplicateOutbound,
  appendMailFooter,
  DEFAULT_MAIL_FOOTER,
  mailGreeting,
  stripLeadingGreeting,
  applyMailGreeting
} from './mail.js'
import { verifySvixSignature } from './webhook.js'

test('parseAddress reads name and email', () => {
  assert.deepEqual(parseAddress('Ada <ada@bedrijf.nl>'), { name: 'Ada', email: 'ada@bedrijf.nl' })
  assert.deepEqual(parseAddress('ADA@Bedrijf.nl'), { name: '', email: 'ada@bedrijf.nl' })
})

test('matchParty links contact then billing email', () => {
  const contacts = [{ id: 'c1', customer_id: 'k1', email: 'Ada@Bedrijf.nl' }]
  const customers = [{ id: 'k2', billing_email: 'factuur@ander.nl' }]
  assert.deepEqual(matchParty('Ada <ada@bedrijf.nl>', contacts, customers), { customer_id: 'k1', contact_id: 'c1' })
  assert.deepEqual(matchParty('factuur@ander.nl', contacts, customers), { customer_id: 'k2', contact_id: null })
  assert.deepEqual(matchParty('onbekend@x.nl', contacts, customers), { customer_id: null, contact_id: null })
})

test('resolveThreadId follows In-Reply-To to the root', () => {
  const emails = [
    { id: 'root', thread_id: null, message_id: '<a@x>' },
    { id: 'child', thread_id: 'root', message_id: '<b@x>' }
  ]
  assert.equal(resolveThreadId(emails, { inReplyTo: '<b@x>' }), 'root')
  assert.equal(resolveThreadId(emails, { inReplyTo: '<missing>' }), null)
})

test('inboxThreads groups and flags unread inbound', () => {
  const threads = inboxThreads([
    { id: 'a', thread_id: null, sent_at: '2026-01-01', direction: 'out', read_at: '2026-01-01', subject: 'Hallo' },
    { id: 'b', thread_id: 'a', sent_at: '2026-01-02', direction: 'in', read_at: null, subject: 'Re: Hallo' },
    { id: 'c', thread_id: null, sent_at: '2026-01-03', direction: 'in', read_at: '2026-01-03', subject: 'Los' }
  ])
  assert.equal(threads.length, 2)
  assert.equal(threads[0].id, 'c')
  assert.equal(threads[1].unread, true)
  assert.equal(threads[1].messages.length, 2)
})

test('reply helpers', () => {
  assert.equal(replySubject('Offerte'), 'Re: Offerte')
  assert.equal(replySubject('Re: Offerte'), 'Re: Offerte')
  assert.equal(replyAddress({ direction: 'in', from_email: 'ada@x.nl', to_emails: ['nick@y.nl'] }), 'ada@x.nl')
  assert.equal(replyAddress({ direction: 'out', from_email: 'nick@y.nl', to_emails: ['ada@x.nl'] }), 'ada@x.nl')
})

test('fillFromMailTemplate sets subject and body, keeps reply subject', () => {
  const t = { subject: 'Kennismaking', body: 'Hoi,\n\nBedankt voor je mail.' }
  assert.deepEqual(fillFromMailTemplate(t, { footer: '' }), { subject: 'Kennismaking', body: 'Hoi,\n\nBedankt voor je mail.' })
  assert.deepEqual(
    fillFromMailTemplate(t, { isReply: true, currentSubject: 'Re: Offerte', quoted: '\n\n> origineel', footer: '' }),
    { subject: 'Re: Offerte', body: 'Hoi,\n\nBedankt voor je mail.\n\n> origineel' }
  )
  assert.deepEqual(fillFromMailTemplate(null, { currentSubject: 'Blijft', quoted: 'x', footer: '' }), { subject: 'Blijft', body: 'x' })
  assert.deepEqual(
    fillFromMailTemplate(t, { greeting: 'Hi Ada,', footer: '' }),
    { subject: 'Kennismaking', body: 'Hi Ada,\n\nBedankt voor je mail.' }
  )
})

test('mailGreeting is informal Hi or formal Beste', () => {
  const person = { first_name: 'Ada', last_name: 'Jansen', gender: 'mevrouw' }
  assert.equal(mailGreeting(person), 'Hi Ada,')
  assert.equal(mailGreeting(person, 'formeel'), 'Beste mevrouw Jansen,')
  assert.equal(mailGreeting({ first_name: 'Jan', last_name: 'de Vries', gender: 'heer' }, 'formeel'), 'Beste heer de Vries,')
  assert.equal(mailGreeting(null), 'Hi,')
  assert.equal(mailGreeting({ name: 'Ada Jansen' }), 'Hi Ada,')
  assert.equal(mailGreeting({ last_name: 'Jansen' }, 'formeel'), 'Beste Jansen,')
})

test('applyMailGreeting replaces a leading Hi/Beste/Hoi line', () => {
  assert.equal(stripLeadingGreeting('Hoi,\n\nBedankt'), 'Bedankt')
  assert.equal(applyMailGreeting('Hoi Ada,\n\nHier de offerte.', 'Hi Ada,'), 'Hi Ada,\n\nHier de offerte.')
  assert.equal(applyMailGreeting('Hi Ada,\n\nHier de offerte.', 'Beste mevrouw Jansen,'), 'Beste mevrouw Jansen,\n\nHier de offerte.')
  assert.equal(applyMailGreeting('', 'Hi Ada,'), 'Hi Ada,\n\n')
})

test('appendMailFooter adds the signature once', () => {
  assert.equal(appendMailFooter(''), '\n\n' + DEFAULT_MAIL_FOOTER)
  assert.equal(
    appendMailFooter('Hoi Ada,'),
    'Hoi Ada,\n\n' + DEFAULT_MAIL_FOOTER
  )
  assert.equal(
    appendMailFooter('Hoi Ada,\n\n' + DEFAULT_MAIL_FOOTER),
    'Hoi Ada,\n\n' + DEFAULT_MAIL_FOOTER
  )
})

test('inboundRow stores from/to and resend id', () => {
  const row = inboundRow({
    parsed: { email_id: 're_1', from: 'Ada <ada@x.nl>', to: ['nick@nickhoevenaars.nl'], subject: 'Hoi' },
    content: {
      from: 'Ada <ada@x.nl>',
      to: ['nick@nickhoevenaars.nl'],
      subject: 'Hoi',
      text: 'Body',
      html: '<p>Body</p>',
      message_id: '<m@x>',
      created_at: '2026-01-01T00:00:00.000Z',
      headers: { 'In-Reply-To': '<prev@x>' }
    },
    match: { customer_id: 'k1', contact_id: 'c1' },
    threadId: 'root',
    resendId: 're_1'
  })
  assert.equal(row.direction, 'in')
  assert.equal(row.from_email, 'ada@x.nl')
  assert.deepEqual(row.to_emails, ['nick@nickhoevenaars.nl'])
  assert.equal(row.in_reply_to, '<prev@x>')
  assert.equal(row.thread_id, 'root')
  assert.equal(row.read_at, null)
})

test('asEmailList and previewText', () => {
  assert.deepEqual(asEmailList('A <a@x.nl>, b@y.nl'), ['a@x.nl', 'b@y.nl'])
  assert.equal(previewText({ text_body: '  Hallo   wereld  ' }), 'Hallo wereld')
})

test('recentDuplicateOutbound ignores a second identical send within the window', () => {
  const now = Date.parse('2026-08-27T12:00:10.000Z')
  const existing = {
    id: 'm1',
    direction: 'out',
    to_emails: ['ada@bedrijf.nl'],
    subject: 'Offerte',
    text_body: 'Hoi,\nHier de offerte.',
    sent_at: '2026-08-27T12:00:00.000Z'
  }
  assert.equal(recentDuplicateOutbound([existing], {
    to: 'Ada <ada@bedrijf.nl>',
    subject: 'Offerte',
    text: 'Hoi,\nHier de offerte.'
  }, 20000, now)?.id, 'm1')
  assert.equal(recentDuplicateOutbound([existing], {
    to: 'ada@bedrijf.nl',
    subject: 'Offerte',
    text: 'Andere tekst'
  }, 20000, now), null)
  assert.equal(recentDuplicateOutbound([existing], {
    to: 'ada@bedrijf.nl',
    subject: 'Offerte',
    text: 'Hoi,\nHier de offerte.'
  }, 20000, Date.parse('2026-08-27T12:01:00.000Z')), null)
  assert.equal(recentDuplicateOutbound([existing], {
    to: 'ada@bedrijf.nl',
    subject: 'Offerte',
    text: 'Hoi,\nHier de offerte.',
    attachments: [{ filename: 'offerte.pdf' }]
  }, 20000, now), null)
})

test('verifySvixSignature accepts a valid v1 signature', () => {
  const secret = 'whsec_' + Buffer.from('test-secret').toString('base64')
  const body = '{"type":"email.received"}'
  const id = 'msg_1'
  const timestamp = '1710000000'
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64')
  const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  assert.equal(verifySvixSignature(body, {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${sig}`
  }, secret), true)
  assert.throws(() => verifySvixSignature(body, {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': 'v1,nope'
  }, secret))
})
