'use client'
import { useState, useEffect, useCallback } from 'react'

interface Order {
  id: string
  productTitle: string
  productId: string
  isPaid: boolean
  status: string
  amount: number | null
}

interface GcUser {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string
  tags: string[]
  gcCreatedAt: string | null
  orders: Order[]
  _count: { orders: number; lessonProgress: number; surveyAnswers: number }
}

function downloadCSV(users: GcUser[]) {
  const headers = ['ID', 'Email', 'Имя', 'Фамилия', 'Телефон', 'Продукты', 'Оплачено', 'Заказы', 'Уроки']
  const rows = users.map((u) => [
    u.id,
    u.email,
    u.firstName,
    u.lastName,
    u.phone,
    u.orders.map((o) => o.productTitle).join('; '),
    u.orders.filter((o) => o.isPaid).length,
    u._count.orders,
    u._count.lessonProgress,
  ])
  const csv = [headers, ...rows].map((r) => r.map(String).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'participants.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function UsersTab({ productId }: { productId: string }) {
  const [users, setUsers] = useState<GcUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [hasOrders, setHasOrders] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), search })
    if (productId) params.set('productId', productId)
    if (hasOrders !== '') params.set('hasOrders', hasOrders)
    const res = await fetch('/api/users?' + params)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [page, search, productId, hasOrders])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, productId, hasOrders])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Поиск по ID, email, имени..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
          />
          <select
            value={hasOrders}
            onChange={(e) => setHasOrders(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">Все участники</option>
            <option value="true">Есть заказы</option>
            <option value="false">Без заказов</option>
          </select>
          <span className="text-sm text-gray-400">{total.toLocaleString('ru-RU')} участников</span>
        </div>
        <button
          onClick={() => downloadCSV(users)}
          className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2 rounded-lg transition-colors"
        >↓ CSV</button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Имя</th>
              <th className="text-left px-4 py-3">Продукт(ы)</th>
              <th className="text-center px-4 py-3">Оплачено</th>
              <th className="text-right px-4 py-3">Уроки</th>
              <th className="text-right px-4 py-3">Анкеты</th>
              <th className="text-left px-4 py-3">ID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">Загрузка...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">Нет данных. Нажмите «Синхронизировать».</td></tr>
            ) : (
              users.map((u) => {
                const paidOrders = u.orders.filter((o) => o.isPaid)
                return (
                  <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-gray-200">{u.email || <span className="text-gray-600 italic">нет email</span>}</td>
                    <td className="px-4 py-3 text-gray-300">{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3">
                      {u.orders.length === 0 ? (
                        <span className="text-gray-600 text-xs">нет заказов</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {u.orders.slice(0, 2).map((o) => (
                            <span key={o.id} className={`text-xs px-2 py-0.5 rounded-full w-fit ${o.isPaid ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                              {o.productTitle || '—'}
                            </span>
                          ))}
                          {u.orders.length > 2 && <span className="text-xs text-gray-500">+{u.orders.length - 2}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {paidOrders.length > 0
                        ? <span className="text-green-400 font-medium">{paidOrders.length}</span>
                        : <span className="text-gray-600">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{u._count.lessonProgress || 0}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{u._count.surveyAnswers || 0}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{u.id}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border border-gray-700 rounded-lg disabled:opacity-40 hover:border-gray-500 transition-colors">←</button>
          <span className="text-sm text-gray-400">{page} / {pages}</span>
          <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border border-gray-700 rounded-lg disabled:opacity-40 hover:border-gray-500 transition-colors">→</button>
        </div>
      )}
    </div>
  )
}
