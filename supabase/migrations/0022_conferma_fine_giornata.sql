-- 0022_conferma_fine_giornata.sql
--
-- La conferma di fine giornata: l'app mostra i movimenti nuovi con la
-- classificazione che ha proposto, e si conferma con un gesto o si corregge.
--
-- ---------------------------------------------------------------------------
-- Perche' esiste, e perche' la sera
-- ---------------------------------------------------------------------------
-- `discretion` vive sull'esercente e si propaga a tutte le sue transazioni. E'
-- la scelta che rende sostenibile la classificazione — si risponde «Deliveroo
-- e' voluttuario» una volta invece che su 59 righe — ma ha un limite
-- strutturale: **lo stesso esercente ospita acquisti con intenti diversi.**
-- Un computer comprato da Euronics per lavorare e' `investimento` e
-- `business`; una sciocchezza comprata nello stesso negozio e' `voluttuario` e
-- `personale`. Il negozio e' identico, la spesa no, e l'informazione non e' nei
-- dati bancari: e' nella testa di chi ha comprato.
--
-- Due ragioni per chiedere la sera e non dopo:
--
-- 1. **La memoria dell'intento decade in fretta.** A un mese di distanza
--    «89 € da Euronics» non si ricostruisce piu', e la risposta diventa
--    un'ipotesi. La sera e' ancora un fatto.
-- 2. **I movimenti di una giornata sono pochi.** E' un gesto da trenta
--    secondi, non una sessione di riordino — ed e' la differenza fra una cosa
--    che si fa e una che si rimanda.

-- ---------------------------------------------------------------------------
-- La colonna
-- ---------------------------------------------------------------------------

alter table public.transactions add column confermato_at timestamptz;

comment on column public.transactions.confermato_at is
  'Quando l''utente ha visto e accettato la classificazione di QUESTA riga. Null = da confermare.';

-- Lo storico nasce confermato.
--
-- Senza questa riga la schermata si aprirebbe su **1.323 movimenti arretrati**,
-- e una lista di arretrati non si smaltisce: si chiude. Quei movimenti sono
-- gia' stati guardati in aggregato — la copertura al 94% in euro e' stata
-- verificata voce per voce in Fase 4 — e trattarli come "mai visti" sarebbe
-- falso oltre che scoraggiante.
update public.transactions set confermato_at = now() where confermato_at is null;

create index transactions_da_confermare_idx
  on public.transactions (booking_date desc)
  where confermato_at is null;

-- ---------------------------------------------------------------------------
-- v_da_confermare
-- ---------------------------------------------------------------------------
-- Si appoggia a `v_expenses` invece di ripeterne il predicato. Non e'
-- pignoleria: «cos'e' una spesa reale» e' una regola scritta in un posto solo,
-- e una seconda copia potrebbe divergere senza che niente lo segnali — la
-- schermata chiederebbe di confermare movimenti che nessun totale conta, o
-- ne salterebbe altri.
--
-- La colonna nuova si legge da `transactions` con una join sull'id, e non da
-- `v_expenses`: quella vista e' definita con `t.*` e ha congelato le sue
-- colonne alla creazione, quindi `confermato_at` li' dentro non c'e'. La join
-- evita di doverla ricreare insieme a tutto cio' che ci sta sopra.

create view public.v_da_confermare with (security_invoker = on) as
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
       -- Da dove viene la classificazione proposta. `ai` non confermata e' la
       -- prima da guardare: vale per i conteggi, ma nessuno l'ha ancora vista.
       m.origine               as origine_classificazione,
       m.confermato_at         as esercente_confermato_at,
       m.motivazione,
       c.id                    as category_id,
       c.name                  as categoria
from public.v_expenses e
join public.transactions t on t.id = e.id
left join public.merchants m on m.id = e.merchant_id
left join public.categories c on c.id = e.category_id
where t.confermato_at is null
  -- Un movimento provvisorio puo' ancora cambiare importo o sparire: farlo
  -- confermare adesso significherebbe farlo riconfermare dopo, o peggio,
  -- lasciare una conferma su un dato che non esiste piu'.
  and e.status = 'booked';

comment on view public.v_da_confermare is
  'Spese reali gia'' contabilizzate e mai confermate. E'' la lista della sera.';

grant select on public.v_da_confermare to authenticated;

-- ---------------------------------------------------------------------------
-- Le due scritture
-- ---------------------------------------------------------------------------
-- Sono due operazioni distinte e non una con parametri opzionali, perche'
-- fanno due cose diverse a `manually_categorized`.
--
-- **Confermare** dice «la proposta va bene»: la riga resta agganciata al suo
-- esercente, e se domani la classificazione dell'esercente cambia questa la
-- segue. Sarebbe sbagliato bloccarla — l'utente ha approvato una regola, non
-- inciso un valore.
--
-- **Correggere** dice «questa riga fa eccezione»: e' il computer da Euronics.
-- Li' `manually_categorized` va messo, ed e' esattamente cio' che protegge la
-- riga da ogni sovrascrittura automatica successiva.

create function public.conferma_movimento(p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.transactions
     set confermato_at = now()
   where id = p_id;
$$;

comment on function public.conferma_movimento(uuid) is
  'La proposta va bene. NON marca manually_categorized: la riga continua a seguire il suo esercente.';

create function public.correggi_movimento(
  p_id              uuid,
  p_discrezionalita text default null,
  p_contesto        text default null,
  p_note            text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.transactions
     set discretion  = coalesce(p_discrezionalita, discretion),
         context     = coalesce(p_contesto, context),
         notes       = case when p_note is null or btrim(p_note) = ''
                            then notes else btrim(p_note) end,
         -- Da qui in poi l'automatismo non tocca piu' questa riga. E' il patto
         -- scritto nelle regole di correttezza: le correzioni dell'utente sono
         -- sacre.
         manually_categorized = true,
         confermato_at = now()
   where id = p_id;
$$;

comment on function public.correggi_movimento(uuid, text, text, text) is
  'Questa riga fa eccezione rispetto al suo esercente. Marca manually_categorized: nessun automatismo la tocchera'' piu''.';

revoke all on function public.conferma_movimento(uuid) from public;
revoke all on function public.correggi_movimento(uuid, text, text, text) from public;
grant execute on function public.conferma_movimento(uuid) to authenticated;
grant execute on function public.correggi_movimento(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
