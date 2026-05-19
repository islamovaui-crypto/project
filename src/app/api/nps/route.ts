export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'

const CSI_FIELDS = ['lessons', 'live', 'curator', 'organization'] as const
type CsiField = typeof CSI_FIELDS[number]

function monthLabel(date: Date | null): string {
  if (!date) return 'Неизвестно'
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${months[date.getMonth()]} ${date.getFullYear()}`
}

function monthKey(date: Date | null): string {
  if (!date) return '9999-99'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function computeNPS(scores: number[]): number | null {
  if (scores.length === 0) return null
  const p = scores.filter(s => s >= 9).length
  const d = scores.filter(s => s <= 6).length
  return (p - d) / scores.length
}

function avgPositive(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null && v > 0)
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  const records = await prisma.npsResponse.findMany({ orderBy: { answeredAt: 'asc' } })

  const rows = records.map(r => ({
    id: r.id,
    email: r.email || '',
    name: r.name || '',
    program: r.program,
    month: monthLabel(r.answeredAt),
    monthKey: monthKey(r.answeredAt),
    nps: r.nps,
    lessons: r.lessons,
    live: r.live,
    curator: r.curator,
    organization: r.organization,
    comment: r.comment || '',
    answeredAt: r.answeredAt,
  }))

  const programs = [...new Set(rows.map(r => r.program))].sort()
  const monthPairs = [...new Map(rows.map(r => [r.monthKey, r.month])).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
  const months = monthPairs.map(([key, label]) => ({ key, label }))

  const npsMatrix: Record<string, Record<string, number | null>> = {}
  const csiMatrix: Record<string, Record<string, Record<CsiField, number | null> & { overall: number | null }>> = {}
  const npsTotal: Record<string, number | null> = {}
  const csiTotal: Record<string, Record<CsiField, number | null> & { overall: number | null }> = {}

  for (const prog of programs) {
    npsMatrix[prog] = {}
    csiMatrix[prog] = {}
    const progRows = rows.filter(r => r.program === prog)

    for (const { key: mo } of months) {
      const moRows = progRows.filter(r => r.monthKey === mo)
      npsMatrix[prog][mo] = computeNPS(moRows.map(r => r.nps).filter((v): v is number => v !== null))

      const cats: Record<CsiField, number | null> = {
        lessons: avgPositive(moRows.map(r => r.lessons)),
        live: avgPositive(moRows.map(r => r.live)),
        curator: avgPositive(moRows.map(r => r.curator)),
        organization: avgPositive(moRows.map(r => r.organization)),
      }
      const catVals = Object.values(cats).filter((v): v is number => v !== null)
      csiMatrix[prog][mo] = { ...cats, overall: catVals.length > 0 ? catVals.reduce((a, b) => a + b, 0) / catVals.length / 10 : null }
    }

    npsTotal[prog] = computeNPS(progRows.map(r => r.nps).filter((v): v is number => v !== null))
    const totalCats: Record<CsiField, number | null> = {
      lessons: avgPositive(progRows.map(r => r.lessons)),
      live: avgPositive(progRows.map(r => r.live)),
      curator: avgPositive(progRows.map(r => r.curator)),
      organization: avgPositive(progRows.map(r => r.organization)),
    }
    const totalCatVals = Object.values(totalCats).filter((v): v is number => v !== null)
    csiTotal[prog] = { ...totalCats, overall: totalCatVals.length > 0 ? totalCatVals.reduce((a, b) => a + b, 0) / totalCatVals.length / 10 : null }
  }

  const npsMonthTotal: Record<string, number | null> = {}
  const csiMonthTotal: Record<string, Record<CsiField, number | null> & { overall: number | null }> = {}
  for (const { key: mo } of months) {
    const moRows = rows.filter(r => r.monthKey === mo)
    npsMonthTotal[mo] = computeNPS(moRows.map(r => r.nps).filter((v): v is number => v !== null))
    const cats: Record<CsiField, number | null> = {
      lessons: avgPositive(moRows.map(r => r.lessons)),
      live: avgPositive(moRows.map(r => r.live)),
      curator: avgPositive(moRows.map(r => r.curator)),
      organization: avgPositive(moRows.map(r => r.organization)),
    }
    const catVals = Object.values(cats).filter((v): v is number => v !== null)
    csiMonthTotal[mo] = { ...cats, overall: catVals.length > 0 ? catVals.reduce((a, b) => a + b, 0) / catVals.length / 10 : null }
  }

  const allNPS = rows.map(r => r.nps).filter((v): v is number => v !== null)
  const grandNPS = computeNPS(allNPS)
  const allCats: Record<CsiField, number | null> = {
    lessons: avgPositive(rows.map(r => r.lessons)),
    live: avgPositive(rows.map(r => r.live)),
    curator: avgPositive(rows.map(r => r.curator)),
    organization: avgPositive(rows.map(r => r.organization)),
  }
  const allCatVals = Object.values(allCats).filter((v): v is number => v !== null)
  const grandCSI = allCatVals.length > 0 ? allCatVals.reduce((a, b) => a + b, 0) / allCatVals.length / 10 : null

  const comments = rows
    .filter(r => r.nps !== null || r.comment)
    .map(r => ({
      id: r.id,
      email: r.email,
      name: r.name,
      program: r.program,
      month: r.month,
      monthKey: r.monthKey,
      nps: r.nps,
      lessons: r.lessons,
      live: r.live,
      curator: r.curator,
      organization: r.organization,
      comment: r.comment,
      type: r.nps === null ? null : r.nps >= 9 ? 'promoter' : r.nps <= 6 ? 'detractor' : 'passive',
    }))
    .sort((a, b) => (b.nps ?? -1) - (a.nps ?? -1))

  return NextResponse.json({
    programs,
    months,
    npsMatrix,
    csiMatrix,
    npsTotal,
    csiTotal,
    npsMonthTotal,
    csiMonthTotal,
    grandNPS,
    grandCSI,
    grandCats: allCats,
    comments,
    totalResponses: rows.length,
  })
}
