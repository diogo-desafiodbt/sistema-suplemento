import Image from 'next/image'
import imgLogoBranca from '@/../public/logo-branca.png'
import { FormAcesso } from './form-acesso'

export const metadata = {
  title: 'Em breve — Desafio Diabetes',
  description: 'Estamos preparando algo novo.',
  robots: { index: false, follow: false },
}

/**
 * Tela de pré-lançamento. É para onde o middleware manda todo mundo que
 * ainda não tem o cookie de acesso da equipe — o conteúdo real nunca chega
 * a ser renderizado para quem cai aqui.
 */
export default function EmBrevePage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#13244f] px-6 text-center">
      {/* brilho de fundo, bem sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70vmax] w-[70vmax] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(244,0,30,0.45) 0%, rgba(19,36,79,0) 65%)',
          animation: 'respira 7s ease-in-out infinite',
        }}
      />

      <div className="relative flex flex-col items-center">
        <div className="logo-entrada">
          <Image
            src={imgLogoBranca}
            alt="Desafio Diabetes"
            width={260}
            height={80}
            priority
            className="h-auto w-[200px] sm:w-[240px]"
          />
        </div>

        <h1 className="frase-entrada mt-10 max-w-[22ch] text-balance font-semibold text-3xl text-[#f5f0eb] leading-[1.15] tracking-tight sm:text-4xl">
          Suplemento comum, não é suplemento para DIABÉTICO
        </h1>

        <p className="frase-entrada-2 mt-4 max-w-[38ch] text-[#f5f0eb]/60 text-sm sm:text-base">
          Estamos finalizando os últimos detalhes. Em breve, no ar.
        </p>

        <div className="botao-entrada mt-12">
          <FormAcesso />
        </div>
      </div>

      <p className="absolute bottom-6 text-[#f5f0eb]/25 text-xs">
        © {new Date().getFullYear()} Desafio Diabetes
      </p>
    </main>
  )
}
