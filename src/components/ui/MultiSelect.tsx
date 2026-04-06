'use client'
import { useState, useRef, useEffect } from 'react'

interface Option { id: string; name: string }

export default function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Все продукты',
}: {
  options: Option[]
  selected: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }

  const filtered = query
    ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    : options

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.id === selected[0])?.name || selected[0]
        : `${selected.length} продуктов`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-white border border-gray-300 text-sm rounded-lg px-3 py-1.5 text-gray-800 focus:outline-none focus:border-blue-500 flex items-center gap-2 min-w-[200px] max-w-[350px]"
      >
        <span className="truncate">{label}</span>
        <span className="text-gray-400 ml-auto">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[280px]">
          <div className="p-2 border-b border-gray-300">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск продукта..."
              className="w-full bg-gray-50 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 border-b border-gray-300"
            >
              Сбросить выбор
            </button>
          )}
          <div className="max-h-60 overflow-y-auto">
            {filtered.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="accent-blue-500 rounded"
                />
                <span className="text-gray-800 truncate">{o.name}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Ничего не найдено</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
