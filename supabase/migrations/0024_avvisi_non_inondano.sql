-- 0024_avvisi_non_inondano.sql
--
-- Correzione della 0023, trovata al primo giro vero: **53 avvisi in una volta**.
--
-- ---------------------------------------------------------------------------
-- Nuovo per noi non vuol dire nuovo nel mondo
-- ---------------------------------------------------------------------------
-- `new_subscription` scattava su `subscriptions.created_at`, cioe' su quando
-- **la nostra tabella** ha imparato che quella ricorrenza esiste. Ma la tabella
-- e' nata due giorni fa: al primo giro ogni abbonamento risultava nuovo, anche
-- Netflix che paghi da undici mesi.
--
-- L'errore non e' un caso limite, e' una confusione fra due cose: la data in
-- cui un costo e' comparso nel mondo (`first_seen`) e la data in cui questa
-- applicazione se n'e' accorta (`created_at`). Servono **entrambe**, e in
-- congiunzione: l'abbonamento dev'essere comparso da poco *e* averlo appena
-- scoperto. Da sola, la seconda trasforma ogni prima esecuzione di un
-- rilevatore in un'inondazione.
--
-- E un'inondazione al primo giro e' il peggior esordio possibile per un canale
-- di avvisi: insegna nella prima sessione che quel canale si ignora. Era la
-- cosa che la 0023 diceva a parole di voler evitare.

create or replace function public.genera_alert()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
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

-- ---------------------------------------------------------------------------
-- Ripulire l'inondazione gia' creata
-- ---------------------------------------------------------------------------
-- Solo gli avvisi che la regola corretta **non avrebbe creato**, e solo quelli
-- ancora `new`: uno gia' letto o ignorato e' una cosa che l'utente ha visto, e
-- cancellargliela sotto il naso sarebbe peggio del difetto.
--
-- `dedupe_key` resta il criterio di unicita': cancellando la riga, un
-- abbonamento che tornasse a qualificarsi genererebbe un avviso nuovo. E'
-- corretto — quel giorno sarebbe davvero nuovo.

delete from public.alerts a
using public.subscriptions s
where a.type = 'new_subscription'
  and a.status = 'new'
  and a.related_subscription_id = s.id
  and s.first_seen < current_date - 120;

delete from public.alerts a
using public.transactions t
where a.type = 'possible_duplicate'
  and a.status = 'new'
  and a.related_transaction_id = t.id
  and t.booking_date < current_date - 14;

notify pgrst, 'reload schema';
