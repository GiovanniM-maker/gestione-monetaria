-- 0007_unifica_conti_duplicati.sql
--
-- Riparazione: la riautorizzazione Enable Banking dell'11 agosto 2026 ha
-- assegnato agli stessi conti degli `eb_account_uid` nuovi.
--
-- `registerSessionAccounts` cercava un conto esistente per uid, non lo trovava,
-- e ne creava uno nuovo: da tre conti se ne sono ritrovati sei, ognuno con la
-- sua meta' di storico. Nessun errore, nessun avviso.
--
-- Il danno non e' la riga in piu'. Il riconoscimento strutturale dei giroconti
-- marca come giroconto ogni `entry_reference` che compare su due conti diversi
-- — ed e' esattamente cio' che il periodo scaricato due volte produce.
-- Risultato: 1.487 giroconti su 2.538 movimenti, il 59%, contro il 24% reale.
-- Meta' delle spese vere sparita dalle analisi, in silenzio.
--
-- Niente e' andato perso: `raw_transactions` e' immutabile e contiene entrambe
-- le meta'. `transactions` e' derivato e si ricostruisce.
--
-- ---------------------------------------------------------------------------
-- Come si riconosce quale conto vecchio corrisponde a quale nuovo
-- ---------------------------------------------------------------------------
-- Non dall'IBAN: i pocket ce l'hanno nullo. Non dal nome: sono tutti
-- l'intestatario. Si riconosce dai **payload identici**.
--
-- I due scarichi si sovrappongono nel tempo, quindi lo stesso movimento e'
-- stato salvato due volte con lo stesso `payload_hash`. Due conti DIVERSI non
-- condividono mai un payload intero: i due lati di un giroconto hanno lo stesso
-- `entry_reference` ma `credit_debit_indicator` opposto e controparti diverse,
-- quindi hash diversi. Il payload condiviso e' identita', non parentela.
--
-- ---------------------------------------------------------------------------
-- Perche' e' tutto dentro un unico blocco
-- ---------------------------------------------------------------------------
-- La prima stesura teneva le coppie in una tabella temporanea. L'SQL Editor di
-- Supabase non la porta da un'istruzione all'altra, e la riparazione si e'
-- fermata su `relation "coppie_conti" does not exist` — per fortuna prima di
-- toccare qualcosa.
--
-- Un solo `do` risolve due problemi insieme: le coppie restano in memoria per
-- tutta la durata, e l'intera riparazione e' **una sola istruzione**, quindi
-- atomica senza dipendere da come l'editor gestisce `begin`/`commit`. O passa
-- tutta, o non passa niente.
--
-- Su un database senza duplicati non fa niente e lo dice.

do $$
declare
  manuali  integer;
  deboli   integer;
  vecchi   uuid[];
  nuovi    uuid[];
  i        integer;
  scartate integer;
  spostate integer;
  tot_scartate integer := 0;
  tot_spostate integer := 0;
begin
  -- -------------------------------------------------------------------------
  -- Guardia: le correzioni manuali sono sacre
  -- -------------------------------------------------------------------------
  -- Questa riparazione ricostruisce `transactions` da zero. Una riga con
  -- `manually_categorized` non si ricostruisce da nessuna parte, quindi se ce
  -- ne fosse anche una sola e' meglio fallire rumorosamente.
  select count(*) into manuali from public.transactions where manually_categorized;
  if manuali > 0 then
    raise exception
      'Ci sono % transazioni con correzione manuale. Questa riparazione le perderebbe: fermati.',
      manuali;
  end if;

  -- -------------------------------------------------------------------------
  -- Le coppie vecchio → nuovo, calcolate PRIMA di toccare qualsiasi cosa
  -- -------------------------------------------------------------------------
  -- Materializzate in due array e non lette in un ciclo: le istruzioni qui
  -- sotto modificano proprio le tabelle da cui l'abbinamento e' dedotto, e
  -- rileggerlo mentre cambia darebbe risultati diversi a ogni giro.
  select array_agg(id_vecchio order by id_vecchio),
         array_agg(id_nuovo   order by id_vecchio)
    into vecchi, nuovi
  from (
    select distinct on (s.id_vecchio) s.id_vecchio, s.id_nuovo
    from (
      select vecchio.id as id_vecchio,
             nuovo.id   as id_nuovo,
             count(*)   as payload_condivisi
      from public.raw_transactions rv
      join public.accounts vecchio on vecchio.id = rv.account_id
      join public.raw_transactions rn
        on rn.payload_hash = rv.payload_hash
       and rn.account_id <> rv.account_id
      join public.accounts nuovo on nuovo.id = rn.account_id
      -- La direzione la da' l'anagrafica, non i dati: il conto creato dopo e'
      -- quello che la sessione corrente conosce, ed e' quello da tenere.
      where vecchio.created_at < nuovo.created_at
      group by 1, 2
    ) s
    -- Soglia di evidenza, in due parti. Senza, **un solo** payload in comune
    -- basterebbe ad abbinare due conti e a fonderne uno dentro l'altro:
    -- verificato su una riproduzione locale, dove una singola riga condivisa
    -- produceva una coppia.
    --
    -- La parte che conta e' la **proporzione**: se il nuovo scarico copre il
    -- vecchio, quasi tutti i payload del vecchio ricompaiono nel nuovo, quindi
    -- meta' e' una richiesta blanda per un gemello e proibitiva per una
    -- coincidenza. Il minimo di tre serve solo a coprire i conti minuscoli,
    -- dove una riga sola sarebbe gia' il 100%: tre payload interi identici su
    -- due conti distinti non sono una coincidenza plausibile.
    --
    -- Un minimo assoluto piu' alto sarebbe sembrato piu' prudente ed era invece
    -- sbagliato: a 5 scartava un conto da 3 righe con il 100% di
    -- sovrapposizione, cioe' il caso piu' chiaro che esista.
    where s.payload_condivisi >= 3
      and s.payload_condivisi >= 0.5 * (select count(*) from public.raw_transactions r
                                         where r.account_id = s.id_vecchio)
    -- A parita' di conto vecchio vince l'abbinamento con piu' payload in comune.
    order by s.id_vecchio, s.payload_condivisi desc
  ) c;

  -- Nessuno scarto silenzioso: un conto che si sovrappone a un altro ma non
  -- abbastanza da provare di esserne il gemello va segnalato, non ignorato.
  -- Restando fuori dalla fusione continuerebbe a falsare i giroconti, e un
  -- resoconto che non lo nomina lascia credere che sia stato sistemato.
  select count(*) into deboli
  from (
    select vecchio.id
    from public.raw_transactions rv
    join public.accounts vecchio on vecchio.id = rv.account_id
    join public.raw_transactions rn
      on rn.payload_hash = rv.payload_hash
     and rn.account_id <> rv.account_id
    join public.accounts nuovo on nuovo.id = rn.account_id
    where vecchio.created_at < nuovo.created_at
      and not (vecchio.id = any(coalesce(vecchi, array[]::uuid[])))
    group by vecchio.id
  ) t;

  if deboli > 0 then
    raise notice
      '% conti si sovrappongono ad altri ma sotto la soglia di evidenza: NON sono stati fusi. Vanno guardati a mano.',
      deboli;
  end if;

  if vecchi is null then
    raise notice 'Nessun conto duplicato trovato: non c''e'' niente da riparare.';
    return;
  end if;

  -- Un conto nuovo rivendicato da due vecchi significa che l'abbinamento non ha
  -- funzionato, e proseguire fonderebbe insieme conti distinti.
  if array_length(vecchi, 1) <> (select count(distinct u) from unnest(nuovi) u) then
    raise exception
      'Accoppiamento ambiguo: % conti vecchi puntano a % conti nuovi distinti. Fermati.',
      array_length(vecchi, 1), (select count(distinct u) from unnest(nuovi) u);
  end if;

  -- -------------------------------------------------------------------------
  -- Fusione
  -- -------------------------------------------------------------------------
  for i in 1 .. array_length(vecchi, 1) loop

    -- Le righe del vecchio scarico gia' presenti nel nuovo. Vanno tolte prima
    -- dello spostamento, o violerebbero UNIQUE (account_id, payload_hash).
    delete from public.raw_transactions rv
    using public.raw_transactions rn
    where rv.account_id = vecchi[i]
      and rn.account_id = nuovi[i]
      and rn.payload_hash = rv.payload_hash;
    get diagnostics scartate = row_count;

    -- Quel che resta e' storico che solo il vecchio scarico ha visto: si
    -- sposta, non si butta.
    update public.raw_transactions
       set account_id = nuovi[i]
     where account_id = vecchi[i];
    get diagnostics spostate = row_count;

    -- `include_in_totals` e' una scelta dell'utente, non un dato della banca:
    -- segue il conto attraverso la fusione.
    update public.accounts n
       set include_in_totals = v.include_in_totals
      from public.accounts v
     where v.id = vecchi[i]
       and n.id = nuovi[i];

    -- Il conto vecchio ora e' vuoto. Cancellarlo porta via in cascata le sue
    -- `transactions`, che sono comunque da ricostruire.
    delete from public.accounts where id = vecchi[i];

    tot_scartate := tot_scartate + scartate;
    tot_spostate := tot_spostate + spostate;

    raise notice 'Conto % fuso in %: % doppioni scartati, % righe spostate.',
      vecchi[i], nuovi[i], scartate, spostate;
  end loop;

  -- -------------------------------------------------------------------------
  -- `transactions` si ricostruisce da capo
  -- -------------------------------------------------------------------------
  -- Non basta rinormalizzare sopra: `rileva_giroconti_speculari` sa solo mettere
  -- `is_transfer` a true, mai toglierlo, e le righe marcate per sbaglio
  -- resterebbero marcate. Il registro grezzo e' la fonte di verita' e non e'
  -- stato toccato, quindi ripartire da zero non costa niente.
  delete from public.transactions;

  raise notice
    'Fusi % conti: % doppioni scartati, % righe spostate. Ora rilancia la normalizzazione.',
    array_length(vecchi, 1), tot_scartate, tot_spostate;
end $$;
