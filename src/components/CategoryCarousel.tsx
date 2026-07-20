'use client'

import Image from 'next/image'
import Link from 'next/link'

type Category = {
  id: string
  image: string
  label: string
}

const categories: Category[] = [
  { id: 'neuropatia', image: '/categorias/categoria-neuropatia.png', label: 'Neuropatia' },
  { id: 'resistencia-insulina', image: '/categorias/categoria-resistencia-insulina.png', label: 'Resistência à Insulina' },
  { id: 'berberina', image: '/categorias/categoria-berberina.png', label: 'Berberina' },
  { id: 'omega3', image: '/categorias/categoria-omega3.png', label: 'Ômega 3' },
]

export default function CategoryCarousel() {
  return (
    <div className="w-full">
      <h2 className="font-display text-2xl md:text-3xl text-[#13244f] mb-6 md:mb-8">
        Escolha seu suplemento
      </h2>

      <div className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 md:mx-0 md:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/suplementos/${category.id}`}
            className="relative rounded-2xl overflow-hidden aspect-square flex-shrink-0 snap-start w-[73vw] sm:w-[320px] md:w-[400px] group"
          >
            <Image
              src={category.image}
              alt={category.label}
              fill
              sizes="(max-width: 640px) 73vw, (max-width: 768px) 320px, 400px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <span className="absolute bottom-6 left-0 right-0 text-center text-white font-display text-xl md:text-2xl">
              {category.label}
            </span>
            <span
              className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-white flex items-center justify-center"
              aria-hidden
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="#13244f"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
