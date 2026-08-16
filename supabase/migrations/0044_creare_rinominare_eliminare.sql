-- 0044_creare_rinominare_eliminare.sql
--
-- Le operazioni sulle classi di discrezionalita', come funzioni nominate.
--
-- Non e' pignoleria: e' la regola scritta nella Parte 0, «ogni operazione
-- dev'essere raggiungibile dal copilot, non solo da un bottone». La Fase 10 l'ha
-- gia' incassata una volta — delle undici operazioni esposte al copilota, dieci
-- esistevano gia' e solo `crea_categoria` era da scrivere. Se la logica di
-- «crea una classe» finisse dentro un gestore di click, per il modello quella
-- classe non si potrebbe creare.
--
-- La UI chiama queste, e il copilota chiamera' le stesse.

-- ---------------------------------------------------------------------------
-- crea_classe
-- ---------------------------------------------------------------------------
-- Rieseguibile, come `crea_categoria`: lo stesso nome restituisce la classe che
-- c'e' gia' invece di crearne una seconda. Un tocco ripetuto su un telefono non
-- deve produrre due «Risparmio».
--
-- Lo slug si deriva dal nome e si rende unico con un suffisso numerico, con lo
-- stesso codice di `crea_categoria`. Non lo si chiede a chi crea: e' un
-- identificativo, e chiederlo significherebbe chiedere una cosa di cui l'utente
-- non ha motivo di sapere l'esistenza.

create or replace function public.crea_classe(
  p_nome           text,
  p_descrizione    text default null,
  p_colore         text default null,
  p_nel_ricorrente boolean default true
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome   text := btrim(coalesce(p_nome, ''));
  v_slug   text;
  v_base   text;
  v_colore text;
  v_n      int := 1;
begin
  if v_nome = '' then
    raise exception 'Il nome della classe non puo'' essere vuoto.';
  end if;

  -- Gia' esistente con lo stesso nome: si riusa, archiviata o no. Restituire
  -- quella archiviata invece di crearne una gemella e' la risposta giusta —
  -- «Risparmio» esisteva, e chi la sta ricreando la vuole indietro.
  select slug into v_slug
  from public.discretion_classes
  where lower(btrim(nome)) = lower(v_nome)
  limit 1;

  if v_slug is not null then
    return v_slug;
  end if;

  -- Il colore: quello chiesto, oppure il primo della tavolozza che nessuna
  -- classe sta gia' usando. Assegnarne uno a caso, o sempre lo stesso,
  -- produrrebbe due classi indistinguibili sulla barra — che e' il modo in cui
  -- il colore smette di essere un'informazione.
  v_colore := p_colore;
  if v_colore is null then
    -- `with ordinality` e l'`order by`: senza, l'ordine di `unnest` non e'
    -- garantito una volta che ci si mette sopra un anti-join, e «il primo
    -- libero della tavolozza» diventerebbe «uno a caso fra i liberi».
    select c into v_colore
    from unnest(array['blu', 'ambra', 'rosa', 'verde', 'viola', 'ciano', 'bruno'])
         with ordinality as t(c, n)
    where not exists (select 1 from public.discretion_classes d where d.colore = t.c)
    order by t.n
    limit 1;
    v_colore := coalesce(v_colore, 'blu');
  end if;

  v_base := regexp_replace(
              lower(translate(v_nome, 'àáâãäèéêëìíîïòóôõöùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn')),
              '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  if v_base = '' then v_base := 'classe'; end if;

  v_slug := v_base;
  while exists (select 1 from public.discretion_classes where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.discretion_classes (slug, nome, descrizione, colore, sort_order, nel_ricorrente)
  values (
    v_slug, v_nome, nullif(btrim(coalesce(p_descrizione, '')), ''), v_colore,
    coalesce((select max(sort_order) from public.discretion_classes), 0) + 10,
    coalesce(p_nel_ricorrente, true)
  );

  return v_slug;
end;
$$;

comment on function public.crea_classe(text, text, text, boolean) is
  'Crea una classe di discrezionalita'', o restituisce quella omonima gia'' presente. Lo slug si deriva dal nome.';

revoke all on function public.crea_classe(text, text, text, boolean) from public;
grant execute on function public.crea_classe(text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- aggiorna_classe
-- ---------------------------------------------------------------------------
-- «Nullo = non cambiare», come `aggiorna_categoria`. Un campo omesso non deve
-- cancellare cio' che c'era: nella schermata delle categorie e' gia' successo
-- che una riga d'elenco azzerasse discrezionalita' e contesto di un esercente,
-- ed e' il motivo per cui quella convenzione qui e' esplicita.
--
-- Lo slug non cambia mai da qui. E' l'identita': rinominare «Voluttuario» in
-- «Sfizi» cambia il nome mostrato e non riscrive una sola riga di
-- `transactions`.

create or replace function public.aggiorna_classe(
  p_slug           text,
  p_nome           text default null,
  p_descrizione    text default null,
  p_colore         text default null,
  p_ordine         int default null,
  p_nel_ricorrente boolean default null,
  p_archiviata     boolean default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
begin
  if p_slug is null then
    raise exception 'Classe non indicata.';
  end if;

  update public.discretion_classes
     set nome           = coalesce(v_nome, nome),
         descrizione    = coalesce(nullif(btrim(coalesce(p_descrizione, '')), ''), descrizione),
         colore         = coalesce(p_colore, colore),
         sort_order     = coalesce(p_ordine, sort_order),
         nel_ricorrente = coalesce(p_nel_ricorrente, nel_ricorrente),
         is_archived    = coalesce(p_archiviata, is_archived)
   where slug = p_slug;

  if not found then
    raise exception 'Classe inesistente: %', p_slug;
  end if;

  return true;
end;
$$;

comment on function public.aggiorna_classe(text, text, text, text, int, boolean, boolean) is
  'Rinomina una classe, ne cambia colore, ordine, `nel_ricorrente` o la archivia. Lo slug non cambia: e'' un identificativo, non un''etichetta.';

revoke all on function public.aggiorna_classe(text, text, text, text, int, boolean, boolean) from public;
grant execute on function public.aggiorna_classe(text, text, text, text, int, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- elimina_classe
-- ---------------------------------------------------------------------------
-- La foreign key e' `on delete restrict`: non c'e' modo di lasciare una
-- transazione che punta a una classe scomparsa, nemmeno sbagliando. Quindi
-- eliminare una classe in uso richiede di dire **dove vanno le sue righe**.
--
-- Non e' una formalita' burocratica: senza destinazione, l'unica alternativa
-- sarebbe metterle a `null`, cioe' spostare silenziosamente della spesa
-- classificata dentro «non classificato». Un'operazione che sposta soldi da una
-- classe all'altra deve nominare l'altra.
--
-- «Unisci due classi» non e' un'operazione in piu': e' questa, con la
-- destinazione.
--
-- Lo spostamento tocca anche le righe con `manually_categorized`. Non c'e'
-- alternativa onesta — la classe che avevano non esiste piu' — ma e' un atto
-- esplicito di chi chiama, e la funzione dice quante righe ha spostato.

create or replace function public.elimina_classe(
  p_slug  text,
  p_verso text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_movimenti  bigint := 0;
  v_esercenti  bigint := 0;
  v_categorie  bigint := 0;
  v_in_uso     boolean;
begin
  if p_slug is null then
    raise exception 'Classe non indicata.';
  end if;

  if not exists (select 1 from public.discretion_classes where slug = p_slug) then
    raise exception 'Classe inesistente: %', p_slug;
  end if;

  if (select count(*) from public.discretion_classes) <= 1 then
    raise exception 'E'' l''ultima classe rimasta: senza nessuna classe la metrica principale non ha piu'' righe. Creane un''altra prima di eliminare questa.';
  end if;

  v_in_uso :=
       exists (select 1 from public.transactions where discretion = p_slug)
    or exists (select 1 from public.merchants where discretion = p_slug)
    or exists (select 1 from public.categories where default_discretion = p_slug);

  if v_in_uso then
    if p_verso is null then
      raise exception 'La classe «%» e'' in uso: indica in quale classe spostare le sue righe.', p_slug;
    end if;
    if p_verso = p_slug then
      raise exception 'La destinazione non puo'' essere la classe che si sta eliminando.';
    end if;
    if not exists (select 1 from public.discretion_classes where slug = p_verso) then
      raise exception 'Classe di destinazione inesistente: %', p_verso;
    end if;

    update public.transactions set discretion = p_verso where discretion = p_slug;
    get diagnostics v_movimenti = row_count;

    update public.merchants set discretion = p_verso where discretion = p_slug;
    get diagnostics v_esercenti = row_count;

    update public.categories set default_discretion = p_verso where default_discretion = p_slug;
    get diagnostics v_categorie = row_count;
  end if;

  delete from public.discretion_classes where slug = p_slug;

  return jsonb_build_object(
    'eliminata', p_slug,
    'spostate_in', case when v_in_uso then p_verso else null end,
    'movimenti', v_movimenti,
    'esercenti', v_esercenti,
    'categorie', v_categorie
  );
end;
$$;

comment on function public.elimina_classe(text, text) is
  'Elimina una classe. Se e'' in uso, sposta prima le sue righe nella classe indicata: e'' anche il modo di unire due classi.';

revoke all on function public.elimina_classe(text, text) from public;
grant execute on function public.elimina_classe(text, text) to authenticated;

notify pgrst, 'reload schema';
