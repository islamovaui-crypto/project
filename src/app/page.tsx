'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import UsersTab from '@/components/tables/UsersTab'
import ProductTab from '@/components/tabs/ProductTab'
import CopilotPanel from '@/components/ui/CopilotPanel'
import ImportModal from '@/components/ui/ImportModal'
import ExcludedModal from '@/components/ui/ExcludedModal'
import InsightsBar from '@/components/ui/InsightsBar'
import MultiSelect from '@/components/ui/MultiSelect'

// Product groups for tabs — productId patterns
const PRODUCT_TABS = [
  {
    id: 'all',
    label: 'Все участники',
    match: () => true,
  },
  {
    id: 'neuroagent3',
    label: 'НейроАгент 3.0',
    match: (name: string) => /нейроагент\s*3/i.test(name),
  },
  {
    id: 'vibecoding2',
    label: 'Вайбкодинг 2.0',
    match: (name: string) => /вайбкодинг\s*2\.0/i.test(name) && !/бонус/i.test(name),
  },
  {
    id: 'vibecoding',
    label: 'Вайбкодинг',
    match: (name: string) => (/^вайбкодинг/i.test(name) || /тариф.*вип|тариф.*делай/i.test(name)) && !/вайбкодинг\s*2/i.test(name) && !/бонус/i.test(name) && !/запис/i.test(name),
  },
  {
    id: 'univer',
    label: 'УНИВЕР',
    match: (name: string) => /универ/i.test(name),
  },
] as const

type TabId = (typeof PRODUCT_TABS)[number]['id']

interface Product { id: string; name: string }
interface SyncLog {
  status: string
  finishedAt: string | null
  usersCount: number | null
  ordersCount: number | null
  error: string | null
}

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

export default function Dashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = usePersistedState<TabId>('dash_tab', 'all')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProducts, setSelectedProducts] = usePersistedState<string[]>('dash_products', [])
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

  // Get product IDs for active tab
  function getTabProductIds(tabId: TabId): string[] {
    if (tabId === 'all') return selectedProducts
    const tab = PRODUCT_TABS.find(t => t.id === tabId)
    if (!tab || tab.id === 'all') return []
    return products.filter(p => tab.match(p.name)).map(p => p.id)
  }

  const isRunning = syncing || syncStatus?.status === 'running'
  const syncLabel = isRunning
    ? 'Синхронизация...'
    : syncStatus?.finishedAt
    ? `Обновлено: ${new Date(syncStatus.finishedAt).toLocaleString('ru-RU')}`
    : 'Данные не загружены'

  const activeProductIds = getTabProductIds(activeTab)

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="font-semibold text-gray-900 whitespace-nowrap">GC Dashboard</h1>
          {activeTab === 'all' && (
            <MultiSelect
              options={products}
              selected={selectedProducts}
              onChange={setSelectedProducts}
            />
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 hidden md:block">{syncLabel}</span>
          <button
            onClick={() => setImportOpen(true)}
            className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            Импорт CSV
          </button>
          <button
            onClick={() => setExcludedOpen(true)}
            className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            Исключения
          </button>
          <button
            onClick={startSync}
            disabled={isRunning}
            className="text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            {isRunning ? '⟳ Синхронизация...' : '↻ Синхронизировать'}
          </button>
          {copilotEnabled && (
            <button
              onClick={() => setCopilotOpen(!copilotOpen)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors border ${copilotOpen ? 'bg-purple-100 border-purple-300 text-gray-900' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
            >
              ✦ Копилот
            </button>
          )}
          <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2">
            Выйти
          </button>
        </div>
      </header>

      {/* Insights bar */}
      <InsightsBar productIds={activeProductIds} syncStatus={syncStatus} />

      {/* Tabs */}
      <div className="border-b border-gray-200 px-6">
        <div className="flex overflow-x-auto">
          {PRODUCT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
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
          {activeTab === 'all' ? (
            <UsersTab productIds={selectedProducts} />
          ) : (
            <ProductTab productIds={activeProductIds} label={PRODUCT_TABS.find(t => t.id === activeTab)?.label || ''} />
          )}
        </main>

        {copilotOpen && (
          <aside className="w-96 border-l border-gray-200 flex-shrink-0 overflow-hidden">
            <CopilotPanel onClose={() => setCopilotOpen(false)} />
          </aside>
        )}
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {excludedOpen && <ExcludedModal onClose={() => setExcludedOpen(false)} />}
    </div>
  )
}
