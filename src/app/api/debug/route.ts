export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'

const gcDomain = (process.env.GC_ACCOUNT || '').includes('.')
  ? process.env.GC_ACCOUNT
  : `${process.env.GC_ACCOUNT}.getcourse.ru`
const GC_BASE = `https://${gcDomain}/pl/api/account`

async function gcGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${GC_BASE}/${path}`)
  url.searchParams.set('key', process.env.GC_API_KEY!)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  return res.json()
}

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  // Start a small deals export (last 7 days) to see field names
  const from = new Date(Date.now() - 7 * 86400000)
  const gcDate = `${String(from.getDate()).padStart(2,'0')}.${String(from.getMonth()+1).padStart(2,'0')}.${from.getFullYear()}`

  try {
    const init = await gcGet('deals', { 'created_at[from]': gcDate })
    if (!init.success || !init.info?.export_id) {
      return NextResponse.json({ error: 'Failed to start export', raw: init })
    }

    // Poll up to 10 times
    let result: Record<string, unknown> | null = null
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 8000))
      const poll = await gcGet(`exports/${init.info.export_id}`)
      if (poll.error_code === 909) continue
      result = poll
      break
    }

    if (!result) return NextResponse.json({ error: 'Timeout polling export' })

    const fields = (result as { info?: { fields?: string[] } }).info?.fields || []
    const items = (result as { info?: { items?: unknown[][] } }).info?.items || []
    const firstRow = items[0] || []
    const sample: Record<string, unknown> = {}
    fields.forEach((f: string, i: number) => { sample[f] = firstRow[i] })

    return NextResponse.json({
      fields,
      totalRows: items.length,
      firstRow: sample,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) })
  }
}
