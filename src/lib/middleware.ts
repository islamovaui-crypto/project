import { NextRequest, NextResponse } from 'next/server'
import { validateSession } from './auth'

export async function requireAuth(): Promise<NextResponse | null> {
  const valid = await validateSession()
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export function isWebhookAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-webhook-token') || req.nextUrl.searchParams.get('token')
  return token === process.env.WEBHOOK_SECRET
}
