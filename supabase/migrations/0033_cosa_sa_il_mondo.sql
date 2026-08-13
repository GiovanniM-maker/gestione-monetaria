-- 0033_cosa_sa_il_mondo.sql
--
-- Dove si conserva quello che si e' scoperto cercando un esercente.
--
-- ---------------------------------------------------------------------------
-- Il difetto che questa colonna esiste per riparare
-- ---------------------------------------------------------------------------
-- `Bruno Spa Modica` e' un rivenditore di elettronica. Un umano con un motore
-- di ricerca lo scopre in dieci secondi; l'applicazione no, e il modello — che
-- non ha modo di saperlo — tira a indovinare. In Fase 4 e' stato misurato:
-- ha classificato `Bruno` come `casa`/`essenziale` perche' _«importo alto
-- suggerisce spesa casa»_, e su `Aspit` ha inventato _«associazione
-- bar/ristorazione in Emilia»_ per un'azienda di trasporti.
--
-- `essenziale` e' la classe che piu' distorce la metrica principale, e un
-- errore li' non si vede: il numero resta plausibile.
--
-- L'informazione **esiste fuori**. Questa migration prepara il posto dove
-- metterla quando la si va a prendere.
--
-- ---------------------------------------------------------------------------
-- Perche' si conserva invece di ricercare ogni volta
-- ---------------------------------------------------------------------------
-- Tre ragioni, in ordine di importanza:
--
-- 1. **La regola 8b**: ogni ricerca e' un nome che esce verso un servizio
--    esterno. Cercare due volte lo stesso esercente e' un'esposizione in piu'
--    senza nessuna informazione in piu'.
-- 2. **La verificabilita'**: fra un anno, davanti a una spesa in una categoria
--    che sorprende, si potra' leggere *da dove* veniva quella classificazione —
--    e distinguere «il mondo dice cosi'» da «il modello ha indovinato».
-- 3. Il costo, che e' l'ultima e la meno importante.
--
-- `cercato_at` non e' ridondante rispetto a `descrizione_trovata`: distingue
-- **«non abbiamo ancora cercato»** da **«abbiamo cercato e non abbiamo trovato
-- niente»**. Senza, un esercente introvabile verrebbe ricercato a ogni giro,
-- per sempre — che e' il modo in cui una cache diventa un moltiplicatore.

alter table public.merchants
  add column if not exists descrizione_trovata text,
  add column if not exists fonte              text,
  add column if not exists cercato_at         timestamptz;

comment on column public.merchants.descrizione_trovata is
  'Cosa dice il mondo di questo esercente. Null dopo una ricerca = cercato e non trovato.';
comment on column public.merchants.fonte is
  'L''URL da cui viene la descrizione. Senza, la descrizione non e'' verificabile.';
comment on column public.merchants.cercato_at is
  'Quando si e'' cercato. Distingue "mai cercato" da "cercato senza esito".';

-- ---------------------------------------------------------------------------
-- v_esercenti_da_cercare
-- ---------------------------------------------------------------------------
-- Chi vale la pena cercare, e in che ordine.
--
-- Il filtro della regola 8b e' **dentro la vista** e non nel codice che la
-- legge: `solo_carta` viene da `v_esercenti_da_carta`, cioe' dalla garanzia che
-- ogni movimento di quel nome e' un pagamento con carta. Un bonifico a un
-- privato non compare qui nemmeno interrogando la vista a mano.
--
-- Mettere il filtro qui e non a valle non e' pignoleria: e' che una vista si
-- puo' interrogare da dieci posti diversi, e nove si ricorderanno del filtro.
--
-- L'ordine e' per **spesa**, non per numero di movimenti: un esercente da
-- 1.080 € classificato male sposta la metrica, uno da 4 € no.

create or replace view public.v_esercenti_da_cercare with (security_invoker = on) as
select m.id                                   as merchant_id,
       m.canonical_name                       as esercente,
       c.name                                 as categoria_attuale,
       m.discretion                           as discrezionalita_attuale,
       m.origine,
       m.confermato_at is not null            as confermato,
       t.movimenti,
       t.speso::text                          as speso
from public.merchants m
join public.v_esercenti_da_carta carta on carta.merchant_id = m.id and carta.solo_carta
left join public.categories c on c.id = m.category_id
join lateral (
  select count(*) as movimenti, coalesce(sum(e.amount_eur), 0) as speso
  from public.v_expenses e where e.merchant_id = m.id
) t on true
where m.cercato_at is null
  and t.movimenti > 0
order by t.speso;

comment on view public.v_esercenti_da_cercare is
  'Esercenti mai cercati, garantiti dalla carta (regola 8b), dal piu'' costoso. Il filtro sta qui, non a valle.';

grant select on public.v_esercenti_da_cercare to authenticated;

-- ---------------------------------------------------------------------------
-- salva_ricerca
-- ---------------------------------------------------------------------------
-- Una funzione e non un `update` dal codice, per una ragione sola: **scrive
-- `cercato_at` sempre**, anche quando non si e' trovato niente. Un `update`
-- scritto a mano dal chiamante prima o poi dimentichera' quel campo nel ramo
-- «nessun risultato», e da quel momento quell'esercente verra' ricercato a
-- ogni giro senza che nessuno se ne accorga.

create or replace function public.salva_ricerca(
  p_merchant_id uuid,
  p_descrizione text default null,
  p_fonte       text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.merchants
     set descrizione_trovata = nullif(btrim(coalesce(p_descrizione, '')), ''),
         fonte               = nullif(btrim(coalesce(p_fonte, '')), ''),
         cercato_at          = now()
   where id = p_merchant_id;
$$;

comment on function public.salva_ricerca(uuid, text, text) is
  'Registra l''esito di una ricerca. Scrive cercato_at anche a mani vuote: senza, si ricercherebbe per sempre.';

revoke all on function public.salva_ricerca(uuid, text, text) from public;
grant execute on function public.salva_ricerca(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
