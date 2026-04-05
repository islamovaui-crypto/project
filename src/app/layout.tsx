import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GetCourse Dashboard',
  description: 'Аналитика участников образовательного проекта',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  )
}
