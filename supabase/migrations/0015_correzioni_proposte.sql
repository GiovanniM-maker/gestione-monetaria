-- 0015_correzioni_proposte.sql
--
-- La categoria che mancava all'albero, e le quattro proposte del modello che
-- vanno corrette.
--
-- Perché una migration e non la schermata di revisione: la categoria `svago`
-- è schema, non contenuto, e senza di lei il modello continuerà a mettere i
-- cinema fra i negozi — non per errore suo, ma perché non ha altro posto dove
-- metterli. Le quattro correzioni viaggiano insieme perché tre di loro
-- dipendono da categorie che questa migration crea o sposta.
--
-- Tutte le righe corrette passano a `origine = 'manuale'` e risultano
-- confermate: da qui in poi sono decisioni prese da una persona, e la
-- schermata non deve più chiederle.

-- ---------------------------------------------------------------------------
-- La categoria mancante
-- ---------------------------------------------------------------------------
-- Cinema, bowling, biglietti di eventi e librerie erano finiti in `shopping` e
-- `benessere`. Non è un errore del modello: erano gli unici posti disponibili.
-- Un albero senza la casa giusta costringe a classificare male.

insert into public.categories (slug, name, default_discretion, sort_order) values
  ('svago', 'Svago e cultura', 'voluttuario', 75)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Le correzioni
-- ---------------------------------------------------------------------------

update public.merchants m
   set category_id   = c.id,
       discretion    = v.discrezionalita,
       context       = v.contesto,
       origine       = 'manuale',
       confermato_at = now(),
       motivazione   = v.nota
from (values
  -- Era `casa` / `essenziale`, con la motivazione «importo alto suggerisce
  -- spesa casa»: il modello ha ragionato dall'importo invece che dal nome, e
  -- ha marcato 199,92 euro come spesa non comprimibile. L'utente sa cos'è.
  ('Bruno', 'shopping-elettronica', 'voluttuario', 'personale',
   'Negozio di elettronica a Modica. Confermato dall''utente.'),

  -- Classificato due volte in due fette diverse e in due modi opposti: il
  -- gemello `Aspit Campogalliano` era già trasporti. La motivazione
  -- «associazione bar/ristorazione in Emilia» era inventata.
  ('Aspit', 'trasporti-treni', 'utile', 'personale',
   'Trasporto pubblico locale, come Aspit Campogalliano.'),

  -- Era finita in `contanti` con la motivazione «probabile prelievo o
  -- ricariche». Un acquisto non va nel secchio dei prelievi: falserebbe sia i
  -- contanti sia la spesa.
  ('Tabaccheria della Stazione', 'shopping', 'voluttuario', 'personale',
   'Tabaccheria. In `contanti` finiscono solo i prelievi veri.'),

  -- Bowling: intrattenimento, non attività fisica. Stava in `benessere` con
  -- discrezionalità `utile`, che è la classe che meno pesa sul numero
  -- principale — esattamente l'errore che lo fa sembrare più basso.
  ('Tenpin', 'svago', 'voluttuario', 'personale', 'Bowling.'),

  ('UCI Cinema',      'svago', 'voluttuario', 'personale', 'Cinema.'),
  ('Madison Cinemas', 'svago', 'voluttuario', 'personale', 'Cinema.'),
  ('Big Events',      'svago', 'voluttuario', 'personale', 'Biglietti di eventi.'),
  ('Mondadori Bookstore', 'svago', 'voluttuario', 'personale', 'Libreria.')
) as v(nome, categoria, discrezionalita, contesto, nota)
join public.categories c on c.slug = v.categoria
where m.canonical_norm = lower(v.nome);
