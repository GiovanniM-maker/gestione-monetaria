-- 0029_garanzia_della_carta.sql
--
-- La garanzia che viene dai dati, restituita a chi l'aveva persa.
--
-- ---------------------------------------------------------------------------
-- Il difetto, visto in uso
-- ---------------------------------------------------------------------------
-- Chiedendo al copilot le spese in ristoranti di agosto, cinque righe su sei
-- dicevano «un privato» — in una categoria dove dall'altra parte c'e' un
-- esercente per costruzione. Alla domanda «179 € dove?» non c'era risposta.
--
-- Non e' la regola 8 a essere troppo severa: e' che al copilot ne arriva meta'.
-- Il filtro della Fase 4 e' `soloCarta || sembraAttivita`, e il primo termine
-- e' scritto in CLAUDE.md come **l'unica garanzia che viene dai dati e non da
-- un'inferenza**: con la carta si paga in un negozio, non a un amico.
-- `sanificaMetriche` — nata in Fase 9 e riusata in Fase 10 — ha solo il
-- secondo, perche' gli aggregati non portano il metodo di pagamento. Cosi'
-- `Bella Napoli` (due parole, nessuna parola di mestiere, nessuna cifra,
-- nessuna forma societaria) viene trattenuta, mentre nel percorso di classificazione
-- uscirebbe senza discussioni.
--
-- Questa migration non allenta niente: aggiunge l'evidenza che mancava.
--
-- ---------------------------------------------------------------------------
-- E una falla nella stessa regola, che era li' dalla 0014
-- ---------------------------------------------------------------------------
-- `bool_and` **ignora i null**. `bool_and(bank_code = 'CARD_PAYMENT')` su un
-- gruppo fatto di un pagamento con carta e di un movimento con `bank_code`
-- nullo restituisce quindi `true`, e l'etichetta esce.
--
-- E' l'opposto di cio' che il commento della 0014 dichiara — «basta un bonifico
-- nel gruppo perche' cada: la garanzia deve valere per tutte le occorrenze, non
-- per la maggioranza» — e il movimento che sfugge e' esattamente quello che non
-- deve uscire. Il caso "tutti null" era coperto (`bool_and` restituisce null,
-- il `coalesce` lo porta a false); il caso misto no.
--
-- `is not distinct from` chiude il buco: su un `bank_code` nullo vale `false`
-- invece che `null`, e un solo movimento senza codice fa cadere la garanzia per
-- l'intero gruppo. Si corregge qui, nella stessa migration che usa la regola:
-- due copie della stessa regola di sicurezza divergono, ed e' dalla divergenza
-- che nascono le fughe.

create or replace view public.v_da_classificare with (security_invoker = on) as
select coalesce(counterparty_raw, raw_description) as etichetta,
       count(*)                                    as movimenti,
       sum(amount)                                 as totale,
       min(booking_date)                           as prima,
       max(booking_date)                           as ultima,
       -- `is not distinct from` e non `=`: un `bank_code` nullo deve valere
       -- `false` e far cadere la garanzia, non essere saltato da `bool_and`.
       coalesce(bool_and(bank_code is not distinct from 'CARD_PAYMENT'), false) as solo_carta
from public.v_expenses
where merchant_id is null
  and coalesce(counterparty_raw, raw_description) is not null
group by 1;

comment on view public.v_da_classificare is
  'Etichette di spesa reale ancora senza esercente. `solo_carta` dice se si possono inviare a un LLM (regola 8).';

-- ---------------------------------------------------------------------------
-- v_esercenti_da_carta
-- ---------------------------------------------------------------------------
-- La stessa garanzia, per esercente invece che per etichetta. E' quello che
-- serve a valle: negli aggregati un esercente compare col suo nome canonico, e
-- la domanda da fare e' «tutti i suoi movimenti sono pagamenti con carta?».
--
-- Guarda **tutte** le transazioni e non solo `v_expenses`: un esercente che ha
-- anche un giroconto o un movimento escluso dalle analisi non e' garantito
-- come esercente da carta, e restringere lo sguardo alle sole spese reali
-- nasconderebbe proprio i movimenti che possono smentire la garanzia.
--
-- Un esercente senza nemmeno un movimento risulta **non garantito**: `bool_and`
-- su nessuna riga e' nullo e il `coalesce` lo porta a false. La regola fallisce
-- chiusa, come deve.

create or replace view public.v_esercenti_da_carta with (security_invoker = on) as
select m.id                                         as merchant_id,
       m.canonical_name                             as esercente,
       coalesce(bool_and(t.bank_code is not distinct from 'CARD_PAYMENT'), false)
                                                    as solo_carta,
       count(t.id)                                  as movimenti
from public.merchants m
left join public.transactions t on t.merchant_id = m.id
group by m.id, m.canonical_name;

comment on view public.v_esercenti_da_carta is
  'Per ogni esercente, se OGNI suo movimento e'' un pagamento con carta. E'' la garanzia della regola 8 che viene dai dati e non da un''inferenza.';

grant select on public.v_esercenti_da_carta to authenticated;

notify pgrst, 'reload schema';
