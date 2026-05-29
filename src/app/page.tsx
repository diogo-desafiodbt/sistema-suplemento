'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ── CONFIG — atualizar antes de publicar ─────────────────────────────
const QUIZ_URL = '/quiz'


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

const usps = [
  '+15 milhões de diabéticos impactados',
  'Suplementos de baixo índice glicêmico',
  'Dieta personalizada',
  'Referência nacional em controle do diabetes',
]

const testimonials = [
  {
    title: 'Da glicada 11,6 para 5,1 — praticamente eliminei os remédios!',
    text: 'Descobri o diabetes com glicose de 287. Segui a dieta à risca e em fevereiro de 2026 minha glicada foi 5,17 e glicose de jejum 102. Era pra tomar 4 glifage, 2 glicazidas e 9 pontos de insulina — hoje tomo apenas 2 glifage.',
    name: 'Alexandre, 47 anos',
    plan: 'Comunidade Desafio Diabetes',
  },
  {
    title: 'Glicada de 7,2% para 5,0% — controle perfeito!',
    text: 'Fui diagnosticada pré-diabética em 2024. Em outubro de 2025 estava em 7,2%. Depois que iniciei a dieta, em maio de 2026: glicada 5,0% e açúcar médio de 97 mg/dL. Perdi 17 kg. A vitória é certa!',
    name: 'Giselle, 43 anos',
    plan: 'Comunidade Desafio Diabetes',
  },
  {
    title: 'Glicada 18 e glicose 600 — em 3 meses tudo mudou!',
    text: 'Meu esposo estava com a glicada 18 e a glicose mais de 600. Em 3 meses a glicada veio pra 6,1 e a glicose para 120. Tem dias que está menos de 70. Dr. Turi, você mudou nossas vidas.',
    name: 'Pretinha F.',
    plan: 'Comunidade Desafio Diabetes',
  },
  {
    title: 'Estava prestes a tomar insulina — 3 meses depois, glicose 5,8!',
    text: 'Minha hemoglobina glicada estava em 11,4 e o médico disse que eu estava prestes a precisar de insulina. Em 3 meses cortei carboidratos, emagreci 11 kg e minha glicose voltou para 5,8. Todo meu corpo melhorou.',
    name: 'Carlos R.',
    plan: 'Comunidade Desafio Diabetes',
  },
]

const timeline = [
  {
    period: '1 a 2 meses',
    label: 'Adaptação',
    desc: 'O organismo inicia o processo de adaptação metabólica. Os primeiros ajustes costumam ocorrer de forma gradual, sem mudanças imediatas nos exames. Consistência é o fator mais importante nesta fase.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10" stroke="#13244f" strokeWidth="2" strokeLinecap="round"/>
        <path d="M26 6l-2 4-4-2" stroke="#13244f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    period: '3 a 6 meses',
    label: 'Acompanhamento',
    desc: 'Com a manutenção do protocolo e da alimentação, os exames de rotina passam a refletir o processo metabólico em andamento. Os resultados variam de acordo com o histórico e a adesão de cada pessoa.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 26V10M10 16l6-6 6 6" stroke="#13244f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 26h16" stroke="#13244f" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    period: '6 meses em diante',
    label: 'Continuidade',
    desc: 'Pessoas que seguem o protocolo de forma consistente relatam melhorias perceptíveis nos exames de glicemia e hemoglobina glicada. O acompanhamento contínuo permite ajustes individuais para apoiar a saúde metabólica a longo prazo.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="10" stroke="#13244f" strokeWidth="2"/>
        <path d="M11 16l3.5 3.5L21 11" stroke="#13244f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

const whyCards = [
  { title: 'Suplementos Comprovados', desc: 'Fórmulas com base em evidências científicas, manipuladas por farmácias parceiras autorizadas pela ANVISA.',                      img: 'https://placehold.co/758x400/f5f3f0/13244f?text=Suplementos' },
  { title: 'Entrega Mensal',          desc: 'Seus suplementos chegam na sua porta todo mês, sem que você precise se preocupar com nada.',                                     img: 'https://placehold.co/758x400/f5f3f0/13244f?text=Entrega' },
  {
    title: 'Dieta baseada no tipo metabólico',
    desc: 'Nossa dieta de baixo índice glicêmico é validada por estudos científicos americanos da Virta Health — referência mundial em reversão do diabetes tipo 2 por meio da alimentação.',
    img: 'https://placehold.co/758x400/f5f3f0/13244f?text=Dieta',
  },
]

const faqs = [
  { q: 'O que é o Desafio Diabetes?',                          a: 'O Desafio Diabetes é uma plataforma healthtech que combina um questionário clínico, avaliação de profissional habilitado e entrega mensal de suplementos personalizados para pessoas com diabetes tipo 2 e pré-diabetes.' },
  { q: 'Os suplementos substituem os medicamentos?',           a: 'Não. Os suplementos do Desafio Diabetes são complementares ao tratamento médico convencional. Nunca interrompa ou altere medicações prescritas sem orientação do seu médico.' },
  { q: 'Qual a diferença da Berberina para outros suplementos?', a: 'A Berberina é o ativo central do protocolo. Estudos mostram que ela age em mecanismos metabólicos similares à Metformina, auxiliando no controle da glicemia e da resistência à insulina.' },
  { q: 'Quando verei resultados?',                              a: 'Os primeiros resultados costumam aparecer entre 4 e 8 semanas de uso regular. Resultados mais expressivos, como redução de HbA1c, são observados a partir de 3 a 6 meses.' },
  { q: 'O protocolo precisa de prescrição?',                    a: 'Sim. Um profissional habilitado avalia seu questionário clínico e assina digitalmente o protocolo antes do envio.' },
  { q: 'Quem não deve usar o protocolo?',                       a: 'Gestantes, lactantes, menores de 18 anos e pessoas com doença renal crônica grave, doença cardíaca severa ou cirrose não devem iniciar o protocolo sem autorização médica específica.' },
]

export default function LandingPage() {
  const [popupOpen, setPopupOpen]       = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeFaq, setActiveFaq]       = useState<number | null>(null)
  const [floatVisible, setFloatVisible] = useState(false)
  const [farmaciaPopupOpen, setFarmaciaPopupOpen] = useState(false)
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
              <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-9 w-auto" />
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 -mr-1" aria-label="Fechar menu">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5l10 10" stroke="#13244f" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <nav className="flex flex-col p-6 gap-5 flex-1">
              <a href="#" className="text-[#13244f] font-medium text-base">Blog</a>
              <a href="#" className="text-[#13244f] font-medium text-base">Quem Somos</a>
              <a href="/login" className="text-[#13244f] font-medium text-base">Entrar</a>
              <div className="mt-auto">
                <Link
                  href={QUIZ_URL}
                  className="block bg-[#f4001e] text-white text-center py-4 rounded-full font-bold"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Quero meu protocolo
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
            <div className="bg-[#13244f] px-6 py-8 text-white text-center">
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
                className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-3 text-sm focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]"
              />
              <Link href={QUIZ_URL} className="block w-full bg-[#f4001e] text-white text-center py-3.5 rounded-xl font-bold text-sm hover:bg-[#a30000] transition">
                Resgatar cupom
              </Link>
              <p className="text-xs text-gray-400 mt-3 text-center">
                Ao continuar concordo com os <a href="#" className="underline">Termos e Condições</a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── POPUP FARMÁCIA ── */}
      {farmaciaPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFarmaciaPopupOpen(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-[#13244f] px-6 py-5 text-white flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold">Seja uma farmácia credenciada</h3>
                <p className="text-sm opacity-70 mt-0.5">Preencha os dados e entraremos em contato</p>
              </div>
              <button
                onClick={() => setFarmaciaPopupOpen(false)}
                className="p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition flex-shrink-0 ml-4"
                aria-label="Fechar"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11 3L3 11M3 3l8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Formulário */}
            <div className="p-6 flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-[#13244f] block mb-1">Nome da farmácia *</label>
                <input
                  type="text"
                  placeholder="Ex: Farmácia Central Ltda"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#13244f] block mb-1">CNPJ *</label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#13244f] block mb-1">Responsável técnico *</label>
                <input
                  type="text"
                  placeholder="Nome do farmacêutico responsável"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#13244f] block mb-1">CRF *</label>
                  <input
                    type="text"
                    placeholder="CRF-SP 00000"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#13244f] block mb-1">Estado *</label>
                  <input
                    type="text"
                    placeholder="SP"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#13244f] block mb-1">E-mail *</label>
                <input
                  type="email"
                  placeholder="contato@suafarmacia.com.br"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#13244f] block mb-1">WhatsApp *</label>
                <input
                  type="tel"
                  placeholder="(11) 99999-9999"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]"
                />
              </div>
              <button
                type="button"
                className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-3.5 rounded-xl font-bold text-sm transition active:scale-95 mt-1"
              >
                Enviar cadastro
              </button>
              <p className="text-xs text-gray-400 text-center">
                Entraremos em contato em até 2 dias úteis.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── BARRA PROMOCIONAL ── */}
      <div className="bg-[#13244f] text-white text-xs py-2 px-4 flex items-center justify-center gap-3 sticky top-0 z-40">
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
            <a href="#" className="text-sm font-medium text-[#13244f] hover:opacity-70 transition">Blog</a>
          </div>
          {/* Logo centralizado */}
          <a href="/" className="md:absolute md:left-1/2 md:-translate-x-1/2">
            <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-9 md:h-11 w-auto" />
          </a>
          {/* Desktop direita */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#" className="text-sm font-medium text-[#13244f] hover:opacity-70 transition">Quem Somos</a>
            <a href="/login" className="text-sm font-medium text-[#13244f] hover:opacity-70 transition">Entrar</a>
          </div>
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 -mr-1 ml-auto"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M3 6h16M3 11h16M3 16h16" stroke="#13244f" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="bg-[#f5f3f0] py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:grid md:grid-cols-2 gap-8 md:gap-12 items-center">

          {/* Imagem */}
          <div className="w-full md:order-2">
            <img
              src="https://placehold.co/600x500/ececec/13244f?text=Imagem+Hero"
              alt="Protocolo Desafio Diabetes"
              className="w-full rounded-2xl"
            />
          </div>

          {/* Texto */}
          <div className="w-full md:order-1 flex flex-col items-center md:items-start text-center md:text-left">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#13244f] leading-tight mb-4 md:mb-5">
              Controle o diabetes com suplementos de baixo índice glicêmico
            </h1>
            <p className="text-gray-600 text-base md:text-lg mb-6 md:mb-8 leading-relaxed max-w-md md:max-w-none">
              Protocolo 100% online com suplementos personalizados e dieta individualizada para o seu tipo metabólico.
            </p>

            <div className="flex flex-col gap-3 mb-6 md:mb-8 w-full max-w-xs md:max-w-none">
              {[
                'Suplementos prescritos, entregues na sua porta',
                'Dieta personalizada',
                'Protocolos cientificamente comprovados',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 justify-center md:justify-start">
                  <div className="w-5 h-5 bg-[#ececec] rounded-full flex items-center justify-center flex-shrink-0">
                    <svg width="10" height="9" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5l3.5 3.5L11 1" stroke="#13244f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <p className="text-sm text-[#13244f] text-left">{item}</p>
                </div>
              ))}
            </div>

            <Link
              href={QUIZ_URL}
              className="w-full sm:w-auto bg-[#f4001e] text-white text-center px-8 py-4 rounded-full font-bold hover:bg-[#a30000] active:scale-95 transition text-sm"
            >
              Quero meu protocolo
            </Link>

            <div className="mt-8 border-t border-gray-200 pt-6 w-full text-center md:text-left">
              <span className="text-3xl md:text-4xl font-black text-[#13244f]">100 mil</span>
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
                  <div className="w-4 h-4 rounded-full bg-[#13244f]/20 flex-shrink-0" />
                  <span className="text-xs md:text-sm font-medium text-[#13244f]">{usp}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── DEPOIMENTOS ── */}
      <section className="py-14 md:py-20 px-4 md:px-6 bg-[#f5f5f0]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-2">DEPOIMENTOS</p>
            <h2 className="text-2xl md:text-3xl font-bold text-[#13244f]">
              Veja os resultados dos nossos pacientes
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 md:p-7 flex flex-col gap-4 shadow-sm border border-gray-100"
              >
                {/* Aspas decorativas */}
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" className="flex-shrink-0 opacity-20">
                  <path d="M0 24V14.4C0 6.4 4.8 1.6 14.4 0L16 3.2C11.2 4.267 8.533 7.2 8 12H14.4V24H0ZM17.6 24V14.4C17.6 6.4 22.4 1.6 32 0L33.6 3.2C28.8 4.267 26.133 7.2 25.6 12H32V24H17.6Z" fill="#13244f"/>
                </svg>

                {/* Título em destaque */}
                <p className="font-bold text-[#13244f] text-base leading-snug">
                  &ldquo;{t.title}&rdquo;
                </p>

                {/* Texto do depoimento */}
                <p className="text-sm text-gray-600 leading-relaxed flex-1">
                  {t.text}
                </p>

                {/* Rodapé */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-[#13244f]">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.plan}</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="7" fill="#22c55e"/>
                      <path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span className="text-xs text-green-700 font-medium">Verificado</span>
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
          <p className="text-xs font-bold tracking-widest text-[#13244f] uppercase mb-2">O QUE ESPERAR?</p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#13244f] mb-8 md:mb-12">Evolução do Protocolo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-10 md:mb-12">
            {timeline.map((item, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 md:p-6 flex gap-4 items-start">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#ececec] flex items-center justify-center flex-shrink-0">
                  {item.icon}
                </div>
                <div>
                  <h3 className="font-bold text-[#13244f] text-base md:text-lg">{item.period}</h3>
                  <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                  <p className="text-xs md:text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Link
              href={QUIZ_URL}
              className="inline-block w-full sm:w-auto bg-[#f4001e] text-white px-10 py-4 rounded-full font-bold hover:bg-[#a30000] active:scale-95 transition text-sm"
            >
              Quero meu protocolo
            </Link>
            <p className="mt-4 text-xs text-gray-400 max-w-xl mx-auto leading-relaxed">
              ⚠️ Os resultados variam de pessoa para pessoa. O protocolo Desafio Diabetes não garante resultados específicos e não substitui o acompanhamento médico.
            </p>
          </div>
        </div>
      </section>

      {/* ── POR QUE DD ── */}
      <section className="py-14 md:py-20 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold tracking-widest text-[#13244f] uppercase mb-2">Por que Desafio Diabetes?</p>
          <h2 className="text-2xl md:text-3xl font-bold text-[#13244f] mb-8 md:mb-12">Uma solução prática e segura</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {whyCards.map((card) => (
              <div key={card.title} className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="p-5 md:p-6">
                  <h3 className="font-bold text-lg md:text-xl text-[#13244f] mb-2 md:mb-3">{card.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{card.desc}</p>
                </div>
                <img src={card.img} alt={card.title} className="w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── IMPACTO — antes dos planos para gerar credibilidade ── */}
      <section className="py-10 md:py-12 px-4 md:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="bg-[#13244f] text-white rounded-2xl p-8 md:p-10 text-center">
            <p className="text-xs font-bold tracking-widest uppercase opacity-60 mb-2">Impacto real</p>
            <h3 className="text-4xl md:text-5xl font-black mb-2 md:mb-3">100 mil</h3>
            <p className="text-sm md:text-base opacity-80">pessoas já foram impactadas pelo Desafio Diabetes</p>
          </div>
        </div>
      </section>

      {/* ── SOBRE O DESAFIO DIABETES ── */}
      <section className="py-14 md:py-20 px-4 md:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-2">Sobre o Desafio Diabetes</p>
            <h2 className="text-2xl md:text-3xl font-bold text-[#13244f] mb-4">
              O maior programa de reversão do diabetes do Brasil no YouTube
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed text-sm md:text-base">
              Criado pelo Dr. Turi Souza, o Desafio Diabetes já impactou mais de 15 milhões de diabéticos com conteúdo científico, prático e acessível — e os resultados falam por si.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-10 md:mb-12">
            <div className="bg-[#13244f] text-white rounded-2xl p-7 text-center flex flex-col items-center gap-2">
              <span className="text-4xl md:text-5xl font-black">+15M</span>
              <p className="text-sm opacity-80 leading-relaxed">diabéticos impactados nas redes sociais</p>
            </div>
            <div className="bg-[#f4001e] text-white rounded-2xl p-7 text-center flex flex-col items-center gap-2">
              <span className="text-4xl md:text-5xl font-black">#1</span>
              <p className="text-sm opacity-80 leading-relaxed">programa de reversão do diabetes no YouTube Brasil</p>
            </div>
            <div className="bg-[#13244f] text-white rounded-2xl p-7 text-center flex flex-col items-center gap-2">
              <span className="text-3xl md:text-4xl font-black">Milhares</span>
              <p className="text-sm opacity-80 leading-relaxed">de relatos de melhora nos exames documentados pela comunidade</p>
            </div>
          </div>

          <div className="text-center">
            <Link
              href={QUIZ_URL}
              className="inline-block w-full sm:w-auto bg-[#f4001e] hover:bg-[#a30000] text-white text-center px-10 py-4 rounded-full font-bold transition text-sm active:scale-95"
            >
              Quero meu protocolo
            </Link>
            <p className="text-xs text-gray-400 mt-3">Cancele quando quiser · Sem taxas</p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-14 md:py-20 px-4 md:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8 md:gap-16">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f] uppercase mb-2">FAQ</p>
            <h2 className="text-2xl md:text-3xl font-bold text-[#13244f] mb-3 md:mb-4">Diabetes: tire suas dúvidas</h2>
            <p className="text-sm text-gray-500">Equipe Desafio Diabetes</p>
          </div>
          <div className="md:col-span-2">
            {faqs.map((faq, i) => (
              <div key={i} className={`border-b border-gray-200 ${i === 0 ? 'border-t' : ''}`}>
                <button
                  className="w-full text-left py-4 md:py-5 flex items-center justify-between gap-4 text-[#13244f] font-medium text-sm"
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  aria-expanded={activeFaq === i}
                >
                  <span>{faq.q}</span>
                  <svg
                    className={`flex-shrink-0 transition-transform duration-300 ${activeFaq === i ? 'rotate-180' : ''}`}
                    width="20" height="20" viewBox="0 0 24 24" fill="none"
                  >
                    <path d="M5 8.5L12 15.5L19 8.5" stroke="#13244f" strokeWidth="1.5" strokeLinecap="round"/>
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
        <div className="max-w-6xl mx-auto flex items-start justify-center gap-4 md:gap-6">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#ececec] flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="#13244f" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="text-center">
            <h3 className="font-bold text-[#13244f] mb-1 text-sm md:text-base">Farmácias credenciadas ANVISA</h3>
            <p className="text-xs md:text-sm text-gray-500 leading-relaxed max-w-2xl">
              O Desafio Diabetes não é uma farmácia. Todos os suplementos são manipulados por farmácias credenciadas de acordo com as normas da ANVISA.
            </p>
            <button
              onClick={() => setFarmaciaPopupOpen(true)}
              className="mt-4 inline-block text-sm font-semibold text-[#f4001e] underline underline-offset-2 hover:text-[#a30000] transition"
            >
              Cadastre-se como farmácia credenciada Desafio Diabetes →
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#13244f] text-white py-12 md:py-16 px-4 md:px-6">
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
              <img src="/logo-branca.png" alt="Desafio Diabetes" className="h-10 w-auto" />
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
        className={`fixed bottom-0 left-0 right-0 bg-[#13244f] text-white py-3 md:py-4 px-4 md:px-6 z-40 shadow-lg transition-transform duration-300 ${floatVisible ? 'translate-y-0' : 'translate-y-full'}`}
        aria-hidden={!floatVisible}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <p className="text-xs md:text-sm hidden sm:block leading-tight">
            Controle o diabetes com suplementos de baixo índice glicêmico.
          </p>
          <Link
            href={QUIZ_URL}
            className="w-full sm:w-auto bg-white text-[#f4001e] text-center px-5 md:px-6 py-2.5 rounded-full font-bold text-sm hover:bg-gray-100 active:scale-95 transition flex-shrink-0"
          >
            Quero meu protocolo
          </Link>
        </div>
      </div>
    </>
  )
}