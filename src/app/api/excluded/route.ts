export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  const excluded = await prisma.excludedAccount.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ excluded })
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const body = await req.json()
  const { userId, email, tag, groupId, reason } = body

  if (!userId && !email && !tag && !groupId) {
    return NextResponse.json({ error: 'Укажите хотя бы одно поле' }, { status: 400 })
  }

  const entry = await prisma.excludedAccount.create({
    data: { userId, email, tag, groupId, reason },
  })
  return NextResponse.json({ ok: true, entry })
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await req.json()
  await prisma.excludedAccount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
