export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import { getExcludedUserIds } from '@/lib/excluded'
import Anthropic from '@anthropic-ai/sdk'

export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key') {
    return NextResponse.json({ insights: [], stats: null })
  }
  const client = new Anthropic()
  const authError = await requireAuth()
  if (authError) return authError

  const excludedIds = await getExcludedUserIds()
  const excludedArr = [...excludedIds]

  const [usersTotal, ordersTotal, paidOrders, lessonsTotal, lessonsCompleted, lastSync] =
    await Promise.all([
      prisma.gcUser.count({ where: { id: { notIn: excludedArr } } }),
      prisma.order.count({ where: { userId: { notIn: excludedArr } } }),
      prisma.order.count({ where: { userId: { notIn: excludedArr }, isPaid: true } }),
      prisma.lessonProgress.count({ where: { userId: { notIn: excludedArr } } }),
      prisma.lessonProgress.count({ where: { userId: { notIn: excludedArr }, completed: true } }),
      prisma.syncLog.findFirst({ where: { status: 'success' }, orderBy: { finishedAt: 'desc' } }),
    ])

  // Users who paid but never opened a lesson
  const paidUserIds = await prisma.order
    .findMany({
      where: { userId: { notIn: excludedArr }, isPaid: true },
      select: { userId: true },
    })
    .then((rows) => rows.map((r) => r.userId))

  const inactiveAfterPay = await prisma.gcUser.count({
    where: {
      id: { in: paidUserIds },
      lessonProgress: { none: {} },
    },
  })

  const conversionRate = usersTotal > 0 ? (paidOrders / usersTotal) * 100 : 0
  const completionRate = lessonsTotal > 0 ? (lessonsCompleted / lessonsTotal) * 100 : 0

  const statsText = `
- Участников: ${usersTotal}
- Конверсия в оплату: ${conversionRate.toFixed(1)}%
- Завершили уроки: ${completionRate.toFixed(1)}%
- Оплатили, но ни разу не открыли урок: ${inactiveAfterPay} человек
- Последняя синхронизация: ${lastSync?.finishedAt?.toLocaleString('ru-RU') || 'не было'}
`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Ты аналитик образовательного проекта. На основе этих данных сформулируй 2-3 конкретных инсайта для команды — что важно обратить внимание прямо сейчас. Каждый инсайт: одно предложение + цифра. Отвечай на русском.\n\nДанные:${statsText}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Parse into array of insight strings
  const insights = text
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 20)
    .slice(0, 3)

  return NextResponse.json({ insights, stats: { usersTotal, conversionRate, completionRate, inactiveAfterPay } })
}
