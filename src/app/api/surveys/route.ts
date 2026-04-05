export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import { getExcludedUserIds } from '@/lib/excluded'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = req.nextUrl
  const surveyId = searchParams.get('surveyId')
  const questionId = searchParams.get('questionId')
  const answer = searchParams.get('answer')
  const productId = searchParams.get('productId') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 50
  const skip = (page - 1) * limit

  // List all surveys
  if (!surveyId) {
    const surveys = await prisma.survey.findMany({
      where: productId ? { productId } : {},
      include: { _count: { select: { answers: true } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ surveys })
  }

  const excludedIds = await getExcludedUserIds()

  const where = {
    surveyId,
    userId: { notIn: [...excludedIds] },
    ...(questionId ? { questionId } : {}),
    ...(answer ? { answer: { contains: answer, mode: 'insensitive' as const } } : {}),
  }

  const [answers, total] = await Promise.all([
    prisma.surveyAnswer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { answeredAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.surveyAnswer.count({ where }),
  ])

  return NextResponse.json({ answers, total, page, pages: Math.ceil(total / limit) })
}
