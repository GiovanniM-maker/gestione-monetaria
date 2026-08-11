-- 0003_ingestion.sql
--
-- Tabelle di ingestion della Fase 2: connessioni, conti, payload grezzi e
-- registro delle sincronizzazioni. Lo schema e' quello fissato in CLAUDE.md.
--
-- Solo lo schema: la logica di sync, la paginazione e il backfill riavviabile
-- restano fuori, perche' dipendono da come si comporta davvero il connettore
-- Revolut, che sapremo dopo la verifica della Fase 1.
--
-- Convenzione della 0001, rispettata riga per riga: RLS abilitata e forzata su
-- ogni tabella, almeno una policy esplicita, GRANT scritti a mano.

-- ---------------------------------------------------------------------------
-- Funzione di supporto: updated_at sempre coerente
-- ---------------------------------------------------------------------------
-- Aggiornare updated_at dal codice applicativo significa dimenticarselo prima o
-- poi, e in una tabella che guida gli alert di scadenza del consenso un
-- timestamp stantio e' peggio di nessun timestamp.

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- bank_connections
-- ---------------------------------------------------------------------------

create table public.bank_connections (
  id             uuid primary key default gen_random_uuid(),
  aspsp_name     text not null,
  aspsp_country  char(2) not null,
  eb_session_id  text,
  status         text not null default 'active'
                 check (status in ('active', 'expiring', 'expired', 'revoked', 'error')),
  authorized_at  timestamptz,
  valid_until    timestamptz,
  last_sync_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.bank_connections is
  'Una riga per consenso attivo presso un istituto. valid_until guida l''alert di rinnovo della Fase 7.';
comment on column public.bank_connections.aspsp_country is
  'Paese del connettore, non della banca: Revolut Bank UAB sta sotto LT anche per un utente italiano.';

create trigger bank_connections_set_updated_at
  before update on public.bank_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

create table public.accounts (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.bank_connections (id) on delete cascade,
  eb_account_uid    text not null unique,
  iban_masked       text,
  name              text,
  currency          char(3) not null,
  account_type      text check (account_type in ('current', 'savings', 'pocket', 'card')),
  is_active         boolean not null default true,
  include_in_totals boolean not null default true,
  created_at        timestamptz not null default now()
);

comment on column public.accounts.iban_masked is
  'Solo la forma mascherata: l''IBAN completo non viene mai memorizzato ne'' loggato (regola 7).';
comment on column public.accounts.include_in_totals is
  'Pocket e conti di risparmio restano fuori dai totali di spesa: girarci sopra dei soldi non e'' spendere.';

create index accounts_connection_id_idx on public.accounts (connection_id);

-- ---------------------------------------------------------------------------
-- sync_runs
-- ---------------------------------------------------------------------------
-- Dichiarata prima di raw_transactions perche' quest'ultima la referenzia.

create table public.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid references public.bank_connections (id) on delete set null,
  "trigger"       text not null check ("trigger" in ('cron', 'manual', 'backfill')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                  check (status in ('running', 'success', 'partial', 'failed')),
  accounts_synced integer not null default 0,
  rows_fetched    integer not null default 0,
  rows_new        integer not null default 0,
  rows_duplicate  integer not null default 0,
  "cursor"        jsonb,
  error_message   text
);

comment on column public.sync_runs."cursor" is
  'Continuation key dell''ultima pagina completata. E'' cio'' che rende il backfill riavviabile: senza, un''invocazione serverless interrotta a meta'' costringerebbe a ricominciare.';

create index sync_runs_connection_started_idx
  on public.sync_runs (connection_id, started_at desc);

-- ---------------------------------------------------------------------------
-- raw_transactions
-- ---------------------------------------------------------------------------

create table public.raw_transactions (
  id           bigserial primary key,
  account_id   uuid not null references public.accounts (id) on delete cascade,
  source       text not null check (source in ('enablebanking', 'csv', 'manual')),
  payload      jsonb not null,
  payload_hash text not null,
  sync_run_id  uuid references public.sync_runs (id) on delete set null,
  fetched_at   timestamptz not null default now(),
  unique (account_id, payload_hash)
);

comment on table public.raw_transactions is
  'Immutabile per costruzione: nessuna policy di update o delete, e nessun GRANT che le consenta. Il payload si salva integrale, mai ridotto: cio'' che si scarta oggi non si recupera piu''.';

create index raw_transactions_account_fetched_idx
  on public.raw_transactions (account_id, fetched_at desc);
create index raw_transactions_sync_run_idx
  on public.raw_transactions (sync_run_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.bank_connections enable row level security;
alter table public.bank_connections force row level security;
alter table public.accounts         enable row level security;
alter table public.accounts         force row level security;
alter table public.sync_runs        enable row level security;
alter table public.sync_runs        force row level security;
alter table public.raw_transactions enable row level security;
alter table public.raw_transactions force row level security;

create policy bank_connections_app_user on public.bank_connections
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

create policy accounts_app_user on public.accounts
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

create policy sync_runs_app_user on public.sync_runs
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

-- raw_transactions: lettura e inserimento, mai modifica ne' cancellazione.
-- L'immutabilita' e' una regola del progetto, quindi va imposta dal database e
-- non lasciata alla disciplina di chi scrive il codice sopra.
create policy raw_transactions_select on public.raw_transactions
  for select to authenticated
  using (public.is_app_user());

create policy raw_transactions_insert on public.raw_transactions
  for insert to authenticated
  with check (public.is_app_user());

-- ---------------------------------------------------------------------------
-- GRANT espliciti
-- ---------------------------------------------------------------------------
-- I privilegi di default per anon e authenticated sono stati revocati dalla
-- 0001: senza queste righe le tabelle non sarebbero raggiungibili affatto.

grant select, insert, update, delete on public.bank_connections to authenticated;
grant select, insert, update, delete on public.accounts         to authenticated;
grant select, insert, update, delete on public.sync_runs        to authenticated;
grant select, insert                 on public.raw_transactions to authenticated;

-- bigserial: senza la sequenza, l'insert fallisce.
grant usage, select on sequence public.raw_transactions_id_seq to authenticated;
