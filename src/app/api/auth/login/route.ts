export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const valid = await verifyPassword(password)
  if (!valid) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 })
  }
  await createSession()
  return NextResponse.json({ ok: true })
}
