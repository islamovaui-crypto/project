export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import Papa from 'papaparse'

/**
 * CSV Import for lesson progress and survey answers
 *
 * Lesson progress CSV columns:
 *   user_id, lesson_id, lesson_title, product_id, opened (1/0), completed (1/0), last_activity
 *
 * Survey answers CSV columns:
 *   user_id, survey_id, survey_name, question_id, question, answer, answered_at, product_id
 */
export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type') as string // 'lesson' | 'survey'

  if (!file || !type) {
    return NextResponse.json({ error: 'Нужны file и type' }, { status: 400 })
  }

  const text = await file.text()
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })

  let imported = 0
  let errors = 0

  if (type === 'lesson') {
    for (const row of data as Record<string, string>[]) {
      try {
        const userId = row['user_id']
        const lessonId = row['lesson_id']
        if (!userId || !lessonId) continue

        await prisma.gcUser.upsert({
          where: { id: userId },
          create: { id: userId },
          update: {},
        })

        const productId = row['product_id'] || null
        if (productId) {
          await prisma.product.upsert({
            where: { id: productId },
            create: { id: productId, name: productId },
            update: {},
          })
        }

        await prisma.lessonProgress.upsert({
          where: { userId_lessonId: { userId, lessonId } },
          create: {
            userId,
            lessonId,
            productId,
            lessonTitle: row['lesson_title'] || null,
            opened: row['opened'] === '1' || row['opened'] === 'true',
            completed: row['completed'] === '1' || row['completed'] === 'true',
            lastActivity: row['last_activity'] ? new Date(row['last_activity']) : null,
            source: 'csv',
          },
          update: {
            opened: row['opened'] === '1' || row['opened'] === 'true',
            completed: row['completed'] === '1' || row['completed'] === 'true',
            lastActivity: row['last_activity'] ? new Date(row['last_activity']) : null,
          },
        })
        imported++
      } catch {
        errors++
      }
    }
  } else if (type === 'survey') {
    for (const row of data as Record<string, string>[]) {
      try {
        const userId = row['user_id']
        const surveyId = row['survey_id']
        const questionId = row['question_id']
        if (!userId || !surveyId || !questionId) continue

        await prisma.gcUser.upsert({
          where: { id: userId },
          create: { id: userId },
          update: {},
        })

        const productId = row['product_id'] || null
        await prisma.survey.upsert({
          where: { gcId: surveyId },
          create: {
            gcId: surveyId,
            name: row['survey_name'] || surveyId,
            productId,
          },
          update: {},
        })

        await prisma.surveyAnswer.upsert({
          where: { surveyId_userId_questionId: { surveyId, userId, questionId } },
          create: {
            surveyId,
            userId,
            questionId,
            question: row['question'] || null,
            answer: row['answer'] || null,
            answeredAt: row['answered_at'] ? new Date(row['answered_at']) : null,
            source: 'csv',
          },
          update: {
            answer: row['answer'] || null,
          },
        })
        imported++
      } catch {
        errors++
      }
    }
  } else {
    return NextResponse.json({ error: 'type должен быть lesson или survey' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, imported, errors })
}
