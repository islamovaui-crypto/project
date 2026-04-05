export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import { getExcludedUserIds } from '@/lib/excluded'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = req.nextUrl
  const search = searchParams.get('search') || ''
  const productId = searchParams.get('productId') || ''
  const hasOrders = searchParams.get('hasOrders') // 'true' | 'false' | ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 50
  const skip = (page - 1) * limit

  const excludedIds = await getExcludedUserIds()

  // If filtering by product — find users who have orders for that product
  let userIdsForProduct: string[] | undefined
  if (productId) {
    const rows = await prisma.order.findMany({
      where: { productId },
      select: { userId: true },
    })
    userIdsForProduct = [...new Set(rows.map((r) => r.userId))]
  }

  const where: Parameters<typeof prisma.gcUser.findMany>[0]['where'] = {
    id: {
      notIn: [...excludedIds],
      ...(userIdsForProduct ? { in: userIdsForProduct } : {}),
    },
    ...(hasOrders === 'true' ? { orders: { some: {} } } : {}),
    ...(hasOrders === 'false' ? { orders: { none: {} } } : {}),
    ...(search
      ? {
          OR: [
            { id: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [users, total] = await Promise.all([
    prisma.gcUser.findMany({
      where,
      skip,
      take: limit,
      orderBy: { syncedAt: 'desc' },
      include: {
        orders: {
          select: { id: true, productTitle: true, productId: true, isPaid: true, status: true, amount: true },
          orderBy: { gcCreatedAt: 'desc' },
          take: 5,
        },
        _count: {
          select: { orders: true, lessonProgress: true, surveyAnswers: true },
        },
      },
    }),
    prisma.gcUser.count({ where }),
  ])

  return NextResponse.json({ users, total, page, pages: Math.ceil(total / limit) })
}
