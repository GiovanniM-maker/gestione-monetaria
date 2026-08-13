-- 0036_la_finestra_si_dichiara.sql
--
-- Le tre funzioni della 0035, con la finestra di confronto passata da fuori.
--
-- ---------------------------------------------------------------------------
-- Il difetto, trovato collegandole alla schermata
-- ---------------------------------------------------------------------------
-- Nella 0035 la finestra la decideva `current_date`: se il mese chiesto e'
-- quello in corso, si confrontano i primi «oggi» giorni. Sembrava giusto, ed e'
-- sbagliato per un motivo che si vede solo sul cruscotto vero.
--
-- Il numerone in cima usa `spesa_nei_primi_giorni(p_giorni)`, e quel `p_giorni`
-- e' **l'ultimo giorno con dei dati**, non oggi. Sono due cose diverse: se e'
-- il 13 e l'ultimo movimento e' dell'11, il totale in cima confronta undici
-- giorni contro undici, e le frecce qui sotto ne confronterebbero tredici
-- contro tredici. Il mese in corso non ha spesa nei giorni 12 e 13 — non e'
-- ancora arrivata — ma i mesi di riferimento sì: ogni freccia punterebbe in
-- basso, sempre, per il solo fatto che i dati arrivano con un giorno di
-- ritardo.
--
-- E' esattamente l'errore che la 0035 dichiarava di evitare, rientrato dalla
-- porta di servizio: **due misure sulla stessa schermata calcolate su due
-- finestre diverse**.
--
-- Quindi la finestra si dichiara. `p_giorni` nullo conserva il comportamento
-- della 0035 — chi non ha un'opinione ottiene ancora quella ragionevole — ma
-- chi sa fino a dove arrivano i dati lo dice, e tutte le cifre della schermata
-- parlano della stessa finestra.
--
-- ---------------------------------------------------------------------------
-- Perche' `drop` e non `create or replace`
-- ---------------------------------------------------------------------------
-- Aggiungere un parametro cambia la firma, e `create or replace` creerebbe una
-- **seconda** funzione accanto alla prima invece di sostituirla. PostgREST
-- risolve le chiamate per nome degli argomenti: con due candidate compatibili
-- risponde `PGRST203`, cioe' la schermata smette di funzionare senza che nel
-- database sia rotto niente.
--
-- I `drop` elencano entrambe le forme, cosi' la migration si applica allo
-- stesso modo che la 0035 sia gia' passata o no.

drop function if exists public.variazioni_per_classe(date, int);
drop function if exists public.variazioni_per_classe(date, int, int);
drop function if exists public.variazioni_per_categoria(date, int);
drop function if exists public.variazioni_per_categoria(date, int, int);
drop function if exists public.variazioni_per_esercente(date, int, int);
drop function if exists public.variazioni_per_esercente(date, int, int, int);
drop function if exists public.variazioni_per_esercente(date, int, int, int, uuid);

-- ---------------------------------------------------------------------------
-- Le tre regole restano quelle della 0035
-- ---------------------------------------------------------------------------
-- 1. finestra omogenea — ora dichiarata invece che dedotta;
-- 2. il riferimento e' la mediana **scelta**, `percentile_disc`: un mese
--    realmente osservato, e si chiama «il mese tipico», mai «la media»;
-- 3. il segno e' sulla **spesa**: le uscite sono negative, quindi si
--    confrontano i valori assoluti e `+20%` vuol dire «hai speso di piu'».

create function public.variazioni_per_classe(
  p_mese date,
  p_mesi_confronto int default 6,
  p_giorni int default null
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
           case
             -- Chi passa un numero sa fino a dove arrivano i suoi dati, e vale
             -- anche su un mese chiuso: puo' voler confrontare i primi dieci
             -- giorni di due mesi finiti.
             when p_giorni is not null and p_giorni > 0 then least(p_giorni, 31)
             -- Senza indicazioni: mesi interi, tranne quello in corso.
             when date_trunc('month', p_mese)::date = date_trunc('month', current_date)::date
               then extract(day from current_date)::int
           end as giorni,
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
    -- Piena e non interna: una classe sparita e' informazione, e compare a
    -- zero con -100%.
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

create function public.variazioni_per_categoria(
  p_mese date,
  p_mesi_confronto int default 6,
  p_giorni int default null
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
           case
             when p_giorni is not null and p_giorni > 0 then least(p_giorni, 31)
             when date_trunc('month', p_mese)::date = date_trunc('month', current_date)::date
               then extract(day from current_date)::int
           end as giorni,
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

-- `p_categoria` esiste perche' la discesa deve funzionare allo stesso modo a
-- ogni livello: sulla scheda di una categoria gli esercenti sono quelli di quel
-- ramo, e senza il filtro la loro freccia andrebbe cercata fra i primi cento
-- del mese intero — dove i piu' piccoli non ci sono. Una freccia che compare su
-- alcune righe e non su altre, senza una ragione visibile, e' peggio di nessuna
-- freccia. Il filtro segue il roll-up: comprende le sottocategorie.
create function public.variazioni_per_esercente(
  p_mese date,
  p_limite int default 20,
  p_mesi_confronto int default 6,
  p_giorni int default null,
  p_categoria uuid default null
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
           case
             when p_giorni is not null and p_giorni > 0 then least(p_giorni, 31)
             when date_trunc('month', p_mese)::date = date_trunc('month', current_date)::date
               then extract(day from current_date)::int
           end as giorni,
           greatest(1, least(coalesce(p_mesi_confronto, 6), 24)) as quanti
  ),
  righe as (
    select date_trunc('month', e.booking_date)::date as m, e.merchant_id, e.amount_eur
    from public.v_expenses e, p
    where e.amount_eur is not null and e.merchant_id is not null
      and e.booking_date >= (p.mese - (p.quanti || ' months')::interval)::date
      and e.booking_date <  (p.mese + interval '1 month')::date
      and (p.giorni is null or extract(day from e.booking_date) <= p.giorni)
      and (p_categoria is null or e.category_id in (
            select a.discendente from public.v_albero_categorie a
            where a.antenato = p_categoria))
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
    -- Qui la join e' esterna da sinistra e non piena, a differenza delle altre
    -- due: un esercente che questo mese non compare non e' una riga
    -- interessante fra centosessanta, mentre una classe o una categoria
    -- sparita lo e'.
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

comment on function public.variazioni_per_classe(date, int, int) is
  'Spesa per classe con la variazione sul mese tipico. `p_giorni` dichiara la finestra: nullo = mesi interi, tranne quello in corso.';
comment on function public.variazioni_per_categoria(date, int, int) is
  'Spesa per categoria con roll-up e variazione sul mese tipico, sulla finestra dichiarata da `p_giorni`.';
comment on function public.variazioni_per_esercente(date, int, int, int, uuid) is
  'I maggiori esercenti del mese con la variazione sul loro mese tipico, sulla finestra dichiarata da `p_giorni`.';

revoke all on function public.variazioni_per_classe(date, int, int) from public;
revoke all on function public.variazioni_per_categoria(date, int, int) from public;
revoke all on function public.variazioni_per_esercente(date, int, int, int, uuid) from public;
grant execute on function public.variazioni_per_classe(date, int, int) to authenticated;
grant execute on function public.variazioni_per_categoria(date, int, int) to authenticated;
grant execute on function public.variazioni_per_esercente(date, int, int, int, uuid) to authenticated;

notify pgrst, 'reload schema';
