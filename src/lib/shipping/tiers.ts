import type { PrecoPrazoItem, ShippingTier } from '@/types/shipping'

/**
 * Reduz as cotações da Envie Agora a três escolhas nomeadas pelo benefício,
 * não pela transportadora.
 *
 * O cliente não vê mais quem transporta. Isso é intencional: o nome da
 * transportadora não ajuda ninguém a decidir — atrapalha, porque carrega
 * reputação que não é nossa e que varia por região. Prazo e preço decidem.
 *
 * Também é o que permite trocar de parceiro sem que a experiência mude.
 *
 * Consequência que precisa ser respeitada por quem mexer aqui: como o cliente
 * devolve só o nível escolhido, o servidor precisa recotar e reaplicar ESTA
 * mesma função para saber qual serviço contratar. Por isso ela é pura e vive
 * separada da rota.
 */

/** Peso do preço no cálculo de custo-benefício; o prazo leva o resto. */
const PESO_PRECO = 0.5

function normalizar(valor: number, min: number, max: number): number {
  // Todas as cotações iguais nesta dimensão: ela não diferencia nada, então
  // não pode empurrar o resultado para nenhum lado.
  if (max === min) return 0
  return (valor - min) / (max - min)
}

/**
 * Nota de custo-benefício: 0 é o ideal inalcançável (o mais barato E o mais
 * rápido ao mesmo tempo). Preço e prazo entram normalizados entre a melhor e a
 * pior cotação da vez, então a nota é sempre relativa ao que existe hoje para
 * aquele CEP — não a uma tabela fixa que envelheceria.
 */
function nota(
  q: PrecoPrazoItem,
  faixa: { valorMin: number; valorMax: number; prazoMin: number; prazoMax: number },
): number {
  const p = normalizar(q.valor, faixa.valorMin, faixa.valorMax)
  const d = normalizar(q.prazoDias, faixa.prazoMin, faixa.prazoMax)
  return PESO_PRECO * p + (1 - PESO_PRECO) * d
}

export type TierEscolhido = {
  tier: ShippingTier
  quote: PrecoPrazoItem
}

/**
 * Descarta as cotações que perdem em preço E em prazo para alguma outra.
 *
 * Sem isso o "melhor custo-benefício" podia cair numa opção mais cara e mais
 * lenta que a que já estava na tela — ninguém escolheria, e oferecê-la faz o
 * rótulo mentir. Acontecia sempre que o mais barato era também o mais rápido:
 * as sobras eram todas piores, e uma delas ia para a terceira vaga assim mesmo.
 */
function apenasNaoDominadas(quotes: PrecoPrazoItem[]): PrecoPrazoItem[] {
  return quotes.filter((q, i) =>
    !quotes.some((outra, j) => {
      if (i === j) return false
      if (outra.valor > q.valor || outra.prazoDias > q.prazoDias) return false
      // Melhor em alguma dimensão: domina de fato.
      if (outra.valor < q.valor || outra.prazoDias < q.prazoDias) return true
      // Empate exato em preço e prazo. Com a transportadora escondida as duas
      // são a mesma oferta aos olhos do cliente, e dois botões idênticos são
      // ruído. Fica a primeira; a ordem do array decide, para ser estável
      // entre a cotação da tela e a recotação do servidor.
      return j < i
    }),
  )
}

/**
 * Devolve até três cotações distintas, na ordem em que o cliente as vê.
 *
 * "Até três" é literal: quando as cotações restantes são todas piores que as
 * já escolhidas, saem duas opções, ou uma. Preferimos mostrar menos a inventar
 * uma terceira — três botões para o mesmo envio, ou um rótulo de
 * custo-benefício numa opção pior em tudo, seriam uma escolha falsa.
 */
export function escolherTiers(todas: PrecoPrazoItem[]): TierEscolhido[] {
  if (todas.length === 0) return []

  const quotes = apenasNaoDominadas(todas)

  const maisRapido = quotes.reduce((a, b) => {
    if (a.prazoDias !== b.prazoDias) return a.prazoDias < b.prazoDias ? a : b
    return a.valor <= b.valor ? a : b
  })

  const maisBarato = quotes.reduce((a, b) => {
    if (a.valor !== b.valor) return a.valor < b.valor ? a : b
    return a.prazoDias <= b.prazoDias ? a : b
  })

  const escolhidos: TierEscolhido[] = [
    { tier: 'rapido', quote: maisRapido },
    { tier: 'barato', quote: maisBarato },
  ]

  // O custo-benefício sai do que sobrou. Calculado sobre todas as cotações ele
  // cairia quase sempre no mais barato ou no mais rápido, e o cliente veria
  // duas opções onde deveria ver três.
  const restantes = quotes.filter(
    (q) => q !== maisRapido && q !== maisBarato,
  )

  if (restantes.length > 0) {
    const faixa = {
      valorMin: Math.min(...quotes.map((q) => q.valor)),
      valorMax: Math.max(...quotes.map((q) => q.valor)),
      prazoMin: Math.min(...quotes.map((q) => q.prazoDias)),
      prazoMax: Math.max(...quotes.map((q) => q.prazoDias)),
    }
    const melhor = restantes.reduce((a, b) => {
      const na = nota(a, faixa)
      const nb = nota(b, faixa)
      if (na !== nb) return na < nb ? a : b
      return a.valor <= b.valor ? a : b
    })
    escolhidos.push({ tier: 'custo_beneficio', quote: melhor })
  }

  // Com uma cotação só, mais rápido e mais barato são o mesmo envio.
  const vistos = new Set<PrecoPrazoItem>()
  return escolhidos.filter(({ quote }) => {
    if (vistos.has(quote)) return false
    vistos.add(quote)
    return true
  })
}
