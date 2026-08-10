-- 0001_foundations.sql
--
-- Fondamenta di sicurezza del database. Stabilisce la convenzione che ogni
-- migration successiva deve rispettare:
--
--   1. nessun privilegio implicito per `anon` e `authenticated`: i GRANT si
--      scrivono a mano, tabella per tabella;
--   2. ogni tabella nasce con RLS ABILITATA e almeno una policy esplicita;
--   3. l'autorizzazione applicativa passa da `public.app_users`, non da un
--      confronto di email sparso nelle policy.
--
-- Una migration gia' applicata non si modifica mai: per correggere, se ne
-- scrive una nuova.

-- ---------------------------------------------------------------------------
-- 1. Chiusura dei privilegi di default sullo schema public
-- ---------------------------------------------------------------------------
-- Supabase, di serie, concede ALL sulle tabelle nuove ai ruoli `anon` e
-- `authenticated` tramite default privileges del ruolo `postgres`. Con quella
-- impostazione attiva, dimenticare una `enable row level security` su una
-- tabella futura significa esporre l'intera tabella. Qui la si revoca, cosi'
-- l'errore per omissione diventa "non riesco a leggere" invece di "ho appena
-- pubblicato i miei estratti conto".

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Stesso trattamento per gli oggetti creati dal ruolo che esegue le migration,
-- qualora non sia `postgres`.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Oggetti gia' esistenti.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- I due ruoli devono poter *attraversare* lo schema, non crearci dentro.
grant usage on schema public to anon, authenticated;
revoke create on schema public from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 2. allowed_emails — chi puo' diventare utente dell'app
-- ---------------------------------------------------------------------------
-- Tabella di sola configurazione. Nessun ruolo client la vede: non riceve
-- GRANT e ha RLS attiva senza policy, quindi e' raggiungibile solo da
-- `service_role` e dal proprietario del database.

create table public.allowed_emails (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now(),
  constraint allowed_emails_email_lowercase check (email = lower(email))
);

comment on table public.allowed_emails is
  'Allowlist di iscrizione. Non accessibile ai ruoli client. Strato 3 del controllo accessi.';

alter table public.allowed_emails enable row level security;
alter table public.allowed_emails force row level security;

insert into public.allowed_emails (email, note)
values ('giovanni.mavilla.grz@gmail.com', 'Unico utente autorizzato dell''applicazione');

-- ---------------------------------------------------------------------------
-- 3. app_users — identita' applicativa a cui si aggancia ogni policy futura
-- ---------------------------------------------------------------------------

create table public.app_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  created_at timestamptz not null default now(),
  constraint app_users_email_lowercase check (email = lower(email))
);

comment on table public.app_users is
  'Utenti applicativi effettivi. Popolata dal trigger su auth.users solo per le email in allowed_emails.';

alter table public.app_users enable row level security;
alter table public.app_users force row level security;

-- L'utente puo' leggere la propria riga e nient'altro. Nessuna policy di
-- insert/update/delete: la tabella la scrive solo il trigger.
create policy app_users_select_self
  on public.app_users
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on public.app_users to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Popolamento automatico di app_users
-- ---------------------------------------------------------------------------
-- Il signup pubblico e' disabilitato e l'app chiama `signInWithOtp` con
-- `shouldCreateUser: false`, quindi in pratica l'utente viene creato a mano dal
-- pannello Supabase. Questo trigger evita il passo manuale successivo e, cosa
-- piu' importante, garantisce che un utente creato per sbaglio con un'email
-- diversa NON ottenga un'identita' applicativa.

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null
     and exists (
       select 1 from public.allowed_emails a where a.email = lower(new.email)
     )
  then
    insert into public.app_users (user_id, email)
    values (new.id, lower(new.email))
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Crea la riga app_users se e solo se l''email del nuovo utente auth e'' in allowed_emails.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 5. is_app_user() — predicato standard per tutte le policy future
-- ---------------------------------------------------------------------------
-- Da usare cosi' nelle migration successive:
--
--   create policy <nome> on public.<tabella>
--     for all to authenticated
--     using (public.is_app_user()) with check (public.is_app_user());
--
-- `security definer` perche' deve poter leggere app_users indipendentemente
-- dalle policy del chiamante; `stable` perche' il risultato non cambia dentro
-- la stessa istruzione, cosi' il pianificatore la valuta una volta sola.

create function public.is_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users u where u.user_id = (select auth.uid())
  );
$$;

comment on function public.is_app_user() is
  'True se l''utente autenticato corrente e'' un utente applicativo. Predicato base di ogni policy RLS.';

revoke all on function public.is_app_user() from public;
grant execute on function public.is_app_user() to authenticated;
