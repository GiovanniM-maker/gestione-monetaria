-- ===========================================================================
-- 0049 — Le categorie si disegnano: `categories.icon` si popola e arriva
--         alla vista
-- ===========================================================================
--
-- `categories.icon` esiste dalla 0008 e non l'ha mai usata nessuno. Non era
-- una svista da rimuovere: era il posto giusto che aspettava il suo momento
-- (docs/aspetto.md §3.3), e il momento e' la Fetta 2 — le tessere.
--
-- Il valore e' una CHIAVE (`aereo`, `carrello`, `croce`), non un pezzo di
-- SVG: il disegno sta nel codice, in `src/lib/ui/icone.tsx`, in un posto
-- solo. Cosi' cambiare un tratto non riscrive trentaquattro righe di
-- database, e una chiave che il codice non conosce degrada in una tessera
-- senza glifo — colorata e vuota — invece che in un errore.
--
-- Il colore NON sta qui, di proposito (§3.4): la tessera prende la tinta
-- della discrezionalita' predefinita della categoria. Trentaquattro colori
-- scelti a mano sarebbero trentaquattro colori che non significano niente.
--
-- ---------------------------------------------------------------------------
-- I figli ereditano la chiave del ramo quando non hanno di meglio
-- ---------------------------------------------------------------------------
-- «Panetteria» e «Supermercato» portano il carrello del genitore: nella
-- fisarmonica compaiono sotto di lui, e tre glifi diversi per lo stesso ramo
-- sarebbero rumore. Hanno una chiave propria solo dove il glifo dice
-- qualcosa in piu' (le utenze la lampadina, il bar la tazza).
--
-- `update ... set icon = ...` e' rieseguibile per natura: la seconda volta
-- riscrive gli stessi valori. Le categorie create dopo — dall'app o dal
-- copilota — nascono con `icon` nullo e si vedono senza glifo, che e' vero.

update public.categories set icon = 'carta'      where slug = 'abbonamenti';
update public.categories set icon = 'carrello'   where slug in ('alimentari', 'alimentari-panetteria', 'alimentari-supermercato');
update public.categories set icon = 'casa'       where slug in ('casa', 'casa-affitto', 'casa-arredamento');
update public.categories set icon = 'lampadina'  where slug = 'casa-utenze';
update public.categories set icon = 'banconota'  where slug = 'contanti';
update public.categories set icon = 'crescita'   where slug = 'investimenti';
update public.categories set icon = 'valigetta'  where slug = 'lavoro';
update public.categories set icon = 'documento'  where slug = 'lavoro-fiscale';
update public.categories set icon = 'nuvola'     where slug = 'lavoro-infrastruttura';
update public.categories set icon = 'megafono'   where slug = 'lavoro-pubblicita';
update public.categories set icon = 'chip'       where slug in ('lavoro-software', 'shopping-elettronica');
update public.categories set icon = 'persona'    where slug = 'persone';
update public.categories set icon = 'ristorante' where slug in ('ristorazione', 'ristorazione-delivery', 'ristorazione-ristoranti');
update public.categories set icon = 'tazza'      where slug = 'ristorazione-bar';
update public.categories set icon = 'croce'      where slug in ('salute', 'salute-cure', 'salute-farmacia');
update public.categories set icon = 'borsa'      where slug in ('shopping', 'shopping-abbigliamento', 'shopping-online', 'tabacchi');
update public.categories set icon = 'manubrio'   where slug = 'benessere';
update public.categories set icon = 'biglietto'  where slug = 'svago';
update public.categories set icon = 'treno'      where slug in ('trasporti', 'trasporti-micromobilita', 'trasporti-treni');
update public.categories set icon = 'aereo'      where slug = 'viaggi';

-- ---------------------------------------------------------------------------
-- La vista la porta fino alle schermate
-- ---------------------------------------------------------------------------
-- `icon` va IN CODA, cosi' `create or replace` basta: cambiare l'ordine delle
-- colonne di una vista esistente vorrebbe dire ricrearla, e con lei tutto cio'
-- che ci sta sopra. Il resto della definizione e' identico alla 0026.

create or replace view public.v_categorie_albero with (security_invoker = on) as
with recursive discesa as (
  select c.id, c.parent_id, c.name, c.slug, c.default_discretion, c.is_archived,
         c.sort_order, 0 as profondita, c.name::text as percorso, c.icon
  from public.categories c
  where c.parent_id is null
  union all
  select c.id, c.parent_id, c.name, c.slug, c.default_discretion, c.is_archived,
         c.sort_order, d.profondita + 1, d.percorso || ' > ' || c.name, c.icon
  from discesa d
  join public.categories c on c.parent_id = d.id
  where d.profondita < 10
)
select id, parent_id, name as nome, slug, default_discretion as discrezionalita_predefinita,
       is_archived as archiviata, profondita, percorso,
       -- In coda, per non ricreare la vista e le tredici che ci stanno sopra.
       icon
from discesa;

notify pgrst, 'reload schema';
