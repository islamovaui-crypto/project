'use client'
import { useState, useRef } from 'react'

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<'lesson' | 'survey'>('lesson')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; errors: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', type)
    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const data = await res.json()
    setResult(data)
    setLoading(false)
  }

  const lessonExample = 'user_id,lesson_id,lesson_title,product_id,opened,completed,last_activity\n12345,lesson_1,Урок 1,course_1,1,0,2024-01-15'
  const surveyExample = 'user_id,survey_id,survey_name,question_id,question,answer,answered_at,product_id\n12345,survey_1,Входная анкета,q1,Ваш опыт,Новичок,2024-01-10,course_1'

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
            {(['lesson', 'survey'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${type === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >{t === 'lesson' ? 'Прогресс по урокам' : 'Ответы на анкеты'}</button>
            ))}
          </div>

          {/* Example */}
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1.5">Формат CSV:</p>
            <pre className="text-xs text-gray-300 overflow-x-auto">{type === 'lesson' ? lessonExample : surveyExample}</pre>
          </div>

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
            <div className={`rounded-lg px-4 py-3 text-sm ${result.errors > 0 ? 'bg-yellow-900/30 text-yellow-300' : 'bg-green-900/30 text-green-300'}`}>
              Импортировано: {result.imported} строк{result.errors > 0 ? `, ошибок: ${result.errors}` : ''}
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
