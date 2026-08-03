'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ObrigadoPage() {
  const router = useRouter()

  useEffect(() => {
    sessionStorage.removeItem('protocol_items')
    sessionStorage.removeItem('selected_plan')
    sessionStorage.removeItem('quiz_data')
    sessionStorage.removeItem('mini_quiz_data')
    sessionStorage.removeItem('triagem_data')
    sessionStorage.removeItem('checkout_source')
    sessionStorage.removeItem('protocol_id')
    sessionStorage.removeItem('cart_locked_plan')
  }, [])

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">

      <header className="bg-[#f5f0eb] px-6 pt-5 pb-4">
        <div className="max-w-lg mx-auto">
          <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg space-y-6">

          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-[#13244f] rounded-full flex items-center justify-center mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Pedido confirmado</p>
              <h1 className="text-2xl font-bold text-[#13244f]">Pagamento recebido</h1>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                Seu pedido foi confirmado e já está sendo preparado. Avisaremos você por email quando houver novidades sobre o envio.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">O que acontece agora</p>

            {[
              {
                status: 'Concluído',
                title: 'Pagamento confirmado',
                desc: 'Seu pagamento foi processado com sucesso.',
                done: true,
              },
              {
                status: 'Em andamento',
                title: 'Pedido em preparação',
                desc: 'Sua farmácia parceira está preparando seus suplementos com cuidado.',
                done: false,
              },
              {
                status: 'Próxima etapa',
                title: 'Envio para sua casa',
                desc: 'Assim que o pedido sair para entrega, você recebe a confirmação por email.',
                done: false,
              },
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-[#13244f]' : 'bg-[#13244f]/10'}`}>
                    {item.done
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <span className="text-xs font-bold text-[#13244f]">{i + 1}</span>
                    }
                  </div>
                  {i < 2 && <div className="w-px flex-1 bg-gray-100 my-1" />}
                </div>
                <div className="pb-4">
                  <p className={`text-xs font-semibold mb-0.5 ${item.done ? 'text-[#13244f]' : 'text-gray-400'}`}>
                    {item.status}
                  </p>
                  <p className="text-sm font-bold text-[#13244f]">{item.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#13244f] rounded-2xl px-6 py-5 text-white text-center space-y-1">
            <p className="text-sm font-bold">Fique de olho no seu email</p>
            <p className="text-xs opacity-70 leading-relaxed">
              Enviaremos atualizações sobre o preparo e o envio do seu pedido.
            </p>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-4 rounded-full font-bold text-sm transition active:scale-95"
          >
            Acessar minha área
          </button>

          <p className="text-xs text-center text-gray-400">
            Dúvidas? Entre em contato: suporte@desafiodiabetes.com
          </p>

        </div>
      </main>
    </div>
  )
}
