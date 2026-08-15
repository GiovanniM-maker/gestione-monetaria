-- ===========================================================================
-- 0040 — Approvare in blocco quello che si e' gia' letto
-- ===========================================================================
--
-- La lista della sera nasce corta di proposito: i movimenti di una giornata
-- sono pochi, ed e' un gesto da trenta secondi. Ma bastano due giorni saltati
-- perche' diventi una lista di quindici righe identiche — quattro caffe', due
-- spese al supermercato — e una lista di arretrati non si smaltisce: si chiude.
-- E' esattamente la ragione per cui in Fase 6-bis lo storico e' nato
-- confermato invece di aprire la schermata su 1.323 righe.
--
-- ---------------------------------------------------------------------------
-- Perche' un'operazione sola e non N chiamate dal browser
-- ---------------------------------------------------------------------------
-- Quindici conferme sono quindici viaggi fino al database, e un viaggio da
-- questo continente costa circa un terzo di secondo: cinque secondi con la
-- schermata ferma, durante i quali l'unica cosa da fare e' aspettare. Qui e'
-- un `update` solo.
--
-- Vale anche la ragione di sempre: **ogni operazione dev'essere raggiungibile
-- dal copilot, non solo da un bottone**. `conferma_movimenti` e' una funzione
-- nominata con una firma esplicita, e come tale esiste anche per lui.
--
-- ---------------------------------------------------------------------------
-- Cosa NON fa, ed e' il punto
-- ---------------------------------------------------------------------------
-- Non tocca `manually_categorized`, esattamente come la sua sorella singola.
-- «Va bene» significa che l'utente ha approvato **una regola**, non inciso un
-- valore: se domani la classificazione di quell'esercente cambia, queste righe
-- la seguono. Approvare in blocco non e' una scorciatoia per incidere in
-- blocco — quella resta una riga per volta, dove si sa cosa si sta facendo.
--
-- Restituisce **quante ne ha confermate davvero**. Un elenco di identificativi
-- puo' contenere righe gia' confermate da un'altra scheda del browser, o
-- sparite: un conteggio che torna diverso da quello atteso e' un'informazione,
-- un `void` non direbbe niente.

create or replace function public.conferma_movimenti(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  quante integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  -- Il tetto non e' una difesa dal browser, che e' nostro: e' la stessa soglia
  -- della schermata, che ne mostra al massimo cento. Un elenco piu' lungo di
  -- quello che si e' potuto leggere sarebbe un'approvazione alla cieca.
  if cardinality(p_ids) > 100 then
    raise exception 'Troppi movimenti in una volta: %', cardinality(p_ids);
  end if;

  update public.transactions
     set confermato_at = now()
   where id = any(p_ids)
     and confermato_at is null;

  get diagnostics quante = row_count;
  return quante;
end;
$$;

comment on function public.conferma_movimenti(uuid[]) is
  'Conferma in blocco. NON marca manually_categorized: le righe continuano a seguire il loro esercente. Torna quante ne ha confermate davvero.';

revoke all on function public.conferma_movimenti(uuid[]) from public;
revoke all on function public.conferma_movimenti(uuid[]) from anon;
grant execute on function public.conferma_movimenti(uuid[]) to authenticated;

notify pgrst, 'reload schema';
