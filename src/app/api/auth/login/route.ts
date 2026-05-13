export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createSession } from '@/lib/auth'

// Simple in-memory rate limiter: max 5 attempts per IP per 15 min
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= MAX_ATTEMPTS
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Подождите 15 минут.' },
      { status: 429 }
    )
  }

  let body: { password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { password } = body
  if (!password || typeof password !== 'string' || password.length > 200) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 })
  }

  const valid = await verifyPassword(password)
  if (!valid) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 })
  }

  // Reset attempts on successful login
  attempts.delete(ip)

  await createSession()
  return NextResponse.json({ ok: true })
}
