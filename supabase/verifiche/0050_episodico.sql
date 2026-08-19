-- ---------------------------------------------------------------------------
-- Verifica della 0050 — `episodico` non gonfia e non allunga
-- ---------------------------------------------------------------------------
-- Si lancia su un database con la 0050 applicata:
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/verifiche/0050_episodico.sql
--
-- **Non lascia niente**: tutto sta in una transazione che finisce con `rollback`.
-- E' lanciabile in produzione senza conseguenze, ed e' cosi' che va lanciato —
-- una verifica che gira solo su dati finti non dice niente sullo schema vero.
--
-- Verifica il caso che la specifica chiede per nome: tre movimenti ricorrenti
-- normali piu' uno episodico molto alto. Il difetto da prendere non e' la somma
-- — quella si vede — ma **la finestra**: tenere l'occorrenza dentro
-- `min`/`max` delle date togliendola dalla somma abbasserebbe il costo mensile,
-- ed e' lo stesso errore gia' documentato per i movimenti senza tasso di cambio.

begin;

-- Un conto e un esercente finti, che il rollback portera' via.
insert into public.bank_connections (id, aspsp_name, aspsp_country, status)
values ('00000000-dead-beef-0000-000000000001', 'VERIFICA', 'IT', 'active');

insert into public.accounts (id, connection_id, eb_account_uid, name, currency, include_in_totals)
values ('00000000-dead-beef-0000-000000000002', '00000000-dead-beef-0000-000000000001',
        'verifica-0050', 'Conto di verifica', 'EUR', true);

insert into public.merchants (id, canonical_name, is_subscription)
values ('00000000-dead-beef-0000-000000000003', 'Esercente Di Verifica 0050', false);

-- Tre movimenti regolari da 100 €, uno al mese, piu' un episodico da 1.200 €
-- **dopo** l'ultimo: cosi' se non venisse escluso allungherebbe la finestra.
insert into public.transactions
  (account_id, merchant_id, source, status, booking_date, amount, amount_eur, currency,
   external_id, episodico)
values
 ('00000000-dead-beef-0000-000000000002','00000000-dead-beef-0000-000000000003',
  'manual','booked','2026-01-10',-100,-100,'EUR','verifica-0050-a', false),
 ('00000000-dead-beef-0000-000000000002','00000000-dead-beef-0000-000000000003',
  'manual','booked','2026-02-10',-100,-100,'EUR','verifica-0050-b', false),
 ('00000000-dead-beef-0000-000000000002','00000000-dead-beef-0000-000000000003',
  'manual','booked','2026-03-10',-100,-100,'EUR','verifica-0050-c', false),
 ('00000000-dead-beef-0000-000000000002','00000000-dead-beef-0000-000000000003',
  'manual','booked','2026-06-10',-1200,-1200,'EUR','verifica-0050-d', true);

do $$
declare
  s record;
  spesa_totale numeric;
begin
  select * into s
  from public.statistiche_ricorrenza()
  where merchant_id = '00000000-dead-beef-0000-000000000003';

  -- 1. La somma. 300, non 1.500.
  assert s.total_amount = -300,
    format('la somma comprende l''episodico: %s invece di -300', s.total_amount);

  -- 2. Le occorrenze. Tre, non quattro.
  assert s.occurrences = 3,
    format('l''episodico e'' contato fra le occorrenze: %s invece di 3', s.occurrences);

  -- 3. **La finestra.** L'ultimo movimento della serie e' il 10 marzo, non il
  --    10 giugno: se l'episodico fosse restato dentro min/max, `last_seen`
  --    sarebbe di giugno e il costo mensile risulterebbe piu' basso del vero
  --    pur avendo la somma giusta. E' il difetto che questo file esiste per
  --    prendere, ed e' quello che non si vedrebbe guardando una schermata.
  assert s.last_seen = date '2026-03-10',
    format('l''episodico ha allungato la finestra: last_seen = %s', s.last_seen);
  assert s.first_seen = date '2026-01-10',
    format('first_seen sbagliata: %s', s.first_seen);

  -- 4. I mesi attivi: tre, non quattro.
  assert s.active_months = 3,
    format('mesi attivi sbagliati: %s invece di 3', s.active_months);

  -- 5. Il prezzo tipico resta 100: la mediana e' scelta fra i prezzi pagati, e
  --    1.200 non deve nemmeno entrare nell'ordinamento.
  assert s.typical_amount = -100,
    format('il prezzo tipico ha visto l''episodico: %s', s.typical_amount);

  -- 6. **La spesa reale non si muove.** L'episodico resta in `v_expenses`: i
  --    soldi sono usciti davvero, e toglierli dal totale sarebbe la bugia
  --    opposta a quella che stiamo evitando.
  select sum(amount_eur) into spesa_totale
  from public.v_expenses
  where merchant_id = '00000000-dead-beef-0000-000000000003';

  assert spesa_totale = -1500,
    format('la spesa reale e'' cambiata: %s invece di -1500', spesa_totale);

  raise notice 'VERIFICA 0050: tutti e sei i controlli passati.';
end $$;

-- `effetto_episodico` deve prevedere il numero **prima** che si applichi, e la
-- previsione dev'essere quella vera: e' la cifra che l'utente legge nella
-- proposta, e una previsione approssimata sarebbe un numero inventato con un
-- passaggio in piu'.
do $$
declare
  id_riga uuid;
  e record;
  costo_vero numeric;
begin
  select id into id_riga from public.transactions where external_id = 'verifica-0050-d';

  -- La si rimette non episodica, per poter chiedere «e se lo diventasse?».
  update public.transactions set episodico = false where id = id_riga;

  select * into e from public.effetto_episodico(id_riga);
  assert e.gia_episodico = false, 'gia_episodico dovrebbe essere false';

  -- Ora la si segna davvero, e si confronta con la previsione.
  perform public.segna_episodico(id_riga, true);

  select public.costo_mensile_di(false, st.cadence, st.cadence_days, st.confidence,
                                 st.amount_stability, st.typical_amount, st.total_amount,
                                 st.covered_days, st.active_months)
    into costo_vero
  from public.statistiche_ricorrenza() st
  where st.merchant_id = '00000000-dead-beef-0000-000000000003';

  assert e.costo_dopo is not distinct from costo_vero::text,
    format('la previsione non corrisponde: prevista %s, vera %s', e.costo_dopo, costo_vero);

  raise notice 'VERIFICA 0050: la previsione di effetto_episodico e'' esatta.';
end $$;

-- Le due difese dei rimborsi, che devono fallire **chiuse**.
do $$
declare
  id_riga uuid;
  passata boolean := false;
begin
  select id into id_riga from public.transactions where external_id = 'verifica-0050-a';

  begin
    update public.transactions set rimborso_stato = 'forse' where id = id_riga;
    passata := true;
  exception when check_violation then null;
  end;
  assert not passata, 'uno stato di rimborso inventato e'' stato accettato';

  passata := false;
  begin
    update public.transactions set rimborso_importo = 10 where id = id_riga;
    passata := true;
  exception when check_violation then null;
  end;
  assert not passata, 'un importo di rimborso senza stato e'' stato accettato';

  raise notice 'VERIFICA 0050: i check sui rimborsi tengono.';
end $$;

rollback;
