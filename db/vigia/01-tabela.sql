-- Tabela de estado do vigia.
--
-- Sem estado, os 9 alertas achados em 19/08 disparariam a cada execução, para
-- sempre. Alarme que repete vira alarme ignorado — foi o que aconteceu com as
-- 643 falhas do IMAP, que ninguem viu justamente por serem muitas.
--
-- Com estado: notifica so o que apareceu agora, e fecha sozinho quando a
-- condicao some. Problema que persiste continua registrado, mas nao grita.

CREATE TABLE IF NOT EXISTS public.alertas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- impressao digital: tipo + a chave do que esta errado (id do pagamento,
  -- nome do job, e-mail do cliente). E o que define "mesmo problema".
  digital       text        NOT NULL,
  tipo          text        NOT NULL,
  detalhe       jsonb       NOT NULL,
  visto_em      timestamptz NOT NULL DEFAULT now(),
  ultima_vez_em timestamptz NOT NULL DEFAULT now(),
  notificado_em timestamptz,
  resolvido_em  timestamptz
);

-- Um alerta ABERTO por impressao digital. Resolvidos podem repetir: se o
-- problema voltar, e um alerta novo e deve notificar de novo.
CREATE UNIQUE INDEX IF NOT EXISTS alertas_digital_aberto_uidx
  ON public.alertas (digital) WHERE resolvido_em IS NULL;

CREATE INDEX IF NOT EXISTS alertas_abertos_idx
  ON public.alertas (tipo, visto_em) WHERE resolvido_em IS NULL;

-- O vigia roda como postgres (tarefa db-admin), fora do alcance do app.
-- app_web nao precisa de nada aqui: a tela do admin le, no maximo.
GRANT SELECT ON public.alertas TO app_web;
