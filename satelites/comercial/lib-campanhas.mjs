/**
 * Aba Campanhas: compositor, disparo de teste e criação na Resend.
 *
 * Sem JavaScript no navegador. Adicionar e remover bloco são envios de
 * formulário que o servidor responde — mais lento que montar na tela, e sem a
 * classe inteira de bugs de estado que um editor no cliente traz.
 */
import { estiloBase } from '../comum/estilo.mjs'
import { esc, montarHtml, previaHtml } from './lib-email.mjs'
import {
  adicionarContato,
  criarAudiencia,
  criarBroadcast,
  enviarTeste,
} from './lib-resend.mjs'

const RAIZ = '/suplementos/admin/painel/comercial'
const CAMPANHAS = `${RAIZ}/campanhas`

const ROTULO_BLOCO = {
  titulo: 'Título',
  paragrafo: 'Parágrafo',
  imagem: 'Imagem',
  botao: 'Botão',
}

function html(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body,
  }
}

const ORIGEM = 'https://desafiodiabetes.com'

/**
 * Redirecionamento com URL absoluta em https, de propósito.
 *
 * Caminho relativo aqui vira absoluto com o esquema da requisição, e a
 * requisição chega em http — a CloudFront fala com o ALB na porta 80. O
 * navegador, numa página https, recusa o salto para http e o clique não faz
 * nada. Foi assim que cada "+ Título" criou uma campanha nova em vez de
 * adicionar um bloco: a tela voltava sem o identificador.
 */
function paraOnde(caminho) {
  return {
    statusCode: 303,
    headers: { Location: `${ORIGEM}${caminho}` },
    body: '',
  }
}

function corpoForm(event) {
  const bruto = event?.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event?.body ?? '')
  const p = new URLSearchParams(bruto)
  const obj = {}
  for (const [k, v] of p.entries()) {
    if (obj[k] === undefined) obj[k] = v
    else if (Array.isArray(obj[k])) obj[k].push(v)
    else obj[k] = [obj[k], v]
  }
  return { campos: obj, lista: (k) => p.getAll(k) }
}

function pagina(titulo, corpo, aba) {
  const tab = (href, rotulo, ativa) =>
    `<a class="btn${ativa ? ' btn-primario' : ''} btn-compacto" href="${href}">${rotulo}</a>`
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(titulo)}</title>
  <style>${estiloBase()}
    .blocos { display:flex; flex-direction:column; gap:8px; }
    .bloco { border:1px solid var(--borda); border-radius:var(--raio); padding:10px 12px; display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap; }
    .bloco .tipo { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--tinta-fraca); min-width:74px; padding-top:9px; }
    .bloco .campos { flex:1; min-width:220px; display:flex; flex-direction:column; gap:6px; }
    .duas { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,380px); gap:20px; align-items:start; }
    @media (max-width:860px){ .duas { grid-template-columns:minmax(0,1fr); } }
    .previa-quadro { border:1px solid var(--borda); border-radius:var(--raio); overflow:hidden; background:#f4f4f6; }
    .previa-quadro iframe { display:block; width:100%; height:520px; border:0; background:#f4f4f6; }
    .conta-num { font-size:34px; font-weight:700; line-height:1; font-variant-numeric:tabular-nums; color:var(--marinho); }
    .conta-detalhe { list-style:none; margin:14px 0 0; padding:0; font-size:13px; color:var(--tinta-fraca); display:flex; flex-direction:column; gap:5px; max-width:54ch; }
    .conta-detalhe li { display:flex; justify-content:space-between; gap:16px; }
    .origem { display:flex; align-items:center; gap:9px; font-size:14px; }
    .origem .qtd { margin-left:auto; color:var(--tinta-fraca); font-variant-numeric:tabular-nums; }
    .passo { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--tinta-fraca); margin:0 0 10px; }
    .campo-largo { width:100%; }
    .abas { display:flex; gap:8px; margin-bottom:18px; }
  </style>
</head>
<body>
  <main>
    <div class="abas">
      ${tab(RAIZ, 'Leads', aba === 'leads')}
      ${tab(CAMPANHAS, 'Campanhas', aba === 'campanhas')}
    </div>
    ${corpo}
  </main>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export async function listar(db) {
  const linhas = await db`
    SELECT c.id, c.nome, c.assunto, c.situacao, c.criada_em, c.publicada_em,
           (SELECT count(*) FROM marketing.campanha_publico p WHERE p.campanha_id = c.id) AS publico
    FROM marketing.campanha c
    ORDER BY c.criada_em DESC
    LIMIT 50
  `

  const corpo =
    linhas.length === 0
      ? `<div class="vazio">
           <p class="vazio-titulo">Nenhuma campanha ainda</p>
           <p class="vazio-texto">A primeira começa em branco: você escreve, manda um teste para si mesmo e só então escolhe quem recebe.</p>
         </div>`
      : `<div class="tabela-wrap"><table class="tabela">
          <thead><tr><th>Campanha</th><th>Situação</th><th>Público</th><th>Criada</th></tr></thead>
          <tbody>${linhas
            .map(
              (c) => `<tr>
              <td><a href="${CAMPANHAS}/${c.id}"><span class="nome">${esc(c.nome)}</span></a>
                  <span class="muted">${esc(c.assunto)}</span></td>
              <td><span class="selo ${c.situacao === 'publicada' ? 'selo-ok' : 'selo-neutro'}">${esc(c.situacao)}</span></td>
              <td class="mono">${c.publico}</td>
              <td>${new Date(c.criada_em).toLocaleDateString('pt-BR')}</td>
            </tr>`,
            )
            .join('')}</tbody></table></div>`

  return html(
    pagina(
      'Campanhas',
      `<div class="cabeca">
        <div><p class="cabeca-trilha">Comercial / Campanhas</p><h1 class="cabeca-titulo">Campanhas</h1></div>
        <a class="btn btn-primario" href="${CAMPANHAS}/nova">Nova campanha</a>
      </div>
      <div class="card card-flush">${corpo}</div>`,
      'campanhas',
    ),
  )
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function camposDoBloco(b, i) {
  const texto = `<input class="campo campo-largo" name="texto_${i}" value="${esc(b.texto ?? '')}" placeholder="${b.tipo === 'botao' ? 'Texto do botão' : 'Texto'}">`
  const url =
    b.tipo === 'imagem' || b.tipo === 'botao'
      ? `<input class="campo campo-largo" name="url_${i}" value="${esc(b.url ?? '')}" placeholder="https://…">`
      : ''
  return `<div class="bloco">
    <span class="tipo">${ROTULO_BLOCO[b.tipo] ?? b.tipo}</span>
    <span class="campos">${texto}${url}</span>
    <button class="btn btn-compacto" type="submit" name="acao" value="remover_${i}">Remover</button>
  </div>`
}

function contaPublico(total, semConsentimento, suprimidos, acimaDoTeto, final) {
  return `<p style="margin:0"><span class="conta-num">${final}</span>
      <span style="font-size:15px;color:var(--tinta-fraca);margin-left:8px">
        ${final === 1 ? 'pessoa vai receber' : 'pessoas vão receber'}</span></p>
    <ul class="conta-detalhe">
      <li><span>Nas categorias escolhidas</span><span>${total}</span></li>
      <li><span>Sem consentimento de marketing</span><span>−${semConsentimento}</span></li>
      <li><span>Descadastrados ou com e-mail devolvido</span><span>−${suprimidos}</span></li>
      <li><span>Acima do teto</span><span>−${acimaDoTeto}</span></li>
    </ul>`
}

export async function editor(db, campanhaId, aviso) {
  const origens = await db`
    SELECT o.codigo, o.descricao, count(l.id) AS total
    FROM marketing.origem o LEFT JOIN marketing.lead l ON l.origem = o.codigo
    GROUP BY o.codigo, o.descricao ORDER BY count(l.id) DESC, o.codigo
  `

  let c = {
    id: null,
    nome: '',
    assunto: '',
    blocos: [],
    filtro: { origens: [], desde: '', teto: '300' },
    situacao: 'rascunho',
  }

  if (campanhaId) {
    const linhas = await db`
      SELECT id, nome, assunto, blocos, filtro, situacao, resend_broadcast_id
      FROM marketing.campanha WHERE id = ${campanhaId}
    `
    if (!linhas[0]) return html(pagina('Não encontrada', '<p>Campanha não encontrada.</p>', 'campanhas'), 404)
    c = { ...linhas[0], filtro: linhas[0].filtro ?? {} }
  }

  const testes = campanhaId
    ? await db`
        SELECT email, enviado_em FROM marketing.campanha_teste
        WHERE campanha_id = ${campanhaId} ORDER BY enviado_em DESC LIMIT 8
      `
    : []

  const escolhidas = Array.isArray(c.filtro?.origens) ? c.filtro.origens : []
  const teto = Number.parseInt(c.filtro?.teto ?? '300', 10) || null
  const desde = c.filtro?.desde || null

  let conta = null
  if (escolhidas.length > 0) {
    const [linha] = await db`
      WITH base AS (
        SELECT l.id, l.email,
               EXISTS (SELECT 1 FROM marketing.consentimento k WHERE k.lead_id = l.id) AS tem_consent,
               EXISTS (SELECT 1 FROM marketing.supressao s WHERE lower(s.email) = lower(l.email)) AS suprimido
        FROM marketing.lead l
        WHERE l.origem = ANY(${escolhidas})
          AND (${desde}::timestamptz IS NULL OR l.captado_em >= ${desde}::timestamptz)
      )
      SELECT count(*) AS total,
             count(*) FILTER (WHERE NOT tem_consent) AS sem_consent,
             count(*) FILTER (WHERE tem_consent AND suprimido) AS suprimidos,
             count(*) FILTER (WHERE tem_consent AND NOT suprimido) AS elegiveis
      FROM base
    `
    const elegiveis = Number(linha.elegiveis)
    const acima = teto && elegiveis > teto ? elegiveis - teto : 0
    conta = {
      total: Number(linha.total),
      semConsent: Number(linha.sem_consent),
      suprimidos: Number(linha.suprimidos),
      acima,
      final: elegiveis - acima,
    }
  }

  const temTeste = testes.length > 0
  const idCampo = c.id ? `<input type="hidden" name="id" value="${c.id}">` : ''

  const corpo = `
  <div class="cabeca">
    <div><p class="cabeca-trilha">Comercial / Campanhas</p>
      <h1 class="cabeca-titulo">${c.id ? esc(c.nome || 'Campanha') : 'Nova campanha'}</h1></div>
    <span class="cabeca-meta">${c.situacao === 'publicada' ? 'Publicada na Resend' : 'Rascunho · não enviado'}</span>
  </div>

  ${aviso ? `<div class="card" style="border-color:var(--atencao)"><p style="margin:0">${esc(aviso)}</p></div>` : ''}

  <form method="POST" action="${CAMPANHAS}/salvar">
    ${idCampo}

    <div class="card" style="margin-bottom:20px">
      <p class="passo">Passo 1 de 3</p>
      <h2 style="margin:0 0 2px;font-size:16px">O que a pessoa vai ler</h2>
      <p class="muted" style="margin:0 0 16px">Sem campo de HTML: HTML solto quebra no Outlook e some com o link de descadastro, e isso só aparece depois de enviar.</p>

      <div class="duas">
        <div>
          <label class="muted" for="nome">Nome interno</label>
          <input class="campo campo-largo" id="nome" name="nome" value="${esc(c.nome)}" placeholder="Como você reconhece esta campanha" style="margin-bottom:12px">

          <label class="muted" for="assunto">Assunto</label>
          <input class="campo campo-largo" id="assunto" name="assunto" value="${esc(c.assunto)}" placeholder="O que aparece na caixa de entrada" style="margin-bottom:16px">

          <div class="blocos">
            ${(c.blocos ?? []).map(camposDoBloco).join('') || '<p class="muted">Nenhum bloco ainda. Comece por um título.</p>'}
          </div>

          <div class="acoes" style="margin-top:12px">
            <button class="btn btn-compacto" type="submit" name="acao" value="add_titulo">+ Título</button>
            <button class="btn btn-compacto" type="submit" name="acao" value="add_paragrafo">+ Parágrafo</button>
            <button class="btn btn-compacto" type="submit" name="acao" value="add_imagem">+ Imagem</button>
            <button class="btn btn-compacto" type="submit" name="acao" value="add_botao">+ Botão</button>
          </div>
        </div>

        <div class="previa-quadro">
          <iframe title="Prévia do e-mail" srcdoc="${esc(previaHtml(c.blocos ?? []))}"></iframe>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <p class="passo">Passo 2 de 3</p>
      <h2 style="margin:0 0 2px;font-size:16px">Veja como chega antes de qualquer pessoa ver</h2>
      <p class="muted" style="margin:0 0 16px">Confira duas coisas: se o layout se comporta no celular e no Outlook, e se caiu na caixa de entrada ou em promoções.</p>
      <div class="acoes">
        <input class="campo" style="min-width:280px" type="email" name="teste_para" placeholder="seu@email.com" value="">
        <button class="btn" type="submit" name="acao" value="teste" ${c.id ? '' : 'title="Salve o rascunho primeiro"'}>Enviar teste</button>
      </div>
      ${
        testes.length
          ? `<ul class="lista" style="margin-top:14px">${testes
              .map(
                (t) =>
                  `<li><span class="selo selo-ok">enviado</span> ${esc(t.email)} <span class="muted">${new Date(t.enviado_em).toLocaleString('pt-BR')}</span></li>`,
              )
              .join('')}</ul>`
          : '<p class="muted" style="margin-top:14px">Nenhum teste enviado ainda.</p>'
      }
    </div>

    <div class="card" style="margin-bottom:20px">
      <p class="passo">Passo 3 de 3</p>
      <h2 style="margin:0 0 2px;font-size:16px">Quem vai receber</h2>
      <p class="muted" style="margin:0 0 16px">O teto existe por causa do aquecimento do domínio: subir o volume devagar é o que mantém a entrega na caixa de entrada.</p>

      <div class="grid">
        <div>
          <label class="muted">Categorias</label>
          ${origens
            .map(
              (o) => `<label class="origem">
                <input type="checkbox" name="origens" value="${esc(o.codigo)}" ${escolhidas.includes(o.codigo) ? 'checked' : ''}>
                ${esc(o.descricao)} <span class="qtd">${o.total}</span>
              </label>`,
            )
            .join('')}
        </div>
        <div>
          <label class="muted" for="desde">Captados a partir de</label>
          <input class="campo campo-largo" id="desde" type="date" name="desde" value="${esc(c.filtro?.desde ?? '')}">
        </div>
        <div>
          <label class="muted" for="teto">Enviar no máximo</label>
          <input class="campo campo-largo" id="teto" type="number" min="1" name="teto" value="${esc(c.filtro?.teto ?? '300')}">
        </div>
      </div>

      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--borda)">
        ${
          conta
            ? contaPublico(conta.total, conta.semConsent, conta.suprimidos, conta.acima, conta.final)
            : '<p class="muted" style="margin:0">Escolha ao menos uma categoria e salve para ver a conta.</p>'
        }
      </div>
    </div>

    <div class="acoes" style="justify-content:flex-end">
      <span class="muted">A campanha é criada como rascunho. Quem aperta enviar é você, na Resend.</span>
      <button class="btn" type="submit" name="acao" value="salvar">Salvar rascunho</button>
      <button class="btn btn-primario" type="submit" name="acao" value="publicar"
        ${!temTeste || !conta || conta.final === 0 || c.situacao === 'publicada' ? 'disabled' : ''}>Criar na Resend</button>
    </div>
    ${
      !temTeste
        ? '<p class="muted" style="text-align:right;margin-top:8px">Mande um teste antes de criar a campanha.</p>'
        : ''
    }
  </form>`

  return html(pagina(c.id ? 'Campanha' : 'Nova campanha', corpo, 'campanhas'))
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

function blocosDoForm(campos) {
  const blocos = []
  let i = 0
  while (campos[`texto_${i}`] !== undefined || campos[`url_${i}`] !== undefined) {
    blocos.push({
      texto: campos[`texto_${i}`] ?? '',
      url: campos[`url_${i}`] ?? '',
    })
    i += 1
  }
  return blocos
}

export async function salvar(db, event) {
  const { campos, lista } = corpoForm(event)
  const acao = String(campos.acao ?? 'salvar')

  const linhas = await db`
    SELECT blocos FROM marketing.campanha WHERE id = ${campos.id ?? null}
  `
  const anteriores = linhas[0]?.blocos ?? []

  // Os tipos vêm do que já está gravado; o formulário só devolve texto e URL.
  // Assim ninguém injeta um tipo de bloco inventado pelo POST.
  const doForm = blocosDoForm(campos)
  let blocos = doForm.map((b, i) => ({
    tipo: anteriores[i]?.tipo ?? 'paragrafo',
    texto: b.texto,
    url: b.url,
  }))

  if (acao.startsWith('add_')) {
    blocos.push({ tipo: acao.slice(4), texto: '', url: '' })
  } else if (acao.startsWith('remover_')) {
    const idx = Number.parseInt(acao.slice(8), 10)
    blocos = blocos.filter((_, i) => i !== idx)
  }

  const filtro = {
    origens: lista('origens'),
    desde: campos.desde ?? '',
    teto: campos.teto ?? '300',
  }

  const dados = {
    nome: String(campos.nome ?? '').trim() || 'Campanha sem nome',
    assunto: String(campos.assunto ?? '').trim(),
    blocos,
    filtro,
    html: montarHtml(blocos),
  }

  let id = campos.id ? Number(campos.id) : null
  if (id) {
    await db`
      UPDATE marketing.campanha SET
        nome = ${dados.nome}, assunto = ${dados.assunto},
        blocos = ${db.json(dados.blocos)}, filtro = ${db.json(dados.filtro)},
        html = ${dados.html}
      WHERE id = ${id} AND situacao = 'rascunho'
    `
  } else {
    const [nova] = await db`
      INSERT INTO marketing.campanha (nome, assunto, blocos, filtro, html)
      VALUES (${dados.nome}, ${dados.assunto}, ${db.json(dados.blocos)},
              ${db.json(dados.filtro)}, ${dados.html})
      RETURNING id
    `
    id = nova.id
  }

  if (acao === 'teste') return enviarTesteDaCampanha(db, id, campos.teste_para)
  if (acao === 'publicar') return publicar(db, id)
  return paraOnde(`${CAMPANHAS}/${id}`)
}

async function enviarTesteDaCampanha(db, id, para) {
  const destino = String(para ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
    return paraOnde(`${CAMPANHAS}/${id}?aviso=${encodeURIComponent('Informe um e-mail válido para o teste.')}`)
  }

  const [c] = await db`
    SELECT assunto, html FROM marketing.campanha WHERE id = ${id}
  `
  if (!c?.assunto) {
    return paraOnde(`${CAMPANHAS}/${id}?aviso=${encodeURIComponent('Escreva o assunto antes de mandar o teste.')}`)
  }

  try {
    // A variável de descadastro não existe fora de um broadcast, então no
    // teste ela vira um link morto — o layout é o mesmo.
    const enviado = await enviarTeste({
      para: destino,
      assunto: `[teste] ${c.assunto}`,
      html: String(c.html ?? '').replace('{{{RESEND_UNSUBSCRIBE_URL}}}', '#'),
    })
    await db`
      INSERT INTO marketing.campanha_teste (campanha_id, email, resend_email_id)
      VALUES (${id}, ${destino}, ${enviado?.id ?? null})
    `
    return paraOnde(`${CAMPANHAS}/${id}`)
  } catch (erro) {
    return paraOnde(`${CAMPANHAS}/${id}?aviso=${encodeURIComponent(`Teste não saiu: ${erro.message}`)}`)
  }
}

async function publicar(db, id) {
  const [c] = await db`
    SELECT id, nome, assunto, html, filtro, situacao FROM marketing.campanha WHERE id = ${id}
  `
  if (!c) return paraOnde(CAMPANHAS)
  if (c.situacao === 'publicada') {
    return paraOnde(`${CAMPANHAS}/${id}?aviso=${encodeURIComponent('Esta campanha já foi criada na Resend.')}`)
  }

  const origens = Array.isArray(c.filtro?.origens) ? c.filtro.origens : []
  const desde = c.filtro?.desde || null
  const teto = Number.parseInt(c.filtro?.teto ?? '', 10) || null

  const publico = await db`
    SELECT lead_id, email, nome
    FROM marketing.publico_da_campanha(${origens}, ${desde}::timestamptz, ${teto})
  `
  if (publico.length === 0) {
    return paraOnde(`${CAMPANHAS}/${id}?aviso=${encodeURIComponent('Nenhuma pessoa elegível com esses filtros.')}`)
  }

  try {
    const audiencia = await criarAudiencia(`${c.nome} — ${new Date().toISOString().slice(0, 10)}`)
    const audienceId = audiencia?.id
    if (!audienceId) throw new Error('Resend não devolveu id da audiência')

    for (const p of publico) {
      await adicionarContato(audienceId, { email: p.email, nome: p.nome })
    }

    const broadcast = await criarBroadcast({
      audienceId,
      nome: c.nome,
      assunto: c.assunto,
      html: c.html,
    })

    await db.begin(async (tx) => {
      await tx`
        UPDATE marketing.campanha SET
          resend_audience_id = ${audienceId},
          resend_broadcast_id = ${broadcast?.id ?? null},
          situacao = 'publicada',
          publicada_em = now()
        WHERE id = ${id}
      `
      await tx`DELETE FROM marketing.campanha_publico WHERE campanha_id = ${id}`
      for (const p of publico) {
        await tx`
          INSERT INTO marketing.campanha_publico (campanha_id, lead_id)
          VALUES (${id}, ${p.lead_id}) ON CONFLICT DO NOTHING
        `
      }
    })

    return paraOnde(`${CAMPANHAS}/${id}?aviso=${encodeURIComponent(`Criada na Resend com ${publico.length} pessoas. Abra lá para revisar e enviar.`)}`)
  } catch (erro) {
    return paraOnde(`${CAMPANHAS}/${id}?aviso=${encodeURIComponent(`Não foi criada: ${erro.message}`)}`)
  }
}

export { CAMPANHAS, RAIZ }
