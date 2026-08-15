-- 0038_esercenti_fissi_e_variabili.sql
--
-- Il CSV, ma dentro l'applicazione.
--
-- ---------------------------------------------------------------------------
-- La distinzione che mancava allo schema
-- ---------------------------------------------------------------------------
-- `McDonald's` e' ristorazione e lo sara' sempre: la sua classificazione vive
-- sull'esercente e non c'e' niente da chiedere, mai. `Amazon` no — lo stesso
-- nome ospita un computer comprato per lavorare e una sciocchezza, e la banca
-- scrive la stessa identica riga.
--
-- E' il caso Euronics, previsto in Fase 4 e da allora sempre trattato **dopo**,
-- riga per riga, da chi si accorgeva del guaio. Mancava il modo di dirlo
-- **prima**: «su questo esercente l'esercente non basta».
--
-- `classificazione_variabile` e' quel modo. Non cambia nessun numero da sola —
-- cambia a chi si chiede, e quante volte:
--
--   fisso     -> la classificazione dell'esercente vale per tutte le sue spese,
--                e la conferma quotidiana non ha niente da chiedere;
--   variabile -> ogni spesa puo' avere la sua, e la schermata lo propone.
--
-- ---------------------------------------------------------------------------
-- Perche' non si deduce dai dati
-- ---------------------------------------------------------------------------
-- Si e' provato a dedurlo dallo scarto fra importo minimo e massimo, sui dati
-- veri: `Coop` va da 1,00 a 91,10 € ed e' sempre spesa alimentare, `Dott` da
-- 0,03 a 9,50 e sono sempre monopattini, `Anthropic` da 5,21 a 109,80 ed e'
-- sempre lo stesso servizio a consumo. L'importo misura la **variabilita' del
-- prezzo**, non quella dell'intento, e sono due cose diverse.
--
-- L'intento non e' nei dati bancari: sta nella testa di chi ha comprato. Quindi
-- e' una dichiarazione dell'utente, come `own_counterparties` in Fase 3.

alter table public.merchants
  add column if not exists classificazione_variabile boolean not null default false;

comment on column public.merchants.classificazione_variabile is
  'Vero se le sue spese vanno classificate una per una: lo stesso esercente ospita intenti diversi.';

-- ---------------------------------------------------------------------------
-- v_merchant_totals — la colonna nuova, e una correzione vecchia
-- ---------------------------------------------------------------------------
-- La colonna si aggiunge **in fondo**: `create or replace view` accetta solo
-- aggiunte in coda, e ricreare la vista da zero porterebbe via anche chi ci sta
-- sopra.
--
-- Nella stessa occasione `totale` passa da `sum(amount)` a `sum(amount_eur)`.
-- Oggi i due coincidono, perche' l'unico conto nei totali e' in euro — ed e'
-- proprio per questo che va corretto adesso: il giorno in cui entra un conto in
-- valuta, sommare `amount` darebbe un numero plausibile e falso, senza nessun
-- errore. E' la regola della Fase 6, applicata all'ultima vista rimasta
-- indietro.

create or replace view public.v_merchant_totals with (security_invoker = on) as
select m.id,
       m.canonical_name,
       m.category_id,
       m.discretion,
       m.context,
       m.is_subscription,
       m.origine,
       m.confermato_at,
       m.motivazione,
       count(t.id)                    as movimenti,
       coalesce(sum(t.amount_eur), 0) as totale,
       max(t.booking_date)            as ultima,
       m.classificazione_variabile,
       m.descrizione_trovata,
       m.fonte
from public.merchants m
left join public.v_expenses t on t.merchant_id = m.id
group by m.id;

-- ---------------------------------------------------------------------------
-- imposta_esercente_variabile
-- ---------------------------------------------------------------------------
-- Una funzione e non un `update` dentro un gestore di click: e' la regola della
-- Fase 0, ed e' anche cio' che permettera' al copilot di rispondere a «su
-- Amazon chiedimelo ogni volta» senza che nessuno scriva altro codice.

create or replace function public.imposta_esercente_variabile(
  p_merchant_id uuid,
  p_variabile   boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  update public.merchants
     set classificazione_variabile = coalesce(p_variabile, false)
   where id = p_merchant_id
  returning true;
$$;

comment on function public.imposta_esercente_variabile(uuid, boolean) is
  'Dichiara se le spese di questo esercente vanno classificate una per una.';

-- ---------------------------------------------------------------------------
-- categorizza_movimento — la categoria della singola riga
-- ---------------------------------------------------------------------------
-- `correggi_movimento` (0022) cambia discrezionalita', contesto e nota, ma
-- **non la categoria**: quando e' stata scritta, la categoria era una proprieta'
-- dell'esercente e basta. Con gli esercenti variabili non lo e' piu' — il
-- computer comprato da Amazon deve poter finire in `Elettronica` mentre il
-- resto di Amazon resta dov'e'.
--
-- Marca `manually_categorized`, come ogni scrittura per riga: senza,
-- `applicaTassonomia` la riporterebbe alla categoria dell'esercente alle 05:00
-- del mattino dopo, e la correzione durerebbe una notte.
--
-- Un argomento nullo **non cancella**: lascia il valore com'era. Per svuotare un
-- campo servirebbe un'operazione che dica esplicitamente «svuota», e finche'
-- nessuno la chiede non la si inventa — mentre un `update` che azzera cio' che
-- non gli e' stato passato e' il modo piu' silenzioso di perdere dei dati.

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

  if p_discrezionalita is not null
     and p_discrezionalita not in ('essenziale', 'investimento', 'utile', 'voluttuario') then
    raise exception 'Discrezionalita'' non ammessa: %', p_discrezionalita;
  end if;

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

comment on function public.categorizza_movimento(uuid, uuid, text, text, text) is
  'Categoria, discrezionalita'' e contesto di UNA riga. Marca manually_categorized: nessun automatismo la tocchera'' piu''.';

-- ---------------------------------------------------------------------------
-- elimina_categoria
-- ---------------------------------------------------------------------------
-- Cancellare una categoria significa decidere che fine fanno le spese che ci
-- stavano dentro, e le sue figlie. Il modo sbagliato e' lasciarlo decidere al
-- database: `on delete set null` scollegherebbe centinaia di movimenti in
-- silenzio, e la spesa sparirebbe dall'albero pur restando nel totale — cioe'
-- il tipo di guasto che si scopre guardando un numero che non torna.
--
-- Quindi si dichiara **dove va il contenuto**. `p_sposta_su` nullo significa
-- «al genitore», che e' quasi sempre la cosa giusta: eliminando
-- `Casa > Bollette` le sue spese risalgono in `Casa` e restano nell'albero. Se
-- la categoria e' una radice e non c'e' un genitore, il contenuto resta senza
-- categoria — e allora si esige che qualcuno lo dica, passando `p_sposta_su`
-- esplicitamente, oppure che la categoria sia gia' vuota.

create or replace function public.elimina_categoria(
  p_id        uuid,
  p_sposta_su uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_padre       uuid;
  v_destinazione uuid;
  v_movimenti   int;
  v_esercenti   int;
  v_figlie      int;
begin
  if p_id is null then
    raise exception 'Categoria non indicata.';
  end if;

  select parent_id into v_padre from public.categories where id = p_id;
  if not found then
    return false;
  end if;

  if p_sposta_su = p_id then
    raise exception 'Il contenuto non puo'' essere spostato sulla categoria che si sta eliminando.';
  end if;

  if p_sposta_su is not null
     and not exists (select 1 from public.categories where id = p_sposta_su) then
    raise exception 'La categoria di destinazione non esiste.';
  end if;

  -- Una discendente come destinazione sparirebbe insieme a chi la contiene.
  if p_sposta_su is not null and exists (
    select 1 from public.v_albero_categorie
    where antenato = p_id and discendente = p_sposta_su
  ) then
    raise exception 'Non si puo'' spostare il contenuto dentro una discendente della categoria eliminata.';
  end if;

  v_destinazione := coalesce(p_sposta_su, v_padre);

  select count(*) into v_movimenti from public.transactions where category_id = p_id;
  select count(*) into v_esercenti from public.merchants   where category_id = p_id;
  select count(*) into v_figlie    from public.categories  where parent_id   = p_id;

  -- Radice con del contenuto e nessuna destinazione: ci si ferma. Meglio un
  -- errore leggibile che centinaia di movimenti scollegati senza dirlo.
  if v_destinazione is null and (v_movimenti > 0 or v_esercenti > 0) then
    raise exception
      'La categoria contiene % movimenti e % esercenti e non ha un genitore: indica dove spostarli.',
      v_movimenti, v_esercenti;
  end if;

  update public.categories  set parent_id   = v_destinazione where parent_id   = p_id;
  update public.merchants   set category_id = v_destinazione where category_id = p_id;
  update public.transactions set category_id = v_destinazione where category_id = p_id;
  delete from public.category_rules where category_id = p_id;

  delete from public.categories where id = p_id;
  return true;
end;
$$;

comment on function public.elimina_categoria(uuid, uuid) is
  'Elimina una categoria spostandone contenuto e figlie sul genitore, o dove indicato. Non scollega mai niente in silenzio.';

revoke all on function public.imposta_esercente_variabile(uuid, boolean) from public;
revoke all on function public.categorizza_movimento(uuid, uuid, text, text, text) from public;
revoke all on function public.elimina_categoria(uuid, uuid) from public;
grant execute on function public.imposta_esercente_variabile(uuid, boolean) to authenticated;
grant execute on function public.categorizza_movimento(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.elimina_categoria(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
