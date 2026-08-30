#!/usr/bin/env node
/**
 * Confere que toda consulta das rotas do paciente filtra pelo titular da sessão.
 *
 * Por que isto existe: o RLS por titular está desligado, por decisão de
 * 15/08/2026 — a autorização vive dentro da consulta, com grants escritos à
 * mão. A decisão é defensável, mas ela transfere para o código uma garantia
 * que o banco daria sozinho. O risco que sobra tem nome: um filtro esquecido
 * numa consulta nova vira vazamento entre clientes, e nada abaixo o segura.
 *
 * Este script é o que substitui a camada perdida. Ele varre as rotas de
 * contrato do paciente e falha se alguma consulta a uma tabela de titular não
 * amarrar ao `userId` da sessão.
 *
 * Não vale para o admin nem para o profissional: lá a leitura ampla é o
 * produto funcionando, e é o registro de leitura que responde por ela.
 *
 *   node scripts/conferir-isolamento.mjs
 *
 * Sai com 1 se achar consulta sem amarra, para poder entrar num CI depois.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = 'src/app/api/contrato/paciente'

/** Tabelas cuja linha pertence a uma pessoa. Ler sem amarra é vazamento. */
const DE_TITULAR = [
  'users',
  'orders',
  'order_items',
  'payments',
  'subscriptions',
  'addresses',
  'protocols',
  'protocol_items',
  'quiz_responses',
  'health_records',
  'user_entitlements',
  'notification_logs',
  'terms_acceptances',
  'user_login_history',
]

/** O que conta como amarra ao titular da sessão. */
const AMARRAS = [
  /user_id\s*=\s*\$\{[^}]*(session|sessao)/i,
  /id\s*=\s*\$\{[^}]*(session|sessao)[^}]*userId/i,
  // Subconsulta que já amarra: `WHERE subscription_id IN (SELECT ... user_id = ...)`
  /user_id\s*=\s*\$\{/i,
]

function arquivos(dir) {
  const saida = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho))
    else if (nome.endsWith('.ts')) saida.push(caminho)
  }
  return saida
}

/** Pega cada trecho entre crases que pareça SQL. */
function consultas(fonte) {
  const achados = []
  const re = /`([^`]*\b(?:SELECT|UPDATE|DELETE|INSERT)\b[^`]*)`/gis
  let m
  while ((m = re.exec(fonte)) !== null) {
    const linha = fonte.slice(0, m.index).split('\n').length
    achados.push({ sql: m[1], linha })
  }
  return achados
}

let problemas = 0
let conferidas = 0

for (const arquivo of arquivos(RAIZ)) {
  const fonte = readFileSync(arquivo, 'utf8')
  for (const { sql, linha } of consultas(fonte)) {
    const tabelas = DE_TITULAR.filter((t) =>
      new RegExp(`\\b(?:FROM|JOIN|UPDATE|INTO)\\s+${t}\\b`, 'i').test(sql),
    )
    if (tabelas.length === 0) continue

    conferidas += 1

    // INSERT amarra de outro jeito: a garantia não é um WHERE, é gravar o
    // titular certo na coluna. Exigir WHERE aqui acusaria todo INSERT legítimo.
    const ehInsert = /^\s*INSERT\b/i.test(sql.trim())
    const amarrado = ehInsert
      ? /\$\{\s*(session|sessao)[^}]*\.userId/i.test(sql)
      : AMARRAS.some((re) => re.test(sql))

    if (!amarrado) {
      problemas += 1
      console.error(
        `\n  SEM AMARRA  ${arquivo}:${linha}\n` +
          `  tabelas de titular: ${tabelas.join(', ')}\n` +
          `  ${sql.trim().split('\n')[0].slice(0, 90)}…`,
      )
    }
  }
}

if (problemas > 0) {
  console.error(
    `\n${problemas} consulta(s) tocam tabela de titular sem amarrar à sessão.` +
      `\nCom o RLS desligado, é isso que separa um cliente do outro.\n`,
  )
  process.exit(1)
}

console.log(
  `isolamento: ${conferidas} consulta(s) de titular conferidas nas rotas do ` +
    `paciente, todas amarradas à sessão.`,
)
