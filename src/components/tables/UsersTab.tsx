'use client'
import { useState, useEffect, useCallback } from 'react'

function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const saved = sessionStorage.getItem(key)
      return saved ? JSON.parse(saved) : initial
    } catch { return initial }
  })
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)) } catch {}
  }, [key, value])
  return [value, setValue]
}

interface Order {
  id: string
  productTitle: string
  productId: string
  isPaid: boolean
  status: string
  amount: number | null
  paidAt: string | null
  gcCreatedAt: string | null
}

interface GcUser {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string
  telegram: string | null
  birthDate: string | null
  age: string | null
  city: string | null
  country: string | null
  tags: string[]
  gcCreatedAt: string | null
  orders: Order[]
  _count: { orders: number; lessonProgress: number; surveyAnswers: number }
}

type SortKey = 'email' | 'name' | 'paid' | 'paidAt' | 'lessons' | 'surveys' | 'id'
type SortDir = 'asc' | 'desc'

function getPaidDate(u: GcUser): number {
  const paid = u.orders.filter((o) => o.isPaid)
  if (paid.length === 0) return 0
  const dates = paid.map((o) => o.paidAt || o.gcCreatedAt).filter(Boolean) as string[]
  if (dates.length === 0) return 0
  return Math.max(...dates.map((d) => new Date(d).getTime()))
}

function sortUsers(users: GcUser[], key: SortKey, dir: SortDir): GcUser[] {
  const sorted = [...users].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'email': cmp = (a.email || '').localeCompare(b.email || ''); break
      case 'name': cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`); break
      case 'paid': cmp = a.orders.filter((o) => o.isPaid).length - b.orders.filter((o) => o.isPaid).length; break
      case 'paidAt': cmp = getPaidDate(a) - getPaidDate(b); break
      case 'lessons': cmp = (a._count.lessonProgress || 0) - (b._count.lessonProgress || 0); break
      case 'surveys': cmp = (a._count.surveyAnswers || 0) - (b._count.surveyAnswers || 0); break
      case 'id': cmp = a.id.localeCompare(b.id); break
    }
    return dir === 'asc' ? cmp : -cmp
  })
  return sorted
}

function EditableCell({ userId, field, value, onSave, link }: { userId: string; field: string; value: string; onSave: (v: string) => void; link?: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)

  async function save() {
    setEditing(false)
    if (val === value) return
    await fetch('/api/users/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, field, value: val }),
    })
    onSave(val)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="bg-white border border-blue-500 rounded px-1.5 py-0.5 text-xs text-gray-800 w-28 focus:outline-none"
      />
    )
  }

  if (value && link) {
    return (
      <span className="flex items-center gap-1">
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-500 hover:underline">{value}</a>
        <button onClick={() => { setVal(value); setEditing(true) }} className="text-gray-400 hover:text-gray-500 text-[10px]" title="Редактировать">✎</button>
      </span>
    )
  }

  return (
    <span
      onClick={() => { setVal(value); setEditing(true) }}
      className="cursor-pointer hover:text-blue-400 transition-colors"
      title="Нажмите для редактирования"
    >
      {value || '—'}
    </span>
  )
}

function downloadCSV(users: GcUser[]) {
  const headers = ['ID', 'Email', 'Имя', 'Фамилия', 'Телефон', 'Telegram', 'Дата рождения', 'Возраст', 'Страна', 'Город', 'Продукты', 'Оплачено', 'Дата покупки', 'Заказы', 'Уроки']
  const rows = users.map((u) => {
    const paid = u.orders.filter((o) => o.isPaid)
    const paidDates = paid.map((o) => o.paidAt || o.gcCreatedAt).filter(Boolean).map((d) => new Date(d!).toLocaleDateString('ru-RU')).join('; ')
    return [
      u.id,
      u.email,
      u.firstName,
      u.lastName,
      u.phone,
      u.telegram || '',
      u.birthDate || '',
      u.age || '',
      u.country || '',
      u.city || '',
      u.orders.map((o) => o.productTitle).join('; '),
      paid.length,
      paidDates,
      u._count.orders,
      u._count.lessonProgress,
    ]
  })
  const csv = [headers, ...rows].map((r) => r.map(String).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'participants.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function UsersTab({ productIds, defaultPaidFilter }: { productIds: string[]; defaultPaidFilter?: string }) {
  const [users, setUsers] = useState<GcUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = usePersistedState('users_search', '')
  const [hasOrders, setHasOrders] = usePersistedState('users_hasOrders', '')
  const [paidFilter, setPaidFilter] = usePersistedState('users_paidFilter', defaultPaidFilter || '')
  const [sortKey, setSortKey] = usePersistedState<SortKey>('users_sortKey', 'email')
  const [sortDir, setSortDir] = usePersistedState<SortDir>('users_sortDir', 'asc')
  const [loading, setLoading] = useState(false)
  const [showSurvey, setShowSurvey] = usePersistedState('users_showSurvey', false)
  const [surveyQuestions, setSurveyQuestions] = useState<string[]>([])
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, Record<string, string>>>({})

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'paidAt' || key === 'paid' || key === 'lessons' || key === 'surveys' ? 'desc' : 'asc')
    }
  }

  const sortedUsers = sortUsers(users, sortKey, sortDir)
  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), search })
    for (const pid of productIds) params.append('productId', pid)
    if (hasOrders !== '') params.set('hasOrders', hasOrders)
    if (paidFilter !== '') params.set('isPaid', paidFilter)
    const res = await fetch('/api/users?' + params)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [page, search, productIds, hasOrders, paidFilter])

  // Load survey answers for displayed users
  useEffect(() => {
    if (users.length === 0 || !showSurvey) return
    const params = new URLSearchParams()
    users.forEach(u => params.append('userId', u.id))
    fetch('/api/survey-answers?' + params).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setSurveyQuestions(d.questions || [])
        setSurveyAnswers(d.answers || {})
      }
    })
  }, [users, showSurvey])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, productIds, hasOrders, paidFilter])

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
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-64"
          />
          <select
            value={hasOrders}
            onChange={(e) => setHasOrders(e.target.value)}
            className="bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:border-blue-500"
          >
            <option value="">Все участники</option>
            <option value="true">Есть заказы</option>
            <option value="false">Без заказов</option>
          </select>
          <select
            value={paidFilter}
            onChange={(e) => setPaidFilter(e.target.value)}
            className="bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:border-blue-500"
          >
            <option value="">Любая оплата</option>
            <option value="true">Оплачено</option>
            <option value="false">Не оплачено</option>
          </select>
          <span className="text-sm text-gray-500">{total.toLocaleString('ru-RU')} участников</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSurvey(!showSurvey)}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${showSurvey ? 'bg-purple-100 border-purple-300 text-purple-600' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
          >{showSurvey ? '▾ Анкеты' : '▸ Анкеты'}</button>
        <button
          onClick={() => downloadCSV(users)}
          className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-2 rounded-lg transition-colors"
        >↓ CSV</button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('email')}>Email{sortIcon('email')}</th>
              <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('name')}>Имя{sortIcon('name')}</th>
              <th className="text-left px-4 py-3">Телефон</th>
              <th className="text-left px-4 py-3">Telegram</th>
              <th className="text-left px-4 py-3">Дата рожд.</th>
              <th className="text-left px-4 py-3">Возраст</th>
              <th className="text-left px-4 py-3">Страна</th>
              <th className="text-left px-4 py-3">Город</th>
              <th className="text-left px-4 py-3">Продукт(ы)</th>
              <th className="text-center px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('paid')}>Оплачено{sortIcon('paid')}</th>
              <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('paidAt')}>Дата покупки{sortIcon('paidAt')}</th>
              <th className="text-right px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('lessons')}>Уроки{sortIcon('lessons')}</th>
              <th className="text-right px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('surveys')}>Анкеты{sortIcon('surveys')}</th>
              <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('id')}>ID{sortIcon('id')}</th>
              {showSurvey && surveyQuestions.map((q) => (
                <th key={q} className="text-left px-4 py-3 text-purple-600 max-w-[200px]" title={q}>
                  <span className="line-clamp-2">{q.length > 30 ? q.slice(0, 30) + '...' : q}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} className="text-center py-12 text-gray-400">Загрузка...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={14} className="text-center py-12 text-gray-400">Нет данных. Нажмите «Синхронизировать».</td></tr>
            ) : (
              sortedUsers.map((u) => {
                const paidOrders = u.orders.filter((o) => o.isPaid)
                return (
                  <tr key={u.id} className="border-b border-gray-200 hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 text-gray-800">{u.email || <span className="text-gray-400 italic">нет email</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <EditableCell userId={u.id} field="telegram" value={u.telegram || ''} onSave={(v) => { u.telegram = v; setUsers([...users]) }} link={u.telegram ? `https://t.me/${u.telegram.replace(/^@/, '')}` : undefined} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <EditableCell userId={u.id} field="birthDate" value={u.birthDate || ''} onSave={(v) => { u.birthDate = v; setUsers([...users]) }} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <EditableCell userId={u.id} field="age" value={u.age || ''} onSave={(v) => { u.age = v; setUsers([...users]) }} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <EditableCell userId={u.id} field="country" value={u.country || ''} onSave={(v) => { u.country = v; setUsers([...users]) }} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <EditableCell userId={u.id} field="city" value={u.city || ''} onSave={(v) => { u.city = v; setUsers([...users]) }} />
                    </td>
                    <td className="px-4 py-3">
                      {u.orders.length === 0 ? (
                        <span className="text-gray-400 text-xs">нет заказов</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {u.orders.slice(0, 2).map((o) => (
                            <span key={o.id} className={`text-xs px-2 py-0.5 rounded-full w-fit ${o.isPaid ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                              {o.productTitle || '—'}
                            </span>
                          ))}
                          {u.orders.length > 2 && <span className="text-xs text-gray-400">+{u.orders.length - 2}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {paidOrders.length > 0
                        ? <span className="text-green-600 font-medium">{paidOrders.length}</span>
                        : <span className="text-gray-400">0</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {paidOrders.length > 0
                        ? paidOrders.map((o) => o.paidAt ? new Date(o.paidAt).toLocaleDateString('ru-RU') : o.gcCreatedAt ? new Date(o.gcCreatedAt).toLocaleDateString('ru-RU') : '—').join(', ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{u._count.lessonProgress || 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{u._count.surveyAnswers || 0}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{u.id}</td>
                    {showSurvey && surveyQuestions.map((q) => (
                      <td key={q} className="px-4 py-3 text-xs text-gray-500 max-w-[200px]">
                        <span className="line-clamp-3" title={surveyAnswers[u.id]?.[q] || ''}>
                          {surveyAnswers[u.id]?.[q] || '—'}
                        </span>
                      </td>
                    ))}
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
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:border-gray-400 transition-colors">←</button>
          <span className="text-sm text-gray-500">{page} / {pages}</span>
          <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:border-gray-400 transition-colors">→</button>
        </div>
      )}
    </div>
  )
}
