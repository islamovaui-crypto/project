import { chromium, Browser, BrowserContext } from 'playwright'

const SCRAPER_DOMAIN = process.env.GC_SCRAPER_DOMAIN || 'platform.aibasis.ru'
const BASE = `https://${SCRAPER_DOMAIN}`

let browser: Browser | null = null
let context: BrowserContext | null = null
let lastLogin = 0
const SESSION_TTL = 30 * 60 * 1000 // 30 minutes

async function getContext(): Promise<BrowserContext> {
  if (context && Date.now() - lastLogin < SESSION_TTL) {
    return context
  }
  if (context) await context.close()
  if (browser) await browser.close()

  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })

  await login(context)
  lastLogin = Date.now()
  return context
}

async function login(ctx: BrowserContext) {
  const login = process.env.GC_LOGIN
  const password = process.env.GC_PASSWORD
  if (!login || !password) throw new Error('GC_LOGIN/GC_PASSWORD not set')

  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE}/cms/system/login`, { waitUntil: 'networkidle', timeout: 20000 })
  } catch (e) {
    console.log('Login goto warning:', e instanceof Error ? e.message.slice(0, 100) : e)
  }

  // Wait for xdget JS to render the form
  await page.waitForTimeout(3000)

  const loginForm = '.xdget-loginUserForm .login-form'

  // Fill the email and password fields by placeholder text (xdget uses dynamic name attrs)
  const emailSel = `${loginForm} input[placeholder*="адрес" i], ${loginForm} input[type="email"], ${loginForm} input[name*="email" i]`
  const passSel = `${loginForm} input[placeholder*="пароль" i], ${loginForm} input[type="password"], ${loginForm} input[name*="pass" i]`

  await page.waitForSelector(emailSel, { timeout: 10000 })
  await page.fill(emailSel, login)
  await page.fill(passSel, password)


  // Click submit and wait for navigation
  await Promise.all([
    page.waitForURL((url) => !url.toString().includes('/cms/system/login'), { timeout: 20000 }).catch(() => null),
    page.click(`${loginForm} button.btn-success`),
  ])

  await page.waitForTimeout(2000)

  // Verify we're logged in by checking we can access admin
  try {
    await page.goto(`${BASE}/teach/control/stream`, { waitUntil: 'load', timeout: 20000 })
  } catch (e) {
    // ERR_ABORTED is OK if it was due to a redirect — check final URL
    console.log('Verify nav warning:', e instanceof Error ? e.message.slice(0, 100) : e)
  }
  const finalUrl = page.url()
  if (/login/i.test(finalUrl)) {
    await page.screenshot({ path: '/tmp/gc-after-login.png' })
    throw new Error(`Login failed: redirected to ${finalUrl}`)
  }

  await page.close()
}

export interface LessonStat {
  lessonId: number
  title: string
  status: string
  entered: number       // зашли
  answered: number      // ответили
  passed: number | null // прошли (null если "нет задания")
  openDate?: string | null // дата открытия (текст)
}

/**
 * Fetch lesson open date from the lesson page.
 * Looks for patterns like "Дата и время начала" or "Запуск".
 */
export async function fetchLessonOpenDate(lessonId: number): Promise<string | null> {
  const ctx = await getContext()
  const page = await ctx.newPage()
  try {
    const url = `${BASE}/pl/teach/control/lesson/view?id=${lessonId}&editMode=0`
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    } catch {}
    await page.waitForTimeout(1500)

    const dateText = await page.evaluate(() => {
      const text = document.body?.innerText || ''
      // "Дата и время начала Пн 30 Мар 10:00" or similar
      const m = text.match(/Дата[^\n]*начала[^\n]*([А-Я][а-я]+\s*\d+\s*[А-Я][а-я]+(?:\s+\d{4})?(?:\s+\d{1,2}:\d{2})?)/i)
      if (m) return m[1].trim()
      // Fallback: "Открывается DD.MM.YYYY"
      const m2 = text.match(/Откр[а-я]*\s+(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i)
      if (m2) return m2[1].trim()
      return null
    })

    return dateText
  } finally {
    await page.close()
  }
}

/**
 * Fetch lesson stats for a training module page (lessons within a module).
 * Module URL is something like /pl/teach/control/lesson/index?moduleId=XXX&streamId=YYY
 * But we use a simpler approach: get them from /teach/control/stream/view/id/{streamId} statistics page.
 */
export async function fetchTrainingStats(streamId: number): Promise<LessonStat[]> {
  const ctx = await getContext()
  const page = await ctx.newPage()

  try {
    // Statistics page for a stream
    const url = `${BASE}/teach/control/stream/stat/id/${streamId}`
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    } catch (e) {
      console.log('Stats nav warning:', e instanceof Error ? e.message.slice(0, 100) : e)
    }

    await page.waitForTimeout(2000)

    // Wait for the table with lessons
    await page.waitForSelector('table', { timeout: 15000 })

    // Debug: get tables on the page
    const debug = await page.evaluate(() => {
      const tables = document.querySelectorAll('table')
      const result: { tableIdx: number; rowCount: number; firstRow: string[] }[] = []
      tables.forEach((tbl, i) => {
        const rows = tbl.querySelectorAll('tr')
        const firstDataRow = rows[1] || rows[0]
        const cells = firstDataRow ? Array.from(firstDataRow.querySelectorAll('td, th')).map(c => (c.textContent || '').trim().slice(0, 50)) : []
        result.push({ tableIdx: i, rowCount: rows.length, firstRow: cells })
      })
      return result
    })

    // Extract lessons. The lessons table has 6 columns:
    // [icon, title, status, entered, answered, passed]
    const stats: LessonStat[] = await page.evaluate(() => {
      const rows: LessonStat[] = []
      const num = (el: Element | null | undefined): number | null => {
        if (!el) return null
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim()
        const m = txt.match(/\d+/)
        return m ? parseInt(m[0]) : null
      }

      // Pick the table where rows have 6+ columns AND lesson links
      const tables = document.querySelectorAll('table')
      let targetTable: HTMLTableElement | null = null
      for (const tbl of Array.from(tables)) {
        const trs = tbl.querySelectorAll('tbody tr, tr')
        let hasLesson = false
        let hasEnoughCells = false
        for (const tr of Array.from(trs)) {
          const cells = tr.querySelectorAll('td')
          if (cells.length >= 5) hasEnoughCells = true
          if (tr.querySelector('a[href*="lesson"]')) hasLesson = true
          if (hasLesson && hasEnoughCells) break
        }
        if (hasLesson && hasEnoughCells) {
          targetTable = tbl as HTMLTableElement
          break
        }
      }

      if (!targetTable) return rows

      const trs = targetTable.querySelectorAll('tbody tr, tr')
      trs.forEach((tr) => {
        const cells = tr.querySelectorAll('td')
        if (cells.length < 5) return
        const link = tr.querySelector('a[href*="lesson"]') as HTMLAnchorElement | null
        if (!link) return
        const idMatch = link.href.match(/id[/=](\d+)/)
        if (!idMatch) return

        // Detect column offset: if first td has only an icon (no number, short text), shift by 1
        const firstCellText = (cells[0]?.textContent || '').trim()
        const offset = firstCellText.length < 3 ? 1 : 0

        rows.push({
          lessonId: parseInt(idMatch[1]),
          title: link.textContent?.trim() || '',
          status: (cells[offset + 1]?.textContent || '').trim(),
          entered: num(cells[offset + 2]) ?? 0,
          answered: num(cells[offset + 3]) ?? 0,
          passed: num(cells[offset + 4]),
        } as LessonStat)
      })
      return rows
    })

    console.log('Tables debug:', JSON.stringify(debug))

    return stats
  } finally {
    await page.close()
  }
}

/**
 * Fetch list of users who have visited (entered) a specific lesson.
 * Uses GetCourse user filter URL.
 */
export async function fetchLessonVisitors(
  streamId: number,
  lessonId: number,
  checkerType: 'enter' | 'completed' = 'enter',
): Promise<{ userId: string; email: string }[]> {
  const ctx = await getContext()
  const page = await ctx.newPage()

  try {
    const rule = {
      type: 'user_visitlessonrule',
      inverted: 0,
      params: {
        value: { selected_id: streamId },
        lessonId: { selected_id: lessonId },
        status: null,
        checkerType: { selected_id: checkerType },
      },
    }
    const ruleStr = encodeURIComponent(JSON.stringify(rule))

    const visitors: { userId: string; email: string }[] = []
    const seen = new Set<string>()
    let pageNum = 1
    const maxPages = 30

    while (pageNum <= maxPages) {
      const url = `${BASE}/pl/user/user?uc[rule_string]=${ruleStr}&page=${pageNum}`
      await page.goto(url, { waitUntil: 'domcontentloaded' })

      const pageVisitors = await page.evaluate(() => {
        const users: { userId: string; email: string }[] = []
        const links = document.querySelectorAll('a[href*="/user/control/user/update/id/"]')
        links.forEach((link) => {
          const href = (link as HTMLAnchorElement).href
          const m = href.match(/\/id\/(\d+)/)
          if (!m) return
          const userId = m[1]
          // find email in same row
          const tr = link.closest('tr')
          if (!tr) return
          const text = tr.textContent || ''
          const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
          if (emailMatch) users.push({ userId, email: emailMatch[0] })
        })
        return users
      })

      let added = 0
      for (const v of pageVisitors) {
        if (!seen.has(v.userId)) {
          seen.add(v.userId)
          visitors.push(v)
          added++
        }
      }

      if (added === 0) break
      pageNum++
    }

    return visitors
  } finally {
    await page.close()
  }
}

export async function closeBrowser() {
  if (context) { await context.close(); context = null }
  if (browser) { await browser.close(); browser = null }
  lastLogin = 0
}
