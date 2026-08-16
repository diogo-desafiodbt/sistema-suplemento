-- Torna explícito o que o código já assume: um usuário tem no máximo um
-- direito por produto.
--
-- Dois lugares gravam em user_entitlements — o webhook da Pagar.me e a criação
-- do checkout — e os dois fazem "procura, se achou atualiza, senão insere".
-- Entre a procura e a inserção não há nada segurando: dois eventos do mesmo
-- pagamento chegando juntos criam duas linhas para o mesmo par.
--
-- E quem lê usa maybeSingle(), que trata duas linhas como erro. Ou seja: a
-- duplicata não apenas polui a tabela, ela quebra a leitura seguinte. O código
-- já dependia desta unicidade sem nunca tê-la pedido ao banco.
--
-- Com o índice, os dois lugares passam a poder usar
-- INSERT ... ON CONFLICT (user_id, product_key) DO UPDATE, que é atômico e
-- dispensa a leitura anterior.
--
-- Verificado antes de aplicar: nenhum par duplicado na base.

CREATE UNIQUE INDEX IF NOT EXISTS user_entitlements_user_product_uidx
  ON public.user_entitlements (user_id, product_key);
