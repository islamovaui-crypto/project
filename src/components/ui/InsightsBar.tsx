'use client'
import { useState, useEffect } from 'react'

interface InsightData {
  insights: string[]
  stats: { usersTotal: number; conversionRate: number; completionRate: number; inactiveAfterPay: number }
}

interface SyncLog { status: string; finishedAt: string | null }

export default function InsightsBar({ productIds, syncStatus }: { productIds: string[]; syncStatus: SyncLog | null }) {
  const [data, setData] = useState<InsightData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (syncStatus?.status !== 'success') return
    setLoading(true)
    fetch('/api/insights').then(r => r.ok ? r.json() : null).then(d => {
      setData(d)
      setLoading(false)
    })
  }, [syncStatus?.finishedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data && !loading) return null

  return (
    <div className="border-b border-gray-800 px-6 py-3 bg-gray-900/50">
      {loading ? (
        <p className="text-xs text-gray-500 animate-pulse">Анализирую данные...</p>
      ) : data ? (
        <div className="flex gap-6 items-start">
          <span className="text-xs text-purple-400 font-medium whitespace-nowrap mt-0.5">✦ Инсайты</span>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {data.insights.map((insight, i) => (
              <p key={i} className="text-xs text-gray-300">{insight}</p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
