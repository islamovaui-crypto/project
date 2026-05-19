'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type CsiField = 'lessons' | 'live' | 'curator' | 'organization'

interface MonthEntry { key: string; label: string }

interface CsiEntry extends Record<CsiField, number | null> { overall: number | null }

interface Comment {
  id: string
  email: string
  name: string
  program: string
  month: string
  monthKey: string
  nps: number | null
  lessons: number | null
  live: number | null
  curator: number | null
  organization: number | null
  comment: string
  type: 'promoter' | 'passive' | 'detractor' | null
}

interface NpsData {
  programs: string[]
  months: MonthEntry[]
  npsMatrix: Record<string, Record<string, number | null>>
  csiMatrix: Record<string, Record<string, CsiEntry>>
  npsTotal: Record<string, number | null>
  csiTotal: Record<string, CsiEntry>
  npsMonthTotal: Record<string, number | null>
  csiMonthTotal: Record<string, CsiEntry>
  grandNPS: number | null
  grandCSI: number | null
  grandCats: Record<CsiField, number | null>
  comments: Comment[]
  totalResponses: number
}

const CSI_LABELS: Record<CsiField, string> = {
  lessons: 'Уроки',
  live: 'Живые',
  curator: 'Куратор',
  organization: 'Организация',
}

const CSI_NORMS: Record<CsiField, number> = {
  lessons: 0.88,
  live: 0.92,
  curator: 0.85,
  organization: 0.87,
}

// Тематические кластеры для анализа жалоб
const COMPLAINT_THEMES = [
  {
    id: 'curator',
    label: 'Куратор / обратная связь',
    keywords: ['куратор', 'обратн', 'провер', 'домашн', ' дз', 'дз ', 'проверк', 'ответ', 'не отвеча'],
    recommendations: [
      'Провести calibration-сессию с кураторами по стандарту обратной связи',
      'Установить норматив: ответ на ДЗ не позднее 24 часов',
      'Добавить шаблон проверки ДЗ с конкретными критериями оценки',
    ],
  },
  {
    id: 'live',
    label: 'Живые встречи / эфиры',
    keywords: ['живые', 'эфир', 'встреч', 'прямой', 'трансл', 'онлайн', 'запис эфир'],
    recommendations: [
      'Анонсировать даты эфиров минимум за 3 дня',
      'Записи выкладывать в течение 24 часов после эфира',
      'Добавить Q&A-сегмент в конце каждого эфира',
    ],
  },
  {
    id: 'lessons',
    label: 'Уроки / контент',
    keywords: ['урок', 'запис', 'видео', 'материал', 'лекц', 'контент', 'устарел', 'неактуал'],
    recommendations: [
      'Провести аудит уроков старше 3 месяцев, обновить устаревшее',
      'Добавить текстовые конспекты к ключевым урокам',
      'Ввести практические задания после каждого блока',
    ],
  },
  {
    id: 'organization',
    label: 'Организация / структура',
    keywords: ['организ', 'расписан', 'чат', 'структур', 'навигац', 'хаос', 'путан', 'непонятн', 'не понима'],
    recommendations: [
      'Упростить структуру чатов до 3–4 максимум',
      'Добавить навигацию и расписание в шапку чата',
      'Еженедельная сводка: что было, что будет на этой неделе',
    ],
  },
  {
    id: 'platform',
    label: 'Платформа / инструменты',
    keywords: ['платформ', 'инструмент', 'make', 'n8n', 'европ', 'недоступ', 'заблокир', 'альтернатив'],
    recommendations: [
      'Добавить урок по альтернативным платформам (Make, n8n и аналоги)',
      'Создать FAQ по часто встречающимся платформенным вопросам',
    ],
  },
  {
    id: 'value',
    label: 'Ценность / ожидания',
    keywords: ['ожидан', 'обещ', 'не то', 'не оправд', 'обман', 'по-другому', 'иначе', 'думал', 'рассчитыв'],
    recommendations: [
      'Усилить онбординг: конкретные кейсы результатов с цифрами',
      'Добавить чекпоинт прогресса на 2–3 неделе обучения',
      'Уточнить позиционирование программы до старта',
    ],
  },
  {
    id: 'pace',
    label: 'Темп / нагрузка',
    keywords: ['темп', 'нагрузк', 'слишком', 'быстро', 'медленн', 'успева', 'не успев', 'много', 'перегруз'],
    recommendations: [
      'Пересмотреть распределение материала по неделям',
      'Добавить опциональные модули для продвинутых участников',
      'Ввести дни «без новых заданий» для закрепления',
    ],
  },
]

type ThemeResult = { id: string; label: string; count: number; recommendations: string[]; quote: string | null }

function detectThemes(rows: Comment[]): ThemeResult[] {
  const detractors = rows.filter(r => r.nps !== null && r.nps <= 6 && r.comment)
  const counts: Record<string, number> = {}
  const quotes: Record<string, string | null> = {}

  for (const row of detractors) {
    const t = row.comment.toLowerCase()
    for (const theme of COMPLAINT_THEMES) {
      if (theme.keywords.some(kw => t.includes(kw))) {
        counts[theme.id] = (counts[theme.id] || 0) + 1
        if (!quotes[theme.id]) {
          // Вытащить цитату вокруг ключевого слова
          const kw = theme.keywords.find(k => t.includes(k))!
          const idx = t.indexOf(kw)
          const start = Math.max(0, idx - 15)
          const end = Math.min(row.comment.length, idx + 90)
          let snippet = row.comment.slice(start, end).trim()
          if (start > 0) snippet = '…' + snippet
          if (end < row.comment.length) snippet = snippet + '…'
          quotes[theme.id] = snippet
        }
      }
    }
  }
  return COMPLAINT_THEMES
    .filter(th => counts[th.id])
    .map(th => ({ id: th.id, label: th.label, count: counts[th.id], recommendations: th.recommendations, quote: quotes[th.id] ?? null }))
    .sort((a, b) => b.count - a.count)
}

// Возвращает только категории ниже нормы, не покрытые темами из комментариев
function csiGaps(csiData: Record<CsiField, number | null>, detectedThemeIds: string[]): { field: CsiField; label: string; value: number; norm: number }[] {
  const themeToField: Partial<Record<string, CsiField>> = {
    curator: 'curator', live: 'live', lessons: 'lessons', organization: 'organization',
  }
  return (Object.keys(CSI_NORMS) as CsiField[]).flatMap(field => {
    const v = csiData[field]
    if (v === null || v / 10 >= CSI_NORMS[field]) return []
    // Если тема уже покрывает эту категорию — не дублировать
    const covered = detectedThemeIds.some(id => themeToField[id] === field)
    if (covered) return []
    return [{ field, label: CSI_LABELS[field], value: Math.round(v * 10) / 10, norm: Math.round(CSI_NORMS[field] * 100) }]
  })
}

function pct(v: number | null, digits = 0): string {
  if (v === null) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

function score(v: number | null): string {
  if (v === null) return '—'
  return v.toFixed(1)
}

function npsColor(v: number | null): string {
  if (v === null) return 'bg-gray-50 text-gray-400'
  if (v >= 0.70) return 'bg-green-100 text-green-700'
  if (v >= 0.50) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

function csiColor(v: number | null): string {
  if (v === null) return 'bg-gray-50 text-gray-400'
  if (v >= 0.88) return 'bg-green-100 text-green-700'
  if (v >= 0.82) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

function typeColor(t: string | null) {
  if (t === 'promoter') return 'bg-green-100 text-green-700'
  if (t === 'passive') return 'bg-yellow-100 text-yellow-700'
  if (t === 'detractor') return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-500'
}

function typeLabel(t: string | null) {
  if (t === 'promoter') return 'Промоутер'
  if (t === 'passive') return 'Нейтральный'
  if (t === 'detractor') return 'Критик'
  return '—'
}

const BAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

// Mode: "by-month" — all products grouped by month; "by-product" — one product, bars = months
function NpsBarChart({ months, programs, npsMatrix, mode, selectedProgram }: {
  months: MonthEntry[]
  programs: string[]
  npsMatrix: Record<string, Record<string, number | null>>
  mode: 'by-month' | 'by-product'
  selectedProgram: string
}) {
  const W = 640
  const LEGEND_H = 28
  const chartH = 160
  const PAD = { top: 16, right: 20, bottom: 28, left: 44 }
  const H = PAD.top + chartH + PAD.bottom + LEGEND_H
  const chartW = W - PAD.left - PAD.right

  if (months.length === 0) return null

  // Build bars data
  type Bar = { label: string; value: number | null; color: string }
  type Group = { groupLabel: string; bars: Bar[] }
  let groups: Group[] = []

  if (mode === 'by-month') {
    groups = months.map(({ key, label }) => ({
      groupLabel: label,
      bars: programs.map((prog, pi) => ({
        label: prog,
        value: npsMatrix[prog]?.[key] ?? null,
        color: BAR_COLORS[pi % BAR_COLORS.length],
      })),
    }))
  } else {
    // one product across all months
    const prog = selectedProgram || programs[0]
    groups = months.map(({ key, label }) => ({
      groupLabel: label,
      bars: [{ label: prog, value: npsMatrix[prog]?.[key] ?? null, color: BAR_COLORS[0] }],
    }))
  }

  const groupW = chartW / Math.max(groups.length, 1)
  const barsPerGroup = mode === 'by-month' ? programs.length : 1
  const barW = Math.min(32, (groupW - 8) / Math.max(barsPerGroup, 1))

  const legendItems = mode === 'by-month'
    ? programs.map((p, i) => ({ label: p, color: BAR_COLORS[i % BAR_COLORS.length] }))
    : []

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      {/* Y gridlines */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = PAD.top + chartH - (v / 100) * chartH
        return (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#E5E7EB" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9CA3AF">{v}%</text>
          </g>
        )
      })}

      {/* Bars */}
      {groups.map(({ groupLabel, bars }, gi) => {
        const groupCenterX = PAD.left + gi * groupW + groupW / 2
        const groupStartX = groupCenterX - (bars.length * barW) / 2
        return (
          <g key={gi}>
            {bars.map((bar, bi) => {
              if (bar.value === null) return null
              const pctVal = Math.max(0, bar.value * 100)
              const bh = (pctVal / 100) * chartH
              const x = groupStartX + bi * barW
              const y = PAD.top + chartH - bh
              return (
                <g key={bi}>
                  <rect x={x} y={y} width={barW - 3} height={bh} fill={bar.color} rx="3" opacity="0.88" />
                  {bh > 16 && (
                    <text x={x + (barW - 3) / 2} y={y + 12} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">
                      {Math.round(pctVal)}
                    </text>
                  )}
                </g>
              )
            })}
            <text x={groupCenterX} y={PAD.top + chartH + 16} textAnchor="middle" fontSize="10" fill="#6B7280">{groupLabel}</text>
          </g>
        )
      })}

      {/* Legend (only in by-month mode) */}
      {legendItems.length > 0 && (() => {
        const itemW = 110
        const totalW = legendItems.length * itemW
        const startX = (W - totalW) / 2
        return legendItems.map((item, i) => (
          <g key={item.label} transform={`translate(${startX + i * itemW}, ${PAD.top + chartH + PAD.bottom + 6})`}>
            <rect width="10" height="10" fill={item.color} rx="2" y="0" />
            <text x="14" y="9" fontSize="9" fill="#6B7280">
              {item.label.length > 13 ? item.label.slice(0, 13) + '…' : item.label}
            </text>
          </g>
        ))
      })()}
    </svg>
  )
}

interface SelectedCell { prog: string; monthKey: string; monthLabel: string; focus: 'nps' | 'csi' }

function CellDetailPanel({
  cell,
  data,
  onClose,
}: {
  cell: SelectedCell
  data: NpsData
  onClose: () => void
}) {
  const { prog, monthKey, monthLabel, focus } = cell

  // find previous month
  const monthIdx = data.months.findIndex(m => m.key === monthKey)
  const prevMonth = monthIdx > 0 ? data.months[monthIdx - 1] : null

  function rowsFor(mo: string) {
    return data.comments.filter(c => c.program === prog && c.monthKey === mo)
  }

  function npsBreakdown(rows: Comment[]) {
    const withNps = rows.filter(r => r.nps !== null)
    const promoters = withNps.filter(r => r.nps! >= 9)
    const passives = withNps.filter(r => r.nps! >= 7 && r.nps! <= 8)
    const detractors = withNps.filter(r => r.nps! <= 6)
    const n = withNps.length
    return { promoters, passives, detractors, n }
  }

  function avgField(rows: Comment[], field: keyof Pick<Comment, 'lessons' | 'live' | 'curator' | 'organization'>) {
    const vals = rows.map(r => r[field]).filter((v): v is number => v !== null && v > 0)
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const curRows = rowsFor(monthKey)
  const prevRows = prevMonth ? rowsFor(prevMonth.key) : []
  const cur = npsBreakdown(curRows)
  const prev = prevMonth ? npsBreakdown(prevRows) : null

  const csiFields: (keyof Pick<Comment, 'lessons' | 'live' | 'curator' | 'organization'>)[] = ['lessons', 'live', 'curator', 'organization']
  const csiLabels: Record<string, string> = { lessons: 'Уроки', live: 'Живые', curator: 'Куратор', organization: 'Организация' }

  function delta(cur: number | null, prev: number | null) {
    if (cur === null || prev === null) return null
    return cur - prev
  }

  function DeltaBadge({ d, unit = '' }: { d: number | null; unit?: string }) {
    if (d === null) return null
    const sign = d > 0 ? '+' : ''
    const color = d > 0 ? 'text-green-600' : d < 0 ? 'text-red-500' : 'text-gray-400'
    return <span className={`text-xs font-semibold ml-1 ${color}`}>{sign}{d.toFixed(unit ? 1 : 0)}{unit}</span>
  }

  const curNPS = data.npsMatrix[prog]?.[monthKey] ?? null
  const prevNPS = prevMonth ? (data.npsMatrix[prog]?.[prevMonth.key] ?? null) : null
  const npsDelta = delta(curNPS !== null ? curNPS * 100 : null, prevNPS !== null ? prevNPS * 100 : null)

  // top detractors with comments
  const detractorComments = curRows.filter(r => r.nps !== null && r.nps <= 6 && r.comment).slice(0, 3)
  const promoterComments = curRows.filter(r => r.nps !== null && r.nps >= 9 && r.comment).slice(0, 3)

  // recommendations
  const themes = detectThemes(curRows)
  const curCsiData: Record<CsiField, number | null> = {
    lessons: avgField(curRows, 'lessons'),
    live: avgField(curRows, 'live'),
    curator: avgField(curRows, 'curator'),
    organization: avgField(curRows, 'organization'),
  }
  const gaps = csiGaps(curCsiData, themes.map(t => t.id))
  const hasRecs = themes.length > 0 || gaps.length > 0

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="w-[480px] bg-white border-l border-gray-200 overflow-y-auto shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="font-semibold text-gray-900 text-sm">{prog}</div>
            <div className="text-xs text-gray-400 mt-0.5">{monthLabel}{prevMonth ? ` vs ${prevMonth.label}` : ''}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5">✕</button>
        </div>

        <div className="px-5 py-4 space-y-5 flex-1">
          {(() => {
            const npsBlock = (
              <div key="nps">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">NPS</div>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-2xl font-bold px-3 py-1 rounded-lg ${npsColor(curNPS)}`}>
                    {curNPS !== null ? `${Math.round(curNPS * 100)}%` : '—'}
                  </span>
                  {prevNPS !== null && (
                    <span className="text-sm text-gray-400">
                      было {Math.round(prevNPS * 100)}%
                      <DeltaBadge d={npsDelta} unit="%" />
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">{cur.n} отв.</span>
                </div>
                {cur.n > 0 && (
                  <div className="space-y-1.5">
                    {[
                      { label: 'Промоутеры (9–10)', count: cur.promoters.length, prevCount: prev?.promoters.length ?? null, color: 'bg-green-400' },
                      { label: 'Нейтральные (7–8)', count: cur.passives.length, prevCount: prev?.passives.length ?? null, color: 'bg-yellow-300' },
                      { label: 'Критики (0–6)', count: cur.detractors.length, prevCount: prev?.detractors.length ?? null, color: 'bg-red-400' },
                    ].map(({ label, count, prevCount, color }) => {
                      const pct2 = cur.n > 0 ? Math.round(count / cur.n * 100) : 0
                      const prevPct = prev && prev.n > 0 && prevCount !== null ? Math.round(prevCount / prev.n * 100) : null
                      const d = prevPct !== null ? pct2 - prevPct : null
                      return (
                        <div key={label}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-gray-600">{label}</span>
                            <span className="text-xs font-semibold text-gray-700">
                              {count} ({pct2}%)
                              {prevPct !== null && <DeltaBadge d={d} unit="%" />}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct2}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )

            const csiBlock = (
              <div key="csi">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">CSI по категориям</div>
                <div className="space-y-2">
                  {csiFields.map(field => {
                    const cur2 = avgField(curRows, field)
                    const prev2 = prevRows.length > 0 ? avgField(prevRows, field) : null
                    const d = delta(cur2, prev2)
                    const pctVal = cur2 !== null ? cur2 / 10 : null
                    return (
                      <div key={field} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-24">{csiLabels[field]}</span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pctVal !== null && pctVal >= 0.88 ? 'bg-green-400' : pctVal !== null && pctVal >= 0.82 ? 'bg-yellow-300' : 'bg-red-400'}`}
                            style={{ width: `${pctVal !== null ? pctVal * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-10 text-right">
                          {cur2 !== null ? cur2.toFixed(1) : '—'}
                        </span>
                        {d !== null && <DeltaBadge d={d} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )

            return focus === 'nps' ? [npsBlock, csiBlock] : [csiBlock, npsBlock]
          })()}

          {detractorComments.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Причины снижения (критики)</div>
              <div className="space-y-2">
                {detractorComments.map(c => (
                  <div key={c.id} className="bg-red-50 rounded-lg px-3 py-2">
                    <div className="text-xs text-red-700 leading-snug">{c.comment}</div>
                    <div className="text-xs text-red-400 mt-1">{c.name || c.email} · NPS {c.nps}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {promoterComments.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Причины роста (промоутеры)</div>
              <div className="space-y-2">
                {promoterComments.map(c => (
                  <div key={c.id} className="bg-green-50 rounded-lg px-3 py-2">
                    <div className="text-xs text-green-800 leading-snug">{c.comment}</div>
                    <div className="text-xs text-green-500 mt-1">{c.name || c.email} · NPS {c.nps}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasRecs && (
            <div>
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">Что делать</div>
              <div className="space-y-4">
                {themes.map(theme => (
                  <div key={theme.id} className="border-l-2 border-blue-200 pl-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-800">{theme.label}</span>
                      <span className="text-xs text-red-400 ml-2 flex-shrink-0">{theme.count} {theme.count === 1 ? 'критик' : theme.count <= 4 ? 'критика' : 'критиков'}</span>
                    </div>
                    {theme.quote && (
                      <div className="text-xs text-gray-500 italic bg-gray-50 rounded px-2 py-1 mb-2 leading-snug">
                        «{theme.quote}»
                      </div>
                    )}
                    {theme.recommendations.slice(0, 2).map((rec, i) => (
                      <div key={i} className="flex gap-1.5 mb-1">
                        <span className="text-blue-400 flex-shrink-0">→</span>
                        <span className="text-xs text-gray-700">{rec}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {gaps.map(({ field, label, value, norm }) => (
                  <div key={field} className="border-l-2 border-yellow-300 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-800">{label}</span>
                      <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">
                        {value} из 10 · норма {norm}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Оценки ниже нормы, но жалобы не содержат явной причины — стоит провести короткий опрос или ретро с группой
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Matrix({
  title,
  programs,
  months,
  getCellValue,
  getTotalByProg,
  getTotalByMonth,
  grandTotal,
  colorFn,
  formatFn,
  onCellClick,
  onTotalClick,
}: {
  title: string
  programs: string[]
  months: MonthEntry[]
  getCellValue: (prog: string, mo: string) => number | null
  getTotalByProg: (prog: string) => number | null
  getTotalByMonth: (mo: string) => number | null
  grandTotal: number | null
  colorFn: (v: number | null) => string
  formatFn: (v: number | null) => string
  onCellClick?: (prog: string, monthKey: string, monthLabel: string) => void
  onTotalClick?: (monthKey: string, monthLabel: string) => void
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-2">{title}</h2>
      <div className="overflow-auto rounded-xl border border-gray-200">
        <table className="text-sm w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 sticky left-0 bg-gray-50 border-b border-gray-200 min-w-[180px]">Программа</th>
              {months.map(({ key, label }) => (
                <th key={key} className="text-center px-3 py-2.5 border-b border-gray-200 whitespace-nowrap min-w-[90px]">{label}</th>
              ))}
              <th className="text-center px-3 py-2.5 border-b border-gray-200 font-bold min-w-[80px]">Итого</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((prog) => (
              <tr key={prog} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 sticky left-0 bg-white font-medium text-gray-700 truncate max-w-[200px]" title={prog}>{prog}</td>
                {months.map(({ key, label }) => {
                  const v = getCellValue(prog, key)
                  const clickable = v !== null && onCellClick
                  return (
                    <td
                      key={key}
                      onClick={() => clickable && onCellClick(prog, key, label)}
                      className={`px-3 py-2.5 text-center font-semibold text-xs ${colorFn(v)} ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-blue-400 hover:z-10 relative' : ''}`}
                    >
                      {formatFn(v)}
                    </td>
                  )
                })}
                <td className={`px-3 py-2.5 text-center font-bold text-xs ${colorFn(getTotalByProg(prog))}`}>
                  {formatFn(getTotalByProg(prog))}
                </td>
              </tr>
            ))}
            <tr className="bg-blue-50 border-t-2 border-blue-200">
              <td className="px-4 py-2.5 sticky left-0 bg-blue-50 font-bold text-gray-700">Итого</td>
              {months.map(({ key, label }) => {
                const v = getTotalByMonth(key)
                const clickable = v !== null && onTotalClick
                return (
                  <td
                    key={key}
                    onClick={() => clickable && onTotalClick(key, label)}
                    className={`px-3 py-2.5 text-center font-bold text-xs ${colorFn(v)} ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-blue-500' : ''}`}
                  >
                    {formatFn(v)}
                  </td>
                )
              })}
              <td className={`px-3 py-2.5 text-center font-bold text-xs ${colorFn(grandTotal)}`}>
                {formatFn(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MonthTotalPanel({ monthKey, monthLabel, data, onClose }: {
  monthKey: string; monthLabel: string; data: NpsData; onClose: () => void
}) {
  const { programs, months, comments, npsMatrix, csiMatrix } = data
  const monthIdx = months.findIndex(m => m.key === monthKey)
  const prevMonth = monthIdx > 0 ? months[monthIdx - 1] : null

  const moRows = comments.filter(c => c.monthKey === monthKey)
  const prevRows = prevMonth ? comments.filter(c => c.monthKey === prevMonth.key) : []

  const csiFields: CsiField[] = ['lessons', 'live', 'curator', 'organization']

  function avgCatFor(rows: Comment[], field: CsiField) {
    const vals = rows.map(r => r[field]).filter((v): v is number => v !== null && v > 0)
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  // NPS по программам за этот месяц, отсортировано
  const progNps = programs
    .map(prog => ({ prog, nps: npsMatrix[prog]?.[monthKey] ?? null }))
    .filter(p => p.nps !== null)
    .sort((a, b) => (b.nps ?? 0) - (a.nps ?? 0))

  const moNPS = data.npsMonthTotal[monthKey] ?? null
  const prevNPS = prevMonth ? (data.npsMonthTotal[prevMonth.key] ?? null) : null
  const npsDelta = moNPS !== null && prevNPS !== null ? Math.round((moNPS - prevNPS) * 100) : null

  // Темы жалоб за этот месяц
  const themes = detectThemes(moRows)

  // CSI по категориям
  const curCsi = Object.fromEntries(csiFields.map(f => [f, avgCatFor(moRows, f)])) as Record<CsiField, number | null>
  const prevCsi = prevMonth ? Object.fromEntries(csiFields.map(f => [f, avgCatFor(prevRows, f)])) as Record<CsiField, number | null> : null

  const totalResponses = moRows.length
  const detractors = moRows.filter(r => r.nps !== null && r.nps <= 6).length
  const promoters = moRows.filter(r => r.nps !== null && r.nps >= 9).length

  function DeltaBadge({ d }: { d: number | null }) {
    if (d === null) return null
    const sign = d > 0 ? '+' : ''
    const color = d > 0 ? 'text-green-500' : d < 0 ? 'text-red-500' : 'text-gray-400'
    return <span className={`text-xs font-semibold ml-1.5 ${color}`}>{sign}{d.toFixed(d % 1 === 0 ? 0 : 1)}</span>
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div className="w-[480px] bg-white border-l border-gray-200 overflow-y-auto shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="font-semibold text-gray-900 text-sm">Итого · {monthLabel}</div>
            <div className="text-xs text-gray-400 mt-0.5">все программы · {totalResponses} ответов</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5">✕</button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Общий NPS */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">NPS за месяц</div>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-2xl font-bold px-3 py-1 rounded-lg ${npsColor(moNPS)}`}>
                {moNPS !== null ? `${Math.round(moNPS * 100)}%` : '—'}
              </span>
              {prevNPS !== null && (
                <span className="text-sm text-gray-400">
                  было {Math.round(prevNPS * 100)}%
                  <DeltaBadge d={npsDelta} />
                </span>
              )}
            </div>
            <div className="flex gap-4 text-xs text-gray-500">
              <span><span className="font-semibold text-green-600">{promoters}</span> промоутеров</span>
              <span><span className="font-semibold text-red-500">{detractors}</span> критиков</span>
              <span><span className="font-semibold text-gray-600">{totalResponses - promoters - detractors}</span> нейтральных</span>
            </div>
          </div>

          {/* NPS по программам */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">По программам</div>
            <div className="space-y-1.5">
              {progNps.map(({ prog, nps }) => {
                const prevProgNPS = prevMonth ? (npsMatrix[prog]?.[prevMonth.key] ?? null) : null
                const d = nps !== null && prevProgNPS !== null ? Math.round((nps - prevProgNPS) * 100) : null
                return (
                  <div key={prog} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-32 truncate" title={prog}>{prog}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${nps! >= 0.7 ? 'bg-green-400' : nps! >= 0.5 ? 'bg-yellow-300' : 'bg-red-400'}`}
                        style={{ width: `${Math.max(0, nps! * 100)}%` }} />
                    </div>
                    <span className={`text-xs font-bold w-10 text-right ${npsColor(nps).split(' ')[1]}`}>{Math.round(nps! * 100)}%</span>
                    {d !== null && <span className={`text-xs font-semibold w-10 ${d > 0 ? 'text-green-500' : d < 0 ? 'text-red-500' : 'text-gray-400'}`}>{d > 0 ? '+' : ''}{d}%</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* CSI */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">CSI по категориям</div>
            <div className="space-y-2">
              {csiFields.map(field => {
                const v = curCsi[field]
                const pv = prevCsi?.[field] ?? null
                const d = v !== null && pv !== null ? v - pv : null
                const pctVal = v !== null ? v / 10 : null
                const belowNorm = pctVal !== null && pctVal < CSI_NORMS[field]
                return (
                  <div key={field} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-24">{CSI_LABELS[field]}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pctVal !== null && pctVal >= 0.88 ? 'bg-green-400' : pctVal !== null && pctVal >= 0.82 ? 'bg-yellow-300' : 'bg-red-400'}`}
                        style={{ width: `${pctVal !== null ? pctVal * 100 : 0}%` }} />
                    </div>
                    <span className={`text-xs font-semibold w-8 text-right ${belowNorm ? 'text-red-500' : 'text-gray-700'}`}>
                      {v !== null ? v.toFixed(1) : '—'}
                    </span>
                    {d !== null && <span className={`text-xs font-semibold w-8 ${d > 0.1 ? 'text-green-500' : d < -0.1 ? 'text-red-500' : 'text-gray-400'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}
                    {belowNorm && <span className="text-xs text-red-400">↓ норма {Math.round(CSI_NORMS[field] * 100)}%</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Темы жалоб */}
          {themes.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Что критикуют</div>
              <div className="space-y-3">
                {themes.map(theme => (
                  <div key={theme.id} className="border-l-2 border-red-200 pl-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-800">{theme.label}</span>
                      <span className="text-xs text-red-400">{theme.count} {theme.count === 1 ? 'критик' : theme.count <= 4 ? 'критика' : 'критиков'}</span>
                    </div>
                    {theme.quote && (
                      <div className="text-xs text-gray-500 italic bg-gray-50 rounded px-2 py-1 mb-1.5 leading-snug">«{theme.quote}»</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Рекомендации */}
          {themes.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">Что делать</div>
              <div className="space-y-3">
                {themes.slice(0, 3).map(theme => (
                  <div key={theme.id} className="border-l-2 border-blue-200 pl-3">
                    <div className="text-xs font-semibold text-gray-700 mb-1">{theme.label}</div>
                    {theme.recommendations.slice(0, 2).map((rec, i) => (
                      <div key={i} className="flex gap-1.5 mb-1">
                        <span className="text-blue-400 flex-shrink-0">→</span>
                        <span className="text-xs text-gray-700">{rec}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TrendsSection({ data }: { data: NpsData }) {
  const { programs, months, comments, npsMatrix, csiMatrix } = data
  if (months.length < 2) return null

  const csiFields: CsiField[] = ['lessons', 'live', 'curator', 'organization']

  // Повторяющиеся жалобы: темы в отзывах критиков по месяцам
  type MonthThemes = Record<string, Set<string>> // monthKey → set of theme ids
  const themesByMonth: MonthThemes = {}
  for (const mo of months) {
    const moComments = comments.filter(c => c.monthKey === mo.key)
    const detected = detectThemes(moComments)
    themesByMonth[mo.key] = new Set(detected.map(t => t.id))
  }
  const repeatingThemes = COMPLAINT_THEMES.filter(th =>
    Object.values(themesByMonth).filter(s => s.has(th.id)).length >= 2
  ).map(th => ({
    ...th,
    monthCount: Object.values(themesByMonth).filter(s => s.has(th.id)).length,
  }))

  // Динамика CSI по категориям: последние 2 месяца
  const lastMo = months[months.length - 1]
  const prevMo = months[months.length - 2]

  function avgCat(mo: string, field: CsiField): number | null {
    const vals = comments
      .filter(c => c.monthKey === mo && c[field] !== null && (c[field] as number) > 0)
      .map(c => c[field] as number)
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  function trendIcon(cur: number | null, prev: number | null) {
    if (cur === null || prev === null) return <span className="text-gray-300">—</span>
    const d = cur - prev
    if (d > 0.2) return <span className="text-green-500 font-bold">↑</span>
    if (d < -0.2) return <span className="text-red-500 font-bold">↓</span>
    return <span className="text-gray-400">→</span>
  }

  function npsTrendIcon(prog: string) {
    const cur = npsMatrix[prog]?.[lastMo.key] ?? null
    const prev = npsMatrix[prog]?.[prevMo.key] ?? null
    if (cur === null || prev === null) return <span className="text-gray-300">—</span>
    const d = (cur - prev) * 100
    if (d > 2) return <span className="text-green-500 font-bold">↑ +{Math.round(d)}%</span>
    if (d < -2) return <span className="text-red-500 font-bold">↓ {Math.round(d)}%</span>
    return <span className="text-gray-400">→ стабильно</span>
  }

  // Общие рекомендации по всей базе
  const globalThemes = detectThemes(comments)
  const lastMoCsi: Record<CsiField, number | null> = {
    lessons: avgCat(lastMo.key, 'lessons'),
    live: avgCat(lastMo.key, 'live'),
    curator: avgCat(lastMo.key, 'curator'),
    organization: avgCat(lastMo.key, 'organization'),
  }
  const globalGaps = csiGaps(lastMoCsi, globalThemes.map(t => t.id))

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold text-gray-700">Тренды и аналитика</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Повторяющиеся жалобы */}
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-3">
            Повторяющиеся жалобы
          </div>
          {repeatingThemes.length === 0 ? (
            <div className="text-xs text-gray-400">Устойчивых жалоб не выявлено</div>
          ) : (
            <div className="space-y-2.5">
              {repeatingThemes.map(th => (
                <div key={th.id}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-gray-700">{th.label}</span>
                    <span className="text-xs text-red-400">{th.monthCount} мес.</span>
                  </div>
                  <div className="h-1.5 bg-red-50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-300 rounded-full"
                      style={{ width: `${Math.min(100, th.monthCount / months.length * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Динамика CSI и NPS по программам */}
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Динамика {prevMo.label} → {lastMo.label}
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1 pr-2">Программа</th>
                  <th className="text-center py-1 px-1">NPS</th>
                  {csiFields.map(f => (
                    <th key={f} className="text-center py-1 px-1">{CSI_LABELS[f].slice(0, 3)}.</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {programs.map(prog => (
                  <tr key={prog} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2 font-medium text-gray-700 truncate max-w-[100px]" title={prog}>
                      {prog.length > 12 ? prog.slice(0, 12) + '…' : prog}
                    </td>
                    <td className="py-1.5 px-1 text-center text-xs">{npsTrendIcon(prog)}</td>
                    {csiFields.map(f => {
                      const cur = avgCat(lastMo.key, f)
                      const prev2 = avgCat(prevMo.key, f)
                      // filter to this program
                      const curP = (() => {
                        const vals = comments.filter(c => c.program === prog && c.monthKey === lastMo.key && c[f] !== null && (c[f] as number) > 0).map(c => c[f] as number)
                        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
                      })()
                      const prevP = (() => {
                        const vals = comments.filter(c => c.program === prog && c.monthKey === prevMo.key && c[f] !== null && (c[f] as number) > 0).map(c => c[f] as number)
                        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
                      })()
                      return <td key={f} className="py-1.5 px-1 text-center">{trendIcon(curP, prevP)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-xs text-gray-400">↑ рост &gt;0.2 · → стабильно · ↓ снижение</div>
          </div>
        </div>

        {/* Рекомендации на основе всей базы */}
        <div className="border border-blue-100 bg-blue-50 rounded-xl p-4">
          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">
            Приоритеты на следующий месяц
          </div>
          {globalGaps.length === 0 && globalThemes.length === 0 ? (
            <div className="text-xs text-blue-400">Все показатели в норме</div>
          ) : (
            <div className="space-y-3">
              {globalThemes.slice(0, 3).map(theme => (
                <div key={theme.id} className="border-l-2 border-blue-300 pl-2">
                  <div className="text-xs text-blue-700 font-semibold mb-1">
                    {theme.label} <span className="font-normal text-blue-400">· {theme.count} упом.</span>
                  </div>
                  {theme.recommendations.slice(0, 1).map((rec, i) => (
                    <div key={i} className="flex gap-1.5">
                      <span className="text-blue-400 flex-shrink-0">→</span>
                      <span className="text-xs text-blue-800">{rec}</span>
                    </div>
                  ))}
                </div>
              ))}
              {globalGaps.map(({ field, label, value, norm }) => (
                <div key={field} className="flex gap-2">
                  <span className="text-yellow-500 flex-shrink-0">→</span>
                  <span className="text-xs text-blue-800">{label}: {value}/10 (норма {norm}%) — провести ретро с группой</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function NpsPage() {
  const router = useRouter()
  const [data, setData] = useState<NpsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [commentFilter, setCommentFilter] = useState({ program: '', month: '', type: '' })
  const [showComments, setShowComments] = useState(true)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [monthTotal, setMonthTotal] = useState<{ monthKey: string; monthLabel: string } | null>(null)
  const [chartMode, setChartMode] = useState<'by-month' | 'by-product'>('by-month')
  const [chartProduct, setChartProduct] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  function loadData() {
    return fetch('/api/nps').then(r => {
      if (r.status === 401) { router.push('/login'); return null }
      return r.ok ? r.json() : null
    }).then(d => {
      if (d) setData(d)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [router])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportResult(null)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/nps/import', { method: 'POST', body: formData })
    const json = await res.json()
    if (res.ok) {
      setImportResult(`Импортировано: ${json.imported}, пропущено: ${json.skipped}`)
      setLoading(true)
      loadData()
    } else {
      setImportResult(`Ошибка: ${json.error}`)
    }
    setImporting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-gray-400">
        Загрузка...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      <header className="border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← Дашборд</a>
          <h1 className="font-semibold text-gray-900">NPS & CSI</h1>
          {data && (
            <span className="text-xs text-gray-400">{data.totalResponses} ответов</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {importResult && (
            <span className="text-xs text-gray-500">{importResult}</span>
          )}
          <label className={`text-sm border px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${importing ? 'opacity-50 pointer-events-none border-gray-300 text-gray-400' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}>
            {importing ? 'Импорт...' : 'Импорт CSV'}
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importing} />
          </label>
          {data && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-400">NPS общий</span>
                <span className={`font-bold text-base px-2 py-0.5 rounded ${npsColor(data.grandNPS)}`}>{pct(data.grandNPS)}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-400">CSI общий</span>
                <span className={`font-bold text-base px-2 py-0.5 rounded ${csiColor(data.grandCSI)}`}>{pct(data.grandCSI)}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-8">
        {!data || data.totalResponses === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-4xl mb-4">📊</div>
            <div className="text-lg font-medium mb-2">Данных пока нет</div>
            <div className="text-sm">Импортируйте CSV с данными NPS/CSI через кнопку «Импорт CSV»</div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(Object.entries(CSI_LABELS) as [CsiField, string][]).map(([field, label]) => {
                const v = data.grandCats[field]
                const pctVal = v !== null ? v / 10 : null
                return (
                  <div key={field} className={`rounded-xl border p-4 ${csiColor(pctVal)}`}>
                    <div className="text-xs font-medium opacity-70 mb-1">{label}</div>
                    <div className="text-2xl font-bold">{score(v)}</div>
                    <div className="text-xs opacity-60">из 10</div>
                  </div>
                )
              })}
            </div>

            {/* NPS matrix */}
            <Matrix
              title="NPS — готовность рекомендовать"
              programs={data.programs}
              months={data.months}
              getCellValue={(prog, mo) => data.npsMatrix[prog]?.[mo] ?? null}
              getTotalByProg={(prog) => data.npsTotal[prog] ?? null}
              getTotalByMonth={(mo) => data.npsMonthTotal[mo] ?? null}
              grandTotal={data.grandNPS}
              colorFn={npsColor}
              formatFn={pct}
              onCellClick={(prog, key, label) => setSelectedCell({ prog, monthKey: key, monthLabel: label, focus: 'nps' })}
              onTotalClick={(key, label) => setMonthTotal({ monthKey: key, monthLabel: label })}
            />

            {/* CSI matrix */}
            <Matrix
              title="CSI — удовлетворённость (общий)"
              programs={data.programs}
              months={data.months}
              getCellValue={(prog, mo) => data.csiMatrix[prog]?.[mo]?.overall ?? null}
              getTotalByProg={(prog) => data.csiTotal[prog]?.overall ?? null}
              getTotalByMonth={(mo) => data.csiMonthTotal[mo]?.overall ?? null}
              grandTotal={data.grandCSI}
              colorFn={csiColor}
              formatFn={pct}
              onCellClick={(prog, key, label) => setSelectedCell({ prog, monthKey: key, monthLabel: label, focus: 'csi' })}
              onTotalClick={(key, label) => setMonthTotal({ monthKey: key, monthLabel: label })}
            />

            {/* Bar chart */}
            {data.months.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-gray-700">График NPS</h2>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                    <button
                      onClick={() => setChartMode('by-month')}
                      className={`px-3 py-1.5 transition-colors ${chartMode === 'by-month' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                    >По месяцам</button>
                    <button
                      onClick={() => setChartMode('by-product')}
                      className={`px-3 py-1.5 transition-colors border-l border-gray-200 ${chartMode === 'by-product' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                    >По продукту</button>
                  </div>
                  {chartMode === 'by-product' && (
                    <select
                      value={chartProduct || data.programs[0]}
                      onChange={e => setChartProduct(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-blue-500"
                    >
                      {data.programs.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  )}
                </div>
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <NpsBarChart
                    months={data.months}
                    programs={data.programs}
                    npsMatrix={data.npsMatrix}
                    mode={chartMode}
                    selectedProgram={chartProduct || data.programs[0]}
                  />
                </div>
              </div>
            )}

            {/* Trends */}
            <TrendsSection data={data} />

            {/* Comments */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">
                  Комментарии
                  <span className="ml-2 text-gray-400 font-normal text-xs">
                    {data.comments.filter(c => {
                      if (commentFilter.program && c.program !== commentFilter.program) return false
                      if (commentFilter.month && c.monthKey !== commentFilter.month) return false
                      if (commentFilter.type && c.type !== commentFilter.type) return false
                      return true
                    }).length} из {data.comments.length}
                  </span>
                </h2>
                <button
                  onClick={() => setShowComments(!showComments)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >{showComments ? '▾ Скрыть' : '▸ Показать'}</button>
              </div>

              {showComments && (
                <>
                  {/* Filters */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <select
                      value={commentFilter.program}
                      onChange={e => setCommentFilter(f => ({ ...f, program: e.target.value }))}
                      className="bg-white border border-gray-300 text-sm rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Все программы</option>
                      {data.programs.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select
                      value={commentFilter.month}
                      onChange={e => setCommentFilter(f => ({ ...f, month: e.target.value }))}
                      className="bg-white border border-gray-300 text-sm rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Все месяцы</option>
                      {data.months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                    <select
                      value={commentFilter.type}
                      onChange={e => setCommentFilter(f => ({ ...f, type: e.target.value }))}
                      className="bg-white border border-gray-300 text-sm rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Все типы</option>
                      <option value="promoter">Промоутеры (9–10)</option>
                      <option value="passive">Нейтральные (7–8)</option>
                      <option value="detractor">Критики (0–6)</option>
                    </select>
                    {(commentFilter.program || commentFilter.month || commentFilter.type) && (
                      <button
                        onClick={() => setCommentFilter({ program: '', month: '', type: '' })}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >Сбросить</button>
                    )}
                  </div>

                  <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: 500 }}>
                    <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide sticky top-0">
                          <th className="text-left px-4 py-2.5 border-b border-gray-200">Участник</th>
                          <th className="text-left px-4 py-2.5 border-b border-gray-200">Программа</th>
                          <th className="text-left px-4 py-2.5 border-b border-gray-200">Месяц</th>
                          <th className="text-center px-3 py-2.5 border-b border-gray-200">NPS</th>
                          <th className="text-center px-3 py-2.5 border-b border-gray-200">Уроки</th>
                          <th className="text-center px-3 py-2.5 border-b border-gray-200">Живые</th>
                          <th className="text-center px-3 py-2.5 border-b border-gray-200">Куратор</th>
                          <th className="text-center px-3 py-2.5 border-b border-gray-200">Орг.</th>
                          <th className="text-left px-4 py-2.5 border-b border-gray-200">Тип</th>
                          <th className="text-left px-4 py-2.5 border-b border-gray-200">Комментарий</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.comments.filter(c => {
                          if (commentFilter.program && c.program !== commentFilter.program) return false
                          if (commentFilter.month && c.monthKey !== commentFilter.month) return false
                          if (commentFilter.type && c.type !== commentFilter.type) return false
                          return true
                        }).map((c) => (
                          <tr key={c.id || `${c.email}-${c.program}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <div className="text-gray-800 font-medium text-xs">{c.name || '—'}</div>
                              <div className="text-gray-400 text-xs">{c.email}</div>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[140px] truncate" title={c.program}>{c.program}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{c.month}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${typeColor(c.type)}`}>{c.nps ?? '—'}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-600">{score(c.lessons)}</td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-600">{score(c.live)}</td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-600">{score(c.curator)}</td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-600">{score(c.organization)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${typeColor(c.type)}`}>{typeLabel(c.type)}</span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[300px]">
                              <span className="line-clamp-3" title={c.comment}>{c.comment || '—'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>

      {selectedCell && data && (
        <CellDetailPanel
          cell={selectedCell}
          data={data}
          onClose={() => setSelectedCell(null)}
        />
      )}
      {monthTotal && data && (
        <MonthTotalPanel
          monthKey={monthTotal.monthKey}
          monthLabel={monthTotal.monthLabel}
          data={data}
          onClose={() => setMonthTotal(null)}
        />
      )}
    </div>
  )
}
