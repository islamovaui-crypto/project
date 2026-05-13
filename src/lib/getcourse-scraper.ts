/**
 * GetCourse HTML scraper for lesson progress
 *
 * Authenticates via login form, then fetches user filter pages
 * to extract who has visited specific lessons.
 */

// For scraper we use the actual customer-facing domain (custom CNAME), not the API domain
const SCRAPER_DOMAIN = process.env.GC_SCRAPER_DOMAIN || 'platform.aibasis.ru'
const BASE = `https://${SCRAPER_DOMAIN}`

let cachedCookies: string | null = null
let cachedAt = 0
const COOKIE_TTL = 30 * 60 * 1000 // 30 minutes

/**
 * Login to GetCourse and return session cookies.
 * Caches the cookie for 30 minutes.
 */
export async function gcLogin(): Promise<string> {
  if (cachedCookies && Date.now() - cachedAt < COOKIE_TTL) {
    return cachedCookies
  }

  const login = process.env.GC_LOGIN
  const password = process.env.GC_PASSWORD
  if (!login || !password) {
    throw new Error('GC_LOGIN and GC_PASSWORD must be set in .env')
  }

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  // Step 1: GET the login page to grab cookies and any hidden form fields
  const loginPagePath = '/cms/system/login'
  const loginPageRes = await fetch(`${BASE}${loginPagePath}`, {
    headers: { 'User-Agent': UA },
    redirect: 'manual',
  })
  let initialCookies = extractCookies(loginPageRes.headers)
  const loginPageHtml = await loginPageRes.text()

  // Find form action URL
  const actionMatch = loginPageHtml.match(/<form[^>]+action="([^"]+)"/i)
  const actionUrl = actionMatch ? actionMatch[1] : loginPagePath
  const fullActionUrl = actionUrl.startsWith('http') ? actionUrl : `${BASE}${actionUrl.startsWith('/') ? '' : '/'}${actionUrl}`

  // Extract any hidden inputs to forward
  const hiddenInputs: Record<string, string> = {}
  const inputRegex = /<input[^>]*type="hidden"[^>]*>/gi
  const nameRegex = /name="([^"]+)"/i
  const valueRegex = /value="([^"]*)"/i
  let m
  while ((m = inputRegex.exec(loginPageHtml)) !== null) {
    const tag = m[0]
    const nameM = tag.match(nameRegex)
    const valueM = tag.match(valueRegex)
    if (nameM) hiddenInputs[nameM[1]] = valueM ? valueM[1] : ''
  }

  // Build form
  const formData = new URLSearchParams()
  for (const [k, v] of Object.entries(hiddenInputs)) formData.set(k, v)
  // GetCourse uses field names: action=user_action, login_email, login_password
  // but these vary; try common ones
  if (!formData.has('action')) formData.set('action', 'process')
  formData.set('email', login)
  formData.set('login_email', login)
  formData.set('login', login)
  formData.set('password', password)
  formData.set('login_password', password)
  formData.set('remember', '1')

  const loginRes = await fetch(fullActionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': initialCookies,
      'User-Agent': UA,
      'Referer': `${BASE}${loginPagePath}`,
      'Origin': BASE!,
    },
    body: formData.toString(),
    redirect: 'manual',
  })

  const loginCookies = extractCookies(loginRes.headers)
  initialCookies = mergeCookies(initialCookies, loginCookies)

  // Follow redirect after login if any
  let location = loginRes.headers.get('location')
  if (location && (loginRes.status === 302 || loginRes.status === 303)) {
    if (!location.startsWith('http')) location = `${BASE}${location.startsWith('/') ? '' : '/'}${location}`
    const followRes = await fetch(location, {
      headers: { 'Cookie': initialCookies, 'User-Agent': UA },
      redirect: 'manual',
    })
    initialCookies = mergeCookies(initialCookies, extractCookies(followRes.headers))
  }

  // Verify login by hitting an admin page
  const verifyRes = await fetch(`${BASE}/pl/teach/control/stream`, {
    headers: { 'Cookie': initialCookies, 'User-Agent': UA },
    redirect: 'manual',
  })

  // If redirected to login — failed
  const verifyLocation = verifyRes.headers.get('location') || ''
  if (verifyRes.status === 302 && /login/i.test(verifyLocation)) {
    throw new Error(`Login failed: login status ${loginRes.status}, verify status ${verifyRes.status}, redirect to ${verifyLocation}, action used: ${fullActionUrl}, cookies: ${initialCookies.slice(0, 100)}`)
  }
  if (verifyRes.status >= 400) {
    throw new Error(`Login failed: verify status ${verifyRes.status}, action used: ${fullActionUrl}`)
  }

  cachedCookies = initialCookies
  cachedAt = Date.now()
  return initialCookies
}

function extractCookies(headers: Headers): string {
  const setCookie = headers.getSetCookie?.() || []
  return setCookie.map((c) => c.split(';')[0]).join('; ')
}

function mergeCookies(a: string, b: string): string {
  const map = new Map<string, string>()
  for (const cookie of [...a.split('; '), ...b.split('; ')]) {
    if (!cookie) continue
    const [key, ...val] = cookie.split('=')
    if (key) map.set(key, val.join('='))
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

/**
 * Fetch users who have visited (entered) a specific lesson.
 * Returns array of { userId, email }
 */
export async function fetchLessonVisitors(
  trainingId: number,
  lessonId: number,
  checkerType: 'enter' | 'completed' = 'enter',
): Promise<{ userId: string; email: string }[]> {
  const cookies = await gcLogin()

  const rule = {
    type: 'user_visitlessonrule',
    inverted: 0,
    params: {
      value: { selected_id: trainingId },
      lessonId: { selected_id: lessonId },
      status: null,
      checkerType: { selected_id: checkerType },
    },
  }
  const ruleStr = encodeURIComponent(JSON.stringify(rule))

  const visitors: { userId: string; email: string }[] = []
  let page = 1
  const maxPages = 20

  while (page <= maxPages) {
    const url = `${BASE}/pl/user/user?uc[rule_string]=${ruleStr}&page=${page}`
    const res = await fetch(url, {
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch page ${page}: HTTP ${res.status}`)
    }

    const html = await res.text()
    const pageVisitors = parseUserListHtml(html)

    if (pageVisitors.length === 0) break
    visitors.push(...pageVisitors)

    // Check if there's a next page link
    if (!html.includes('rel="next"') && !html.includes(`page=${page + 1}`)) break
    page++
  }

  return visitors
}

/**
 * Fetch list of lessons in a training (stream).
 * Returns array of { lessonId, title }
 */
export async function fetchTrainingLessons(streamId: number): Promise<{ lessonId: number; title: string }[]> {
  const cookies = await gcLogin()
  const url = `${BASE}/pl/teach/control/stream/view?id=${streamId}`
  const res = await fetch(url, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  })
  if (!res.ok) throw new Error(`Failed to fetch stream: HTTP ${res.status}`)
  const html = await res.text()

  // Match lesson links: /pl/teach/control/lesson/view?id=12345
  const lessons: { lessonId: number; title: string }[] = []
  const seen = new Set<number>()
  const regex = /\/teach\/control\/lesson\/view\?id=(\d+)[^>]*>([^<]*)/g
  let match
  while ((match = regex.exec(html)) !== null) {
    const id = parseInt(match[1])
    const title = match[2].trim()
    if (!seen.has(id)) {
      seen.add(id)
      lessons.push({ lessonId: id, title })
    }
  }
  return lessons
}

/**
 * Parse GetCourse user list HTML to extract user IDs and emails.
 */
function parseUserListHtml(html: string): { userId: string; email: string }[] {
  const visitors: { userId: string; email: string }[] = []

  // Match user rows: usually contain a link like /user/control/user/update/id/12345
  // and an email cell
  const rowRegex = /\/user\/control\/user\/update\/id\/(\d+)[^>]*>[\s\S]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g

  let match
  while ((match = rowRegex.exec(html)) !== null) {
    const userId = match[1]
    const email = match[2]
    if (userId && email) {
      // Avoid duplicates within page
      if (!visitors.some((v) => v.userId === userId)) {
        visitors.push({ userId, email })
      }
    }
  }

  return visitors
}
