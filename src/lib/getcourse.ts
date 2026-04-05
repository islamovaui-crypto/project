// Если GC_ACCOUNT содержит точку — это кастомный домен, иначе добавляем .getcourse.ru
const gcDomain = (process.env.GC_ACCOUNT || '').includes('.')
  ? process.env.GC_ACCOUNT
  : `${process.env.GC_ACCOUNT}.getcourse.ru`
const GC_BASE = `https://${gcDomain}/pl/api/account`

interface ExportResponse {
  success: boolean
  info?: {
    export_id?: number
    fields?: string[]
    items?: unknown[][]
  }
  error_code?: number
  error_message?: string
}

// GetCourse принимает даты в формате DD.MM.YYYY
function toGcDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year}`
}

async function gcFetch(path: string, params: Record<string, string> = {}): Promise<ExportResponse> {
  const url = new URL(`${GC_BASE}/${path}`)
  url.searchParams.set('key', process.env.GC_API_KEY!)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString())
  return res.json()
}

async function pollExport(exportId: number, maxAttempts = 30): Promise<ExportResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await gcFetch(`exports/${exportId}`)
    if (result.error_code === 909) {
      await new Promise((r) => setTimeout(r, 10000))
      continue
    }
    return result
  }
  throw new Error(`Export ${exportId} did not complete after ${maxAttempts} attempts`)
}

function zipFields(fields: string[], items: unknown[][]): Record<string, unknown>[] {
  return items.map((row) => {
    const obj: Record<string, unknown> = {}
    fields.forEach((field, i) => { obj[field] = row[i] })
    return obj
  })
}

async function exportData(
  type: string,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>[]> {
  const init = await gcFetch(type, params)
  if (!init.success || !init.info?.export_id) {
    throw new Error(`Failed to start export for ${type}: ${JSON.stringify(init)}`)
  }
  const result = await pollExport(init.info.export_id)
  if (!result.success || !result.info?.fields || !result.info?.items) {
    throw new Error(`Export ${type} returned no data: ${JSON.stringify(result)}`)
  }
  return zipFields(result.info.fields, result.info.items)
}

export async function fetchUsers(fromDate?: string): Promise<Record<string, unknown>[]> {
  const gcDate = fromDate ? toGcDate(fromDate) : '01.01.2020'
  return exportData('users', { 'created_at[from]': gcDate })
}

export async function fetchDeals(fromDate?: string): Promise<Record<string, unknown>[]> {
  const gcDate = fromDate ? toGcDate(fromDate) : '01.01.2020'
  return exportData('deals', { 'created_at[from]': gcDate })
}

export async function fetchPayments(fromDate?: string): Promise<Record<string, unknown>[]> {
  const gcDate = fromDate ? toGcDate(fromDate) : '01.01.2020'
  return exportData('payments', { 'created_at[from]': gcDate })
}

export async function fetchGroups(): Promise<Record<string, unknown>[]> {
  return exportData('groups')
}
