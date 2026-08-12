-- 0009_tassonomia_iniziale.sql
--
-- Il contenuto della tassonomia: categorie, esercenti, alias.
--
-- Non e' un albero preso da un manuale di finanza personale. E' costruito sui
-- 60 esercenti che compaiono davvero in `v_expenses`, e ogni categoria esiste
-- perche' ci sono spese vere dentro. Una categoria vuota e' un invito a
-- classificare male pur di riempirla.
--
-- Due scelte le ha prese l'utente e non sono deducibili dai dati:
--   1. tutto cio' che e' strumento di lavoro, pubblicita' o fiscale sta in
--      `context = 'business'`;
--   2. i bonifici a Vanna Reverberi e Annamria Quatrini sono l'affitto.
--
-- `discretion` sta sul merchant: si risponde "Deliveroo e' voluttuario" una
-- volta, e vale per tutti e 59 i movimenti, passati e futuri.
--
-- `is_subscription` qui dice solo "questo servizio si paga ad abbonamento",
-- che e' un fatto sull'esercente. Cadenza, importo atteso e prossima scadenza
-- sono lavoro della Fase 5 e vanno rilevati dai movimenti, non dichiarati qui.
--
-- Rieseguibile: ogni inserimento e' protetto da `on conflict do nothing`, e
-- rilanciarla non duplica niente.

-- ---------------------------------------------------------------------------
-- Categorie di primo livello
-- ---------------------------------------------------------------------------

insert into public.categories (slug, name, default_discretion, sort_order) values
  ('casa',          'Casa',                   'essenziale',   10),
  ('alimentari',    'Alimentari',             'essenziale',   20),
  ('ristorazione',  'Ristorazione',           'voluttuario',  30),
  ('trasporti',     'Trasporti',              'utile',        40),
  ('viaggi',        'Viaggi',                 'voluttuario',  50),
  ('salute',        'Salute',                 'essenziale',   60),
  ('shopping',      'Shopping',               'voluttuario',  70),
  ('benessere',     'Sport e benessere',      'utile',        80),
  ('contanti',      'Contanti',               'utile',        90),
  ('abbonamenti',   'Abbonamenti personali',  'voluttuario', 100),
  ('investimenti',  'Investimenti',           'investimento',110),
  ('persone',       'Persone',                'utile',       120),
  ('lavoro',        'Lavoro',                 'utile',       130)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Sottocategorie
-- ---------------------------------------------------------------------------

insert into public.categories (slug, name, parent_id, default_discretion, sort_order)
select v.slug, v.name, p.id, v.discrezionalita, v.ordine
from (values
  ('casa-affitto',              'Affitto',                    'casa',         'essenziale',   1),
  ('casa-utenze',               'Utenze',                     'casa',         'essenziale',   2),
  ('casa-arredamento',          'Arredamento',                'casa',         'utile',        3),
  ('alimentari-supermercato',   'Supermercato',               'alimentari',   'essenziale',   1),
  ('alimentari-panetteria',     'Panetteria',                 'alimentari',   'essenziale',   2),
  ('ristorazione-delivery',     'Delivery',                   'ristorazione', 'voluttuario',  1),
  ('ristorazione-bar',          'Bar e caffetterie',          'ristorazione', 'voluttuario',  2),
  ('ristorazione-ristoranti',   'Ristoranti',                 'ristorazione', 'voluttuario',  3),
  ('trasporti-treni',           'Treni e trasporto pubblico', 'trasporti',    'utile',        1),
  ('trasporti-micromobilita',   'Micromobilita',              'trasporti',    'utile',        2),
  ('salute-cure',               'Cure mediche',               'salute',       'essenziale',   1),
  ('salute-farmacia',           'Farmacia',                   'salute',       'essenziale',   2),
  ('shopping-elettronica',      'Elettronica',                'shopping',     'voluttuario',  1),
  ('shopping-abbigliamento',    'Abbigliamento',              'shopping',     'voluttuario',  2),
  ('shopping-online',           'Marketplace online',         'shopping',     'voluttuario',  3),
  ('lavoro-fiscale',            'Fiscale e amministrativo',   'lavoro',       'essenziale',   1),
  ('lavoro-pubblicita',         'Pubblicita',                 'lavoro',       'investimento', 2),
  ('lavoro-software',           'Software e AI',              'lavoro',       'utile',        3),
  ('lavoro-infrastruttura',     'Infrastruttura cloud',       'lavoro',       'utile',        4)
) as v(slug, name, genitore, discrezionalita, ordine)
join public.categories p on p.slug = v.genitore
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Esercenti
-- ---------------------------------------------------------------------------

insert into public.merchants (canonical_name, category_id, discretion, context, is_subscription, notes)
select v.nome, c.id, v.discrezionalita, v.contesto, v.abbonamento, v.nota
from (values
  -- Casa
  ('Affitto',                'casa-affitto',            'essenziale',  'personale', false, 'Bonifici mensili di locazione'),
  ('Iren',                   'casa-utenze',             'essenziale',  'personale', false, null),
  ('IKEA',                   'casa-arredamento',        'utile',       'personale', false, null),
  -- Alimentari
  ('Coop',                   'alimentari-supermercato', 'essenziale',  'personale', false, null),
  ('Esselunga',              'alimentari-supermercato', 'essenziale',  'personale', false, null),
  ('Lidl',                   'alimentari-supermercato', 'essenziale',  'personale', false, null),
  ('Eurospar',               'alimentari-supermercato', 'essenziale',  'personale', false, null),
  ('Panificio Reggiano',     'alimentari-panetteria',   'essenziale',  'personale', false, null),
  -- Ristorazione
  ('Deliveroo',              'ristorazione-delivery',   'voluttuario', 'personale', false, null),
  ('Caffetteria dei Gonzaga','ristorazione-bar',        'voluttuario', 'personale', false, null),
  ('Catalana',               'ristorazione-bar',        'voluttuario', 'personale', false, null),
  -- Trasporti
  ('Trenitalia',             'trasporti-treni',         'utile',       'personale', false, null),
  ('Marconi Express',        'trasporti-treni',         'utile',       'personale', false, null),
  ('Dott',                   'trasporti-micromobilita', 'utile',       'personale', false, 'Monopattini in sharing'),
  -- Viaggi
  ('Booking.com',            'viaggi',                  'voluttuario', 'personale', false, null),
  ('eDreams',                'viaggi',                  'voluttuario', 'personale', false, null),
  ('Gotogate',               'viaggi',                  'voluttuario', 'personale', false, null),
  -- Salute
  ('Studio Odontoiatrico',   'salute-cure',             'essenziale',  'personale', false, null),
  ('Redcare',                'salute-farmacia',         'essenziale',  'personale', false, null),
  ('Parafarmacia Europea',   'salute-farmacia',         'essenziale',  'personale', false, null),
  -- Shopping
  ('Comet',                  'shopping-elettronica',    'voluttuario', 'personale', false, null),
  ('SP Technics Audio',      'shopping-elettronica',    'voluttuario', 'personale', false, null),
  ('Zalando',                'shopping-abbigliamento',  'voluttuario', 'personale', false, null),
  ('Amazon',                 'shopping-online',         'voluttuario', 'personale', false, null),
  ('Temu',                   'shopping-online',         'voluttuario', 'personale', false, null),
  -- Varie personali
  ('BDFitness',              'benessere',               'utile',       'personale', false, null),
  ('Prelievi in contanti',   'contanti',                'utile',       'personale', false, 'Dove finiscono non lo sa nessuno: da guardare se cresce'),
  ('Apple',                  'abbonamenti',             'voluttuario', 'personale', true,  null),
  ('Revolut Premium',        'abbonamenti',             'voluttuario', 'personale', true,  'Nell''estratto CSV ha importo 0,00 e 9,99 nella colonna Costo'),
  ('Bitcoin',                'investimenti',            'investimento','personale', false, null),
  -- Lavoro
  ('Fiscozen',               'lavoro-fiscale',          'essenziale',  'business',  true,  null),
  ('TikTok Ads',             'lavoro-pubblicita',       'investimento','business',  false, null),
  ('Meta Ads',               'lavoro-pubblicita',       'investimento','business',  false, null),
  ('Anthropic',              'lavoro-software',         'utile',       'business',  true,  null),
  ('OpenAI',                 'lavoro-software',         'utile',       'business',  true,  null),
  ('Cursor',                 'lavoro-software',         'utile',       'business',  true,  null),
  ('n8n',                    'lavoro-software',         'utile',       'business',  true,  'Incassato da Paddle: il nome dell''esercente non compare mai da solo'),
  ('Notion',                 'lavoro-software',         'utile',       'business',  true,  null),
  ('Veed',                   'lavoro-software',         'utile',       'business',  true,  null),
  ('Byteplus',               'lavoro-infrastruttura',   'utile',       'business',  true,  null),
  ('Vercel',                 'lavoro-infrastruttura',   'utile',       'business',  true,  null)
) as v(nome, categoria, discrezionalita, contesto, abbonamento, nota)
join public.categories c on c.slug = v.categoria
on conflict (canonical_norm) do nothing;

-- ---------------------------------------------------------------------------
-- Alias
-- ---------------------------------------------------------------------------
-- Sono la parte che fa il lavoro vero. La normalizzazione delle stringhe, da
-- sola, portava 60 forme a 58: i casi che contano non sono errori di
-- ortografia ma fatti sul mondo — che Claude sia Anthropic, che dietro
-- `Paddle.net* N8n Cloud1` ci sia n8n e Paddle sia solo il casello.
--
-- Il confronto avviene sulla forma normalizzata di ENTRAMBI i lati, quindi il
-- pattern si scrive in modo naturale: `apple.com/bill` e `Apple.com/bill` si
-- incontrano senza che chi lo scrive debba sapere come funziona dentro.

insert into public.merchant_aliases (merchant_id, pattern, match_type, priority)
select m.id, v.pattern, v.tipo, v.priorita
from (values
  ('Affitto',                'vanna reverberi',       'contains', 0),
  ('Affitto',                'annamria quatrini',     'contains', 0),
  ('Iren',                   'iren',                  'contains', 0),
  ('IKEA',                   'ikea',                  'contains', 0),
  ('Coop',                   'coop',                  'contains', 0),
  ('Esselunga',              'esselunga',             'contains', 0),
  ('Lidl',                   'lidl',                  'contains', 0),
  ('Eurospar',               'eurospar',              'contains', 0),
  ('Panificio Reggiano',     'panificio reggiano',    'contains', 0),
  ('Deliveroo',              'deliveroo',             'contains', 0),
  ('Caffetteria dei Gonzaga','caffetteria dei gonza', 'contains', 0),
  ('Catalana',               'catalana',              'contains', 0),
  ('Trenitalia',             'trenitalia',            'contains', 0),
  ('Marconi Express',        'marconi express',       'contains', 0),
  -- Copre sia `Dott Scooter Ride` sia `www.ridedott.com*Dott scooter
  -- ride*AMSTERDAM`. Il pattern e' due parole e non solo "dott": da solo
  -- "dott" e' anche l'abbreviazione di "dottore", e prenderebbe ogni medico.
  ('Dott',                   'dott scooter',          'contains', 0),
  -- Unisce `Hotel At Booking.com`, `Booking.com Hotel` e `Bkg*booking.com
  -- Flight`: parole uguali in ordine diverso, piu' il prodotto in coda.
  ('Booking.com',            'booking',               'contains', 0),
  ('eDreams',                'edreams',               'contains', 0),
  ('Gotogate',               'gotogate',              'contains', 0),
  ('Studio Odontoiatrico',   'studio odontoiatrico',  'contains', 0),
  ('Redcare',                'redcare',               'contains', 0),
  ('Parafarmacia Europea',   'parafarmacia',          'contains', 0),
  ('Comet',                  'comet spa',             'contains', 0),
  ('SP Technics Audio',      'sp technics',           'contains', 0),
  ('Zalando',                'zalando',               'contains', 0),
  ('Amazon',                 'amazon',                'contains', 0),
  ('Temu',                   'temu',                  'contains', 0),
  ('BDFitness',              'bdfitness',             'contains', 0),
  ('Prelievi in contanti',   'cash at',               'contains', 0),
  ('Prelievi in contanti',   'prelievo di contanti',  'contains', 0),
  ('Apple',                  'apple.com/bill',        'contains', 0),
  ('Revolut Premium',        'premium repricing',     'contains', 0),
  ('Bitcoin',                'exchanged to btc',      'contains', 0),
  ('Fiscozen',               'fiscozen',              'contains', 0),
  ('TikTok Ads',             'tiktok',                'contains', 0),
  ('Meta Ads',               'facebook',              'contains', 0),
  ('Meta Ads',               'meta platforms',        'contains', 0),
  -- Due alias per lo stesso esercente: il marchio e la societa'. Nessuna
  -- regola meccanica sa che sono la stessa cosa.
  ('Anthropic',              'anthropic',             'contains', 0),
  ('Anthropic',              'claude',                'contains', 0),
  ('OpenAI',                 'openai',                'contains', 0),
  ('OpenAI',                 'chatgpt',               'contains', 0),
  ('Cursor',                 'cursor',                'contains', 0),
  ('n8n',                    'n8n',                   'contains', 0),
  ('Notion',                 'notion',                'contains', 0),
  ('Veed',                   'veed',                  'contains', 0),
  ('Byteplus',               'byteplus',              'contains', 0),
  ('Vercel',                 'vercel',                'contains', 0)
) as v(esercente, pattern, tipo, priorita)
join public.merchants m on m.canonical_norm = lower(v.esercente)
on conflict (pattern, match_type) do nothing;
