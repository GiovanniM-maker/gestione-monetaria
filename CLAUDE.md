# CLAUDE.md — Contesto permanente del progetto

> Questo file è contesto permanente. Va letto **prima di qualsiasi altra cosa**, a ogni sessione.

---

## Stato avanzamento

| Fase | Titolo | Stato |
|---|---|---|
| 0 | Fondamenta e segreti | in corso |
| 1 | Autenticazione Enable Banking, isolata | non iniziata |
| 2 | Ingestion grezza + backfill riavviabile | non iniziata |
| 2-bis | Import CSV | non iniziata |
| 3 | Normalizzazione, idempotenza, multivaluta | non iniziata |
| 4 | Tassonomia e categorizzazione a cascata | non iniziata |
| 5 | Detector abbonamenti (SQL puro) | non iniziata |
| 6 | Dashboard | non iniziata |
| 7 | Automazione | non iniziata |
| 8 | Motore alert (SQL) | non iniziata |
| 9 | Report periodico AI | non iniziata |
| 10 | Chat copilot | non iniziata |

Aggiornare questa tabella è parte del commit di chiusura di ogni fase.

---

# PARTE 0 — Contesto permanente

## Cosa stiamo costruendo

Un'applicazione web personale, mono-utente, che aggrega automaticamente le transazioni dei miei conti
bancari, le classifica su più dimensioni indipendenti, rileva gli abbonamenti ricorrenti e produce
report e alert che mi facciano capire **dove sto sprecando soldi in modo ricorrente**.

Non è un budgeting tool generico. La metrica che l'app esiste per produrre è una sola:

> **Costo ricorrente mensile per classe di discrezionalità.**
> Esempio: "Voluttuario ricorrente: 187 €/mese".

Tutto il resto (grafici, categorie, chat) serve a rendere quel numero affidabile e azionabile.
Se una feature non contribuisce a quel numero o alla fiducia in quel numero, non è prioritaria.

## Stack — vincolato, non negoziabile

- **Frontend/backend**: Next.js (App Router) + TypeScript strict, deploy su Vercel (piano Pro)
- **DB**: Supabase (Postgres), migrations versionate su git
- **Auth**: Supabase Auth, magic link, allowlist di una sola email
- **Scheduling**: Vercel Cron
- **Dati bancari**: Enable Banking API (AISP licenziato, `https://api.enablebanking.com`)
- **AI**: Anthropic API, server-side
- **Repo**: GitHub

Non introdurre ORM pesanti, state manager, o librerie UI oltre a quelle strettamente necessarie.
Preferisci SQL esplicito e query tipizzate.

## Banche coperte

| Banca | Entità / paese connettore | Note |
|---|---|---|
| Revolut personale | Revolut Bank UAB → connettore sotto **LT**, non IT | Conto principale, la maggior parte delle spese variabili |
| Intesa Sanpaolo | IT | Domiciliazioni utenze = spese fisse. Attenzione: molte banche italiane ammettono **un solo consenso attivo per TPP**, attivarne uno nuovo invalida il precedente |

## Regole di sicurezza — NON NEGOZIABILI

1. La chiave privata Enable Banking (`.pem`) **non entra mai nel repository**. `.gitignore` la esclude
   dal primo commit. Va in variabile d'ambiente Vercel (base64) o Supabase Vault.
2. Nessun segreto in variabili `NEXT_PUBLIC_*`. Nessun segreto nel bundle client.
3. **Tutte** le chiamate a Enable Banking e all'Anthropic API girano server-side.
4. `SUPABASE_SERVICE_ROLE_KEY` non compare mai in codice client.
5. RLS abilitata su ogni tabella, con policy legata all'unico utente autorizzato.
6. Ogni route (pagine e API) è protetta da middleware di autenticazione. Nessuna eccezione
   "temporanea per test".
7. Gli IBAN si mostrano mascherati in UI (`****1234`) e non si loggano mai per intero.
8. **Sanitizzazione prima di qualsiasi chiamata a un LLM**: si inviano solo nome merchant
   normalizzato, importo, data, categoria, aggregati. Mai IBAN, mai descrizione raw completa, mai
   ultime cifre carta, mai controparti di bonifici privati.
9. In produzione non si loggano payload bancari integrali.

## Regole di correttezza

- Ogni importo è `numeric(14,2)` in Postgres. In TypeScript **mai aritmetica su float**: usa interi in
  centesimi o una libreria decimale. Un errore di arrotondamento in un'app di spese distrugge la
  fiducia nell'intero prodotto.
- Uscite = importi **negativi**. Nessuna eccezione, nessun `Math.abs()` sparso nel codice: si
  normalizza una volta in ingestion.
- L'LLM **non calcola mai un numero**. Tutte le cifre che appaiono in report e alert provengono da
  query SQL. L'LLM riceve aggregati già calcolati e scrive solo la narrazione.
- Le correzioni manuali dell'utente sono sacre: il flag `manually_categorized` blocca qualsiasi
  sovrascrittura automatica successiva.

## Regole di processo

- **Una fase per volta.** Non anticipare lavoro delle fasi successive, nemmeno se "tanto ci vuole
  poco". Se ti accorgi che serve qualcosa di una fase futura, segnalalo e fermati.
- Ogni fase si chiude con un commit dedicato e una **procedura di test manuale** eseguibile in meno di
  5 minuti.
- Migrations numerate progressivamente. Una migration già applicata non si modifica mai: se ne scrive
  una nuova.
- Se una decisione tecnica è ambigua, chiedi invece di scegliere in autonomia.

---

# PARTE 1 — Schema dati

Lo schema è definito qui e non va reinventato. Le migrations lo implementano fase per fase, ma la
forma finale è questa.

## Connessioni e conti

```
bank_connections
  id uuid pk
  aspsp_name text                 -- 'Revolut', 'Intesa Sanpaolo'
  aspsp_country char(2)           -- 'LT', 'IT'
  eb_session_id text
  status text                     -- active | expiring | expired | revoked | error
  authorized_at timestamptz
  valid_until timestamptz         -- guida l'alert di rinnovo
  last_sync_at timestamptz
  created_at, updated_at

accounts
  id uuid pk
  connection_id → bank_connections
  eb_account_uid text unique
  iban_masked text
  name text
  currency char(3)
  account_type text               -- current | savings | pocket | card
  is_active boolean
  include_in_totals boolean       -- pocket e savings NON sono spese
  created_at
```

## Ingestion

```
raw_transactions                  -- immutabile, mai modificata, mai cancellata
  id bigserial pk
  account_id → accounts
  source text                     -- enablebanking | csv | manual
  payload jsonb                   -- risposta integrale
  payload_hash text
  sync_run_id → sync_runs
  fetched_at timestamptz
  UNIQUE (account_id, payload_hash)

sync_runs
  id uuid pk
  connection_id → bank_connections
  trigger text                    -- cron | manual | backfill
  started_at, finished_at timestamptz
  status text                     -- running | success | partial | failed
  accounts_synced, rows_fetched, rows_new, rows_duplicate int
  cursor jsonb                    -- continuation key, per riprendere
  error_message text
```

## Transazioni normalizzate

```
transactions
  id uuid pk
  account_id → accounts
  raw_transaction_id → raw_transactions
  source text
  external_id text                -- entry_reference della banca
  dedupe_key text                 -- hash(account, booking_date, amount, description) se manca external_id
  booking_date date
  value_date date
  amount numeric(14,2)            -- NEGATIVO = uscita
  currency char(3)
  amount_eur numeric(14,2)
  fx_rate numeric, fx_date date
  raw_description text
  counterparty_raw text
  status text                     -- pending | booked
  merchant_id → merchants (null)
  category_id → categories (null)
  discretion text                 -- essenziale | investimento | utile | voluttuario
  context text                    -- personale | business
  is_transfer boolean             -- giroconto tra conti miei: escluso dalle analisi
  is_refund boolean
  manually_categorized boolean default false
  excluded_from_analysis boolean default false
  notes text
  created_at, updated_at
  UNIQUE (account_id, COALESCE(external_id, dedupe_key))
```

## Tassonomia

```
categories                        -- gerarchia ad albero, profondità libera
  id uuid pk
  parent_id → categories (null)
  name text, slug text unique
  icon text, color text
  default_discretion text
  is_archived boolean
  sort_order int

merchants
  id uuid pk
  canonical_name text
  category_id → categories
  discretion text                 -- impostato UNA VOLTA, si propaga a tutte le transazioni
  context text
  is_subscription boolean
  website text, cancel_url text, notes text
  created_at

merchant_aliases
  id uuid pk
  merchant_id → merchants
  pattern text
  match_type text                 -- exact | contains | regex
  priority int
  UNIQUE (pattern, match_type)

category_rules                    -- regole deterministiche, girano PRIMA dell'LLM
  id uuid pk
  pattern text, match_type text
  category_id → categories (null)
  merchant_id → merchants (null)
  priority int, is_active boolean

tags
  id uuid pk, name text, slug text unique, color text

transaction_tags
  transaction_id → transactions
  tag_id → tags
  PRIMARY KEY (transaction_id, tag_id)
```

## Analisi

```
subscriptions
  id uuid pk
  merchant_id → merchants
  cadence text                    -- weekly | monthly | quarterly | yearly | irregular
  cadence_days numeric
  expected_amount numeric(14,2), currency char(3)
  first_seen, last_seen, next_expected date
  occurrences int
  confidence numeric              -- 0..1
  status text                     -- active | lapsed | cancelled
  usage_verdict text              -- usato | non_usato | da_valutare | null
  verdict_updated_at timestamptz
  notes text

budgets
  id uuid pk
  category_id → categories
  period text                     -- monthly | yearly
  amount numeric(14,2)
  valid_from, valid_to date

alerts
  id uuid pk
  type text                       -- new_subscription | price_increase | unused_subscription |
                                  -- possible_duplicate | category_spike | missing_fixed_charge |
                                  -- budget_exceeded | session_expiring | sync_failed
  severity text                   -- info | warning | critical
  title text, body text
  payload jsonb
  related_transaction_id, related_subscription_id, related_category_id
  status text                     -- new | read | dismissed | actioned
  created_at, read_at

reports
  id uuid pk
  period_type text                -- weekly | monthly
  period_start, period_end date
  metrics jsonb                   -- gli aggregati esatti passati al modello, per audit
  content_md text
  model text, tokens_used int
  created_at
```

## Viste richieste

- `v_expenses` — solo uscite reali: `amount < 0 AND NOT is_transfer AND NOT is_refund AND NOT
  excluded_from_analysis` e conto con `include_in_totals`
- `v_monthly_by_category` — aggregato mensile con roll-up sull'albero categorie
- `v_recurring_monthly_cost_by_discretion` — **la metrica principale dell'app**
