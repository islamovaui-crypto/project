'use client'
import { useState, useRef } from 'react'

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<'lesson' | 'survey' | 'users'>('users')
  const [file, setFile] = useState<File | null>(null)
  const [surveyName, setSurveyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; errors: number; detectedColumns?: Record<string, string>; notFoundSample?: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', type)
    if (type === 'survey' && surveyName) fd.append('surveyName', surveyName)
    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const data = await res.json()
    setResult(data)
    setLoading(false)
  }

  const usersExample = 'Email,Telegram\nuser@mail.ru,@username'
  const lessonExample = 'user_id,lesson_id,lesson_title,product_id,opened,completed,last_activity\n12345,lesson_1,Урок 1,course_1,1,0,2024-01-15'
  const surveyExample = 'Скачайте CSV из GetCourse → Анкеты → Ответы → Экспорт.\nФайл загрузится как есть, без переименования колонок.'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Импорт CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {([['users', 'Данные участников'], ['lesson', 'Прогресс по урокам'], ['survey', 'Ответы на анкеты']] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${type === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >{label}</button>
            ))}
          </div>

          {/* Example */}
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1.5">Формат CSV:</p>
            <pre className="text-xs text-gray-300 overflow-x-auto">{type === 'users' ? usersExample : type === 'lesson' ? lessonExample : surveyExample}</pre>
          </div>

          {type === 'survey' && (
            <input
              type="text"
              placeholder="Название анкеты (например: НейроАгент - Онбординг)"
              value={surveyName}
              onChange={(e) => setSurveyName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          )}

          {/* File input */}
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-lg p-6 text-center cursor-pointer transition-colors"
          >
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file ? (
              <p className="text-sm text-blue-400">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
            ) : (
              <p className="text-sm text-gray-500">Нажмите, чтобы выбрать CSV файл</p>
            )}
          </div>

          {result && (
            <div className={`rounded-lg px-4 py-3 text-sm space-y-1 ${result.errors > 0 ? 'bg-yellow-900/30 text-yellow-300' : 'bg-green-900/30 text-green-300'}`}>
              <p>Импортировано: {result.imported} строк{result.errors > 0 ? `, не найдено: ${result.errors}` : ''}</p>
              {result.detectedColumns && (
                <p className="text-xs opacity-70">Колонки: Email={result.detectedColumns.emailCol || '?'}, Telegram={result.detectedColumns.tgCol || '?'}</p>
              )}
              {result.notFoundSample && result.notFoundSample.length > 0 && (
                <p className="text-xs opacity-70">Не найдены: {result.notFoundSample.join(', ')}</p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">Закрыть</button>
            <button
              onClick={handleImport}
              disabled={!file || loading}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
            >{loading ? 'Загружаю...' : 'Импортировать'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
