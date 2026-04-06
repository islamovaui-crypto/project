'use client'
import { useState, useEffect, useCallback } from 'react'

interface Survey { id: string; gcId: string; name: string; type: string; _count: { answers: number } }
interface Answer {
  id: string
  userId: string
  questionId: string
  question: string | null
  answer: string | null
  answeredAt: string | null
  user: { id: string; email: string; firstName: string; lastName: string }
}

function downloadCSV(answers: Answer[], surveyName: string) {
  const headers = ['user_id', 'Email', 'Вопрос', 'Ответ', 'Дата']
  const rows = answers.map((a) => [
    a.userId, a.user?.email, a.question || a.questionId, a.answer || '',
    a.answeredAt ? new Date(a.answeredAt).toLocaleDateString('ru-RU') : '',
  ])
  const csv = [headers, ...rows].map((r) => r.map(String).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `survey_${surveyName}.csv`; a.click()
  URL.revokeObjectURL(url)
}

export default function SurveysTab({ productIds }: { productIds: string[] }) {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [filterAnswer, setFilterAnswer] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams()
    for (const pid of productIds) params.append('productId', pid)
    fetch('/api/surveys?' + params).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setSurveys(d.surveys)
    })
  }, [productIds])

  const loadAnswers = useCallback(async () => {
    if (!selectedSurvey) return
    setLoading(true)
    const params = new URLSearchParams({ surveyId: selectedSurvey.gcId, page: String(page) })
    if (filterAnswer) params.set('answer', filterAnswer)
    const res = await fetch('/api/surveys?' + params)
    if (res.ok) {
      const data = await res.json()
      setAnswers(data.answers)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [selectedSurvey, page, filterAnswer])

  useEffect(() => { loadAnswers() }, [loadAnswers])
  useEffect(() => { setPage(1) }, [selectedSurvey, filterAnswer])

  return (
    <div className="space-y-4">
      {/* Survey selector */}
      <div className="flex items-start gap-4">
        <div className="w-64 space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Анкеты</p>
          {surveys.length === 0 ? (
            <p className="text-sm text-gray-400">Нет анкет. Загрузите CSV или настройте webhooks.</p>
          ) : surveys.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSurvey(s)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${selectedSurvey?.id === s.id ? 'bg-blue-50 text-blue-600 border border-blue-500/30' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s._count.answers} ответов · {s.type}</div>
            </button>
          ))}
        </div>

        {selectedSurvey ? (
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Фильтр по ответу..."
                  value={filterAnswer}
                  onChange={(e) => setFilterAnswer(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-56"
                />
                <span className="text-sm text-gray-500">{total} ответов</span>
              </div>
              <button onClick={() => downloadCSV(answers, selectedSurvey.name)} className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-2 rounded-lg transition-colors">↓ CSV</button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Участник</th>
                    <th className="text-left px-4 py-3">Вопрос</th>
                    <th className="text-left px-4 py-3">Ответ</th>
                    <th className="text-left px-4 py-3">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} className="text-center py-12 text-gray-400">Загрузка...</td></tr>
                  ) : answers.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-12 text-gray-400">Нет ответов</td></tr>
                  ) : answers.map((a) => (
                    <tr key={a.id} className="border-b border-gray-200 hover:bg-gray-100 transition-colors">
                      <td className="px-4 py-3 text-gray-800">{a.user?.email || a.userId}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{a.question || a.questionId}</td>
                      <td className="px-4 py-3 text-gray-800">{a.answer || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{a.answeredAt ? new Date(a.answeredAt).toLocaleDateString('ru-RU') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:border-gray-400 transition-colors">←</button>
                <span className="text-sm text-gray-500">{page} / {pages}</span>
                <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:border-gray-400 transition-colors">→</button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Выберите анкету слева
          </div>
        )}
      </div>
    </div>
  )
}
