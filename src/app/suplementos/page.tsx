'use client'

import Link from 'next/link'
import Footer from '@/components/Footer'
import Header from '@/components/Header'

const benefits = [
  {
    title: 'Farmácia autorizada pela Anvisa',
    detail: 'Elaborados e vendidos por farmácias de manipulação credenciadas.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6l7-3z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 8v6M9 11h6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: 'Compra única ou assinatura',
    detail: 'Você escolhe como prefere receber — sem compromisso escondido.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 7h13l2 10H6L4 7z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M8 20a1.2 1.2 0 1 0 0-2.4A1.2 1.2 0 0 0 8 20zM17 20a1.2 1.2 0 1 0 0-2.4A1.2 1.2 0 0 0 17 20z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    title: 'Baixo índice glicêmico',
    detail:
      'Formulados para não disparar o açúcar no sangue como suplementos comuns.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 8l5 5 3.5-3.5L20 17"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15 17h5v-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: 'Base científica',
    detail: 'Componentes estudados e indicados após avaliação do seu perfil.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M10 3h4v7l4 7v2H6v-2l4-7V3z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 3h6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M9.5 13h5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
]

const testimonials = [
  {
    title: 'Glicada de 11,6 para 5,1',
    text: 'Era pra tomar vários remédios e insulina. Hoje tomo bem menos — e me sinto melhor no dia a dia.',
    name: 'Alexandre, 47 anos',
  },
  {
    title: 'Glicada de 7,2% para 5,0%',
    text: 'Depois que segui o protocolo com disciplina, meus exames melhoraram e perdi 17 kg.',
    name: 'Giselle, 43 anos',
  },
  {
    title: 'Glicada 18 — em 3 meses tudo mudou',
    text: 'Meu esposo estava com glicose acima de 600. Em poucos meses os números baixaram bastante.',
    name: 'Pretinha F.',
  },
  {
    title: 'Prestes a tomar insulina — glicose 5,8',
    text: 'O médico avisou sobre insulina. Em 3 meses emagreci 11 kg e a glicose voltou a um nível bem melhor.',
    name: 'Carlos R.',
  },
]

function QuizCta({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/quiz"
      className={`inline-flex items-center justify-center min-h-14 px-8 py-4 rounded-full font-bold text-lg transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#13244f] ${className}`}
    >
      Descubra sua suplementação ideal
    </Link>
  )
}

export default function SuplementosPage() {
  return (
    <>
      <Header />

      <main className="bg-white">
        {/* 1 — Hero */}
        <section className="relative bg-[#f4001e] overflow-hidden min-h-[calc(100dvh-5rem)] flex flex-col">
          <div
            className="pointer-events-none absolute right-0 md:right-10 top-1/2 -translate-y-1/2 w-[28rem] h-[28rem] md:w-[36rem] md:h-[36rem] rounded-full bg-[#ff6666]/40 blur-3xl"
            aria-hidden
          />

          <img
            src="/marca-dagua.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute top-3 right-3 md:top-5 md:right-6 z-10 w-24 sm:w-32 md:w-36 h-auto opacity-70 select-none"
          />

          <div className="relative flex-1 max-w-6xl mx-auto w-full px-4 md:px-6 pt-16 md:pt-20 grid md:grid-cols-2 gap-10 md:gap-10 md:items-stretch">
            <div className="order-1 self-center flex flex-col items-center md:items-start justify-center gap-6 md:gap-8 text-center md:text-left md:px-4 lg:px-8">
              <h1 className="font-title-alt font-bold text-[2.15rem] sm:text-[2.6rem] md:text-[3.45rem] lg:text-[4.3rem] leading-tight text-white max-w-md md:max-w-lg">
                Suplementação{' '}
                <span className="italic text-[#a30000]">personalizada</span>{' '}
                para diabéticos
              </h1>
              <Link
                href="/quiz"
                className="inline-flex justify-center bg-[#a30000] hover:opacity-90 text-white rounded-full px-8 py-3.5 font-semibold text-base transition"
              >
                Descubra sua suplementação ideal
              </Link>
            </div>

            <div className="order-2 self-end flex justify-center md:justify-end mt-2 md:mt-0">
              <img
                src="/dr-turi.png"
                alt="Dr. Turí Souza"
                className="w-72 sm:w-96 md:w-[30rem] lg:w-[36rem] h-auto object-contain transition-transform duration-500 ease-out hover:-translate-y-3 hover:scale-105"
              />
            </div>
          </div>
        </section>

        {/* 2 — Benefícios */}
        <section className="bg-[#f5f0eb] px-5 md:px-6 py-14 md:py-16">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-display text-2xl md:text-3xl text-[#13244f] text-center mb-8 md:mb-10">
              Por que escolher o Desafio Diabetes
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
              {benefits.map((b) => (
                <li
                  key={b.title}
                  className="bg-white rounded-2xl border border-gray-200 p-6 md:p-7 flex flex-col gap-3"
                >
                  <span
                    className="w-11 h-11 rounded-full bg-[#13244f] text-white flex items-center justify-center"
                    aria-hidden
                  >
                    {b.icon}
                  </span>
                  <p className="text-lg font-bold text-[#13244f] leading-snug">
                    {b.title}
                  </p>
                  <p className="text-base text-[#13244f]/80 leading-relaxed">
                    {b.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3 — Depoimentos */}
        <section className="py-14 md:py-16 px-5 md:px-6 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8 md:mb-10">
              <p className="text-sm font-bold tracking-wide text-[#f4001e] uppercase mb-2">
                Depoimentos
              </p>
              <h2 className="font-display text-2xl md:text-3xl text-[#13244f]">
                Histórias de quem já começou
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
              {testimonials.map((t) => (
                <article
                  key={t.title}
                  className="bg-[#f5f5f0] rounded-2xl p-6 md:p-7 flex flex-col gap-4 border border-gray-100"
                >
                  <p className="font-bold text-[#13244f] text-xl leading-snug">
                    &ldquo;{t.title}&rdquo;
                  </p>
                  <p className="text-base md:text-lg text-[#13244f]/85 leading-relaxed flex-1">
                    {t.text}
                  </p>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                    <p className="text-base font-bold text-[#13244f]">
                      {t.name}
                    </p>
                    <span className="text-sm text-green-800 font-semibold bg-green-50 px-3 py-1.5 rounded-full">
                      Verificado
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 4 — Comparação glicêmica */}
        <section className="py-14 md:py-16 px-5 md:px-6 bg-[#f5f0eb]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 md:mb-10">
              <h2 className="font-display text-2xl md:text-3xl text-[#13244f] max-w-2xl mx-auto">
                Nem todo suplemento serve pra quem tem diabetes
              </h2>
              <p className="mt-4 text-[#13244f]/85 max-w-2xl mx-auto leading-relaxed text-lg">
                Muitos suplementos do mercado elevam o açúcar no sangue — têm
                açúcares escondidos pensados para a população geral, não para
                quem tem diabetes.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="rounded-2xl border-2 border-red-300 bg-white p-6 md:p-8">
                <h3 className="font-bold text-xl text-[#13244f] mb-5">
                  Suplemento comum
                </h3>
                <ul className="space-y-4">
                  {[
                    'Açúcares que elevam a glicose',
                    'Pico de açúcar depois da dose',
                    'Feito para o público geral',
                    'Pouco cuidado com o diabético',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-base md:text-lg text-[#13244f]"
                    >
                      <span
                        className="text-red-600 font-bold text-xl leading-none"
                        aria-hidden
                      >
                        ✕
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border-2 border-[#13244f] bg-white p-6 md:p-8">
                <h3 className="font-bold text-xl text-[#13244f] mb-5">
                  Suplemento Desafio Diabetes
                </h3>
                <ul className="space-y-4">
                  {[
                    'Sem carga de açúcar que dispara a glicose',
                    'Pensado para quem tem diabetes',
                    'Indicação após avaliação do perfil',
                    'Farmácia credenciada pela Anvisa',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-base md:text-lg text-[#13244f]"
                    >
                      <span
                        className="text-[#13244f] font-bold text-xl leading-none"
                        aria-hidden
                      >
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="text-center mt-10">
              <QuizCta className="bg-[#f4001e] text-white hover:bg-[#a30000] w-full sm:w-auto" />
            </div>
          </div>
        </section>

        {/* 5 — CTA final */}
        <section className="bg-[#13244f] px-5 md:px-6 py-14 md:py-16">
          <div className="max-w-2xl mx-auto text-center space-y-5">
            <h2 className="font-display text-2xl md:text-3xl text-white leading-snug">
              Pronto para descobrir sua suplementação?
            </h2>
            <p className="text-lg text-white/90 leading-relaxed">
              Leva poucos minutos. Sem compromisso de compra no questionário.
            </p>
            <QuizCta className="bg-white text-[#13244f] hover:bg-[#f5f0eb] w-full sm:w-auto" />
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
