import { RegistrarVisita } from '@/components/RegistrarVisita'

/**
 * Só as telas públicas registram visita. Admin, profissional e portal do
 * paciente ficam de fora de propósito: a equipe navegando pelo sistema não é
 * jornada de cliente, e misturar as duas coisas estraga justamente os números
 * que o Rastro existe para dar.
 */
export default function LayoutPublico({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <RegistrarVisita />
      {children}
    </>
  )
}
