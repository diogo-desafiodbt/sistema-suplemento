'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ObrigadoPage() {
  const router = useRouter()

  useEffect(() => {
    sessionStorage.removeItem('protocol_items')
    sessionStorage.removeItem('selected_plan')
    sessionStorage.removeItem('quiz_data')
    sessionStorage.removeItem('protocol_id')
  }, [])

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">

      {/* Header */}
      <header className="bg-[#f5f0eb] px-6 pt-5 pb-4">
        <div className="max-w-lg mx-auto">
          <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg space-y-6">

          {/* Ícone de sucesso + título */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-[#13244f] rounded-full flex items-center justify-center mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Pedido confirmado</p>
              <h1 className="text-2xl font-bold text-[#13244f]">Seu protocolo está em análise</h1>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                Pagamento recebido. Agora um profissional habilitado vai revisar seu protocolo antes do envio.
              </p>
            </div>
          </div>

          {/* Timeline de próximos passos */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">O que acontece agora</p>

            {[
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M9 12l2 2 4-4" stroke="#13244f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="12" r="9" stroke="#13244f" strokeWidth="2"/>
                  </svg>
                ),
                status: 'Concluído',
                title: 'Pagamento confirmado',
                desc: 'Seu pagamento foi processado com sucesso.',
                done: true,
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 8v4l2 2" stroke="#13244f" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="12" cy="12" r="9" stroke="#13244f" strokeWidth="2"/>
                  </svg>
                ),
                status: 'Em andamento',
                title: 'Revisão do protocolo',
                desc: 'Um profissional habilitado irá analisar seu protocolo via consulta assíncrona e assinar digitalmente a prescrição.',
                done: false,
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M4 4h16v12H4z" stroke="#13244f" strokeWidth="2" strokeLinejoin="round"/>
                    <path d="M4 8l8 5 8-5" stroke="#13244f" strokeWidth="2"/>
                  </svg>
                ),
                status: 'Aguardando aprovação',
                title: 'Aprovação por email',
                desc: 'Você receberá um email assim que o profissional aprovar seu tratamento.',
                done: false,
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 8h14M5 12h9M5 16h5" stroke="#13244f" strokeWidth="2" strokeLinecap="round"/>
                    <rect x="3" y="4" width="18" height="16" rx="2" stroke="#13244f" strokeWidth="2"/>
                  </svg>
                ),
                status: 'Próxima etapa',
                title: 'Suplemento sendo preparado',
                desc: 'Com a aprovação, a farmácia parceira inicia o preparo e envio do seu suplemento.',
                done: false,
              },
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-[#13244f]' : 'bg-[#13244f]/10'}`}>
                    {item.done
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : item.icon
                    }
                  </div>
                  {i < 3 && <div className="w-px flex-1 bg-gray-100 my-1" />}
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

          {/* Aviso de email */}
          <div className="bg-[#13244f] rounded-2xl px-6 py-5 text-white text-center space-y-1">
            <p className="text-sm font-bold">Fique de olho no seu email</p>
            <p className="text-xs opacity-70 leading-relaxed">
              Enviaremos todas as atualizações do seu protocolo por email, incluindo a aprovação e a confirmação de envio.
            </p>
          </div>

          {/* CTA para dashboard */}
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
