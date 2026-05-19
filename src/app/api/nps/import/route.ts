export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'

function parseDate(s: string | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function parseFloat2(s: string | undefined): number | null {
  if (!s || s.trim() === '') return null
  const v = parseFloat(s.replace(',', '.'))
  return isNaN(v) ? null : v
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    // simple CSV split — handles quoted fields with commas
    const vals: string[] = []
    let cur = ''
    let inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { vals.push(cur); cur = '' }
      else { cur += ch }
    }
    vals.push(cur)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = (vals[idx] ?? '').trim().replace(/^"|"$/g, '') })
    rows.push(row)
  }
  return rows
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length === 0) return NextResponse.json({ error: 'Empty or invalid CSV' }, { status: 400 })

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const program = row['Программа'] || row['program'] || ''
    const email = row['Email'] || row['email'] || row['Email_raw'] || ''
    if (!program) { skipped++; continue }

    const data = {
      program,
      expert: row['Эксперт'] || row['expert'] || null,
      respondentId: row['ID'] || row['id'] || null,
      answeredAt: parseDate(row['Время'] || row['answeredAt']),
      name: row['Имя'] || row['name'] || null,
      email: email || null,
      lessons: parseFloat2(row['Уроки'] || row['lessons']),
      live: parseFloat2(row['Живые'] || row['live']),
      curator: parseFloat2(row['Куратор'] || row['curator']),
      organization: parseFloat2(row['Организация'] || row['organization']),
      nps: parseFloat2(row['NPS'] ?? row['NPS_orig']),
      comment: row['Комментарий'] || row['comment'] || null,
      reclassified: row['_reclassified'] === 'True' || row['_reclassified'] === 'true' || row['_reclassified'] === '1',
      sourceFile: row['_source_file'] || file.name || null,
    }

    try {
      if (email) {
        await prisma.npsResponse.upsert({
          where: { email_program: { email, program } },
          update: data,
          create: data,
        })
      } else {
        await prisma.npsResponse.create({ data: { ...data, id: undefined } })
      }
      imported++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ imported, skipped, total: rows.length })
}
