-- 0012_tassonomia_massiva.sql
--
-- Passata massiva sulle etichette rimaste scoperte.
--
-- Il criterio, applicato riga per riga: **si classifica quando il nome dice
-- che attivita' e'**. `Rossopomodoro` e' una pizzeria, `Itabus` un autobus,
-- `Render.com` un servizio cloud — sono fatti, non interpretazioni.
-- `Green Lemon Srl` e `Pappa Reale Srl` sono ragioni sociali che non dicono
-- niente, e restano scoperte apposta: un esercente classificato male sparisce
-- dentro un totale e non lo guarda piu' nessuno, mentre uno scoperto resta in
-- cima alla lista di lavoro finche' qualcuno non lo sistema.
--
-- Tre scoperte che valgono piu' di una classificazione:
--   * `Facebk *xxxx` sono Facebook Ads, gia' nostro esercente: quattro
--     etichette diverse per lo stesso addebito, perche' la sigla cambia a ogni
--     fattura.
--   * `Amzn Mktp It*xxxx` e' Amazon, che pero' con `amazon` non si abbina
--     perche' nel marketplace la banca scrive `Amzn`.
--   * `Fattura pagata n: 385026…` sono NOVE etichette distinte per lo stesso
--     tipo di addebito, con il numero di fattura al posto del fornitore. Un
--     solo alias `contains` le raccoglie tutte.

-- ---------------------------------------------------------------------------
-- Una categoria che mancava
-- ---------------------------------------------------------------------------
-- Biglietti di eventi, musei, librerie, paintball: non sono viaggi, non sono
-- shopping, e infilarli in una di quelle due avrebbe reso illeggibili entrambe.

insert into public.categories (slug, name, default_discretion, sort_order) values
  ('svago', 'Svago e cultura', 'voluttuario', 75)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Esercenti nuovi
-- ---------------------------------------------------------------------------

insert into public.merchants (canonical_name, category_id, discretion, context, is_subscription, notes)
select v.nome, c.id, v.discrezionalita, v.contesto, v.abbonamento, v.nota
from (values
  -- Casa
  ('Bollette',            'casa-utenze',            'essenziale',  'personale', false,
   'La banca scrive solo "Fattura pagata n: …": il fornitore non compare. Nove etichette, ~538 euro, cadenza mensile.'),
  ('Kasanova',            'casa-arredamento',       'utile',       'personale', false, null),
  -- Alimentari
  ('Sigma',               'alimentari-supermercato','essenziale',  'personale', false, null),
  -- Ristorazione
  ('McDonald''s',         'ristorazione-ristoranti','voluttuario', 'personale', false, null),
  ('Rossopomodoro',       'ristorazione-ristoranti','voluttuario', 'personale', false, null),
  ('Dispensa Emilia',     'ristorazione-ristoranti','voluttuario', 'personale', false, null),
  ('Sushi Re',            'ristorazione-ristoranti','voluttuario', 'personale', false, null),
  ('Nuri Sushi',          'ristorazione-ristoranti','voluttuario', 'personale', false, null),
  ('Asama',               'ristorazione-ristoranti','voluttuario', 'personale', false, null),
  ('MIC Ramen',           'ristorazione-ristoranti','voluttuario', 'personale', false, null),
  ('The Witchery',        'ristorazione-ristoranti','voluttuario', 'personale', false, 'Ristorante a Edimburgo'),
  ('Black Hart',          'ristorazione-ristoranti','voluttuario', 'personale', false, 'Pub a Edimburgo, incassato via Square'),
  ('Rhein & Meuse',       'ristorazione-ristoranti','voluttuario', 'personale', false, null),
  ('Chiosco Bar Fattori', 'ristorazione-bar',       'voluttuario', 'personale', false, null),
  ('Bar Fucsia',          'ristorazione-bar',       'voluttuario', 'personale', false, null),
  ('Bar Conad',           'ristorazione-bar',       'voluttuario', 'personale', false, null),
  -- Trasporti
  ('Itabus',              'trasporti-treni',        'utile',       'personale', false, null),
  ('Etna Trasporti',      'trasporti-treni',        'utile',       'personale', false, null),
  ('Biglietteria Bologna','trasporti-treni',        'utile',       'personale', false, null),
  ('Trasporto Emilia-Romagna','trasporti-treni',    'utile',       'personale', false, null),
  -- Viaggi
  ('Wizz Air',            'viaggi',                 'voluttuario', 'personale', false, null),
  -- Salute
  ('Studio Medico Alessi','salute-cure',            'essenziale',  'personale', false,
   'Attenzione: c''e'' anche l''etichetta "Alessi Laura" da 102 euro, che potrebbe essere lo stesso studio pagato con bonifico. Da confermare a mano.'),
  ('Farmalvarion',        'salute-farmacia',        'essenziale',  'personale', false, null),
  ('Blueprint',           'salute-cure',            'voluttuario', 'personale', false,
   'Integratori: e'' salute per categoria ma voluttuario per scelta, quindi la discrezionalita'' e'' scritta a mano e non ereditata.'),
  -- Shopping
  ('Bershka',             'shopping-abbigliamento', 'voluttuario', 'personale', false, null),
  ('Shein',               'shopping-abbigliamento', 'voluttuario', 'personale', false, null),
  ('MUJI',                'shopping',               'voluttuario', 'personale', false, null),
  ('Stroili Oro',         'shopping',               'voluttuario', 'personale', false, null),
  ('Toys Planet',         'shopping',               'voluttuario', 'personale', false, null),
  -- Svago
  ('Ubik',                'svago',                  'voluttuario', 'personale', false, 'Libreria'),
  ('TicketOne',           'svago',                  'voluttuario', 'personale', false, null),
  ('Paintball Siracusa',  'svago',                  'voluttuario', 'personale', false, null),
  ('Real Mary King''s Close','svago',               'voluttuario', 'personale', false, 'Attrazione a Edimburgo'),
  ('Palestra Athena',     'benessere',              'utile',       'personale', false, null),
  -- Lavoro
  ('Google Cloud',        'lavoro-infrastruttura',  'utile',       'business',  true,  null),
  ('Render',              'lavoro-infrastruttura',  'utile',       'business',  true,  null),
  ('Google Workspace',    'lavoro-software',        'utile',       'business',  true,  null),
  ('OpenRouter',          'lavoro-software',        'utile',       'business',  true,  null),
  ('Wati',                'lavoro-software',        'utile',       'business',  true,  null),
  ('Kling AI',            'lavoro-software',        'utile',       'business',  true,  null),
  ('Posteverywhere',      'lavoro-software',        'utile',       'business',  true,  null),
  ('Podpartner',          'lavoro-software',        'utile',       'business',  true,  null)
) as v(nome, categoria, discrezionalita, contesto, abbonamento, nota)
join public.categories c on c.slug = v.categoria
on conflict (canonical_norm) do nothing;

-- ---------------------------------------------------------------------------
-- Alias
-- ---------------------------------------------------------------------------

insert into public.merchant_aliases (merchant_id, pattern, match_type, priority)
select m.id, v.pattern, v.tipo, v.priorita
from (values
  -- Un solo pattern per nove etichette: il numero di fattura cambia sempre,
  -- il prefisso mai.
  ('Bollette',            'fattura pagata',      'contains', 0),
  ('Kasanova',            'kasanova',            'contains', 0),
  ('Sigma',               'sigma san polo',      'contains', 0),
  -- Due grafie della stessa catena: "Mcdonald's Modica" e "Mc Donald S".
  -- Normalizzate diventano "mcdonald s modica" e "mc donald s", e nessun
  -- pattern unico le prende entrambe.
  ('McDonald''s',         'mcdonald',            'contains', 0),
  ('McDonald''s',         'mc donald',           'contains', 0),
  ('Rossopomodoro',       'rossopomodoro',       'contains', 0),
  ('Dispensa Emilia',     'dispensa emilia',     'contains', 0),
  ('Sushi Re',            'sushi re',            'contains', 0),
  ('Nuri Sushi',          'nuri sushi',          'contains', 0),
  ('Asama',               'asama',               'contains', 0),
  ('MIC Ramen',           'ramen',               'contains', 0),
  ('The Witchery',        'witchery',            'contains', 0),
  ('Black Hart',          'black hart',          'contains', 0),
  ('Rhein & Meuse',       'rhein',               'contains', 0),
  ('Chiosco Bar Fattori', 'chiosco bar fattori', 'contains', 0),
  ('Bar Fucsia',          'bar fucsia',          'contains', 0),
  ('Bar Conad',           'bar conad',           'contains', 0),
  ('Itabus',              'itabus',              'contains', 0),
  ('Etna Trasporti',      'etna trasporti',      'contains', 0),
  ('Biglietteria Bologna','biglietteria bologna','contains', 0),
  ('Trasporto Emilia-Romagna','emilia romagna bt','contains', 0),
  ('Wizz Air',            'wizz',                'contains', 0),
  ('Studio Medico Alessi','studio medico alessi','contains', 0),
  ('Farmalvarion',        'farmalvarion',        'contains', 0),
  ('Blueprint',           'blueprint',           'contains', 0),
  ('Bershka',             'bershka',             'contains', 0),
  ('Shein',               'shein',               'contains', 0),
  ('MUJI',                'muji',                'contains', 0),
  ('Stroili Oro',         'stroili',             'contains', 0),
  ('Toys Planet',         'toys planet',         'contains', 0),
  ('Ubik',                'ubik',                'contains', 0),
  ('TicketOne',           'ticketone',           'contains', 0),
  ('Paintball Siracusa',  'paintball',           'contains', 0),
  ('Real Mary King''s Close','mary kings close', 'contains', 0),
  ('Palestra Athena',     'palestra athena',     'contains', 0),
  -- `google cloud` e `google workspace` sono piu' lunghi di `google one`, che
  -- esiste gia': nessuno dei tre puo' rubare le righe degli altri.
  ('Google Cloud',        'google cloud',        'contains', 0),
  ('Google Workspace',    'google workspace',    'contains', 0),
  ('Render',              'render.com',          'contains', 0),
  ('OpenRouter',          'openrouter',          'contains', 0),
  ('Wati',                'wati.io',             'contains', 0),
  ('Kling AI',            'klingai',             'contains', 0),
  ('Posteverywhere',      'posteverywhere',      'contains', 0),
  ('Podpartner',          'podpartner',          'contains', 0),
  -- I tre travestimenti: stesso esercente, nome che non lo lascia capire.
  ('Meta Ads',            'facebk',              'contains', 0),
  ('Amazon',              'amzn',                'contains', 0),
  ('Google One',          'google one',          'contains', 0)
) as v(esercente, pattern, tipo, priorita)
join public.merchants m on m.canonical_norm = lower(v.esercente)
on conflict (pattern, match_type) do nothing;

-- ---------------------------------------------------------------------------
-- Lasciati scoperti, con il motivo
-- ---------------------------------------------------------------------------
-- PERSONE FISICHE — solo tu sai cosa sono, e la regola 8 vieta di darle a un
-- modello: Matteo Mavilla, Giuseppe Enzo Pinto Sanchez, Antonella Mole,
-- Andrea Bulgarelli, Pitino Lorenzo, Alessi Laura, Vincenzo Mavilla,
-- Alessandra Ferrari, Annachiara Ferra, Linda Nanni, Bovi Laura, Severini
-- Laura, Sabrina Di Javadzade, Paypal *lucrezia.faraci.
--
-- RAGIONI SOCIALI CHE NON DICONO L'ATTIVITA' — Green Lemon Srl (14 movimenti),
-- Pappa Reale Srl (7), Panfe Bologna (8), Little Garden S.a.s., Angolo 16 Di
-- Fratanto.., Pirru Laboratorio Mister, Sugar Giardini, Bruno Spa-modica,
-- Allora C E Casa, Al Velico, Crudo, Ninja Turtles.
-- Molte hanno la forma della ristorazione — importi piccoli e ripetuti — ma
-- "ha la forma di" non basta per una categoria che entra nella metrica
-- principale.
--
-- SIGLE E CODICI — Pv3094, Vpstore, Droppos, Sp Shark Garage,
-- Centro Commerciale Il (troncato), Furgoni Amicoblumaggiore,
-- Japnese Restaurant P... (troncato: e' un ristorante, ma quale non si sa).
