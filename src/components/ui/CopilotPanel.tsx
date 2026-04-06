'use client'
import { useState, useRef, useEffect } from 'react'

interface Message { role: 'user' | 'assistant'; text: string }

const SUGGESTIONS = [
  'Какова конверсия в оплату?',
  'Кто оплатил, но не открыл ни одного урока?',
  'Почему могла упасть активность?',
]

export default function CopilotPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(text: string) {
    if (!text.trim() || loading) return
    const question = text.trim()
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: question }])
    setLoading(true)
    const res = await fetch('/api/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question }),
    })
    const data = await res.json()
    setMessages((m) => [...m, { role: 'assistant', text: data.reply || data.error || 'Ошибка' }])
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-medium text-gray-900">✦ AI-Копилот</h2>
          <p className="text-xs text-gray-400">Задайте вопрос по данным дашборда</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors text-lg leading-none">×</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2 mt-4">
            <p className="text-xs text-gray-400 text-center mb-4">Примеры вопросов:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="w-full text-left text-sm text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
              >{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-500 animate-pulse">Анализирую данные...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="Введите вопрос..."
            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm transition-colors"
          >→</button>
        </div>
      </div>
    </div>
  )
}
