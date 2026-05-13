export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/lesson-visits?course=Вайбкодинг 2.0&userId=...&userId=...
 *
 * Returns:
 * {
 *   lessons: [{ id, lessonId, title, moduleTitle, moduleOrder, lessonOrder, totalEntered }],
 *   visits: { userId: { lessonStatId: true } }
 * }
 */
async function handle(course: string, userIds: string[]) {

  // Get all modules for this course
  const modules = await prisma.trainingModule.findMany({
    where: { course },
    orderBy: { order: 'asc' },
    include: { lessons: { orderBy: { order: 'asc' } } },
  })

  // Build flat lesson list
  const lessons = modules.flatMap(m =>
    m.lessons.map(l => ({
      id: l.id,
      lessonId: l.lessonId,
      title: l.title,
      moduleTitle: m.title,
      moduleOrder: m.order,
      lessonOrder: l.order,
      entered: l.entered,
      openDate: l.openDate,
    }))
  )

  if (userIds.length === 0 || lessons.length === 0) {
    return NextResponse.json({ lessons, visits: {} })
  }

  // Fetch all visits for the requested users + lessons
  const lessonStatIds = lessons.map(l => l.id)
  const visits = await prisma.userLessonVisit.findMany({
    where: {
      userId: { in: userIds },
      lessonStatId: { in: lessonStatIds },
    },
    select: { userId: true, lessonStatId: true },
  })

  // Group by user
  const byUser: Record<string, Record<string, boolean>> = {}
  for (const v of visits) {
    if (!byUser[v.userId]) byUser[v.userId] = {}
    byUser[v.userId][v.lessonStatId] = true
  }

  return NextResponse.json({ lessons, visits: byUser })
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const course = req.nextUrl.searchParams.get('course') || ''
  const userIds = req.nextUrl.searchParams.getAll('userId')
  return handle(course, userIds)
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const body = await req.json()
  return handle(body.course || '', body.userIds || [])
}
