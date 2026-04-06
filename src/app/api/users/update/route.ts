export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { userId, field, value } = await req.json()
  if (!userId || !field) {
    return NextResponse.json({ error: 'userId and field required' }, { status: 400 })
  }

  const allowedFields = ['telegram', 'phone', 'city', 'country', 'birthDate', 'age']
  if (!allowedFields.includes(field)) {
    return NextResponse.json({ error: 'Field not allowed' }, { status: 400 })
  }

  await prisma.gcUser.update({
    where: { id: userId },
    data: { [field]: value || null },
  })

  return NextResponse.json({ ok: true })
}
