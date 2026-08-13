-- 0028_prezzo_tipico_osservato.sql
--
-- Il prezzo tipico di una ricorrenza e' un prezzo che e' stato pagato.
--
-- ---------------------------------------------------------------------------
-- Il difetto
-- ---------------------------------------------------------------------------
-- `typical_amount` usava `percentile_cont`, che su un numero **pari** di
-- occorrenze non sceglie: **interpola** fra i due valori centrali. Con un
-- canone costante non cambia niente. Con un canone che e' cambiato di prezzo —
-- quattro addebiti da 6,99 e quattro da 8,99 — restituisce **7,99**, che e' un
-- prezzo che non e' mai stato pagato in nessun mese.
--
-- Da li' quel numero va in due posti che contano:
--
-- 1. e' il **canone mostrato** su `/abbonamenti`, e la Fase 5 aveva gia'
--    stabilito che «Netflix deve dire 6,99: un numero che non si riconosce non
--    si crede». 7,99 e' esattamente un numero che non si riconosce;
-- 2. e' il termine di paragone dell'avviso di **aumento di prezzo** della Fase
--    8, che confronta l'ultimo importo pagato con il prezzo tipico. Un
--    riferimento inventato fa scattare l'avviso quando non serve, o tacere
--    quando servirebbe.
--
-- E' la stessa famiglia di difetto gia' corretta in Fase 6-bis sul confronto
-- fra mesi, e la ragione e' scritta li': «su un numero pari di mesi la media
-- produrrebbe un valore che non e' mai stato speso in nessun mese, e come
-- riferimento serve un numero vero». Vale identica per un canone.
--
-- ---------------------------------------------------------------------------
-- Quale dei due valori centrali sceglie, e perche' va bene
-- ---------------------------------------------------------------------------
-- Su un numero pari, `percentile_disc(0.5)` restituisce il piu' basso dei due
-- centrali. Gli importi sono negativi e l'ordinamento e' crescente, quindi
-- prende **la spesa piu' alta** delle due. Nel caso 6,99/8,99 restituisce 8,99.
--
-- Non e' un difetto di questo cambiamento: e' che nessuna mediana sa dire
-- «quanto costa adesso». A quella domanda risponde `expected_amount`, che e'
-- l'ultimo importo pagato, ed e' proprio il motivo per cui in Fase 5 sono due
-- colonne invece di una. `typical_amount` risponde a «quanto costa di solito»,
-- e per quella domanda un valore realmente osservato batte sempre uno medio.
--
-- ---------------------------------------------------------------------------
-- Perche' l'intervallo fra due addebiti resta su `percentile_cont`
-- ---------------------------------------------------------------------------
-- `giorni_tipici` non e' un valore che qualcuno abbia pagato: e' la distanza
-- fra due osservazioni, e serve a due cose — collocare la cadenza in una
-- finestra (`between 24 and 38`, dove 30 e 30,5 finiscono nello stesso posto) e
-- stimare quando arrivera' il prossimo addebito. Per una stima, interpolare e'
-- meglio che scegliere: 30,5 e' una previsione piu' accurata di 30.
--
-- La regola non e' «mai interpolare»: e' «un numero mostrato come un importo
-- dev'essere un importo che e' esistito».
--
-- ---------------------------------------------------------------------------
-- Cosa si aspetta che si muova
-- ---------------------------------------------------------------------------
-- Poco, e in un posto solo. Il ramo del canone di `costo_mensile` richiede
-- `amount_stability >= 0.95`, cioe' importi che variano di pochissimo: li' i
-- due percentili distano al massimo qualche centesimo. Tutto il resto usa
-- `total_amount / covered_days`, che questa migration non tocca.
--
-- Quello che cambia davvero e' il **prezzo tipico mostrato** sulle righe con un
-- numero pari di addebiti a importo variabile — che e' il punto — e con esso
-- puo' comparire qualche avviso di aumento di prezzo nuovo al prossimo giro.
-- Non e' un difetto: e' che il confronto ora parte da un prezzo vero.

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
           -- L'intervallo tipico e' una **stima**: `percentile_cont`, che su un
           -- numero pari interpola. 30,5 giorni prevede il prossimo addebito
           -- meglio di 30, e nessuno legge questo numero come un importo.
           percentile_cont(0.5) within group (order by giorni)
             filter (where giorni is not null)                    as giorni_tipici,
           -- L'importo tipico e' un **prezzo**: `percentile_disc`, che sceglie
           -- fra i valori realmente pagati invece di inventarne uno in mezzo.
           -- Con quattro addebiti da 6,99 e quattro da 8,99 la media dei due
           -- centrali darebbe 7,99, che non e' mai stato il prezzo di niente.
           percentile_disc(0.5) within group (order by amount_eur) as importo_tipico,
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
  'Ricalcola subscriptions dai movimenti, in euro. Il prezzo tipico e'' scelto fra quelli pagati, mai interpolato. Rieseguibile. Non tocca mai usage_verdict, notes e lo stato cancelled.';

notify pgrst, 'reload schema';
