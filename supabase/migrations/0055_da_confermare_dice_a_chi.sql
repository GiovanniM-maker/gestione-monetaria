-- ---------------------------------------------------------------------------
-- 0055 — «Da confermare» dice a CHI, non solo COME
-- ---------------------------------------------------------------------------
-- Su un invio P2P la banca scrive la stessa identica causale su ogni riga:
-- `Sent from Revolut` sull'affitto, sulla farmacia e sui trenta euro a un
-- amico. Le schermate mostravano quella, perche' senza esercente era l'unica
-- cosa che avessero — e dieci righe chiamate tutte allo stesso modo non sono un
-- elenco: non si sa quale toccare.
--
-- Il destinatario esiste, sta in `transactions.counterparty_raw`, e le altre
-- schermate ce l'hanno gia' (`cerca_movimenti` lo restituisce). Mancava solo
-- qui, quindi «Da confermare» — che e' la schermata dove quelle righe si
-- incontrano piu' spesso — restava l'unica a non poterlo dire.
--
-- La colonna va **in coda**: cambiare l'ordine di quelle esistenti imporrebbe
-- di ricreare la vista e tutto cio' che ci sta sopra, mentre cosi' basta
-- `create or replace` — che e' anche cio' che rende questa migration
-- rieseguibile senza un `drop`.
--
-- Regola 8: e' un dato che finisce sullo schermo dell'utente, non in un prompt.
-- Il confine con l'LLM lo presidia `sanificaMetriche`, che non legge questa
-- vista.

create or replace view public.v_da_confermare with (security_invoker = on) as
select e.id,
       e.booking_date,
       e.amount::text          as amount,
       e.amount_eur::text      as amount_eur,
       e.currency,
       e.status                as stato,
       e.raw_description,
       e.discretion            as discrezionalita,
       e.context               as contesto,
       e.manually_categorized,
       e.notes                 as note,
       m.id                    as merchant_id,
       m.canonical_name        as esercente,
       m.origine               as origine_classificazione,
       m.confermato_at         as esercente_confermato_at,
       m.motivazione,
       c.id                    as category_id,
       c.name                  as categoria,
       -- In coda, per non ricreare la vista e tutto cio' che ci sta sopra.
       case when e.category_id is null then 'senza categoria' else 'nuovo' end as motivo,
       -- In coda, come `motivo`: cambiare l'ordine delle colonne di una vista
       -- esistente vorrebbe dire ricrearla, e con lei tutto cio' che ci sta
       -- sopra. Aggiungere in fondo lascia bastare `create or replace`.
       e.counterparty_raw
from public.v_expenses e
join public.transactions t on t.id = e.id
left join public.merchants m on m.id = e.merchant_id
left join public.categories c on c.id = e.category_id
where (t.confermato_at is null or e.category_id is null)
  -- Un movimento provvisorio puo' ancora cambiare importo o sparire: farlo
  -- confermare adesso significherebbe farlo riconfermare dopo, o peggio,
  -- lasciare una conferma su un dato che non esiste piu'.
  and e.status = 'booked';

comment on view public.v_da_confermare is
  'Cosa c''e'' da fare: i movimenti mai confermati e quelli senza categoria, che confermare non sistema. `counterparty_raw` e'' il nome da mostrare quando un esercente non c''e''.';

grant select on public.v_da_confermare to authenticated;
