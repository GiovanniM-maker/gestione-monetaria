-- 0005_transactions.sql
--
-- Fase 3: le transazioni normalizzate, la vista delle uscite reali e il
-- rilevamento dei giroconti speculari.

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

create table public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid not null references public.accounts (id) on delete cascade,
  raw_transaction_id     bigint references public.raw_transactions (id) on delete set null,
  source                 text not null check (source in ('enablebanking', 'csv', 'manual')),

  external_id            text,
  dedupe_key             text,
  -- Implementa `UNIQUE (account_id, COALESCE(external_id, dedupe_key))` dello
  -- schema: Postgres non accetta un vincolo su un'espressione, ma una colonna
  -- generata da' lo stesso risultato ed e' referenziabile in ON CONFLICT.
  match_key              text generated always as (coalesce(external_id, dedupe_key)) stored,

  booking_date           date not null,
  value_date             date,

  -- NEGATIVO = uscita. Il segno si stabilisce una volta sola, in
  -- normalizzazione, leggendo `credit_debit_indicator`: l'API restituisce
  -- sempre importi positivi.
  amount                 numeric(14, 2) not null,
  currency               char(3) not null,
  amount_eur             numeric(14, 2),
  fx_rate                numeric(18, 8),
  fx_date                date,

  raw_description        text,
  counterparty_raw       text,
  status                 text not null check (status in ('pending', 'booked')),

  merchant_id            uuid,
  category_id            uuid,
  discretion             text check (discretion in ('essenziale', 'investimento', 'utile', 'voluttuario')),
  context                text check (context in ('personale', 'business')),

  is_transfer            boolean not null default false,
  is_refund              boolean not null default false,
  manually_categorized   boolean not null default false,
  excluded_from_analysis boolean not null default false,
  notes                  text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint transactions_match_key_presente check (match_key is not null),
  constraint transactions_account_match_key_unique unique (account_id, match_key)
);

comment on column public.transactions.amount is
  'Negativo per le uscite, senza eccezioni. Il segno arriva da credit_debit_indicator, non dall''importo, che l''API restituisce sempre positivo.';
comment on column public.transactions.match_key is
  'Chiave di idempotenza: entry_reference della banca, o l''hash di fallback quando manca.';
comment on column public.transactions.manually_categorized is
  'Se true, il normalizzatore non tocca piu'' la riga: le correzioni manuali vincono sempre sull''automatismo.';

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create index transactions_account_booking_idx on public.transactions (account_id, booking_date desc);
create index transactions_booking_idx on public.transactions (booking_date desc);
create index transactions_raw_idx on public.transactions (raw_transaction_id);
-- Serve al rilevamento dei giroconti speculari, che cerca importi opposti in
-- una finestra di pochi giorni.
create index transactions_amount_booking_idx on public.transactions (amount, booking_date);

alter table public.transactions enable row level security;
alter table public.transactions force row level security;

create policy transactions_app_user on public.transactions
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

grant select, insert, update, delete on public.transactions to authenticated;

-- ---------------------------------------------------------------------------
-- Giroconti speculari
-- ---------------------------------------------------------------------------
-- Rete di sicurezza dietro al riconoscimento per codice e causale, che resta il
-- segnale primario. Cerca coppie di movimenti di importo opposto fra due conti
-- diversi, ravvicinate nel tempo: un'uscita da un conto e un'entrata sull'altro
-- sono lo stesso spostamento visto due volte, non una spesa e un incasso.
--
-- Non tocca le righe con `manually_categorized`, e restituisce quante righe ha
-- marcato, cosi' il chiamante puo' riportarlo.

create function public.rileva_giroconti_speculari(giorni integer default 3)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marcate integer;
begin
  with coppie as (
    select uscita.id as id_uscita, entrata.id as id_entrata
    from public.transactions uscita
    join public.transactions entrata
      on entrata.account_id <> uscita.account_id
     and entrata.amount = -uscita.amount
     and entrata.booking_date between uscita.booking_date - giorni
                                  and uscita.booking_date + giorni
    where uscita.amount < 0
      and not uscita.is_transfer
      and not entrata.is_transfer
      and not uscita.manually_categorized
      and not entrata.manually_categorized
  )
  update public.transactions t
     set is_transfer = true
   where t.id in (select id_uscita from coppie)
      or t.id in (select id_entrata from coppie);

  get diagnostics marcate = row_count;
  return marcate;
end;
$$;

comment on function public.rileva_giroconti_speculari(integer) is
  'Marca is_transfer sulle coppie di movimenti speculari fra conti diversi. Rete di sicurezza dietro al riconoscimento per codice e causale.';

revoke all on function public.rileva_giroconti_speculari(integer) from public;
grant execute on function public.rileva_giroconti_speculari(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- v_expenses — le uscite reali
-- ---------------------------------------------------------------------------
-- Quattro esclusioni, ognuna per un motivo diverso:
--   amount < 0                 le entrate non sono spese
--   not is_transfer            spostare soldi fra conti propri non e' spendere
--   not is_refund              un rimborso e' una spesa annullata
--   not excluded_from_analysis esclusione manuale dell'utente
--   include_in_totals          pocket e depositi restano fuori
--
-- I movimenti a importo zero — le preautorizzazioni di carta — cadono da soli
-- sotto `amount < 0`, senza bisogno di una regola dedicata.

-- `security_invoker` non e' un dettaglio: senza, la vista girerebbe con i
-- privilegi del proprietario e scavalcherebbe la RLS delle tabelle sottostanti,
-- vanificando lo strato che protegge i dati bancari.
create view public.v_expenses with (security_invoker = on) as
select t.*
from public.transactions t
join public.accounts a on a.id = t.account_id
where t.amount < 0
  and not t.is_transfer
  and not t.is_refund
  and not t.excluded_from_analysis
  and a.include_in_totals;

comment on view public.v_expenses is
  'Uscite reali. Ogni aggregato di spesa deve partire da qui, mai da transactions.';

grant select on public.v_expenses to authenticated;

-- ---------------------------------------------------------------------------
-- v_expenses_by_month — serve a verificare la fase
-- ---------------------------------------------------------------------------
-- L'aggregazione sta in SQL, non in TypeScript: e' una regola di CLAUDE.md, e
-- qui ha anche un motivo pratico, perche' e' il numero da confrontare con
-- l'app della banca.
--
-- `senza_cambio` conta i movimenti in valuta estera per cui non e' stato
-- possibile calcolare l'importo in euro. Se e' maggiore di zero, il totale del
-- mese e' incompleto e va detto, non nascosto.

create view public.v_expenses_by_month with (security_invoker = on) as
select to_char(booking_date, 'YYYY-MM')                 as mese,
       count(*)                                         as movimenti,
       sum(amount_eur)                                  as totale_eur,
       count(*) filter (where amount_eur is null)       as senza_cambio
from public.v_expenses
group by 1;

grant select on public.v_expenses_by_month to authenticated;
