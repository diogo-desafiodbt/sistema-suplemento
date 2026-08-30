// Registro de leitura de prontuário.
//
// Até 30/08/2026 só a assinatura deixava rastro. Depois de um incidente, a
// única pergunta que importa é o que foi acessado — e ela ficava sem resposta.
//
// Grava pelo `after()` do Next, que roda DEPOIS de a resposta já ter sido
// enviada ao navegador. O registro não entra no caminho entre o clique e a
// tela, então não custa latência nenhuma para quem está usando.
//
// Nunca derruba a página: se a gravação falhar, o erro vai para o log e a
// leitura continua. Um registro perdido é ruim; uma ficha que não abre porque
// o log falhou é pior.

import { after } from 'next/server'
import { headers } from 'next/headers'
import { getSql } from '@/lib/db'

type Tipo = 'ficha' | 'protocolo'

export function registrarLeitura(params: {
  quem: string
  papel: string
  oQue: Tipo
  alvo: string
}) {
  after(async () => {
    try {
      const cabecalhos = await headers()
      const ip =
        cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

      const sql = getSql()
      await sql`
        INSERT INTO leitura_prontuario (quem, papel, o_que, alvo, ip)
        VALUES (${params.quem}::uuid, ${params.papel}, ${params.oQue},
                ${params.alvo}::uuid, ${ip})
      `
    } catch (erro) {
      console.error('[auditoria] leitura não registrada:', erro)
    }
  })
}
