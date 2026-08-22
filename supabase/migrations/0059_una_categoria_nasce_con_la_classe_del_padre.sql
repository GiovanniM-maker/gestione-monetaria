-- ===========================================================================
-- 0059 — Una categoria nasce con la classe del padre
-- ===========================================================================
-- La 0058 ha chiuso il **lato che legge** la cascata: le tre scritture manuali
-- ora ereditano `default_discretion` dalla categoria invece di lasciare la
-- riga senza classe. Ma resta aperto il lato che **scrive**: una categoria puo'
-- ancora nascere senza niente da dare.
--
-- `crea_categoria` inserisce `default_discretion = p_discrezionalita`, e i due
-- percorsi che la chiamano dall'interfaccia — il «+ Nuova categoria» in cima al
-- foglio di scelta, e il suo gemello su `/da-confermare` — mandano il nome e il
-- padre e basta. La classe li' non si chiede, e non e' una dimenticanza: il
-- momento in cui ci si accorge che una categoria manca e' mentre si sta
-- classificando un movimento, e fermarsi a dichiarare una classe di
-- discrezionalita' in mezzo a quel gesto e' esattamente il passaggio che quel
-- bottone esiste per togliere.
--
-- Il risultato pero' e' il difetto della 0058 che rientra da un'altra porta:
--
--   1. si crea «Pizzeria» dentro «Ristorazione» dal foglio;
--   2. nasce con `default_discretion` a `null`;
--   3. il movimento le viene assegnato subito dopo, `classe_ereditata` non
--      trova niente da ereditare, e la riga resta «Non classificato».
--
-- E questa volta nemmeno il giro notturno rimedia, perche' non c'e' un valore
-- da nessuna parte: non e' una regola che non viene letta, e' un dato assente.
--
-- **Il padre e' la risposta, e non e' un ripiego generico.** Chi crea
-- «Pizzeria» dentro «Ristorazione» non sta dichiarando una classe nuova: sta
-- suddividendo una che c'e' gia'. La classe della figlia e' quella del padre
-- fino a prova contraria, ed e' la stessa forma della cascata
-- esercente → categoria, un piano piu' su.
--
-- Una categoria di **primo livello** creata senza classe resta senza: non c'e'
-- nessuno a cui chiederla, e inventarne una sarebbe peggio che lasciarla
-- vuota — un valore predefinito scelto dal database finirebbe su tutta la
-- spesa di quel ramo senza che nessuno l'abbia deciso. Si vede in `/categorie`
-- e si riempie li'.
--
-- Perche' in SQL e non nei due componenti: sono due, diventerebbero tre, e la
-- terza sarebbe quella del copilota — che chiama la stessa funzione. E' la
-- lezione della 0058, applicata prima di ripagarla.
--
-- Rieseguibile: `create or replace` e una riparazione con il ripiego nel
-- `where`.
-- ===========================================================================

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
  v_classe     text := p_discrezionalita;
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

    -- La classe del padre, quando chi crea non ne ha indicata una. Solo come
    -- ripiego: una classe dichiarata vince sempre, perche' e' una scelta e
    -- questa e' una supposizione — per quanto quasi sempre giusta.
    if v_classe is null then
      select default_discretion into v_classe
      from public.categories where id = p_padre_id;
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
  values (p_padre_id, v_nome, v_slug, v_classe)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.crea_categoria(text, uuid, text) is
  'Crea una categoria, o restituisce quella che esiste gia'' sotto lo stesso padre. Senza una classe indicata eredita quella del padre: creata dal foglio di scelta la classe non si chiede, e senza il ripiego il movimento assegnato subito dopo resterebbe «Non classificato».';

-- ---------------------------------------------------------------------------
-- Riparare le figlie gia' nate senza
-- ---------------------------------------------------------------------------
-- Solo dove la figlia non ha una classe e il padre ce l'ha. Un `null` su una
-- figlia non e' mai stato una scelta: `aggiorna_categoria` scrive con
-- `coalesce`, quindi dall'interfaccia una classe non si puo' togliere — si puo'
-- solo non averla mai messa.
--
-- Un giro solo e non una risalita ricorsiva: se una nipote e' senza classe e
-- anche sua madre lo era, questa `update` sistema la madre ma non la nipote.
-- E' voluto — la riparazione deve essere leggibile e prevedibile, e un albero
-- di categorie e' profondo due livelli. Rilanciare la migration fa il secondo
-- giro, ed e' rieseguibile apposta.

update public.categories f
   set default_discretion = p.default_discretion
  from public.categories p
 where f.parent_id = p.id
   and f.default_discretion is null
   and p.default_discretion is not null;
