-- 0053_la_controparte_arriva_alle_liste.sql
--
-- Un bonifico senza esercente si presentava con la causale della banca:
-- «Inviato da Revolut», undici volte la stessa frase. Dice il CANALE, non il
-- destinatario — e per capire a chi sono andati 360 euro bisognava aprire la
-- scheda e scavare nei campi grezzi.
--
-- Il nome c'e' sempre stato: e' `transactions.counterparty_raw` (il creditore
-- su un'uscita, il debitore su un'entrata). Le due viste delle liste da
-- rivedere non lo portavano; ora lo portano, e l'etichetta la compone
-- `etichettaMovimento()` in un posto solo: esercente, poi controparte, poi
-- causale.
--
-- NON e' una questione di regola 8: quella vieta i nomi delle controparti
-- verso un LLM. Queste viste vanno al browser dell'utente, che i suoi
-- bonifici li ha fatti.
--
-- La colonna va IN CODA a entrambe le viste, cosi' `create or replace` basta:
-- cambiare l'ordine delle colonne di una vista esistente vorrebbe dire
-- ricrearla, e con lei tutto cio' che ci sta sopra. Il resto delle definizioni
-- e' identico alla 0041 e alla 0042.

create or replace view public.v_da_confermare with (security_invoker = on) as
select e.id,
       e.booking_date,
       e.amount::text          as amount,
       e.amount_eur::text      as amount_eur,
       e.currency,
       e.status                as stato,
       e.raw_description,
       e.discretion            as discrezionalita,
       e.context               as contesto,
       e.manually_categorized,
       e.notes                 as note,
       m.id                    as merchant_id,
       m.canonical_name        as esercente,
       m.origine               as origine_classificazione,
       m.confermato_at         as esercente_confermato_at,
       m.motivazione,
       c.id                    as category_id,
       c.name                  as categoria,
       case when e.category_id is null then 'senza categoria' else 'nuovo' end as motivo,
       -- In coda, per non ricreare la vista e tutto cio' che ci sta sopra.
       t.counterparty_raw
from public.v_expenses e
join public.transactions t on t.id = e.id
left join public.merchants m on m.id = e.merchant_id
left join public.categories c on c.id = e.category_id
where (t.confermato_at is null or e.category_id is null)
  and e.status = 'booked';

comment on view public.v_da_confermare is
  'Cosa c''e'' da fare: i movimenti mai confermati e quelli senza categoria, che confermare non sistema.';

grant select on public.v_da_confermare to authenticated;

create or replace view public.v_ultimi_movimenti with (security_invoker = on) as
select e.id,
       e.booking_date,
       e.amount::text          as amount,
       e.amount_eur::text      as amount_eur,
       e.currency,
       e.status                as stato,
       e.raw_description,
       e.discretion            as discrezionalita,
       e.context               as contesto,
       e.manually_categorized,
       e.notes                 as note,
       m.id                    as merchant_id,
       m.canonical_name        as esercente,
       m.origine               as origine_classificazione,
       m.confermato_at         as esercente_confermato_at,
       m.motivazione,
       c.id                    as category_id,
       c.name                  as categoria,
       t.confermato_at,
       -- In coda, come sopra.
       t.counterparty_raw
from public.v_expenses e
join public.transactions t on t.id = e.id
left join public.merchants m on m.id = e.merchant_id
left join public.categories c on c.id = e.category_id;

comment on view public.v_ultimi_movimenti is
  'I pagamenti reali con la loro classificazione, confermati o no, provvisori compresi. Per rivedere, non per confermare.';

grant select on public.v_ultimi_movimenti to authenticated;

notify pgrst, 'reload schema';
