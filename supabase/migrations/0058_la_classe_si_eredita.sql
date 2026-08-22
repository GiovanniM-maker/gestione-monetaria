-- ===========================================================================
-- 0058 — La classe si eredita dalla categoria anche quando la scrive l'utente
-- ===========================================================================
-- Il difetto, trovato usando l'applicazione: su `/dove` compaiono movimenti
-- sotto «Non classificato» che sono chiaramente ristoranti, bar e persone —
-- cioe' righe con una categoria addosso e nessuna classe. E non se ne vanno:
-- il giro notturno non le tocca piu'.
--
-- La causa non e' un dato sbagliato, sono tre funzioni che scrivono la stessa
-- cosa in tre modi, e in nessuno dei tre c'e' il ripiego sulla categoria.
--
-- `lib/tassonomia/applica.ts` ce l'ha, ed e' scritto li' da sempre:
--
--     discretion: m.discretion ?? categoria?.default_discretion ?? null
--
-- Ma quello e' il percorso **automatico**. I tre percorsi **manuali** —
-- `categorizza_movimento`, `sposta_movimento`, `correggi_movimento` — copiano
-- il valore che hanno in mano e basta. E siccome tutti e tre marcano
-- `manually_categorized`, il giro automatico che avrebbe rimediato al giro
-- dopo viene escluso per sempre: `applica_assegnazioni` della 0057 salta le
-- righe marcate, ed e' giusto che le salti.
--
-- Il risultato e' una riga **congelata su un'assenza**. `manually_categorized`
-- esiste per proteggere una decisione dell'utente; qui protegge il fatto che
-- una decisione non e' stata presa.
--
-- Il caso piu' facile da riprodurre, ed e' quello che l'utente ha visto:
--
--   1. si apre un movimento, si sceglie la categoria «Ristoranti» dal foglio;
--   2. `categorizza_movimento` riceve `p_categoria_id` e basta, perche' la
--      classe dal foglio non si sceglie: e' la categoria che la porta;
--   3. `discretion = coalesce(null, discretion)` la lascia dov'era, cioe'
--      `null`, e `manually_categorized` diventa `true`;
--   4. da quel momento il movimento e' «Ristoranti» **e** «Non classificato»,
--      e nessun automatismo puo' piu' rimediare.
--
-- Le tre correzioni, piu' la riparazione di cio' che e' gia' congelato.
--
-- Rieseguibile: le tre funzioni sono `create or replace`, e la riparazione ha
-- il ripiego nel `where` — al secondo giro non trova piu' niente da fare.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Il ripiego, in un posto solo
-- ---------------------------------------------------------------------------
-- La regola era scritta in TypeScript e in nessun altro posto. Qui diventa una
-- funzione, e le tre che scrivono la chiamano: tre copie della stessa cascata
-- divergerebbero alla prima modifica, ed e' esattamente com'e' nato questo
-- difetto.
--
-- L'ordine non e' arbitrario ed e' lo stesso di `applica.ts`: quello che
-- l'esercente dichiara vince su quello che la sua categoria suppone, perche'
-- il primo e' una scelta e il secondo un valore predefinito. `null` in fondo:
-- non sapere resta un esito ammesso, ed e' il numero che `/revisione` esiste
-- per far scendere.

create or replace function public.classe_ereditata(
  p_merchant_id  uuid,
  p_categoria_id uuid
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select m.discretion from public.merchants m where m.id = p_merchant_id),
    (select c.default_discretion from public.categories c
      where c.id = coalesce(
        (select m.category_id from public.merchants m where m.id = p_merchant_id),
        p_categoria_id))
  );
$$;

comment on function public.classe_ereditata(uuid, uuid) is
  'La classe che spetta a un movimento: quella dell''esercente, altrimenti quella predefinita della sua categoria. La stessa cascata del percorso automatico, in SQL cosi'' che anche le scritture manuali la seguano.';

revoke all on function public.classe_ereditata(uuid, uuid) from public;
grant execute on function public.classe_ereditata(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. `categorizza_movimento` — scegliere la categoria porta la sua classe
-- ---------------------------------------------------------------------------
-- E' il percorso del foglio di scelta categoria, e quello che ha prodotto i
-- ristoranti senza classe. La firma non cambia, quindi `create or replace`
-- basta e nessun `grant` va rifatto.
--
-- Il ripiego scatta **solo** quando l'utente non ha indicato una classe: se
-- l'ha indicata, quella vince su tutto — e' una decisione, ed e' precisamente
-- cio' che `manually_categorized` deve proteggere.

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

  update public.transactions t
     set category_id = coalesce(p_categoria_id, t.category_id),
         -- La classe indicata, se c'e'. Poi quella gia' scritta sulla riga.
         -- Poi, e questa e' la riga che mancava, quella che la categoria
         -- appena scelta porta con se'.
         discretion  = coalesce(
                         p_discrezionalita,
                         t.discretion,
                         public.classe_ereditata(t.merchant_id,
                                                 coalesce(p_categoria_id, t.category_id))),
         context     = coalesce(p_contesto, t.context),
         notes       = case when p_note is null or btrim(p_note) = ''
                            then t.notes else btrim(p_note) end,
         manually_categorized = true,
         confermato_at = now(),
         updated_at = now()
   where t.id = p_id;

  return found;
end;
$$;

comment on function public.categorizza_movimento(uuid, uuid, text, text, text) is
  'Classifica UNA transazione. Se la classe non e'' indicata la eredita dalla categoria scelta: senza, la riga resterebbe «Non classificato» per sempre, perche'' marca manually_categorized.';

-- ---------------------------------------------------------------------------
-- 3. `sposta_movimento` — l'esercente senza classe non ne cancella una
-- ---------------------------------------------------------------------------
-- Stessa lacuna, un gradino piu' su: copiava `merchants.discretion` cosi'
-- com'era. Un esercente creato da `crea_esercente` o proposto dal modello puo'
-- non averla, e la sua categoria si': spostare il movimento gli toglieva la
-- classe invece di dargliela.

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

    -- Il ripiego sulla categoria dell'esercente. Fuori dall'`if`, che gia' non
    -- ci entra quando l'esercente si sta togliendo: li' `null` e' l'esito
    -- voluto, e il giro automatico riprendera' in mano la riga se un alias la
    -- riconosce.
    v_discrezionalita := coalesce(v_discrezionalita,
                                  public.classe_ereditata(p_merchant_id, v_categoria));
  end if;

  update public.transactions
     set merchant_id = p_merchant_id,
         category_id = v_categoria,
         discretion  = v_discrezionalita,
         context     = v_contesto,
         manually_categorized = true,
         confermato_at = coalesce(confermato_at, now())
   where id = p_id;
end;
$$;

comment on function public.sposta_movimento(uuid, uuid) is
  'Sposta UNA transazione su un altro esercente, ereditandone la classificazione — e, se l''esercente non ne ha una, quella predefinita della sua categoria. Marca manually_categorized.';

-- ---------------------------------------------------------------------------
-- 4. `correggi_movimento` — una nota non e' una classificazione
-- ---------------------------------------------------------------------------
-- Marcava `manually_categorized` comunque, anche quando l'unica cosa scritta
-- era una nota. Il chiamante (`lib/conferma/leggi.ts`) considera «correzione»
-- pure quel caso, quindi bastava annotare un movimento per congelarlo con la
-- classe che aveva in quel momento — `null` compreso.
--
-- Il flag protegge una **decisione di classificazione**. Una nota non lo e':
-- e' un promemoria, e non c'e' niente da proteggere da un automatismo che le
-- note non le tocca. Ora il flag si alza solo se e' arrivata una classe o un
-- contesto, e non si abbassa mai da solo (`or` con il valore di prima).

create or replace function public.correggi_movimento(
  p_id              uuid,
  p_discrezionalita text default null,
  p_contesto        text default null,
  p_note            text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.transactions t
     set discretion  = coalesce(p_discrezionalita, t.discretion),
         context     = coalesce(p_contesto, t.context),
         notes       = case when p_note is null or btrim(p_note) = ''
                            then t.notes else btrim(p_note) end,
         manually_categorized = t.manually_categorized
                                or p_discrezionalita is not null
                                or p_contesto is not null,
         confermato_at = now()
   where t.id = p_id;
$$;

comment on function public.correggi_movimento(uuid, text, text, text) is
  'Questa riga fa eccezione rispetto al suo esercente. Marca manually_categorized solo se e'' arrivata una classe o un contesto: una nota non e'' una classificazione, e congelarci sopra una riga la lascerebbe senza classe per sempre.';

-- ---------------------------------------------------------------------------
-- 5. Riparare cio' che e' gia' congelato
-- ---------------------------------------------------------------------------
-- Le righe prodotte dal difetto sono ancora li', e nessun giro notturno le
-- guardera' mai piu'. Due passaggi, in quest'ordine.
--
-- **Primo**: dare la classe a chi puo' ereditarla. Non e' una supposizione —
-- e' il valore che quelle righe avrebbero avuto se le tre funzioni avessero
-- avuto il ripiego, ed e' lo stesso che il percorso automatico avrebbe scritto
-- da solo se non fosse stato escluso.
--
-- Solo dove `discretion is null`: una classe scritta non si tocca, nemmeno per
-- «migliorarla». Quello sarebbe sovrascrivere una correzione manuale, cioe'
-- rompere il patto per ripararne un'altra violazione.

update public.transactions t
   set discretion = public.classe_ereditata(t.merchant_id, t.category_id)
 where t.discretion is null
   and public.classe_ereditata(t.merchant_id, t.category_id) is not null;

-- **Secondo**: scongelare chi resta senza niente.
--
-- Una riga con `manually_categorized` vero e nessuna classe, nessun contesto e
-- nessuna categoria non sta proteggendo una decisione: non ce n'e' una. Sta
-- solo impedendo al giro automatico di provarci. Le note restano dove sono —
-- `applica_assegnazioni` non le legge nemmeno.
--
-- Il verso in cui questo puo' sbagliare e' visibile: al peggio l'automatismo
-- assegna una classe che l'utente correggera'. Il verso opposto — lasciarle
-- congelate — e' quello silenzioso, ed e' quello che ha prodotto il difetto.

update public.transactions t
   set manually_categorized = false
 where t.manually_categorized
   and t.discretion is null
   and t.context is null
   and t.category_id is null;
