-- 0030_margine_mensile.sql
--
-- Quanto resta ogni mese, e dove il copilot mette i grafici che disegna.
--
-- ---------------------------------------------------------------------------
-- Perche' non puo' farlo il modello
-- ---------------------------------------------------------------------------
-- «Come potrei spendere meno per mettere piu' soldi di lato» e' la domanda per
-- cui questa applicazione esiste, e la prima cifra che serve a risponderle e'
-- **entrate meno spesa**. E' una sottrazione, quindi al modello e' vietata: la
-- regola non ha eccezioni per le sottrazioni facili, ed e' proprio sulle
-- sottrazioni facili che in Fase 10 il controllo delle cifre lo ha gia' colto.
--
-- Quindi la fa Postgres, e il modello la legge.
--
-- Le uscite sono negative e le entrate positive, quindi il margine e' una
-- **somma**: `entrate + spesa`. Scriverla come differenza fra due valori
-- assoluti sarebbe l'occasione perfetta per sbagliare un segno, ed e' lo stesso
-- motivo per cui in ingestion si normalizza una volta sola invece di spargere
-- `Math.abs()` per il codice.
--
-- ---------------------------------------------------------------------------
-- Un mese senza entrate esiste, un mese senza spese quasi mai
-- ---------------------------------------------------------------------------
-- Le due viste mensili non hanno le stesse righe: un mese puo' avere spese e
-- nessuna entrata. Una `join` interna lo farebbe **sparire**, e un mese che
-- sparisce da un confronto e' peggio di un mese con uno zero — perche' non si
-- vede che manca. Da qui l'unione delle chiavi e le `left join`.

create or replace function public.margine_mensile(p_mesi int default 8)
returns table (
  mese      date,
  entrate   text,
  spesa     text,
  margine   text,
  movimenti bigint
)
language sql stable security invoker set search_path = ''
as $$
  with chiavi as (
    select mese from public.v_monthly_totals
    union
    select mese from public.v_monthly_income
  )
  select k.mese,
         coalesce(i.entrate, 0)::text,
         coalesce(t.spesa, 0)::text,
         (coalesce(i.entrate, 0) + coalesce(t.spesa, 0))::text,
         coalesce(t.movimenti, 0)
  from chiavi k
  left join public.v_monthly_totals t on t.mese = k.mese
  left join public.v_monthly_income  i on i.mese = k.mese
  order by k.mese desc
  limit greatest(1, least(coalesce(p_mesi, 8), 24));
$$;

comment on function public.margine_mensile(int) is
  'Entrate, spesa reale e quanto resta, mese per mese. Il margine e'' una somma perche'' le uscite sono gia'' negative.';

revoke all on function public.margine_mensile(int) from public;
grant execute on function public.margine_mensile(int) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- I grafici restano attaccati al messaggio
-- ---------------------------------------------------------------------------
-- Come le proposte di scrittura: un grafico che sparisce riaprendo la
-- conversazione dal telefono il giorno dopo e' un grafico che tanto valeva non
-- disegnare. E' la stessa ragione per cui `cifre_inventate` si salva invece di
-- essere mostrato una volta sola.
--
-- Contiene **solo** i punti gia' calcolati da una query, mai numeri scritti dal
-- modello: il modello sceglie cosa disegnare, non cosa c'e' dentro.

alter table public.chat_messages add column if not exists grafici jsonb;

comment on column public.chat_messages.grafici is
  'I grafici che il copilot ha chiesto di disegnare. I punti vengono da una query, mai dal modello.';

notify pgrst, 'reload schema';
