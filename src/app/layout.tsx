import type { Metadata } from 'next'
import { Anton, Poppins } from 'next/font/google'
import { Toaster } from 'sonner'
import { gobold } from '@/fonts'
import './globals.css'

const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-anton',
  display: 'swap',
})

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Desafio Diabetes — Controle o diabetes com suplementos personalizados',
  description: 'Protocolo 100% online com suplementos de baixo índice glicêmico, dieta individualizada e acompanhamento profissional para diabetes tipo 2 e pré-diabetes.',
  openGraph: {
    title: 'Desafio Diabetes — Controle o diabetes com suplementos personalizados',
    description: 'Protocolo 100% online com suplementos de baixo índice glicêmico e dieta individualizada para diabetes tipo 2 e pré-diabetes.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${anton.variable} ${poppins.variable} ${gobold.variable} font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
