export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { fetchTrainingStats, fetchLessonVisitors } from '@/lib/getcourse-playwright'

/**
 * Scraper test endpoints:
 *  GET /api/scrape-progress?streamId=935327946           — list lessons + stats
 *  GET /api/scrape-progress?streamId=935327946&lessonId=347157293  — list visitors
 */
export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = req.nextUrl
  const streamId = parseInt(searchParams.get('streamId') || '0')
  const lessonId = parseInt(searchParams.get('lessonId') || '0')

  try {
    if (lessonId && streamId) {
      const visitors = await fetchLessonVisitors(streamId, lessonId)
      return NextResponse.json({ count: visitors.length, sample: visitors.slice(0, 10) })
    }

    if (streamId) {
      const stats = await fetchTrainingStats(streamId)
      return NextResponse.json({ count: stats.length, lessons: stats })
    }

    return NextResponse.json({
      usage: [
        '/api/scrape-progress?streamId=935327946',
        '/api/scrape-progress?streamId=935327946&lessonId=347157293',
      ],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : null }, { status: 500 })
  }
}
