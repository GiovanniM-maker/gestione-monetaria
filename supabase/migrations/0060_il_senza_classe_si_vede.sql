-- ===========================================================================
-- 0060 — Quante righe restano senza classe, e dove si sistemano
-- ===========================================================================
-- La 0058 e la 0059 impediscono a una riga di **finire** senza classe. Ma una
-- riga puo' restarci per una ragione che nessun automatismo puo' togliere: un
-- bonifico a un privato non ha un esercente, quindi non ha una categoria da cui
-- ereditare, e la regola 8 vieta comunque di chiederlo a un modello. Solo
-- l'utente sa se e' un affitto, un prestito o un compenso.
--
-- Per quelle righe la via manuale non e' un ripiego: **e' la sola fonte
-- dell'informazione** — la stessa ragione per cui `own_counterparties` si
-- dichiara a mano invece di essere indovinata.
--
-- E una via manuale che non si trova non esiste. Il filtro `classe=non
-- classificato` c'e' su `/movimenti` da sempre, ma bisogna sapere che c'e':
-- l'unica strada che ci porta e' scendere in `/dove` fino alla foglia giusta.
-- Il cruscotto dice gia' quanti movimenti sono **senza categoria**, con accanto
-- «Assegnali»; la classe, che e' la dimensione per cui questa applicazione
-- esiste, non la dice nessuno.
--
-- Due colonne su `v_monthly_totals`, ed e' la stessa coppia gia' li' per la
-- categoria: quante righe e quanti euro. Il conteggio da solo non basta —
-- quattro righe da due euro e quattro da mille sono lo stesso numero e due
-- lavori diversi.
--
-- `create or replace view` e non `drop`: le colonne nuove vanno **in coda** e
-- le precedenti restano identiche per nome, tipo e ordine, che e' esattamente
-- la modifica che `replace` ammette. Le quattro migration che leggono questa
-- vista (0025, 0027, 0030, 0046) nominano le colonne che usano, quindi non si
-- toccano. E' la manovra provata con la 0054, e costa trenta secondi contro la
-- ricreazione a cascata che e' gia' fallita due volte.
--
-- Rieseguibile: `create or replace`.
-- ===========================================================================

create or replace view public.v_monthly_totals with (security_invoker = on) as
select date_trunc('month', booking_date)::date            as mese,
       coalesce(sum(amount_eur), 0)                       as spesa,
       count(*)                                           as movimenti,
       -- Le misure di incompletezza. Non sono decorazione: un cruscotto che non
       -- dice quanto non sa e' un cruscotto di cui non ci si puo' fidare.
       count(*) filter (where amount_eur is null)         as senza_cambio,
       count(*) filter (where category_id is null)        as senza_categoria,
       coalesce(sum(amount_eur) filter (where category_id is null), 0)
                                                          as spesa_senza_categoria,
       -- In coda, e non accanto alle sorelle: `replace` ammette le colonne
       -- nuove solo in fondo. Metterle in mezzo, dove starebbero meglio da
       -- leggere, costerebbe il `drop` di tredici viste dipendenti.
       count(*) filter (where discretion is null)         as senza_classe,
       coalesce(sum(amount_eur) filter (where discretion is null), 0)
                                                          as spesa_senza_classe
from public.v_expenses
group by 1;

comment on view public.v_monthly_totals is
  'Spesa reale per mese civile, piu'' quanto resta fuori dal totale e perche''. `senza_classe` e'' la riga che nessun automatismo puo'' sistemare: senza esercente non c''e'' una categoria da cui ereditare, e la regola 8 vieta di chiedere a un modello chi sia una controparte privata.';

grant select on public.v_monthly_totals to authenticated;
