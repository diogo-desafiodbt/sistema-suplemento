// Rota de ação: dispara o teste de uma campanha.
//
// Chamada pelo formulário que vive dentro do iframe do satélite comercial —
// ou seja, quem faz a requisição é o navegador de quem está logado, não a
// Lambda. O satélite continua sem rota de rede para o núcleo.
//
// A resposta é sempre um redirecionamento de volta para a tela do satélite,
// com sucesso ou com o motivo da falha. Nenhum dado do núcleo sai por aqui —
// é o que mantém a rota do lado certo da Regra 7: ela executa, não entrega.

import { type NextRequest, NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/auth/admin'
import { dispararTeste } from '@/lib/marketing/envio'

const TELA = '/suplementos/admin/painel/comercial/campanhas'

function voltar(request: NextRequest, caminho: string) {
  // Absoluta e em https de propósito: a CloudFront fala com o ALB na porta 80,
  // então caminho relativo vira `http://` e o navegador recusa o salto a partir
  // de uma página https. Mesmo motivo do `paraOnde()` do satélite.
  return NextResponse.redirect(
    new URL(caminho, 'https://desafiodiabetes.com'),
    303,
  )
}

export async function POST(request: NextRequest) {
  const usuario = await usuarioAtual()
  if (usuario?.role !== 'admin') {
    return NextResponse.json({ error: 'não autorizado' }, { status: 403 })
  }

  const form = await request.formData()
  const id = Number.parseInt(String(form.get('campanha_id') ?? ''), 10)
  const destino = String(form.get('teste_para') ?? '').trim()
  const previa = String(form.get('_previa') ?? '') === 'celular'

  if (!Number.isFinite(id)) {
    return voltar(request, TELA)
  }

  const resultado = await dispararTeste(id, destino)
  const cauda = previa ? '&previa=celular' : ''

  if (resultado.ok) {
    const aviso = encodeURIComponent(`Teste enviado para ${destino}.`)
    return voltar(request, `${TELA}/${id}?ok=${aviso}${cauda}`)
  }

  const aviso = encodeURIComponent(resultado.motivo)
  return voltar(request, `${TELA}/${id}?aviso=${aviso}${cauda}`)
}
