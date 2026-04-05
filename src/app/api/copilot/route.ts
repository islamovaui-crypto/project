export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/prisma'
import { getExcludedUserIds } from '@/lib/excluded'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен' }, { status: 503 })
  }

  const client = new Anthropic()
  const { message, context } = await req.json()
  if (!message) return NextResponse.json({ error: 'Нет вопроса' }, { status: 400 })

  const excludedIds = await getExcludedUserIds()
  const excludedArr = [...excludedIds]

  // Gather aggregated stats for context
  const [
    usersTotal,
    ordersTotal,
    paidOrders,
    totalRevenue,
    lessonsTotal,
    lessonsCompleted,
    surveysTotal,
  ] = await Promise.all([
    prisma.gcUser.count({ where: { id: { notIn: excludedArr } } }),
    prisma.order.count({ where: { userId: { notIn: excludedArr } } }),
    prisma.order.count({ where: { userId: { notIn: excludedArr }, isPaid: true } }),
    prisma.order.aggregate({
      where: { userId: { notIn: excludedArr }, isPaid: true },
      _sum: { amount: true },
    }),
    prisma.lessonProgress.count({ where: { userId: { notIn: excludedArr } } }),
    prisma.lessonProgress.count({ where: { userId: { notIn: excludedArr }, completed: true } }),
    prisma.survey.count(),
  ])

  const products = await prisma.product.findMany({ select: { id: true, name: true } })
  const conversionRate =
    usersTotal > 0 ? ((paidOrders / usersTotal) * 100).toFixed(1) + '%' : 'н/д'
  const completionRate =
    lessonsTotal > 0 ? ((lessonsCompleted / lessonsTotal) * 100).toFixed(1) + '%' : 'н/д'

  const systemPrompt = `Ты — AI-аналитик образовательного проекта. Ты помогаешь команде интерпретировать данные об участниках с платформы GetCourse.

Текущая статистика (исключены тестовые/командные аккаунты):
- Участников: ${usersTotal}
- Заказов всего: ${ordersTotal}, из них оплачено: ${paidOrders}
- Конверсия в оплату: ${conversionRate}
- Общая выручка: ${(totalRevenue._sum.amount || 0).toLocaleString('ru-RU')} руб.
- Записей о прогрессе по урокам: ${lessonsTotal}, завершено: ${lessonsCompleted} (${completionRate})
- Анкет: ${surveysTotal}
- Продукты: ${products.map((p) => p.name).join(', ') || 'не указаны'}
${context ? `\nДополнительный контекст от пользователя: ${context}` : ''}

Отвечай конкретно, опирайся на цифры. Если данных недостаточно для ответа — скажи об этом. Отвечай на русском.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: message }],
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ reply })
}
