
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ── CONFIG — atualizar antes de publicar ─────────────────────────────
const QUIZ_URL = '/quiz'

type PlanId = '1mes' | '3meses' | '1ano'

// TODO: substituir pelos preços reais antes de publicar
const plans: { id: PlanId; label: string; price: string; monthly: string; badge: string | null; savings: string | null }[] = [
  { id: '1mes',    label: '1 mês',    price: 'R$ 197',   monthly: 'R$ 197/mês', badge: null,           savings: null },
  { id: '3meses',  label: '3 meses',  price: 'R$ 497',   monthly: 'R$ 166/mês', badge: 'Mais popular', savings: 'Economize 15%' },
  { id: '1ano',    label: '1 ano',    price: 'R$ 1.597', monthly: 'R$ 133/mês', badge: 'Melhor valor', savings: 'Economize 32%' },
]
// ─────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

function useCountdown() {
  const [t, setT] = useState({ h: 0, m: 0, s: 0 })
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const midnight = new Date()
      midnight.setHours(24, 0, 0, 0)
      const d = midnight.getTime() - now.getTime()
      setT({ h: Math.floor(d / 3600000), m: Math.floor(d / 60000) % 60, s: Math.floor(d / 1000) % 60 })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

const usps = ['Cancele quando quiser', 'Avaliação profissional', '100% online', 'Chat com Especialistas', 'Entrega mensal grátis']

const testimonials = [
  { img: 'https://placehold.co/376x200/dae7d6/0B3B3C?text=Ana+Lima',      title: 'Reduzi minha glicemia em jejum de 138 para 97 em 4 meses!',    text: 'Nunca achei que suplementos fariam diferença assim. O protocolo é simples e meu médico ficou surpreso com os resultados.',                          name: 'Ana Lima, 54',       plan: 'Protocolo Completo' },
  { img: 'https://placehold.co/376x200/dae7d6/0B3B3C?text=Carlos+Mendes', title: 'Meu médico ficou surpreso com a queda na HbA1c.',               text: 'Fiz o quiz, recebi o protocolo personalizado e em 3 meses já sentia diferença. A Berberina fez toda a diferença.',                                name: 'Carlos Mendes, 48',  plan: 'Protocolo Completo' },
  { img: 'https://placehold.co/376x200/dae7d6/0B3B3C?text=Rosangela',     title: 'Perdi 6kg e minha disposição voltou.',                          text: 'O quiz foi o que me fez entender meu tipo metabólico. A dieta individualizada mudou minha relação com a alimentação.',                           name: 'Rosângela Souza, 61', plan: 'Protocolo Completo' },
  { img: 'https://placehold.co/376x200/dae7d6/0B3B3C?text=Marcelo+Faria', title: 'Estava em pré-diabetes há 3 anos. Em 6 meses normalizei.',       text: 'Tentei de tudo antes. O que fez diferença foi ter um protocolo feito para o meu caso específico, com acompanhamento de verdade.',               name: 'Marcelo Faria, 52',  plan: 'Protocolo Completo' },
]

const timeline = [
  {
    period: '1 a 2 meses', label: 'Adaptação',
    desc: 'O organismo começa a responder aos suplementos. Pode levar algumas semanas para notar diferença nos níveis de energia e na glicemia pós-prandial.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10" stroke="#0B3B3C" strokeWidth="2" strokeLinecap="round"/>
        <path d="M26 6l-2 4-4-2" stroke="#0B3B3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    period: '3 a 6 meses', label: 'Controle',
    desc: 'Os marcadores de glicemia começam a melhorar. Pacientes relatam mais disposição, menos picos de açúcar e mais controle sobre a alimentação.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 26V10M10 16l6-6 6 6" stroke="#0B3B3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 26h16" stroke="#0B3B3C" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    period: '6 meses em diante', label: 'Reversão',
    desc: 'Com o protocolo mantido, é possível reduzir significativamente a HbA1c e, em muitos casos, reverter o quadro de pré-diabetes.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="10" stroke="#0B3B3C" strokeWidth="2"/>
        <path d="M11 16l3.5 3.5L21 11" stroke="#0B3B3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

const whyCards = [
  { title: 'Suplementos Comprovados', desc: 'Fórmulas com base em evidências científicas, manipuladas por farmácias parceiras autorizadas pela ANVISA.',                      img: 'https://placehold.co/758x400/f5f3f0/0B3B3C?text=Suplementos' },
  { title: 'Entrega Mensal',          desc: 'Seus suplementos chegam na sua porta todo mês, sem que você precise se preocupar com nada.',                                     img: 'https://placehold.co/758x400/f5f3f0/0B3B3C?text=Entrega' },
  { title: 'Chat com Especialistas',  desc: 'Acesso direto a profissionais habilitados durante todo o tratamento. Tire dúvidas e ajuste o protocolo quando precisar.',        img: 'https://placehold.co/758x400/f5f3f0/0B3B3C?text=Suporte' },
]

const supplements = [
  { label: 'Berberina',    desc: 'Ativo principal — controle glicêmico natural',              src: 'https://placehold.co/300x192/dae7d6/0B3B3C?text=Berberina' },
  { label: 'Vitamina B12', desc: 'Para uso de metformina ou diagnóstico longo',               src: 'https://placehold.co/300x192/dae7d6/0B3B3C?text=Vitamina+B12' },
  { label: 'Ômega 3',      desc: 'Para sintomas neurológicos e inflamatórios',                src: 'https://placehold.co/300x192/dae7d6/0B3B3C?text=Omega+3' },
]

const faqs = [
  { q: 'O que é o Desafio Diabetes?',                          a: 'O Desafio Diabetes é uma plataforma healthtech que combina um questionário clínico, avaliação de profissional habilitado e entrega mensal de suplementos personalizados para pessoas com diabetes tipo 2 e pré-diabetes.' },
  { q: 'Os suplementos substituem os medicamentos?',           a: 'Não. Os suplementos do Desafio Diabetes são complementares ao tratamento médico convencional. Nunca interrompa ou altere medicações prescritas sem orientação do seu médico.' },
  { q: 'Qual a diferença da Berberina para outros suplementos?', a: 'A Berberina é o ativo central do protocolo. Estudos mostram que ela age em mecanismos metabólicos similares à Metformina, auxiliando no controle da glicemia e da resistência à insulina.' },
  { q: 'Quando verei resultados?',                              a: 'Os primeiros resultados costumam aparecer entre 4 e 8 semanas de uso regular. Resultados mais expressivos, como redução de HbA1c, são observados a partir de 3 a 6 meses.' },
  { q: 'O protocolo precisa de prescrição?',                    a: 'Sim. Um profissional habilitado avalia seu questionário clínico e assina digitalmente o protocolo antes do envio. Você recebe o PDF da prescrição junto com o primeiro pedido.' },
  { q: 'Quem não deve usar o protocolo?',                       a: 'Gestantes, lactantes, menores de 18 anos e pessoas com doença renal crônica grave, doença cardíaca severa ou cirrose não devem iniciar o protocolo sem autorização médica específica.' },
]

export default function LandingPage() {
  const [popupOpen, setPopupOpen]       = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeFaq, setActiveFaq]       = useState<number | null>(null)
  const [floatVisible, setFloatVisible] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('3meses')
  const time = useCountdown()

  // Popup: abre após 10s, não reabre se já foi fechado
  useEffect(() => {
    try {
      if (!localStorage.getItem('dd_popup_dismissed')) {
        const t = setTimeout(() => setPopupOpen(true), 10000)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  // Floating CTA: aparece após 50vh de scroll
  useEffect(() => {
    const onScroll = () => setFloatVisible(window.scrollY > window.innerHeight * 0.5)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closePopup = () => {
    setPopupOpen(false)
    try { localStorage.setItem('dd_popup_dismissed', '1') } catch {}
  }

  const currentPlan = plans.find(p => p.id === selectedPlan)!

  return (
    <>
      <style>{`
        .marquee-wrap { display: flex; overflow: hidden; width: 100%; }
        .marquee-inner { display: flex; gap: 40px; flex-shrink: 0; animation: marquee 30s linear infinite; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(calc(-100% - 40px)); } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── MENU MOBILE ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-4/5 max-w-sm bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <span className="font-bold text-[#0B3B3C]">Desafio Diabetes</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 -mr-1" aria-label="Fechar menu">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5l10 10" stroke="#0B3B3C" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <nav className="flex flex-col p-6 gap-5 flex-1">
              <a href="#suplementos" className="text-[#0B3B3C] font-medium text-base" onClick={() => setMobileMenuOpen(false)}>Suplementos</a>
              <a href="#" className="text-[#0B3B3C] font-medium text-base">Blog</a>
              <a href="#" className="text-[#0B3B3C] font-medium text-base">Quem Somos</a>
              <a href="/login" className="text-[#0B3B3C] font-medium text-base">Entrar</a>
              <div className="mt-auto">
                <Link
                  href={QUIZ_URL}
                  className="block bg-[#0B3B3C] text-white text-center py-4 rounded-full font-bold"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Fazer minha avaliação
                </Link>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* ── POPUP ── */}
      {popupOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closePopup} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden w-full sm:max-w-sm shadow-2xl">
            <button
              onClick={closePopup}
              className="absolute top-3 right-3 z-10 bg-black/30 rounded-full p-2.5 flex items-center justify-center"
              aria-label="Fechar oferta"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11 3L3 11M3 3l8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="bg-[#0B3B3C] px-6 py-8 text-white text-center">
              <p className="text-xs font-bold tracking-widest uppercase opacity-70 mb-3">OFERTA POR TEMPO LIMITADO</p>
              <div className="flex justify-center gap-2 mb-4">
                {[{ v: time.h, l: 'Horas' }, { v: time.m, l: 'Minutos' }, { v: time.s, l: 'Segundos' }].map(({ v, l }) => (
                  <div key={l} className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[60px]">
                    <div className="text-xl font-bold">{pad(v)}</div>
                    <div className="text-xs opacity-70">{l}</div>
                  </div>
                ))}
              </div>
              <h3 className="text-xl font-bold mb-1">30% OFF no seu protocolo</h3>
              <p className="text-sm opacity-70">Cadastre-se e garanta seu desconto.</p>
            </div>
            <div className="p-5">
              <input
                type="email"
                placeholder="Seu email"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-3 text-sm focus:outline-none focus:border-[#0B3B3C] focus:ring-1 focus:ring-[#0B3B3C]"
              />
              <Link href={QUIZ_URL} className="block w-full bg-[#0B3B3C] text-white text-center py-3.5 rounded-xl font-bold text-sm hover:opacity-90 transition">
                Resgatar cupom
              </Link>
              <p className="text-xs text-gray-400 mt-3 text-center">
                Ao continuar concordo com os <a href="#" className="underline">Termos e Condições</a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── BARRA PROMOCIONAL ── */}
      <div className="bg-[#0B3B3C] text-white text-xs py-2 px-4 flex items-center justify-center gap-3 sticky top-0 z-40">
        <span className="font-medium">30% off no 1º pedido</span>
        <span className="opacity-40 hidden sm:inline">·</span>
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="opacity-70">Termina em</span>
          {[{ v: time.h, l: 'h' }, { v: time.m, l: 'm' }, { v: time.s, l: 's' }].map(({ v, l }, i) => (
            <span key={l} className="flex items-center gap-0.5">
              {i > 0 && <span className="opacity-40">:</span>}
              <span className="font-bold">{pad(v)}</span>
              <span className="opacity-60">{l}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── NAVBAR ── */}
      <nav className="bg-white border-b border-gray-100 sticky top-8 z-40">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 md:h-16 flex items-center justify-between relative">
          {/* Desktop esquerda */}
          <div className="hidden md:flex items-center gap-8">
            <button className="text-sm font-medium text-[#0B3B3C] flex items-center gap-1 hover:opacity-70 transition">
              Suplementos
              <svg width="10" height="7" viewBox="0 0 12 7" fill="none">
                <path fill="#0B3B3C" d="M11.314.707 5.657 6.364 0 .707.707 0l4.95 4.95L10.607 0l.707.707Z"/>
              </svg>
            </button>
            <a href="#" className="text-sm font-medium text-[#0B3B3C] hover:opacity-70 transition">Blog</a>
          </div>
          {/* Logo centralizado */}
          <a href="/" className="md:absolute md:left-1/2 md:-translate-x-1/2">
            <span className="font-bold text-[#0B3B3C] text-base md:text-lg">Desafio Diabetes</span>
          </a>
          {/* Desktop direita */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#" className="text-sm font-medium text-[#0B3B3C] hover:opacity-70 transition">Quem Somos</a>
            <a href="/login" className="text-sm font-medium text-[#0B3B3C] hover:opacity-70 transition">Entrar</a>
          </div>
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 -mr-1 ml-auto"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M3 6h16M3 11h16M3 16h16" stroke="#0B3B3C" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="bg-[#f5f3f0] py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Imagem — aparece primeiro no mobile */}
          <div className="md:order-2">
            <img
              src="https://placehold.co/600x500/dae7d6/0B3B3C?text=Imagem+Hero"
              alt="Protocolo Desafio Diabetes"
              className="w-full rounded-2xl"
            />
          </div>
          {/* Texto */}
          <div className="md:order-1">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#0B3B3C] leading-tight mb-4 md:mb-5">
              Controle o diabetes com suplementos de baixo índice glicêmico
            </h1>
            <p className="text-gray-600 text-base md:text-lg mb-6 md:mb-8 leading-relaxed">
              Protocolo 100% online com suplementos personalizados e dieta individualizada para o seu tipo metabólico.
            </p>
            <div className="flex flex-col gap-3 mb-6 md:mb-8">
              {[
                'Suplementos prescritos, entregues na sua porta',
                'Avaliação de um profissional habilitado',
                'Frete grátis durante todo o tratamento',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-5 h-5 md:w-6 md:h-6 bg-[#dae7d6] rounded-full flex items-center justify-center flex-shrink-0">
                    <svg width="10" height="9" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5l3.5 3.5L11 1" stroke="#0B3B3C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <p className="text-sm text-[#0B3B3C]">{item}</p>
                </div>
              ))}
            </div>
            <Link
              href={QUIZ_URL}
              className="inline-block w-full sm:w-auto bg-[#0B3B3C] text-white text-center px-8 py-4 rounded-full font-bold hover:opacity-90 active:scale-95 transition text-sm"
            >
              Fazer minha avaliação
            </Link>
            <div className="mt-8 border-t border-gray-200 pt-6">
              <span className="text-3xl md:text-4xl font-black text-[#0B3B3C]">100 mil</span>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                Mais de 100.000 pessoas já foram impactadas pelo Desafio Diabetes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE USPs ── */}
      <section className="bg-[#e8ddd6] py-3 md:py-4 overflow-hidden">
        <div className="marquee-wrap">
          {[0, 1].map((set) => (
            <div key={set} className="marquee-inner flex-shrink-0">
              {usps.map((usp) => (
                <div key={usp} className="flex items-center gap-2 whitespace-nowrap px-4">
                  <div className="w-4 h-4 rounded-full bg-[#0B3B3C]/20 flex-shrink-0" />
                  <span className="text-xs md:text-sm font-medium text-[#0B3B3C]">{usp}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── DEPOIMENTOS ── */}
      <section className="py-14 md:py-20 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 md:mb-10">
            <p className="text-xs font-bold tracking-widest text-[#0B3B3C] uppercase mb-2">DEPOIMENTOS</p>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0B3B3C]">Veja os resultados dos nossos pacientes</h2>
          </div>
          {/* Mobile: scroll horizontal com snap / Desktop: grid */}
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:overflow-visible md:pb-0">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="min-w-[280px] snap-start flex-shrink-0 md:min-w-0 md:flex-shrink bg-[#f5f3f0] rounded-2xl overflow-hidden flex flex-col"
              >
                <img src={t.img} alt="" className="w-full aspect-[376/200] object-cover" />
                <div className="p-4 md:p-5 flex flex-col flex-1">
                  <h3 className="font-bold text-[#0B3B3C] text-xs md:text-sm mb-2">{t.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed flex-1">{t.text}</p>
                  <div className="border-t border-gray-200 pt-3 mt-3 md:mt-4">
                    <p className="text-xs md:text-sm font-bold text-[#0B3B3C]">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.plan}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="7" fill="#22c55e"/>
                        <path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      <span className="text-xs text-gray-400">Depoimento verificado</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TIMELINE ── */}
      <section className="bg-[#f5f3f0] py-14 md:py-20 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold tracking-widest text-[#0B3B3C] uppercase mb-2">O QUE ESPERAR?</p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0B3B3C] mb-8 md:mb-12">Evolução do Protocolo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-10 md:mb-12">
            {timeline.map((item, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 md:p-6 flex gap-4 items-start">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#dae7d6] flex items-center justify-center flex-shrink-0">
                  {item.icon}
                </div>
                <div>
                  <h3 className="font-bold text-[#0B3B3C] text-base md:text-lg">{item.period}</h3>
                  <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                  <p className="text-xs md:text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Link
              href={QUIZ_URL}
              className="inline-block w-full sm:w-auto bg-[#0B3B3C] text-white px-10 py-4 rounded-full font-bold hover:opacity-90 active:scale-95 transition text-sm"
            >
              Fazer minha avaliação
            </Link>
          </div>
        </div>
      </section>

      {/* ── POR QUE DD ── */}
      <section className="py-14 md:py-20 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold tracking-widest text-[#0B3B3C] uppercase mb-2">Por que Desafio Diabetes?</p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0B3B3C] mb-8 md:mb-12">Uma solução prática e segura</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {whyCards.map((card) => (
              <div key={card.title} className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="p-5 md:p-6">
                  <h3 className="font-bold text-lg md:text-xl text-[#0B3B3C] mb-2 md:mb-3">{card.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{card.desc}</p>
                </div>
                <img src={card.img} alt={card.title} className="w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SUPLEMENTOS ── */}
      <section id="suplementos" className="py-14 md:py-20 px-4 md:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold tracking-widest text-[#0B3B3C] uppercase mb-2">Suplementos</p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0B3B3C] mb-3 md:mb-4">Protocolo Personalizado de Suplementos</h2>
          <p className="text-gray-600 mb-8 md:mb-10 text-sm md:text-base">O profissional habilitado prescreve a combinação ideal para o seu caso.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
            {supplements.map((s) => (
              <div key={s.label} className="text-center">
                <div className="bg-[#f5f3f0] rounded-2xl p-4 flex items-center justify-center h-36 sm:h-40 md:h-48 mb-3">
                  <img src={s.src} alt={s.label} className="max-h-full object-contain" />
                </div>
                <h4 className="font-bold text-[#0B3B3C] text-base md:text-lg">{s.label}</h4>
                <p className="text-xs text-gray-500 mt-1">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── IMPACTO — antes dos planos para gerar credibilidade ── */}
      <section className="py-10 md:py-12 px-4 md:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="bg-[#0B3B3C] text-white rounded-2xl p-8 md:p-10 text-center">
            <p className="text-xs font-bold tracking-widest uppercase opacity-60 mb-2">Impacto real</p>
            <h3 className="text-4xl md:text-5xl font-black mb-2 md:mb-3">100 mil</h3>
            <p className="text-sm md:text-base opacity-80">pessoas já foram impactadas pelo Desafio Diabetes</p>
          </div>
        </div>
      </section>

      {/* ── PLANOS ── */}
      <section className="py-14 md:py-20 px-4 md:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold tracking-widest text-[#0B3B3C] uppercase mb-2">Sobre o Desafio Diabetes</p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0B3B3C] mb-3 md:mb-4">Cuidado completo e descomplicado</h2>
          <p className="text-gray-600 mb-6 md:mb-8 max-w-2xl leading-relaxed text-sm md:text-base">
            Nós gerenciamos o seu protocolo e cuidamos de tudo para que você possa se cuidar com tranquilidade.
          </p>

          {/* Seletor de plano */}
          <div className="flex gap-1.5 mb-6 bg-[#f5f3f0] p-1.5 rounded-full w-fit">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium transition-all ${
                  selectedPlan === plan.id
                    ? 'bg-[#0B3B3C] text-white shadow-sm'
                    : 'text-[#0B3B3C] hover:opacity-70'
                }`}
              >
                {plan.label}
                {plan.badge && selectedPlan !== plan.id && (
                  <span className="ml-1 text-xs bg-[#dae7d6] text-[#0B3B3C] px-1.5 py-0.5 rounded-full hidden sm:inline">
                    {plan.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="border-2 border-[#0B3B3C] rounded-2xl overflow-hidden max-w-2xl">
            <div className="grid md:grid-cols-2">
              <img
                src="https://placehold.co/400x300/dae7d6/0B3B3C?text=Protocolo"
                alt=""
                className="w-full object-cover h-44 md:h-auto"
              />
              <div className="p-5 md:p-6">
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-xl md:text-2xl font-bold text-[#0B3B3C]">Protocolo Completo</h2>
                  {currentPlan.badge && (
                    <span className="text-xs bg-[#dae7d6] text-[#0B3B3C] px-2 py-1 rounded-full font-medium flex-shrink-0 ml-2">
                      {currentPlan.badge}
                    </span>
                  )}
                </div>
                <div className="mb-4">
                  <span className="text-3xl font-black text-[#0B3B3C]">{currentPlan.price}</span>
                  <span className="text-sm text-gray-400 ml-2">· {currentPlan.monthly}</span>
                  {currentPlan.savings && (
                    <span className="ml-2 text-xs text-green-600 font-semibold">{currentPlan.savings}</span>
                  )}
                </div>
                <p className="text-xs font-bold text-[#0B3B3C] uppercase tracking-wide mb-3">Está incluso</p>
                {[
                  'Avaliação de profissional habilitado',
                  'Suplementos entregues na sua porta com frete gratuito',
                  'Suporte contínuo com especialistas',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 mb-2">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-shrink-0">
                      <circle cx="8" cy="8" r="8" fill="#dae7d6"/>
                      <path d="M5 8l2 2 4-4" stroke="#0B3B3C" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <p className="text-xs text-gray-600">{item}</p>
                  </div>
                ))}
                <Link
                  href={QUIZ_URL}
                  className="block mt-5 bg-[#0B3B3C] text-white text-center py-3.5 rounded-full font-bold text-sm hover:opacity-90 active:scale-95 transition"
                >
                  Fazer minha avaliação
                </Link>
                <p className="text-xs text-gray-400 text-center mt-2">Cancele quando quiser · Sem taxas</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 max-w-2xl">
            * Preços ilustrativos. Os valores finais serão confirmados no checkout após a avaliação profissional.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-14 md:py-20 px-4 md:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8 md:gap-16">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#0B3B3C] uppercase mb-2">FAQ</p>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0B3B3C] mb-3 md:mb-4">Diabetes: tire suas dúvidas</h2>
            <p className="text-sm text-gray-500">Equipe Desafio Diabetes</p>
          </div>
          <div className="md:col-span-2">
            {faqs.map((faq, i) => (
              <div key={i} className={`border-b border-gray-200 ${i === 0 ? 'border-t' : ''}`}>
                <button
                  className="w-full text-left py-4 md:py-5 flex items-center justify-between gap-4 text-[#0B3B3C] font-medium text-sm"
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  aria-expanded={activeFaq === i}
                >
                  <span>{faq.q}</span>
                  <svg
                    className={`flex-shrink-0 transition-transform duration-300 ${activeFaq === i ? 'rotate-180' : ''}`}
                    width="20" height="20" viewBox="0 0 24 24" fill="none"
                  >
                    <path d="M5 8.5L12 15.5L19 8.5" stroke="#0B3B3C" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
                {/* Animação suave do accordion */}
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${activeFaq === i ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <p className="text-sm text-gray-600 leading-relaxed pb-5">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ANVISA ── */}
      <section className="py-10 md:py-12 px-4 md:px-6 bg-[#f5f3f0] border-t border-gray-200">
        <div className="max-w-6xl mx-auto flex items-start gap-4 md:gap-6">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#dae7d6] flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="#0B3B3C" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-[#0B3B3C] mb-1 text-sm md:text-base">Farmácias credenciadas ANVISA</h3>
            <p className="text-xs md:text-sm text-gray-500 leading-relaxed max-w-2xl">
              O Desafio Diabetes não é uma farmácia. Todos os suplementos são manipulados por farmácias credenciadas de acordo com as normas da ANVISA.
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#0B3B3C] text-white py-12 md:py-16 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mb-8 md:mb-10">
            <div className="col-span-2 md:col-span-1">
              <h3 className="font-bold text-sm mb-3 md:mb-4">Ficou alguma dúvida?</h3>
              <a href="mailto:suporte@desafiodiabetes.com" className="flex items-start gap-3 bg-white/10 rounded-xl p-3 hover:bg-white/20 transition">
                <div>
                  <p className="text-sm font-medium">Fale com a gente</p>
                  <p className="text-xs opacity-60 mt-0.5">suporte@desafiodiabetes.com</p>
                </div>
              </a>
            </div>
            <div>
              <h3 className="font-bold mb-3 text-sm">Suplementos</h3>
              {['Diabetes Tipo 2', 'Pré-diabetes'].map((item) => (
                <a key={item} href="#" className="block text-xs py-1.5 opacity-70 hover:opacity-100 transition">{item}</a>
              ))}
            </div>
            <div>
              <h3 className="font-bold mb-3 text-sm">Desafio Diabetes</h3>
              {['Home', 'Quem Somos', 'Perguntas Frequentes', 'Blog'].map((item) => (
                <a key={item} href="#" className="block text-xs py-1.5 opacity-70 hover:opacity-100 transition">{item}</a>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <span className="font-bold text-sm">Desafio Diabetes</span>
              <div className="flex gap-4">
                <a href="#" aria-label="Instagram" className="opacity-70 hover:opacity-100 transition">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="2" width="20" height="20" rx="5" stroke="white" strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.5"/>
                    <circle cx="17.5" cy="6.5" r="1" fill="white"/>
                  </svg>
                </a>
                <a href="#" aria-label="Facebook" className="opacity-70 hover:opacity-100 transition">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-white/20 pt-5 flex flex-col md:flex-row justify-between gap-3">
            <div className="flex gap-3 md:gap-4">
              <a href="#" className="text-xs opacity-60 hover:opacity-100">Política de privacidade</a>
              <a href="#" className="text-xs opacity-60 hover:opacity-100">Termos e condições</a>
            </div>
            <p className="text-xs opacity-40 md:max-w-sm leading-relaxed">
              O Desafio Diabetes não é uma farmácia. Suplementos manipulados por farmácias credenciadas pela ANVISA.<br />
              Copyright 2026 Desafio Diabetes™. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* ── FLOATING CTA ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-[#0B3B3C] text-white py-3 md:py-4 px-4 md:px-6 z-40 shadow-lg transition-transform duration-300 ${floatVisible ? 'translate-y-0' : 'translate-y-full'}`}
        aria-hidden={!floatVisible}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <p className="text-xs md:text-sm hidden sm:block leading-tight">
            Controle o diabetes com um protocolo feito para o seu tipo metabólico.
          </p>
          <Link
            href={QUIZ_URL}
            className="w-full sm:w-auto bg-white text-[#0B3B3C] text-center px-5 md:px-6 py-2.5 rounded-full font-bold text-sm hover:bg-gray-100 active:scale-95 transition flex-shrink-0"
          >
            Fazer minha avaliação
          </Link>
        </div>
      </div>
    </>
  )
}