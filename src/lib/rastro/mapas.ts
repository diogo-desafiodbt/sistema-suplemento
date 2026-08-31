// O desenho do fluxo: três jornadas, cada uma com colunas, nós e fios.
//
// É a estrutura que o Diogo aprovou no protótipo de 30/08. O que muda daquele
// para este é a origem dos números: lá eram inventados para mostrar a forma,
// aqui cada nó declara de onde o número dele sai.
//
// `fonte` diz o que o sistema consegue medir hoje. Nó sem fonte é **cego** —
// aparece no desenho com a etiqueta, porque a lacuna faz parte da informação:
// esconder o que a gente não enxerga daria a impressão de que o funil acaba
// onde na verdade ele só some de vista.

export type Fonte =
  | { tipo: 'evento'; evento: string }
  | { tipo: 'origem'; prefixo: string }
  | { tipo: 'contagem'; chave: 'guia' | 'pedidos' | 'recorrentes' | 'clientes' }

export type No = {
  id: string
  col: number
  lin: number
  nome: string
  icone: string
  cor: 1 | 2 | 3 | 0
  sub: string
  fonte?: Fonte
}

export type Fio = { de: string; para: string; tracejado?: boolean }

export type Mapa = {
  chave: string
  rotulo: string
  colunas: string[]
  nos: No[]
  fios: Fio[]
}

export const MAPAS: Mapa[] = [
  {
    chave: 'operacao',
    rotulo: 'Operação',
    colunas: ['Origem', 'Entrada', 'Produto', 'Cliente', 'Recorrência'],
    nos: [
      { id: 'yt', col: 0, lin: 0, nome: 'YouTube', icone: 'play', cor: 0, sub: 'primeira origem', fonte: { tipo: 'origem', prefixo: 'yt-' } },
      { id: 'ig', col: 0, lin: 1, nome: 'Instagram', icone: 'play', cor: 0, sub: 'primeira origem', fonte: { tipo: 'origem', prefixo: 'ig-' } },
      { id: 'em', col: 0, lin: 2, nome: 'E-mail', icone: 'chat', cor: 0, sub: 'primeira origem', fonte: { tipo: 'origem', prefixo: 'email' } },
      { id: 'link', col: 1, lin: 1, nome: 'Chegou no site', icone: 'link', cor: 1, sub: 'visita rastreada', fonte: { tipo: 'evento', evento: 'visita' } },
      { id: 'app', col: 2, lin: 0, nome: 'Baixou o app', icone: 'box', cor: 0, sub: 'sem ligação hoje' },
      { id: 'guia', col: 2, lin: 1, nome: 'Comprou o guia', icone: 'doc', cor: 2, sub: 'Hotmart', fonte: { tipo: 'contagem', chave: 'guia' } },
      { id: 'grupo', col: 3, lin: 0, nome: 'Entrou no grupo', icone: 'chat', cor: 3, sub: 'WhatsApp' },
      { id: 'sup', col: 3, lin: 1, nome: 'Assinou o suplemento', icone: 'cart', cor: 1, sub: 'pedido 1', fonte: { tipo: 'contagem', chave: 'pedidos' } },
      { id: 'rec', col: 4, lin: 1, nome: 'Recorrente', icone: 'star', cor: 1, sub: '2 pedidos ou mais', fonte: { tipo: 'contagem', chave: 'recorrentes' } },
    ],
    fios: [
      { de: 'yt', para: 'link' }, { de: 'ig', para: 'link' }, { de: 'em', para: 'link' },
      { de: 'link', para: 'app', tracejado: true }, { de: 'link', para: 'guia' },
      { de: 'guia', para: 'grupo', tracejado: true }, { de: 'grupo', para: 'sup', tracejado: true },
      { de: 'link', para: 'sup' }, { de: 'sup', para: 'rec' },
    ],
  },
  {
    chave: 'guia',
    rotulo: 'Guia',
    colunas: ['Origem', 'Página', 'Checkout', 'Compra', 'Grupo'],
    nos: [
      { id: 'g0', col: 0, lin: 0, nome: 'Clicou no link', icone: 'link', cor: 1, sub: 'YouTube, bio, grupo', fonte: { tipo: 'origem', prefixo: '' } },
      { id: 'g1', col: 1, lin: 0, nome: 'Abriu a página', icone: 'doc', cor: 1, sub: 'página de vendas', fonte: { tipo: 'evento', evento: 'visita' } },
      { id: 'g2', col: 2, lin: 0, nome: 'Foi ao checkout', icone: 'cart', cor: 2, sub: 'Hotmart' },
      { id: 'g3', col: 3, lin: 0, nome: 'Comprou', icone: 'doc', cor: 2, sub: 'aprovado', fonte: { tipo: 'contagem', chave: 'guia' } },
      { id: 'g4', col: 4, lin: 0, nome: 'Entrou no grupo', icone: 'chat', cor: 3, sub: 'WhatsApp' },
      { id: 'g5', col: 4, lin: 1, nome: 'Ficou fora do grupo', icone: 'fone', cor: 0, sub: 'comprou e sumiu' },
    ],
    fios: [
      { de: 'g0', para: 'g1' }, { de: 'g1', para: 'g2', tracejado: true },
      { de: 'g2', para: 'g3' }, { de: 'g3', para: 'g4', tracejado: true }, { de: 'g3', para: 'g5', tracejado: true },
    ],
  },
  {
    chave: 'suplemento',
    rotulo: 'Suplemento',
    colunas: ['Entrada', 'Triagem', 'Checkout', 'Pedido', 'Recompra'],
    nos: [
      { id: 's0', col: 0, lin: 0, nome: 'Abriu a página', icone: 'link', cor: 1, sub: 'do grupo ou do link', fonte: { tipo: 'evento', evento: 'visita' } },
      { id: 's1', col: 1, lin: 0, nome: 'Começou a triagem', icone: 'quiz', cor: 1, sub: '', fonte: { tipo: 'evento', evento: 'triagem_iniciada' } },
      // O nome não diz o resultado, por decisão de Zona 1: que a triagem
      // aconteceu é fato de navegação; que ela deu apto é leitura clínica.
      { id: 's2', col: 1, lin: 1, nome: 'Terminou a triagem', icone: 'quiz', cor: 1, sub: '', fonte: { tipo: 'evento', evento: 'triagem_concluida' } },
      { id: 's3', col: 2, lin: 1, nome: 'Abriu o checkout', icone: 'cart', cor: 2, sub: '', fonte: { tipo: 'evento', evento: 'checkout_iniciado' } },
      { id: 's4', col: 3, lin: 1, nome: 'Comprou', icone: 'box', cor: 2, sub: 'pedido 1', fonte: { tipo: 'contagem', chave: 'pedidos' } },
      { id: 's5', col: 4, lin: 1, nome: 'Comprou de novo', icone: 'star', cor: 1, sub: 'pedido 2', fonte: { tipo: 'contagem', chave: 'recorrentes' } },
    ],
    fios: [
      { de: 's0', para: 's1' }, { de: 's1', para: 's2' }, { de: 's2', para: 's3' },
      { de: 's3', para: 's4' }, { de: 's4', para: 's5' },
    ],
  },
]

export const CORES = ['var(--admin-tinta-fraca)', '#2a78d6', '#eb6834', '#1baf7a']
