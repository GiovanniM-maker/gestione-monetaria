-- 0032_sposta_movimento.sql
--
-- Spostare una singola transazione su un altro esercente.
--
-- ---------------------------------------------------------------------------
-- Il caso che l'ha resa necessaria
-- ---------------------------------------------------------------------------
-- Sotto l'esercente `Apple` ci sono sedici movimenti: **undici da 2,99 il 24 di
-- ogni mese** — iCloud, l'abbonamento piu' regolare del database — e **cinque
-- fra il 12 e il 28 aprile 2026** per 444,65 €, che sono un dispositivo e i suoi
-- accessori.
--
-- La banca li scrive **identici**: `apple.com/bill` su tutti e sedici, e
-- `CARD_PAYMENT` su tutti e sedici. Nessuna stringa li distingue, quindi la
-- tassonomia della Fase 4 — che lavora sulle etichette — non puo' separarli
-- nemmeno in linea di principio.
--
-- Il danno non e' estetico. Mediando insieme le due cose, il rilevatore ottiene
-- `amount_stability` 0,00, esce dal ramo del canone, e calcola
-- `477,54 × 30,44 / 323,44 = 44,94 €/mese` per un servizio che ne costa 2,99 —
-- un fattore quindici. Quei ~42 € finiscono nella riga **abbonamenti** della
-- metrica principale, cioe' proprio in «quanto si libera con un gesto», dove
-- non c'e' nessun gesto che li liberi.
--
-- ---------------------------------------------------------------------------
-- E' il caso Euronics, che CLAUDE.md prevedeva dalla Fase 4
-- ---------------------------------------------------------------------------
-- «Lo stesso esercente ospita acquisti con intenti diversi. Un computer
-- comprato da Euronics per lavorare e' investimento e business; una sciocchezza
-- comprata nello stesso negozio e' voluttuario e personale.»
--
-- Lo schema copriva meta' del caso: `manually_categorized` protegge
-- discrezionalita', contesto e note della singola riga. Ma **l'esercente no**,
-- e l'esercente e' cio' su cui il rilevatore raggruppa. Finche' i cinque
-- acquisti restano attaccati ad `Apple`, nessuna correzione di discrezionalita'
-- ripara il canone.
--
-- L'informazione che li separa non e' nei dati bancari: e' nella testa di chi
-- ha comprato. Come per `own_counterparties`, l'input umano qui non e' una
-- scorciatoia — e' l'unica fonte.
--
-- ---------------------------------------------------------------------------
-- Perche' marca `manually_categorized`
-- ---------------------------------------------------------------------------
-- `applicaTassonomia` rilegge solo le righe con `manually_categorized = false`,
-- quindi senza quel flag il prossimo giro riabbinerebbe la riga ad `Apple`
-- tramite l'alias su `apple.com/bill`, e lo spostamento durerebbe fino alle
-- 05:00 del mattino dopo.
--
-- E' esattamente il significato che quel flag ha sempre avuto — «questa riga fa
-- eccezione perche' l'ho deciso io» — applicato al campo per cui non era ancora
-- raggiungibile.

-- ---------------------------------------------------------------------------
-- crea_esercente
-- ---------------------------------------------------------------------------
-- Oggi un esercente nasce **solo** insieme a un alias, da `assegnaEtichetta`.
-- Qui serve il contrario: un esercente senza nessuna etichetta che lo
-- richiami, perche' la sua etichetta e' la stessa di un altro e le righe ci
-- arrivano una per una.
--
-- Rieseguire non duplica: il nome esiste gia' normalizzato in `canonical_norm`,
-- e si restituisce quello. Stessa scelta di `crea_categoria`, per la stessa
-- ragione — il copilot propone e l'utente applica con un tocco, e un tocco
-- ripetuto su un telefono non deve creare due `Apple Store`.

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

  if p_discrezionalita is not null
     and p_discrezionalita not in ('essenziale', 'investimento', 'utile', 'voluttuario') then
    raise exception 'Discrezionalita'' non ammessa: %.', p_discrezionalita;
  end if;

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

comment on function public.crea_esercente(text, uuid, text, text, boolean) is
  'Crea un esercente senza alias, o restituisce quello omonimo. Serve quando la banca scrive due cose diverse con la stessa etichetta.';

-- ---------------------------------------------------------------------------
-- sposta_movimento
-- ---------------------------------------------------------------------------
-- La riga eredita categoria, discrezionalita' e contesto **dell'esercente di
-- destinazione**. Lasciarle com'erano vorrebbe dire spostare l'acquisto da
-- Apple in `Apple Store` continuando a contarlo fra i software: si sposterebbe
-- l'appartenenza senza spostare la spesa, che e' il difetto che questa funzione
-- esiste per riparare.
--
-- `p_merchant_id` nullo e' ammesso e significa «togli l'esercente»: la riga
-- esce dalle ricorrenze e resta una spesa senza esercente. Anche in quel caso
-- si marca `manually_categorized`, o l'alias la riprenderebbe.

create or replace function public.sposta_movimento(p_id uuid, p_merchant_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria uuid;
  v_discrezionalita text;
  v_contesto text;
begin
  if not exists (select 1 from public.transactions where id = p_id) then
    raise exception 'Il movimento % non esiste.', p_id;
  end if;

  if p_merchant_id is not null then
    select category_id, discretion, context
      into v_categoria, v_discrezionalita, v_contesto
    from public.merchants where id = p_merchant_id;

    if not found then
      raise exception 'L''esercente % non esiste.', p_merchant_id;
    end if;
  end if;

  update public.transactions
     set merchant_id = p_merchant_id,
         category_id = v_categoria,
         discretion  = v_discrezionalita,
         context     = v_contesto,
         -- Da qui in poi nessun automatismo tocca piu' questa riga. Senza,
         -- l'alias la riabbinerebbe al prossimo giro e lo spostamento
         -- durerebbe fino alle 05:00.
         manually_categorized = true,
         confermato_at = coalesce(confermato_at, now())
   -- `updated_at` non compare: ci pensa il trigger `transactions_set_updated_at`.
   -- Scriverlo anche qui sarebbe una seconda copia dello stesso meccanismo, e
   -- la 0003 dice perche' il trigger esiste — aggiornarlo dal codice significa
   -- dimenticarselo, prima o poi, in uno dei posti.
   where id = p_id;
end;
$$;

comment on function public.sposta_movimento(uuid, uuid) is
  'Sposta UNA transazione su un altro esercente, ereditandone la classificazione. Marca manually_categorized: nessun automatismo la tocchera'' piu''.';

revoke all on function public.crea_esercente(text, uuid, text, text, boolean) from public;
revoke all on function public.sposta_movimento(uuid, uuid) from public;
grant execute on function public.crea_esercente(text, uuid, text, text, boolean) to authenticated;
grant execute on function public.sposta_movimento(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
