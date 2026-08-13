-- 0031_quanto_costa_adesso.sql
--
-- Una media storica non e' un risparmio.
--
-- ---------------------------------------------------------------------------
-- Il difetto, visto in uso
-- ---------------------------------------------------------------------------
-- Il copilot ha elencato «ABBONAMENTI da disdire (un gesto, risparmio certo)»
-- mettendoci accanto `costo_mensile`, e per Anthropic ha scritto −91,26 €/mese
-- mentre il canone vero e' fra i 108 e i 120.
--
-- Il numero non era sbagliato: rispondeva a un'altra domanda. `costo_mensile`
-- per un servizio a consumo — `confidence` 0,28, importo variabile, quindi
-- fuori dal ramo del canone — vale `totale speso × 30,44 / giorni coperti`,
-- cioe' **la media su tutto il periodo osservato**. Un servizio partito a 20 €
-- e arrivato a 110 ha una media che non e' mai stata il suo prezzo.
--
-- «Quanto mi e' costato in media al mese» e «quanto smetto di pagare se disdico
-- oggi» sono due domande diverse, e sotto un titolo che dice «risparmio certo»
-- va la seconda.
--
-- ---------------------------------------------------------------------------
-- Le due cifre che rispondono alla seconda domanda
-- ---------------------------------------------------------------------------
-- 1. **`expected_amount`** — l'ultimo importo pagato. Esiste dalla Fase 5
--    esattamente per questo, ed e' il motivo per cui li' sono due colonne e non
--    una. Non arrivava al copilot perche' non l'avevo messo nella proiezione:
--    il modello non poteva dire 110 nemmeno volendo.
-- 2. **`speso_di_recente`** — quanto e' uscito davvero negli ultimi mesi
--    **interi**. Per un servizio a consumo l'ultimo addebito da solo puo' essere
--    un picco, e la media di tutto lo storico e' vecchia: la finestra recente
--    sta in mezzo, ed e' misurata.
--
-- Il mese in corso resta fuori. Undici giorni confrontati con mesi interi si
-- leggono come un crollo — e' la stessa lettura sbagliata gia' corretta sul
-- cruscotto in Fase 6-bis e sul picco di categoria in Fase 8.
--
-- La divisione per il numero di mesi la fa Postgres. E' aritmetica, e al
-- modello e' vietata anche quando e' facile.

create or replace function public.ricorrenti_con_recente(p_mesi int default 3)
returns table (
  merchant_id            uuid,
  esercente              text,
  categoria              text,
  tipo                   text,
  discrezionalita        text,
  contesto               text,
  cadence                text,
  occorrenze             int,
  usage_verdict          text,
  status                 text,
  -- Le tre cifre, con i nomi che dicono a cosa rispondono.
  media_su_tutto_lo_storico text,
  ultimo_importo            text,
  prezzo_tipico             text,
  speso_negli_ultimi_mesi   text,
  media_mensile_recente     text,
  mesi_interi_guardati      int,
  -- Quanto la serie e' regolare. Serve a sapere quale delle tre credere: con
  -- un canone stabile coincidono tutte, con un servizio a consumo divergono.
  regolarita_tempo       text,
  stabilita_importo      text
)
language sql stable security invoker set search_path = ''
as $$
  with finestra as (
    select date_trunc('month', current_date)::date                        as primo_del_mese_in_corso,
           (date_trunc('month', current_date)
              - (greatest(1, least(coalesce(p_mesi, 3), 12)) || ' months')::interval)::date as inizio,
           greatest(1, least(coalesce(p_mesi, 3), 12))                    as quanti
  ),
  recente as (
    select v.merchant_id,
           sum(v.spesa) as speso
    from public.v_monthly_by_merchant v, finestra f
    -- `< primo_del_mese_in_corso`: il mese in corso e' parziale e non si
    -- confronta con dei mesi interi.
    where v.mese >= f.inizio and v.mese < f.primo_del_mese_in_corso
    group by 1
  )
  select s.merchant_id, s.esercente, s.categoria, s.tipo,
         s.discrezionalita, s.contesto, s.cadence,
         s.occurrences, s.usage_verdict, s.status,
         s.costo_mensile::text,
         s.expected_amount::text,
         s.typical_amount::text,
         coalesce(r.speso, 0)::text,
         round(coalesce(r.speso, 0) / f.quanti, 2)::text,
         f.quanti,
         s.confidence::text,
         s.amount_stability::text
  from public.v_subscriptions s
  cross join finestra f
  left join recente r on r.merchant_id = s.merchant_id
  where s.nella_metrica
  order by s.costo_mensile;
$$;

comment on function public.ricorrenti_con_recente(int) is
  'Le ricorrenze nella metrica con TRE cifre distinte: la media su tutto lo storico, l''ultimo importo pagato e quanto e'' uscito negli ultimi mesi interi. Rispondono a domande diverse.';

revoke all on function public.ricorrenti_con_recente(int) from public;
grant execute on function public.ricorrenti_con_recente(int) to authenticated;

notify pgrst, 'reload schema';
