import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'

const SESSION_COOKIE = 'gc_session'

async function makeSessionToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET || 'fallback_secret'
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('authenticated'))
  return Buffer.from(sig).toString('base64url')
}

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = process.env.DASHBOARD_PASSWORD
  if (!stored) return false
  if (stored.startsWith('$2')) {
    return bcrypt.compare(password, stored)
  }
  return password === stored
}

export async function createSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = await makeSessionToken()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
}

export async function validateSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  const expected = await makeSessionToken()
  return token === expected
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
