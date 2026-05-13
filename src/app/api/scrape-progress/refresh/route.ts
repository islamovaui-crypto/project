export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import { fetchTrainingStats, fetchLessonVisitors, fetchLessonOpenDate } from '@/lib/getcourse-playwright'

/**
 * POST /api/scrape-progress/refresh?course=Вайбкодинг 2.0
 *
 * Refreshes lesson stats for all modules of the specified course.
 */
export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const course = req.nextUrl.searchParams.get('course') || ''
  if (!course) return NextResponse.json({ error: 'course is required' }, { status: 400 })

  const modules = await prisma.trainingModule.findMany({
    where: { course },
    orderBy: { order: 'asc' },
  })

  if (modules.length === 0) {
    return NextResponse.json({ error: `No modules registered for course "${course}"` }, { status: 404 })
  }

  const results: { module: string; lessons: number; visits?: number; error?: string }[] = []

  for (const m of modules) {
    try {
      const stats = await fetchTrainingStats(parseInt(m.streamId))
      let order = 0
      let totalVisits = 0

      for (const s of stats) {
        // Try to fetch open date (best effort)
        let openDate: string | null = null
        try {
          openDate = await fetchLessonOpenDate(s.lessonId)
        } catch {}

        const lessonStat = await prisma.lessonStat.upsert({
          where: { moduleId_lessonId: { moduleId: m.id, lessonId: String(s.lessonId) } },
          create: {
            moduleId: m.id,
            lessonId: String(s.lessonId),
            title: s.title,
            status: s.status,
            entered: s.entered,
            answered: s.answered,
            passed: s.passed,
            openDate,
            order: order++,
          },
          update: {
            title: s.title,
            status: s.status,
            entered: s.entered,
            answered: s.answered,
            passed: s.passed,
            openDate,
            order: order,
            syncedAt: new Date(),
          },
        })

        // Skip fetching visitors if no one entered
        if (s.entered === 0) continue

        // Fetch list of visitors for this lesson
        const visitors = await fetchLessonVisitors(parseInt(m.streamId), s.lessonId)

        // Replace existing visits for this lesson
        await prisma.userLessonVisit.deleteMany({ where: { lessonStatId: lessonStat.id } })
        if (visitors.length > 0) {
          await prisma.userLessonVisit.createMany({
            data: visitors.map(v => ({ userId: v.userId, lessonStatId: lessonStat.id })),
            skipDuplicates: true,
          })
          totalVisits += visitors.length
        }
      }

      await prisma.trainingModule.update({
        where: { id: m.id },
        data: { syncedAt: new Date() },
      })
      results.push({ module: m.title, lessons: stats.length, visits: totalVisits })
    } catch (e) {
      results.push({ module: m.title, lessons: 0, error: String(e).slice(0, 200) })
    }
  }

  return NextResponse.json({ ok: true, results })
}

/**
 * GET /api/scrape-progress/refresh?course=Вайбкодинг 2.0
 * Returns saved stats from DB.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const course = req.nextUrl.searchParams.get('course') || ''
  if (!course) return NextResponse.json({ error: 'course is required' }, { status: 400 })

  const modules = await prisma.trainingModule.findMany({
    where: { course },
    orderBy: { order: 'asc' },
    include: {
      lessons: { orderBy: { order: 'asc' } },
    },
  })

  return NextResponse.json({ modules })
}
