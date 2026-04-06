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
  const productIdsParam = searchParams.getAll('productId')
  const hasOrders = searchParams.get('hasOrders') // 'true' | 'false' | ''
  const isPaid = searchParams.get('isPaid') // 'true' | 'false' | ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '500')
  const skip = (page - 1) * limit

  const excludedIds = await getExcludedUserIds()

  // Build order filter scoped to selected products
  const orderScope = productIdsParam.length > 0 ? { productId: { in: productIdsParam } } : {}

  // If filtering by product(s) — find users who have orders for those products
  let userIdsForProduct: string[] | undefined
  if (productIdsParam.length > 0) {
    const rows = await prisma.order.findMany({
      where: orderScope,
      select: { userId: true },
    })
    userIdsForProduct = [...new Set(rows.map((r) => r.userId))]
  }

  // isPaid filter scoped to selected products
  let userIdsPaid: string[] | undefined
  let userIdsNotPaid: string[] | undefined
  if (isPaid === 'true') {
    const rows = await prisma.order.findMany({
      where: { ...orderScope, isPaid: true },
      select: { userId: true },
    })
    userIdsPaid = [...new Set(rows.map((r) => r.userId))]
  } else if (isPaid === 'false') {
    const paidRows = await prisma.order.findMany({
      where: { ...orderScope, isPaid: true },
      select: { userId: true },
    })
    const paidSet = new Set(paidRows.map((r) => r.userId))
    // Users who have orders for the products but none paid
    if (userIdsForProduct) {
      userIdsNotPaid = userIdsForProduct.filter((id) => !paidSet.has(id))
    } else {
      // No product filter — find all users without any paid order
      userIdsNotPaid = undefined // will use Prisma NOT filter below
    }
  }

  const where: Parameters<typeof prisma.gcUser.findMany>[0]['where'] = {
    id: {
      notIn: [...excludedIds],
      ...(userIdsPaid ? { in: userIdsPaid } : {}),
      ...(userIdsNotPaid ? { in: userIdsNotPaid } : {}),
      ...(!userIdsPaid && !userIdsNotPaid && userIdsForProduct ? { in: userIdsForProduct } : {}),
    },
    ...(hasOrders === 'true' ? { orders: { some: {} } } : {}),
    ...(hasOrders === 'false' ? { orders: { none: {} } } : {}),
    ...(isPaid === 'false' && !userIdsNotPaid ? { NOT: { orders: { some: { isPaid: true } } } } : {}),
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
          where: productIdsParam.length > 0 ? { productId: { in: productIdsParam } } : undefined,
          select: { id: true, productTitle: true, productId: true, isPaid: true, status: true, amount: true, paidAt: true, gcCreatedAt: true },
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
