'use client'

import Image from 'next/image'
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-[#13244f] text-white py-12 md:py-16 px-4 md:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mb-8 md:mb-10">
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-bold text-sm mb-3 md:mb-4">
              Ficou alguma dúvida?
            </h3>
            <a
              href="mailto:suporte@desafiodiabetes.com"
              className="flex items-start gap-3 bg-white/10 rounded-xl p-3 hover:bg-white/20 transition"
            >
              <div>
                <p className="text-sm font-medium">Fale com a gente</p>
                <p className="text-xs opacity-60 mt-0.5">
                  suporte@desafiodiabetes.com
                </p>
              </div>
            </a>
          </div>
          <div>
            <h3 className="font-bold mb-3 text-sm">Suplementos</h3>
            {['Diabetes Tipo 2', 'Pré-diabetes'].map((item) => (
              <span
                key={item}
                className="block text-xs py-1.5 opacity-70 hover:opacity-100 transition"
              >
                {item}
              </span>
            ))}
          </div>
          <div>
            <h3 className="font-bold mb-3 text-sm">Desafio Diabetes</h3>
            <Link
              href="/suplementos"
              className="block text-xs py-1.5 opacity-70 hover:opacity-100 transition"
            >
              Home
            </Link>
            <span className="block text-xs py-1.5 opacity-70 hover:opacity-100 transition">
              Perguntas Frequentes
            </span>
            <span className="block text-xs py-1.5 opacity-70 hover:opacity-100 transition">
              Blog
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <Image
              src="/logo-principal.png"
              alt="Desafio Diabetes"
              width={600}
              height={196}
              className="h-10 w-auto brightness-0 invert"
            />
            <div className="flex gap-4">
              <span className="opacity-70 hover:opacity-100 transition">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="2"
                    y="2"
                    width="20"
                    height="20"
                    rx="5"
                    stroke="white"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="4"
                    stroke="white"
                    strokeWidth="1.5"
                  />
                  <circle cx="17.5" cy="6.5" r="1" fill="white" />
                </svg>
              </span>
              <span className="opacity-70 hover:opacity-100 transition">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
          </div>
        </div>
        <div className="border-t border-white/20 pt-5 flex flex-col md:flex-row justify-between gap-3">
          <div className="flex gap-3 md:gap-4">
            <span className="text-xs opacity-60 hover:opacity-100">
              Política de privacidade
            </span>
            <Link
              href="/termos-de-uso"
              className="text-xs opacity-60 hover:opacity-100"
            >
              Termos de Uso
            </Link>
          </div>
          <p className="text-xs opacity-40 md:max-w-sm leading-relaxed">
            O Desafio Diabetes não é uma farmácia. Suplementos manipulados por
            farmácias credenciadas pela ANVISA.
            <br />
            Copyright 2026 Desafio Diabetes™. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
