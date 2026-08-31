-- As duas escritas do Rastro, como função.
--
-- Quem atende o clique e o login é o `sistema-entrada`, que roda como
-- `app_entrada` — o serviço mais exposto que existe aqui, o que fica na
-- frente do visitante anônimo. Dar a ele INSERT e UPDATE direto nas tabelas
-- do Rastro resolveria, e foi o que a primeira versão fez: quebrou em
-- produção com "permission denied", que é o banco dizendo a coisa certa.
--
-- A correção não é afrouxar o grant. É trocar o que ele pode fazer pelo que
-- ele precisa fazer. Com EXECUTE nestas duas funções, o `app_entrada`
-- consegue gravar um passo e costurar um login, e continua sem conseguir ler
-- a jornada de ninguém — que é leitura de admin, não de porta de entrada.
--
-- Mesmo padrão de `assinar_protocolo`: SECURITY DEFINER, search_path fixo,
-- corpo estreito.

BEGIN;

CREATE OR REPLACE FUNCTION public.rastro_registrar(
  p_anonimo text,
  p_evento  text,
  p_origem  text  DEFAULT NULL,
  p_pessoa  uuid  DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_anonimo IS NULL OR p_anonimo = '' OR p_evento IS NULL OR p_evento = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.rastro_eventos (anonimo_id, pessoa_id, evento, origem)
  VALUES (p_anonimo, p_pessoa, p_evento, NULLIF(p_origem, ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.rastro_costurar(
  p_anonimo text,
  p_pessoa  uuid
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_anonimo IS NULL OR p_anonimo = '' OR p_pessoa IS NULL THEN
    RETURN;
  END IF;

  -- Mantém a primeira ligação. Se o mesmo navegador entrar depois com outra
  -- conta — o marido no celular da esposa — reescrever apagaria a atribuição
  -- da jornada inteira que levou à primeira compra.
  INSERT INTO public.rastro_ligacoes (anonimo_id, pessoa_id)
  VALUES (p_anonimo, p_pessoa)
  ON CONFLICT (anonimo_id) DO NOTHING;

  -- Os eventos anteriores ao login ficaram sem dono. Agora têm um. Só os sem
  -- dono: evento já atribuído não muda de pessoa.
  UPDATE public.rastro_eventos
  SET pessoa_id = p_pessoa
  WHERE anonimo_id = p_anonimo AND pessoa_id IS NULL;
END;
$$;

-- Ninguém executa por padrão; só quem for nomeado abaixo.
REVOKE ALL ON FUNCTION public.rastro_registrar(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rastro_costurar(text, uuid)              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rastro_registrar(text, text, text, uuid) TO app_entrada, app_web;
GRANT EXECUTE ON FUNCTION public.rastro_costurar(text, uuid)              TO app_entrada, app_web;

-- O `app_web` desenha o fluxo e a fila no admin: ele lê. O `app_entrada` não
-- lê nada — e a escrita direta sai dele por não ter sido dada.
--
-- Do `app_web` sai a escrita direta que a versão anterior tinha dado: agora
-- ela passa pela função, e o caminho de gravar vira um só.
REVOKE INSERT, UPDATE, DELETE ON public.rastro_eventos  FROM app_web;
REVOKE INSERT, UPDATE, DELETE ON public.rastro_ligacoes FROM app_web;
REVOKE UPDATE (pessoa_id)      ON public.rastro_eventos FROM app_web;

GRANT SELECT ON public.rastro_eventos  TO app_web;
GRANT SELECT ON public.rastro_ligacoes TO app_web;

COMMIT;
