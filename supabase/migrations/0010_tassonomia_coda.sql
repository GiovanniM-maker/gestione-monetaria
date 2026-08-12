-- 0010_tassonomia_coda.sql
--
-- La coda lunga: esercenti che compaiono spesso ma con importi piccoli, quindi
-- invisibili in una classifica per spesa e ben visibili in una per frequenza.
--
-- Perche' e' una migration a parte e non una correzione della 0009: la 0009 e'
-- gia' applicata, e una migration applicata non si modifica. Ma soprattutto
-- perche' queste voci vengono da una domanda diversa — «cosa torna spesso»
-- invece di «cosa costa molto» — ed e' utile che resti scritto quale delle due
-- ha prodotto cosa.
--
-- Qui ci sono solo gli esercenti su cui il nome basta a decidere. Chi resta
-- fuori resta fuori apposta: vedi la nota in fondo.

insert into public.merchants (canonical_name, category_id, discretion, context, is_subscription, notes)
select v.nome, c.id, v.discrezionalita, v.contesto, v.abbonamento, v.nota
from (values
  ('Spotify',            'abbonamenti',            'voluttuario', 'personale', true,  null),
  ('Netflix',            'abbonamenti',            'voluttuario', 'personale', true,  null),
  ('Google One',         'abbonamenti',            'voluttuario', 'personale', true,  null),
  ('Coinbase',           'investimenti',           'investimento','personale', false, null),
  ('ATM Milano',         'trasporti-treni',        'utile',       'personale', false, 'Trasporto pubblico milanese'),
  ('Biglietti a bordo',  'trasporti-treni',        'utile',       'personale', false, 'Comprati sul treno: la banca non dice quale vettore'),
  ('Farmacia',           'salute-farmacia',        'essenziale',  'personale', false, 'Raccoglie le farmacie senza un marchio riconoscibile'),
  ('Kmzero Cafe',        'ristorazione-bar',       'voluttuario', 'personale', false, null),
  ('L''Angolo della Piada','ristorazione-ristoranti','voluttuario','personale', false, null),
  ('Eataly',             'ristorazione-bar',       'voluttuario', 'personale', false, 'Undici passaggi da ~8 euro: e'' il banco, non la spesa settimanale')
) as v(nome, categoria, discrezionalita, contesto, abbonamento, nota)
join public.categories c on c.slug = v.categoria
on conflict (canonical_norm) do nothing;

insert into public.merchant_aliases (merchant_id, pattern, match_type, priority)
select m.id, v.pattern, v.tipo, v.priorita
from (values
  ('Spotify',              'spotify',        'contains', 0),
  ('Netflix',              'netflix',        'contains', 0),
  ('Google One',           'google one',     'contains', 0),
  ('Coinbase',             'coinbase',       'contains', 0),
  ('ATM Milano',           'atm milano',     'contains', 0),
  ('Biglietti a bordo',    'bordo treno',    'contains', 0),
  -- Sicuro nonostante sembri largo: `parafarmacia` e' piu' lungo di `farmacia`,
  -- e a parita' di priorita' vince il pattern piu' lungo. `Parafarmacia
  -- Europea` continua ad andare al suo esercente. E' esattamente il caso per
  -- cui quella regola di precedenza e' stata scritta.
  ('Farmacia',             'farmacia',       'contains', 0),
  ('Kmzero Cafe',          'kmzero',         'contains', 0),
  ('L''Angolo della Piada','angolo della piada', 'contains', 0),
  ('Eataly',               'eataly',         'contains', 0)
) as v(esercente, pattern, tipo, priorita)
join public.merchants m on m.canonical_norm = lower(v.esercente)
on conflict (pattern, match_type) do nothing;

-- ---------------------------------------------------------------------------
-- Chi e' rimasto fuori, e perche'
-- ---------------------------------------------------------------------------
-- `Green Lemon Srl` (14), `Pappa Reale Srl` (7), `Panfe Bologna` (8),
-- `Severini Laura` (9), `Bovi Laura` (6).
--
-- I primi tre sono ragioni sociali che non dicono che attivita' sia. Gli ultimi
-- due sono nomi di persona: possono essere un bar intestato al titolare oppure
-- un bonifico privato, e la differenza cambia la categoria, la discrezionalita'
-- e — regola 8 — se quel nome puo' uscire verso un LLM.
--
-- Indovinare qui costerebbe piu' che lasciarli scoperti: un esercente
-- classificato male sparisce dentro un totale e non lo guarda piu' nessuno,
-- mentre uno non classificato resta in cima alla lista di lavoro finche'
-- qualcuno non lo sistema. Vanno assegnati a mano dalla schermata di revisione.
