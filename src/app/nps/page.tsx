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

function NpsBarChart({ data, months, programs, npsMatrix }: {
  data: NpsData
  months: MonthEntry[]
  programs: string[]
  npsMatrix: Record<string, Record<string, number | null>>
}) {
  const BAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
  const W = 600
  const H = 200
  const PAD = { top: 20, right: 20, bottom: 40, left: 44 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  if (months.length === 0) return null

  const groupW = chartW / months.length
  const barW = Math.min(24, (groupW - 8) / Math.max(programs.length, 1))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* Y axis lines and labels */}
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
      {months.map(({ key, label }, mi) => {
        const groupX = PAD.left + mi * groupW + groupW / 2
        const groupStartX = groupX - (programs.length * barW) / 2
        return (
          <g key={key}>
            {programs.map((prog, pi) => {
              const v = npsMatrix[prog]?.[key]
              if (v === null || v === undefined) return null
              const pctVal = Math.max(0, v * 100)
              const barH = (pctVal / 100) * chartH
              const x = groupStartX + pi * barW
              const y = PAD.top + chartH - barH
              return (
                <g key={prog}>
                  <rect x={x} y={y} width={barW - 2} height={barH} fill={BAR_COLORS[pi % BAR_COLORS.length]} rx="2" opacity="0.85" />
                  {barH > 16 && (
                    <text x={x + barW / 2 - 1} y={y + 12} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">
                      {Math.round(pctVal)}
                    </text>
                  )}
                </g>
              )
            })}
            <text x={groupX} y={H - 6} textAnchor="middle" fontSize="10" fill="#6B7280">{label}</text>
          </g>
        )
      })}
      {/* Legend */}
      {programs.slice(0, 6).map((prog, pi) => (
        <g key={prog} transform={`translate(${PAD.left + pi * 100}, ${H - PAD.bottom + 22})`}>
          <rect width="10" height="10" fill={BAR_COLORS[pi % BAR_COLORS.length]} rx="2" />
          <text x="14" y="9" fontSize="9" fill="#6B7280">{prog.length > 12 ? prog.slice(0, 12) + '…' : prog}</text>
        </g>
      ))}
    </svg>
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
            {programs.map((prog, i) => (
              <tr key={prog} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 sticky left-0 bg-white font-medium text-gray-700 truncate max-w-[200px]" title={prog}>{prog}</td>
                {months.map(({ key }) => {
                  const v = getCellValue(prog, key)
                  return (
                    <td key={key} className={`px-3 py-2.5 text-center font-semibold text-xs ${colorFn(v)}`}>
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
              {months.map(({ key }) => {
                const v = getTotalByMonth(key)
                return (
                  <td key={key} className={`px-3 py-2.5 text-center font-bold text-xs ${colorFn(v)}`}>
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

export default function NpsPage() {
  const router = useRouter()
  const [data, setData] = useState<NpsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [commentFilter, setCommentFilter] = useState({ program: '', month: '', type: '' })
  const [showComments, setShowComments] = useState(true)
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
            />

            {/* Bar chart */}
            {data.months.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3">График NPS по месяцам</h2>
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <NpsBarChart
                    data={data}
                    months={data.months}
                    programs={data.programs}
                    npsMatrix={data.npsMatrix}
                  />
                </div>
              </div>
            )}

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
    </div>
  )
}
