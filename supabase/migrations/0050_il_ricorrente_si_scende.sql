-- 0050_il_ricorrente_si_scende.sql
--
-- Le tessere Abbonamenti e Abitudini diventano pagine, e le pagine usano la
-- stessa gerarchia della home: classe → categorie → voci → transazioni.
--
-- ---------------------------------------------------------------------------
-- Cosa si somma qui, e perche' non e' la spesa di un mese
-- ---------------------------------------------------------------------------
-- Il numero delle tessere e' un TASSO — costo mensile calcolato su tutto lo
-- storico — non la spesa di un mese. La discesa deve sommare la stessa cosa,
-- o il totale in cima e i rami sotto direbbero due numeri diversi senza che
-- nessuno dei due sia sbagliato. Quindi qui si ripartisce `costo_mensile` di
-- `v_subscriptions`, la stessa colonna della metrica, filtrata su
-- `nella_metrica` come la metrica: la somma dei rami DEVE tornare col totale
-- della tessera.
--
-- Il fondo della discesa non sono i movimenti di un mese ma le VOCI (gli
-- esercenti ricorrenti): una ricorrenza e' un esercente, e le sue transazioni
-- sono esattamente gli addebiti dell'abbonamento — la lista si apre da
-- `/movimenti?esercente=…`, che esiste gia'.
--
-- ---------------------------------------------------------------------------
-- Il roll-up e' quello di `ripartizione_dove`, sulla tassonomia degli esercenti
-- ---------------------------------------------------------------------------
-- Una ricorrenza sta nella categoria del suo esercente (`merchants.category_id`
-- via `v_subscriptions.merchant_id`): stessa CTE ricorsiva, stesso limite di
-- profondita', stessa riga «Senza categoria» per gli esercenti che una
-- categoria non ce l'hanno. Due definizioni di «ramo» divergerebbero, ed e' la
-- ragione per cui la forma restituita e' identica a `ripartizione_dove`: la
-- fisarmonica non deve sapere quale delle due sta disegnando.

create or replace function public.ripartizione_ricorrente(
  p_tipo      text,
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
  select id as antenato, id as discendente, 0 as profondita
  from public.categories
  union all
  select a.antenato, c.id, a.profondita + 1
  from albero a
  join public.categories c on c.parent_id = a.discendente
  where a.profondita < 10
),
-- Le voci del tipo chiesto, gia' filtrate per classe e contesto. Solo
-- `nella_metrica`: e' il criterio della metrica, e la somma dei rami deve
-- tornare col numero della tessera.
righe as (
  select m.category_id,
         sum(s.costo_mensile) as spesa,
         count(*)             as voci
  from public.v_subscriptions s
  join public.merchants m on m.id = s.merchant_id
  where s.nella_metrica
    and s.tipo = p_tipo
    and (p_classe is null
         or coalesce(s.discrezionalita, 'non classificato') = p_classe)
    and (p_contesto is null
         or coalesce(s.contesto, 'non classificato') = p_contesto)
  group by 1
),
nodi as (
  select c.id,
         c.name,
         c.parent_id,
         c.sort_order,
         sum(r.spesa) as spesa,
         sum(r.voci)  as voci,
         coalesce(sum(r.spesa) filter (where r.category_id = c.id), 0) as spesa_diretta,
         coalesce(sum(r.voci)  filter (where r.category_id = c.id), 0) as voci_dirette
  from righe r
  join albero a on a.discendente = r.category_id
  join public.categories c on c.id = a.antenato
  group by 1, 2, 3, 4
),
insieme as (
  select n.id          as category_id,
         n.name        as nome,
         n.spesa,
         n.voci,
         n.spesa_diretta,
         n.voci_dirette,
         (select count(*) from nodi f where f.parent_id = n.id) as figli
  from nodi n
  where case
          when p_categoria is null
            then n.parent_id is null
              or not exists (select 1 from nodi p where p.id = n.parent_id)
          else n.parent_id = p_categoria
        end

  union all

  select null::uuid,
         'Senza categoria',
         r.spesa,
         r.voci,
         r.spesa,
         r.voci,
         0::bigint
  from righe r
  where p_categoria is null and r.category_id is null
)
-- L'ordinamento e' sul numero, non sul suo testo: i costi sono negativi e il
-- piu' pesante viene prima. Vedi la correzione di `ripartizione_dove` sotto.
select i.category_id,
       i.nome,
       i.spesa::text,
       i.voci,
       i.spesa_diretta::text,
       i.voci_dirette,
       i.figli
from insieme i
order by i.spesa asc;
$$;

comment on function public.ripartizione_ricorrente(text, text, text, uuid) is
  'Di cosa e'' fatto il costo ricorrente di un tipo (abbonamento/abitudine): le categorie sotto un nodo, con roll-up del costo mensile delle sole voci nella metrica. Stessa forma di ripartizione_dove.';

revoke all on function public.ripartizione_ricorrente(text, text, text, uuid) from public;
grant execute on function public.ripartizione_ricorrente(text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- voci_ricorrenti — il fondo della discesa del ricorrente
-- ---------------------------------------------------------------------------
-- Sotto una categoria foglia non ci sono movimenti ma VOCI: Netflix, Deliveroo.
-- Ogni voce porta il suo costo mensile e il suo esercente, e da li' si apre la
-- lista delle transazioni (`/movimenti?esercente=…`), che sono i suoi addebiti.
--
-- `p_solo_questa` esiste per la riga «direttamente qui», per la stessa ragione
-- di `cerca_movimenti`: un nodo con figlie e voci proprie deve poter mostrare
-- le sole sue, o ogni euro comparirebbe due volte.
--
-- `p_categoria` nullo significa «senza categoria», non «tutte»: la chiamata
-- arriva sempre da una riga precisa della fisarmonica, e leggere l'assenza
-- come «qualunque» aprirebbe l'intero tipo sotto la riga sbagliata.

create or replace function public.voci_ricorrenti(
  p_tipo        text,
  p_classe      text default null,
  p_contesto    text default null,
  p_categoria   uuid default null,
  p_solo_questa boolean default false
)
returns table (
  merchant_id   uuid,
  esercente     text,
  costo_mensile text,
  occorrenze    integer,
  cadenza       text,
  stato         text
)
language sql
stable
security invoker
set search_path = ''
as $$
with recursive rami as (
  select p_categoria as id, 0 as profondita
  where p_categoria is not null
  union all
  select c.id, r.profondita + 1
  from rami r
  join public.categories c on c.parent_id = r.id
  where r.profondita < 10 and not coalesce(p_solo_questa, false)
)
select s.merchant_id,
       s.esercente,
       s.costo_mensile::text,
       s.occurrences,
       s.cadence,
       s.status
from public.v_subscriptions s
join public.merchants m on m.id = s.merchant_id
where s.nella_metrica
  and s.tipo = p_tipo
  and (p_classe is null
       or coalesce(s.discrezionalita, 'non classificato') = p_classe)
  and (p_contesto is null
       or coalesce(s.contesto, 'non classificato') = p_contesto)
  and case
        when p_categoria is null then m.category_id is null
        else m.category_id in (select rami.id from rami)
      end
order by s.costo_mensile asc;
$$;

comment on function public.voci_ricorrenti(text, text, text, uuid, boolean) is
  'Le voci ricorrenti (esercenti) sotto un nodo della discesa del ricorrente. `p_categoria` nullo = senza categoria; `p_solo_questa` esclude le discendenti.';

revoke all on function public.voci_ricorrenti(text, text, text, uuid, boolean) from public;
grant execute on function public.voci_ricorrenti(text, text, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- ripartizione_dove — l'ordinamento era sul testo, non sul numero
-- ---------------------------------------------------------------------------
-- `order by 3` ordinava la colonna `spesa` DOPO il cast a testo: «−21,96»
-- veniva prima di «−469,90» perche' '2' < '4'. Nessun numero sbagliato — solo
-- l'ordine, che pero' e' l'informazione con cui si legge un elenco: il ramo
-- piu' pesante deve stare in cima. Stessa firma, quindi `create or replace` e
-- nessun sovraccarico.

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
  select id as antenato, id as discendente, 0 as profondita
  from public.categories
  union all
  select a.antenato, c.id, a.profondita + 1
  from albero a
  join public.categories c on c.parent_id = a.discendente
  where a.profondita < 10
),
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
),
insieme as (
  select n.id          as category_id,
         n.name        as nome,
         n.spesa,
         n.movimenti,
         n.spesa_diretta,
         n.movimenti_diretti,
         (select count(*) from nodi f where f.parent_id = n.id) as figli
  from nodi n
  where case
          when p_categoria is null
            then n.parent_id is null
              or not exists (select 1 from nodi p where p.id = n.parent_id)
          else n.parent_id = p_categoria
        end

  union all

  select null::uuid,
         'Senza categoria',
         r.spesa,
         r.movimenti,
         r.spesa,
         r.movimenti,
         0::bigint
  from righe r
  where p_categoria is null and r.category_id is null
)
select i.category_id,
       i.nome,
       i.spesa::text,
       i.movimenti,
       i.spesa_diretta::text,
       i.movimenti_diretti,
       i.figli
from insieme i
order by i.spesa asc;
$$;

comment on function public.ripartizione_dove(date, text, text, uuid) is
  'Di cosa e'' fatto un ramo: le categorie sotto un nodo (o le radici), con roll-up, filtrate per classe e contesto. `figli` = 0 significa che sotto ci sono i movimenti. Ordinata dal ramo piu'' pesante.';

revoke all on function public.ripartizione_dove(date, text, text, uuid) from public;
grant execute on function public.ripartizione_dove(date, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
