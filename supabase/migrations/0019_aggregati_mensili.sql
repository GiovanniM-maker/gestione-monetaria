-- 0019_aggregati_mensili.sql
--
-- Fase 6: gli aggregati su cui poggia il cruscotto.
--
-- Stanno tutti in viste SQL e nessuno in TypeScript. Non e' pignoleria
-- architetturale: la Fase 10 prevede di chiedere all'app «quanto ho speso in
-- ristoranti a marzo», e un copilot puo' interrogare una vista mentre non puo'
-- entrare in un `reduce` scritto per una schermata. Una vista e' gia' uno
-- strumento che un modello sa usare.
--
-- ---------------------------------------------------------------------------
-- Perche' `amount_eur` e non `amount`
-- ---------------------------------------------------------------------------
-- La valuta di riferimento e' l'euro, e una somma che mescola valute e' sbagliata
-- comunque la si guardi. `amount_eur` e' l'importo convertito una volta sola in
-- ingestion, ed e' l'unico che si possa sommare.
--
-- Oggi i due coincidono, perche' l'unico conto con `include_in_totals` e' in
-- euro. E' proprio per questo che va scritto adesso: il giorno in cui si
-- collega Intesa, o un pocket in valuta entra nei totali, sommare `amount`
-- produrrebbe un numero plausibile e falso, senza nessun errore.
--
-- Dove `amount_eur` e' nullo il movimento non e' convertibile, e **non si
-- somma**: sparirebbe dal totale in silenzio. Viene contato a parte in
-- `v_monthly_totals.senza_cambio`, e il cruscotto lo mostra come avviso. Un
-- movimento assente da un totale deve lasciare una traccia visibile.
--
-- ---------------------------------------------------------------------------
-- Il mese e' un giorno civile troncato, mai un fuso
-- ---------------------------------------------------------------------------
-- `date_trunc('month', booking_date)` opera su una `date` e restituisce un
-- valore senza fuso, che si ricasta a `date`. Nessuna conversione UTC entra
-- qui dentro: sposterebbe i movimenti di inizio e fine mese nel mese sbagliato,
-- che e' l'errore che falsa ogni aggregato mensile.

-- ---------------------------------------------------------------------------
-- v_monthly_totals — il totale del mese, e cosa non ci sta dentro
-- ---------------------------------------------------------------------------

create view public.v_monthly_totals with (security_invoker = on) as
select date_trunc('month', booking_date)::date            as mese,
       coalesce(sum(amount_eur), 0)                       as spesa,
       count(*)                                           as movimenti,
       -- Le due misure di incompletezza. Non sono decorazione: un cruscotto
       -- che non dice quanto non sa e' un cruscotto di cui non ci si puo'
       -- fidare.
       count(*) filter (where amount_eur is null)         as senza_cambio,
       count(*) filter (where category_id is null)        as senza_categoria,
       coalesce(sum(amount_eur) filter (where category_id is null), 0)
                                                          as spesa_senza_categoria
from public.v_expenses
group by 1;

comment on view public.v_monthly_totals is
  'Spesa reale per mese civile, piu'' quanto resta fuori dal totale e perche''.';

grant select on public.v_monthly_totals to authenticated;

-- ---------------------------------------------------------------------------
-- v_monthly_by_discretion — il mese diviso per classe
-- ---------------------------------------------------------------------------
-- La discrezionalita' vive sulla transazione e non sull'esercente: e' la
-- colonna che una correzione manuale puo' cambiare riga per riga, ed e' quella
-- che va letta.

create view public.v_monthly_by_discretion with (security_invoker = on) as
select date_trunc('month', booking_date)::date          as mese,
       coalesce(discretion, 'non classificato')         as discrezionalita,
       coalesce(context, 'non classificato')            as contesto,
       sum(amount_eur)                                  as spesa,
       count(*)                                         as movimenti
from public.v_expenses
where amount_eur is not null
group by 1, 2, 3;

grant select on public.v_monthly_by_discretion to authenticated;

-- ---------------------------------------------------------------------------
-- v_monthly_by_category — con roll-up sull'albero
-- ---------------------------------------------------------------------------
-- Ogni categoria porta la somma di se stessa **piu' tutte le discendenti**:
-- chiedere «quanto ho speso in alimentari» deve rispondere anche per il
-- supermercato e la panetteria che ci stanno sotto, o la risposta e' un
-- sottoinsieme presentato come un totale.
--
-- `spesa_diretta` resta accanto perche' le due rispondono a domande diverse:
-- quanto pesa questo ramo, e quanto e' finito proprio qui invece che in un
-- figlio. La seconda e' anche il modo di accorgersi di una categoria padre
-- usata come se fosse una foglia.
--
-- Il limite di profondita' non e' cautela generica: `categories.parent_id` e'
-- modificabile, e un ciclo — anche creato per sbaglio dal copilot della Fase 10
-- — farebbe girare la ricorsione all'infinito. Dieci livelli sono molti piu' di
-- quanti ne servano a una tassonomia di spese.

create view public.v_monthly_by_category with (security_invoker = on) as
with recursive albero as (
  -- Ogni categoria e' discendente di se stessa: e' cio' che fa comparire nel
  -- roll-up anche la spesa registrata direttamente sul nodo.
  select id as antenato, id as discendente, 0 as profondita
  from public.categories
  union all
  select a.antenato, c.id, a.profondita + 1
  from albero a
  join public.categories c on c.parent_id = a.discendente
  where a.profondita < 10
),
mensile as (
  select date_trunc('month', booking_date)::date as mese,
         category_id,
         sum(amount_eur) as spesa,
         count(*)        as movimenti
  from public.v_expenses
  where category_id is not null and amount_eur is not null
  group by 1, 2
)
select m.mese,
       c.id        as category_id,
       c.name      as categoria,
       c.slug,
       c.parent_id,
       c.sort_order,
       sum(m.spesa)                                            as spesa,
       sum(m.movimenti)                                        as movimenti,
       coalesce(sum(m.spesa) filter (where m.category_id = c.id), 0)
                                                               as spesa_diretta,
       coalesce(sum(m.movimenti) filter (where m.category_id = c.id), 0)
                                                               as movimenti_diretti
from mensile m
join albero a on a.discendente = m.category_id
join public.categories c on c.id = a.antenato
group by 1, 2, c.name, c.slug, c.parent_id, c.sort_order;

comment on view public.v_monthly_by_category is
  'Spesa mensile per categoria, con roll-up sui discendenti. `spesa_diretta` e'' la quota registrata sul nodo stesso.';

grant select on public.v_monthly_by_category to authenticated;

-- ---------------------------------------------------------------------------
-- v_monthly_by_merchant — il livello sotto la categoria
-- ---------------------------------------------------------------------------
-- E' il fondo della discesa: dalla classe alla categoria all'esercente. Sotto
-- c'e' solo la singola transazione, che si guarda per eccezione e non per
-- capire dove vanno i soldi.
--
-- Raggruppa anche per discrezionalita' e contesto della **transazione**, non
-- dell'esercente: se una riga e' stata corretta a mano — il computer da
-- Euronics comprato per lavorare — deve restare distinta invece di essere
-- riassorbita nella media del negozio.

create view public.v_monthly_by_merchant with (security_invoker = on) as
select date_trunc('month', e.booking_date)::date as mese,
       e.merchant_id,
       coalesce(m.canonical_name, '(senza esercente)') as esercente,
       m.category_id,
       coalesce(e.discretion, 'non classificato') as discrezionalita,
       coalesce(e.context, 'non classificato')    as contesto,
       sum(e.amount_eur) as spesa,
       count(*)          as movimenti
from public.v_expenses e
left join public.merchants m on m.id = e.merchant_id
where e.amount_eur is not null
group by 1, 2, m.canonical_name, m.category_id, 5, 6;

grant select on public.v_monthly_by_merchant to authenticated;
