'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

type Banner = {
  id: string
  horizontal: string
  vertical: string
  alt: string
}

const banners: Banner[] = [
  { id: 'neuropatia', horizontal: '/banners/banner-neuropatia-horizontal.png', vertical: '/banners/banner-neuropatia-vertical.png', alt: 'Neuropatia — fórmula personalizada Desafio Diabetes' },
  { id: 'omega3', horizontal: '/banners/banner-omega3-horizontal.png', vertical: '/banners/banner-omega3-vertical.png', alt: 'Ômega 3 Desafio Diabetes' },
  { id: 'berberina', horizontal: '/banners/banner-berberina-horizontal.png', vertical: '/banners/banner-berberina-vertical.png', alt: 'Berberina Desafio Diabetes' },
  { id: 'resistencia-insulina', horizontal: '/banners/banner-resistencia-insulina-horizontal.png', vertical: '/banners/banner-resistencia-insulina-vertical.png', alt: 'Resistência à Insulina Desafio Diabetes' },
]

export default function BannerCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const banner = banners[currentIndex]

  const goTo = (index: number) => {
    const len = banners.length
    setCurrentIndex(((index % len) + len) % len)
  }

  const goNext = () => goTo(currentIndex + 1)
  const goPrev = () => goTo(currentIndex - 1)

  return (
    <div className="w-full">
      <div className="relative w-full rounded-2xl overflow-hidden aspect-square md:aspect-[3712/1152]">
        <Image
          src={banner.horizontal}
          alt={banner.alt}
          fill
          priority={currentIndex === 0}
          sizes="(max-width: 767px) 0px, (max-width: 1152px) 100vw, 1152px"
          className="hidden md:block object-cover pointer-events-none"
        />
        <Image
          src={banner.vertical}
          alt={banner.alt}
          fill
          priority={currentIndex === 0}
          sizes="(min-width: 768px) 0px, 100vw"
          className="block md:hidden object-cover pointer-events-none"
        />

        <Link
          href={`/suplementos/${banner.id}`}
          className="absolute inset-0 z-10"
          aria-label={`Ver ${banner.alt}`}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            goPrev()
          }}
          className="absolute left-3 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#13244f] text-2xl leading-none hover:bg-white transition"
          aria-label="Banner anterior"
        >
          ‹
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            goNext()
          }}
          className="absolute right-3 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#13244f] text-2xl leading-none hover:bg-white transition"
          aria-label="Próximo banner"
        >
          ›
        </button>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2" role="tablist" aria-label="Banners">
        {banners.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={index === currentIndex}
            aria-label={`Ir para banner ${index + 1}: ${item.alt}`}
            onClick={() => goTo(index)}
            className={`h-2.5 w-2.5 rounded-full transition ${
              index === currentIndex ? 'bg-[#13244f]' : 'bg-[#13244f]/20 hover:bg-[#13244f]/40'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
