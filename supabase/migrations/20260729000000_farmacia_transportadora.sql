-- Integração farmácia + Envie Agora: box_type, códigos provisórios,
-- Polivitamínico, colunas de frete em orders, configs de remetente/caixas.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS box_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS activation_rules jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_request_id text,
  ADD COLUMN IF NOT EXISTS shipping_service_code text,
  ADD COLUMN IF NOT EXISTS shipping_quote_json jsonb,
  ADD COLUMN IF NOT EXISTS shipping_json jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS orders_shipping_request_id_uidx
  ON public.orders (shipping_request_id)
  WHERE shipping_request_id IS NOT NULL;

-- Polivitamínico (só se ainda não existir)
INSERT INTO public.products (
  name,
  pharmacy_sku_monthly,
  pharmacy_sku_quarterly,
  pharmacy_sku_yearly,
  price_monthly,
  price_quarterly,
  price_yearly,
  is_fixed,
  is_active,
  box_type,
  description,
  activation_rules,
  pharmacy_code
)
SELECT
  'Polivitamínico',
  'DD-POLI-STD-0X30',
  'DD-POLI-STD-0X90',
  'DD-POLI-STD-0X360',
  29.90,
  76.25,
  251.16,
  false,
  true,
  'R80',
  'Fórmula polivitamínica para suporte nutricional geral.', -- PLACEHOLDER
  '{}'::jsonb, -- PLACEHOLDER: sem regra automática de quiz ainda
  2004
WHERE NOT EXISTS (
  SELECT 1 FROM public.products WHERE name = 'Polivitamínico'
);

-- pharmacy_code provisório (catálogo Miligrama ainda pendente)
UPDATE public.products SET pharmacy_code = 2000 WHERE name = 'Berberina';
UPDATE public.products SET pharmacy_code = 2001 WHERE name = 'Berberina Homeopata';
UPDATE public.products SET pharmacy_code = 2002 WHERE name = 'Neuropatia';
UPDATE public.products SET pharmacy_code = 2003 WHERE name = 'Ômega 3';
UPDATE public.products SET pharmacy_code = 2004 WHERE name = 'Polivitamínico';
UPDATE public.products SET pharmacy_code = 2005 WHERE name = 'Resistência à Insulina';
UPDATE public.products SET pharmacy_code = 2006 WHERE name = 'Vitamina B12';

-- box_type seed
UPDATE public.products SET box_type = 'R80'
WHERE name IN ('Berberina', 'Neuropatia', 'Ômega 3', 'Polivitamínico');

UPDATE public.products SET box_type = 'R110'
WHERE name = 'Resistência à Insulina';

-- Remetente + dimensões das caixas
INSERT INTO public.system_config (key, value, description) VALUES
  ('shipping_sender_nome', 'Miligrama Farmácia de Manipulação', 'Nome do remetente nas etiquetas (CONFIRMAR nome legal exato)'),
  ('shipping_sender_cep', '80220030', 'CEP do remetente (farmácia)'),
  ('shipping_sender_logradouro', 'R. Des. Westphalen', 'Logradouro do remetente'),
  ('shipping_sender_numero', '2201', 'Número do remetente'),
  ('shipping_sender_complemento', '', 'Complemento do remetente'),
  ('shipping_sender_bairro', 'Rebouças', 'Bairro do remetente'),
  ('shipping_sender_cidade', 'Curitiba', 'Cidade do remetente'),
  ('shipping_sender_uf', 'PR', 'UF do remetente'),
  ('shipping_box_r80_altura', '8', 'Caixa R80 — altura (cm)'),
  ('shipping_box_r80_largura', '18', 'Caixa R80 — largura (cm)'),
  ('shipping_box_r80_comprimento', '14.5', 'Caixa R80 — comprimento (cm)'),
  ('shipping_box_r80_peso', '0.2', 'Caixa R80 — peso (kg)'),
  ('shipping_box_r110_altura', '7.2', 'Caixa R110 — altura (cm)'),
  ('shipping_box_r110_largura', '22.5', 'Caixa R110 — largura (cm)'),
  ('shipping_box_r110_comprimento', '14.5', 'Caixa R110 — comprimento (cm)'),
  ('shipping_box_r110_peso', '0.4', 'Caixa R110 — peso (kg)')
ON CONFLICT (key) DO NOTHING;
