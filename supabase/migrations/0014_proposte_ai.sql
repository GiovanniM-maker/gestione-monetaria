-- 0014_proposte_ai.sql
--
-- Da dove viene la classificazione di un esercente, e se e' stata confermata.
--
-- Serve perche' la cascata ha tre strati con affidabilita' diverse:
--   `seed`     scritto a mano nelle migration iniziali
--   `ai`       proposto dal modello, da confermare
--   `manuale`  deciso dall'utente, definitivo
--
-- Senza questa distinzione una proposta del modello e una scelta dell'utente
-- sarebbero indistinguibili, e l'app non saprebbe piu' cosa chiedere. E'
-- l'unica cosa che mancava per spostare la classificazione dentro
-- l'applicazione invece di scriverla in una migration.

alter table public.merchants
  add column origine text not null default 'manuale'
    check (origine in ('seed', 'ai', 'manuale')),
  -- `null` = proposta in attesa. Confermando si scrive la data, e da quel
  -- momento la riga non compare piu' fra le cose da guardare.
  add column confermato_at timestamptz,
  -- La riga con cui il modello ha motivato la scelta. Sta qui e non nei log
  -- perche' e' cio' che permette all'utente di dire "no, sbagliato" con
  -- cognizione invece che a sensazione.
  add column motivazione text;

-- ---------------------------------------------------------------------------
-- Il tipo di operazione, sulla transazione normalizzata
-- ---------------------------------------------------------------------------
-- Serve a decidere cosa puo' uscire verso un LLM, ed e' l'unico dato che lo
-- decide davvero. `Bovi Laura` e `Panfe Bologna` hanno la stessa identica
-- forma: nessuna regola sulla stringa puo' separarli, perche' l'informazione
-- non e' nella stringa. E' nel tipo di operazione — dall'altra parte di un
-- pagamento con carta c'e' un esercente per costruzione, dall'altra parte di
-- un bonifico ci puo' essere chiunque.
--
-- Il dato la banca ce l'ha sempre dato; semplicemente non lo salvavamo.

alter table public.transactions add column bank_code text;

comment on column public.transactions.bank_code is
  'bank_transaction_code.code della banca: CARD_PAYMENT, TRANSFER, CARD_CREDIT, REV_PAYMENT. Decide cosa puo'' essere inviato a un LLM (regola 8).';

create index transactions_bank_code_idx on public.transactions (bank_code);

comment on column public.merchants.origine is
  'Chi ha classificato: seed (migration), ai (proposta del modello), manuale (utente).';
comment on column public.merchants.confermato_at is
  'null = proposta in attesa di conferma. Le proposte valgono comunque per la categorizzazione: meglio una classificazione probabile che nessuna.';

-- Tutto cio' che esiste ora e' stato deciso a mano nelle migration 0009-0013:
-- e' `seed`, ed e' gia' confermato.
update public.merchants set origine = 'seed', confermato_at = now();

create index merchants_da_confermare_idx on public.merchants (origine) where confermato_at is null;

-- La vista degli esercenti guadagna le tre colonne nuove.
drop view if exists public.v_merchant_totals;

create view public.v_merchant_totals with (security_invoker = on) as
select m.id,
       m.canonical_name,
       m.category_id,
       m.discretion,
       m.context,
       m.is_subscription,
       m.origine,
       m.confermato_at,
       m.motivazione,
       count(t.id)                as movimenti,
       coalesce(sum(t.amount), 0) as totale,
       max(t.booking_date)        as ultima
from public.merchants m
left join public.v_expenses t on t.merchant_id = m.id
group by m.id;

grant select on public.v_merchant_totals to authenticated;

-- ---------------------------------------------------------------------------
-- v_da_classificare guadagna il tipo di operazione
-- ---------------------------------------------------------------------------
-- `solo_carta` e' vero quando OGNI movimento di quell'etichetta e' un
-- pagamento con carta. Basta un bonifico nel gruppo perche' cada: la garanzia
-- deve valere per tutte le occorrenze, non per la maggioranza — il movimento
-- che sfugge e' proprio quello che non deve uscire.

drop view if exists public.v_da_classificare;

create view public.v_da_classificare with (security_invoker = on) as
select coalesce(counterparty_raw, raw_description)              as etichetta,
       count(*)                                                 as movimenti,
       sum(amount)                                              as totale,
       min(booking_date)                                        as prima,
       max(booking_date)                                        as ultima,
       bool_and(bank_code = 'CARD_PAYMENT')                     as solo_carta
from public.v_expenses
where merchant_id is null
  and coalesce(counterparty_raw, raw_description) is not null
group by 1;

comment on view public.v_da_classificare is
  'Etichette di spesa reale ancora senza esercente. `solo_carta` dice se si possono inviare a un LLM (regola 8).';

grant select on public.v_da_classificare to authenticated;
