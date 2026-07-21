'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import BannerCarousel from '@/components/BannerCarousel'
import CategoryCarousel from '@/components/CategoryCarousel'

export default function SuplementosPage() {
  return (
    <>
      <Header />

      <section className="bg-white py-8 md:py-12 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <BannerCarousel />
        </div>
      </section>

      <section className="bg-white py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <CategoryCarousel />
        </div>
      </section>

      <section className="relative bg-[#f4001e] overflow-hidden">
        {/* Efeito de fundo — brilho radial atrás do Dr. Turí */}
        <div
          className="pointer-events-none absolute right-0 md:right-10 top-1/2 -translate-y-1/2 w-[28rem] h-[28rem] md:w-[36rem] md:h-[36rem] rounded-full bg-[#ff6666]/40 blur-3xl"
          aria-hidden
        />

        {/* Marca d'água — canto superior direito, colada na divisa com a seção branca */}
        <img
          src="/marca-dagua.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-3 right-3 md:top-5 md:right-6 z-10 w-24 sm:w-32 md:w-36 h-auto opacity-70 select-none"
        />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-32 md:pt-36 md:min-h-[560px] lg:min-h-[640px] grid md:grid-cols-2 gap-14 md:gap-10 md:items-stretch">
          {/* Texto — no mobile, bem espaçado da marca d'água e da foto; no desktop, centralizado no meio da coluna esquerda */}
          <div className="order-1 self-start md:self-center flex flex-col items-center justify-start md:justify-center gap-8 md:gap-8 text-center md:px-4 lg:px-8">
            <h2 className="font-title-alt font-bold text-[2.15rem] sm:text-[2.6rem] md:text-[3.45rem] lg:text-[4.3rem] leading-tight text-white max-w-md md:max-w-lg">
              A ciência da <span className="italic text-[#a30000]">reversão</span> do diabetes.
            </h2>
            <Link
              href="/institucional#quem-somos"
              className="inline-flex justify-center bg-[#a30000] hover:opacity-90 text-white rounded-full px-8 py-3 font-semibold text-base transition"
            >
              Quem somos
            </Link>
          </div>

          {/* Foto do Dr. Turí — encostada na base da seção, onde o vermelho encontra o azul do rodapé (mobile e desktop) */}
          <div className="order-2 self-end flex justify-center md:justify-end mt-2 md:mt-0">
            <img
              src="/dr-turi.png"
              alt="Dr. Turí Souza"
              className="w-72 sm:w-96 md:w-[30rem] lg:w-[36rem] h-auto object-contain transition-transform duration-500 ease-out hover:-translate-y-3 hover:scale-105"
            />
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
