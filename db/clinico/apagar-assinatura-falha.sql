-- Apagar assinatura que não vingou, sem dar DELETE ao serviço de entrada.
--
-- O checkout precisa limpar a tentativa que falhou: assinatura criada, cobrança
-- recusada, e a linha ficando no caminho da próxima tentativa da mesma pessoa.
-- Sem isto, quem tem uma recusa no histórico não consegue comprar de novo —
-- foi o "erro interno" de 01/09/2026.
--
-- O caminho óbvio seria `GRANT DELETE ON payments, subscriptions TO
-- app_entrada`. Não vale a pena: `app_entrada` é o serviço mais exposto que
-- existe aqui, o que atende visitante anônimo, e um serviço que pode apagar
-- linha de pagamento é um serviço que pode apagar o registro de uma cobrança.
--
-- Com EXECUTE nesta função ele apaga exatamente o que precisa, e a própria
-- função recusa o que não pode: assinatura ativa, ou com qualquer pagamento
-- pago, não some. Se um dia o código chamar isto com o id errado, o banco
-- responde não.

BEGIN;

CREATE OR REPLACE FUNCTION public.apagar_assinatura_sem_pagamento(
  p_assinatura uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_pagas  int;
BEGIN
  IF p_assinatura IS NULL THEN
    RETURN false;
  END IF;

  SELECT status INTO v_status
  FROM public.subscriptions
  WHERE id = p_assinatura
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_status = 'active' THEN
    RAISE EXCEPTION 'Assinatura % está ativa e não pode ser apagada', p_assinatura;
  END IF;

  SELECT COUNT(*) INTO v_pagas
  FROM public.payments
  WHERE subscription_id = p_assinatura AND status = 'paid';

  IF v_pagas > 0 THEN
    RAISE EXCEPTION 'Assinatura % tem % pagamento(s) pago(s)', p_assinatura, v_pagas;
  END IF;

  UPDATE public.terms_acceptances
  SET subscription_id = NULL
  WHERE subscription_id = p_assinatura;

  DELETE FROM public.payments WHERE subscription_id = p_assinatura;
  DELETE FROM public.subscriptions WHERE id = p_assinatura;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apagar_assinatura_sem_pagamento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apagar_assinatura_sem_pagamento(uuid)
  TO app_entrada, app_web;

COMMIT;
