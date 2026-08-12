-- 0021_confronto_omogeneo.sql
--
-- Fase 6-bis, secondo passo: rendere leggibile il mese in corso.
--
-- ---------------------------------------------------------------------------
-- Il numero che inganna
-- ---------------------------------------------------------------------------
-- Il cruscotto scrive «−996,14 €» accanto a «−72,6% su luglio». Sono undici
-- giorni contro trentuno, e quel confronto si legge come «ho speso molto
-- meno», che e' falso. Non e' un difetto di presentazione: e' un confronto fra
-- due grandezze diverse presentato come se fossero la stessa.
--
-- La tentazione e' proiettare: «a questo ritmo finirai a −2.800». E' una
-- estrapolazione travestita da informazione, ed e' lo stesso errore gia' fatto
-- e corretto in Fase 5, dove estrapolare da un intervallo mediano dichiarava
-- 8.966 EUR/mese di spesa che non esisteva.
--
-- La risposta onesta e' **misurare la stessa finestra**: i primi N giorni di
-- questo mese contro i primi N giorni dei mesi precedenti. Nessuna assunzione,
-- nessun tasso inventato — due numeri confrontabili perche' coprono lo stesso
-- numero di giorni.
--
-- ---------------------------------------------------------------------------
-- Perche' il giorno civile e non il giorno progressivo
-- ---------------------------------------------------------------------------
-- Si filtra su `extract(day from booking_date) <= N`, cioe' sul giorno del
-- mese. Un mese di trenta giorni e uno di trentuno restano confrontabili
-- finche' N e' minore di ventotto, che e' sempre il caso quando serve — il
-- confronto interessa mentre il mese e' in corso.

create function public.spesa_nei_primi_giorni(
  p_giorni integer,
  p_mesi   integer default 6
)
returns table (
  mese      date,
  -- Testo e non `numeric`: PostgREST serializza `numeric` come numero JSON, e
  -- in JavaScript un numero e' un float.
  spesa     text,
  movimenti bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('month', booking_date)::date,
         sum(amount_eur)::text,
         count(*)
  from public.v_expenses
  where amount_eur is not null
    and extract(day from booking_date) <= greatest(1, least(coalesce(p_giorni, 31), 31))
  group by 1
  order by 1 desc
  limit greatest(2, least(coalesce(p_mesi, 6), 24));
$$;

comment on function public.spesa_nei_primi_giorni(integer, integer) is
  'Spesa nei primi N giorni di ogni mese. Serve a confrontare un mese in corso con gli stessi giorni dei precedenti, invece di proiettarlo.';

revoke all on function public.spesa_nei_primi_giorni(integer, integer) from public;
grant execute on function public.spesa_nei_primi_giorni(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- `merchant_id` su v_subscriptions
-- ---------------------------------------------------------------------------
-- La scheda di un esercente deve poter dire «di questo ho rilevato una
-- ricorrenza», e per farlo serve poter risalire dalla ricorrenza all'esercente.
-- La vista esponeva solo il nome, che non e' una chiave.
--
-- Le tre viste si ricreano in ordine di dipendenza, senza `cascade`: `cascade`
-- porterebbe via anche viste che questa migration non ricrea, e il danno si
-- scoprirebbe solo alla prima query che non trova piu' niente.

drop view if exists public.v_ricorrenze_escluse;
drop view if exists public.v_recurring_monthly_cost_by_discretion;
drop view if exists public.v_subscriptions;

create view public.v_subscriptions with (security_invoker = on) as
select s.id,
       s.merchant_id,
       m.canonical_name          as esercente,
       c.name                    as categoria,
       m.discretion              as discrezionalita,
       m.context                 as contesto,
       case when m.is_subscription then 'abbonamento' else 'abitudine' end as tipo,
       s.cadence, s.cadence_days,
       s.expected_amount, s.typical_amount, s.total_amount,
       s.covered_days,
       (s.status = 'active' and s.active_months >= 3 and s.covered_days >= 75)
                                 as nella_metrica,
       case
         when s.active_months < 3 or s.covered_days < 75 then null
         when m.is_subscription and s.cadence <> 'irregular' and s.cadence_days > 0
              and s.confidence >= 0.9 and s.amount_stability >= 0.95
           then round(s.typical_amount * (30.44 / s.cadence_days), 2)
         when s.covered_days > 0
           then round(s.total_amount * (30.44 / s.covered_days), 2)
       end                       as costo_mensile,
       s.first_seen, s.last_seen, s.next_expected,
       s.occurrences, s.active_months,
       s.confidence, s.amount_stability,
       s.status, s.usage_verdict, s.notes
from public.subscriptions s
join public.merchants m on m.id = s.merchant_id
left join public.categories c on c.id = m.category_id;

grant select on public.v_subscriptions to authenticated;

create view public.v_recurring_monthly_cost_by_discretion with (security_invoker = on) as
select tipo,
       coalesce(discrezionalita, 'non classificato') as discrezionalita,
       coalesce(contesto, 'non classificato')        as contesto,
       count(*)                                      as ricorrenze,
       sum(costo_mensile)                            as costo_mensile
from public.v_subscriptions
where nella_metrica
group by 1, 2, 3;

grant select on public.v_recurring_monthly_cost_by_discretion to authenticated;

create view public.v_ricorrenze_escluse with (security_invoker = on) as
select case
         when status = 'cancelled'  then 'disdetto'
         when status = 'lapsed'     then 'fermo da tempo'
         when active_months < 3     then 'meno di tre mesi di presenza'
         else 'meno di 75 giorni coperti'
       end                                    as motivo,
       count(*)                               as esercenti,
       sum(coalesce(costo_mensile, 0))        as costo_mensile_potenziale,
       sum(coalesce(total_amount, 0))         as totale_speso
from public.v_subscriptions
where not nella_metrica
group by 1;

grant select on public.v_ricorrenze_escluse to authenticated;

notify pgrst, 'reload schema';
