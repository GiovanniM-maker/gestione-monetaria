-- 0027_ricorrenze_in_euro.sql
--
-- Il rilevatore della Fase 5 somma `amount_eur`, come tutto il resto.
--
-- ---------------------------------------------------------------------------
-- Cos'era rimasto disallineato, e perche' si sistema adesso
-- ---------------------------------------------------------------------------
-- La Fase 6 ha stabilito che ogni aggregato usa `amount_eur`: la valuta di
-- riferimento e' l'euro, e una somma che mescola valute e' sbagliata comunque
-- la si guardi. Il rilevatore delle ricorrenze — scritto prima, in Fase 5 — e'
-- rimasto sull'`amount` grezzo, ed e' l'ultimo posto dell'applicazione che
-- somma qualcosa in una valuta che non ha dichiarato.
--
-- **Oggi i due numeri coincidono**, perche' l'unico conto con
-- `include_in_totals` e' in euro. E' esattamente per questo che si cambia
-- adesso e non il giorno che servira': il giorno in cui si collega Intesa, o un
-- pocket in valuta entra nei totali, sommare `amount` produrrebbe un costo
-- ricorrente **plausibile e falso**, senza nessun errore e senza che niente lo
-- segnali. Un numero sbagliato che non si vede e' il guasto peggiore possibile
-- per la metrica che questa applicazione esiste per produrre.
--
-- Il rilevamento non si e' voluto toccare insieme ad altro proprio per poter
-- fare questa verifica: i numeri di chiusura della Fase 5 — 85 ricorrenze
-- rilevate, 43 nella metrica, −425,96 €/mese di abbonamenti e −1.610,17 €/mese
-- di abitudini — devono restare **identici al centesimo**. Se si spostano, non
-- e' questa migration ad aver corretto qualcosa: e' che c'era un movimento non
-- convertito di cui nessuno sapeva niente.
--
-- ---------------------------------------------------------------------------
-- Un movimento senza cambio esce dalla serie, non solo dalla somma
-- ---------------------------------------------------------------------------
-- Dove `amount_eur` e' nullo il movimento non e' sommabile. Le viste mensili lo
-- tengono nel conteggio e lo escludono dal totale, contandolo a parte in
-- `senza_cambio`. Qui non si puo' fare lo stesso, e la ragione e' che il
-- risultato non e' una somma ma un **tasso**: `totale / giorni_coperti`.
--
-- Tenere l'occorrenza per la cadenza ed escluderla dall'importo allungherebbe
-- il periodo osservato senza aggiungere la spesa che ci e' avvenuta dentro, e
-- il costo mensile risulterebbe piu' basso del vero. Toglierla del tutto
-- accorcia anche il periodo, e la proporzione resta onesta.
--
-- Non e' gratis e non deve essere silenzioso: quante occorrenze siano state
-- lasciate fuori si legge da `v_ricorrenze_senza_cambio`, e il resoconto del
-- rilevamento lo stampa. Un movimento assente da un totale deve lasciare una
-- traccia visibile — la stessa regola di `v_monthly_totals.senza_cambio`.

create or replace function public.rileva_abbonamenti(minimo_occorrenze integer default 3)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  scritte integer;
begin
  create temporary table candidati on commit drop as
  with movimenti as (
    select merchant_id, booking_date, amount_eur
    from public.v_expenses
    where merchant_id is not null
      -- Senza tasso di cambio il movimento non e' confrontabile con gli altri:
      -- esce dalla serie, e viene contato in `v_ricorrenze_senza_cambio`.
      and amount_eur is not null
      -- Un movimento a zero e' una preautorizzazione rilasciata, non un
      -- pagamento: falserebbe sia la cadenza sia l'importo.
      and amount_eur <> 0
  ),
  con_intervallo as (
    select merchant_id, booking_date, amount_eur,
           booking_date - lag(booking_date) over (
             partition by merchant_id order by booking_date
           ) as giorni
    from movimenti
  ),
  statistiche as (
    select merchant_id,
           count(*)          as occorrenze,
           min(booking_date) as prima,
           max(booking_date) as ultima,
           count(distinct date_trunc('month', booking_date)) as mesi_attivi,
           sum(amount_eur)   as totale,
           -- Mediana e non media: un pagamento in ritardo non deve spostare la
           -- cadenza, e un mese con un extra non deve diventare il prezzo.
           percentile_cont(0.5) within group (order by giorni)
             filter (where giorni is not null)                    as giorni_tipici,
           percentile_cont(0.5) within group (order by amount_eur) as importo_tipico,
           stddev_pop(giorni) filter (where giorni is not null)   as scarto_giorni,
           avg(abs(amount_eur))        as importo_medio,
           stddev_pop(abs(amount_eur)) as scarto_importo
    from con_intervallo
    group by merchant_id
  ),
  ultimo as (
    select distinct on (merchant_id) merchant_id, amount_eur, booking_date
    from movimenti
    order by merchant_id, booking_date desc
  )
  select s.merchant_id,
         -- Finestre larghe di proposito: un addebito mensile cade fra il 28 e
         -- il 31, e uno annuale slitta di giorni fra un anno e l'altro.
         case
           when s.giorni_tipici between   5 and  10 then 'weekly'
           when s.giorni_tipici between  24 and  38 then 'monthly'
           when s.giorni_tipici between  80 and 100 then 'quarterly'
           when s.giorni_tipici between 330 and 400 then 'yearly'
           else 'irregular'
         end                                                    as cadence,
         case
           when s.giorni_tipici between   5 and  10 then 7
           when s.giorni_tipici between  24 and  38 then 30.44
           when s.giorni_tipici between  80 and 100 then 91.31
           when s.giorni_tipici between 330 and 400 then 365.25
           else s.giorni_tipici
         end                                                    as cadence_days,
         u.amount_eur                                           as expected_amount,
         s.importo_tipico, s.totale,
         -- Ogni addebito "copre" una cadenza: il periodo osservato va dal
         -- primo all'ultimo, piu' la cadenza che l'ultimo copre. Su una serie
         -- regolare fa esattamente occorrenze x cadenza, e il costo mensile
         -- torna al canone. Su una serie a grappoli usa il tempo davvero
         -- trascorso, che e' l'unica cosa onesta da usare quando la cadenza
         -- mediana non descrive la serie.
         (s.ultima - s.prima)
           + case
               when s.giorni_tipici between   5 and  10 then 7
               when s.giorni_tipici between  24 and  38 then 30.44
               when s.giorni_tipici between  80 and 100 then 91.31
               when s.giorni_tipici between 330 and 400 then 365.25
               else coalesce(s.giorni_tipici, 0)
             end                                                as giorni_coperti,
         s.prima, s.ultima, s.occorrenze, s.mesi_attivi,
         -- Due coefficienti di variazione, **separati**. Nessuno dei due
         -- esclude niente: dicono che tipo di ricorrenza e', non se lo e'.
         -- Il cast a `numeric` non e' cosmetico: `stddev_pop` restituisce
         -- `double precision`, e `round` a due argomenti esiste solo su
         -- `numeric`.
         round(least(1, greatest(0, 1 - coalesce(s.scarto_giorni, 0)
                                        / nullif(s.giorni_tipici, 0)))::numeric, 2)
                                                                as regolarita_tempo,
         round(least(1, greatest(0, 1 - coalesce(s.scarto_importo, 0)
                                        / nullif(s.importo_medio, 0)))::numeric, 2)
                                                                as stabilita_importo
  from statistiche s
  join ultimo u on u.merchant_id = s.merchant_id
  where s.occorrenze >= minimo_occorrenze;

  insert into public.subscriptions (
    merchant_id, cadence, cadence_days, expected_amount, typical_amount,
    total_amount, covered_days, first_seen, last_seen, next_expected,
    occurrences, active_months, confidence, amount_stability, status
  )
  select c.merchant_id, c.cadence, c.cadence_days, c.expected_amount,
         c.importo_tipico, c.totale, c.giorni_coperti,
         c.prima, c.ultima,
         case when c.cadence = 'irregular' then null
              else (c.ultima + (c.cadence_days || ' days')::interval)::date end,
         c.occorrenze, c.mesi_attivi,
         coalesce(c.regolarita_tempo, 0), coalesce(c.stabilita_importo, 0),
         -- Mezza cadenza di tolleranza oltre la scadenza attesa: un addebito
         -- che tarda di qualche giorno non deve far sembrare cancellato un
         -- abbonamento ancora vivo. Senza cadenza si usano due mesi, che e'
         -- la stessa idea applicata al caso in cui la cadenza non c'e'.
         case
           when c.cadence = 'irregular'
             then case when c.ultima >= current_date - 61 then 'active' else 'lapsed' end
           when c.ultima >= current_date - (c.cadence_days * 1.5)::int then 'active'
           else 'lapsed'
         end
  from candidati c
  on conflict (merchant_id) do update set
    cadence          = excluded.cadence,
    cadence_days     = excluded.cadence_days,
    expected_amount  = excluded.expected_amount,
    typical_amount   = excluded.typical_amount,
    total_amount     = excluded.total_amount,
    covered_days     = excluded.covered_days,
    first_seen       = excluded.first_seen,
    last_seen        = excluded.last_seen,
    next_expected    = excluded.next_expected,
    occurrences      = excluded.occurrences,
    active_months    = excluded.active_months,
    confidence       = excluded.confidence,
    amount_stability = excluded.amount_stability,
    -- `cancelled` e' una dichiarazione dell'utente — "l'ho disdetto" — e non
    -- si sovrascrive con cio' che dicono i movimenti.
    status           = case when public.subscriptions.status = 'cancelled'
                            then 'cancelled' else excluded.status end;
  -- usage_verdict, verdict_updated_at e notes non compaiono: sono dell'utente.

  get diagnostics scritte = row_count;

  update public.subscriptions s
     set status = 'lapsed'
   where s.status = 'active'
     and not exists (select 1 from candidati c where c.merchant_id = s.merchant_id);

  return scritte;
end;
$$;

comment on function public.rileva_abbonamenti(integer) is
  'Ricalcola subscriptions dai movimenti, in euro. Rieseguibile. Non tocca mai usage_verdict, notes e lo stato cancelled.';

-- ---------------------------------------------------------------------------
-- v_ricorrenze_senza_cambio
-- ---------------------------------------------------------------------------
-- Quanto il rilevamento non ha potuto vedere. Oggi e' zero, e va guardata
-- proprio per questo: il giorno in cui smette di essere zero, il costo
-- ricorrente comincia a mancare di qualcosa, e senza questa riga se ne
-- accorgerebbe nessuno.

create or replace view public.v_ricorrenze_senza_cambio with (security_invoker = on) as
select count(*)                                    as movimenti,
       count(distinct merchant_id)                 as esercenti,
       min(booking_date)                           as primo,
       max(booking_date)                           as ultimo
from public.v_expenses
where merchant_id is not null
  and amount_eur is null;

comment on view public.v_ricorrenze_senza_cambio is
  'Movimenti con un esercente ma senza importo in euro: restano fuori dal rilevamento delle ricorrenze.';

grant select on public.v_ricorrenze_senza_cambio to authenticated;

notify pgrst, 'reload schema';
