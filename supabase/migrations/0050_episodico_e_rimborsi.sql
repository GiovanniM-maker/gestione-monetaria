-- ---------------------------------------------------------------------------
-- 0050 — `episodico`, e i rimborsi come marcatore
-- ---------------------------------------------------------------------------
-- Da `docs/copilota.md`, punti 1 e 2 dell'MVP.
--
-- ---------------------------------------------------------------------------
-- Perche' non si fa nessun `drop` di viste, contro quanto temuto
-- ---------------------------------------------------------------------------
-- La regola di processo dice che una colonna nuova su `transactions` che debba
-- arrivare agli aggregati impone di ricreare `v_expenses` e, in ordine e senza
-- `cascade`, le viste che ci stanno sopra — sono **tredici**, verificate
-- interrogando `pg_depend` su una replica locale di tutte le migration, e sono
-- tutte di primo livello (nessuna poggia su un'altra).
--
-- Qui pero' quella manovra **non serve**, e la ragione e' precisa:
--
--   1. `v_expenses` e' definita `select t.*`;
--   2. `alter table ... add column` mette le colonne nuove **in coda**;
--   3. `create or replace view` ammette esattamente una modifica: colonne
--      aggiunte in coda, con le precedenti identiche per nome, tipo e ordine.
--
-- Quindi la riespansione di `t.*` produce le vecchie colonne nello stesso
-- ordine piu' le tre nuove in fondo — che e' l'unico caso che `replace`
-- accetta. Provato sulla replica: dopo il `replace`, `v_expenses` ha
-- `episodico` e tutte e tredici le dipendenti sono ancora vive.
--
-- E' una differenza che vale la pena scrivere, perche' la manovra col `drop` e'
-- gia' fallita due volte e qui sarebbe stata gratuita.
--
-- ---------------------------------------------------------------------------
-- Le tre colonne
-- ---------------------------------------------------------------------------
-- `episodico` — la spesa una tantum. Resta nella spesa reale del mese (i soldi
-- sono usciti davvero) e nella cronologia; esce dal rilevatore di ricorrenze e
-- dal picco di categoria. E' il caso `Booking.com`, noto dalla Fase 5: quattro
-- prenotazioni in tre mesi che il rilevatore legge come abitudine da
-- 266,50 €/mese.
--
-- `rimborso_stato` / `rimborso_importo` — il marcatore, **non** la
-- riconciliazione. Tre stati e non un booleano perche' il rimborso puo' essere
-- parziale (spendi 1.000, te ne riconoscono 800), ha un ciclo di vita, e arriva
-- quasi sempre cumulativo: una nota spese da 740 € che copre sei scontrini.
-- Per questo non c'e' nessun legame verso la transazione di accredito —
-- sarebbe uno-a-uno per un fenomeno molti-a-uno.
--
-- **In questa migration i due campi non entrano in nessun aggregato**, di
-- proposito: il costo personale netto e la riconciliazione aspettano un bisogno
-- misurato (`docs/copilota.md` B5). Le colonne entrano adesso solo perche'
-- viaggiano sulla stessa riespansione di `v_expenses` che `episodico` impone.
--
-- `rimborso_importo` e' **in euro e positivo**: e' quanto torna, e la somma col
-- costo si scrivera' `amount_eur + coalesce(rimborso_importo, 0)`, che e' una
-- somma e non una differenza perche' le uscite sono negative.

alter table public.transactions
  add column if not exists episodico boolean not null default false;
alter table public.transactions
  add column if not exists rimborso_stato text;
alter table public.transactions
  add column if not exists rimborso_importo numeric(14,2);

comment on column public.transactions.episodico is
  'Spesa una tantum: resta nella spesa reale, esce dalle ricorrenze e dal picco di categoria.';
comment on column public.transactions.rimborso_stato is
  'atteso | ricevuto | negato. Null = non e'' una spesa rimborsabile.';
comment on column public.transactions.rimborso_importo is
  'Quanto torna, in EUR e positivo. Puo'' essere minore della spesa: i rimborsi parziali esistono.';

-- `add constraint if not exists` non esiste: si toglie e si rimette, che rende
-- la migration rieseguibile senza cambiare l'esito.
alter table public.transactions drop constraint if exists transactions_rimborso_stato_check;
alter table public.transactions add constraint transactions_rimborso_stato_check
  check (rimborso_stato is null or rimborso_stato in ('atteso', 'ricevuto', 'negato'));

-- Un importo senza stato sarebbe un numero che non si sa come leggere, e uno
-- negativo invertirebbe il segno di una somma futura. Falliscono tutti e due
-- chiuso: si rifiuta la scrittura invece di salvare un dato ambiguo.
alter table public.transactions drop constraint if exists transactions_rimborso_importo_check;
alter table public.transactions add constraint transactions_rimborso_importo_check
  check (rimborso_importo is null or (rimborso_stato is not null and rimborso_importo > 0));

-- ---------------------------------------------------------------------------
-- v_expenses — `t.*` si riespande, e le tredici dipendenti non si toccano
-- ---------------------------------------------------------------------------
create or replace view public.v_expenses with (security_invoker = on) as
select t.*
from public.transactions t
join public.accounts a on a.id = t.account_id
where t.amount < 0
  and not t.is_transfer
  and not t.is_refund
  and not t.excluded_from_analysis
  and a.include_in_totals;

comment on view public.v_expenses is
  'Uscite reali. Ogni aggregato di spesa deve partire da qui, mai da transactions. Comprende gli episodici: i soldi sono usciti davvero.';

-- ---------------------------------------------------------------------------
-- v_monthly_by_category — una colonna in piu', non un filtro
-- ---------------------------------------------------------------------------
-- Il picco di categoria non deve scattare su una spesa che l'utente ha appena
-- dichiarato una tantum: un mobile da 1.200 € non e' un picco da segnalare.
--
-- Ma **`spesa` non si tocca**: quella colonna e' la spesa del mese, la legge la
-- fisarmonica di «Dove» e il cruscotto, e togliere gli episodici da li' violerebbe
-- «resta nella spesa reale» — la somma dei rami smetterebbe di fare il totale.
--
-- Quindi una colonna accanto, e in **coda** perche' `create or replace` non
-- ammette altro. Il roll-up ricorsivo resta scritto una volta sola: rifare la
-- somma dentro `genera_alert` sarebbe una seconda copia dell'albero, ed e'
-- esattamente il modo in cui due regole uguali divergono.
create or replace view public.v_monthly_by_category with (security_invoker = on) as
with mensile as (
  select date_trunc('month', booking_date)::date as mese,
         category_id,
         sum(amount_eur) as spesa,
         count(*)        as movimenti,
         sum(amount_eur) filter (where not episodico) as spesa_senza_episodici
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
                                                               as movimenti_diretti,
       -- In coda. `coalesce` perche' un ramo fatto di soli episodici darebbe
       -- null, e un null qui diventerebbe «nessun dato» invece di «zero».
       coalesce(sum(m.spesa_senza_episodici), 0)               as spesa_senza_episodici
from mensile m
join public.v_albero_categorie a on a.discendente = m.category_id
join public.categories c on c.id = a.antenato
group by 1, 2, c.name, c.slug, c.parent_id, c.sort_order;

comment on view public.v_monthly_by_category is
  'Spesa mensile per categoria, con roll-up sui discendenti. `spesa_diretta` e'' la quota registrata sul nodo stesso; `spesa_senza_episodici` esclude le spese una tantum e serve al picco di categoria.';

-- ---------------------------------------------------------------------------
-- costo_mensile_di — la formula del costo ricorrente, in un posto solo
-- ---------------------------------------------------------------------------
-- Era scritta dentro `v_subscriptions` e basta. Adesso serve anche a
-- `effetto_episodico`, che deve dire di quanto cambia il numero **prima** che
-- l'utente applichi — e due copie della stessa formula divergono: quella che
-- resta indietro e' sempre la meno guardata, cioe' la spiegazione mostrata
-- all'utente.
--
-- `immutable`: e' aritmetica sugli argomenti, non legge niente.
create or replace function public.costo_mensile_di(
  p_is_subscription  boolean,
  p_cadence          text,
  p_cadence_days     numeric,
  p_confidence       numeric,
  p_amount_stability numeric,
  p_typical_amount   numeric,
  p_total_amount     numeric,
  p_covered_days     numeric,
  p_active_months    integer
) returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    -- Sotto le soglie non si estrapola: un tasso mensile per qualcosa che non
    -- copre dei mesi non esiste. Tre mesi civili possono essere ventinove
    -- giorni, ed e' per questo che le soglie sono due.
    when p_active_months < 3 or p_covered_days < 75 then null
    -- Canone: solo se la serie e' davvero regolare. Netflix deve dire 6,99.
    when p_is_subscription and p_cadence <> 'irregular' and p_cadence_days > 0
         and p_confidence >= 0.9 and p_amount_stability >= 0.95
      then round(p_typical_amount * (30.44 / p_cadence_days), 2)
    -- Tutto il resto: quanto e' stato speso davvero, sul tempo davvero
    -- coperto. Nessuna cadenza assunta, quindi nessuna estrapolazione.
    when p_covered_days > 0 then round(p_total_amount * (30.44 / p_covered_days), 2)
    else null
  end;
$$;

comment on function public.costo_mensile_di is
  'Il costo ricorrente mensile. Una formula sola, usata da v_subscriptions e da effetto_episodico.';

revoke all on function public.costo_mensile_di(
  boolean, text, numeric, numeric, numeric, numeric, numeric, numeric, integer) from public;
grant execute on function public.costo_mensile_di(
  boolean, text, numeric, numeric, numeric, numeric, numeric, numeric, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- v_subscriptions — stesse colonne, stesso ordine, la formula chiamata
-- ---------------------------------------------------------------------------
-- `create or replace`: le colonne restano identiche per nome, tipo e ordine,
-- quindi `v_recurring_monthly_cost_by_discretion` e `v_ricorrenze_escluse` —
-- le due viste che ci stanno sopra — non si toccano.
create or replace view public.v_subscriptions with (security_invoker = on) as
select s.id,
       s.merchant_id,
       m.canonical_name as esercente,
       c.name           as categoria,
       m.discretion     as discrezionalita,
       coalesce(d.nome, 'Non classificato') as classe_nome,
       coalesce(d.colore, 'neutro')         as classe_colore,
       coalesce(d.sort_order, 999)          as classe_ordine,
       coalesce(d.nel_ricorrente, true)     as nel_ricorrente,
       m.context        as contesto,
       case when m.is_subscription then 'abbonamento' else 'abitudine' end as tipo,
       s.cadence,
       s.cadence_days,
       s.expected_amount,
       s.typical_amount,
       s.total_amount,
       s.covered_days,
       s.status = 'active' and s.active_months >= 3 and s.covered_days >= 75::numeric
                        as nella_metrica,
       public.costo_mensile_di(m.is_subscription, s.cadence, s.cadence_days,
                               s.confidence, s.amount_stability, s.typical_amount,
                               s.total_amount, s.covered_days, s.active_months)
                        as costo_mensile,
       s.first_seen,
       s.last_seen,
       s.next_expected,
       s.occurrences,
       s.active_months,
       s.confidence,
       s.amount_stability,
       s.status,
       s.usage_verdict,
       s.notes
from public.subscriptions s
join public.merchants m on m.id = s.merchant_id
left join public.categories c on c.id = m.category_id
left join public.discretion_classes d on d.slug = m.discretion;

grant select on public.v_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- statistiche_ricorrenza — le statistiche per esercente, escludibili
-- ---------------------------------------------------------------------------
-- Estratte dal corpo di `rileva_abbonamenti` per una ragione sola: servono
-- anche a `effetto_episodico`, che deve poter rispondere «e se questa riga non
-- ci fosse?». Con `p_escludi` la domanda si fa senza scrivere niente, e senza
-- una seconda copia di trenta righe di statistica che poi divergono.
--
-- **`episodico` esce qui**, in un punto solo e prima di ogni aggregazione: cosi'
-- il movimento non entra ne' nella somma ne' in `min`/`max` delle date. Tenerlo
-- dentro l'intervallo togliendolo dalla somma abbasserebbe il costo mensile —
-- e' lo stesso errore gia' documentato per i movimenti senza tasso di cambio.
create or replace function public.statistiche_ricorrenza(p_escludi uuid default null)
returns table (
  merchant_id      uuid,
  cadence          text,
  cadence_days     numeric,
  expected_amount  numeric,
  typical_amount   numeric,
  total_amount     numeric,
  covered_days     numeric,
  first_seen       date,
  last_seen        date,
  occurrences      integer,
  active_months    integer,
  confidence       numeric,
  amount_stability numeric
)
language sql
stable
set search_path = ''
as $$
  with movimenti as (
    select e.merchant_id, e.booking_date, e.amount_eur
    from public.v_expenses e
    where e.merchant_id is not null
      -- Senza tasso di cambio il movimento non e' confrontabile con gli altri:
      -- esce dalla serie, e viene contato in `v_ricorrenze_senza_cambio`.
      and e.amount_eur is not null
      -- Un movimento a zero e' una preautorizzazione rilasciata, non un
      -- pagamento: falserebbe sia la cadenza sia l'importo.
      and e.amount_eur <> 0
      -- Una tantum: dichiarata dall'utente, non dedotta.
      and not e.episodico
      -- La riga che si sta valutando, quando si sta valutando.
      and (p_escludi is null or e.id <> p_escludi)
  ),
  con_intervallo as (
    select m.merchant_id, m.booking_date, m.amount_eur,
           m.booking_date - lag(m.booking_date) over (
             partition by m.merchant_id order by m.booking_date
           ) as giorni
    from movimenti m
  ),
  statistiche as (
    select ci.merchant_id,
           count(*)             as occorrenze,
           min(ci.booking_date) as prima,
           max(ci.booking_date) as ultima,
           count(distinct date_trunc('month', ci.booking_date)) as mesi_attivi,
           sum(ci.amount_eur)   as totale,
           -- L'intervallo tipico e' una **stima**: `percentile_cont`, che su un
           -- numero pari interpola. 30,5 giorni prevede il prossimo addebito
           -- meglio di 30, e nessuno legge questo numero come un importo.
           percentile_cont(0.5) within group (order by ci.giorni)
             filter (where ci.giorni is not null)                    as giorni_tipici,
           -- L'importo tipico e' un **prezzo**: `percentile_disc`, che sceglie
           -- fra i valori realmente pagati invece di inventarne uno in mezzo.
           percentile_disc(0.5) within group (order by ci.amount_eur) as importo_tipico,
           stddev_pop(ci.giorni) filter (where ci.giorni is not null) as scarto_giorni,
           avg(abs(ci.amount_eur))        as importo_medio,
           stddev_pop(abs(ci.amount_eur)) as scarto_importo
    from con_intervallo ci
    group by ci.merchant_id
  ),
  ultimo as (
    select distinct on (m.merchant_id) m.merchant_id, m.amount_eur, m.booking_date
    from movimenti m
    order by m.merchant_id, m.booking_date desc
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
         end,
         case
           when s.giorni_tipici between   5 and  10 then 7
           when s.giorni_tipici between  24 and  38 then 30.44
           when s.giorni_tipici between  80 and 100 then 91.31
           when s.giorni_tipici between 330 and 400 then 365.25
           else s.giorni_tipici
         end,
         u.amount_eur,
         s.importo_tipico,
         s.totale,
         -- Ogni addebito "copre" una cadenza: il periodo osservato va dal primo
         -- all'ultimo, piu' la cadenza che l'ultimo copre.
         (s.ultima - s.prima)
           + case
               when s.giorni_tipici between   5 and  10 then 7
               when s.giorni_tipici between  24 and  38 then 30.44
               when s.giorni_tipici between  80 and 100 then 91.31
               when s.giorni_tipici between 330 and 400 then 365.25
               else coalesce(s.giorni_tipici, 0)
             end,
         s.prima,
         s.ultima,
         s.occorrenze::integer,
         s.mesi_attivi::integer,
         -- Due coefficienti di variazione, **separati**. Nessuno dei due
         -- esclude niente: dicono che tipo di ricorrenza e', non se lo e'.
         coalesce(round(least(1, greatest(0, 1 - coalesce(s.scarto_giorni, 0)
                                        / nullif(s.giorni_tipici, 0)))::numeric, 2), 0),
         coalesce(round(least(1, greatest(0, 1 - coalesce(s.scarto_importo, 0)
                                        / nullif(s.importo_medio, 0)))::numeric, 2), 0)
  from statistiche s
  join ultimo u on u.merchant_id = s.merchant_id;
$$;

comment on function public.statistiche_ricorrenza is
  'Statistiche di ricorrenza per esercente, dagli stessi movimenti del rilevatore. `p_escludi` toglie una riga senza scrivere niente: e'' cosi'' che si calcola l''effetto di segnare una spesa come episodica.';

revoke all on function public.statistiche_ricorrenza(uuid) from public;
grant execute on function public.statistiche_ricorrenza(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- rileva_abbonamenti — stessa logica, statistiche prese dalla funzione
-- ---------------------------------------------------------------------------
-- L'invariante da verificare dopo questa migration: **senza nessun episodico,
-- il rilevatore deve produrre righe identiche a prima.** Se si muove un solo
-- numero, l'estrazione ha cambiato qualcosa che non doveva.
create or replace function public.rileva_abbonamenti(minimo_occorrenze integer default 3)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  scritte integer;
begin
  create temporary table candidati on commit drop as
  select * from public.statistiche_ricorrenza()
  where occurrences >= minimo_occorrenze;

  insert into public.subscriptions (
    merchant_id, cadence, cadence_days, expected_amount, typical_amount,
    total_amount, covered_days, first_seen, last_seen, next_expected,
    occurrences, active_months, confidence, amount_stability, status
  )
  select c.merchant_id, c.cadence, c.cadence_days, c.expected_amount,
         c.typical_amount, c.total_amount, c.covered_days,
         c.first_seen, c.last_seen,
         case when c.cadence = 'irregular' then null
              else (c.last_seen + (c.cadence_days || ' days')::interval)::date end,
         c.occurrences, c.active_months,
         c.confidence, c.amount_stability,
         -- Mezza cadenza di tolleranza oltre la scadenza attesa: un addebito
         -- che tarda di qualche giorno non deve far sembrare cancellato un
         -- abbonamento ancora vivo.
         case
           when c.cadence = 'irregular'
             then case when c.last_seen >= current_date - 61 then 'active' else 'lapsed' end
           when c.last_seen >= current_date - (c.cadence_days * 1.5)::int then 'active'
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

-- ---------------------------------------------------------------------------
-- effetto_episodico — di quanto cambia il numero, calcolato dal server
-- ---------------------------------------------------------------------------
-- La proposta del copilota deve dire «il costo ricorrente passa da X a Y», e
-- quelle due cifre non puo' scriverle il modello: sono numeri, e valgono le
-- regole di sempre. Qui si calcolano davvero, con la stessa formula che il
-- cruscotto mostra.
--
-- `costo_dopo` nullo non e' un errore: significa che senza quella riga
-- l'esercente esce del tutto dalla metrica — perche' scende sotto le tre
-- occorrenze, i tre mesi o i 75 giorni. E' un'informazione, e la schermata la
-- dice a parole.
create or replace function public.effetto_episodico(p_id uuid)
returns table (
  merchant_id   uuid,
  esercente     text,
  booking_date  date,
  amount_eur    text,
  gia_episodico boolean,
  costo_prima   text,
  costo_dopo    text
)
language sql
stable
set search_path = ''
as $$
  with riga as (
    select t.id, t.merchant_id, t.booking_date, t.amount_eur, t.episodico
    from public.transactions t
    where t.id = p_id
  ),
  -- Senza la riga: le statistiche ricalcolate escludendola.
  dopo as (
    select s.*
    from riga r
    join public.statistiche_ricorrenza(r.id) s on s.merchant_id = r.merchant_id
  )
  select r.merchant_id,
         m.canonical_name,
         r.booking_date,
         r.amount_eur::text,
         r.episodico,
         -- Prima: quello che il cruscotto mostra adesso, letto e non ricalcolato.
         (select v.costo_mensile::text from public.v_subscriptions v
           where v.merchant_id = r.merchant_id),
         (select public.costo_mensile_di(m.is_subscription, d.cadence, d.cadence_days,
                                         d.confidence, d.amount_stability, d.typical_amount,
                                         d.total_amount, d.covered_days, d.active_months)::text
            from dopo d
           where d.occurrences >= 3)
  from riga r
  left join public.merchants m on m.id = r.merchant_id;
$$;

comment on function public.effetto_episodico is
  'Di quanto cambia il costo ricorrente segnando una spesa come episodica. Le due cifre le calcola il server: al modello non si fa scrivere un numero.';

revoke all on function public.effetto_episodico(uuid) from public;
grant execute on function public.effetto_episodico(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- segna_episodico / imposta_rimborso — le due scritture
-- ---------------------------------------------------------------------------
-- Tornano `true`/`false` come `categorizza_movimento`: `false` significa «quel
-- movimento non esiste piu'», che chi chiama deve poter distinguere da «fatto».
--
-- **Nessuna delle due marca `manually_categorized`**, ed e' una scelta:
-- quel flag protegge *la classificazione* dagli automatismi, e qui non si sta
-- classificando niente. Marcare episodica una spesa non deve congelarne la
-- categoria per sempre.
create or replace function public.segna_episodico(p_id uuid, p_episodico boolean default true)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with fatto as (
    update public.transactions
       set episodico = coalesce(p_episodico, true), updated_at = now()
     where id = p_id
    returning 1
  )
  select exists (select 1 from fatto);
$$;

create or replace function public.imposta_rimborso(
  p_id      uuid,
  p_stato   text default null,
  p_importo numeric default null
) returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with fatto as (
    update public.transactions
       set rimborso_stato = p_stato,
           -- Togliendo lo stato si toglie anche l'importo: un importo orfano
           -- violerebbe il `check`, e lasciarlo sarebbe un numero che non si sa
           -- piu' come leggere.
           rimborso_importo = case when p_stato is null then null else p_importo end,
           updated_at = now()
     where id = p_id
    returning 1
  )
  select exists (select 1 from fatto);
$$;

comment on function public.segna_episodico is
  'Segna una spesa come una tantum. Non tocca manually_categorized: non si sta classificando niente.';
comment on function public.imposta_rimborso is
  'Marcatore di rimborso. Non riconcilia niente con la transazione di accredito.';

revoke all on function public.segna_episodico(uuid, boolean) from public;
grant execute on function public.segna_episodico(uuid, boolean) to authenticated;
revoke all on function public.imposta_rimborso(uuid, text, numeric) from public;
grant execute on function public.imposta_rimborso(uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- genera_alert — il picco di categoria ignora gli episodici
-- ---------------------------------------------------------------------------
-- Un solo cambiamento: `storia` legge `spesa_senza_episodici` invece di
-- `spesa`. Il resto del corpo e' quello vivo, ripreso da `pg_get_functiondef`
-- e non riscritto a memoria.

CREATE OR REPLACE FUNCTION public.genera_alert()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  creati integer := 0;
  aggiunti integer;
begin
  insert into public.alerts (type, severity, title, body, payload, dedupe_key)
  select 'session_expiring',
         case when c.valid_until::date <= current_date then 'critical' else 'warning' end,
         case when c.valid_until::date <= current_date
              then 'Il consenso ' || c.aspsp_name || ' è scaduto'
              else 'Il consenso ' || c.aspsp_name || ' scade fra ' ||
                   (c.valid_until::date - current_date) || ' giorni' end,
         case when c.valid_until::date <= current_date
              then 'I movimenti nuovi non arrivano più. Finché non lo rinnovi, ogni numero ' ||
                   'di questa applicazione resta fermo a ' ||
                   coalesce((select max(t.booking_date)::text
                               from public.transactions t
                               join public.accounts a on a.id = t.account_id
                              where a.connection_id = c.id), 'mai') || '.'
              else 'Va rinnovato prima della scadenza: dopo, i dati smettono di arrivare senza ' ||
                   'che nulla lo segnali.' end,
         jsonb_build_object('valid_until', c.valid_until, 'banca', c.aspsp_name),
         'consenso:' || c.id::text || ':' || c.valid_until::date::text
  from public.bank_connections c
  where c.valid_until is not null
    and c.valid_until::date <= current_date + 30
    and c.status <> 'revoked'
  on conflict (dedupe_key) do nothing;
  get diagnostics aggiunti = row_count; creati := creati + aggiunti;

  insert into public.alerts (type, severity, title, body, payload, dedupe_key)
  select 'sync_failed', 'warning',
         'La sincronizzazione è fallita',
         coalesce(r.error_message, 'Nessun messaggio.') ||
           ' Finché non riesce, i movimenti nuovi non entrano.',
         jsonb_build_object('run_id', r.id, 'quando', r.started_at),
         'sync:' || r.id::text
  from public.sync_runs r
  where r.status = 'failed'
    and r.started_at >= now() - interval '7 days'
    and not exists (
      select 1 from public.sync_runs ok
       where ok.connection_id is not distinct from r.connection_id
         and ok.status = 'success'
         and ok.started_at > r.started_at
    )
  on conflict (dedupe_key) do nothing;
  get diagnostics aggiunti = row_count; creati := creati + aggiunti;

  insert into public.alerts (type, severity, title, body, payload,
                             related_subscription_id, dedupe_key)
  select 'price_increase', 'warning',
         s.esercente || ': il prezzo è salito',
         'Ultimo addebito ' || abs(s.expected_amount)::text || ' €, contro un tipico di ' ||
           abs(s.typical_amount)::text || ' €. ' ||
           'Sono ' || round(((abs(s.expected_amount) / abs(s.typical_amount)) - 1) * 100)::text ||
           '% in più su ' || s.occurrences::text || ' addebiti osservati.',
         jsonb_build_object('ultimo', s.expected_amount::text, 'tipico', s.typical_amount::text),
         s.id,
         'prezzo:' || s.id::text || ':' || s.expected_amount::text
  from public.v_subscriptions s
  where s.nella_metrica
    and s.tipo = 'abbonamento'
    and s.typical_amount is not null
    and abs(s.typical_amount) > 0
    and abs(s.expected_amount) >= abs(s.typical_amount) * 1.10
    and abs(s.expected_amount) - abs(s.typical_amount) >= 1
  on conflict (dedupe_key) do nothing;
  get diagnostics aggiunti = row_count; creati := creati + aggiunti;

  -- LA CORREZIONE: comparso da poco nel mondo, E scoperto da poco da noi.
  insert into public.alerts (type, severity, title, body, payload,
                             related_subscription_id, dedupe_key)
  select 'new_subscription', 'info',
         'Nuovo costo ricorrente: ' || s.esercente,
         abs(s.costo_mensile)::text || ' €/mese, ' || s.cadence ||
           ', ' || s.occurrences::text || ' addebiti dal ' || s.first_seen::text || '.',
         jsonb_build_object('costo_mensile', s.costo_mensile::text, 'tipo', s.tipo),
         s.id,
         'nuovo:' || s.id::text
  from public.v_subscriptions s
  join public.subscriptions t on t.id = s.id
  where s.nella_metrica
    and s.costo_mensile is not null
    and t.created_at >= now() - interval '30 days'
    and s.first_seen >= current_date - 120
  on conflict (dedupe_key) do nothing;
  get diagnostics aggiunti = row_count; creati := creati + aggiunti;

  insert into public.alerts (type, severity, title, body, payload,
                             related_subscription_id, dedupe_key)
  select 'unused_subscription', 'warning',
         s.esercente || ': non lo usi, e lo paghi',
         'Hai dichiarato di non usarlo, ma è ancora attivo: ' ||
           abs(s.costo_mensile)::text || ' €/mese, cioè ' ||
           round(abs(s.costo_mensile) * 12)::text || ' € all''anno.',
         jsonb_build_object('costo_mensile', s.costo_mensile::text),
         s.id,
         'inutilizzato:' || s.id::text
  from public.v_subscriptions s
  where s.usage_verdict = 'non_usato'
    and s.status = 'active'
    and s.costo_mensile is not null
  on conflict (dedupe_key) do nothing;
  get diagnostics aggiunti = row_count; creati := creati + aggiunti;

  -- Il doppio addebito guarda solo gli ultimi 14 giorni, non 60.
  --
  -- Un addebito doppio si contesta alla banca entro pochi giorni: segnalarne
  -- uno di due mesi fa non serve a niente e, alla prima esecuzione, ne tira
  -- fuori due mesi tutti insieme. La finestra corta e' anche cio' che rende
  -- questo avviso un avviso invece che un rapporto.
  insert into public.alerts (type, severity, title, body, payload,
                             related_transaction_id, dedupe_key)
  select 'possible_duplicate', 'warning',
         'Doppio addebito da ' || coalesce(m.canonical_name, a.raw_description, 'sconosciuto'),
         abs(a.amount)::text || ' € addebitati due volte, il ' || a.booking_date::text ||
           ' e il ' || b.booking_date::text || '. Se è un errore della banca, si contesta.',
         jsonb_build_object('importo', a.amount::text, 'altro_movimento', b.id),
         a.id,
         'doppio:' || least(a.id::text, b.id::text) || ':' || greatest(a.id::text, b.id::text)
  from public.v_expenses a
  join public.v_expenses b
    on b.id <> a.id
   and b.merchant_id is not distinct from a.merchant_id
   and b.amount = a.amount
   and b.booking_date between a.booking_date and a.booking_date + 1
   and b.id > a.id
  left join public.merchants m on m.id = a.merchant_id
  where abs(a.amount) >= 15
    and a.booking_date >= current_date - 14
  on conflict (dedupe_key) do nothing;
  get diagnostics aggiunti = row_count; creati := creati + aggiunti;

  insert into public.alerts (type, severity, title, body, payload,
                             related_category_id, dedupe_key)
  with ultimo_completo as (
    select (date_trunc('month', current_date) - interval '1 month')::date as mese
  ),
  storia as (
    select v.category_id, v.categoria, v.mese, v.spesa_senza_episodici as spesa
    from public.v_monthly_by_category v, ultimo_completo u
    where v.mese <= u.mese and v.mese > u.mese - interval '7 months'
  ),
  riferimento as (
    select s.category_id,
           percentile_disc(0.5) within group (order by s.spesa) as mediana,
           count(*) as mesi
    from storia s, ultimo_completo u
    where s.mese < u.mese
    group by 1
  )
  select 'category_spike', 'info',
         s.categoria || ': speso molto più del solito',
         abs(s.spesa)::text || ' € contro un tipico di ' || abs(r.mediana)::text ||
           ' €, su ' || r.mesi::text || ' mesi di confronto.',
         jsonb_build_object('mese', s.mese, 'spesa', s.spesa::text, 'mediana', r.mediana::text),
         s.category_id,
         'picco:' || s.category_id::text || ':' || s.mese::text
  from storia s
  join riferimento r on r.category_id = s.category_id
  join ultimo_completo u on s.mese = u.mese
  where r.mesi >= 3
    and abs(r.mediana) > 0
    and abs(s.spesa) >= abs(r.mediana) * 1.5
    and abs(s.spesa) - abs(r.mediana) >= 50
  on conflict (dedupe_key) do nothing;
  get diagnostics aggiunti = row_count; creati := creati + aggiunti;

  return creati;
end;
$function$;;

-- ---------------------------------------------------------------------------
-- cerca_movimenti — le tre colonne nuove, in coda
-- ---------------------------------------------------------------------------
-- Serve alla scheda del movimento, che e' il posto da cui si segna una spesa
-- come episodica. Aggiungere colonne al `returns table` impone `drop` e
-- `create`: `create or replace` non puo' cambiare il tipo di ritorno.
--
-- Gli argomenti non cambiano rispetto alla 0048, quindi la firma da eliminare
-- e' una sola. `if exists` la rende rieseguibile.
drop function if exists public.cerca_movimenti(uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean, boolean);

create function public.cerca_movimenti(p_id uuid DEFAULT NULL::uuid, p_da date DEFAULT NULL::date, p_a date DEFAULT NULL::date, p_ricerca text DEFAULT NULL::text, p_categoria uuid DEFAULT NULL::uuid, p_merchant uuid DEFAULT NULL::uuid, p_discrezionalita text DEFAULT NULL::text, p_contesto text DEFAULT NULL::text, p_tipo text DEFAULT 'spesa'::text, p_ordine text DEFAULT 'data'::text, p_limite integer DEFAULT 50, p_scarto integer DEFAULT 0, p_solo_questa boolean DEFAULT false, p_senza_categoria boolean DEFAULT false)
 RETURNS TABLE(id uuid, booking_date date, value_date date, amount text, amount_eur text, currency character, stato text, esercente text, merchant_id uuid, categoria text, category_id uuid, discrezionalita text, contesto text, conto text, raw_description text, counterparty_raw text, bank_code text, is_transfer boolean, is_refund boolean, excluded_from_analysis boolean, manually_categorized boolean, note text, fuori_dalla_spesa text, totale_righe bigint, totale_importo text, episodico boolean, rimborso_stato text, rimborso_importo text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
       (sum(m.amount_eur) over ())::text,
       m.episodico,
       m.rimborso_stato,
       m.rimborso_importo::text
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
  and (not coalesce(p_senza_categoria, false) or m.category_id is null)
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
$function$;;

comment on function public.cerca_movimenti is
  'Movimenti filtrati, con conteggio e somma dell''intero insieme filtrato. `p_solo_questa` esclude le discendenti; `p_senza_categoria` chiede i soli movimenti senza categoria.';

revoke all on function public.cerca_movimenti(uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean, boolean) from public;
grant execute on function public.cerca_movimenti(uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
