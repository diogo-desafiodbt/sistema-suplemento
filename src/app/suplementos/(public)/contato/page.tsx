import type { Metadata } from 'next'
import Link from 'next/link'
import { ContatoForm } from '@/components/ContatoForm'
import Footer from '@/components/Footer'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'Fale com a gente — Desafio Diabetes',
  description:
    'Dúvida sobre seu pedido, sua assinatura ou os produtos do Desafio Diabetes? Fale com nossa equipe por WhatsApp, e-mail ou pelo formulário.',
}

const WHATSAPP =
  'https://wa.me/5521996661825?text=Ol%C3%A1!%20Preciso%20de%20ajuda.'
const EMAIL = 'suporte@desafiodiabetes.com'

export default function ContatoPage() {
  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">
      <Header />

      <main className="flex-1 px-4 md:px-6 py-10 md:py-16">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 md:mb-10">
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-2">
              Atendimento
            </p>
            <h1 className="font-display text-3xl md:text-4xl text-[#13244f] leading-tight mb-3">
              Fale com a gente
            </h1>
            <p className="text-[#13244f]/70 leading-relaxed max-w-xl">
              Pedido que não chegou, dúvida sobre a assinatura, pergunta sobre
              os produtos — escolha o caminho que for mais confortável. Tem
              gente do outro lado nos três.
            </p>
          </div>

          {/* Os dois canais diretos primeiro: quem já sabe o que quer não
              precisa preencher formulário nenhum. */}
          <div className="grid gap-4 md:grid-cols-2 mb-10">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl bg-[#13244f] px-6 py-6 text-white transition hover:brightness-125"
            >
              <p className="text-xs font-bold tracking-widest uppercase opacity-50 mb-2">
                Mais rápido
              </p>
              <p className="font-display text-xl mb-1">WhatsApp</p>
              <p className="text-sm opacity-70">(21) 99666-1825</p>
            </a>

            <a
              href={`mailto:${EMAIL}`}
              className="group rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-6 transition hover:border-[#13244f]/20"
            >
              <p className="text-xs font-bold tracking-widest uppercase text-[#13244f]/40 mb-2">
                Para assuntos com detalhe
              </p>
              <p className="font-display text-xl text-[#13244f] mb-1">E-mail</p>
              <p className="text-sm text-[#13244f]/60 break-all">{EMAIL}</p>
            </a>
          </div>

          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-8 md:px-10 md:py-10">
            <h2 className="font-display text-2xl text-[#13244f] mb-1">
              Ou escreva por aqui
            </h2>
            <p className="text-sm text-[#13244f]/60 mb-7 leading-relaxed">
              Chega direto na nossa caixa de atendimento. Respondemos em até
              1 dia útil.
            </p>

            <ContatoForm />
          </section>

          <p className="mt-8 text-sm text-[#13244f]/60 leading-relaxed text-center">
            Já é cliente e quer acompanhar um pedido?{' '}
            <Link
              href="/suplementos/dashboard/pedidos"
              className="font-medium text-[#13244f] underline underline-offset-4 hover:text-[#f4001e] transition"
            >
              Entre na sua conta
            </Link>{' '}
            — o rastreamento fica lá, atualizado.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
