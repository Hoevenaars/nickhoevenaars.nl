import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_PDF_BYTES,
  safePdfName,
  isPdfFile,
  assertPdfSize,
  quotePdfPath,
  mailPdfPath,
  isOwnedPdfPath,
  normalizeMailAttachments,
  collectMailAttachments,
  toResendAttachments,
  storedAttachmentMeta,
  attachmentNamesKey
} from './files.js'

const quoteId = '11111111-1111-1111-1111-111111111111'
const fileId = '22222222-2222-2222-2222-222222222222'
const mailId = '33333333-3333-3333-3333-333333333333'

test('safePdfName keeps a pdf name and strips path bits', () => {
  assert.equal(safePdfName('Offerte Acme.pdf'), 'Offerte Acme.pdf')
  assert.equal(safePdfName('C:\\\\tmp\\\\offerte.pdf'), 'offerte.pdf')
  assert.equal(safePdfName('geen-extensie'), 'geen-extensie.pdf')
  assert.equal(safePdfName(''), 'offerte.pdf')
})

test('isPdfFile accepts pdf names and types', () => {
  assert.equal(isPdfFile({ name: 'a.pdf', type: 'application/pdf' }), true)
  assert.equal(isPdfFile({ name: 'a.PDF', type: '' }), true)
  assert.equal(isPdfFile({ name: 'a.pdf', type: 'application/octet-stream' }), true)
  assert.equal(isPdfFile({ name: 'a.txt', type: 'application/pdf' }), false)
  assert.equal(isPdfFile({ name: 'a.pdf', type: 'image/png' }), false)
  assert.equal(isPdfFile(null), false)
})

test('assertPdfSize rejects empty and oversized files', () => {
  assert.doesNotThrow(() => assertPdfSize(12))
  assert.throws(() => assertPdfSize(0), /Leeg/)
  assert.throws(() => assertPdfSize(MAX_PDF_BYTES + 1), /te groot/)
})

test('owned pdf paths are quote or mail uuids', () => {
  const quotePath = quotePdfPath(quoteId, fileId)
  const mailPath = mailPdfPath(mailId)
  assert.equal(quotePath, `quotes/${quoteId}/${fileId}.pdf`)
  assert.equal(mailPath, `mail/${mailId}.pdf`)
  assert.equal(isOwnedPdfPath(quotePath), true)
  assert.equal(isOwnedPdfPath(mailPath), true)
  assert.equal(isOwnedPdfPath('quotes/../secret.pdf'), false)
  assert.equal(isOwnedPdfPath('other/file.pdf'), false)
  assert.throws(() => quotePdfPath('nope', fileId), /offerte/)
})

test('normalizeMailAttachments keeps valid rows and drops dupes', () => {
  const path = quotePdfPath(quoteId, fileId)
  assert.deepEqual(
    normalizeMailAttachments([
      { path, filename: 'Offerte.pdf', quote_id: quoteId },
      { path, filename: 'zelfde.pdf' }
    ]),
    [{ path, filename: 'Offerte.pdf', quote_id: quoteId }]
  )
  assert.throws(() => normalizeMailAttachments([{ path: 'evil.pdf' }]), /Ongeldige bijlage/)
  assert.throws(
    () => normalizeMailAttachments(Array.from({ length: 6 }, (_, i) => ({
      path: mailPdfPath(`44444444-4444-4444-4444-44444444444${i}`),
      filename: `${i}.pdf`
    }))),
    /Maximaal/
  )
})

test('collectMailAttachments pulls quote PDFs then extra files', () => {
  const path = quotePdfPath(quoteId, fileId)
  const extraPath = mailPdfPath(mailId)
  const quotes = [{ id: quoteId, pdf_path: path, pdf_name: 'Website.pdf' }]
  assert.deepEqual(
    collectMailAttachments({
      quotes,
      quoteIds: [quoteId],
      extra: [{ path: extraPath, filename: 'bijlage.pdf' }]
    }),
    [
      { path, filename: 'Website.pdf', quote_id: quoteId },
      { path: extraPath, filename: 'bijlage.pdf', quote_id: null }
    ]
  )
  assert.deepEqual(collectMailAttachments({ quotes, quoteIds: ['missing'] }), [])
})

test('resend payload and stored meta', () => {
  const files = [{ filename: 'a.pdf', content: 'Zg==', path: mailPdfPath(mailId), quote_id: null }]
  assert.deepEqual(toResendAttachments(files), [{
    filename: 'a.pdf',
    content: 'Zg==',
    content_type: 'application/pdf'
  }])
  assert.deepEqual(storedAttachmentMeta(files), [{
    filename: 'a.pdf',
    path: mailPdfPath(mailId),
    quote_id: null
  }])
  assert.equal(attachmentNamesKey(files), 'a.pdf')
})
