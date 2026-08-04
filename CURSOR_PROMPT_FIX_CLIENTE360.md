# Prompt para o Cursor — Corrigir erro 400 no Cliente 360 + campo de data de nascimento no quiz

Duas correções independentes de UI/dados nesta leva.

============================================================
PARTE 1 — Erro 400 no Cliente 360
============================================================

Em `src/app/(admin)/admin/clientes/[id]/page.tsx` (linhas ~264 e ~266), duas
consultas usam `.order('created_at', ...)` em tabelas que não têm essa
coluna, quebrando com erro 400 toda vez que a página é aberta (confirmado
nos logs do Supabase — acontece pra qualquer cliente):

```ts
admin.from('quiz_responses').select('*').eq('user_id', id).order('created_at', { ascending: false }),
// ...
admin.from('notification_logs').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
```

Trocar por:
- `quiz_responses` tem `completed_at`, não `created_at`.
- `notification_logs` tem `sent_at`, não `created_at`.

```ts
admin.from('quiz_responses').select('*').eq('user_id', id).order('completed_at', { ascending: false }),
// ...
admin.from('notification_logs').select('*').eq('user_id', id).order('sent_at', { ascending: false }).limit(20),
```

============================================================
PARTE 2 — Campo de data de nascimento do quiz só aceita 1 dígito no ano
============================================================

Em `src/app/(public)/quiz/page.tsx`, o step `'nascimento'` (~linha 580) usa
um `<input type="date">` nativo do navegador. Em vários navegadores/celulares
esse componente nativo tem um bug conhecido de UX: o segmento de ano só
aceita digitar um número por vez em vez dos 4 dígitos seguidos, forçando o
uso das setinhas do campo (dezenas de cliques pra voltar até, por exemplo,
1980) — é a causa do problema relatado pelo Diogo.

Substituir o `<input type="date">` por três `<select>` separados (dia, mês,
ano), que não têm essa limitação em nenhum navegador. Mesmo bloco de código
atual:

```tsx
case 'nascimento':
  return (
    <QuestionWrapper
      category="DADOS BÁSICOS"
      title="Qual é a sua data de nascimento?"
      showContinue
      continueDisabled={!form.birth_date}
    >
      <input
        type="date"
        value={form.birth_date}
        onChange={e => setForm(prev => ({ ...prev, birth_date: e.target.value }))}
        max={new Date().toISOString().slice(0, 10)}
        className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]"
      />
    </QuestionWrapper>
  )
```

Substituir por três selects lado a lado (dia / mês / ano), mantendo o
mesmo `form.birth_date` como string ISO `YYYY-MM-DD` (formato usado em
todo o resto do sistema — `triage.ts`, `checkout/create/route.ts`, etc. —
não mudar o formato armazenado, só a forma de preencher):

```tsx
case 'nascimento': {
  const [selYear, selMonth, selDay] = form.birth_date
    ? form.birth_date.split('-')
    : ['', '', '']

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 100 }, (_, i) => String(currentYear - i))
  const months = [
    { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
  ]
  const daysInMonth =
    selYear && selMonth
      ? new Date(Number(selYear), Number(selMonth), 0).getDate()
      : 31
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    String(i + 1).padStart(2, '0')
  )

  function updateBirthDate(part: 'day' | 'month' | 'year', value: string) {
    const next = {
      day: part === 'day' ? value : selDay,
      month: part === 'month' ? value : selMonth,
      year: part === 'year' ? value : selYear,
    }
    if (next.day && next.month && next.year) {
      setForm(prev => ({
        ...prev,
        birth_date: `${next.year}-${next.month}-${next.day}`,
      }))
    } else {
      setForm(prev => ({ ...prev, birth_date: '' }))
    }
  }

  const selectClass =
    'w-full border border-gray-200 rounded-xl px-3 py-3.5 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]'

  return (
    <QuestionWrapper
      category="DADOS BÁSICOS"
      title="Qual é a sua data de nascimento?"
      showContinue
      continueDisabled={!form.birth_date}
    >
      <div className="grid grid-cols-3 gap-2">
        <select
          value={selDay}
          onChange={e => updateBirthDate('day', e.target.value)}
          className={selectClass}
        >
          <option value="">Dia</option>
          {days.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={selMonth}
          onChange={e => updateBirthDate('month', e.target.value)}
          className={selectClass}
        >
          <option value="">Mês</option>
          {months.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={selYear}
          onChange={e => updateBirthDate('year', e.target.value)}
          className={selectClass}
        >
          <option value="">Ano</option>
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
    </QuestionWrapper>
  )
}
```

Notas:
- Se o dia selecionado ficar inválido depois de trocar o mês/ano (ex.: dia
  31 com mês que só tem 30), o `daysInMonth` recalcula e a lista de dias
  encolhe — o valor antigo do select de dia fica "solto" visualmente até o
  usuário escolher de novo; comportamento aceitável, não precisa de lógica
  extra pra resetar automaticamente.
- Ordem de dia/mês/ano na tela é livre (critério do Cursor, seguir o padrão
  brasileiro DD/MM/AAAA como no exemplo acima).
- Não mexer em mais nada do fluxo do quiz — só esse case.

============================================================
NOTAS GERAIS
============================================================

Rodar `npm run build`/typecheck no final. Nenhuma migration nova — a
otimização de performance do banco (RLS + índices) já foi aplicada
diretamente no Supabase, fora deste prompt.
