'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import UsersTab from '@/components/tables/UsersTab'
import OrdersTab from '@/components/tables/OrdersTab'
import ProgressTab from '@/components/tables/ProgressTab'
import SurveysTab from '@/components/tables/SurveysTab'
import CopilotPanel from '@/components/ui/CopilotPanel'
import ImportModal from '@/components/ui/ImportModal'
import ExcludedModal from '@/components/ui/ExcludedModal'
import InsightsBar from '@/components/ui/InsightsBar'

const TABS = [
  { id: 'users', label: 'Участники' },
  { id: 'orders', label: 'Заказы' },
  { id: 'progress', label: 'Прогресс' },
  { id: 'surveys', label: 'Анкеты' },
] as const

type Tab = (typeof TABS)[number]['id']

interface Product { id: string; name: string }
interface SyncLog {
  status: string
  finishedAt: string | null
  usersCount: number | null
  ordersCount: number | null
  error: string | null
}

export default function Dashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [syncStatus, setSyncStatus] = useState<SyncLog | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [copilotEnabled, setCopilotEnabled] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [excludedOpen, setExcludedOpen] = useState(false)

  const loadSync = useCallback(async () => {
    const res = await fetch('/api/sync')
    if (res.status === 401) { router.push('/login'); return }
    const data = await res.json()
    setSyncStatus(data.log)
    if (data.log?.status === 'running') {
      setTimeout(loadSync, 5000)
    } else {
      setSyncing(false)
      fetchProducts()
    }
  }, [router])

  useEffect(() => {
    loadSync()
    fetchProducts()
    fetch('/api/config').then(r => r.ok ? r.json() : null).then(d => d && setCopilotEnabled(d.copilotEnabled))
  }, [loadSync])

  async function fetchProducts() {
    const res = await fetch('/api/products')
    if (!res.ok) return
    const data = await res.json()
    setProducts(data.products || [])
  }

  async function startSync() {
    setSyncing(true)
    await fetch('/api/sync', { method: 'POST' })
    setTimeout(loadSync, 2000)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const isRunning = syncing || syncStatus?.status === 'running'
  const syncLabel = isRunning
    ? 'Синхронизация...'
    : syncStatus?.finishedAt
    ? `Обновлено: ${new Date(syncStatus.finishedAt).toLocaleString('ru-RU')}`
    : 'Данные не загружены'

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="font-semibold text-white whitespace-nowrap">GC Dashboard</h1>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">Все продукты</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500 hidden md:block">{syncLabel}</span>
          <button
            onClick={() => setImportOpen(true)}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Импорт CSV
          </button>
          <button
            onClick={() => setExcludedOpen(true)}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Исключения
          </button>
          <button
            onClick={startSync}
            disabled={isRunning}
            className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            {isRunning ? '⟳ Синхронизация...' : '↻ Синхронизировать'}
          </button>
          {copilotEnabled && (
            <button
              onClick={() => setCopilotOpen(!copilotOpen)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors border ${copilotOpen ? 'bg-purple-700 border-purple-600 text-white' : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
            >
              ✦ Копилот
            </button>
          )}
          <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2">
            Выйти
          </button>
        </div>
      </header>

      {/* Insights bar */}
      <InsightsBar productId={selectedProduct} syncStatus={syncStatus} />

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto p-6">
          {activeTab === 'users' && <UsersTab productId={selectedProduct} />}
          {activeTab === 'orders' && <OrdersTab productId={selectedProduct} />}
          {activeTab === 'progress' && <ProgressTab productId={selectedProduct} />}
          {activeTab === 'surveys' && <SurveysTab productId={selectedProduct} />}
        </main>

        {copilotOpen && (
          <aside className="w-96 border-l border-gray-800 flex-shrink-0 overflow-hidden">
            <CopilotPanel onClose={() => setCopilotOpen(false)} />
          </aside>
        )}
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {excludedOpen && <ExcludedModal onClose={() => setExcludedOpen(false)} />}
    </div>
  )
}
