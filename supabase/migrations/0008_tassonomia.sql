-- 0008_tassonomia.sql
--
-- Fase 4: le tabelle della tassonomia. Solo schema, nessun contenuto: le
-- categorie e i merchant si popolano dopo, quando l'albero e' stato deciso
-- guardando le spese vere.
--
-- La forma e' quella gia' fissata in CLAUDE.md, PARTE 1. Non e' reinventata
-- qui: dove questa migration e' piu' stretta della specifica — i `check` sui
-- valori ammessi, gli indici — e' perche' il database rifiuti da solo cio' che
-- il codice non dovrebbe mai scrivere.

-- ---------------------------------------------------------------------------
-- categories — albero a profondita' libera
-- ---------------------------------------------------------------------------

create table public.categories (
  id                uuid primary key default gen_random_uuid(),
  parent_id         uuid references public.categories (id) on delete restrict,
  name              text not null,
  slug              text not null unique,
  icon              text,
  color             text,
  -- Ereditata dai merchant che non dichiarano la propria: e' il valore di
  -- partenza, non un vincolo.
  default_discretion text check (default_discretion in ('essenziale', 'investimento', 'utile', 'voluttuario')),
  is_archived       boolean not null default false,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),

  -- Una categoria che e' genitore di se stessa manderebbe in ricorsione
  -- infinita il roll-up mensile. Il ciclo lungo resta possibile e va evitato
  -- nel codice; questo copre il caso banale, che e' anche il piu' probabile.
  constraint categories_non_genitore_di_se check (parent_id is null or parent_id <> id)
);

comment on table public.categories is
  'Albero delle categorie. Il roll-up mensile risale i parent_id, quindi la profondita'' e'' libera ma i cicli sono vietati.';

create index categories_parent_idx on public.categories (parent_id);

-- ---------------------------------------------------------------------------
-- merchants — l'esercente canonico
-- ---------------------------------------------------------------------------
-- E' qui che si decide `discretion`, UNA volta, e da qui si propaga a tutte le
-- transazioni dell'esercente, passate e future. E' il meccanismo che rende
-- sostenibile la classificazione: si risponde "Deliveroo e' voluttuario" una
-- volta sola invece che su ognuna delle 59 righe.

create table public.merchants (
  id              uuid primary key default gen_random_uuid(),
  canonical_name  text not null,
  category_id     uuid references public.categories (id) on delete set null,
  discretion      text check (discretion in ('essenziale', 'investimento', 'utile', 'voluttuario')),
  context         text check (context in ('personale', 'business')),
  is_subscription boolean not null default false,
  website         text,
  cancel_url      text,
  notes           text,
  created_at      timestamptz not null default now(),

  -- Il confronto avviene su questa forma, come in `own_counterparties`: averla
  -- come colonna generata rende impossibile creare due merchant che sembrano
  -- diversi e sono lo stesso.
  canonical_norm  text generated always as (lower(regexp_replace(btrim(canonical_name), '\s+', ' ', 'g'))) stored,
  constraint merchants_canonical_norm_unique unique (canonical_norm)
);

comment on column public.merchants.discretion is
  'Impostata una volta sul merchant e propagata a tutte le sue transazioni. E'' la dimensione su cui la Fase 5 calcola il costo ricorrente mensile.';
comment on column public.merchants.cancel_url is
  'Dove si disdice. Un abbonamento che si sa di non usare ma non si sa come disdire resta una spesa.';

-- ---------------------------------------------------------------------------
-- merchant_aliases — le forme in cui l'esercente si presenta
-- ---------------------------------------------------------------------------

create table public.merchant_aliases (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pattern     text not null,
  match_type  text not null check (match_type in ('exact', 'contains', 'regex')),
  -- Piu' alta vince. Serve a mettere l'alias specifico davanti a quello largo:
  -- `contains 'amazon prime'` deve battere `contains 'amazon'`, o un
  -- abbonamento sparisce dentro gli acquisti.
  priority    int not null default 0,
  created_at  timestamptz not null default now(),
  constraint merchant_aliases_pattern_unique unique (pattern, match_type)
);

create index merchant_aliases_merchant_idx on public.merchant_aliases (merchant_id);
create index merchant_aliases_priorita_idx on public.merchant_aliases (priority desc);

-- ---------------------------------------------------------------------------
-- category_rules — le regole deterministiche, che girano PRIMA dell'LLM
-- ---------------------------------------------------------------------------
-- L'ordine non e' un dettaglio di implementazione: una regola scritta a mano e'
-- riproducibile e verificabile, una risposta di un modello no. L'LLM vede solo
-- cio' che le regole non hanno saputo risolvere.

create table public.category_rules (
  id          uuid primary key default gen_random_uuid(),
  pattern     text not null,
  match_type  text not null check (match_type in ('exact', 'contains', 'regex')),
  category_id uuid references public.categories (id) on delete cascade,
  merchant_id uuid references public.merchants (id) on delete cascade,
  priority    int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  -- Una regola che non assegna niente non e' una regola.
  constraint category_rules_assegna_qualcosa check (category_id is not null or merchant_id is not null)
);

create index category_rules_attive_idx on public.category_rules (priority desc) where is_active;

-- ---------------------------------------------------------------------------
-- tags — trasversali alle categorie
-- ---------------------------------------------------------------------------

create table public.tags (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  slug  text not null unique,
  color text
);

create table public.transaction_tags (
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  tag_id         uuid not null references public.tags (id) on delete cascade,
  primary key (transaction_id, tag_id)
);

create index transaction_tags_tag_idx on public.transaction_tags (tag_id);

-- ---------------------------------------------------------------------------
-- I collegamenti da transactions
-- ---------------------------------------------------------------------------
-- Le colonne esistono dalla 0005 ma erano uuid sciolti: senza vincolo, un
-- merchant cancellato lascerebbe dietro di se' transazioni che puntano a
-- niente, e gli aggregati per categoria perderebbero righe in silenzio.
--
-- `on delete set null` e non `cascade`: cancellare una categoria non deve
-- cancellare le spese.

alter table public.transactions
  add constraint transactions_merchant_fk
    foreign key (merchant_id) references public.merchants (id) on delete set null,
  add constraint transactions_category_fk
    foreign key (category_id) references public.categories (id) on delete set null;

create index transactions_merchant_idx on public.transactions (merchant_id);
create index transactions_category_idx on public.transactions (category_id);

-- ---------------------------------------------------------------------------
-- RLS — ogni tabella nuova nasce protetta (CLAUDE.md, regola 5)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'merchants', 'merchant_aliases',
                           'category_rules', 'tags', 'transaction_tags']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_app_user()) with check (public.is_app_user())',
      t || '_app_user', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
