-- 0018_soglia_in_giorni.sql
--
-- Un difetto trovato leggendo il dettaglio sui dati veri, che il totale
-- nascondeva.
--
-- ---------------------------------------------------------------------------
-- Tre mesi civili possono essere trentadue giorni
-- ---------------------------------------------------------------------------
-- La 0017 chiede `active_months >= 3` per parlare di ricorrenza. L'intento era
-- «deve aver attraversato almeno tre mesi», ma i mesi civili non misurano il
-- tempo: il 31 gennaio, il 1 febbraio e il 1 marzo sono tre mesi civili
-- distinti e ventinove giorni.
--
-- Sui dati veri: `Byteplus`, 10 addebiti, tre mesi civili, **64 giorni**
-- coperti. 455,14 EUR spesi diventavano 216,48 EUR/mese — il 42% di tutto il
-- `utile/business`, calcolato su due mesi scarsi di osservazione. E' la stessa
-- raffica che la regola doveva escludere: e' passata perche' la regola era
-- scritta nell'unita' di misura sbagliata.
--
-- La correzione traduce la regola in giorni: **75 giorni coperti**, che sono
-- due mesi e mezzo. Non e' una soglia nuova, e' la stessa detta in modo che
-- misuri cio' che intendeva misurare.
--
-- ---------------------------------------------------------------------------
-- E una definizione sola invece di tre
-- ---------------------------------------------------------------------------
-- «Entra nel numero» era scritto in tre posti — le due viste e il filtro della
-- schermata — e le tre copie potevano divergere senza che nulla lo segnalasse.
-- Ora e' una colonna, `nella_metrica`, calcolata una volta in `v_subscriptions`.
-- Le viste sopra la leggono, la schermata la legge, e il copilot della Fase 10
-- potra' leggerla anche lui invece di reimplementare il criterio.

drop view if exists public.v_ricorrenze_escluse;
drop view if exists public.v_recurring_monthly_cost_by_discretion;
drop view if exists public.v_subscriptions;

create view public.v_subscriptions with (security_invoker = on) as
select s.id,
       m.canonical_name          as esercente,
       c.name                    as categoria,
       m.discretion              as discrezionalita,
       m.context                 as contesto,
       case when m.is_subscription then 'abbonamento' else 'abitudine' end as tipo,
       s.cadence, s.cadence_days,
       s.expected_amount, s.typical_amount, s.total_amount,
       s.covered_days,
       -- La definizione, in un posto solo.
       (s.status = 'active' and s.active_months >= 3 and s.covered_days >= 75)
                                 as nella_metrica,
       -- Il ramo del CANONE e' un'assunzione, e si usa solo dove la serie e'
       -- quasi perfetta: li' serve che Netflix dica 6,99, perche' un numero
       -- che non si riconosce non si crede.
       --
       -- Il ramo MISURATO e' un'osservazione: speso diviso tempo. Vale per
       -- tutto il resto, abbonamenti a consumo compresi.
       --
       -- Sotto la soglia non c'e' nessun costo mensile: dividere una raffica
       -- per la sua durata da' un tasso che non e' mai stato sostenuto per un
       -- mese. Quanto sia realmente uscito lo dice `total_amount`.
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

comment on view public.v_subscriptions is
  'Ricorrenze rilevate. `tipo` separa cio'' che si disdice da cio'' che si cambia; `nella_metrica` dice se entra nel numero.';

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
