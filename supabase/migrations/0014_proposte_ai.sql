-- 0014_proposte_ai.sql
--
-- Due cose: da dove viene la classificazione di un esercente, e il tipo di
-- operazione bancaria sulla transazione.
--
-- ---------------------------------------------------------------------------
-- Una trappola di Postgres, pagata scrivendo questa migration
-- ---------------------------------------------------------------------------
-- `v_expenses` e' definita come `select t.* from transactions t ...`, e
-- **Postgres congela l'elenco delle colonne al momento della creazione**.
-- Aggiungere una colonna alla tabella non la fa comparire nella vista: la
-- prima stesura di questo file falliva con
--
--     column "bank_code" does not exist
--
-- proprio mentre creava la vista che avrebbe dovuto usarla. `t.*` sembra dire
-- "tutte le colonne, anche quelle future" e non lo dice.
--
-- Quindi ogni colonna nuova su `transactions` che debba arrivare fino alle
-- viste impone di ricreare `v_expenses` e tutto cio' che ci sta sopra. E'
-- noioso e va fatto in ordine di dipendenza, ma e' meccanico.
--
-- Rieseguibile: se una parte e' gia' passata, rilanciarla non rompe niente.

-- ---------------------------------------------------------------------------
-- Origine e conferma della classificazione
-- ---------------------------------------------------------------------------
-- La cascata ha tre strati con affidabilita' diversa:
--   `seed`     scritto a mano nelle migration iniziali
--   `ai`       proposto dal modello, da confermare
--   `manuale`  deciso dall'utente, definitivo
--
-- Senza questa distinzione una proposta del modello e una scelta dell'utente
-- sarebbero indistinguibili, e l'app non saprebbe piu' cosa chiedere.

alter table public.merchants
  add column if not exists origine text not null default 'manuale'
    check (origine in ('seed', 'ai', 'manuale'));

-- `null` = proposta in attesa. Confermando si scrive la data, e da quel
-- momento la riga non compare piu' fra le cose da guardare.
alter table public.merchants add column if not exists confermato_at timestamptz;

-- La riga con cui il modello ha motivato la scelta. Sta qui e non nei log
-- perche' e' cio' che permette di dire "no, sbagliato" con cognizione invece
-- che a sensazione.
alter table public.merchants add column if not exists motivazione text;

comment on column public.merchants.origine is
  'Chi ha classificato: seed (migration), ai (proposta del modello), manuale (utente).';
comment on column public.merchants.confermato_at is
  'null = proposta in attesa. Vale comunque per la categorizzazione: meglio una classificazione probabile e visibile che nessuna.';

-- Tutto cio' che esiste ora e' stato deciso a mano nelle migration 0009-0013.
-- Il filtro su `manuale` — il valore predefinito — fa si' che rilanciare
-- questa migration non marchi come `seed` le proposte del modello arrivate nel
-- frattempo.
update public.merchants
   set origine = 'seed', confermato_at = coalesce(confermato_at, now())
 where origine = 'manuale';

create index if not exists merchants_da_confermare_idx
  on public.merchants (origine) where confermato_at is null;

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
-- Il dato la banca ce l'ha sempre dato; semplicemente non lo salvavamo. Si
-- riempie rinormalizzando.

alter table public.transactions add column if not exists bank_code text;

comment on column public.transactions.bank_code is
  'bank_transaction_code.code della banca: CARD_PAYMENT, TRANSFER, CARD_CREDIT, REV_PAYMENT. Decide cosa puo'' essere inviato a un LLM (regola 8).';

create index if not exists transactions_bank_code_idx on public.transactions (bank_code);

-- ---------------------------------------------------------------------------
-- Le viste, ricreate in ordine di dipendenza
-- ---------------------------------------------------------------------------
-- Si scende dalle foglie alla radice per cancellare, e si risale per ricreare.
-- Nessun `cascade`: porterebbe via anche viste che questo file non ricrea, e
-- il danno si scoprirebbe solo alla prima query che non trova piu' niente.

drop view if exists public.v_da_classificare;
drop view if exists public.v_merchant_totals;
drop view if exists public.v_expenses_by_month;
drop view if exists public.v_expenses;

-- `security_invoker` non e' un dettaglio: senza, la vista girerebbe con i
-- privilegi del proprietario e scavalcherebbe la RLS delle tabelle sottostanti.
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

create view public.v_expenses_by_month with (security_invoker = on) as
select to_char(booking_date, 'YYYY-MM')           as mese,
       count(*)                                   as movimenti,
       sum(amount_eur)                            as totale_eur,
       count(*) filter (where amount_eur is null) as senza_cambio
from public.v_expenses
group by 1;

grant select on public.v_expenses_by_month to authenticated;

-- `left join`: un esercente senza movimenti deve comparire lo stesso, a zero.
-- Se sparisse, un alias che non abbina piu' niente diventerebbe invisibile
-- proprio quando serve accorgersene.
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

-- `solo_carta` e' vero quando OGNI movimento di quell'etichetta e' un
-- pagamento con carta. Basta un bonifico nel gruppo perche' cada: la garanzia
-- deve valere per tutte le occorrenze, non per la maggioranza — il movimento
-- che sfugge e' proprio quello che non deve uscire.
--
-- Finche' non si rinormalizza, `bank_code` e' nullo ovunque e `solo_carta`
-- resta nullo: il codice lo tratta come "non garantito", quindi nel dubbio non
-- invia. Il fallimento e' dalla parte prudente.
create view public.v_da_classificare with (security_invoker = on) as
select coalesce(counterparty_raw, raw_description) as etichetta,
       count(*)                                    as movimenti,
       sum(amount)                                 as totale,
       min(booking_date)                           as prima,
       max(booking_date)                           as ultima,
       coalesce(bool_and(bank_code = 'CARD_PAYMENT'), false) as solo_carta
from public.v_expenses
where merchant_id is null
  and coalesce(counterparty_raw, raw_description) is not null
group by 1;

comment on view public.v_da_classificare is
  'Etichette di spesa reale ancora senza esercente. `solo_carta` dice se si possono inviare a un LLM (regola 8).';

grant select on public.v_da_classificare to authenticated;
