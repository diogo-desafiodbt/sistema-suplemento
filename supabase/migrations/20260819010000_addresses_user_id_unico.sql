-- O checkout faz upsert de endereço por user_id, mas a unicidade nunca existiu:
-- ON CONFLICT (user_id) falhava com 42P10 e a tabela ficou vazia desde sempre.
-- Decisão do Diogo em 19/08/2026: um endereço por cliente. A cada compra, o
-- endereço é sobrescrito.
CREATE UNIQUE INDEX IF NOT EXISTS addresses_user_id_uidx
  ON public.addresses (user_id);
