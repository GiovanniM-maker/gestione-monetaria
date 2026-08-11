-- 0006_own_counterparties.sql
--
-- Le controparti che sono conti dell'utente.
--
-- Perché serve una tabella e non una regola automatica: un bonifico verso un
-- proprio conto presso un'altra banca è indistinguibile da un bonifico a un
-- terzo. Stesso codice, stessa forma, e l'altro lato non esiste nei nostri dati
-- perché quel conto non è collegato. Verificato sui dati reali: tutti i
-- movimenti "To/From Conto deposito senza vincoli" hanno un `entry_reference`
-- presente su un conto solo.
--
-- L'unica fonte di quell'informazione è l'utente. Qui la si scrive una volta e
-- vale per tutte le occorrenze, passate e future.

create table public.own_counterparties (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  note       text,
  created_at timestamptz not null default now(),
  -- Il confronto avviene su questa forma: minuscole e spazi compattati.
  -- Averla come colonna generata rende impossibile inserire due varianti dello
  -- stesso nome che poi si comportano in modo diverso.
  label_norm text generated always as (lower(regexp_replace(btrim(label), '\s+', ' ', 'g'))) stored,
  constraint own_counterparties_label_norm_unique unique (label_norm)
);

comment on table public.own_counterparties is
  'Controparti che sono conti dell''utente. Un movimento verso una di queste e'' un giroconto, non una spesa.';

alter table public.own_counterparties enable row level security;
alter table public.own_counterparties force row level security;

create policy own_counterparties_app_user on public.own_counterparties
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

grant select, insert, update, delete on public.own_counterparties to authenticated;

-- Le due controparti osservate nei dati caricati. Non sono un esempio: sono i
-- due casi che sballavano i totali di luglio di quasi settemila euro.
insert into public.own_counterparties (label, note) values
  ('Conto deposito senza vincoli', 'Deposito presso un altro istituto, non collegato'),
  ('Giovanni Graziano Mavilla',    'Bonifici verso un proprio conto presso un altro istituto');
