'use client'

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md w-full text-center space-y-4">
        <p className="text-[#13244f] font-medium leading-relaxed">
          Não conseguimos carregar seus dados agora. Tente de novo em alguns
          minutos.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-block bg-[#f4001e] text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-[#a30000] transition"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  )
}
