-- ---------------------------------------------------------------------------
-- 0048 — «Senza categoria» diventa chiedibile
-- ---------------------------------------------------------------------------
-- `cerca_movimenti` legge `p_categoria = null` come «qualunque categoria», che
-- e' giusto: e' il valore predefinito di un filtro spento. Ma cosi' «nessuna
-- categoria» non era esprimibile con nessun argomento, e i due posti che ne
-- avevano bisogno fallivano nello stesso modo silenzioso: la riga «Senza
-- categoria» della fisarmonica di /dove apriva TUTTI i movimenti del mese, e
-- /movimenti non poteva offrire il filtro affatto.
--
-- Un boolean suo e non un uuid sentinella: un uuid inventato per dire «nessuno»
-- sarebbe un valore magico che prima o poi collide o finisce in un log, e un
-- confronto `is null` detto con un flag si legge da solo.
--
-- La funzione va eliminata e ricreata: un argomento in piu' con un valore
-- predefinito creerebbe un sovraccarico — due funzioni con lo stesso nome, e
-- PostgREST che ne sceglie una a caso. Si eliminano TUTTE E DUE le firme, la
-- vecchia e la nuova, o la seconda esecuzione fallirebbe sulla `create`: e' il
-- difetto che la regola «una migration si applica due volte» esiste per
-- trovare, e che la 0047 ha gia' pagato.

drop function if exists public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean);
drop function if exists public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean, boolean);

create function public.cerca_movimenti(
  p_id              uuid    default null,
  p_da              date    default null,
  p_a               date    default null,
  p_ricerca         text    default null,
  p_categoria       uuid    default null,
  p_merchant        uuid    default null,
  p_discrezionalita text    default null,
  p_contesto        text    default null,
  p_tipo            text    default 'spesa',
  p_ordine          text    default 'data',
  p_limite          integer default 50,
  p_scarto          integer default 0,
  -- `true` = solo i movimenti appesi a QUESTA categoria, senza le discendenti.
  p_solo_questa     boolean default false,
  -- `true` = solo i movimenti SENZA categoria. Un parametro suo, perche'
  -- `p_categoria = null` significa gia' «qualunque»: chiedere «nessuna» con lo
  -- stesso argomento non era esprimibile, e la riga «Senza categoria» di /dove
  -- apriva tutti i movimenti del mese.
  p_senza_categoria boolean default false
)
returns table (
  id                     uuid,
  booking_date           date,
  value_date             date,
  amount                 text,
  amount_eur             text,
  currency               char(3),
  stato                  text,
  esercente              text,
  merchant_id            uuid,
  categoria              text,
  category_id            uuid,
  discrezionalita        text,
  contesto               text,
  conto                  text,
  raw_description        text,
  counterparty_raw       text,
  bank_code              text,
  is_transfer            boolean,
  is_refund              boolean,
  excluded_from_analysis boolean,
  manually_categorized   boolean,
  note                   text,
  fuori_dalla_spesa      text,
  totale_righe           bigint,
  totale_importo         text
)
language sql
stable
security invoker
set search_path = ''
as $$
with recursive rami as (
  -- Il filtro per categoria comprende le discendenti: chiedere «Alimentari»
  -- deve rispondere anche per il supermercato e la panetteria che ci stanno
  -- sotto. Senza, la categoria padre risponderebbe con una lista vuota mentre
  -- il cruscotto ne mostra il totale — e sembrerebbe un difetto dei dati.
  --
  -- Con `p_solo_questa` la ricorsione non parte: resta il nodo, e basta.
  select p_categoria as id, 0 as profondita
  where p_categoria is not null
  union all
  select c.id, r.profondita + 1
  from rami r
  join public.categories c on c.parent_id = r.id
  where r.profondita < 10 and not coalesce(p_solo_questa, false)
)
select m.id,
       m.booking_date,
       m.value_date,
       m.amount::text,
       m.amount_eur::text,
       m.currency,
       m.status,
       mer.canonical_name,
       m.merchant_id,
       cat.name,
       m.category_id,
       m.discretion,
       m.context,
       coalesce(acc.name, acc.iban_masked),
       m.raw_description,
       m.counterparty_raw,
       m.bank_code,
       m.is_transfer,
       m.is_refund,
       m.excluded_from_analysis,
       m.manually_categorized,
       m.notes,
       -- Perche' questa riga non e' nella spesa reale. Un movimento che manca
       -- da un totale deve poter dire da solo perche' manca, o si finisce a
       -- cercarlo con una query scritta a mano — che e' come sono stati
       -- verificati finora tutti i numeri di questo progetto.
       case
         when not acc.include_in_totals    then 'conto fuori dai totali'
         when m.excluded_from_analysis     then 'escluso dall''analisi'
         when m.is_transfer                then 'giroconto'
         when m.is_refund                  then 'rimborso'
         when m.amount > 0                 then 'entrata'
         when m.amount = 0                 then 'importo zero'
       end,
       count(*)          over (),
       (sum(m.amount_eur) over ())::text
from public.transactions m
join public.accounts acc on acc.id = m.account_id
left join public.merchants mer on mer.id = m.merchant_id
left join public.categories cat on cat.id = m.category_id
where (p_id is null or m.id = p_id)
  and (p_da is null or m.booking_date >= p_da)
  and (p_a  is null or m.booking_date <= p_a)
  and (p_ricerca is null or p_ricerca = '' or
       mer.canonical_name  ilike '%' || p_ricerca || '%' or
       m.raw_description   ilike '%' || p_ricerca || '%' or
       m.counterparty_raw  ilike '%' || p_ricerca || '%')
  and (p_categoria is null or m.category_id in (select rami.id from rami))
  and (not coalesce(p_senza_categoria, false) or m.category_id is null)
  and (p_merchant is null or m.merchant_id = p_merchant)
  and (p_discrezionalita is null
       or coalesce(m.discretion, 'non classificato') = p_discrezionalita)
  and (p_contesto is null
       or coalesce(m.context, 'non classificato') = p_contesto)
  -- Chiedendo un identificativo preciso, il filtro sul tipo non si applica:
  -- una scheda che risponde "non esiste" perche' quel movimento e' un
  -- giroconto sarebbe un vicolo cieco proprio nel caso in cui la si apre.
  and case
        when p_id is not null then true
        else case p_tipo
        when 'spesa' then
          m.amount < 0 and not m.is_transfer and not m.is_refund
          and not m.excluded_from_analysis and acc.include_in_totals
        when 'entrate' then
          m.amount > 0 and not m.is_transfer and not m.is_refund
          and not m.excluded_from_analysis and acc.include_in_totals
        when 'giroconti' then m.is_transfer
        else true
      end
      end
-- Per importo si ordina sul **modulo**: la domanda e' «qual e' il movimento
-- piu' grosso», e con le uscite negative un ordinamento sul segno metterebbe
-- in cima le entrate.
order by case when p_ordine = 'importo' then abs(m.amount_eur) end desc nulls last,
         m.booking_date desc,
         m.id
limit greatest(1, least(coalesce(p_limite, 50), 200))
offset greatest(0, coalesce(p_scarto, 0));
$$;

comment on function public.cerca_movimenti is
  'Movimenti filtrati, con conteggio e somma dell''intero insieme filtrato nelle ultime due colonne. `p_solo_questa` esclude le discendenti; `p_senza_categoria` chiede i soli movimenti senza categoria.';

revoke all on function public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean, boolean) from public;
grant execute on function public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer, boolean, boolean) to authenticated;
