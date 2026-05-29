import type { Metadata } from 'next'
import { Merriweather } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['300', '400', '700', '900'],
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
      <body className={merriweather.className}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
