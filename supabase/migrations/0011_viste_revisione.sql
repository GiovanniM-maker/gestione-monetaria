-- 0011_viste_revisione.sql
--
-- Le due viste che alimentano la schermata di revisione.
--
-- Stanno in SQL e non in TypeScript perche' sono aggregazioni, ed e' una regola
-- di CLAUDE.md. Qui ha anche un motivo pratico: sono raggruppamenti su duemila
-- righe che il database fa in millisecondi e che in TypeScript costringerebbero
-- a scaricare tutto.

-- ---------------------------------------------------------------------------
-- v_da_classificare — la lista di lavoro
-- ---------------------------------------------------------------------------
-- Parte da `v_expenses` e non da `transactions`: un giroconto senza esercente
-- non e' un buco da riempire, e' un movimento che non deve avere un esercente.
-- Partire dalla tabella metteva in cima 49.844 euro di spostamenti verso il
-- conto deposito, che e' esattamente il lavoro che non va fatto.

create view public.v_da_classificare with (security_invoker = on) as
select coalesce(counterparty_raw, raw_description) as etichetta,
       count(*)                                   as movimenti,
       sum(amount)                                as totale,
       min(booking_date)                          as prima,
       max(booking_date)                          as ultima
from public.v_expenses
where merchant_id is null
  and coalesce(counterparty_raw, raw_description) is not null
group by 1;

comment on view public.v_da_classificare is
  'Etichette di spesa reale ancora senza esercente. E'' la lista di lavoro della schermata di revisione.';

grant select on public.v_da_classificare to authenticated;

-- ---------------------------------------------------------------------------
-- v_merchant_totals — gli esercenti con quanto pesano
-- ---------------------------------------------------------------------------
-- Serve a rivedere le scelte gia' fatte sapendo quanto valgono: cambiare la
-- discrezionalita' di un esercente da 2.000 euro e di uno da 12 sono due gesti
-- molto diversi, e senza il totale accanto sembrano identici.
--
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
       count(t.id)                as movimenti,
       coalesce(sum(t.amount), 0) as totale,
       max(t.booking_date)        as ultima
from public.merchants m
left join public.v_expenses t on t.merchant_id = m.id
group by m.id;

grant select on public.v_merchant_totals to authenticated;
