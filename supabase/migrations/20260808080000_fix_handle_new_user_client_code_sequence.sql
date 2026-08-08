-- handle_new_user gerava client_code via COUNT(*)+1, o que colide sempre que
-- linhas de public.users são deletadas (ou sob concorrência), travando todo
-- signup subsequente com "duplicate key value violates unique constraint
-- users_client_code_key". Troca por sequence dedicada (atômica, sem gaps
-- retroativos), seedada acima do maior client_code já emitido.
create sequence if not exists public.client_code_seq;
select setval('public.client_code_seq', 14, true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_client_code text;
begin
  new_client_code := 'DD-' || lpad(nextval('public.client_code_seq')::text, 6, '0');

  insert into public.users (
    id,
    email,
    full_name,
    role,
    client_code,
    created_at,
    updated_at
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'patient',
    new_client_code,
    now(),
    now()
  );

  return new;
end;
$function$;
