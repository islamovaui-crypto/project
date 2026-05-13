export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

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

  // Limit file size to 5MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Файл слишком большой (макс. 5 МБ)' }, { status: 400 })
  }

  // Detect file type by extension
  const isExcel = /\.(xlsx|xls)$/i.test(file.name)

  let data: Record<string, string>[] = []
  if (isExcel) {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
    data = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])))
  } else {
    const text = await file.text()
    const firstLine = text.split('\n')[0] || ''
    const delimiter = firstLine.includes(';') ? ';' : ','
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter })
    data = parsed.data as Record<string, string>[]
  }

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
  } else if (type === 'survey' || type === 'csi') {
    const rows = data as Record<string, string>[]
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []
    console.log('📋 Survey CSV rows:', rows.length)

    // For CSI/NPS — use any email-like column
    // For survey — strict GetCourse format with "Эл. адрес"/"Эл. почта"
    const emailColGoogle = type === 'csi' ? headers.find(h => /email|почта|адрес/i.test(h)) : undefined
    const hasSimpleStructure = headers.some(h => /user_id/i.test(h) || /survey_id/i.test(h))

    // Date from form (apply to all rows if specified)
    const importDateStr = formData.get('surveyDate') as string | null
    const importDate = importDateStr ? new Date(importDateStr) : null

    if (!hasSimpleStructure) {
      // Each column after metadata = a question
      const metaPatterns = [/номер/i, /дата создания/i, /пользователь/i, /эл\.\s*адрес/i, /эл\.\s*почта/i, /email/i, /^имя/i, /фамилия/i, /ваш(е|и)?\s*(имя|email|фамил)/i]
      const questionCols = headers.filter(h => !metaPatterns.some(re => re.test(h)))
      const emailColName = emailColGoogle || ''

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
          const email = (
            (emailColName && row[emailColName]) ||
            row['Эл. адрес'] ||
            row['Эл. почта'] ||
            ''
          ).trim().toLowerCase()
          const answeredAt = row['Дата создания']
            ? new Date(row['Дата создания'])
            : importDate
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
    console.log('📋 Users CSV rows:', rows.length)

    // Find email column (flexible matching)
    const emailCol = headers.find(h => /^email$/i.test(h.trim())) || headers.find(h => /email/i.test(h)) || ''
    // Find telegram column
    const tgCol = headers.find(h => /^telegram$/i.test(h.trim())) || headers.find(h => /telegram/i.test(h)) || ''
    // Find phone column
    const phoneCol = headers.find(h => /^(телефон|phone)$/i.test(h.trim())) || ''
    const cityCol = headers.find(h => /^(город|city)$/i.test(h.trim())) || ''
    const countryCol = headers.find(h => /^(страна|country)$/i.test(h.trim())) || ''


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
      console.log('📋 Not found count:', notFound.length)
    }

    return NextResponse.json({ ok: true, imported, errors })
  } else {
    return NextResponse.json({ error: 'type должен быть lesson, survey, csi или users' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, imported, errors })
}
