export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import { getExcludedUserIds } from '@/lib/excluded'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = req.nextUrl
  const productIds = searchParams.getAll('productId')
  const status = searchParams.get('status') || undefined
  const isPaid = searchParams.get('isPaid')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 50
  const skip = (page - 1) * limit

  const excludedIds = await getExcludedUserIds()

  const where = {
    userId: { notIn: [...excludedIds] },
    ...(productIds.length > 0 ? { productId: { in: productIds } } : {}),
    ...(status ? { status } : {}),
    ...(isPaid !== null && isPaid !== undefined ? { isPaid: isPaid === 'true' } : {}),
  }

  const [orders, total, stats] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { gcCreatedAt: 'desc' },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({
      where,
      _count: { id: true },
      _sum: { amount: true },
    }),
  ])

  const paidCount = await prisma.order.count({ where: { ...where, isPaid: true } })

  return NextResponse.json({
    orders,
    total,
    page,
    pages: Math.ceil(total / limit),
    stats: {
      total: stats._count.id,
      paid: paidCount,
      totalAmount: stats._sum.amount || 0,
    },
  })
}
