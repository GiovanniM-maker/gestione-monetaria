-- 0035_le_variazioni.sql
--
-- «Rispetto al solito, com'e' andata?» — per classe, per categoria, per
-- esercente.
--
-- ---------------------------------------------------------------------------
-- Perche' un numero da solo non dice niente
-- ---------------------------------------------------------------------------
-- «Voluttuario: 488 €» non si sa se sia molto o poco. «Voluttuario: 488 €,
-- +31% sul solito» si sa. E' la differenza fra una schermata che si legge e una
-- che si guarda, ed e' cio' che il cruscotto nuovo deve avere accanto a ogni
-- riga.
--
-- Tutto in SQL, e non nel componente: una variazione percentuale e' una
-- divisione, cioe' aritmetica, e le regole di correttezza la vogliono qui.
-- Vale anche per il **giudizio** su quella variazione — su, giu' o stabile —
-- che altrimenti verrebbe scritto in tre schermate diverse con tre soglie
-- diverse.
--
-- ---------------------------------------------------------------------------
-- Le tre regole che non si negoziano
-- ---------------------------------------------------------------------------
-- **1. Il mese in corso si confronta sugli stessi giorni.** Il 13 del mese si
-- confrontano i primi 13 giorni di questo mese con i primi 13 di quelli prima.
-- Confrontare 13 giorni con 31 fa leggere un crollo dove non c'e' niente — e'
-- l'errore gia' corretto sul cruscotto in Fase 6-bis, e qui tornerebbe
-- moltiplicato per trenta righe.
--
-- **2. Il riferimento e' la mediana scelta**, `percentile_disc`: un mese
-- realmente osservato. Una media produce un valore che non e' mai stato speso
-- in nessun mese, e come termine di paragone serve un numero vero. E si chiama
-- «il mese tipico», mai «la media».
--
-- **3. Il segno e' sulla spesa, non sull'importo.** Le uscite sono negative,
-- quindi spendere 600 dove il tipico e' 500 da' una differenza *negativa* fra i
-- due numeri, ma e' un **aumento** di spesa. Si confrontano i valori assoluti,
-- e `+20%` significa «hai speso il venti per cento in piu'». Sbagliare qui
-- produce frecce rovesciate: il guasto piu' imbarazzante possibile su un
-- cruscotto.

-- ---------------------------------------------------------------------------
-- v_albero_categorie — l'albero, in un posto solo
-- ---------------------------------------------------------------------------
-- Le coppie antenato/discendente, ogni categoria discendente di se stessa. Il
-- roll-up era scritto dentro `v_monthly_by_category` e serviva anche qui: due
-- copie della stessa ricorsione divergono, e la divergenza si vedrebbe come due
-- numeri diversi per la stessa categoria in due schermate.
--
-- `v_monthly_by_category` viene ricreata sotto per usarla, con le stesse
-- identiche colonne.

create or replace view public.v_albero_categorie with (security_invoker = on) as
with recursive discesa as (
  select id as antenato, id as discendente, 0 as profondita
  from public.categories
  union all
  select d.antenato, c.id, d.profondita + 1
  from discesa d
  join public.categories c on c.parent_id = d.discendente
  -- `parent_id` e' modificabile, e dalla Fase 10 lo modifica anche il copilot:
  -- un ciclo creato per sbaglio farebbe girare la ricorsione all'infinito.
  where d.profondita < 10
)
select antenato, discendente, profondita from discesa;

comment on view public.v_albero_categorie is
  'Coppie antenato/discendente. Ogni categoria e'' discendente di se stessa: e'' cio'' che fa comparire nel roll-up la spesa registrata sul nodo.';

grant select on public.v_albero_categorie to authenticated;

create or replace view public.v_monthly_by_category with (security_invoker = on) as
with mensile as (
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
join public.v_albero_categorie a on a.discendente = m.category_id
join public.categories c on c.id = a.antenato
group by 1, 2, c.name, c.slug, c.parent_id, c.sort_order;

comment on view public.v_monthly_by_category is
  'Spesa mensile per categoria, con roll-up sui discendenti. `spesa_diretta` e'' la quota registrata sul nodo stesso.';

-- ---------------------------------------------------------------------------
-- Le tre funzioni
-- ---------------------------------------------------------------------------
-- Hanno la stessa forma di proposito: chi legge una sa leggere le altre, e chi
-- disegna una riga del cruscotto disegna le stesse colonne a ogni livello della
-- discesa.
--
-- `andamento` vale `su`, `giu`, `stabile` o `nuovo`. Sotto il 5% e' `stabile`:
-- una variazione piccola su una spesa che varia sempre non e' informazione, e
-- una freccia che si muove sempre smette di significare qualcosa. `nuovo` e'
-- diverso da `su`: una categoria che prima non esisteva non e' aumentata
-- dell'infinito per cento.

create or replace function public.variazioni_per_classe(
  p_mese date,
  p_mesi_confronto int default 6
)
returns table (
  discrezionalita   text,
  contesto          text,
  spesa             text,
  tipico            text,
  variazione_pct    text,
  andamento         text,
  movimenti         bigint,
  mesi_di_confronto bigint,
  giorni_confrontati int
)
language sql stable security invoker set search_path = ''
as $$
  with p as (
    select date_trunc('month', p_mese)::date as mese,
           -- Solo se il mese chiesto e' quello in corso: negli altri si
           -- confrontano mesi interi, che e' il caso normale.
           case when date_trunc('month', p_mese)::date = date_trunc('month', current_date)::date
                then extract(day from current_date)::int end as giorni,
           greatest(1, least(coalesce(p_mesi_confronto, 6), 24)) as quanti
  ),
  righe as (
    select date_trunc('month', e.booking_date)::date          as m,
           coalesce(e.discretion, 'non classificato')         as d,
           coalesce(e.context, 'non classificato')            as c,
           e.amount_eur
    from public.v_expenses e, p
    where e.amount_eur is not null
      and e.booking_date >= (p.mese - (p.quanti || ' months')::interval)::date
      and e.booking_date <  (p.mese + interval '1 month')::date
      and (p.giorni is null or extract(day from e.booking_date) <= p.giorni)
  ),
  mensile as (
    select m, d, c, sum(amount_eur) as spesa, count(*) as movimenti
    from righe group by 1, 2, 3
  ),
  ora as (select mensile.* from mensile, p where mensile.m = p.mese),
  prima as (
    select d, c,
           percentile_disc(0.5) within group (order by spesa) as tipico,
           count(*) as mesi
    from mensile, p where mensile.m < p.mese group by 1, 2
  ),
  unite as (
    select coalesce(o.d, x.d) as d, coalesce(o.c, x.c) as c,
           coalesce(o.spesa, 0) as spesa, coalesce(o.movimenti, 0) as movimenti,
           x.tipico, coalesce(x.mesi, 0) as mesi
    from ora o full join prima x on x.d = o.d and x.c = o.c
  )
  select u.d, u.c,
         u.spesa::text,
         u.tipico::text,
         case when u.tipico is null or u.tipico = 0 then null
              else round((abs(u.spesa) - abs(u.tipico)) / abs(u.tipico) * 100, 1)::text
         end,
         case
           when u.tipico is null or u.tipico = 0 then 'nuovo'
           when abs((abs(u.spesa) - abs(u.tipico)) / abs(u.tipico)) < 0.05 then 'stabile'
           when abs(u.spesa) > abs(u.tipico) then 'su'
           else 'giu'
         end,
         u.movimenti, u.mesi, (select giorni from p)
  from unite u
  order by u.spesa;
$$;

create or replace function public.variazioni_per_categoria(
  p_mese date,
  p_mesi_confronto int default 6
)
returns table (
  category_id       uuid,
  categoria         text,
  parent_id         uuid,
  spesa             text,
  tipico            text,
  variazione_pct    text,
  andamento         text,
  movimenti         bigint,
  mesi_di_confronto bigint,
  giorni_confrontati int
)
language sql stable security invoker set search_path = ''
as $$
  with p as (
    select date_trunc('month', p_mese)::date as mese,
           case when date_trunc('month', p_mese)::date = date_trunc('month', current_date)::date
                then extract(day from current_date)::int end as giorni,
           greatest(1, least(coalesce(p_mesi_confronto, 6), 24)) as quanti
  ),
  righe as (
    select date_trunc('month', e.booking_date)::date as m, e.category_id, e.amount_eur
    from public.v_expenses e, p
    where e.amount_eur is not null and e.category_id is not null
      and e.booking_date >= (p.mese - (p.quanti || ' months')::interval)::date
      and e.booking_date <  (p.mese + interval '1 month')::date
      and (p.giorni is null or extract(day from e.booking_date) <= p.giorni)
  ),
  -- Il roll-up passa dall'albero condiviso: la stessa ricorsione che usa
  -- `v_monthly_by_category`, non una seconda copia.
  mensile as (
    select r.m, a.antenato as cat, sum(r.amount_eur) as spesa, count(*) as movimenti
    from righe r
    join public.v_albero_categorie a on a.discendente = r.category_id
    group by 1, 2
  ),
  ora as (select mensile.* from mensile, p where mensile.m = p.mese),
  prima as (
    select cat,
           percentile_disc(0.5) within group (order by spesa) as tipico,
           count(*) as mesi
    from mensile, p where mensile.m < p.mese group by 1
  ),
  unite as (
    select coalesce(o.cat, x.cat) as cat,
           coalesce(o.spesa, 0) as spesa, coalesce(o.movimenti, 0) as movimenti,
           x.tipico, coalesce(x.mesi, 0) as mesi
    from ora o full join prima x on x.cat = o.cat
  )
  select c.id, c.name, c.parent_id,
         u.spesa::text,
         u.tipico::text,
         case when u.tipico is null or u.tipico = 0 then null
              else round((abs(u.spesa) - abs(u.tipico)) / abs(u.tipico) * 100, 1)::text
         end,
         case
           when u.tipico is null or u.tipico = 0 then 'nuovo'
           when abs((abs(u.spesa) - abs(u.tipico)) / abs(u.tipico)) < 0.05 then 'stabile'
           when abs(u.spesa) > abs(u.tipico) then 'su'
           else 'giu'
         end,
         u.movimenti, u.mesi, (select giorni from p)
  from unite u
  join public.categories c on c.id = u.cat
  order by u.spesa;
$$;

create or replace function public.variazioni_per_esercente(
  p_mese date,
  p_limite int default 20,
  p_mesi_confronto int default 6
)
returns table (
  merchant_id       uuid,
  esercente         text,
  spesa             text,
  tipico            text,
  variazione_pct    text,
  andamento         text,
  movimenti         bigint,
  mesi_di_confronto bigint,
  giorni_confrontati int
)
language sql stable security invoker set search_path = ''
as $$
  with p as (
    select date_trunc('month', p_mese)::date as mese,
           case when date_trunc('month', p_mese)::date = date_trunc('month', current_date)::date
                then extract(day from current_date)::int end as giorni,
           greatest(1, least(coalesce(p_mesi_confronto, 6), 24)) as quanti
  ),
  righe as (
    select date_trunc('month', e.booking_date)::date as m, e.merchant_id, e.amount_eur
    from public.v_expenses e, p
    where e.amount_eur is not null and e.merchant_id is not null
      and e.booking_date >= (p.mese - (p.quanti || ' months')::interval)::date
      and e.booking_date <  (p.mese + interval '1 month')::date
      and (p.giorni is null or extract(day from e.booking_date) <= p.giorni)
  ),
  mensile as (
    select m, merchant_id, sum(amount_eur) as spesa, count(*) as movimenti
    from righe group by 1, 2
  ),
  ora as (select mensile.* from mensile, p where mensile.m = p.mese),
  prima as (
    select merchant_id,
           percentile_disc(0.5) within group (order by spesa) as tipico,
           count(*) as mesi
    from mensile, p where mensile.m < p.mese group by 1
  ),
  unite as (
    -- Qui la join e' interna e non piena, a differenza delle altre due: un
    -- esercente che questo mese non compare non e' una riga interessante fra
    -- centosessanta, mentre una classe o una categoria sparita lo e'.
    select o.merchant_id, o.spesa, o.movimenti, x.tipico, coalesce(x.mesi, 0) as mesi
    from ora o left join prima x on x.merchant_id = o.merchant_id
  )
  select m.id, m.canonical_name,
         u.spesa::text,
         u.tipico::text,
         case when u.tipico is null or u.tipico = 0 then null
              else round((abs(u.spesa) - abs(u.tipico)) / abs(u.tipico) * 100, 1)::text
         end,
         case
           when u.tipico is null or u.tipico = 0 then 'nuovo'
           when abs((abs(u.spesa) - abs(u.tipico)) / abs(u.tipico)) < 0.05 then 'stabile'
           when abs(u.spesa) > abs(u.tipico) then 'su'
           else 'giu'
         end,
         u.movimenti, u.mesi, (select giorni from p)
  from unite u
  join public.merchants m on m.id = u.merchant_id
  order by u.spesa
  limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

comment on function public.variazioni_per_classe(date, int) is
  'Spesa per classe con la variazione sul mese tipico. Sul mese in corso confronta gli stessi giorni.';
comment on function public.variazioni_per_categoria(date, int) is
  'Spesa per categoria con roll-up e variazione sul mese tipico.';
comment on function public.variazioni_per_esercente(date, int, int) is
  'I maggiori esercenti del mese con la variazione sul loro mese tipico.';

revoke all on function public.variazioni_per_classe(date, int) from public;
revoke all on function public.variazioni_per_categoria(date, int) from public;
revoke all on function public.variazioni_per_esercente(date, int, int) from public;
grant execute on function public.variazioni_per_classe(date, int) to authenticated;
grant execute on function public.variazioni_per_categoria(date, int) to authenticated;
grant execute on function public.variazioni_per_esercente(date, int, int) to authenticated;

notify pgrst, 'reload schema';
