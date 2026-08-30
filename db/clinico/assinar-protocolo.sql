-- Assinatura de prescrição vira uma porta só.
--
-- Antes: `app_web` e `job_interno` tinham UPDATE em `protocols`, então o mesmo
-- processo que serve o admin e as rotas do público podia marcar qualquer
-- prescrição como assinada por qualquer profissional. O documento pede que só
-- o retorno do Enclave A faça isso; enquanto o enclave não existe, esta função
-- é a porta estreita equivalente.
--
-- A função grava a assinatura E o log de auditoria numa transação só. Não dá
-- para assinar sem deixar rastro, porque não existe caminho que faça uma coisa
-- sem a outra.

CREATE OR REPLACE FUNCTION public.assinar_protocolo(
  p_protocolo   UUID,
  p_profissional UUID,
  p_assinado_em TIMESTAMPTZ,
  p_arquivo     TEXT,
  p_hash        TEXT,
  p_ip          TEXT,
  p_agente      TEXT,
  p_snapshot    JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_situacao TEXT;
BEGIN
  -- Assinar duas vezes o mesmo protocolo não é erro de digitação: é sinal de
  -- que algo está reenviando. Recusa em vez de sobrescrever.
  SELECT status INTO v_situacao FROM protocols WHERE id = p_protocolo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'protocolo % não existe', p_protocolo;
  END IF;
  IF v_situacao = 'signed' THEN
    RAISE EXCEPTION 'protocolo % já está assinado', p_protocolo;
  END IF;

  UPDATE protocols
     SET status = 'signed',
         signed_at = p_assinado_em,
         signed_by = p_profissional,
         prescription_pdf_path = p_arquivo
   WHERE id = p_protocolo;

  INSERT INTO prescription_audit_logs (
    protocol_id, professional_id, action, signed_at,
    ip_address, user_agent, pdf_url, pdf_hash, payload_snapshot
  ) VALUES (
    p_protocolo, p_profissional, 'signed', p_assinado_em,
    p_ip, p_agente, NULL, p_hash, p_snapshot
  );
END;
$$;

ALTER FUNCTION public.assinar_protocolo(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, JSONB)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assinar_protocolo(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assinar_protocolo(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO app_web;

-- A porta estreita só vale se a larga fechar. `app_web` perde a escrita direta
-- em `protocols`; `job_interno` mantém, porque é ele quem CRIA o protocolo no
-- fluxo de pagamento confirmado — mas não assina, e a coluna `status` sai.
REVOKE UPDATE ON public.protocols FROM app_web;
REVOKE UPDATE (status) ON public.protocols FROM job_interno;

-- `job_interno` tinha UPDATE na tabela inteira, e revogar por coluna não
-- remove grant de tabela. Conferido no código: só existem dois lugares que
-- escrevem em `protocols` — a assinatura, que agora passa pela função, e a
-- criação no checkout, que é INSERT. Nenhum job faz UPDATE.
REVOKE UPDATE ON public.protocols FROM job_interno;
