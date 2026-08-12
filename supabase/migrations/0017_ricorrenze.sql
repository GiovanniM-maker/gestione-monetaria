-- 0017_ricorrenze.sql
--
-- Correzione della 0016, decisa guardando i dati veri.
--
-- ---------------------------------------------------------------------------
-- Cosa era sbagliato
-- ---------------------------------------------------------------------------
-- **Una confidenza con due domande dentro.** `confidence` moltiplicava la
-- regolarita' nel tempo per la stabilita' dell'importo, e la soglia 0,5 le
-- richiedeva entrambe. Ma «si ripete a scadenza fissa?» e «costa sempre
-- uguale?» sono domande diverse: un servizio a consumo — Anthropic, Google
-- Cloud, OpenRouter, Byteplus — passa la prima e fallisce la seconda, e
-- veniva escluso. Il risultato misurava i **canoni fissi**, non il **costo
-- ricorrente**. Anthropic da solo valeva la meta' della metrica, e restava
-- fuori.
--
-- Ora le due grandezze sono due colonne separate (`confidence` = regolarita'
-- nel tempo, `amount_stability` = stabilita' dell'importo), nessuna delle due
-- filtra piu' niente, ed entrambe restano visibili come indicatori di qualita'.
--
-- **Un costo mensile estrapolato dall'intervallo mediano.** Per un esercente
-- senza cadenza la 0016 calcolava `importo x 30,44 / intervallo_mediano`: un
-- bar frequentato a giorni alterni diventava 1.500 EUR/mese, e la somma delle
-- escluse arrivava a 8.966 EUR/mese — piu' di tutta la spesa mensile reale,
-- che e' 3.640. Era un artefatto, e un numero cosi' fa smettere di guardare il
-- cruscotto.
--
-- Il caso peggiore era silenzioso: `Bar Fucsia`, 5 movimenti in 7 mesi,
-- intervallo mediano 7 giorni perche' le visite si raggruppano. La 0016 lo
-- leggeva come settimanale e ne ricavava 94 EUR/mese. Il costo vero e' circa
-- un sesto.
--
-- ---------------------------------------------------------------------------
-- Cosa cambia: due numeri invece di uno
-- ---------------------------------------------------------------------------
-- **Abbonamenti** — merchant con `is_subscription`. Sono contratti che si
-- rinnovano: l'azione possibile e' disdire.
--
-- **Abitudini** — tutto il resto che si ripete. Non c'e' niente da disdire:
-- l'azione possibile e' cambiare comportamento.
--
-- Il confine non lo indovina una statistica, e' gia' dichiarato in
-- `merchants.is_subscription` dalla Fase 4 — e si corregge da `/revisione`,
-- che e' il posto giusto perche' e' un'informazione sul mondo, non sui dati.
-- Un abbonamento nuovo che nessuno ha ancora marcato finisce fra le abitudini:
-- resta visibile e conteggiato, non sparisce.
--
-- ---------------------------------------------------------------------------
-- Come si calcola il costo mensile, e perche' con due formule
-- ---------------------------------------------------------------------------
--   * **abbonamento con cadenza riconosciuta** -> `importo_tipico x 30,44 /
--     giorni_cadenza`. Un canone si rinnova davvero a quella cadenza, quindi
--     mostrare il canone e' sia corretto sia riconoscibile: Netflix deve dire
--     6,99, non 6,56, o il numero non si riconosce e non ci si fida.
--   * **tutto il resto** (abitudini, e abbonamenti a consumo senza cadenza) ->
--     `totale realmente speso x 30,44 / giorni coperti`. Nessuna cadenza da
--     assumere, quindi non si estrapola: si divide quello che e' uscito per il
--     tempo in cui e' uscito.
--
-- `importo_tipico` e' la **mediana** e non l'ultimo importo: un rinnovo con un
-- credito applicato, o un mese con un extra, non deve diventare il prezzo.
-- `expected_amount` resta l'ultimo importo, perche' quello serve a un'altra
-- domanda — «quanto arrivera' la prossima volta» — ed e' il riferimento della
-- Fase 8 per riconoscere un aumento.
--
-- ---------------------------------------------------------------------------
-- Cosa qualifica come ricorrente
-- ---------------------------------------------------------------------------
-- Tre movimenti **e** presenza in almeno tre mesi civili distinti. La seconda
-- condizione e' quella che conta: dieci addebiti in due settimane sono una
-- raffica, non una ricorrenza, e senza questa regola la divisione per un
-- intervallo piccolo produrrebbe di nuovo cifre assurde.

-- ---------------------------------------------------------------------------
-- Le colonne nuove
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column typical_amount   numeric(14, 2),
  add column total_amount     numeric(14, 2),
  add column covered_days     numeric,
  add column active_months    int not null default 0,
  add column amount_stability numeric check (amount_stability >= 0 and amount_stability <= 1);

comment on column public.subscriptions.typical_amount is
  'Mediana degli importi. E'' il prezzo, robusto a un rinnovo con credito o a un mese con un extra.';
comment on column public.subscriptions.total_amount is
  'Totale realmente speso su questo esercente nel periodo osservato.';
comment on column public.subscriptions.covered_days is
  'Giorni coperti: (ultima - prima) + una cadenza. Il denominatore del costo mensile misurato.';
comment on column public.subscriptions.active_months is
  'Mesi civili distinti in cui compare almeno un addebito. Sotto tre non e'' una ricorrenza.';
comment on column public.subscriptions.confidence is
  'Regolarita'' NEL TEMPO, 0..1. Non filtra piu'' niente: un servizio a consumo e'' ricorrente anche se l''importo balla.';
comment on column public.subscriptions.amount_stability is
  'Stabilita'' dell''IMPORTO, 0..1. Bassa su un servizio a consumo, alta su un canone fisso.';

-- ---------------------------------------------------------------------------
-- Il rilevamento
-- ---------------------------------------------------------------------------

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
    select merchant_id, booking_date, amount
    from public.v_expenses
    where merchant_id is not null
      -- Un movimento a zero e' una preautorizzazione rilasciata, non un
      -- pagamento: falserebbe sia la cadenza sia l'importo.
      and amount <> 0
  ),
  con_intervallo as (
    select merchant_id, booking_date, amount,
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
           sum(amount)       as totale,
           -- Mediana e non media: un pagamento in ritardo non deve spostare la
           -- cadenza, e un mese con un extra non deve diventare il prezzo.
           percentile_cont(0.5) within group (order by giorni)
             filter (where giorni is not null)                as giorni_tipici,
           percentile_cont(0.5) within group (order by amount) as importo_tipico,
           stddev_pop(giorni) filter (where giorni is not null) as scarto_giorni,
           avg(abs(amount))        as importo_medio,
           stddev_pop(abs(amount)) as scarto_importo
    from con_intervallo
    group by merchant_id
  ),
  ultimo as (
    select distinct on (merchant_id) merchant_id, amount, booking_date
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
         u.amount                                               as expected_amount,
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
         -- Due coefficienti di variazione, ora **separati**. Nessuno dei due
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
  'Ricalcola subscriptions dai movimenti. Rieseguibile. Non tocca mai usage_verdict, notes e lo stato cancelled.';

-- ---------------------------------------------------------------------------
-- Le viste, ricreate in ordine di dipendenza
-- ---------------------------------------------------------------------------
-- Prima le dipendenti, poi la base. Senza `cascade`: `cascade` porterebbe via
-- anche viste che questa migration non ricrea, e il danno si scoprirebbe solo
-- alla prima query che non trova piu' niente.

drop view if exists public.v_ricorrenze_escluse;
drop view if exists public.v_recurring_monthly_cost_by_discretion;
drop view if exists public.v_subscriptions;

create view public.v_subscriptions with (security_invoker = on) as
select s.id,
       m.canonical_name          as esercente,
       c.name                    as categoria,
       m.discretion              as discrezionalita,
       m.context                 as contesto,
       case when m.is_subscription then 'abbonamento' else 'abitudine' end as tipo,
       s.cadence, s.cadence_days,
       s.expected_amount, s.typical_amount, s.total_amount,
       -- Le due formule, e quale si applica dipende da quanto la riga e'
       -- regolare davvero.
       --
       -- Il ramo del **canone** e' un'assunzione: da' per buono che la
       -- cadenza valga anche in avanti. Si usa solo quando la serie e' quasi
       -- perfetta in entrambe le dimensioni, cioe' quando e' davvero un
       -- canone fisso — ed e' li' che serve, perche' Netflix deve dire 6,99.
       -- Un numero che non si riconosce non si crede.
       --
       -- Il ramo **misurato** e' un'osservazione: speso diviso tempo. Vale per
       -- tutto il resto, abbonamenti a consumo compresi. Su `Google Cloud` il
       -- ramo del canone sbagliava del 40%, perche' l'intervallo mediano
       -- cadeva per caso dentro la finestra "settimanale" senza che ci fosse
       -- nessuna settimanalita'.
       --
       -- Sotto i tre mesi di presenza **non c'e' nessun costo mensile**, e la
       -- colonna resta vuota invece di contenere un'estrapolazione: dieci
       -- addebiti in due settimane divisi per due settimane davano 6.335
       -- EUR/mese, che e' un artefatto, non un dato. Quanto sia realmente
       -- uscito lo dice `total_amount`, che e' un numero misurato.
       case
         when s.active_months < 3 then null
         when m.is_subscription and s.cadence <> 'irregular' and s.cadence_days > 0
              and s.confidence >= 0.9 and s.amount_stability >= 0.95
           then round(s.typical_amount * (30.44 / s.cadence_days), 2)
         when s.covered_days > 0
           then round(s.total_amount * (30.44 / s.covered_days), 2)
       end                       as costo_mensile,
       s.first_seen, s.last_seen, s.next_expected,
       s.occurrences, s.active_months,
       s.confidence, s.amount_stability,
       s.status, s.usage_verdict, s.notes
from public.subscriptions s
join public.merchants m on m.id = s.merchant_id
left join public.categories c on c.id = m.category_id;

comment on view public.v_subscriptions is
  'Ricorrenze rilevate. `tipo` separa cio'' che si disdice da cio'' che si cambia. `costo_mensile` e'' negativo come ogni uscita.';

grant select on public.v_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- v_recurring_monthly_cost_by_discretion — LA metrica
-- ---------------------------------------------------------------------------
-- «Voluttuario ricorrente: 187 EUR/mese». Ora in due righe per classe:
-- abbonamenti e abitudini, perche' rispondono a due azioni diverse e sommarle
-- nasconderebbe quale delle due si puo' fare.
--
-- Due sole esclusioni, e sono dichiarate qui invece che nascoste in un `where`
-- silenzioso:
--   status = 'active'       cio' che e' disdetto o fermo non costa piu'
--   active_months >= 3      sotto tre mesi civili e' una raffica, non una
--                           ricorrenza
--
-- La confidenza NON esclude piu' niente: escludeva gli abbonamenti a consumo,
-- che sono i piu' cari.

create view public.v_recurring_monthly_cost_by_discretion with (security_invoker = on) as
select tipo,
       coalesce(discrezionalita, 'non classificato') as discrezionalita,
       coalesce(contesto, 'non classificato')        as contesto,
       count(*)                                      as ricorrenze,
       sum(costo_mensile)                            as costo_mensile
from public.v_subscriptions
where status = 'active'
  and active_months >= 3
group by 1, 2, 3;

grant select on public.v_recurring_monthly_cost_by_discretion to authenticated;

-- Cosa la metrica lascia fuori, e quanto vale. Una cifra che esclude senza
-- dire quanto esclude non e' verificabile.
--
-- Due colonne e non una, perche' rispondono a due domande diverse:
-- `costo_mensile_potenziale` e' cosa rientrerebbe nel numero (vuoto sotto i
-- tre mesi, dove un tasso mensile non esiste), `totale_speso` e' quanto e'
-- davvero uscito — l'unica cifra che si puo' dare per una raffica di due
-- settimane senza inventarsi niente.
create view public.v_ricorrenze_escluse with (security_invoker = on) as
select case
         when status = 'cancelled'  then 'disdetto'
         when status = 'lapsed'     then 'fermo da tempo'
         else 'meno di tre mesi di presenza'
       end                                    as motivo,
       count(*)                               as esercenti,
       sum(coalesce(costo_mensile, 0))        as costo_mensile_potenziale,
       sum(coalesce(total_amount, 0))         as totale_speso
from public.v_subscriptions
where status <> 'active' or active_months < 3
group by 1;

grant select on public.v_ricorrenze_escluse to authenticated;
