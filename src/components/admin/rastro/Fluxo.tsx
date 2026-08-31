'use client'

import { useState } from 'react'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import type { NumerosDoFluxo, Origem, Parado } from '@/lib/rastro/consultas'
import { Palco } from './Palco'

/**
 * Junta o palco com os dois cartões de baixo.
 *
 * Vive no cliente porque clicar num nó troca a fila — e a fila já veio
 * inteira do servidor, agrupada por etapa. Buscar de novo a cada clique
 * custaria uma ida ao banco para trocar uma lista de cinquenta linhas.
 */
export function Fluxo({
  numeros,
  origens,
  filas,
  nomes,
}: {
  numeros: NumerosDoFluxo
  origens: Origem[]
  filas: Record<string, Parado[]>
  nomes: Record<string, string | null>
}) {
  const [etapa, setEtapa] = useState<string | null>(null)
  const [nomeDaEtapa, setNomeDaEtapa] = useState('')

  const fila = etapa ? (filas[etapa] ?? []) : []
  const maiorOrigem = Math.max(...origens.map((o) => o.chegaram), 1)

  return (
    <>
      <Palco
        numeros={numeros}
        aoEscolher={(evento, nome) => {
          setEtapa(evento)
          setNomeDaEtapa(nome)
        }}
      />

      <div className="admin-grid-2" style={{ marginTop: 20 }}>
        <Card rotulo={etapa ? `Parou em: ${nomeDaEtapa}` : 'Precisa de contato'}>
          {!etapa ? (
            <p className="admin-vazio-texto">
              Clique numa etapa do fluxo para ver quem parou ali há mais de 24
              horas.
            </p>
          ) : fila.length === 0 ? (
            <p className="admin-vazio-texto">
              Ninguém parado nesta etapa há mais de 24 horas.
            </p>
          ) : (
            <div className="rastro-fila">
              {fila.map((p) => (
                <div key={p.anonimo_id} className="rastro-pessoa">
                  <div>
                    {p.pessoa_id ? (
                      <a
                        href={`/suplementos/admin/clientes/${p.pessoa_id}`}
                        className="admin-nome"
                      >
                        {nomes[p.pessoa_id] ?? 'Cliente'}
                      </a>
                    ) : (
                      <Selo tom="neutro">visitante sem conta</Selo>
                    )}
                    <p className="admin-sub">veio de {p.origem ?? 'direto'}</p>
                  </div>
                  <span className="admin-mono">
                    {p.horas_parado < 48
                      ? `${p.horas_parado} h`
                      : `${Math.floor(p.horas_parado / 24)} dias`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card rotulo="De onde vieram" verHref="/suplementos/admin/rastro/links" verTexto="Criar links">
          <p className="admin-sub" style={{ margin: '0 0 16px' }}>
            Primeira origem de cada pessoa, não a do último clique.
          </p>
          {origens.length === 0 ? (
            <p className="admin-vazio-texto">
              Nada registrado ainda. A origem entra quando o link tem{' '}
              <code className="admin-mono">?o=apelido</code> no fim.
            </p>
          ) : (
            <div className="rastro-origens">
              {origens.map((o) => (
                <div key={o.origem} className="rastro-origem">
                  <span className="rastro-origem-nome">{o.origem}</span>
                  <span className="rastro-origem-trilho">
                    <span
                      className="rastro-origem-barra"
                      style={{ width: `${Math.max((o.chegaram / maiorOrigem) * 100, 2)}%` }}
                    />
                  </span>
                  <span className="rastro-origem-num">
                    {o.chegaram}
                    {o.compraram > 0 && (
                      <span className="admin-sub"> · {o.compraram} compraram</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
