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
  // Auto-detect delimiter: if first line has `;` — use it
  const firstLine = text.split('\n')[0] || ''
  const delimiter = firstLine.includes(';') ? ';' : ','
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter })

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
    const rows = data as Record<string, string>[]
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []
    console.log('📋 Survey CSV headers:', headers)

    // Detect GetCourse format: has columns like "Номер", "Дата создания", "Эл. адрес"
    const isGcFormat = headers.some(h => /номер/i.test(h)) || headers.some(h => /дата создания/i.test(h))

    if (isGcFormat) {
      // GetCourse native format: each column after metadata = a question
      const metaCols = new Set(['Номер', 'Дата создания', 'Пользователь', 'Эл. адрес', 'Эл. почта'])
      const questionCols = headers.filter(h => !metaCols.has(h))

      // Use survey name from formData or filename
      const surveyName = formData.get('surveyName') as string || file.name.replace(/\.csv$/i, '').replace(/surveyanswer_export_[\d_-]+\s*/g, '').trim() || 'Импортированная анкета'
      const surveyId = surveyName.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, '_').slice(0, 60)

      const survey = await prisma.survey.upsert({
        where: { gcId: surveyId },
        create: { gcId: surveyId, name: surveyName },
        update: { name: surveyName },
      })
      const dbSurveyId = survey.id

      for (const row of rows) {
        try {
          const email = (row['Эл. адрес'] || row['Эл. почта'] || '').trim().toLowerCase()
          const answerId = row['Номер'] || ''
          const answeredAt = row['Дата создания'] ? new Date(row['Дата создания']) : null
          if (!email) continue

          // Find user by email
          const user = await prisma.gcUser.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true },
          })
          if (!user) continue

          // Each question column = separate answer
          for (const q of questionCols) {
            const answer = (row[q] || '').trim()
            if (!answer) continue
            const questionId = q.replace(/[^a-zA-Zа-яА-ЯёЁ0-9 ]/g, '').slice(0, 80)

            await prisma.surveyAnswer.upsert({
              where: { surveyId_userId_questionId: { surveyId: dbSurveyId, userId: user.id, questionId } },
              create: {
                surveyId: dbSurveyId,
                userId: user.id,
                questionId,
                question: q,
                answer,
                answeredAt,
                source: 'csv',
              },
              update: { answer },
            })
          }
          imported++
        } catch (e) {
          console.error('Survey import error:', e)
          errors++
        }
      }
    } else {
      // Simple format: user_id, survey_id, question_id, question, answer
      for (const row of rows) {
        try {
          const userId = row['user_id']
          const survId = row['survey_id']
          const questionId = row['question_id']
          if (!userId || !survId || !questionId) continue

          await prisma.gcUser.upsert({
            where: { id: userId },
            create: { id: userId },
            update: {},
          })

          await prisma.survey.upsert({
            where: { gcId: survId },
            create: { gcId: survId, name: row['survey_name'] || survId },
            update: {},
          })

          await prisma.surveyAnswer.upsert({
            where: { surveyId_userId_questionId: { surveyId: survId, userId, questionId } },
            create: {
              surveyId: survId,
              userId,
              questionId,
              question: row['question'] || null,
              answer: row['answer'] || null,
              answeredAt: row['answered_at'] ? new Date(row['answered_at']) : null,
              source: 'csv',
            },
            update: { answer: row['answer'] || null },
          })
          imported++
        } catch {
          errors++
        }
      }
    }
  } else if (type === 'users') {
    // Update user fields by email match
    // Auto-detect columns from CSV headers
    const rows = data as Record<string, string>[]
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []
    console.log('📋 CSV headers:', headers)
    if (rows.length > 0) console.log('📋 First row:', JSON.stringify(rows[0]))

    // Find email column (flexible matching)
    const emailCol = headers.find(h => /^email$/i.test(h.trim())) || headers.find(h => /email/i.test(h)) || ''
    // Find telegram column
    const tgCol = headers.find(h => /^telegram$/i.test(h.trim())) || headers.find(h => /telegram/i.test(h)) || ''
    // Find phone column
    const phoneCol = headers.find(h => /^(телефон|phone)$/i.test(h.trim())) || ''
    const cityCol = headers.find(h => /^(город|city)$/i.test(h.trim())) || ''
    const countryCol = headers.find(h => /^(страна|country)$/i.test(h.trim())) || ''

    console.log('📋 Detected columns:', { emailCol, tgCol, phoneCol, cityCol, countryCol })

    const notFound: string[] = []

    for (const row of rows) {
      try {
        const email = (emailCol ? row[emailCol] || '' : '').trim().toLowerCase()
        if (!email) continue

        const updateData: Record<string, string> = {}
        if (tgCol && row[tgCol]?.trim()) updateData.telegram = row[tgCol].trim()
        if (phoneCol && row[phoneCol]?.trim()) updateData.phone = row[phoneCol].trim()
        if (cityCol && row[cityCol]?.trim()) updateData.city = row[cityCol].trim()
        if (countryCol && row[countryCol]?.trim()) updateData.country = row[countryCol].trim()

        if (Object.keys(updateData).length === 0) continue

        const result = await prisma.gcUser.updateMany({
          where: { email: { equals: email, mode: 'insensitive' } },
          data: updateData,
        })
        if (result.count > 0) imported++
        else {
          notFound.push(email)
          errors++
        }
      } catch (e) {
        console.error('Import row error:', e)
        errors++
      }
    }

    if (notFound.length > 0) {
      console.log('📋 Not found emails (first 10):', notFound.slice(0, 10))
    }

    return NextResponse.json({ ok: true, imported, errors, detectedColumns: { emailCol, tgCol, phoneCol }, notFoundSample: notFound.slice(0, 5) })
  } else {
    return NextResponse.json({ error: 'type должен быть lesson, survey или users' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, imported, errors })
}
