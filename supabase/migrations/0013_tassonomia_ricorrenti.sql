-- 0013_tassonomia_ricorrenti.sql
--
-- Seconda passata, sulle sole etichette che tornano **almeno due volte**.
--
-- Il taglio non e' arbitrario: la metrica per cui l'app esiste e' il costo
-- *ricorrente* mensile, e un esercente visto una volta sola non ci entra
-- comunque. Le 295 etichette uniche restano scoperte per scelta, non per
-- dimenticanza.
--
-- ---------------------------------------------------------------------------
-- Una scelta diversa dalle passate precedenti: gli esercenti raggruppati
-- ---------------------------------------------------------------------------
-- Qui compaiono una decina di bar e tabaccherie da 5-30 euro l'uno. Creare un
-- esercente per ciascuno sarebbe stato piu' fedele e piu' inutile: quello che
-- serve alla metrica e' la categoria e la discrezionalita', non sapere che il
-- caffe' del 3 marzo era al Bar Rivelta e non allo Strabar.
--
-- Quindi tre esercenti "di tipo", con molti alias ciascuno. Si perde il
-- dettaglio del singolo locale, e va detto chiaramente perche' e' una perdita
-- vera: se un giorno uno di questi diventasse una spesa importante, andra'
-- scorporato. Finche' valgono venti euro l'anno, distinguerli e' lavoro che
-- nessuno guardera'.

-- ---------------------------------------------------------------------------
-- Una sottocategoria che mancava
-- ---------------------------------------------------------------------------

insert into public.categories (slug, name, parent_id, default_discretion, sort_order)
select 'shopping-tabaccheria', 'Tabaccheria', c.id, 'voluttuario', 4
from public.categories c where c.slug = 'shopping'
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Esercenti
-- ---------------------------------------------------------------------------

insert into public.merchants (canonical_name, category_id, discretion, context, is_subscription, notes)
select v.nome, c.id, v.discrezionalita, v.contesto, false, v.nota
from (values
  ('Bar e caffetterie (varie)', 'ristorazione-bar', 'voluttuario', 'personale',
   'Raggruppa i bar visti poche volte. Il singolo locale non serve alla metrica; se uno cresce, va scorporato.'),
  ('Street food e paninoteche', 'ristorazione-ristoranti', 'voluttuario', 'personale',
   'Stesso criterio: conta la categoria, non quale paninoteca.'),
  ('Tabaccherie',               'shopping-tabaccheria', 'voluttuario', 'personale',
   'In tabaccheria si comprano sigarette ma anche biglietti dell''autobus e bolli. La discrezionalita'' e'' una media, non una certezza.'),
  ('Glovo',                     'ristorazione-delivery',  'voluttuario', 'personale', null),
  ('Penny Market',              'alimentari-supermercato','essenziale',  'personale', null),
  ('Voi',                       'trasporti-micromobilita','utile',       'personale', 'Monopattini in sharing, come Dott'),
  ('TPER',                      'trasporti-treni',        'utile',       'personale', 'Trasporto pubblico bolognese'),
  ('SAIS Autolinee',            'trasporti-treni',        'utile',       'personale', null),
  ('AST Catania',               'trasporti-treni',        'utile',       'personale', null),
  ('Lothian Buses',             'trasporti-treni',        'utile',       'personale', 'Autobus e tram di Edimburgo'),
  ('Big Events',                'svago',                  'voluttuario', 'personale', null),
  ('Dedem',                     'svago',                  'voluttuario', 'personale', 'Cabine fototessere automatiche'),
  ('Relay',                     'shopping',               'voluttuario', 'personale', 'Edicola e libri di stazione')
) as v(nome, categoria, discrezionalita, contesto, nota)
join public.categories c on c.slug = v.categoria
on conflict (canonical_norm) do nothing;

-- ---------------------------------------------------------------------------
-- Alias
-- ---------------------------------------------------------------------------

insert into public.merchant_aliases (merchant_id, pattern, match_type, priority)
select m.id, v.pattern, v.tipo, v.priorita
from (values
  -- Bar, in ordine di come la banca li scrive.
  ('Bar e caffetterie (varie)', 'bar job',                  'contains', 0),
  ('Bar e caffetterie (varie)', 'strabar',                  'contains', 0),
  ('Bar e caffetterie (varie)', 'bar stazione mediopad',    'contains', 0),
  ('Bar e caffetterie (varie)', 'bar mediopadana',          'contains', 0),
  ('Bar e caffetterie (varie)', 'bar rivelta',              'contains', 0),
  ('Bar e caffetterie (varie)', 'pasticceria bar tre palme','contains', 0),
  ('Bar e caffetterie (varie)', 'buffet reggio emilia',     'contains', 0),
  ('Bar e caffetterie (varie)', 'buffet ferrara',           'contains', 0),
  ('Bar e caffetterie (varie)', 'bufala',                   'contains', 0),
  ('Bar e caffetterie (varie)', 'gelateria degli angeli',   'contains', 0),
  ('Bar e caffetterie (varie)', 'dream bistrot',            'contains', 0),
  -- Ristorazione a bordo dei Frecciarossa e distributori automatici: sono la
  -- stessa cosa di un bar, con un banco piu' piccolo.
  ('Bar e caffetterie (varie)', 'itinere',                  'contains', 0),
  ('Bar e caffetterie (varie)', 'acqu distrib',             'contains', 0),
  ('Street food e paninoteche', 'paninoteca',               'contains', 0),
  ('Street food e paninoteche', 'spuntino libanese',        'contains', 0),
  ('Street food e paninoteche', 'piadineria',               'contains', 0),
  -- Un solo pattern per cinque tabaccherie: la parola c'e' sempre, il resto
  -- del nome cambia ogni volta.
  ('Tabaccherie',              'tabacc',                    'contains', 0),
  ('Tabaccherie',              'cigar srl',                 'contains', 0),
  ('Glovo',                    'glovo',                     'contains', 0),
  ('Penny Market',             'penny market',              'contains', 0),
  ('Voi',                      'voi it',                    'contains', 0),
  ('TPER',                     'tper',                      'contains', 0),
  ('SAIS Autolinee',           'sais autolinee',            'contains', 0),
  ('AST Catania',              'apt catania',               'contains', 0),
  ('Lothian Buses',            'lothian',                   'contains', 0),
  ('Big Events',               'big events',                'contains', 0),
  ('Dedem',                    'dedem',                     'contains', 0),
  ('Relay',                    'relay',                     'contains', 0),
  -- Ricarica del portafoglio Dott: stesso esercente, ma `dott scooter` non lo
  -- prende perche' qui la banca scrive "Dott Wallet Top Up".
  ('Dott',                     'dott wallet',               'contains', 0)
) as v(esercente, pattern, tipo, priorita)
join public.merchants m on m.canonical_norm = lower(v.esercente)
on conflict (pattern, match_type) do nothing;

-- ---------------------------------------------------------------------------
-- Restano scoperte, e sono poche
-- ---------------------------------------------------------------------------
-- PERSONE — Vincenzo Mavilla (5), Severini Laura (9), Bovi Laura (6),
-- Cavallo Vincenzo (4), Linda Nanni (3), Sabrina Di Javadzade (3, anche come
-- "Sumup *sabrina Di Jav"), Annachiara Ferra (2), Antonella Mole (2),
-- Giuseppe Enzo Pinto Sanchez (5), Paypal *marti.alfieri04 (2).
-- Il prefisso `Sumup *` dice che chi incassa e' un'attivita' e non un privato,
-- ma non dice quale attivita': non basta per una categoria.
--
-- NOMI CHE NON DICONO L'ATTIVITA' — Green Lemon Srl (14), Panfe Bologna (8),
-- Pappa Reale Srl (7), Angolo 16 Di Fratanto.. (4), Sp Shark Garage (4),
-- Little Garden S.a.s. (3), Pirru Laboratorio Mister (3), Sugar Giardini (3),
-- Bruno Spa-modica (3), Dava (3), Il Molo S.a.s. (2), Tre Fontane (2),
-- Buki Buki (2), Ninja Turtles (2), Fal Features Labels (2),
-- Mne*…moneynet_s (2+2).
--
-- Diverse hanno la forma della ristorazione — importi piccoli e ripetuti — ma
-- "ha la forma di" non e' una categoria, e queste finiscono dentro la metrica
-- principale. Sono ventisei decisioni che valgono circa 900 euro, e le prende
-- l'utente dalla schermata di revisione.
