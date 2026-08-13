-- 0025_report.sql
--
-- Fase 9: il report periodico.
--
-- ---------------------------------------------------------------------------
-- Il modello non calcola nemmeno una cifra
-- ---------------------------------------------------------------------------
-- `metriche_report()` produce **tutti** i numeri del report, in SQL. Al modello
-- arriva quel jsonb e nient'altro, e il suo compito e' scrivere le frasi
-- intorno a numeri che ha gia' in mano.
--
-- Non e' prudenza generica. In Fase 4, su cento proposte, il modello ha
-- ragionato dall'importo quando il nome non bastava («importo alto suggerisce
-- spesa casa») e ha inventato una motivazione plausibile pur di averne una.
-- Un modello che *scrive* numeri li sbaglia allo stesso modo, e in un report li
-- sbaglia in modo credibile — che e' peggio, perche' nessuno li ricontrolla.
--
-- Lo stesso jsonb si salva in `reports.metrics`: fra sei mesi, davanti a una
-- frase che non torna, si potra' dire se ha sbagliato il modello o il calcolo.
-- Senza, sarebbero indistinguibili.

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  period_type  text not null check (period_type in ('weekly', 'monthly')),
  period_start date not null,
  period_end   date not null,
  /** Gli aggregati esatti passati al modello. E' la prova, non un residuo. */
  metrics      jsonb not null,
  content_md   text,
  model        text,
  tokens_used  int,
  created_at   timestamptz not null default now(),

  -- Un report per periodo. Rigenerarlo sovrascrive invece di accumulare copie:
  -- due report dello stesso mese che dicono cose diverse sono peggio di nessun
  -- report.
  constraint reports_periodo_unico unique (period_type, period_start)
);

alter table public.reports enable row level security;
alter table public.reports force row level security;

create policy reports_app_user on public.reports
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

grant select, insert, update, delete on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- metriche_report() — tutti i numeri, e solo numeri
-- ---------------------------------------------------------------------------
-- Gli importi escono come **testo**: `jsonb` userebbe il tipo numerico di
-- JavaScript, cioe' un float, e tutta la catena di questa applicazione lo
-- evita. Un report e' l'ultimo posto dove ha senso perdere un centesimo.
--
-- I nomi degli esercenti escono da qui **grezzi**: la selezione di cosa possa
-- arrivare a un modello non e' un problema di SQL, e sta dove sta gia' — in
-- `selezionaInviabili`, che applica la regola 8. Farla in due posti
-- significherebbe due regole di sicurezza che possono divergere, ed e' proprio
-- la divergenza a produrre le fughe.

create function public.metriche_report(p_mese date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with periodo as (
  select date_trunc('month', p_mese)::date as inizio,
         (date_trunc('month', p_mese) + interval '1 month - 1 day')::date as fine
),
-- Il mese, e i sei precedenti per il confronto.
mesi as (
  select v.mese, v.spesa, v.movimenti, v.senza_cambio, v.senza_categoria
  from public.v_monthly_totals v, periodo p
  where v.mese <= p.inizio and v.mese > p.inizio - interval '7 months'
),
questo as (select * from mesi, periodo p where mesi.mese = p.inizio),
precedenti as (select * from mesi, periodo p where mesi.mese < p.inizio),
riferimento as (
  -- Mediana **scelta**: un mese realmente osservato. Una media produrrebbe un
  -- valore che non e' mai stato speso in nessun mese, e il modello lo
  -- racconterebbe come se fosse successo.
  select percentile_disc(0.5) within group (order by spesa) as spesa_tipica,
         count(*) as mesi_confronto
  from precedenti
)
select jsonb_build_object(
  'periodo', jsonb_build_object(
    'tipo', 'monthly',
    'inizio', (select inizio from periodo),
    'fine', (select fine from periodo)
  ),

  'totali', jsonb_build_object(
    'spesa', (select spesa::text from questo),
    'movimenti', (select movimenti from questo),
    'spesa_tipica_mesi_precedenti', (select spesa_tipica::text from riferimento),
    'mesi_di_confronto', (select mesi_confronto from riferimento),
    'entrate', (select coalesce(entrate, 0)::text from public.v_monthly_income, periodo
                 where mese = periodo.inizio),
    -- Quanto il report non sa. Va dato al modello perche' possa dirlo: un
    -- racconto che tace le proprie lacune e' meno utile di uno che le nomina.
    'movimenti_senza_categoria', (select senza_categoria from questo),
    'movimenti_senza_cambio', (select senza_cambio from questo)
  ),

  'per_classe', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'discrezionalita', d.discrezionalita,
             'contesto', d.contesto,
             'spesa', d.spesa::text,
             'movimenti', d.movimenti
           ) order by d.spesa), '[]'::jsonb)
    from public.v_monthly_by_discretion d, periodo p
    where d.mese = p.inizio
  ),

  'ricorrente', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tipo', r.tipo,
             'discrezionalita', r.discrezionalita,
             'contesto', r.contesto,
             'voci', r.ricorrenze,
             'costo_mensile', r.costo_mensile::text
           ) order by r.costo_mensile), '[]'::jsonb)
    from public.v_recurring_monthly_cost_by_discretion r
  ),

  -- Le categorie del mese, con il loro tipico. Il confronto e' gia' calcolato:
  -- al modello resta da dire quale salta all'occhio, non quanto vale.
  'categorie', (
    select coalesce(jsonb_agg(x order by x->>'spesa'), '[]'::jsonb) from (
      select jsonb_build_object(
               'categoria', c.categoria,
               'spesa', c.spesa::text,
               'movimenti', c.movimenti,
               'spesa_tipica', t.tipica::text
             ) as x
      from public.v_monthly_by_category c
      join periodo p on c.mese = p.inizio
      left join lateral (
        select percentile_disc(0.5) within group (order by v.spesa) as tipica
        from public.v_monthly_by_category v
        where v.category_id = c.category_id
          and v.mese < p.inizio
          and v.mese > p.inizio - interval '7 months'
      ) t on true
      where c.parent_id is null
      order by c.spesa
      limit 12
    ) as sub
  ),

  'esercenti', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'esercente', m.esercente,
             'spesa', m.spesa::text,
             'movimenti', m.movimenti,
             'discrezionalita', m.discrezionalita
           ) order by m.spesa), '[]'::jsonb)
    from (
      select * from public.v_monthly_by_merchant mm, periodo p
      where mm.mese = p.inizio and mm.merchant_id is not null
      order by mm.spesa limit 12
    ) m
  ),

  -- Degli avvisi escono il tipo, la gravita' e **l'esercente separato**, non
  -- il titolo gia' composto.
  --
  -- Un titolo come «Netflix: il prezzo e' salito» e' una frase che contiene un
  -- nome, e un filtro che decide se un NOME puo' uscire non sa cosa fare di una
  -- frase: la lascerebbe passare intera, oppure la sostituirebbe intera. Con il
  -- nome in un campo suo, la regola 8 lo tratta come tratta ogni altro nome, e
  -- la frase la compone il modello.
  'avvisi_aperti', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tipo', a.type, 'gravita', a.severity, 'esercente', m.canonical_name
           ) order by a.severity, a.created_at desc), '[]'::jsonb)
    from public.alerts a
    left join public.subscriptions sub on sub.id = a.related_subscription_id
    left join public.merchants m on m.id = sub.merchant_id
    where a.status = 'new'
  ),

  -- Quanto ci si puo' fidare del resto. Se la copertura fosse bassa, ogni
  -- cifra di questo report varrebbe di meno, e il modello deve poterlo dire.
  'copertura', (
    select jsonb_build_object(
      'spese_classificate', count(*) filter (where category_id is not null),
      'spese_totali', count(*)
    )
    from public.v_expenses e, periodo p
    where e.booking_date between p.inizio and p.fine
  )
);
$$;

comment on function public.metriche_report(date) is
  'Tutti i numeri di un report mensile. Il modello riceve questo e non calcola niente.';

revoke all on function public.metriche_report(date) from public;
grant execute on function public.metriche_report(date) to authenticated;

notify pgrst, 'reload schema';
