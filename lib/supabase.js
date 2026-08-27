import { createClient } from '@supabase/supabase-js'

export function getUrl() {
  return process.env.SUPABASE_URL || 'https://mnuktfrpgtjtkwowfvrh.supabase.co'
}

export function getAnonKey() {
  return process.env.SUPABASE_ANON_KEY || ''
}

export function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function userClient(accessToken) {
  const anon = getAnonKey()
  if (!anon) {
    const err = new Error('SUPABASE_ANON_KEY ontbreekt in Vercel.')
    err.status = 500
    throw err
  }
  return createClient(getUrl(), anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  })
}

export function serviceClient() {
  const key = getServiceKey()
  if (!key) {
    const err = new Error('SUPABASE_SERVICE_ROLE_KEY ontbreekt in Vercel.')
    err.status = 500
    throw err
  }
  return createClient(getUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
