'use client'
import { useState } from 'react'
import UsersTab from '@/components/tables/UsersTab'
import SurveysTab from '@/components/tables/SurveysTab'
import ProgressTab from '@/components/tables/ProgressTab'

const SECTIONS = [
  { id: 'users', label: 'Участники' },
  { id: 'progress', label: 'Прогресс / Доходимость' },
  { id: 'surveys', label: 'Анкеты' },
] as const

type Section = (typeof SECTIONS)[number]['id']

export default function ProductTab({ productIds, label }: { productIds: string[]; label: string }) {
  const [section, setSection] = useState<Section>('users')

  return (
    <div className="space-y-4">
      {/* Section switcher */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              section === s.id
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {section === 'users' && <UsersTab productIds={productIds} defaultPaidFilter="true" />}
      {section === 'progress' && <ProgressTab productIds={productIds} />}
      {section === 'surveys' && <SurveysTab productIds={productIds} />}
    </div>
  )
}
