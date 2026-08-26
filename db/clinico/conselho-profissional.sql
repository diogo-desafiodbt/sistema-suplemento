\set ON_ERROR_STOP on
\pset pager off

-- Qual conselho registra o profissional.
--
-- A coluna do número sempre se chamou `crm`, e o PDF da prescrição imprimia
-- "CRM" fixo antes dela. Isso funcionava enquanto o único profissional era um
-- registro de teste com CRM inventado.
--
-- O Dr. Turí Souza é NUTRICIONISTA, com CRN. Um documento assinado dizendo que
-- ele tem CRM apresenta um nutricionista como médico — e prescrição assinada é
-- documento. O rótulo passa a vir do dado, não do código.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS conselho text NOT NULL DEFAULT 'CRM'
  CHECK (conselho IN ('CRM', 'CRN', 'CREF'));

\echo '=== registros e seus conselhos ==='
SELECT u.email, p.conselho, p.crm AS numero, p.specialty, p.is_active
  FROM professionals p JOIN users u ON u.id = p.user_id ORDER BY u.email;
