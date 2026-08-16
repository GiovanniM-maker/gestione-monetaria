-- 0043_le_classi_diventano_una_tabella.sql
--
-- Le classi di discrezionalita' smettono di essere quattro parole scritte in un
-- `check` e diventano righe di una tabella: si creano, si rinominano, si
-- archiviano e si eliminano come le categorie.
--
-- ---------------------------------------------------------------------------
-- Perche' lo slug testuale e non un uuid
-- ---------------------------------------------------------------------------
-- `transactions.discretion` resta `text`, e il `check` diventa una foreign key
-- verso `discretion_classes(slug)`. Con un uuid andrebbe ricreata `v_expenses`,
-- e con lei — in ordine di dipendenza e senza `cascade` — le tredici viste che
-- ci stanno sopra. E' la manovra piu' pericolosa dello schema, quella che le
-- regole di processo descrivono per esteso e che e' gia' costata due migration
-- fallite sull'ambiente vero. Una chiave testuale la evita per intero: stessa
-- colonna, stesso tipo, stessi valori, e `v_expenses` non si tocca affatto.
--
-- In piu' il copilota continua a leggere `voluttuario` invece di un
-- identificativo. Un uuid dentro un prompt e' soltanto un'occasione per
-- inventarlo.
--
-- Il nome mostrato sta in `nome`, come `categories.name`; lo slug resta
-- l'identita' stabile, come `categories.slug`. Rinominare non riscrive nessuna
-- riga di `transactions`. L'`on update cascade` c'e' lo stesso, per il giorno
-- in cui si voglia cambiare anche lo slug: in quel caso il rinomina attraversa
-- da solo le tre tabelle, invece di lasciare righe che puntano a un nome che
-- non esiste piu'.
--
-- ---------------------------------------------------------------------------
-- `nel_ricorrente`: cosa entra nel totale, e cosa si vede sotto la linea
-- ---------------------------------------------------------------------------
-- La metrica per cui l'applicazione esiste e' una **ripartizione**, non un
-- numero: una riga per classe. Passare da quattro a sette classi non la rompe,
-- la allunga — e togliere righe la farebbe mentire per omissione, che e'
-- esattamente cio' che tutto il resto dell'app si rifiuta di fare
-- (`senza_cambio`, `fuori_dalla_spesa`, `v_ricorrenze_escluse` esistono tutte
-- perche' un euro fuori da un totale deve lasciare una traccia visibile).
--
-- Il problema non e' la ripartizione, e' il **totale**, e c'e' gia' con quattro
-- classi: −2.045,75 €/mese somma cose che si potrebbero smettere di pagare e
-- cose che non si smetteranno mai — l'affitto, 358,22 €/mese, sta dentro quella
-- cifra. Con quattro classi e' tollerabile perche' si sanno a memoria; con
-- sette — e la settima sara' «risparmio», «tasse» o «rate» — il totale smette
-- di rispondere a qualunque domanda.
--
-- Quindi il totale somma solo le classi con `nel_ricorrente`, e le altre
-- restano visibili sotto la linea con il loro subtotale. Il flag arriva **nei
-- dati** mandati al modello, non nel prompt: e' la lezione della Fase 9 — la
-- difesa non sono le istruzioni, e' che non abbia di che sbagliare.
--
-- Il default e' `true`, e le quattro classi di oggi nascono tutte `true`. I
-- numeri del 13 agosto non si spostano di un centesimo, che e' l'unica verifica
-- che dica se questa migration ha cambiato solo la forma o anche il merito. E
-- una classe a cui nessuno ha ancora pensato dev'essere **contata**, non
-- sparita: per un totale il verso giusto in cui fallire e' l'eccesso visibile,
-- mai il difetto silenzioso.
--
-- E' dichiarato, non calcolato, e il precedente e' identico:
-- `merchants.is_subscription`. Nessun numero distingue un contratto da una
-- consuetudine, e nessun numero distingue un costo che si vuole togliere da uno
-- che si vuole tenere. Sta nella testa di chi paga.
--
-- Cosa il flag NON fa: non tocca `v_expenses`, quindi non tocca la spesa del
-- mese. Luglio 2026 continua a dire −3.640,32 €, verificato al centesimo contro
-- l'app della banca. Togliere soldi dal totale del mese ha gia' tre meccanismi
-- (`is_transfer`, `excluded_from_analysis`, `include_in_totals`); un quarto che
-- dice la stessa cosa in un altro modo diverge dal primo aggiornamento.
--
-- ---------------------------------------------------------------------------
-- Il colore e' una chiave di tavolozza, non un hex
-- ---------------------------------------------------------------------------
-- Le tinte restano in `globals.css`, in un posto solo, con le due varianti
-- chiaro e scuro. Un hex scelto a mano non ha una variante per il tema scuro,
-- e due rosa indistinguibili renderebbero il colore un'informazione in meno —
-- che e' gia' scritto nelle decisioni della UX, dove l'accento e' stato tolto
-- alle classi proprio perche' faceva due mestieri.
--
-- Sette chiavi e non una di piu', per la stessa ragione della tavolozza della
-- ciambella: oltre la settima due tinte adiacenti si somigliano e la barra
-- smette di dire a colpo d'occhio quale classe sta guardando. `neutro` non e'
-- fra le scelte: e' riservato alla pseudo-classe «non classificato», e una
-- classe vera che ne rubasse il colore la renderebbe indistinguibile
-- dall'assenza di classe.

-- ---------------------------------------------------------------------------
-- 1. La tabella
-- ---------------------------------------------------------------------------

create table if not exists public.discretion_classes (
  slug           text primary key,
  nome           text not null,
  -- Cosa vuol dire questa classe, in una riga. Non e' decorazione: e' quello
  -- che il modello legge prima di proporre una classificazione, e la Fase 4 ha
  -- misurato che quando gli manca un'informazione se la inventa plausibile.
  descrizione    text,
  colore         text not null default 'blu',
  sort_order     int not null default 0,
  nel_ricorrente boolean not null default true,
  is_archived    boolean not null default false,
  created_at     timestamptz not null default now(),

  constraint discretion_classes_slug_forma
    check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint discretion_classes_nome_non_vuoto
    check (btrim(nome) <> ''),
  constraint discretion_classes_colore_ammesso
    check (colore in ('blu', 'ambra', 'rosa', 'verde', 'viola', 'ciano', 'bruno'))
);

comment on table public.discretion_classes is
  'Le classi di discrezionalita''. Modificabili come le categorie: lo slug e'' l''identita'' stabile, `nome` e'' cio'' che si mostra.';
comment on column public.discretion_classes.nel_ricorrente is
  'Se la classe entra nel TOTALE del costo ricorrente. Le altre restano nella ripartizione, sotto la linea, con il loro subtotale: mai nascoste.';
comment on column public.discretion_classes.colore is
  'Chiave di una tavolozza chiusa. Le tinte stanno in globals.css, in un posto solo, con le due varianti chiaro e scuro.';
comment on column public.discretion_classes.descrizione is
  'Cosa vuol dire questa classe. La legge il modello prima di proporre una classificazione.';

create unique index if not exists discretion_classes_nome_unico
  on public.discretion_classes (lower(btrim(nome)));

-- ---------------------------------------------------------------------------
-- 2. RLS e privilegi, scritti a mano
-- ---------------------------------------------------------------------------
-- I privilegi di default per `anon` e `authenticated` sono revocati dalla 0001:
-- senza questi `grant` la tabella non e' raggiungibile da nessun ruolo client.

alter table public.discretion_classes enable row level security;

drop policy if exists discretion_classes_utente_app on public.discretion_classes;
create policy discretion_classes_utente_app on public.discretion_classes
  for all to authenticated
  using (public.is_app_user())
  with check (public.is_app_user());

grant select, insert, update, delete on public.discretion_classes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le quattro di oggi, con l'ordine e i colori di oggi
-- ---------------------------------------------------------------------------
-- L'ordine e' quello che il TypeScript aveva scritto dentro
-- (`ORDINE_CLASSI = ['essenziale', 'utile', 'voluttuario', 'investimento']`) e
-- non l'alfabetico: e' cio' che rende la forma della barra segmentata
-- riconoscibile senza leggere la legenda.
--
-- `on conflict do nothing`: la migration si applica due volte e la seconda non
-- deve sovrascrivere un nome o un colore che nel frattempo sono stati cambiati.

insert into public.discretion_classes (slug, nome, descrizione, colore, sort_order, nel_ricorrente)
values
  ('essenziale',   'Essenziale',   'Quello che si paga per vivere: casa, utenze, alimentari, salute.',        'blu',   10, true),
  ('utile',        'Utile',        'Serve a qualcosa di concreto, ma si potrebbe fare diversamente.',         'ambra', 20, true),
  ('voluttuario',  'Voluttuario',  'Piacere, comodita'', sfizio. E'' la classe che la metrica esiste per far vedere.', 'rosa',  30, true),
  ('investimento', 'Investimento', 'Compra qualcosa che rende: strumenti di lavoro, formazione.',             'verde', 40, true)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Il `check` diventa una foreign key
-- ---------------------------------------------------------------------------
-- `on delete restrict`: non c'e' modo di lasciare una transazione che punta a
-- una classe che non esiste piu', nemmeno sbagliando. Chi vuole eliminare una
-- classe in uso passa da `elimina_classe`, che dichiara dove spostare le righe.
--
-- `on update cascade`: se un giorno si cambia lo slug, il cambio attraversa da
-- solo le tre tabelle.
--
-- Le colonne restano nullable: `null` non e' un errore, e' «non ancora
-- classificato», ed e' proprio il numero che `/revisione` esiste per far
-- scendere.

alter table public.transactions drop constraint if exists transactions_discretion_check;
alter table public.merchants    drop constraint if exists merchants_discretion_check;
alter table public.categories   drop constraint if exists categories_default_discretion_check;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_discretion_fkey') then
    alter table public.transactions
      add constraint transactions_discretion_fkey
      foreign key (discretion) references public.discretion_classes (slug)
      on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'merchants_discretion_fkey') then
    alter table public.merchants
      add constraint merchants_discretion_fkey
      foreign key (discretion) references public.discretion_classes (slug)
      on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'categories_default_discretion_fkey') then
    alter table public.categories
      add constraint categories_default_discretion_fkey
      foreign key (default_discretion) references public.discretion_classes (slug)
      on update cascade on delete restrict;
  end if;
end;
$$;

-- Senza indice, il controllo del `restrict` e lo spostamento di
-- `elimina_classe` scandiscono tutta la tabella dei movimenti. Le altre due
-- tabelle sono piccole e non ne hanno bisogno.
create index if not exists transactions_discretion_idx
  on public.transactions (discretion);
