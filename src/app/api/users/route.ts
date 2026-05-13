export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import { getExcludedUserIds } from '@/lib/excluded'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = req.nextUrl
  const search = (searchParams.get('search') || '').slice(0, 100)
  const productIdsParam = searchParams.getAll('productId')
  const hasOrders = searchParams.get('hasOrders') // 'true' | 'false' | ''
  const isPaid = searchParams.get('isPaid') // 'true' | 'false' | ''
  const niche = searchParams.get('niche') || ''
  const alsoNiche = searchParams.get('alsoNiche') || '' // include users with this niche too
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 100)
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

  // If alsoNiche is set, add users with that niche to the product filter
  if (alsoNiche) {
    const nicheUsers = await prisma.gcUser.findMany({
      where: { niche: { contains: alsoNiche } },
      select: { id: true },
    })
    const nicheIds = nicheUsers.map(u => u.id)
    if (userIdsForProduct) {
      userIdsForProduct = [...new Set([...userIdsForProduct, ...nicheIds])]
    } else {
      userIdsForProduct = nicheIds
    }
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
    // Add users from alsoNiche who have any paid order, plus manually-added users
    if (alsoNiche) {
      const nicheUsers = await prisma.gcUser.findMany({
        where: {
          niche: { contains: alsoNiche },
          OR: [
            { orders: { some: { isPaid: true } } },
            { id: { startsWith: 'manual_' } },
          ],
        },
        select: { id: true },
      })
      userIdsPaid = [...new Set([...userIdsPaid, ...nicheUsers.map(u => u.id)])]
    }
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

  const where: NonNullable<Parameters<typeof prisma.gcUser.findMany>[0]>['where'] = {
    id: {
      notIn: [...excludedIds],
      ...(userIdsPaid ? { in: userIdsPaid } : {}),
      ...(userIdsNotPaid ? { in: userIdsNotPaid } : {}),
      ...(!userIdsPaid && !userIdsNotPaid && userIdsForProduct ? { in: userIdsForProduct } : {}),
    },
    ...(hasOrders === 'true' ? { orders: { some: {} } } : {}),
    ...(hasOrders === 'false' ? { orders: { none: {} } } : {}),
    ...(isPaid === 'false' && !userIdsNotPaid ? { NOT: { orders: { some: { isPaid: true } } } } : {}),
    ...(niche && !alsoNiche ? { niche: { contains: niche } } : {}),
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
          // If alsoNiche is set — show ALL paid orders (niche users may have orders on other products)
          where: alsoNiche
            ? undefined
            : productIdsParam.length > 0 ? { productId: { in: productIdsParam } } : undefined,
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
