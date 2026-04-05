export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import { getExcludedUserIds } from '@/lib/excluded'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = req.nextUrl
  const productId = searchParams.get('productId') || undefined
  const lessonId = searchParams.get('lessonId') || undefined
  const completed = searchParams.get('completed')
  const search = searchParams.get('search') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 50
  const skip = (page - 1) * limit

  const excludedIds = await getExcludedUserIds()

  const where = {
    userId: { notIn: [...excludedIds] },
    ...(productId ? { productId } : {}),
    ...(lessonId ? { lessonId } : {}),
    ...(completed !== null && completed !== undefined ? { completed: completed === 'true' } : {}),
    ...(search
      ? {
          user: {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { firstName: { contains: search, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  }

  const [progress, total] = await Promise.all([
    prisma.lessonProgress.findMany({
      where,
      skip,
      take: limit,
      orderBy: { lastActivity: 'desc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.lessonProgress.count({ where }),
  ])

  // Aggregate stats per user+product
  const notStarted = await prisma.gcUser.count({
    where: {
      id: { notIn: [...excludedIds] },
      lessonProgress: { none: productId ? { productId } : {} },
    },
  })

  return NextResponse.json({
    progress,
    total,
    page,
    pages: Math.ceil(total / limit),
    stats: { notStarted },
  })
}
