-- ---------------------------------------------------------------------------
-- 0056 — Via il ciclo di vita doppio delle conversazioni
-- ---------------------------------------------------------------------------
-- Rimedio a un guasto in produzione, e a una divergenza fra lo schema vero e
-- quello che le migration descrivono.
--
-- ---------------------------------------------------------------------------
-- Cos'era successo
-- ---------------------------------------------------------------------------
-- Due rami hanno costruito la stessa cosa. La `0051_conversazioni_salvate` ha
-- dato alle conversazioni una riga pigra, la stella e una scadenza calcolata
-- **dai messaggi**; una migration parallela, applicata dopo, ci ha aggiunto una
-- colonna `scade_at` e un vincolo che pretende che ogni conversazione non
-- salvata ne abbia una.
--
-- Quel vincolo rompe `salvaConversazione`, che fa `upsert({ id, salvata })`
-- senza `scade_at`: spegnere la stella e rinominare una conversazione nuova
-- fallivano entrambi con una violazione di check.
--
-- ---------------------------------------------------------------------------
-- Perche' vince il disegno della 0051
-- ---------------------------------------------------------------------------
-- Perche' la scadenza la **calcola** invece di memorizzarla, e un valore
-- derivato in lettura non ha bisogno di nessuno che lo tenga aggiornato. E' lo
-- stesso principio per cui `v_obiettivi` deriva `stato` invece di scriverlo:
-- una colonna da mantenere richiede un lavoro periodico, e un lavoro che non
-- gira lascia il dato sbagliato per sempre senza dirlo.
--
-- Delle due implementazioni non se ne tiene una e mezza: si toglie l'intera
-- seconda, vincolo, funzioni e vista.

alter table public.chat_conversations
  drop constraint if exists chat_conversations_scadenza;

-- Le tre funzioni parallele. `pulisci_conversazioni(integer)` della 0051 resta,
-- ed e' quella che chiama la sequenza quotidiana.
drop function if exists public.tocca_conversazione(uuid);
drop function if exists public.conserva_conversazione(uuid, boolean);
drop function if exists public.pulisci_conversazioni_scadute();

-- La vista torna quella della 0051, parola per parola. Quella parallela
-- funzionava — aveva le stesse colonne piu' due — ma lo schema vero e le
-- migration devono descrivere la stessa cosa: se divergono, chi ricostruisce
-- da zero ottiene un database diverso da quello in produzione, e non se ne
-- accorge finche' non gli serve.
drop view if exists public.v_conversazioni;

create view public.v_conversazioni with (security_invoker = on) as
select m.conversazione_id,
       min(m.created_at) as iniziata_at,
       max(m.created_at) as ultima_at,
       count(*)          as messaggi,
       coalesce(
         c.titolo,
         (array_agg(m.testo order by m.created_at) filter (where m.ruolo = 'utente'))[1]
       ) as titolo,
       coalesce(c.salvata, false) as salvata
from public.chat_messages m
left join public.chat_conversations c on c.id = m.conversazione_id
group by m.conversazione_id, c.titolo, c.salvata;

grant select on public.v_conversazioni to authenticated;

-- ---------------------------------------------------------------------------
-- Le tre colonne restano, e non e' pigrizia
-- ---------------------------------------------------------------------------
-- `drop column` e' l'unica operazione di questo file che non si torna indietro,
-- e queste colonne non fanno danno: nessun codice le legge, nessun vincolo le
-- pretende, e il default di `titolo_manuale` e' `false`. Toglierle e' una
-- pulizia che si fa quando si tocchera' questa tabella per un motivo vero,
-- non un rischio da correre adesso per estetica.
comment on column public.chat_conversations.scade_at is
  'NON USATA. La scadenza si calcola dai messaggi in pulisci_conversazioni(). Residuo di un ciclo di vita parallelo, rimosso dalla 0056.';
comment on column public.chat_conversations.ultima_at is
  'NON USATA. `v_conversazioni` la calcola da chat_messages. Residuo, rimosso dalla 0056.';
comment on column public.chat_conversations.titolo_manuale is
  'NON USATA per ora: il titolo generato non sovrascrive quello che c''e'' gia''. Residuo, rimosso dalla 0056.';

notify pgrst, 'reload schema';
