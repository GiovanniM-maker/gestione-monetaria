-- 0026_copilota.sql
--
-- Fase 10: il copilot.
--
-- ---------------------------------------------------------------------------
-- Quasi tutto quello che serve esiste gia'
-- ---------------------------------------------------------------------------
-- La regola scritta in CLAUDE.md fin dalla Fase 0 — «ogni operazione dev'essere
-- raggiungibile dal copilot, non solo da un bottone» — si paga qui. Le letture
-- sono viste (`v_monthly_by_category`, `v_subscriptions`, `v_avvisi`, …), le
-- ricerche sono funzioni (`cerca_movimenti`, `spesa_nei_primi_giorni`), le
-- scritture sono funzioni (`conferma_movimento`, `correggi_movimento`) o
-- funzioni TypeScript con una firma esplicita. Un modello puo' usarle tutte
-- cosi' come sono.
--
-- Restano quattro cose che non c'erano, ed e' tutto il contenuto di questa
-- migration:
--
-- 1. **`crea_categoria`** — l'unica operazione dell'elenco della Fase 10 che
--    non esisteva da nessuna parte. «Creane una nuova» non era possibile
--    nemmeno da un bottone.
-- 2. **Le somme su un intervallo di mesi**, sopra le viste mensili. Le
--    schermate guardano sempre un mese; una domanda no.
-- 3. **`chat_messages`** — dove restano le conversazioni, con i dati che il
--    modello ha davvero ricevuto.
-- 4. **`v_categorie_albero`** — la tassonomia in una forma leggibile da chi
--    non conosce lo schema.

-- ---------------------------------------------------------------------------
-- v_categorie_albero
-- ---------------------------------------------------------------------------
-- Serve a mettere l'intera tassonomia nelle istruzioni di sistema, con i suoi
-- identificativi. Con l'albero sotto gli occhi il modello risolve «ristoranti»
-- in un `uuid` senza chiedere niente; senza, ogni domanda comincerebbe con un
-- giro di ricerca — e un giro in piu' e' una chiamata in piu' e un'occasione in
-- piu' di sbagliare bersaglio.
--
-- Trentacinque categorie stanno in poche centinaia di token: e' piu' economico
-- mandarle sempre che cercarle una volta su due.

create or replace view public.v_categorie_albero with (security_invoker = on) as
with recursive discesa as (
  select c.id, c.parent_id, c.name, c.slug, c.default_discretion, c.is_archived,
         c.sort_order, 0 as profondita, c.name::text as percorso
  from public.categories c
  where c.parent_id is null
  union all
  select c.id, c.parent_id, c.name, c.slug, c.default_discretion, c.is_archived,
         c.sort_order, d.profondita + 1, d.percorso || ' > ' || c.name
  from discesa d
  join public.categories c on c.parent_id = d.id
  -- Lo stesso limite del roll-up mensile, per la stessa ragione: `parent_id` e'
  -- modificabile, e da questa fase in poi lo modifica anche il copilot.
  where d.profondita < 10
)
select id, parent_id, name as nome, slug, default_discretion as discrezionalita_predefinita,
       is_archived as archiviata, profondita, percorso
from discesa;

comment on view public.v_categorie_albero is
  'La tassonomia con il percorso per esteso. Nasce per essere letta dal copilot.';

grant select on public.v_categorie_albero to authenticated;

-- ---------------------------------------------------------------------------
-- crea_categoria
-- ---------------------------------------------------------------------------
-- Lo slug si costruisce qui e non lo si chiede a chi chiama. E' un dettaglio
-- dello schema — un vincolo di unicita' su una colonna tecnica — e farlo
-- scegliere a un modello significherebbe farlo sbagliare: due categorie con lo
-- stesso slug producono un errore di vincolo incomprensibile, e uno slug scelto
-- male resta li' per sempre.
--
-- **Rieseguire non duplica.** Se una categoria con lo stesso nome esiste gia'
-- sotto lo stesso padre, si restituisce quella. Non e' indulgenza: il copilot
-- propone e l'utente applica con un tocco, e un tocco ripetuto su un telefono
-- non deve creare «Ristoranti» due volte. Il nome si confronta senza
-- maiuscole e senza spazi ai bordi, che e' l'unico modo in cui due utenti
-- diversi della stessa app — l'umano e il modello — scriverebbero la stessa
-- parola in modo diverso.

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

  if p_discrezionalita is not null
     and p_discrezionalita not in ('essenziale', 'investimento', 'utile', 'voluttuario') then
    raise exception 'Discrezionalita'' non ammessa: %. Valori validi: essenziale, investimento, utile, voluttuario.',
      p_discrezionalita;
  end if;

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

comment on function public.crea_categoria(text, uuid, text) is
  'Crea una categoria, o restituisce quella omonima gia'' presente sotto lo stesso padre.';

revoke all on function public.crea_categoria(text, uuid, text) from public;
grant execute on function public.crea_categoria(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Le somme su un periodo
-- ---------------------------------------------------------------------------
-- «Quanto ho speso in ristoranti da marzo a luglio» e' una domanda su cinque
-- mesi, e le viste mensili rispondono un mese per volta. Sommarle in TypeScript
-- e' vietato dalle regole di correttezza, e per una ragione che qui si vede
-- bene: la somma la farebbe il codice della schermata, e il modello — che non
-- ha quel codice — la rifarebbe a modo suo.
--
-- Queste tre funzioni sommano **le viste**, non le tabelle. E' la differenza
-- che conta: il roll-up sull'albero, l'esclusione dei giroconti, l'uso di
-- `amount_eur` restano scritti in un posto solo. Una seconda query sulle
-- transazioni sarebbe una seconda definizione di «spesa reale», e due
-- definizioni divergono.
--
-- Gli importi escono come **testo**, come ovunque: PostgREST serializza
-- `numeric` come numero JSON, cioe' float.

create or replace function public.spesa_per_categoria(p_da date, p_a date)
returns table (
  category_id uuid, categoria text, parent_id uuid,
  spesa text, spesa_diretta text, movimenti bigint
)
language sql stable security invoker set search_path = ''
as $$
  select v.category_id, v.categoria, v.parent_id,
         sum(v.spesa)::text, sum(v.spesa_diretta)::text, sum(v.movimenti)
  from public.v_monthly_by_category v
  where v.mese between date_trunc('month', p_da)::date and date_trunc('month', p_a)::date
  group by 1, 2, 3
  order by sum(v.spesa);
$$;

comment on function public.spesa_per_categoria(date, date) is
  'Spesa per categoria su un intervallo di mesi, con il roll-up gia'' applicato dalla vista.';

create or replace function public.spesa_per_esercente(p_da date, p_a date, p_limite int default 25)
returns table (
  merchant_id uuid, esercente text, discrezionalita text, contesto text,
  spesa text, movimenti bigint
)
language sql stable security invoker set search_path = ''
as $$
  select v.merchant_id, v.esercente,
         -- La discrezionalita' vive sulla transazione, quindi lo stesso
         -- esercente puo' comparire con classi diverse: `max` sceglie la
         -- prevalente per ordine alfabetico invece di moltiplicare le righe.
         -- Chi vuole il dettaglio guarda i movimenti.
         max(v.discrezionalita), max(v.contesto),
         sum(v.spesa)::text, sum(v.movimenti)
  from public.v_monthly_by_merchant v
  where v.mese between date_trunc('month', p_da)::date and date_trunc('month', p_a)::date
  group by 1, 2
  order by sum(v.spesa)
  limit greatest(1, least(coalesce(p_limite, 25), 50));
$$;

create or replace function public.spesa_per_classe(p_da date, p_a date)
returns table (
  discrezionalita text, contesto text, spesa text, movimenti bigint
)
language sql stable security invoker set search_path = ''
as $$
  select v.discrezionalita, v.contesto, sum(v.spesa)::text, sum(v.movimenti)
  from public.v_monthly_by_discretion v
  where v.mese between date_trunc('month', p_da)::date and date_trunc('month', p_a)::date
  group by 1, 2
  order by sum(v.spesa);
$$;

revoke all on function public.spesa_per_categoria(date, date) from public;
revoke all on function public.spesa_per_esercente(date, date, int) from public;
revoke all on function public.spesa_per_classe(date, date) from public;
grant execute on function public.spesa_per_categoria(date, date) to authenticated;
grant execute on function public.spesa_per_esercente(date, date, int) to authenticated;
grant execute on function public.spesa_per_classe(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
-- Perche' si conserva quello che il modello ha ricevuto, e non solo quello che
-- ha scritto: e' lo stesso ragionamento di `reports.metrics`. Fra sei mesi,
-- davanti a una frase che non torna, senza i dati non si potrebbe dire se ha
-- sbagliato il modello o la query — sarebbero indistinguibili, e si finirebbe
-- per dubitare di entrambi.
--
-- `cifre_inventate` e' il verdetto del controllo automatico: le cifre che
-- comparivano nella risposta e non nei dati. Si salva insieme al messaggio
-- perche' un avviso mostrato una volta e poi perso non serve a niente —
-- riaprendo la conversazione domani, la frase dubbia deve essere ancora
-- marcata.

create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  conversazione_id uuid not null,
  ruolo            text not null check (ruolo in ('utente', 'copilota')),
  testo            text not null,
  /** Le operazioni eseguite e i dati ricevuti. E' la prova, non un residuo. */
  strumenti        jsonb,
  /** Le proposte di scrittura in attesa, o gia' applicate. */
  proposte         jsonb,
  /** Cifre scritte dal modello che nei dati non c'erano. */
  cifre_inventate  text[],
  model            text,
  tokens_used      int,
  created_at       timestamptz not null default now()
);

create index if not exists chat_messages_conversazione_idx
  on public.chat_messages (conversazione_id, created_at);

alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;

drop policy if exists chat_messages_app_user on public.chat_messages;

create policy chat_messages_app_user on public.chat_messages
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

grant select, insert, update, delete on public.chat_messages to authenticated;

-- Le conversazioni, per poterle riaprire. Il titolo e' la prima cosa chiesta:
-- e' l'unica etichetta che descriva davvero di cosa si e' parlato, e non
-- richiede di chiedere a un modello di riassumersi.
create or replace view public.v_conversazioni with (security_invoker = on) as
select conversazione_id,
       min(created_at) as iniziata_at,
       max(created_at) as ultima_at,
       count(*)        as messaggi,
       (array_agg(testo order by created_at) filter (where ruolo = 'utente'))[1] as titolo
from public.chat_messages
group by conversazione_id;

grant select on public.v_conversazioni to authenticated;

notify pgrst, 'reload schema';
