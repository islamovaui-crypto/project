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
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h2 className="text-sm font-medium text-white">✦ AI-Копилот</h2>
          <p className="text-xs text-gray-500">Задайте вопрос по данным дашборда</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-lg leading-none">×</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2 mt-4">
            <p className="text-xs text-gray-500 text-center mb-4">Примеры вопросов:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="w-full text-left text-sm text-gray-400 hover:text-gray-200 bg-gray-800/50 hover:bg-gray-800 px-3 py-2 rounded-lg transition-colors"
              >{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-400 animate-pulse">Анализирую данные...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="Введите вопрос..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
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
