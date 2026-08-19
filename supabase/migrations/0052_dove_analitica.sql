-- 0052_dove_analitica.sql
--
-- «Dove» cambia mestiere: da elenco a analisi. Non risponde piu' soltanto a
-- «dove ho speso» ma a «quando sto spendendo» e «cosa sta cambiando» — e per
-- quelle due domande servono due aggregati che nessuna vista dava.
--
-- ---------------------------------------------------------------------------
-- spesa_giornaliera — il mese, giorno per giorno
-- ---------------------------------------------------------------------------
-- L'andamento dentro il mese: i picchi, i giorni a zero, le concentrazioni.
-- Solo i giorni CON spesa: e' chi disegna a riempire i buchi con lo zero,
-- perche' l'asse del tempo li deve mostrare — un 1° agosto pieno e un 2 vuoto
-- sono due informazioni, e schiacciarle una sull'altra le perderebbe entrambe.

create or replace function public.spesa_giornaliera(p_mese date)
returns table (giorno date, spesa text)
language sql
stable
security invoker
set search_path = ''
as $$
select e.booking_date,
       sum(e.amount_eur)::text
from public.v_expenses e
where e.amount_eur is not null
  and date_trunc('month', e.booking_date)::date = date_trunc('month', p_mese)::date
group by 1
order by 1;
$$;

comment on function public.spesa_giornaliera(date) is
  'La spesa reale di un mese, giorno per giorno. Solo i giorni con spesa: i buchi li riempie chi disegna.';

revoke all on function public.spesa_giornaliera(date) from public;
grant execute on function public.spesa_giornaliera(date) to authenticated;

-- ---------------------------------------------------------------------------
-- spesa_mensile_ricorrente — quanto e' USCITO ogni mese verso i ricorrenti
-- ---------------------------------------------------------------------------
-- Non e' il costo mensile della metrica (quello e' un tasso su tutto lo
-- storico): e' la spesa realmente registrata, mese per mese, verso gli
-- esercenti che oggi sono ricorrenze nella metrica di quel tipo. Serve a
-- vedere se il ricorrente sta CRESCENDO — che e' una domanda sull'andamento,
-- non sul livello.
--
-- `distinct` sugli esercenti prima del join: se un giorno il rilevatore
-- scrivesse due serie per lo stesso esercente, un join diretto conterebbe i
-- suoi movimenti due volte, e un totale gonfiato in silenzio e' il guasto che
-- questa applicazione esiste per non avere.

create or replace function public.spesa_mensile_ricorrente(p_tipo text)
returns table (mese date, spesa text)
language sql
stable
security invoker
set search_path = ''
as $$
select date_trunc('month', e.booking_date)::date,
       sum(e.amount_eur)::text
from public.v_expenses e
join (
  select distinct s.merchant_id
  from public.v_subscriptions s
  where s.nella_metrica and s.tipo = p_tipo
) ricorrenti on ricorrenti.merchant_id = e.merchant_id
where e.amount_eur is not null
group by 1
order by 1;
$$;

comment on function public.spesa_mensile_ricorrente(text) is
  'La spesa reale per mese verso gli esercenti che sono ricorrenze nella metrica del tipo dato (abbonamento/abitudine).';

revoke all on function public.spesa_mensile_ricorrente(text) from public;
grant execute on function public.spesa_mensile_ricorrente(text) to authenticated;

notify pgrst, 'reload schema';
