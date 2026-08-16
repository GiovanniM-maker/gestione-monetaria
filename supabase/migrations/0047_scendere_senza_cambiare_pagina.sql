-- 0047_scendere_senza_cambiare_pagina.sql
--
-- «Dove» diventa una fisarmonica: si scende dalla classe alla transazione senza
-- cambiare pagina, e ogni ramo si apre in loco mostrando cosa c'e' sotto.
--
-- ---------------------------------------------------------------------------
-- Perche' una funzione e non quattro query nella schermata
-- ---------------------------------------------------------------------------
-- Il livello sotto un nodo e' sempre la stessa domanda: «di cosa e' fatto
-- questo». Scritta quattro volte — una per livello — sarebbero quattro
-- definizioni di «spesa di un ramo» che possono divergere, e il sintomo
-- sarebbe il peggiore possibile: un padre che non e' la somma dei suoi figli.
--
-- E' la regola della Fase 0 pagata un'altra volta: le aggregazioni stanno in
-- SQL, e questa e' un'operazione nominata che il copilota puo' usare per
-- rispondere a «cosa c'e' dentro Ristorazione a luglio» senza che nessuno
-- gliela riscriva.
--
-- ---------------------------------------------------------------------------
-- Il roll-up e' lo stesso di `v_monthly_by_category`, con un filtro in piu'
-- ---------------------------------------------------------------------------
-- Ogni categoria porta la somma di se stessa piu' tutte le discendenti, e il
-- limite di profondita' e' dieci come li': `parent_id` e' modificabile, e un
-- ciclo — anche creato per sbaglio dal copilota — farebbe girare la ricorsione
-- all'infinito.
--
-- Quello che qui si aggiunge e' il filtro su classe e contesto, che quella
-- vista non ha. Serve per il primo dei due modi della schermata: aperta la
-- classe «voluttuario · personale», sotto devono comparire le categorie
-- **dentro quella classe**, non le categorie intere.
--
-- ---------------------------------------------------------------------------
-- «Senza categoria» e' una riga, non un'assenza
-- ---------------------------------------------------------------------------
-- La spesa con `category_id` nullo non sta da nessuna parte nell'albero. Se la
-- funzione la lasciasse fuori, la somma dei rami sarebbe minore del totale del
-- mese e nessuno saprebbe perche' — cioe' esattamente il guasto che tutta
-- questa applicazione e' costruita per non avere. Compare come riga con
-- `category_id` nullo, e da li' si scende ai suoi movimenti come da ogni altra.
--
-- ---------------------------------------------------------------------------
-- `spesa_diretta` e `figli` sono due colonne perche' rispondono a due domande
-- ---------------------------------------------------------------------------
-- Un nodo puo' avere delle figlie **e** della spesa registrata su di se'. Chi
-- disegna deve poter mostrare le figlie e, accanto, una riga «direttamente
-- qui» che scende ai movimenti di quel solo nodo — se invece scendesse ai
-- movimenti del ramo intero, ogni euro comparirebbe due volte.
--
-- E' il motivo per cui `cerca_movimenti` acquista `p_solo_questa`, qui sotto.

create or replace function public.ripartizione_dove(
  p_mese      date,
  p_classe    text default null,
  p_contesto  text default null,
  p_categoria uuid default null
)
returns table (
  category_id       uuid,
  nome              text,
  spesa             text,
  movimenti         bigint,
  spesa_diretta     text,
  movimenti_diretti bigint,
  figli             bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
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
-- La spesa del mese, gia' filtrata per classe e contesto. `coalesce` sul lato
-- del confronto e non sul dato: chiedendo «non classificato» si deve trovare
-- quello che nei dati e' un `null`.
righe as (
  select e.category_id,
         sum(e.amount_eur) as spesa,
         count(*)          as movimenti
  from public.v_expenses e
  where e.amount_eur is not null
    and date_trunc('month', e.booking_date)::date = date_trunc('month', p_mese)::date
    and (p_classe is null
         or coalesce(e.discretion, 'non classificato') = p_classe)
    and (p_contesto is null
         or coalesce(e.context, 'non classificato') = p_contesto)
  group by 1
),
-- Il roll-up: ogni categoria con la somma delle sue discendenti.
nodi as (
  select c.id,
         c.name,
         c.parent_id,
         c.sort_order,
         sum(r.spesa)                                             as spesa,
         sum(r.movimenti)                                         as movimenti,
         coalesce(sum(r.spesa) filter (where r.category_id = c.id), 0)
                                                                  as spesa_diretta,
         coalesce(sum(r.movimenti) filter (where r.category_id = c.id), 0)
                                                                  as movimenti_diretti
  from righe r
  join albero a on a.discendente = r.category_id
  join public.categories c on c.id = a.antenato
  group by 1, 2, 3, 4
)
select n.id,
       n.name,
       n.spesa::text,
       n.movimenti,
       n.spesa_diretta::text,
       n.movimenti_diretti,
       -- Quante figlie hanno spesa in questo mese e in questa classe. Zero
       -- significa «sotto non c'e' un altro livello», e chi disegna scende
       -- direttamente ai movimenti invece di aprire un ramo vuoto.
       (select count(*) from nodi f where f.parent_id = n.id) as figli
from nodi n
where case
        -- Le radici. Non `parent_id is null` e basta: una categoria il cui
        -- padre non ha spesa in questo mese non comparirebbe da nessuna parte,
        -- e la somma dei rami sarebbe minore del totale. Qui risale.
        when p_categoria is null
          then n.parent_id is null
            or not exists (select 1 from nodi p where p.id = n.parent_id)
        else n.parent_id = p_categoria
      end

union all

-- La spesa senza categoria, che nell'albero non ha un posto. Solo al primo
-- livello: piu' sotto sarebbe una riga che non vuol dire niente.
select null::uuid,
       'Senza categoria',
       r.spesa::text,
       r.movimenti,
       r.spesa::text,
       r.movimenti,
       0::bigint
from righe r
where p_categoria is null and r.category_id is null

order by 3;
$$;

comment on function public.ripartizione_dove(date, text, text, uuid) is
  'Di cosa e'' fatto un ramo: le categorie sotto un nodo (o le radici), con roll-up, filtrate per classe e contesto. `figli` = 0 significa che sotto ci sono i movimenti.';

revoke all on function public.ripartizione_dove(date, text, text, uuid) from public;
grant execute on function public.ripartizione_dove(date, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- cerca_movimenti — `p_solo_questa`, per il fondo della discesa
-- ---------------------------------------------------------------------------
-- Il filtro per categoria comprende le discendenti, ed e' giusto: chiedere
-- «Alimentari» deve rispondere anche per il supermercato che ci sta sotto, o la
-- categoria padre darebbe una lista vuota mentre il cruscotto ne mostra il
-- totale.
--
-- La fisarmonica ha pero' un caso che quel comportamento non copre: un nodo con
-- delle figlie **e** della spesa propria. Li' si mostrano le figlie e, accanto,
-- una riga «direttamente qui». Se quella riga scendesse al ramo intero, ogni
-- euro comparirebbe due volte — una nelle figlie e una qui.
--
-- Il predefinito resta `false`, quindi ogni chiamata gia' scritta si comporta
-- esattamente come prima. Va eliminata e ricreata perche' un argomento in piu'
-- con un valore predefinito creerebbe un **sovraccarico**: due funzioni con lo
-- stesso nome, e PostgREST che ne sceglie una a caso.

-- Si eliminano **tutte e due** le firme, la vecchia e la nuova. Solo la vecchia
-- non basta: alla seconda esecuzione quella non esiste piu' e la `create`
-- fallirebbe su una funzione che c'e' gia'. E' esattamente il difetto che la
-- regola «una migration si applica due volte» esiste per trovare, e qui l'ha
-- trovato.
drop function if exists public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer);
drop function if exists public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean);

create function public.cerca_movimenti(
  p_id              uuid    default null,
  p_da              date    default null,
  p_a               date    default null,
  p_ricerca         text    default null,
  p_categoria       uuid    default null,
  p_merchant        uuid    default null,
  p_discrezionalita text    default null,
  p_contesto        text    default null,
  p_tipo            text    default 'spesa',
  p_ordine          text    default 'data',
  p_limite          integer default 50,
  p_scarto          integer default 0,
  -- `true` = solo i movimenti appesi a QUESTA categoria, senza le discendenti.
  p_solo_questa     boolean default false
)
returns table (
  id                     uuid,
  booking_date           date,
  value_date             date,
  amount                 text,
  amount_eur             text,
  currency               char(3),
  stato                  text,
  esercente              text,
  merchant_id            uuid,
  categoria              text,
  category_id            uuid,
  discrezionalita        text,
  contesto               text,
  conto                  text,
  raw_description        text,
  counterparty_raw       text,
  bank_code              text,
  is_transfer            boolean,
  is_refund              boolean,
  excluded_from_analysis boolean,
  manually_categorized   boolean,
  note                   text,
  fuori_dalla_spesa      text,
  totale_righe           bigint,
  totale_importo         text
)
language sql
stable
security invoker
set search_path = ''
as $$
with recursive rami as (
  -- Il filtro per categoria comprende le discendenti: chiedere «Alimentari»
  -- deve rispondere anche per il supermercato e la panetteria che ci stanno
  -- sotto. Senza, la categoria padre risponderebbe con una lista vuota mentre
  -- il cruscotto ne mostra il totale — e sembrerebbe un difetto dei dati.
  --
  -- Con `p_solo_questa` la ricorsione non parte: resta il nodo, e basta.
  select p_categoria as id, 0 as profondita
  where p_categoria is not null
  union all
  select c.id, r.profondita + 1
  from rami r
  join public.categories c on c.parent_id = r.id
  where r.profondita < 10 and not coalesce(p_solo_questa, false)
)
select m.id,
       m.booking_date,
       m.value_date,
       m.amount::text,
       m.amount_eur::text,
       m.currency,
       m.status,
       mer.canonical_name,
       m.merchant_id,
       cat.name,
       m.category_id,
       m.discretion,
       m.context,
       coalesce(acc.name, acc.iban_masked),
       m.raw_description,
       m.counterparty_raw,
       m.bank_code,
       m.is_transfer,
       m.is_refund,
       m.excluded_from_analysis,
       m.manually_categorized,
       m.notes,
       -- Perche' questa riga non e' nella spesa reale. Un movimento che manca
       -- da un totale deve poter dire da solo perche' manca, o si finisce a
       -- cercarlo con una query scritta a mano — che e' come sono stati
       -- verificati finora tutti i numeri di questo progetto.
       case
         when not acc.include_in_totals    then 'conto fuori dai totali'
         when m.excluded_from_analysis     then 'escluso dall''analisi'
         when m.is_transfer                then 'giroconto'
         when m.is_refund                  then 'rimborso'
         when m.amount > 0                 then 'entrata'
         when m.amount = 0                 then 'importo zero'
       end,
       count(*)          over (),
       (sum(m.amount_eur) over ())::text
from public.transactions m
join public.accounts acc on acc.id = m.account_id
left join public.merchants mer on mer.id = m.merchant_id
left join public.categories cat on cat.id = m.category_id
where (p_id is null or m.id = p_id)
  and (p_da is null or m.booking_date >= p_da)
  and (p_a  is null or m.booking_date <= p_a)
  and (p_ricerca is null or p_ricerca = '' or
       mer.canonical_name  ilike '%' || p_ricerca || '%' or
       m.raw_description   ilike '%' || p_ricerca || '%' or
       m.counterparty_raw  ilike '%' || p_ricerca || '%')
  and (p_categoria is null or m.category_id in (select rami.id from rami))
  and (p_merchant is null or m.merchant_id = p_merchant)
  and (p_discrezionalita is null
       or coalesce(m.discretion, 'non classificato') = p_discrezionalita)
  and (p_contesto is null
       or coalesce(m.context, 'non classificato') = p_contesto)
  -- Chiedendo un identificativo preciso, il filtro sul tipo non si applica:
  -- una scheda che risponde "non esiste" perche' quel movimento e' un
  -- giroconto sarebbe un vicolo cieco proprio nel caso in cui la si apre.
  and case
        when p_id is not null then true
        else case p_tipo
        when 'spesa' then
          m.amount < 0 and not m.is_transfer and not m.is_refund
          and not m.excluded_from_analysis and acc.include_in_totals
        when 'entrate' then
          m.amount > 0 and not m.is_transfer and not m.is_refund
          and not m.excluded_from_analysis and acc.include_in_totals
        when 'giroconti' then m.is_transfer
        else true
      end
      end
-- Per importo si ordina sul **modulo**: la domanda e' «qual e' il movimento
-- piu' grosso», e con le uscite negative un ordinamento sul segno metterebbe
-- in cima le entrate.
order by case when p_ordine = 'importo' then abs(m.amount_eur) end desc nulls last,
         m.booking_date desc,
         m.id
limit greatest(1, least(coalesce(p_limite, 50), 200))
offset greatest(0, coalesce(p_scarto, 0));
$$;

comment on function public.cerca_movimenti is
  'Movimenti filtrati, con conteggio e somma dell''intero insieme filtrato nelle ultime due colonne. `p_solo_questa` esclude le categorie discendenti.';

revoke all on function public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean) from public;
grant execute on function public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean) to authenticated;

notify pgrst, 'reload schema';
