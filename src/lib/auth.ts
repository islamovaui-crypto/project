import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'

const SESSION_COOKIE = 'gc_session'
const SESSION_VALUE = 'authenticated'

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = process.env.DASHBOARD_PASSWORD
  if (!stored) return false
  // Support both plain and hashed passwords
  if (stored.startsWith('$2')) {
    return bcrypt.compare(password, stored)
  }
  return password === stored
}

export async function createSession(): Promise<void> {
  const cookieStore = await cookies()
  const secret = process.env.SESSION_SECRET || 'fallback_secret'
  const hash = await bcrypt.hash(SESSION_VALUE + secret, 8)
  cookieStore.set(SESSION_COOKIE, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })
}

export async function validateSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  const secret = process.env.SESSION_SECRET || 'fallback_secret'
  return bcrypt.compare(SESSION_VALUE + secret, token)
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
