-- Papel do núcleo para disparar e-mail de marketing.
--
-- Por que o núcleo envia e não o satélite: a Lambda `satelite-comercial` roda
-- na VPC sem saída para a internet — subnet com rota para Internet Gateway,
-- mas Lambda em VPC não recebe IP público, e não há NAT. Ela nunca alcançou a
-- API da Resend, e por isso "Enviar teste" e "Criar na Resend" nunca
-- funcionaram.
--
-- O núcleo tem saída e já fala com a Resend. O formulário do satélite passa a
-- apontar para uma rota de ação do núcleo, chamada pelo navegador de quem está
-- logado — a Lambda continua sem rota de rede para o núcleo.
--
-- Este papel existe para que essa rota NÃO rode com `app_web`. O alcance é o
-- mínimo do envio: ler o que vai no e-mail e registrar que saiu. Nada de
-- `public`, então prontuário, pedido e pagamento não existem para ele.

CREATE ROLE app_marketing_envio LOGIN;
GRANT rds_iam TO app_marketing_envio;

GRANT USAGE ON SCHEMA marketing TO app_marketing_envio;

-- Só o que compõe a mensagem. Sem `filtro`, sem `blocos`: o HTML já vem pronto.
GRANT SELECT (id, nome, assunto, html, situacao, resend_audience_id, resend_broadcast_id)
  ON marketing.campanha TO app_marketing_envio;

-- O registro do que saiu. Sem UPDATE nem DELETE: log não se reescreve.
GRANT SELECT, INSERT ON marketing.campanha_teste TO app_marketing_envio;
GRANT USAGE, SELECT ON SEQUENCE marketing.campanha_teste_id_seq TO app_marketing_envio;

-- Publicar altera a campanha; o núcleo precisa marcar o que criou na Resend.
GRANT UPDATE (situacao, resend_audience_id, resend_broadcast_id, publicada_em)
  ON marketing.campanha TO app_marketing_envio;

-- O público do disparo, para criar os contatos na audiência.
GRANT EXECUTE ON FUNCTION marketing.publico_da_campanha(text[], timestamptz, integer)
  TO app_marketing_envio;
GRANT SELECT, INSERT, DELETE ON marketing.campanha_publico TO app_marketing_envio;

-- Sem isto o papel nem abre conexão: `USAGE` no schema não dá `CONNECT` no
-- banco. Faltou em 30/08 e a tela do disparo deu branco, com
-- `permission denied for database "clinico"` no log — invisível para quem
-- estava usando.
GRANT CONNECT ON DATABASE clinico TO app_marketing_envio;
