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

export function parseLocalDateTime(value) {
  if (value == null || value === '') return null
  const s = String(value).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const d = new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6] || 0)
    )
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function toLocalInput(d) {
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
}

export function durationParts(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  let minutes = Math.round(s / 60)
  const hours = Math.floor(minutes / 60)
  minutes = minutes % 60
  return { hours, minutes, seconds: s }
}

export function addDuration(startedAt, hours, minutes) {
  const start = startedAt instanceof Date ? startedAt : parseLocalDateTime(startedAt)
  if (!start) return null
  const h = Math.max(0, Number(hours) || 0)
  const m = Math.max(0, Number(minutes) || 0)
  return new Date(start.getTime() + (h * 3600 + m * 60) * 1000)
}

export function resolveTimeRange({ startedAt, endedAt, hours, minutes } = {}) {
  let started = startedAt instanceof Date ? startedAt : parseLocalDateTime(startedAt)
  if (!started && startedAt) {
    const d = new Date(startedAt)
    if (!Number.isNaN(d.getTime())) started = d
  }
  if (started && Number.isNaN(started.getTime())) started = null

  let ended = endedAt instanceof Date ? endedAt : parseLocalDateTime(endedAt)
  if (!ended && endedAt) {
    const d = new Date(endedAt)
    if (!Number.isNaN(d.getTime())) ended = d
  }
  if (ended && Number.isNaN(ended.getTime())) ended = null

  if (!ended && started && (Number(hours) > 0 || Number(minutes) > 0)) {
    ended = addDuration(started, hours, minutes)
  }
  return { started, ended }
}

export function elapsedSeconds(startedAt, endedAt = new Date()) {
  const start = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime()
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
