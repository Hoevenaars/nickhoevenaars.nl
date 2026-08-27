export const TIME_TYPES = [
  { id: 'telefoon', label: 'Telefoon' },
  { id: 'mail', label: 'Mail' },
  { id: 'ontwikkelen', label: 'Ontwikkelen' },
  { id: 'afspraak', label: 'Afspraak' }
]

export function timeTypeLabel(id) {
  return TIME_TYPES.find((t) => t.id === id)?.label || id || '—'
}

export function mapTimeTypeToLogType(type) {
  if (type === 'telefoon') return 'telefoon'
  if (type === 'mail') return 'email'
  if (type === 'afspraak') return 'meeting'
  return 'overig'
}

export function elapsedSeconds(startedAt, endedAt = new Date()) {
  const start = new Date(startedAt).getTime()
  const end = endedAt instanceof Date ? endedAt.getTime() : new Date(endedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 1000))
}

export function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function formatDurationNl(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (m === 60) return `${h + 1}u`
  if (h && m) return `${h}u ${m}m`
  if (h) return `${h}u`
  if (m) return `${m}m`
  return `${s}s`
}
