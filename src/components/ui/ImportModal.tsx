'use client'
import { useState, useRef } from 'react'

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<'lesson' | 'survey' | 'csi' | 'users'>('users')
  const [file, setFile] = useState<File | null>(null)
  const [surveyName, setSurveyName] = useState('')
  const [surveyDate, setSurveyDate] = useState('')
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
    if ((type === 'survey' || type === 'csi') && surveyName) fd.append('surveyName', surveyName)
    if ((type === 'survey' || type === 'csi') && surveyDate) fd.append('surveyDate', surveyDate)
    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const data = await res.json()
    setResult(data)
    setLoading(false)
  }

  const usersExample = 'Email,Telegram\nuser@mail.ru,@username'
  const lessonExample = 'user_id,lesson_id,lesson_title,product_id,opened,completed,last_activity\n12345,lesson_1,Урок 1,course_1,1,0,2024-01-15'
  const surveyExample = 'Скачайте CSV из GetCourse → Анкеты → Ответы → Экспорт.\nФайл загрузится как есть, без переименования колонок.'
  const csiExample = 'CSI / NPS из Google Sheets (CSV или XLSX).\nДолжна быть колонка Email / Эл. почта.\nОстальные колонки = вопросы анкеты.'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 rounded-xl p-6 w-full max-w-lg shadow-lg">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Импорт CSV / XLSX</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {([['users', 'Данные участников'], ['lesson', 'Прогресс'], ['survey', 'Анкеты'], ['csi', 'CSI / NPS']] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${type === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
              >{label}</button>
            ))}
          </div>

          {/* Example */}
          <div className="bg-gray-100 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1.5">Формат CSV:</p>
            <pre className="text-xs text-gray-600 overflow-x-auto">{type === 'users' ? usersExample : type === 'lesson' ? lessonExample : type === 'csi' ? csiExample : surveyExample}</pre>
          </div>

          {(type === 'survey' || type === 'csi') && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Название анкеты (например: НейроАгент - Онбординг)"
                value={surveyName}
                onChange={(e) => setSurveyName(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <input
                type="date"
                value={surveyDate}
                onChange={(e) => setSurveyDate(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-400">Дата используется если в CSV нет колонки «Дата создания»</p>
            </div>
          )}

          {/* File input */}
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg p-6 text-center cursor-pointer transition-colors"
          >
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file ? (
              <p className="text-sm text-blue-600">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
            ) : (
              <p className="text-sm text-gray-400">Нажмите, чтобы выбрать CSV или XLSX файл</p>
            )}
          </div>

          {result && (
            <div className={`rounded-lg px-4 py-3 text-sm space-y-1 ${result.errors > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'}`}>
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
            <button onClick={onClose} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors">Закрыть</button>
            <button
              onClick={handleImport}
              disabled={!file || loading}
              className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
            >{loading ? 'Загружаю...' : 'Импортировать'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
