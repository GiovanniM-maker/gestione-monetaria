-- 0016_abbonamenti.sql
--
-- Fase 5: il rilevamento degli abbonamenti, e la metrica per cui l'app esiste.
--
-- ---------------------------------------------------------------------------
-- Perché in SQL e non in TypeScript
-- ---------------------------------------------------------------------------
-- Due ragioni, e la seconda pesa più della prima.
--
-- Una cadenza si trova dalle differenze fra date consecutive: è aritmetica su
-- una serie ordinata, cioè esattamente ciò che un database fa meglio di un
-- ciclo applicativo che si scarica duemila righe.
--
-- Ma soprattutto: la Fase 10 prevede di chiedere all'app «quali abbonamenti
-- sono cresciuti di prezzo». Un copilot può usare una funzione SQL e una vista;
-- non può usare un ciclo dentro un gestore di click. Scriverlo qui non è
-- anticipare la Fase 10, è non doverla riscrivere.

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
-- Una riga per esercente. È una semplificazione, e va detta: un esercente con
-- due canoni diversi — mensile e annuale sulla stessa carta — qui produce una
-- riga sola. Non la si nasconde: importi instabili fanno crollare la
-- confidenza e la cadenza diventa `irregular`, quindi il caso si vede invece
-- di sparire dentro una media.

create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  merchant_id        uuid not null references public.merchants (id) on delete cascade,

  cadence            text not null
                       check (cadence in ('weekly', 'monthly', 'quarterly', 'yearly', 'irregular')),
  cadence_days       numeric,
  -- L'ultimo importo pagato, non la media: è quello che verrà addebitato la
  -- prossima volta, ed è il riferimento contro cui la Fase 8 riconoscerà un
  -- aumento di prezzo.
  expected_amount    numeric(14, 2),
  currency           char(3) not null default 'EUR',

  first_seen         date,
  last_seen          date,
  next_expected      date,
  occurrences        int not null default 0,
  -- 0..1. Prodotto di due regolarità: quella degli intervalli e quella degli
  -- importi. Un servizio che costa sempre uguale ogni mese arriva vicino a 1;
  -- una spesa al supermercato, che varia in entrambe, resta in basso.
  confidence         numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  status             text not null check (status in ('active', 'lapsed', 'cancelled')),

  -- Campi dell'utente: il rilevamento non li tocca mai.
  usage_verdict      text check (usage_verdict in ('usato', 'non_usato', 'da_valutare')),
  verdict_updated_at timestamptz,
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint subscriptions_merchant_unico unique (merchant_id)
);

comment on table public.subscriptions is
  'Ricorrenze rilevate dai movimenti. Rigenerata da rileva_abbonamenti(), che non tocca mai usage_verdict e notes.';
comment on column public.subscriptions.expected_amount is
  'Ultimo importo pagato, negativo come ogni uscita. E'' il riferimento per riconoscere un aumento di prezzo.';
comment on column public.subscriptions.confidence is
  'Regolarita'' degli intervalli moltiplicata per la stabilita'' degli importi. Sotto 0,5 la riga non entra nella metrica principale.';

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create index subscriptions_status_idx on public.subscriptions (status);

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

create policy subscriptions_app_user on public.subscriptions
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

grant select, insert, update, delete on public.subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- rileva_abbonamenti()
-- ---------------------------------------------------------------------------
-- Rieseguibile: ricalcola tutto dai movimenti e non accumula niente.
-- Restituisce quante righe ha scritto.

create function public.rileva_abbonamenti(minimo_occorrenze integer default 3)
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
      -- Un movimento a zero è una preautorizzazione rilasciata, non un
      -- pagamento: falserebbe sia la cadenza sia l'importo atteso.
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
           count(*)              as occorrenze,
           min(booking_date)     as prima,
           max(booking_date)     as ultima,
           -- Mediana e non media: un pagamento in ritardo non deve spostare la
           -- cadenza di tutta la serie.
           percentile_cont(0.5) within group (order by giorni)
             filter (where giorni is not null)          as giorni_tipici,
           stddev_pop(giorni) filter (where giorni is not null) as scarto_giorni,
           avg(abs(amount))      as importo_medio,
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
         -- Le finestre sono larghe di proposito: un addebito mensile cade fra
         -- il 28 e il 31, e uno annuale slitta di giorni fra un anno e l'altro.
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
         s.prima, s.ultima, s.occorrenze,
         -- Due coefficienti di variazione, moltiplicati. Bastano entrambi
         -- vicini a zero perche' la confidenza sia alta, e ne basta uno alto
         -- perche' crolli: un canone e' regolare NEL TEMPO e NELL'IMPORTO, e
         -- chi soddisfa una sola delle due condizioni non e' un abbonamento.
         -- Il cast a `numeric` non e' cosmetico: `stddev_pop` restituisce
         -- `double precision`, e `round` a due argomenti esiste solo su
         -- `numeric`. Senza, la funzione non compila.
         round((
           least(1, greatest(0, 1 - coalesce(s.scarto_giorni, 0)
                                    / nullif(s.giorni_tipici, 0)))
           * least(1, greatest(0, 1 - coalesce(s.scarto_importo, 0)
                                    / nullif(s.importo_medio, 0)))
         )::numeric, 2)                                         as confidence
  from statistiche s
  join ultimo u on u.merchant_id = s.merchant_id
  where s.occorrenze >= minimo_occorrenze;

  insert into public.subscriptions (
    merchant_id, cadence, cadence_days, expected_amount,
    first_seen, last_seen, next_expected, occurrences, confidence, status
  )
  select c.merchant_id, c.cadence, c.cadence_days, c.expected_amount,
         c.prima, c.ultima,
         case when c.cadence = 'irregular' then null
              else (c.ultima + (c.cadence_days || ' days')::interval)::date end,
         c.occorrenze, coalesce(c.confidence, 0),
         -- Mezza cadenza di tolleranza oltre la scadenza attesa: un addebito
         -- che tarda di qualche giorno non deve far sembrare cancellato un
         -- abbonamento ancora vivo.
         case
           when c.cadence = 'irregular' then 'active'
           when c.ultima >= current_date - (c.cadence_days * 1.5)::int then 'active'
           else 'lapsed'
         end
  from candidati c
  on conflict (merchant_id) do update set
    cadence         = excluded.cadence,
    cadence_days    = excluded.cadence_days,
    expected_amount = excluded.expected_amount,
    first_seen      = excluded.first_seen,
    last_seen       = excluded.last_seen,
    next_expected   = excluded.next_expected,
    occurrences     = excluded.occurrences,
    confidence      = excluded.confidence,
    -- `cancelled` e' una dichiarazione dell'utente — "l'ho disdetto" — e non
    -- si sovrascrive con cio' che dicono i movimenti.
    status          = case when public.subscriptions.status = 'cancelled'
                           then 'cancelled' else excluded.status end;
  -- usage_verdict, verdict_updated_at e notes non compaiono: sono dell'utente.

  get diagnostics scritte = row_count;

  -- Un esercente che non ha piu' abbastanza movimenti per essere una
  -- ricorrenza non sparisce dalla tabella: viene marcato `lapsed`. Cancellarlo
  -- perderebbe il giudizio d'uso che l'utente ci aveva scritto sopra.
  update public.subscriptions s
     set status = 'lapsed'
   where s.status = 'active'
     and not exists (select 1 from candidati c where c.merchant_id = s.merchant_id);

  return scritte;
end;
$$;

comment on function public.rileva_abbonamenti(integer) is
  'Ricalcola subscriptions dai movimenti. Rieseguibile. Non tocca mai usage_verdict, notes e lo stato cancelled.';

revoke all on function public.rileva_abbonamenti(integer) from public;
grant execute on function public.rileva_abbonamenti(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- v_subscriptions — il dettaglio, con quanto pesa al mese
-- ---------------------------------------------------------------------------

create view public.v_subscriptions with (security_invoker = on) as
select s.id,
       m.canonical_name          as esercente,
       c.name                    as categoria,
       m.discretion              as discrezionalita,
       m.context                 as contesto,
       s.cadence, s.cadence_days, s.expected_amount,
       -- 30,44 giorni e' la lunghezza media di un mese sull'anno: usare 30
       -- gonfierebbe ogni costo mensile dell'1,4%.
       case when s.cadence_days > 0
            then round(s.expected_amount * (30.44 / s.cadence_days), 2)
       end                       as costo_mensile,
       s.first_seen, s.last_seen, s.next_expected,
       s.occurrences, s.confidence, s.status, s.usage_verdict, s.notes
from public.subscriptions s
join public.merchants m on m.id = s.merchant_id
left join public.categories c on c.id = m.category_id;

comment on view public.v_subscriptions is
  'Abbonamenti rilevati, con il costo riportato a mese. `costo_mensile` e'' negativo come ogni uscita.';

grant select on public.v_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- v_recurring_monthly_cost_by_discretion — LA metrica
-- ---------------------------------------------------------------------------
-- «Voluttuario ricorrente: 187 €/mese». È il numero per cui questa
-- applicazione esiste, e tutto il resto serve a renderlo affidabile.
--
-- Tre esclusioni, e sono dichiarate qui invece che nascoste in un `where`
-- silenzioso:
--   status = 'active'        un abbonamento disdetto non costa più
--   cadence <> 'irregular'   senza cadenza non c'è un costo mensile
--   confidence >= 0.5        sotto quella soglia la regolarità non è provata
--
-- La soglia si vede nel nome della colonna `sotto_soglia` della vista
-- compagna: ciò che resta fuori resta contato, non sparito.

create view public.v_recurring_monthly_cost_by_discretion with (security_invoker = on) as
select coalesce(discrezionalita, 'non classificato') as discrezionalita,
       coalesce(contesto, 'non classificato')        as contesto,
       count(*)                                      as abbonamenti,
       sum(costo_mensile)                            as costo_mensile
from public.v_subscriptions
where status = 'active'
  and cadence <> 'irregular'
  and confidence >= 0.5
group by 1, 2;

grant select on public.v_recurring_monthly_cost_by_discretion to authenticated;

-- Cosa la metrica lascia fuori, e perché. Una cifra che esclude senza dire
-- quanto esclude non è verificabile.
create view public.v_ricorrenze_escluse with (security_invoker = on) as
select case
         when status <> 'active'       then 'non attivo'
         when cadence = 'irregular'    then 'nessuna cadenza riconoscibile'
         else 'confidenza sotto 0,5'
       end                                    as motivo,
       count(*)                               as esercenti,
       sum(coalesce(costo_mensile, 0))        as costo_mensile_potenziale
from public.v_subscriptions
where status <> 'active' or cadence = 'irregular' or confidence < 0.5
group by 1;

grant select on public.v_ricorrenze_escluse to authenticated;
