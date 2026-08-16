-- ===========================================================================
-- 0041 — I pagamenti delle ultime ventiquattro ore
-- ===========================================================================
--
-- La scheda «Conferma» mostrava una cosa sola: i movimenti **non ancora
-- confermati**. E' la lista della sera, e il suo pregio e' che finisce — si
-- svuota, e quando e' vuota dice «sei in pari».
--
-- Ma «rivedere cosa ho pagato oggi» e' un'altra domanda, e su quella lista non
-- ha risposta: appena approvi una riga, sparisce. Dieci minuti dopo, se vuoi
-- ricontrollare quell'addebito che non riconoscevi, non c'e' piu' — e proprio
-- il fatto di averlo approvato lo ha nascosto.
--
-- Questa vista risponde alla seconda domanda: **tutto quello che e' stato
-- pagato**, confermato o no.
--
-- ---------------------------------------------------------------------------
-- Perche' non basta togliere un `where` a `v_da_confermare`
-- ---------------------------------------------------------------------------
-- Perche' le due liste devono poter divergere senza rompersi a vicenda. Una
-- chiede un'azione e si svuota, l'altra e' un registro e non si svuota mai; e
-- questa porta due colonne che li' non servono — `confermato_at`, per dire
-- quali sono gia' passate, e `is_transfer`... no: si appoggia a `v_expenses`,
-- che i giroconti li ha gia' tolti.
--
-- ---------------------------------------------------------------------------
-- Le `pending` ci sono, ed e' il contrario di quello che fa l'altra
-- ---------------------------------------------------------------------------
-- `v_da_confermare` le esclude apposta: un movimento provvisorio puo' cambiare
-- importo, e confermarlo adesso significherebbe riconfermarlo dopo.
--
-- Qui non si conferma niente, si **guarda**: e un addebito fatto un'ora fa,
-- ancora provvisorio, e' esattamente quello che si vuole vedere quando si apre
-- la schermata per controllare. Lo stato resta fra le colonne, cosi' la riga
-- puo' dire di se' che e' ancora provvisoria.
--
-- ---------------------------------------------------------------------------
-- Il giorno e' un giorno civile
-- ---------------------------------------------------------------------------
-- La finestra la sceglie chi chiama, passando due date. `booking_date` e' un
-- `date` e non un istante: non si converte in nessun fuso, o i movimenti di
-- inizio e fine giornata finirebbero nel giorno sbagliato — la stessa regola
-- che vale su ogni aggregato mensile dell'applicazione.

create or replace view public.v_ultimi_movimenti with (security_invoker = on) as
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
       -- Cio' che distingue questa vista dall'altra: qui le righe gia' viste
       -- restano, e si sa quali sono.
       t.confermato_at
from public.v_expenses e
join public.transactions t on t.id = e.id
left join public.merchants m on m.id = e.merchant_id
left join public.categories c on c.id = e.category_id;

comment on view public.v_ultimi_movimenti is
  'I pagamenti reali con la loro classificazione, confermati o no, provvisori compresi. Per rivedere, non per confermare.';

grant select on public.v_ultimi_movimenti to authenticated;

notify pgrst, 'reload schema';
