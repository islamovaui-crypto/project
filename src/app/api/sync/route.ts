export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import { fetchUsers, fetchDeals, fetchPayments } from '@/lib/getcourse'

export async function POST() {
  const authError = await requireAuth()
  if (authError) return authError

  const log = await prisma.syncLog.create({ data: { status: 'running' } })
  runSync(log.id).catch(console.error)
  return NextResponse.json({ ok: true, syncId: log.id })
}

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  const latest = await prisma.syncLog.findFirst({ orderBy: { startedAt: 'desc' } })
  return NextResponse.json({ log: latest })
}

function str(v: unknown): string {
  return v != null && v !== '' ? String(v) : ''
}

function parseDate(v: unknown): Date | null {
  if (!v || v === '') return null
  try { return new Date(String(v)) } catch { return null }
}

async function runSync(logId: string) {
  let usersCount = 0
  let ordersCount = 0
  let paymentsCount = 0

  try {
    const lastSync = await prisma.syncLog.findFirst({
      where: { status: 'success' },
      orderBy: { finishedAt: 'desc' },
    })
    const fromDate = lastSync?.finishedAt
      ? lastSync.finishedAt.toISOString().split('T')[0]
      : undefined

    // ── Users ──────────────────────────────────────────────────────
    // GetCourse fields: id, Email, Имя, Фамилия, Телефон, Страна, Город, Создан
    const users = await fetchUsers(fromDate)
    if (users.length > 0) {
      console.log('📋 USER FIELDS:', Object.keys(users[0]))
      console.log('📋 FIRST USER:', JSON.stringify(users[0]))
    }
    for (const u of users) {
      const id = str(u['id'])
      if (!id) continue

      await prisma.gcUser.upsert({
        where: { id },
        create: {
          id,
          email: str(u['Email']),
          phone: str(u['Телефон']),
          telegram: str(u['Username_Telegram']) || str(u['UserID_Telegram']),
          firstName: str(u['Имя']),
          lastName: str(u['Фамилия']),
          birthDate: str(u['Дата рождения']),
          age: str(u['Возраст']),
          city: str(u['Город']),
          country: str(u['Страна']),
          groups: [],
          tags: [],
          gcCreatedAt: parseDate(u['Создан']),
        },
        update: {
          email: str(u['Email']),
          phone: str(u['Телефон']),
          telegram: str(u['Username_Telegram']) || str(u['UserID_Telegram']),
          firstName: str(u['Имя']),
          lastName: str(u['Фамилия']),
          birthDate: str(u['Дата рождения']),
          age: str(u['Возраст']),
          city: str(u['Город']),
          country: str(u['Страна']),
          syncedAt: new Date(),
        },
      })
      usersCount++
    }

    console.log(`✓ Users synced: ${usersCount}`)
    await new Promise((r) => setTimeout(r, 3000))

    // ── Deals (Orders) ─────────────────────────────────────────────
    // GetCourse fields: ID заказа, Номер, ID пользователя, Email, Состав заказа,
    //   Статус, Стоимость RUB, Оплачен, Дата создания, Дата оплаты, Менеджер
    const deals = await fetchDeals(fromDate)
    if (deals.length > 0) {
      console.log('📋 DEALS FIELDS:', Object.keys(deals[0]))
      console.log('📋 FIRST DEAL:', JSON.stringify(deals[0]))
    } else {
      console.log('📋 DEALS: 0 records returned from GetCourse')
    }
    for (const d of deals) {
      // Try both possible field name variants
      const id = str(d['ID заказа']) || str(d['id']) || str(d['ID'])
      if (!id) continue

      const userId = str(d['ID пользователя']) || str(d['userId']) || str(d['user_id'])
      if (!userId) continue

      // Ensure user exists
      await prisma.gcUser.upsert({
        where: { id: userId },
        create: { id: userId, email: str(d['Email']) },
        update: {},
      })

      // Product from "Состав заказа"
      const productTitle = str(d['Состав заказа'])
      const productId = productTitle
        ? productTitle.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, '_').slice(0, 60)
        : null

      if (productId && productTitle) {
        await prisma.product.upsert({
          where: { id: productId },
          create: { id: productId, name: productTitle },
          update: { name: productTitle },
        })
      }

      const paidVal = d['Оплачен']
      const isPaid = paidVal === 'Да' || paidVal === true || paidVal === 'Частично' || str(d['Статус']) === 'Частично оплачен' || str(d['Статус']) === 'part_payed'
      const amountRaw = str(d['Стоимость, RUB']).replace(',', '.')
      const amount = amountRaw ? parseFloat(amountRaw) : null

      await prisma.order.upsert({
        where: { id },
        create: {
          id,
          dealNumber: str(d['Номер']),
          userId,
          productId,
          productTitle,
          amount,
          status: str(d['Статус']) || 'unknown',
          isPaid,
          managerEmail: str(d['Менеджер']),
          gcCreatedAt: parseDate(d['Дата создания']),
          paidAt: parseDate(d['Дата оплаты']),
        },
        update: {
          status: str(d['Статус']) || 'unknown',
          isPaid,
          paidAt: parseDate(d['Дата оплаты']),
          syncedAt: new Date(),
        },
      })
      ordersCount++
    }

    console.log(`✓ Orders synced: ${ordersCount}`)
    await new Promise((r) => setTimeout(r, 3000))

    // ── Payments ───────────────────────────────────────────────────
    const payments = await fetchPayments(fromDate)
    paymentsCount = payments.length
    console.log(`✓ Payments synced: ${paymentsCount}`)

    await prisma.syncLog.update({
      where: { id: logId },
      data: { status: 'success', finishedAt: new Date(), usersCount, ordersCount, paymentsCount },
    })
  } catch (err) {
    console.error('Sync error:', err)
    await prisma.syncLog.update({
      where: { id: logId },
      data: { status: 'error', finishedAt: new Date(), usersCount, ordersCount, error: String(err) },
    })
  }
}
