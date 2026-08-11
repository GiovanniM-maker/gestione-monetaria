-- 0002_backfill_app_users.sql
--
-- Il trigger `on_auth_user_created` della migration 0001 popola `app_users`
-- solo all'INSERIMENTO in `auth.users`. Un utente creato prima che la migration
-- fosse applicata non ha mai fatto scattare il trigger, quindi non ha identita'
-- applicativa: `public.is_app_user()` risponderebbe false e ogni policy RLS
-- futura gli negherebbe l'accesso ai dati.
--
-- Questa migration recupera quel caso, ed e' idempotente: rieseguirla non
-- produce righe doppie ne' errori.
--
-- Il vincolo di allowlist resta identico a quello del trigger: entra solo chi
-- e' in `allowed_emails`. Non e' una scorciatoia per aggiungere utenti a mano.

insert into public.app_users (user_id, email)
select u.id, lower(u.email)
from auth.users u
join public.allowed_emails a
  on a.email = lower(u.email)
where u.email is not null
on conflict (user_id) do nothing;
