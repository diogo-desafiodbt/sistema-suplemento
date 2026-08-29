/**
 * Chamadas à Resend. Só o que a tela precisa, sem SDK.
 *
 * A chave é a restrita ao domínio `novidades.desafiodiabetes.com`. Se vazar, o
 * alcance é o domínio de marketing — a raiz que carrega prescrição fica fora.
 */

const BASE = 'https://api.resend.com'
export const REMETENTE = 'Desafio Diabetes <contato@novidades.desafiodiabetes.com>'
export const RESPONDER_PARA = 'contato@desafiodiabetes.com'

async function chamar(caminho, opcoes = {}) {
  const chave = process.env.RESEND_API_KEY
  if (!chave) throw new Error('RESEND_API_KEY ausente')

  const res = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers ?? {}),
    },
  })

  const texto = await res.text()
  let corpo = null
  try {
    corpo = texto ? JSON.parse(texto) : null
  } catch {
    corpo = { raw: texto }
  }

  if (!res.ok) {
    const msg = corpo?.message ?? corpo?.error ?? `HTTP ${res.status}`
    throw new Error(`Resend ${caminho}: ${msg}`)
  }
  return corpo
}

/** Disparo de teste: uma pessoa, sem tocar em audiência nem em campanha. */
export function enviarTeste({ para, assunto, html }) {
  return chamar('/emails', {
    method: 'POST',
    body: JSON.stringify({
      from: REMETENTE,
      to: [para],
      reply_to: RESPONDER_PARA,
      subject: assunto,
      html,
    }),
  })
}

export function criarAudiencia(nome) {
  return chamar('/audiences', {
    method: 'POST',
    body: JSON.stringify({ name: nome }),
  })
}

export function adicionarContato(audienceId, { email, nome }) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  return chamar(`/audiences/${audienceId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      email,
      first_name: partes[0] ?? undefined,
      last_name: partes.length > 1 ? partes.slice(1).join(' ') : undefined,
      unsubscribed: false,
    }),
  })
}

/**
 * Cria o broadcast como rascunho. Não dispara: o envio continua sendo um ato
 * consciente, feito no painel da Resend, onde dá para revisar de novo.
 */
export function criarBroadcast({ audienceId, nome, assunto, html }) {
  return chamar('/broadcasts', {
    method: 'POST',
    body: JSON.stringify({
      audience_id: audienceId,
      name: nome,
      from: REMETENTE,
      reply_to: [RESPONDER_PARA],
      subject: assunto,
      html,
    }),
  })
}
