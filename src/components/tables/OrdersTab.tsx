'use client'
import { useState, useEffect, useCallback } from 'react'

interface Order {
  id: string
  dealNumber: string
  userId: string
  productTitle: string
  amount: number | null
  status: string
  isPaid: boolean
  gcCreatedAt: string | null
  user: { email: string; firstName: string; lastName: string }
}

interface Stats { total: number; paid: number; totalAmount: number }

const STATUS_LABELS: Record<string, string> = {
  payed: 'Оплачен', new: 'Новый', cancelled: 'Отменён',
  in_work: 'В работе', payment_waiting: 'Ожидает оплаты',
  part_payed: 'Частично', not_confirmed: 'Не подтверждён',
}

function downloadCSV(orders: Order[]) {
  const headers = ['ID', 'Номер', 'Email', 'Продукт', 'Сумма', 'Статус', 'Дата']
  const rows = orders.map((o) => [
    o.id, o.dealNumber, o.user?.email, o.productTitle,
    o.amount ?? '', o.status, o.gcCreatedAt ? new Date(o.gcCreatedAt).toLocaleDateString('ru-RU') : '',
  ])
  const csv = [headers, ...rows].map((r) => r.map(String).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'orders.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function OrdersTab({ productId }: { productId: string }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, paid: 0, totalAmount: 0 })
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [isPaid, setIsPaid] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (productId) params.set('productId', productId)
    if (isPaid !== '') params.set('isPaid', isPaid)
    const res = await fetch('/api/orders?' + params)
    if (res.ok) {
      const data = await res.json()
      setOrders(data.orders)
      setStats(data.stats)
      setPages(data.pages)
    }
    setLoading(false)
  }, [page, productId, isPaid])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [productId, isPaid])

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Всего заказов', value: stats.total },
          { label: 'Оплачено', value: stats.paid },
          { label: 'Выручка', value: stats.totalAmount.toLocaleString('ru-RU') + ' ₽' },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-semibold text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <select
          value={isPaid}
          onChange={(e) => setIsPaid(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">Все статусы</option>
          <option value="true">Оплачено</option>
          <option value="false">Не оплачено</option>
        </select>
        <button
          onClick={() => downloadCSV(orders)}
          className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2 rounded-lg transition-colors"
        >↓ CSV</button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">ID заказа</th>
              <th className="text-left px-4 py-3">Участник</th>
              <th className="text-left px-4 py-3">Продукт</th>
              <th className="text-right px-4 py-3">Сумма</th>
              <th className="text-left px-4 py-3">Статус</th>
              <th className="text-left px-4 py-3">Дата</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-500">Загрузка...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-500">Нет данных</td></tr>
            ) : orders.map((o) => (
              <tr key={o.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{o.dealNumber || o.id}</td>
                <td className="px-4 py-3 text-gray-200">{o.user?.email || o.userId}</td>
                <td className="px-4 py-3 text-gray-300">{o.productTitle || '—'}</td>
                <td className="px-4 py-3 text-right text-gray-200">{o.amount != null ? o.amount.toLocaleString('ru-RU') + ' ₽' : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${o.isPaid ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                    {STATUS_LABELS[o.status] || o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{o.gcCreatedAt ? new Date(o.gcCreatedAt).toLocaleDateString('ru-RU') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
