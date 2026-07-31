-- Split de origem Norte/Nordeste (filial Fortaleza) + log das chamadas
-- da API de integração com a farmácia (Miligrama).

-- Endereço da filial de Fortaleza (origem do frete para Norte/Nordeste)
INSERT INTO public.system_config (key, value, description) VALUES
  ('shipping_sender_fortaleza_nome', 'Miligrama', 'Nome do remetente — filial Fortaleza'),
  ('shipping_sender_fortaleza_cep', '60150161', 'CEP do remetente — filial Fortaleza'),
  ('shipping_sender_fortaleza_logradouro', 'Av. Santos Dumont', 'Logradouro do remetente — filial Fortaleza'),
  ('shipping_sender_fortaleza_numero', '2284', 'Número do remetente — filial Fortaleza'),
  ('shipping_sender_fortaleza_complemento', '1º andar', 'Complemento do remetente — filial Fortaleza'),
  ('shipping_sender_fortaleza_bairro', 'Aldeota', 'Bairro do remetente — filial Fortaleza'),
  ('shipping_sender_fortaleza_cidade', 'Fortaleza', 'Cidade do remetente — filial Fortaleza'),
  ('shipping_sender_fortaleza_uf', 'CE', 'UF do remetente — filial Fortaleza')
ON CONFLICT (key) DO NOTHING;

-- Log de cada chamada da Miligrama aos endpoints de pull
-- (usado na reconciliação diária)
CREATE TABLE public.pharmacy_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  query_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_ids_returned jsonb NOT NULL DEFAULT '[]'::jsonb,
  called_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pharmacy_api_logs TO service_role;
