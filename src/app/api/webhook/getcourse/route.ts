export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { isWebhookAuthorized } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'

/**
 * Webhook endpoint for GetCourse "Процессы" → "Вызов URL"
 *
 * GetCourse sends form-encoded POST data.
 * Configure in GetCourse:
 *   URL: https://your-domain.com/api/webhook/getcourse?token=YOUR_WEBHOOK_SECRET
 *   Method: POST
 *
 * Expected fields for lesson progress:
 *   type=lesson, user_id, lesson_id, lesson_title, product_id, action=opened|completed
 *
 * Expected fields for survey answers:
 *   type=survey, user_id, survey_id, survey_name, question_id, question, answer, product_id
 */
export async function POST(req: NextRequest) {
  if (!isWebhookAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let data: Record<string, string>

  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await req.json()
  } else {
    // form-encoded
    const text = await req.text()
    const params = new URLSearchParams(text)
    data = Object.fromEntries(params.entries())
  }

  const type = data['type']
  const userId = data['user_id']

  if (!userId) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }

  // Ensure user exists
  await prisma.gcUser.upsert({
    where: { id: userId },
    create: { id: userId, email: data['user_email'] || '' },
    update: {},
  })

  if (type === 'lesson') {
    const lessonId = data['lesson_id']
    if (!lessonId) return NextResponse.json({ error: 'Missing lesson_id' }, { status: 400 })

    const action = data['action'] || 'opened'
    const productId = data['product_id'] || null

    if (productId) {
      await prisma.product.upsert({
        where: { id: productId },
        create: { id: productId, name: data['product_title'] || productId },
        update: {},
      })
    }

    await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        userId,
        productId,
        lessonId,
        lessonTitle: data['lesson_title'] || null,
        opened: true,
        completed: action === 'completed',
        lastActivity: new Date(),
        source: 'webhook',
      },
      update: {
        opened: true,
        completed: action === 'completed' ? true : undefined,
        lastActivity: new Date(),
      },
    })

    return NextResponse.json({ ok: true, type: 'lesson' })
  }

  if (type === 'survey') {
    const surveyId = data['survey_id']
    const questionId = data['question_id']
    if (!surveyId || !questionId) {
      return NextResponse.json({ error: 'Missing survey_id or question_id' }, { status: 400 })
    }

    const productId = data['product_id'] || null
    if (productId) {
      await prisma.product.upsert({
        where: { id: productId },
        create: { id: productId, name: data['product_title'] || productId },
        update: {},
      })
    }

    await prisma.survey.upsert({
      where: { gcId: surveyId },
      create: {
        gcId: surveyId,
        name: data['survey_name'] || surveyId,
        productId,
        type: data['survey_type'] || 'onboarding',
      },
      update: {},
    })

    await prisma.surveyAnswer.upsert({
      where: { surveyId_userId_questionId: { surveyId: surveyId, userId, questionId } },
      create: {
        surveyId: surveyId,
        userId,
        questionId,
        question: data['question'] || null,
        answer: data['answer'] || null,
        answeredAt: new Date(),
        source: 'webhook',
      },
      update: {
        answer: data['answer'] || null,
        answeredAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true, type: 'survey' })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
