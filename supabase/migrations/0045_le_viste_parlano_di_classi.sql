-- 0045_le_viste_parlano_di_classi.sql
--
-- Le viste che parlano di discrezionalita' imparano a leggere la tabella delle
-- classi: il nome mostrato, il colore, l'ordine, e — dove serve — se la classe
-- entra nel totale del costo ricorrente.
--
-- ---------------------------------------------------------------------------
-- Le colonne che c'erano restano identiche
-- ---------------------------------------------------------------------------
-- `discrezionalita` continua a essere lo **slug**, con lo stesso nome e gli
-- stessi valori. Le colonne nuove si aggiungono in coda. E' cio' che permette
-- di applicare questa migration mentre il TypeScript non e' ancora aggiornato,
-- senza che una sola schermata si rompa nel frattempo.
--
-- ---------------------------------------------------------------------------
-- `nel_ricorrente` NON compare sulle viste della spesa
-- ---------------------------------------------------------------------------
-- Sta su `v_subscriptions` e su `v_recurring_monthly_cost_by_discretion`, e da
-- nessun'altra parte. `v_monthly_by_discretion` e' la spesa del mese divisa per
-- classe, e la spesa del mese non conosce quel flag: luglio 2026 dice
-- −3.640,32 €, verificato al centesimo contro l'app della banca, e nessuna
-- dichiarazione sulle classi puo' spostare quel numero.
--
-- Non e' una convenzione da rispettare, e' una colonna che non c'e': chi
-- volesse filtrare la spesa mensile per `nel_ricorrente` non troverebbe da
-- dove. Vale anche per il modello, che e' il lettore piu' probabile di quella
-- vista e il piu' incline a sommare cio' che gli capita sotto gli occhi.
--
-- ---------------------------------------------------------------------------
-- La pseudo-classe «non classificato» entra nel numero
-- ---------------------------------------------------------------------------
-- Nei dati e' un `null`, quindi non ha una riga in `discretion_classes` e le
-- sue colonne arrivano dal `coalesce`: nome «Non classificato», colore
-- `neutro`, ordine 999 — ultima, sempre — e `nel_ricorrente` **vero**.
--
-- Vero e non falso, e non e' un dettaglio: quello che non sappiamo si conta.
-- Se sparisse dal totale, il numero calerebbe ogni volta che arriva un
-- esercente nuovo, e calerebbe **in silenzio** — cioe' il guasto peggiore
-- possibile qui, perche' sembra un miglioramento.
--
-- ---------------------------------------------------------------------------
-- L'ordine di ricreazione
-- ---------------------------------------------------------------------------
-- In ordine di dipendenza e senza `cascade`: `cascade` porterebbe via anche
-- viste che questa migration non ricrea, e il danno si scoprirebbe solo alla
-- prima query che non trova piu' niente.

-- ---------------------------------------------------------------------------
-- v_monthly_by_discretion — la spesa del mese, per classe
-- ---------------------------------------------------------------------------
-- Nessuna vista dipende da questa: si puo' sostituire da sola.

drop view if exists public.v_monthly_by_discretion;

create view public.v_monthly_by_discretion with (security_invoker = on) as
select date_trunc('month', e.booking_date)::date          as mese,
       coalesce(e.discretion, 'non classificato')         as discrezionalita,
       coalesce(d.nome, 'Non classificato')               as classe_nome,
       coalesce(d.colore, 'neutro')                       as colore,
       coalesce(d.sort_order, 999)                        as ordine,
       coalesce(e.context, 'non classificato')            as contesto,
       sum(e.amount_eur)                                  as spesa,
       count(*)                                           as movimenti
from public.v_expenses e
left join public.discretion_classes d on d.slug = e.discretion
where e.amount_eur is not null
group by 1, 2, 3, 4, 5, 6;

comment on view public.v_monthly_by_discretion is
  'Spesa reale del mese per classe di discrezionalita''. Non conosce `nel_ricorrente`: la spesa del mese non si filtra per classe.';

grant select on public.v_monthly_by_discretion to authenticated;

-- ---------------------------------------------------------------------------
-- Le tre viste delle ricorrenze
-- ---------------------------------------------------------------------------

drop view if exists public.v_ricorrenze_escluse;
drop view if exists public.v_recurring_monthly_cost_by_discretion;
drop view if exists public.v_subscriptions;

create view public.v_subscriptions with (security_invoker = on) as
select s.id,
       s.merchant_id,
       m.canonical_name          as esercente,
       c.name                    as categoria,
       m.discretion              as discrezionalita,
       coalesce(d.nome, 'Non classificato')   as classe_nome,
       coalesce(d.colore, 'neutro')           as classe_colore,
       coalesce(d.sort_order, 999)            as classe_ordine,
       -- Se questa voce entra nel **totale** del costo ricorrente. Distinta da
       -- `nella_metrica`, che risponde a un'altra domanda: se la serie e'
       -- abbastanza lunga da valere come ricorrenza. Una voce puo' essere una
       -- ricorrenza vera e stare fuori dal totale, ed e' il caso per cui
       -- questa colonna esiste.
       coalesce(d.nel_ricorrente, true)       as nel_ricorrente,
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
left join public.categories c on c.id = m.category_id
left join public.discretion_classes d on d.slug = m.discretion;

grant select on public.v_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- v_recurring_monthly_cost_by_discretion — LA metrica
-- ---------------------------------------------------------------------------
-- Una riga per tipo, classe e contesto. `nel_ricorrente` non filtra niente
-- **qui**: la ripartizione le contiene tutte, ed e' chi mostra il totale a
-- separare cio' che ci sta dentro da cio' che resta sotto la linea. Una vista
-- che filtrasse da sola nasconderebbe delle righe, e una ripartizione a cui
-- mancano delle righe mente per omissione.

create view public.v_recurring_monthly_cost_by_discretion with (security_invoker = on) as
select tipo,
       coalesce(discrezionalita, 'non classificato') as discrezionalita,
       classe_nome,
       classe_colore                                 as colore,
       classe_ordine                                 as ordine,
       nel_ricorrente,
       coalesce(contesto, 'non classificato')        as contesto,
       count(*)                                      as ricorrenze,
       sum(costo_mensile)                            as costo_mensile
from public.v_subscriptions
where nella_metrica
group by 1, 2, 3, 4, 5, 6, 7;

comment on view public.v_recurring_monthly_cost_by_discretion is
  'La metrica principale. Contiene TUTTE le classi: `nel_ricorrente` dice quali entrano nel totale, le altre si mostrano sotto la linea.';

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
