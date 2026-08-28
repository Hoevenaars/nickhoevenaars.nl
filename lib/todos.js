export const DEFAULT_TODO_BUCKETS = [
  'Backlog',
  'Deze week / In Progress',
  'Volgende week',
  'Bewaking en beheer',
  'Optimalisaties',
  'Afgerond'
]

export const TODO_PROGRESS = [
  { id: 'niet_gestart', label: 'Niet gestart' },
  { id: 'bezig', label: 'Bezig' },
  { id: 'voltooid', label: 'Voltooid' }
]

export const TODO_PRIORITIES = [
  { id: 'laag', label: 'Laag' },
  { id: 'normaal', label: 'Gemiddeld' },
  { id: 'hoog', label: 'Hoog' }
]

export const TODO_LABEL_COLORS = [
  { id: 'pink', bg: '#f4c2d7', fg: '#4a1730' },
  { id: 'peach', bg: '#f5c9a8', fg: '#4a2410' },
  { id: 'green', bg: '#c5e8b7', fg: '#1a3a12' },
  { id: 'yellow', bg: '#f5e6a3', fg: '#3f3408' },
  { id: 'blue', bg: '#b7d4f5', fg: '#122844' },
  { id: 'purple', bg: '#d4c2f0', fg: '#2e1444' },
  { id: 'teal', bg: '#b7ebe3', fg: '#123430' },
  { id: 'gray', bg: '#d4d4d8', fg: '#1c1c20' }
]

export function labelColor(id) {
  return TODO_LABEL_COLORS.find((c) => c.id === id) || TODO_LABEL_COLORS[0]
}

export function checklistStats(checklist) {
  const items = Array.isArray(checklist) ? checklist : []
  return { total: items.length, done: items.filter((i) => i.done).length }
}

export function isOverdue(dueAt, status, today) {
  if (!dueAt || status === 'done') return false
  return String(dueAt).slice(0, 10) < String(today)
}

export function formatDueShort(dueAt) {
  if (!dueAt) return ''
  const d = new Date(String(dueAt).slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function fieldsForProgress(progress) {
  if (progress === 'voltooid') {
    return { progress: 'voltooid', status: 'done', completed_at: new Date().toISOString() }
  }
  return { progress: progress || 'niet_gestart', status: 'open', completed_at: null }
}

export function fieldsForDone(done) {
  return fieldsForProgress(done ? 'voltooid' : 'niet_gestart')
}

export function sortTodosInBucket(todos) {
  return [...(todos || [])].sort((a, b) =>
    (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
  )
}

export function todosByBucket(todos, buckets) {
  const map = new Map((buckets || []).map((b) => [b.id, []]))
  const unassigned = []
  for (const t of todos || []) {
    if (t.bucket_id && map.has(t.bucket_id)) map.get(t.bucket_id).push(t)
    else unassigned.push(t)
  }
  for (const [id, rows] of map) map.set(id, sortTodosInBucket(rows))
  return { grouped: map, unassigned: sortTodosInBucket(unassigned) }
}

export function nextSortOrder(todos) {
  return (todos || []).reduce((m, t) => Math.max(m, Number(t.sort_order) || 0), 0) + 1
}

export function nextBucketPosition(buckets) {
  return (buckets || []).reduce((m, b) => Math.max(m, Number(b.position) || 0), -1) + 1
}

export function moveBucket(buckets, id, dir) {
  const list = [...(buckets || [])]
  const i = list.findIndex((b) => b.id === id)
  const j = i + Number(dir)
  if (i < 0 || j < 0 || j >= list.length) return null
  const next = list.slice()
  const [item] = next.splice(i, 1)
  next.splice(j, 0, item)
  return next.map((b, idx) => ({ id: b.id, position: idx }))
}

export function newChecklistItem(title, id) {
  return {
    id: id || (globalThis.crypto?.randomUUID?.() || ('c' + Date.now())),
    title: String(title || '').trim(),
    done: false
  }
}

export function relativeTimeNl(iso, now = new Date()) {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const sec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000))
  if (sec < 45) return 'zojuist'
  const min = Math.round(sec / 60)
  if (min < 60) return min === 1 ? '1 minuut geleden' : `${min} minuten geleden`
  const hrs = Math.round(min / 60)
  if (hrs < 24) return hrs === 1 ? '1 uur geleden' : `${hrs} uur geleden`
  const days = Math.round(hrs / 24)
  if (days < 7) return days === 1 ? 'gisteren' : `${days} dagen geleden`
  return then.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}
