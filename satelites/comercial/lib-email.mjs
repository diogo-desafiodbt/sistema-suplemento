/**
 * Blocos → HTML de e-mail.
 *
 * Tabela e estilo em atributo inline, que é o que Outlook e Gmail entendem sem
 * discutir. O compositor não deixa escrever HTML justamente para o resultado
 * passar sempre por aqui.
 */

const MARINHO = '#13244f'
const VERMELHO = '#f4001e'
const TINTA = '#212529'
const FRACA = '#6c757d'

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Só http(s). Sem isto, um bloco de botão viraria porta para `javascript:`. */
function urlSegura(valor) {
  const bruto = String(valor ?? '').trim()
  if (!/^https?:\/\//i.test(bruto)) return null
  return bruto
}

function blocoHtml(b) {
  const texto = esc(b?.texto ?? '')
  switch (b?.tipo) {
    case 'titulo':
      return `<tr><td style="padding:0 0 14px"><h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.25;color:${MARINHO}">${texto}</h1></td></tr>`
    case 'paragrafo':
      return `<tr><td style="padding:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${TINTA}">${texto}</td></tr>`
    case 'imagem': {
      const src = urlSegura(b?.url)
      if (!src) return ''
      return `<tr><td style="padding:0 0 16px"><img src="${esc(src)}" alt="${texto}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>`
    }
    case 'botao': {
      const href = urlSegura(b?.url)
      if (!href) return ''
      return `<tr><td style="padding:6px 0 18px"><a href="${esc(href)}" style="display:inline-block;background:${VERMELHO};color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;padding:13px 26px;border-radius:4px">${texto}</a></td></tr>`
    }
    default:
      return ''
  }
}

/**
 * `{{{RESEND_UNSUBSCRIBE_URL}}}` é a variável que a Resend troca pelo link de
 * descadastro de cada pessoa. Sem ela no corpo, a Resend recusa o broadcast —
 * e é por isso que o rodapé é montado aqui e não pelo usuário.
 */
export function montarHtml(blocos) {
  const corpo = (Array.isArray(blocos) ? blocos : []).map(blocoHtml).join('')
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:4px">
<tr><td style="padding:28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${corpo}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:20px 0 0;border-top:1px solid #e2e8ee;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${FRACA}">
Você recebe este e-mail porque se inscreveu no Desafio Diabetes.<br>
<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${FRACA}">Não quero mais receber</a>
</td></tr></table>
</td></tr></table>
</td></tr></table>
</body></html>`
}

/** Prévia dentro do admin: o mesmo HTML, sem a variável crua na tela. */
export function previaHtml(blocos) {
  return montarHtml(blocos).replace(
    '{{{RESEND_UNSUBSCRIBE_URL}}}',
    '#descadastro',
  )
}
