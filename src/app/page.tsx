import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-lg">Desafio Diabetes</span>
        <Link href="/login">
          <Button variant="outline" size="sm">Já tenho conta</Button>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-2xl space-y-8">

          <div className="inline-block bg-green-50 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full border border-green-200">
            Protocolo personalizado para diabetes tipo 2
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Controle seu diabetes com um tratamento feito para você
            </h1>
            <p className="text-gray-500 text-lg leading-relaxed">
              Responda algumas perguntas clínicas e receba um protocolo personalizado de suplementos, com prescrição médica e entrega na sua casa.
            </p>
          </div>

          <div className="space-y-3">
            <Link href="/quiz">
              <Button size="lg" className="w-full max-w-sm text-base h-12">
                Começar meu protocolo — é grátis
              </Button>
            </Link>
            <p className="text-xs text-gray-400">
              Leva menos de 3 minutos · Sem compromisso
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            {[
              { icon: '🩺', title: 'Prescrição médica', desc: 'Protocolo assinado por médico habilitado' },
              { icon: '📦', title: 'Entrega em casa', desc: 'Suplementos enviados direto para você' },
              { icon: '🔄', title: 'Renovação automática', desc: 'Sem precisar recomprar todo mês' },
            ].map(item => (
              <div key={item.title} className="bg-gray-50 rounded-lg p-4 text-left">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-medium text-sm">{item.title}</div>
                <div className="text-gray-500 text-xs mt-1">{item.desc}</div>
              </div>
            ))}
          </div>

          <div className="border rounded-lg p-6 text-left space-y-4">
            <h2 className="font-medium">Suplementos do protocolo</h2>
            <div className="space-y-3">
              {[
                { name: 'Berberina', desc: 'Controle glicêmico natural — tratamento principal', required: true },
                { name: 'Vitamina B12', desc: 'Indicada para uso de metformina ou diagnóstico longo', required: false },
                { name: 'Ômega 3', desc: 'Para sintomas neurológicos e inflamatórios', required: false },
              ].map(product => (
                <div key={product.name} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium">{product.name}</span>
                    {product.required && (
                      <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">sempre incluído</span>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">{product.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <Link href="/quiz">
              <Button size="lg" className="w-full max-w-sm text-base h-12">
                Descobrir meu protocolo
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t px-6 py-4 text-center">
        <p className="text-xs text-gray-400">
          © 2026 Desafio Diabetes · Prescrição médica incluída · CNPJ 63.862.444/0001-56
        </p>
      </footer>
    </div>
  )
}
