-- 0020_pavimento.sql
--
-- Fase 6-bis, primo passo: lo stato del sistema, le entrate come denominatore,
-- e la ricerca sui movimenti.
--
-- Il nome della fase non e' decorativo. Fino a qui ogni discesa
-- dell'applicazione finisce su un aggregato: dal totale del mese alla classe,
-- dalla classe alla categoria, dalla categoria all'esercente, e li' si ferma.
-- Sotto non c'e' niente. Questa migration mette il pavimento.

-- ---------------------------------------------------------------------------
-- v_stato_sistema — la cosa che manca e che costa di piu'
-- ---------------------------------------------------------------------------
-- `bank_connections.valid_until` esiste nello schema dalla Fase 1 e non e'
-- mostrato da nessuna parte. Il consenso Enable Banking scade — 180 giorni sul
-- connettore Revolut — e quando scade **i dati smettono di arrivare in
-- silenzio**: il cruscotto continuerebbe a mostrare numeri, sempre piu'
-- vecchi, senza dire niente. Per un'applicazione che esiste per essere creduta
-- e' il guasto peggiore possibile, ed e' anche il piu' economico da prevenire.
--
-- Le due date non dicono la stessa cosa e servono entrambe: una
-- sincronizzazione puo' riuscire e non portare niente. `ultima_sync_riuscita`
-- dice che il canale e' aperto, `ultimo_movimento` dice che ci passa qualcosa.

create view public.v_stato_sistema with (security_invoker = on) as
select c.id                                        as connection_id,
       c.aspsp_name                                as banca,
       c.status                                    as stato_connessione,
       c.valid_until,
       -- Giorni al rinnovo. Negativo = gia' scaduto, e va detto cosi': un
       -- "scade fra -3 giorni" e' un messaggio che si legge male apposta.
       case when c.valid_until is null then null
            else (c.valid_until::date - current_date) end as giorni_al_rinnovo,

       (select max(r.finished_at) from public.sync_runs r
         where r.connection_id = c.id and r.status = 'success')  as ultima_sync_riuscita,
       (select max(r.started_at) from public.sync_runs r
         where r.connection_id = c.id and r.status = 'failed')   as ultima_sync_fallita,
       (select r.error_message from public.sync_runs r
         where r.connection_id = c.id and r.status = 'failed'
         order by r.started_at desc limit 1)                     as ultimo_errore,

       (select max(t.booking_date) from public.transactions t
          join public.accounts a on a.id = t.account_id
         where a.connection_id = c.id)                           as ultimo_movimento,
       -- Le `pending` sono nel totale al loro importo provvisorio, e possono
       -- cambiare o sparire. Nel mese in corso sono quasi tutte li': saperne
       -- il numero e' la differenza fra "il totale e' sbagliato" e "il totale
       -- non e' ancora definitivo".
       (select count(*) from public.transactions t
          join public.accounts a on a.id = t.account_id
         where a.connection_id = c.id and t.status = 'pending')   as movimenti_provvisori,
       (select count(*) from public.accounts a
         where a.connection_id = c.id and a.is_active)            as conti_attivi
from public.bank_connections c;

comment on view public.v_stato_sistema is
  'Salute della connessione bancaria. `giorni_al_rinnovo` negativo = consenso scaduto: i dati non arrivano piu''.';

grant select on public.v_stato_sistema to authenticated;

-- ---------------------------------------------------------------------------
-- v_income / v_monthly_income — le entrate, come denominatore
-- ---------------------------------------------------------------------------
-- Speculare a `v_expenses`, e con la stessa avvertenza rovesciata: **i
-- giroconti in entrata non sono entrate.** Un rientro dal conto deposito
-- verrebbe contato come reddito, e il denominatore diventerebbe falso
-- esattamente come lo era la classifica delle uscite prima di `is_transfer` —
-- dove le prime sei voci per importo erano tutte spostamenti fra conti propri.
--
-- Anche i rimborsi restano fuori: un rimborso e' una spesa che torna indietro,
-- non del reddito. Contarlo come entrata gonfierebbe il denominatore proprio
-- nei mesi in cui si e' speso di piu'.

create view public.v_income with (security_invoker = on) as
select t.id, t.account_id, t.booking_date, t.value_date,
       t.amount, t.amount_eur, t.currency,
       t.raw_description, t.counterparty_raw, t.bank_code, t.status
from public.transactions t
join public.accounts a on a.id = t.account_id
where t.amount > 0
  and not t.is_transfer
  and not t.is_refund
  and not t.excluded_from_analysis
  and a.include_in_totals;

comment on view public.v_income is
  'Entrate reali. Esclude giroconti e rimborsi: nessuno dei due e'' reddito.';

grant select on public.v_income to authenticated;

create view public.v_monthly_income with (security_invoker = on) as
select date_trunc('month', booking_date)::date      as mese,
       coalesce(sum(amount_eur), 0)                 as entrate,
       count(*)                                     as movimenti,
       count(*) filter (where amount_eur is null)   as senza_cambio
from public.v_income
group by 1;

grant select on public.v_monthly_income to authenticated;

-- ---------------------------------------------------------------------------
-- cerca_movimenti() — il pavimento
-- ---------------------------------------------------------------------------
-- Una funzione sola che restituisce **le righe e i loro totali insieme**.
--
-- La ragione e' precisa: righe e totale filtrati da due query diverse
-- significano due copie della stessa condizione, che possono divergere senza
-- che niente lo segnali — e il sintomo sarebbe una lista che mostra righe che
-- il totale in cima non conta. `count(*) over ()` e `sum(...) over ()` si
-- calcolano dopo il `where` e prima del `limit`, quindi danno l'intero insieme
-- filtrato anche quando si legge una pagina sola.
--
-- E' anche l'operazione che il copilot della Fase 10 chiamera' per rispondere
-- a «quanto ho speso in ristoranti a marzo»: una funzione con una firma
-- esplicita e' uno strumento che un modello sa usare, un filtro dentro un
-- componente React no.

create function public.cerca_movimenti(
  -- Un solo movimento, per la sua scheda. Passa da qui invece che da una
  -- query separata su `transactions` cosi' la scheda mostra esattamente i
  -- campi della lista, calcolati allo stesso modo — `fuori_dalla_spesa`
  -- compreso, che e' proprio la ragione per cui si apre una scheda quando un
  -- numero non torna.
  p_id              uuid    default null,
  p_da              date    default null,
  p_a               date    default null,
  p_ricerca         text    default null,
  p_categoria       uuid    default null,
  p_merchant        uuid    default null,
  p_discrezionalita text    default null,
  p_contesto        text    default null,
  -- spesa | entrate | giroconti | tutti
  p_tipo            text    default 'spesa',
  -- data | importo
  p_ordine          text    default 'data',
  p_limite          integer default 50,
  p_scarto          integer default 0
)
-- Gli importi escono come **testo**, non come `numeric`.
--
-- Non e' una stranezza: PostgREST serializza `numeric` come numero JSON, e in
-- JavaScript un numero e' un float. Tutta la catena di questa applicazione
-- evita i float sul denaro — il tipo interno e' l'intero in centesimi, parsato
-- dalla stringa decimale — e sarebbe assurdo farla passare da un float
-- esattamente nell'ultimo trasferimento. E' lo stesso motivo per cui ogni
-- `select` dell'applicazione chiede `::text` sulle colonne monetarie; qui la
-- richiesta non si puo' fare dal chiamante, quindi si fa nella firma.
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
  select p_categoria as id, 0 as profondita
  where p_categoria is not null
  union all
  select c.id, r.profondita + 1
  from rami r
  join public.categories c on c.parent_id = r.id
  where r.profondita < 10
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
  and (p_merchant is null or m.merchant_id = p_merchant)
  and (p_discrezionalita is null or m.discretion = p_discrezionalita)
  and (p_contesto is null or m.context = p_contesto)
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
  'Movimenti filtrati, con conteggio e somma dell''intero insieme filtrato nelle ultime due colonne.';

revoke all on function public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer) from public;
grant execute on function public.cerca_movimenti(
  uuid, date, date, text, uuid, uuid, text, text, text, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
