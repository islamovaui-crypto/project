'use client'
import { useState, useEffect } from 'react'

interface Excluded { id: string; userId: string | null; email: string | null; tag: string | null; groupId: string | null; reason: string | null }

export default function ExcludedModal({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Excluded[]>([])
  const [form, setForm] = useState({ userId: '', email: '', tag: '', groupId: '', reason: '' })
  const [loading, setLoading] = useState(false)

  async function load() {
    const res = await fetch('/api/excluded')
    if (res.ok) { const d = await res.json(); setList(d.excluded) }
  }

  useEffect(() => { load() }, [])

  async function add() {
    setLoading(true)
    await fetch('/api/excluded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setForm({ userId: '', email: '', tag: '', groupId: '', reason: '' })
    await load()
    setLoading(false)
  }

  async function remove(id: string) {
    await fetch('/api/excluded', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  const inputClass = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 w-full'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-white">Исключённые аккаунты</h2>
            <p className="text-xs text-gray-500 mt-0.5">Не учитываются в статистике</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>

        {/* Add form */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <input placeholder="ID пользователя" value={form.userId} onChange={e => setForm(f => ({...f, userId: e.target.value}))} className={inputClass} />
          <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} className={inputClass} />
          <input placeholder="Тег (из GetCourse)" value={form.tag} onChange={e => setForm(f => ({...f, tag: e.target.value}))} className={inputClass} />
          <input placeholder="ID группы" value={form.groupId} onChange={e => setForm(f => ({...f, groupId: e.target.value}))} className={inputClass} />
          <input placeholder="Причина (опционально)" value={form.reason} onChange={e => setForm(f => ({...f, reason: e.target.value}))} className={`${inputClass} col-span-2`} />
          <button
            onClick={add}
            disabled={loading || (!form.userId && !form.email && !form.tag && !form.groupId)}
            className="col-span-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >Добавить исключение</button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {list.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">Нет исключений</p>
          ) : list.map((e) => (
            <div key={e.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2.5">
              <div className="text-sm">
                {e.userId && <span className="text-gray-300">ID: {e.userId}</span>}
                {e.email && <span className="text-gray-300">Email: {e.email}</span>}
                {e.tag && <span className="text-gray-300">Тег: {e.tag}</span>}
                {e.groupId && <span className="text-gray-300">Группа: {e.groupId}</span>}
                {e.reason && <span className="text-gray-500 ml-2 text-xs">— {e.reason}</span>}
              </div>
              <button onClick={() => remove(e.id)} className="text-gray-500 hover:text-red-400 transition-colors ml-3 text-lg leading-none">×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
