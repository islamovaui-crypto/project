export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  return NextResponse.json({
    copilotEnabled:
      !!process.env.ANTHROPIC_API_KEY &&
      process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key',
  })
}
