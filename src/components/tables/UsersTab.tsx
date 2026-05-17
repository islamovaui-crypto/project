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
  refunded?: boolean
  lost?: boolean
  tags: string[]
  gcCreatedAt: string | null
  orders: Order[]
  _count: { orders: number; lessonProgress: number; surveyAnswers: number }
}

type SortKey = 'email' | 'name' | 'paid' | 'paidAt' | 'lessons' | 'surveys' | 'id' | 'activity'
type SortDir = 'asc' | 'desc'

function isVipOrder(o: Order): boolean {
  return /вип|vip/i.test(o.productTitle || '')
}

function getPaidDate(u: GcUser): number {
  const paid = u.orders.filter((o) => o.isPaid && !isVipOrder(o))
  if (paid.length === 0) return 0
  const dates = paid.map((o) => o.paidAt || o.gcCreatedAt).filter(Boolean) as string[]
  if (dates.length === 0) return 0
  return Math.max(...dates.map((d) => new Date(d).getTime()))
}

function sortUsers(users: GcUser[], key: SortKey, dir: SortDir, visitCounts?: Record<string, number>): GcUser[] {
  const sorted = [...users].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'email': cmp = (a.email || '').localeCompare(b.email || ''); break
      case 'name': cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`); break
      case 'paid': cmp = a.orders.filter((o) => o.isPaid && !isVipOrder(o)).length - b.orders.filter((o) => o.isPaid && !isVipOrder(o)).length; break
      case 'paidAt': cmp = getPaidDate(a) - getPaidDate(b); break
      case 'lessons': cmp = (a._count.lessonProgress || 0) - (b._count.lessonProgress || 0); break
      case 'surveys': cmp = (a._count.surveyAnswers || 0) - (b._count.surveyAnswers || 0); break
      case 'activity': cmp = (visitCounts?.[a.id] || 0) - (visitCounts?.[b.id] || 0); break
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

function ResizableTh({ width, onResize, children, className, sticky, left, onClick }: { width?: number; onResize?: (w: number) => void; children: React.ReactNode; className?: string; sticky?: boolean; left?: number; onClick?: () => void }) {
  const startResize = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startW = width || 150
    const onMove = (ev: MouseEvent) => onResize?.(Math.max(80, startW + ev.clientX - startX))
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  const style: React.CSSProperties = {
    width: width ? `${width}px` : undefined,
    minWidth: width ? `${width}px` : undefined,
    maxWidth: width ? `${width}px` : undefined,
    ...(sticky ? { position: 'sticky', left: `${left || 0}px`, top: 0, zIndex: 50, background: '#f9fafb' } : { position: 'sticky', top: 0, zIndex: 10, background: '#f9fafb' }),
  }
  return (
    <th style={style} className={`relative ${className || ''}`} onClick={onClick}>
      {children}
      {onResize && (
        <span
          onMouseDown={startResize}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 select-none"
        />
      )}
    </th>
  )
}

function downloadCSV(users: GcUser[]) {
  const headers = ['ID', 'Email', 'Имя', 'Фамилия', 'Телефон', 'Telegram', 'Дата рождения', 'Возраст', 'Страна', 'Город', 'Продукты', 'Оплачено', 'Дата покупки', 'Заказы', 'Уроки']
  const rows = users.map((u) => {
    const paid = u.orders.filter((o) => o.isPaid && !isVipOrder(o))
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
      u.orders.filter(o => !isVipOrder(o)).map((o) => o.productTitle).join('; '),
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

export default function UsersTab({ productIds, niche, alsoNiche, defaultPaidFilter, course }: { productIds: string[]; niche?: string; alsoNiche?: string; defaultPaidFilter?: string; course?: string }) {
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
  const [showLessons, setShowLessons] = usePersistedState('users_showLessons', false)
  const [colWidths, setColWidths] = usePersistedState<Record<string, number>>('users_colWidths', { email: 220, name: 180 })
  const [lessons, setLessons] = useState<{ id: string; title: string; moduleTitle: string; entered: number; openDate?: string | null }[]>([])
  const [visits, setVisits] = useState<Record<string, Record<string, boolean>>>({})
  const [scrapingProgress, setScrapingProgress] = useState(false)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'paidAt' || key === 'paid' || key === 'lessons' || key === 'surveys' || key === 'activity' ? 'desc' : 'asc')
    }
  }

  // Visit counts per user (for activity ranking)
  const visitCounts: Record<string, number> = {}
  for (const u of users) {
    visitCounts[u.id] = Object.keys(visits[u.id] || {}).length
  }
  const totalLessons = lessons.length
  const activeUsers = users.filter(u => !u.refunded && !u.lost)
  const activeWithVisits = activeUsers.filter(u => (visitCounts[u.id] || 0) > 0)
  const avgActivity = showLessons && totalLessons > 0 && activeWithVisits.length > 0
    ? Math.round(activeWithVisits.reduce((sum, u) => sum + (visitCounts[u.id] || 0), 0) / activeWithVisits.length / totalLessons * 100)
    : null

  const sortedUsersRaw = sortUsers(users, sortKey, sortDir, visitCounts)
  // Pin refunded/lost to the bottom
  const sortedUsers = [
    ...sortedUsersRaw.filter(u => !u.refunded && !u.lost),
    ...sortedUsersRaw.filter(u => u.refunded || u.lost),
  ]
  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), search })
    for (const pid of productIds) params.append('productId', pid)
    if (hasOrders !== '') params.set('hasOrders', hasOrders)
    if (paidFilter !== '') params.set('isPaid', paidFilter)
    if (niche) params.set('niche', niche)
    if (alsoNiche) params.set('alsoNiche', alsoNiche)
    const res = await fetch('/api/users?' + params)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [page, search, productIds, hasOrders, paidFilter, niche, alsoNiche])

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

  // Load lesson visits for displayed users (POST to avoid URL length limit)
  useEffect(() => {
    if (users.length === 0 || !showLessons || !course) return
    fetch('/api/lesson-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course, userIds: users.map(u => u.id) }),
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setLessons(d.lessons || [])
        setVisits(d.visits || {})
      }
    })
  }, [users, showLessons, course])

  async function refreshLessonScraping() {
    if (!course) return
    setScrapingProgress(true)
    try {
      await fetch('/api/scrape-progress/refresh?course=' + encodeURIComponent(course), { method: 'POST' })
      // Reload visits via POST
      const res = await fetch('/api/lesson-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course, userIds: users.map(u => u.id) }),
      })
      if (res.ok) {
        const d = await res.json()
        setLessons(d.lessons || [])
        setVisits(d.visits || {})
      }
    } finally {
      setScrapingProgress(false)
    }
  }

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
          {!defaultPaidFilter && (
            <select
              value={paidFilter}
              onChange={(e) => setPaidFilter(e.target.value)}
              className="bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">Любая оплата</option>
              <option value="true">Оплачено</option>
              <option value="false">Не оплачено</option>
            </select>
          )}
          <span className="text-sm text-gray-500">{total.toLocaleString('ru-RU')} участников</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSurvey(!showSurvey)}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${showSurvey ? 'bg-purple-100 border-purple-300 text-purple-600' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
          >{showSurvey ? '▾ Анкеты' : '▸ Анкеты'}</button>
          {course && (
            <>
              <button
                onClick={() => setShowLessons(!showLessons)}
                className={`text-sm px-3 py-2 rounded-lg border transition-colors ${showLessons ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
              >
                {showLessons ? '▾ Уроки' : '▸ Уроки'}
                {avgActivity !== null && <span className="ml-1.5 text-xs font-semibold text-orange-500">ср. {avgActivity}%</span>}
              </button>
              {showLessons && (
                <button
                  onClick={refreshLessonScraping}
                  disabled={scrapingProgress}
                  className="text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 disabled:opacity-40"
                  title="Обновить данные о посещении уроков"
                >{scrapingProgress ? '⟳ Парсинг...' : '↻ Обновить'}</button>
              )}
            </>
          )}
        <button
          onClick={() => downloadCSV(users)}
          className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-2 rounded-lg transition-colors"
        >↓ CSV</button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wide [&_th]:sticky [&_th]:top-0 [&_th]:bg-gray-50 [&_th]:border-b [&_th]:border-gray-200">
              <th
                style={{ position: 'sticky', left: 0, top: 0, zIndex: 50, background: '#f9fafb', width: 50, minWidth: 50, maxWidth: 50 }}
                className="text-center px-2 py-3 text-gray-400 font-normal"
              >#</th>
              <ResizableTh
                sticky
                left={50}
                width={colWidths.email}
                onResize={(w) => setColWidths({ ...colWidths, email: w })}
                onClick={() => handleSort('email')}
                className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 select-none"
              >Email{sortIcon('email')}</ResizableTh>
              <ResizableTh
                sticky
                left={50 + colWidths.email}
                width={colWidths.name}
                onResize={(w) => setColWidths({ ...colWidths, name: w })}
                onClick={() => handleSort('name')}
                className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 select-none"
              >Имя{sortIcon('name')}</ResizableTh>
              <th className="text-left px-4 py-3">Телефон</th>
              <th className="text-left px-4 py-3">Telegram</th>
              <th className="text-left px-4 py-3">Страна</th>
              <th className="text-left px-4 py-3">Город</th>
              <th className="text-left px-4 py-3">Продукт(ы)</th>
              <th className="text-center px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('paid')}>Оплачено{sortIcon('paid')}</th>
              <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('paidAt')}>Дата покупки{sortIcon('paidAt')}</th>
              {showLessons && totalLessons > 0 && (
                <th className="text-center px-4 py-3 cursor-pointer hover:text-gray-700 select-none text-orange-500" onClick={() => handleSort('activity')}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span>Активность{sortIcon('activity')}</span>
                    {avgActivity !== null && <span className="text-[10px] font-normal text-gray-400 normal-case">ср. {avgActivity}%</span>}
                  </div>
                </th>
              )}
              <th className="text-right px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('lessons')}>Уроки{sortIcon('lessons')}</th>
              <th className="text-right px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('surveys')}>Анкеты{sortIcon('surveys')}</th>
              <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('id')}>ID{sortIcon('id')}</th>
              {showSurvey && surveyQuestions.map((q) => (
                <th key={q} className="text-left px-4 py-3 text-purple-600 max-w-[200px]" title={q}>
                  <span className="line-clamp-2">{q.length > 30 ? q.slice(0, 30) + '...' : q}</span>
                </th>
              ))}
              {showLessons && lessons.map((l) => {
                const activeUsers = users.filter(u => !u.refunded && !u.lost)
                const visitCount = activeUsers.filter(u => visits[u.id]?.[l.id]).length
                const pct = activeUsers.length > 0 ? Math.round((visitCount / activeUsers.length) * 100) : 0
                return (
                  <th key={l.id} className="text-center px-2 py-3 text-blue-600 min-w-[70px] max-w-[110px]" title={`${l.moduleTitle}: ${l.title}${l.openDate ? '\nОткрыт: ' + l.openDate : ''}\n${visitCount} из ${activeUsers.length}`}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[10px] font-normal text-gray-400 line-clamp-1">{l.moduleTitle.replace(/^Модуль\s*/, 'М')}</span>
                      <span className="text-[10px] line-clamp-2 normal-case">{l.title.length > 22 ? l.title.slice(0, 20) + '…' : l.title}</span>
                      {l.openDate && <span className="text-[9px] text-gray-400 font-normal">{l.openDate}</span>}
                      <span className="text-xs mt-0.5 font-bold">{pct}%</span>
                      <span className="text-[10px] text-gray-500 font-normal">{visitCount} из {activeUsers.length}</span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} className="text-center py-12 text-gray-400">Загрузка...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={13} className="text-center py-12 text-gray-400">Нет данных. Нажмите «Синхронизировать».</td></tr>
            ) : (
              sortedUsers.map((u, idx) => {
                const paidOrders = u.orders.filter((o) => o.isPaid && !isVipOrder(o))
                const rowBg = u.refunded ? '#fef2f2' : u.lost ? '#fff7ed' : '#ffffff'
                const rowText = u.refunded ? 'text-red-700' : u.lost ? 'text-orange-700' : ''
                const titleAttr = u.refunded ? 'Возврат — не учитывается в статистике' : u.lost ? 'Потерянный участник — не учитывается в статистике' : ''
                return (
                  <tr key={u.id} className={`border-b border-gray-200 hover:bg-gray-100 transition-colors group ${rowText}`} title={titleAttr}>
                    <td
                      className="px-2 py-3 text-center text-xs text-gray-400"
                      style={{ position: 'sticky', left: 0, zIndex: 20, backgroundColor: rowBg, width: 50, minWidth: 50, maxWidth: 50 }}
                    >{u.refunded || u.lost ? '' : idx + 1}</td>
                    <td
                      className={`px-4 py-3 truncate ${u.refunded ? 'text-red-700' : u.lost ? 'text-orange-700' : 'text-gray-800'}`}
                      style={{ position: 'sticky', left: 50, zIndex: 20, backgroundColor: rowBg, width: colWidths.email, minWidth: colWidths.email, maxWidth: colWidths.email }}
                    >{u.refunded ? '↩ ' : u.lost ? '⚠ ' : ''}{u.email || <span className="text-gray-400 italic">нет email</span>}</td>
                    <td
                      className={`px-4 py-3 truncate ${u.refunded ? 'text-red-700' : u.lost ? 'text-orange-700' : 'text-gray-600'}`}
                      style={{ position: 'sticky', left: 50 + colWidths.email, zIndex: 20, backgroundColor: rowBg, width: colWidths.name, minWidth: colWidths.name, maxWidth: colWidths.name }}
                    >{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <EditableCell userId={u.id} field="telegram" value={u.telegram || ''} onSave={(v) => { u.telegram = v; setUsers([...users]) }} link={u.telegram ? `https://t.me/${u.telegram.replace(/^@/, '')}` : undefined} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <EditableCell userId={u.id} field="country" value={u.country || ''} onSave={(v) => { u.country = v; setUsers([...users]) }} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <EditableCell userId={u.id} field="city" value={u.city || ''} onSave={(v) => { u.city = v; setUsers([...users]) }} />
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const visibleOrders = u.orders.filter(o => !isVipOrder(o))
                        return visibleOrders.length === 0 ? (
                          <span className="text-gray-400 text-xs">нет заказов</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {visibleOrders.slice(0, 2).map((o) => (
                              <span key={o.id} className={`text-xs px-2 py-0.5 rounded-full w-fit ${o.isPaid ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                                {o.productTitle || '—'}
                              </span>
                            ))}
                            {visibleOrders.length > 2 && <span className="text-xs text-gray-400">+{visibleOrders.length - 2}</span>}
                          </div>
                        )
                      })()}
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
                    {showLessons && totalLessons > 0 && (() => {
                      const vc = visitCounts[u.id] || 0
                      const pct = totalLessons > 0 ? Math.round(vc / totalLessons * 100) : 0
                      const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-400' : pct >= 15 ? 'bg-orange-400' : 'bg-red-400'
                      return (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[40px]">
                              <div className={`h-1.5 rounded-full ${color}`} style={{ width: pct + '%' }} />
                            </div>
                            <span className="text-xs text-gray-600 w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      )
                    })()}
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
                    {showLessons && lessons.map((l) => (
                      <td key={l.id} className="px-2 py-3 text-center">
                        {visits[u.id]?.[l.id]
                          ? <span className="text-green-600 font-bold">✓</span>
                          : <span className="text-gray-300">—</span>}
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
