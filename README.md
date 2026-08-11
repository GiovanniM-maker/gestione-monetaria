# Gestione monetaria

Applicazione web personale, mono-utente, per l'analisi delle spese.
Contesto, stack vincolato, schema dati e regole non negoziabili stanno in [`CLAUDE.md`](./CLAUDE.md).

Stato: **Fase 0 completata** — fondamenta, autenticazione e protezione delle route.
Nessun dato bancario e' ancora collegato.

---

## 1. Creare il progetto Supabase

1. Su [supabase.com](https://supabase.com) crea un progetto nuovo, region **eu-central-1 (Frankfurt)**.
2. Salva la password del database in un password manager: serve per il collegamento del CLI.
3. Apri il pannello **Connect** del progetto e annota:

   | Nel pannello Supabase                           | Variabile dell'app              |
   | ----------------------------------------------- | ------------------------------- |
   | `SUPABASE_URL`                                  | `NEXT_PUBLIC_SUPABASE_URL`      |
   | `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

   Nello stesso pannello c'e' anche `SUPABASE_SECRET_KEY` (`sb_secret_…`), erede
   della service role key: **bypassa la RLS**, non serve in Fase 0 e non va mai
   in una variabile `NEXT_PUBLIC_*`. Ignorala.

4. **Project Settings → General**, annota il `Reference ID` (una stringa tipo `abcdefghijklmnop`).
   Se hai piu' di un progetto Supabase, verifica che sia lo stesso a cui punta
   `SUPABASE_URL`: applicare la migration su un progetto e far puntare l'app a un
   altro produce un database senza tabelle e un login che non entra mai.

## 2. Applicare la migration

Dalla radice del repo:

```bash
pnpm install
pnpm supabase login          # apre il browser
pnpm supabase link --project-ref <REFERENCE_ID>
pnpm supabase db push
```

`db push` applica `supabase/migrations/0001_foundations.sql`, che:

- revoca i privilegi di default di `anon` e `authenticated` sullo schema `public`,
  cosi' una futura tabella senza RLS non nasce esposta;
- crea `allowed_emails` (gia' contenente il tuo indirizzo) e `app_users`;
- installa il trigger che popola `app_users` solo per le email in allowlist;
- crea `public.is_app_user()`, il predicato che ogni policy RLS futura dovra' usare.

Verifica rapida, dal **SQL Editor** di Supabase:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';
-- Entrambe le tabelle devono avere rowsecurity = true.
```

## 3. Configurare l'autenticazione su Supabase

**Authentication → Sign In / Providers → Email**

- `Enable Email provider`: **on**
- `Confirm email`: **on**
- `Allow new users to sign up` (signup pubblico): **off** ← strato 1 dell'allowlist

**Authentication → URL Configuration**

Sostituisci `<DOMINIO>` con il dominio di **produzione** del progetto Vercel
(Settings → Domains): quello senza il segmento `-git-<branch>-` e senza la
stringa casuale del singolo deployment, che cambia a ogni commit.

- `Site URL`: `https://<DOMINIO>`
- `Redirect URLs`: aggiungi
  - `https://<DOMINIO>/auth/callback`
  - `http://localhost:3000/auth/callback` (per lo sviluppo locale)

Lo stesso identico valore va in `NEXT_PUBLIC_SITE_URL` su Vercel. Se le tre
stringhe non combaciano, il magic link parte ma Supabase rifiuta il redirect.

**Authentication → Users → Add user → Create new user**

- email: il tuo indirizzo (lo stesso che metterai in `ALLOWED_EMAIL`)
- `Auto Confirm User`: **on**
- una password qualsiasi: non verra' mai usata, si entra solo con magic link

Appena l'utente viene creato, il trigger inserisce la riga in `app_users`. Controlla:

```sql
select user_id, email from public.app_users;
```

Se la tabella e' vuota, l'email non corrisponde a quella in `allowed_emails`.

## 4. Sviluppo locale

```bash
cp .env.example .env.local   # poi riempi i valori
pnpm dev                     # http://localhost:3000
```

Per `.env.local`:

- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
- `ALLOWED_EMAIL=` il tuo indirizzo
- `CRON_SECRET=` generalo con `openssl rand -hex 32`

## 5. Deploy su Vercel

1. Su Vercel, **Add New → Project**, importa il repository GitHub.
2. Framework preset: Next.js. Root directory: la radice. Non toccare i comandi di build.
3. **Settings → Environment Variables**, per l'ambiente **Production**:

   | Nome                            | Valore                                                  |
   | ------------------------------- | ------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Project URL di Supabase                                 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chiave anon / publishable                               |
   | `NEXT_PUBLIC_SITE_URL`          | `https://<DOMINIO>` — vedi sezione 3                    |
   | `ALLOWED_EMAIL`                 | il tuo indirizzo                                        |
   | `CRON_SECRET`                   | `openssl rand -hex 32`, valore diverso da quello locale |

   Il build **non** richiede queste variabili e non fallisce se mancano: la
   validazione avviene alla prima richiesta. Se le dimentichi, il deploy riesce
   ma ogni pagina risponde `500` con il nome della variabile mancante nei
   Runtime Logs di Vercel.

4. **Settings → Deployment Protection → Vercel Authentication**: attiva su
   **Preview Deployments only**. Le URL di preview cambiano a ogni commit e non
   sono nella Redirect URL di Supabase: il magic link deve funzionare solo in
   produzione.
5. Deploy.

> La chiave privata Enable Banking (`.pem`) **non va aggiunta ora** e non andra' mai
> nel repository: entrera' come variabile d'ambiente base64 in Fase 1.

---

## Comandi

| Comando          | Cosa fa               |
| ---------------- | --------------------- |
| `pnpm dev`       | server di sviluppo    |
| `pnpm build`     | build di produzione   |
| `pnpm lint`      | ESLint                |
| `pnpm typecheck` | `tsc --noEmit`        |
| `pnpm test`      | Vitest                |
| `pnpm format`    | Prettier in scrittura |

## Convenzioni introdotte in Fase 0

**Protezione delle route.** `src/proxy.ts` (in Next 16 sostituisce `middleware.ts`)
intercetta tutto. Le uniche route pubbliche sono elencate in `PUBLIC_PATHS`.
Le pagine autenticate stanno nel route group `src/app/(app)/`, il cui layout chiama
`requireUser()`: una pagina nuova la' dentro nasce protetta.

**Route macchina vs route admin.** Deliberatamente separate:

- `/api/cron/*` — nessuna sessione. Protette da `assertCronRequest()`, che verifica
  l'header `Authorization: Bearer ${CRON_SECRET}` inviato in automatico da Vercel Cron.
- `/api/admin/*` — dietro sessione autenticata, come le pagine. Toccano dati bancari
  e le lancio io da browser: nessun segreto condiviso.

In Fase 0 esiste solo l'helper, nessuna delle due famiglie di route e' ancora implementata.

**Allowlist a tre strati.** Nessuno dei tre e' ridondante:

1. signup pubblico disabilitato su Supabase + `shouldCreateUser: false` in `signInWithOtp`;
2. confronto con `ALLOWED_EMAIL` nel proxy, nella server action di login e nel callback;
3. RLS in Postgres agganciata a `public.app_users` tramite `public.is_app_user()`.

**Regole per ogni migration futura.** Ogni tabella nasce con
`enable row level security` + almeno una policy esplicita + i `grant` scritti a mano.
Una migration gia' applicata non si modifica: se ne scrive una nuova.

**Denaro, fusi e date** (decise in Fase 0, si applicano dalla Fase 2 in poi):

- importi come interi in centesimi (`bigint`) nel codice TypeScript, mai float,
  mai `parseFloat`; parsing dalla stringa decimale restituita da Postgres;
- conversione FX eseguita **una sola volta in ingestion**, arrotondamento
  half away from zero al centesimo, risultato salvato e mai piu' ricalcolato;
- aggregazioni in SQL, non in TypeScript;
- `booking_date` e `value_date` sono giorni civili, colonne `date`, mai `timestamptz`,
  mai soggette a conversione di fuso: una conversione UTC sposterebbe le transazioni
  di inizio e fine mese nel mese sbagliato;
- fuso applicativo `Europe/Rome`, locale `it-IT`, valuta `EUR` (costanti in `src/lib/env.ts`).
