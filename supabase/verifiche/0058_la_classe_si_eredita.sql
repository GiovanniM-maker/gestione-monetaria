-- ===========================================================================
-- Verifica della 0058 — la classe si eredita anche quando la scrive l'utente
-- ===========================================================================
-- Sicura in produzione: tutto dentro `begin … rollback`, quindi semina il
-- caso, lo misura e non lascia niente.
--
-- Il caso va **seminato**, non cercato: la riparazione della migration ha gia'
-- sistemato le righe vere, quindi cercandole non si distinguerebbe una
-- funzione corretta da una che non fa niente. E' la stessa ragione per cui la
-- verifica della 0057 semina il giroconto.
-- ===========================================================================

begin;

-- Una categoria con la sua classe predefinita, un esercente che NON ne ha una,
-- e tre movimenti nello stato in cui il difetto li lasciava.
insert into public.categories (id, slug, name, default_discretion, sort_order)
values ('00000000-0000-4000-8000-0000000058c1', 'prova-0058', 'Prova 0058', 'voluttuario', 9999);

insert into public.merchants (id, canonical_name, category_id, discretion, context)
values ('00000000-0000-4000-8000-0000000058e1', 'Prova 0058 Esercente',
        '00000000-0000-4000-8000-0000000058c1', null, 'personale');

insert into public.transactions
  (id, account_id, source, external_id, booking_date, amount, currency, amount_eur, status)
select v.id, (select id from public.accounts limit 1), 'manual', v.id::text,
       current_date, -10.00, 'EUR', -10.00, 'booked'
from (values
  ('00000000-0000-4000-8000-0000000058a1'::uuid),
  ('00000000-0000-4000-8000-0000000058a2'::uuid),
  ('00000000-0000-4000-8000-0000000058a3'::uuid)
) as v(id);

-- 1. Scegliere la categoria e basta: prima lasciava `discretion` a null e
--    marcava manually_categorized, cioe' congelava la riga su un'assenza.
select public.categorizza_movimento(
  '00000000-0000-4000-8000-0000000058a1',
  '00000000-0000-4000-8000-0000000058c1');

-- 2. Spostare su un esercente senza classe ma con una categoria che ce l'ha.
select public.sposta_movimento(
  '00000000-0000-4000-8000-0000000058a2',
  '00000000-0000-4000-8000-0000000058e1');

-- 3. Scrivere solo una nota: non e' una classificazione, non deve congelare.
select public.correggi_movimento(
  '00000000-0000-4000-8000-0000000058a3', null, null, 'solo un promemoria');

select
  case id
    when '00000000-0000-4000-8000-0000000058a1' then '1 · categoria scelta'
    when '00000000-0000-4000-8000-0000000058a2' then '2 · spostato su esercente'
    else                                             '3 · solo una nota'
  end                                                        as caso,
  coalesce(discretion, '(nessuna)')                          as classe,
  manually_categorized                                       as congelata,
  case
    when id = '00000000-0000-4000-8000-0000000058a1'
      then discretion = 'voluttuario'
    when id = '00000000-0000-4000-8000-0000000058a2'
      then discretion = 'voluttuario'
    else discretion is null and not manually_categorized
  end                                                        as atteso
from public.transactions
where id in ('00000000-0000-4000-8000-0000000058a1',
             '00000000-0000-4000-8000-0000000058a2',
             '00000000-0000-4000-8000-0000000058a3')
order by 1;

-- Quante righe restano congelate senza niente da proteggere. Dopo la
-- riparazione deve essere **zero**, e deve restarlo: se risale, una delle tre
-- funzioni ha ripreso a congelare su un'assenza.
select count(*) as congelate_senza_classificazione
from public.transactions
where manually_categorized
  and discretion is null and context is null and category_id is null;

rollback;
