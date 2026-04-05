export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  const products = await prisma.product.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return NextResponse.json({ products })
}
