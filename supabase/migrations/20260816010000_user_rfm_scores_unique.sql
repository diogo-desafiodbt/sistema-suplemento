-- Faz o upsert de RFM parar de falhar.
--
-- `rfm-recalc.ts` grava com `{ onConflict: 'user_id' }`, mas user_rfm_scores só
-- tem chave primária em `id` — não há restrição única em `user_id`. O Postgres
-- recusa com 42P10, "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification", e o job falha para todo usuário.
--
-- Verificado nos dois caminhos, o SQL direto e o PostgREST, e a evidência está
-- na própria tabela: zero linhas. A rotina nunca gravou nada desde que existe,
-- e por isso a coluna de tier na tela de clientes sempre apareceu vazia.
--
-- O erro é engolido pelo try/catch por usuário dentro do job, que só faz
-- console.error e segue — por isso nunca virou alarme.
--
-- Um usuário tem um placar de RFM, então a unicidade é a intenção original.

CREATE UNIQUE INDEX IF NOT EXISTS user_rfm_scores_user_id_uidx
  ON public.user_rfm_scores (user_id);
