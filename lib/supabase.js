import { createClient } from '@supabase/supabase-js'

export function getUrl() {
  return process.env.SUPABASE_URL || 'https://mnuktfrpgtjtkwowfvrh.supabase.co'
}

const PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udWt0ZnJwZ3RqdGt3b3dmdnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MjE3MTgsImV4cCI6MjEwMzE5NzcxOH0.nGHLKsmn8RKZsBdkOwZjIfxu78hQEuh09_RidRfGDWM'

export function getAnonKey() {
  return process.env.SUPABASE_ANON_KEY || PUBLIC_ANON_KEY
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
