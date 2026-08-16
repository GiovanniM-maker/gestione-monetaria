-- ===========================================================================
-- 0042 — Un movimento senza categoria e' sempre da guardare
-- ===========================================================================
--
-- `v_da_confermare` mostrava una cosa sola: `confermato_at is null`. E' la
-- domanda giusta per i movimenti **nuovi**, ma nasconde un caso che conta di
-- piu':
--
--   la 0022 ha marcato **tutto lo storico** come confermato — 1.323 righe in un
--   colpo, e con ragione: una lista di arretrati non si smaltisce, si chiude.
--   Quelle righe pero' comprendevano anche i movimenti **senza categoria**, che
--   confermati non sono mai stati guardati uno per uno: sono stati dichiarati
--   visti in blocco.
--
-- Da allora un movimento senza categoria non compare da nessuna parte dove si
-- possa agire. Sta nel totale — quindi sposta la spesa reale — ma non entra in
-- nessun aggregato per categoria, e il cruscotto lo sa dire («N movimenti per
-- X € sono nel totale ma senza categoria») senza offrire un posto dove
-- sistemarlo che non sia una schermata di manutenzione.
--
-- ---------------------------------------------------------------------------
-- Il criterio diventa «c'e' qualcosa da fare», non «e' nuovo»
-- ---------------------------------------------------------------------------
-- Una riga entra nella lista se **almeno una** delle due e' vera:
--
--   * non e' mai stata confermata — il caso della sera, quello di sempre;
--   * non ha una categoria — e allora e' scoperta, e va assegnata comunque
--     l'abbia gia' vista qualcuno.
--
-- La seconda non si svuota confermando: confermare non da' una categoria. Si
-- svuota **classificando**, che e' esattamente cio' che si vuole che succeda.
--
-- ---------------------------------------------------------------------------
-- La riga dice perche' e' li'
-- ---------------------------------------------------------------------------
-- `motivo` esiste perche' le due ragioni chiedono due gesti diversi: su una
-- riga nuova «va bene» e' la risposta giusta, su una scoperta non serve a
-- niente — bisogna darle una categoria. Senza quella parola la schermata
-- offrirebbe lo stesso bottone per due situazioni diverse, e una delle due
-- resterebbe li' per sempre.
--
-- Aggiunta **in coda**, cosi' `create or replace` basta: cambiare l'ordine
-- delle colonne di una vista esistente vorrebbe dire ricrearla, e con lei tutto
-- cio' che ci sta sopra.

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
       case when e.category_id is null then 'senza categoria' else 'nuovo' end as motivo
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
  'Cosa c''e'' da fare: i movimenti mai confermati e quelli senza categoria, che confermare non sistema.';

-- L'indice della 0022 copre solo `confermato_at is null`. Le righe scoperte
-- sono poche e la vista le trova comunque, ma senza questo la loro meta' della
-- condizione costa una scansione a ogni apertura della schermata.
create index if not exists transactions_senza_categoria_idx
  on public.transactions (booking_date desc)
  where category_id is null;

notify pgrst, 'reload schema';
