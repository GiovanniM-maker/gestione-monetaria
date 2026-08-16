-- 0046_la_classe_si_valida_dalla_tabella.sql
--
-- Cinque funzioni avevano la lista delle quattro classi scritta dentro:
--
--     if p_discrezionalita not in ('essenziale', 'investimento', 'utile', 'voluttuario')
--
-- Cinque copie della stessa regola, che con le classi modificabili non
-- diventano solo obsolete: diventano **sbagliate**. Una classe creata ieri
-- verrebbe rifiutata da tutte e cinque con un messaggio che elenca quattro
-- valori inesistenti, e chi la legge penserebbe di aver sbagliato a scriverla.
--
-- La foreign key della 0043 impedisce comunque di scrivere una classe che non
-- esiste — quindi la correttezza non dipende da queste righe. Quello che
-- dipende da queste righe e' il **messaggio**: un errore di vincolo in inglese
-- con dentro un nome di constraint non dice a nessuno cosa fare. Per questo la
-- validazione resta, e diventa una funzione sola.
--
-- Una regola scritta in un posto solo non puo' divergere da se stessa. E' lo
-- stesso ragionamento della colonna `nella_metrica` in Fase 5 e della query
-- unica di `cerca_movimenti` in Fase 6-bis.

-- ---------------------------------------------------------------------------
-- valida_classe — il posto solo
-- ---------------------------------------------------------------------------
-- `null` passa: non e' un errore, e' «non ancora classificato», ed e' proprio
-- il numero che `/revisione` esiste per far scendere.
--
-- Il messaggio elenca le classi **vere**, lette adesso. Una classe archiviata
-- resta valida: nasconderla dai selettori e rifiutarla in scrittura sono due
-- cose diverse, e la seconda romperebbe ogni correzione su uno storico
-- classificato con una classe che oggi non si usa piu'.

create or replace function public.valida_classe(p_slug text)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_slug is null then
    return;
  end if;

  if not exists (select 1 from public.discretion_classes where slug = p_slug) then
    raise exception 'Discrezionalita'' non ammessa: %. Valori validi: %.',
      p_slug,
      coalesce(
        (select string_agg(slug, ', ' order by sort_order) from public.discretion_classes),
        'nessuna classe definita'
      );
  end if;
end;
$$;

comment on function public.valida_classe(text) is
  'Rifiuta una classe di discrezionalita'' inesistente, elencando quelle vere. `null` passa: e'' «non ancora classificato».';

revoke all on function public.valida_classe(text) from public;
grant execute on function public.valida_classe(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Le cinque che la usano
-- ---------------------------------------------------------------------------
-- I corpi sono quelli di sempre: cambia la riga che validava, e nient'altro.

create or replace function public.crea_categoria(
  p_nome            text,
  p_padre_id        uuid default null,
  p_discrezionalita text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome       text := btrim(coalesce(p_nome, ''));
  v_base       text;
  v_slug       text;
  v_profondita int := 0;
  v_id         uuid;
  v_n          int := 1;
begin
  if v_nome = '' then
    raise exception 'Il nome della categoria non puo'' essere vuoto.';
  end if;

  perform public.valida_classe(p_discrezionalita);

  if p_padre_id is not null then
    select coalesce(max(profondita), -1) into v_profondita
    from public.v_categorie_albero where id = p_padre_id;

    if v_profondita < 0 then
      raise exception 'La categoria padre % non esiste.', p_padre_id;
    end if;
    -- Oltre il decimo livello il roll-up mensile smette di risalire, e la
    -- spesa di questa categoria sparirebbe dai totali del ramo senza che
    -- niente lo segnali.
    if v_profondita >= 9 then
      raise exception 'La categoria padre e'' gia'' al livello %: l''albero non puo'' scendere oltre il decimo.',
        v_profondita;
    end if;
  end if;

  -- Gia' esistente sotto lo stesso padre: si riusa.
  select id into v_id
  from public.categories
  where lower(btrim(name)) = lower(v_nome)
    and parent_id is not distinct from p_padre_id
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  v_base := regexp_replace(
              lower(translate(v_nome, 'àáâãäèéêëìíîïòóôõöùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn')),
              '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  if v_base = '' then v_base := 'categoria'; end if;

  v_slug := v_base;
  while exists (select 1 from public.categories where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.categories (parent_id, name, slug, default_discretion)
  values (p_padre_id, v_nome, v_slug, p_discrezionalita)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.aggiorna_categoria(
  p_id              uuid,
  p_nome            text default null,
  p_discrezionalita text default null,
  p_parent_id       uuid default null,
  p_cambia_padre    boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
begin
  if p_id is null then
    raise exception 'Categoria non indicata.';
  end if;

  perform public.valida_classe(p_discrezionalita);

  if p_cambia_padre and p_parent_id is not null then
    if p_parent_id = p_id then
      raise exception 'Una categoria non puo'' essere figlia di se stessa.';
    end if;
    -- Il padre nuovo non puo' stare **sotto** la categoria che si sposta: e'
    -- la condizione che crea il ciclo.
    if exists (
      select 1 from public.v_albero_categorie
      where antenato = p_id and discendente = p_parent_id
    ) then
      raise exception 'Non si puo'' appendere una categoria a una delle sue discendenti: si creerebbe un ciclo.';
    end if;
  end if;

  update public.categories
     set name              = coalesce(v_nome, name),
         default_discretion = coalesce(p_discrezionalita, default_discretion),
         parent_id         = case when p_cambia_padre then p_parent_id else parent_id end
   where id = p_id;

  return found;
end;
$$;

create or replace function public.crea_esercente(
  p_nome            text,
  p_categoria_id    uuid    default null,
  p_discrezionalita text    default null,
  p_contesto        text    default null,
  p_abbonamento     boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_id   uuid;
begin
  if v_nome = '' then
    raise exception 'Il nome dell''esercente non puo'' essere vuoto.';
  end if;

  perform public.valida_classe(p_discrezionalita);

  if p_contesto is not null and p_contesto not in ('personale', 'business') then
    raise exception 'Contesto non ammesso: %.', p_contesto;
  end if;

  if p_categoria_id is not null
     and not exists (select 1 from public.categories where id = p_categoria_id) then
    raise exception 'La categoria % non esiste.', p_categoria_id;
  end if;

  -- `canonical_norm` e' generata: il confronto passa da li', cosi' due nomi che
  -- differiscono per maiuscole o spazi non producono due esercenti.
  select id into v_id
  from public.merchants
  where canonical_norm = lower(regexp_replace(v_nome, '\s+', ' ', 'g'));

  if v_id is not null then
    return v_id;
  end if;

  insert into public.merchants
    (canonical_name, category_id, discretion, context, is_subscription, origine, confermato_at)
  values
    (v_nome, p_categoria_id, p_discrezionalita, p_contesto, coalesce(p_abbonamento, false),
     -- Nasce gia' confermato: l'ha creato una persona, non il modello.
     'manuale', now())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.riclassifica_esercente(
  p_merchant_id     uuid,
  p_categoria_slug  text,
  p_discrezionalita text,
  p_contesto        text,
  p_abbonamento     boolean,
  p_motivazione     text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria uuid;
begin
  -- Qui la classe e' obbligatoria: questa funzione riscrive una
  -- classificazione, e riscriverla lasciandola vuota non e' una
  -- classificazione.
  if p_discrezionalita is null then
    raise exception 'Discrezionalita'' non indicata.';
  end if;
  perform public.valida_classe(p_discrezionalita);

  if p_contesto not in ('personale', 'business') then
    raise exception 'Contesto non ammesso: %.', p_contesto;
  end if;

  select id into v_categoria from public.categories where slug = p_categoria_slug;
  if v_categoria is null then
    raise exception 'Categoria inesistente: %.', p_categoria_slug;
  end if;

  update public.merchants
     set category_id     = v_categoria,
         discretion      = p_discrezionalita,
         context         = p_contesto,
         is_subscription = coalesce(p_abbonamento, is_subscription),
         motivazione     = coalesce(nullif(btrim(coalesce(p_motivazione, '')), ''), motivazione)
   where id = p_merchant_id
     -- La corsa che conta: fra la lettura della lista e questa scrittura passa
     -- una chiamata al modello, e in quei secondi l'utente puo' aver confermato
     -- l'esercente dal telefono. In quel caso non si scrive.
     and confermato_at is null
     and origine = 'ai';

  return found;
end;
$$;

create or replace function public.categorizza_movimento(
  p_id              uuid,
  p_categoria_id    uuid    default null,
  p_discrezionalita text    default null,
  p_contesto        text    default null,
  p_note            text    default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_id is null then
    raise exception 'Movimento non indicato.';
  end if;

  perform public.valida_classe(p_discrezionalita);

  if p_contesto is not null and p_contesto not in ('personale', 'business') then
    raise exception 'Contesto non ammesso: %', p_contesto;
  end if;

  if p_categoria_id is not null
     and not exists (select 1 from public.categories where id = p_categoria_id) then
    raise exception 'Categoria inesistente.';
  end if;

  update public.transactions
     set category_id = coalesce(p_categoria_id, category_id),
         discretion  = coalesce(p_discrezionalita, discretion),
         context     = coalesce(p_contesto, context),
         notes       = case when p_note is null or btrim(p_note) = ''
                            then notes else btrim(p_note) end,
         manually_categorized = true,
         confermato_at = now(),
         updated_at = now()
   where id = p_id;

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- spesa_per_classe — il nome della classe arriva fino al modello
-- ---------------------------------------------------------------------------
-- Cambia il tipo di ritorno, quindi va eliminata e ricreata: `create or
-- replace` non puo' cambiare le colonne di una funzione che restituisce una
-- tabella.
--
-- `classe_nome` accanto allo slug non e' ridondanza: uno slug e' `voluttuario`,
-- un nome puo' essere «Sfizi del sabato», e il modello che racconta la spesa
-- deve poter scrivere il secondo. Senza, direbbe lo slug — cioe' una parola
-- che l'utente ha esplicitamente cambiato.

drop function if exists public.spesa_per_classe(date, date);

create function public.spesa_per_classe(p_da date, p_a date)
returns table (
  discrezionalita text, classe_nome text, contesto text, spesa text, movimenti bigint
)
language sql stable security invoker set search_path = ''
as $$
  select v.discrezionalita, max(v.classe_nome), v.contesto, sum(v.spesa)::text, sum(v.movimenti)
  from public.v_monthly_by_discretion v
  where v.mese between date_trunc('month', p_da)::date and date_trunc('month', p_a)::date
  group by 1, 3
  order by sum(v.spesa);
$$;

comment on function public.spesa_per_classe(date, date) is
  'Spesa per classe e contesto su un intervallo di mesi. Non conosce `nel_ricorrente`: la spesa del mese non si filtra per classe.';

revoke all on function public.spesa_per_classe(date, date) from public;
grant execute on function public.spesa_per_classe(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- metriche_report — `nel_ricorrente` arriva nei dati, non nel prompt
-- ---------------------------------------------------------------------------
-- La difesa non sono le istruzioni: e' che il modello non abbia di che
-- sbagliare. Un flag accanto alla riga gli dice quali voci il totale somma;
-- una frase nel prompt gli chiederebbe di ricordarselo, e la Fase 9 ha gia'
-- misurato quanto vale quel tipo di richiesta — le istruzioni «non calcolare
-- niente» c'erano, in maiuscolo, e non sono bastate.
--
-- Il resto del corpo e' identico alla 0025.

create or replace function public.metriche_report(p_mese date)
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
             'classe', d.classe_nome,
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
             'classe', r.classe_nome,
             -- Falso significa: sta nella ripartizione, NON nel totale.
             -- E' una spesa ricorrente che l'utente ha dichiarato di non
             -- voler togliere: risparmio, tasse, una rata.
             'nel_totale', r.nel_ricorrente,
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
  'Gli aggregati esatti che il modello riceve per scrivere il report. Ogni cifra e'' calcolata qui: al modello restano le frasi intorno.';

revoke all on function public.metriche_report(date) from public;
grant execute on function public.metriche_report(date) to authenticated;

notify pgrst, 'reload schema';
