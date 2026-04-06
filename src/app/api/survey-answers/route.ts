export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const userIds = req.nextUrl.searchParams.getAll('userId')
  if (userIds.length === 0) {
    return NextResponse.json({ answers: {}, questions: [] })
  }

  const answers = await prisma.surveyAnswer.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, question: true, answer: true },
  })

  // Get unique questions
  const questionsSet = new Set<string>()
  answers.forEach(a => { if (a.question) questionsSet.add(a.question) })
  const questions = [...questionsSet]

  // Group by userId -> { question: answer }
  const byUser: Record<string, Record<string, string>> = {}
  for (const a of answers) {
    if (!a.question || !a.answer) continue
    if (!byUser[a.userId]) byUser[a.userId] = {}
    byUser[a.userId][a.question] = a.answer
  }

  return NextResponse.json({ answers: byUser, questions })
}
