-- Breadcrumb do protocolo em criação nesta subscription (crash recovery sem órfão cross-user).
-- UPDATE necessário pra gravar protocol_id depois do insert da claim.

ALTER TABLE public.protocol_creation_locks
  ADD COLUMN protocol_id uuid REFERENCES public.protocols(id);

GRANT UPDATE ON public.protocol_creation_locks TO service_role;
