-- 0023_alert.sql
--
-- Fase 8: il motore degli avvisi.
--
-- ---------------------------------------------------------------------------
-- Il criterio con cui e' stato scelto cosa segnalare
-- ---------------------------------------------------------------------------
-- Un cruscotto si guarda quando lo si apre; un avviso pretende attenzione. Ne
-- vale la pena solo per due cose:
--
-- 1. **il costo ricorrente e' cambiato** — un canone e' aumentato, ne e'
--    comparso uno nuovo, uno che hai dichiarato di non usare si paga ancora;
-- 2. **il numero non e' piu' affidabile** — il consenso sta scadendo, la
--    sincronizzazione fallisce.
--
-- Tutto il resto e' rumore, e il rumore in un canale di avvisi non e' neutro:
-- spegne il canale. `budget_exceeded` non e' implementato perche' i budget non
-- esistono ancora, e `missing_fixed_charge` perche' si sovrappone allo stato
-- `lapsed` che il rilevatore gia' calcola — due avvisi per lo stesso fatto
-- sono un avviso e mezzo di rumore.
--
-- ---------------------------------------------------------------------------
-- Il problema vero: non ripetersi
-- ---------------------------------------------------------------------------
-- Il generatore gira ogni notte. Senza una chiave stabile, la settima notte
-- avresti sette copie dello stesso avviso, e a quel punto li ignoreresti tutti
-- — che e' il modo in cui i sistemi di notifica muoiono.
--
-- `dedupe_key` con un indice unico e' la risposta. La chiave contiene **cio'
-- che rende l'avviso quello che e'**: non solo l'oggetto, ma anche il valore
-- che l'ha scatenato. Un aumento da 9,99 a 12,99 e uno da 12,99 a 15,99 sono
-- due avvisi diversi e devono esserlo; lo stesso aumento visto sette notti di
-- fila e' uno solo.
--
-- Non e' nello schema di `CLAUDE.md` perche' li' c'e' la forma dei dati, non
-- il meccanismo per non duplicarli. Il resto delle colonne e' quello previsto.

create table public.alerts (
  id                     uuid primary key default gen_random_uuid(),
  type                   text not null check (type in (
                           'new_subscription', 'price_increase', 'unused_subscription',
                           'possible_duplicate', 'category_spike', 'missing_fixed_charge',
                           'budget_exceeded', 'session_expiring', 'sync_failed')),
  severity               text not null check (severity in ('info', 'warning', 'critical')),
  title                  text not null,
  body                   text not null,
  payload                jsonb,

  related_transaction_id uuid references public.transactions (id) on delete cascade,
  related_subscription_id uuid references public.subscriptions (id) on delete cascade,
  related_category_id    uuid references public.categories (id) on delete cascade,

  status                 text not null default 'new'
                           check (status in ('new', 'read', 'dismissed', 'actioned')),
  /** Cio' che rende questo avviso questo avviso. Vedi sopra. */
  dedupe_key             text not null unique,
  created_at             timestamptz not null default now(),
  read_at                timestamptz
);

create index alerts_da_leggere_idx on public.alerts (created_at desc) where status = 'new';

alter table public.alerts enable row level security;
alter table public.alerts force row level security;

create policy alerts_app_user on public.alerts
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

grant select, insert, update, delete on public.alerts to authenticated;

-- ---------------------------------------------------------------------------
-- genera_alert()
-- ---------------------------------------------------------------------------
-- Rieseguibile. Ogni blocco fa `on conflict (dedupe_key) do nothing`: un
-- avviso gia' presente non viene toccato, quindi **nemmeno il suo stato**. Se
-- l'hai letto o ignorato resta letto o ignorato, e non torna a galla ogni
-- notte — che e' la stessa ragione per cui `rileva_abbonamenti` non sovrascrive
-- `usage_verdict`.

create function public.genera_alert()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  creati integer := 0;
  aggiunti integer;
begin
  -- -------------------------------------------------------------------
  -- Il numero non e' piu' affidabile
  -- -------------------------------------------------------------------
  -- Il consenso Enable Banking scade, e quando scade i dati smettono di
  -- arrivare **in silenzio**: il cruscotto continuerebbe a mostrare numeri
  -- sempre piu' vecchi. E' il guasto peggiore possibile per un'applicazione
  -- che esiste per essere creduta.
  --
  -- La chiave contiene la data di scadenza: rinnovando, la scadenza cambia e
  -- un avviso futuro sara' un avviso nuovo invece di essere silenziato da
  -- quello vecchio.
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

  -- Una sincronizzazione fallita, se dopo non ne e' riuscita nessuna. Il
  -- controllo sul "dopo" e' cio' che distingue un guasto in corso da uno gia'
  -- rientrato: senza, un fallimento di tre mesi fa resterebbe segnalato per
  -- sempre.
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

  -- -------------------------------------------------------------------
  -- Il costo ricorrente e' cambiato
  -- -------------------------------------------------------------------
  -- Aumento di prezzo. Il confronto e' fra l'**ultimo importo pagato**
  -- (`expected_amount`) e il **prezzo tipico** (`typical_amount`, la mediana):
  -- e' la ragione per cui in Fase 5 sono due colonne diverse invece di una.
  -- Confrontare l'ultimo con l'ultimo non direbbe niente, e confrontarlo con
  -- la media lo farebbe scattare a ogni oscillazione.
  --
  -- Due soglie insieme, e servono entrambe: il 10% da solo segnalerebbe un
  -- canone da 2,99 che passa a 3,49, e un euro da solo segnalerebbe ogni
  -- servizio a consumo.
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

  -- Un abbonamento nuovo nella metrica. E' l'avviso che l'applicazione esiste
  -- per dare: un costo ricorrente comparso senza che nessuno lo decidesse.
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
  on conflict (dedupe_key) do nothing;
  get diagnostics aggiunti = row_count; creati := creati + aggiunti;

  -- Dichiarato non usato, e si paga ancora. La chiave non contiene la data:
  -- e' un avviso solo, e torna solo se lo stato cambia e poi ridiventa
  -- «non usato».
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

  -- -------------------------------------------------------------------
  -- Due segnali sui movimenti
  -- -------------------------------------------------------------------
  -- Doppio addebito: stesso esercente, stesso importo, a un giorno di
  -- distanza. La soglia sull'importo non e' arbitraria — due caffe' uguali
  -- nello stesso giorno sono normali, due addebiti da 40 € no — e senza,
  -- questo avviso sarebbe solo rumore.
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
    and a.booking_date >= current_date - 60
  on conflict (dedupe_key) do nothing;
  get diagnostics aggiunti = row_count; creati := creati + aggiunti;

  -- Picco di categoria, sull'**ultimo mese completo**.
  --
  -- Il mese in corso non si confronta con mesi interi: sarebbe la stessa
  -- lettura sbagliata gia' corretta sul cruscotto in Fase 6-bis, e qui
  -- produrrebbe un avviso falso ogni primo del mese — cioe' un avviso che
  -- insegna a ignorare gli avvisi.
  --
  -- Il termine di paragone e' la mediana **scelta** (`percentile_disc`), che e'
  -- un mese realmente osservato: una media produrrebbe un valore che non e'
  -- mai stato speso in nessun mese.
  insert into public.alerts (type, severity, title, body, payload,
                             related_category_id, dedupe_key)
  with ultimo_completo as (
    select (date_trunc('month', current_date) - interval '1 month')::date as mese
  ),
  storia as (
    select v.category_id, v.categoria, v.mese, v.spesa
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
$$;

comment on function public.genera_alert() is
  'Genera gli avvisi. Rieseguibile: `dedupe_key` impedisce le copie, e un avviso gia'' letto o ignorato non torna a galla.';

revoke all on function public.genera_alert() from public;
grant execute on function public.genera_alert() to authenticated;

-- ---------------------------------------------------------------------------
-- v_avvisi — con quanto vale ciascuno
-- ---------------------------------------------------------------------------

create view public.v_avvisi with (security_invoker = on) as
select a.id, a.type, a.severity, a.title, a.body, a.payload, a.status,
       a.created_at, a.read_at,
       a.related_transaction_id, a.related_subscription_id, a.related_category_id,
       s.merchant_id,
       -- L'ordine con cui si leggono: prima cio' che rompe i numeri, poi cio'
       -- che costa, poi il resto.
       case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end as peso
from public.alerts a
left join public.subscriptions s on s.id = a.related_subscription_id;

grant select on public.v_avvisi to authenticated;

notify pgrst, 'reload schema';
