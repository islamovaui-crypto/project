'use client'
import { useState, useEffect, useCallback } from 'react'

interface Progress {
  id: string
  userId: string
  lessonId: string
  lessonTitle: string | null
  opened: boolean
  completed: boolean
  lastActivity: string | null
  source: string
  user: { id: string; email: string; firstName: string; lastName: string }
}

function downloadCSV(rows: Progress[]) {
  const headers = ['user_id', 'Email', 'Урок', 'Открыт', 'Завершён', 'Последняя активность', 'Источник']
  const data = rows.map((r) => [
    r.userId, r.user?.email, r.lessonTitle || r.lessonId,
    r.opened ? '1' : '0', r.completed ? '1' : '0',
    r.lastActivity ? new Date(r.lastActivity).toLocaleDateString('ru-RU') : '',
    r.source,
  ])
  const csv = [headers, ...data].map((r) => r.map(String).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'progress.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function ProgressTab({ productIds }: { productIds: string[] }) {
  const [rows, setRows] = useState<Progress[]>([])
  const [total, setTotal] = useState(0)
  const [notStarted, setNotStarted] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [completed, setCompleted] = useState<string>('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), search })
    for (const pid of productIds) params.append('productId', pid)
    if (completed !== '') params.set('completed', completed)
    const res = await fetch('/api/progress?' + params)
    if (res.ok) {
      const data = await res.json()
      setRows(data.progress)
      setTotal(data.total)
      setPages(data.pages)
      setNotStarted(data.stats?.notStarted ?? 0)
    }
    setLoading(false)
  }, [page, productIds, completed, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [productIds, completed, search])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Записей о прогрессе</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{total}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Не начали</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{notStarted}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Источник</p>
          <p className="text-sm text-gray-500 mt-2">Webhook + CSV</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Поиск по email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-60"
          />
          <select
            value={completed}
            onChange={(e) => setCompleted(e.target.value)}
            className="bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:border-blue-500"
          >
            <option value="">Все</option>
            <option value="true">Завершили</option>
            <option value="false">Не завершили</option>
          </select>
        </div>
        <button onClick={() => downloadCSV(rows)} className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-2 rounded-lg transition-colors">↓ CSV</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Участник</th>
              <th className="text-left px-4 py-3">Урок</th>
              <th className="text-center px-4 py-3">Открыт</th>
              <th className="text-center px-4 py-3">Завершён</th>
              <th className="text-left px-4 py-3">Активность</th>
              <th className="text-left px-4 py-3">Источник</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Загрузка...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Нет данных. Загрузите CSV или настройте webhooks в GetCourse.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-200 hover:bg-gray-100 transition-colors">
                <td className="px-4 py-3 text-gray-800">{r.user?.email || r.userId}</td>
                <td className="px-4 py-3 text-gray-600">{r.lessonTitle || r.lessonId}</td>
                <td className="px-4 py-3 text-center">{r.opened ? <span className="text-green-600">✓</span> : <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-3 text-center">{r.completed ? <span className="text-green-600">✓</span> : <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.lastActivity ? new Date(r.lastActivity).toLocaleDateString('ru-RU') : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.source === 'webhook' ? 'bg-blue-50 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>{r.source}</span>
                </td>
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
  )
}
