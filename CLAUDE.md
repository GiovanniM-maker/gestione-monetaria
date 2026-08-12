# CLAUDE.md — Contesto permanente del progetto

> Questo file è contesto permanente. Va letto **prima di qualsiasi altra cosa**, a ogni sessione.

---

## Stato avanzamento

| Fase  | Titolo                                    | Stato          |
| ----- | ----------------------------------------- | -------------- |
| 0     | Fondamenta e segreti                      | **completata** |
| 1     | Autenticazione Enable Banking, isolata    | **completata** |
| 2     | Ingestion grezza + backfill riavviabile   | **completata** |
| 2-bis | Import CSV                                | **archiviata** |
| 3     | Normalizzazione, idempotenza, multivaluta | **completata** |
| 4     | Tassonomia e categorizzazione a cascata   | non iniziata   |
| 5     | Detector abbonamenti (SQL puro)           | non iniziata   |
| 6     | Dashboard                                 | non iniziata   |
| 7     | Automazione                               | non iniziata   |
| 8     | Motore alert (SQL)                        | non iniziata   |
| 9     | Report periodico AI                       | non iniziata   |
| 10    | Chat copilot                              | non iniziata   |

Aggiornare questa tabella è parte del commit di chiusura di ogni fase.

**Perché la 2-bis è archiviata e non rimandata.** Esisteva per recuperare il primo anno di storico,
necessario a vedere gli abbonamenti annuali. Quel primo anno **non esiste**: il conto è stato aperto
il 23 settembre 2025, verificato sull'estratto CSV — fonte indipendente dall'API — dove il saldo
implicito prima del primo movimento è 0,00. L'API ha già il 100% dello storico. Gli abbonamenti
annuali diventano visibili da soli il 23 settembre 2026, e nessun import può anticipare quella data.
Da riaprire **solo** se si collega Intesa e serve il suo storico pregresso.

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
- **Auth**: Supabase Auth, **email + password**, allowlist di una sola email
- **Scheduling**: Vercel Cron
- **Dati bancari**: Enable Banking API (AISP licenziato, `https://api.enablebanking.com`)
- **AI**: Anthropic API, server-side
- **Repo**: GitHub

Non introdurre ORM pesanti, state manager, o librerie UI oltre a quelle strettamente necessarie.
Preferisci SQL esplicito e query tipizzate.

### Perché password e non magic link

Il piano iniziale prevedeva il magic link. È stato cambiato in Fase 0, dopo averlo visto fallire
sul campo: il servizio SMTP integrato di Supabase è limitato a poche email all'ora, e il magic link
è **l'unico modo di entrare** nell'applicazione. Un tetto così basso sul solo canale di accesso
significa restare chiusi fuori proprio mentre si sta lavorando — e in Fase 1 e 2 c'è una finestra
di circa un'ora dall'autorizzazione Enable Banking per scaricare tutto lo storico, che è il momento
peggiore possibile per non riuscire ad autenticarsi.

Con la password l'email sparisce completamente dall'applicazione: niente SMTP, niente rate limit,
niente `NEXT_PUBLIC_SITE_URL`, niente callback PKCE. **Il recupero password non va implementato**:
reintrodurrebbe la dipendenza dall'email dalla porta di servizio. Si reimposta dalla dashboard
Supabase, di cui l'unico utente è amministratore.

L'allowlist non è toccata da questa scelta: password e magic link rispondono a "come dimostri di
essere quell'utente", non a "quale utente è ammesso". I tre strati restano identici.

Decisione presa quando nel database non c'era ancora nessun dato bancario. **Da rivalutare quando
ci saranno movimenti reali**: a quel punto ha senso valutare l'MFA TOTP di Supabase, che sarebbe
più solido di entrambe le opzioni considerate qui.

## Banche coperte

| Banca             | Entità / paese connettore                          | Note                                                                                                                                                             |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revolut personale | Revolut Bank UAB → connettore sotto **LT**, non IT | Conto principale, la maggior parte delle spese variabili                                                                                                         |
| Intesa Sanpaolo   | IT                                                 | Domiciliazioni utenze = spese fisse. Attenzione: molte banche italiane ammettono **un solo consenso attivo per TPP**, attivarne uno nuovo invalida il precedente |

## Enable Banking — fatti verificati sul campo

Raccolti in Fase 1 provando l'API vera. Alcuni contraddicono la documentazione: vale quanto scritto
qui, che è ciò che l'API fa davvero.

- **Application ID** `b9595d06-a1e1-4937-afa6-46d92d079031`. È il `kid` dell'header JWT. La chiave
  privata sta **fuori dal repository**, in `~/enablebanking-keys/`, ed è stata generata dal browser
  al momento della registrazione: non esiste altra copia da nessuna parte.
- L'applicazione è in **modalità ristretta** (production, non "unrestricted"). L'API restituisce
  soltanto i conti esplicitamente collegati dal Control Panel: un conto autorizzato ma non collegato
  viene rimosso dalla risposta senza alcun errore. È il regime previsto per l'uso personale e non va
  cambiato.
- **`POST /sessions` e `GET /sessions/{id}` hanno forme diverse**, ed è la trappola che è costata di
  più: la prima restituisce `accounts` come array di oggetti conto completi, la seconda come array
  di UUID in chiaro, più un `accounts_data` con i soli identificativi. Nome, valuta e IBAN si
  leggono da `GET /accounts/{uid}/details`, che nella sessione non ci sono.
- Il connettore **Revolut (LT)** dichiara **consenso massimo 180 giorni**, non 90. All'autorizzazione
  definitiva conviene chiedere il massimo: dimezza i rinnovi manuali via SCA.
- **Data Insights dichiara 24 mesi di storico** per Revolut Bank UAB. Sono disponibili però solo
  nella finestra di circa un'ora dall'autorizzazione: dopo, la stessa sessione risponde con gli
  ultimi 90 giorni. Due conseguenze operative:
  1. il backfill di quell'ora deve reggere un volume grosso, quindi va scritto a blocchi con
     ripresa da cursore fin dal primo tentativo, non "ottimizzato dopo";
  2. la Fase 2-bis (import CSV) perde la sua giustificazione originale — servivano almeno 12 mesi
     per gli abbonamenti annuali, e l'API da sola ne dà 24. Resta utile come rete di sicurezza se
     la finestra viene mancata, e per Intesa.
- **I 24 mesi dichiarati non sono i 24 mesi concessi.** Riautorizzando l'11 agosto 2026 e chiedendo
  esplicitamente `date_from` a due anni prima, il movimento più vecchio restituito è del
  **23 settembre 2025**: circa **10 mesi e mezzo**, senza che la banca rifiutasse la richiesta.
  Quello che Data Insights dichiara è un massimo teorico del connettore, non un impegno dell'ASPSP.
  Conseguenza diretta: **sotto i 12 mesi, un abbonamento annuale non si vede ripetere nemmeno una
  volta**, quindi la Fase 5 non potrà rilevarlo dai soli dati API e la Fase 2-bis torna a essere
  l'unica strada per il primo anno di storico.
- **Non manca nessuno storico: il conto è stato aperto il 23 settembre 2025.** Verificato il
  12 agosto 2026 sull'estratto conto CSV, che è una fonte indipendente dall'API: ordinando i
  movimenti del conto corrente per data di completamento, il saldo implicito *prima* del primo
  movimento è **0,00**. API e CSV partono dallo stesso identico giorno perché prima di quel giorno
  non esiste niente. Quindi i "10 mesi e mezzo invece di 24" non sono una finestra tagliata dalla
  banca: sono tutta la vita del conto, e **la Fase 2-bis non ha niente da recuperare per Revolut**.
  Conseguenza sugli abbonamenti annuali: diventano visibili da soli il **23 settembre 2026**, quando
  il conto compie un anno. Non c'è modo di anticipare quella data, con nessun import.
- **Nel CSV la colonna `Costo` è un addebito separato, NON incluso in `Importo`.** Verificato:
  le 12 righe in cui la serie dei saldi non torna sono spiegate **tutte** ed esattamente dal `Costo`.
  Il caso che conta: il **canone Premium** ha `Importo` `0.00` e `Costo` `9.99` — un abbonamento
  ricorrente il cui importo sta interamente in una colonna che non è l'importo.
  **L'API non ha questo difetto**: verificato, espone lo stesso canone come dieci movimenti regolari
  da `−9,99` con causale `Premium Repricing 1 Copy plan fee`. Su questo punto i dati dell'API sono
  più corretti dell'estratto ufficiale della banca, ed è il motivo per cui un eventuale import CSV
  non potrebbe mai limitarsi a leggere la colonna `Importo`.
- I tipi TypeScript delle risposte descrivono ciò che l'API _dovrebbe_ restituire. Il codice che le
  legge non deve mai fidarsene: niente accessi diretti a `.length` o `.map` su valori che arrivano
  dalla rete, o un campo assente diventa un 500 al posto della pagina.

### Forma delle transazioni Revolut — osservata su payload reale

- **`transaction_amount.amount` è SEMPRE positivo**, anche per le uscite. Il segno sta in
  `credit_debit_indicator`: `DBIT` = uscita, `CRDT` = entrata. La normalizzazione a "uscite
  negative" si fa qui, una volta sola, in ingestion. Sbagliare questo punto falsa ogni numero
  dell'applicazione.
- **`status`** vale `PDNG` o `BOOK`. Le `PDNG` hanno **`value_date` a null**: la transizione
  pending → booked è reale e va riconciliata, non duplicata (Fase 3).
- **`entry_reference` è sempre presente** ed è l'unico identificativo utilizzabile: `transaction_id`,
  `reference_number` e `merchant_category_code` arrivano tutti a null. È la chiave di idempotenza.
- **Lo stesso `entry_reference` compare su entrambi i conti coinvolti in un giroconto interno.**
  Verificato in Fase 3: tutti e 34 i riferimenti duplicati nel registro grezzo stavano su conti
  diversi, nessuno sullo stesso conto. È la prova strutturale di un giroconto — più forte di
  qualsiasi confronto fra causali, e indipendente da come la banca scrive la descrizione. Vale solo
  se entrambi i lati sono conti collegati.
- **Pagina da 50 transazioni**, con `continuation_key` quando ce ne sono altre.
- Il `continuation_key` è base64 di un JSON che contiene l'URL chiamato all'ASPSP, con
  `fromBookingDateTime` in chiaro: **decodificarlo è il modo più diretto per verificare quale
  finestra temporale la banca sta effettivamente concedendo**. Verificato l'11 agosto 2026 su una
  sessione autorizzata il giorno prima: 90 giorni, cioè la finestra dello storico completo era già
  chiusa.
- **Esistono transazioni con importo `0.00`** (preautorizzazioni di carta rilasciate, tipiche di
  trasporti e distributori). Non sono spese: vanno riconosciute, non sommate.
- **`bank_transaction_code.code`** distingue `CARD_PAYMENT`, `TRANSFER`, `CARD_CREDIT`,
  `REV_PAYMENT`. I giroconti fra conti propri sono `TRANSFER` con `remittance_information` del tipo
  `"To EUR"` o `"From Conto deposito senza vincoli"`: è il segnale più affidabile per `is_transfer`,
  molto più del confronto fra movimenti speculari.
- Il nome dell'esercente sta in `creditor.name` e ricompare in `remittance_information[0]`.
- **`debtor_account_additional_identification` contiene le ultime 4 cifre della carta** (`scheme_name`
  `CPAN`). Rientra nella regola 8: non esce mai verso un LLM.
- I bonifici verso privati riportano nome e IBAN della controparte: sono dati di terzi, e la
  regola 8 li esclude esplicitamente da qualsiasi invio a un LLM.
- `exchange_rate` esiste come campo ma arriva a null sul conto EUR, dove Revolut riporta importi già
  convertiti. Sui conti in valuta va verificato prima di scrivere la conversione FX.

### L'`eb_account_uid` NON è stabile fra due autorizzazioni

Verificato l'11 agosto 2026, riautorizzando Revolut: gli stessi tre conti sono tornati con
`eb_account_uid` **tutti nuovi**. Cercandoli solo per uid non se ne trova nessuno, se ne creano tre
paralleli, e lo storico si spacca in due metà — da 3 conti a 6, senza un errore.

Il danno non è la riga in più. Il riconoscimento strutturale dei giroconti marca come giroconto ogni
`entry_reference` presente su due conti diversi: con il conto sdoppiato, **tutto il periodo scaricato
due volte diventa giroconto**. I giroconti sono passati dal 24% al 59% dei movimenti, cioè metà delle
spese reali è sparita dalle analisi in silenzio. È la peggiore categoria di guasto possibile qui.

Due difese, in `abbinaConti`:

1. **si abbina anche per IBAN**, e il conto ritrovato si aggiorna uid compreso;
2. **se restano conti noti spaiati mentre arrivano uid mai visti, ci si ferma** — è la firma esatta
   della rotazione sui conti senza IBAN, e i pocket Revolut hanno `iban_masked` nullo.

La riparazione dei duplicati già creati sta in `0007_unifica_conti_duplicati.sql`. Abbina i conti dal
`payload_hash` condiviso: due conti diversi non condividono mai un payload intero, perché i due lati
di un giroconto hanno `credit_debit_indicator` opposto e controparti diverse.

### Cosa serve per raggruppare la spesa — osservato sui dati caricati

Verificato in chiusura di Fase 2, ordinando le uscite per importo. Determina Fase 3 e Fase 4.

- **La banca non fornisce nessuna categoria**: `merchant_category_code` è `null` su ogni singola
  transazione. Il raggruppamento si costruisce interamente da `creditor.name`, con
  `remittance_information[0]` come seconda fonte quando il primo manca.
- **Senza `is_transfer` la classifica delle uscite è inutilizzabile.** Le prime sei voci per importo
  sono tutte giroconti fra conti propri: la prima spesa reale compare al settimo posto, con un
  ventesimo dell'importo della prima riga. Distinguere i giroconti non è un raffinamento
  dell'analisi, è il presupposto perché l'analisi dica qualcosa di vero.
- **Il codice `TRANSFER` da solo NON identifica i giroconti.** Comprende anche i bonifici verso
  persone fisiche, che sono uscite reali a tutti gli effetti. Il segnale corretto è `TRANSFER`
  **più** una `remittance_information` del tipo `"To EUR"`, `"To Conto deposito…"`, `"From …"`.
  Filtrare sul solo codice cancellerebbe spese vere.
- **La `remittance_information` può portare un suffisso tecnico**: `"To EUR MB:b260c88e-a671-…"`.
  Senza normalizzazione la stessa identica operazione genera un merchant distinto per ogni
  identificativo, e il raggruppamento si polverizza.
- **I nomi degli esercenti portano il numero del punto vendita**: `Starbucks 17831`,
  `Starbucks 12172`, `Mcdonalds 1210`, `Poundland Ltd - 2205`, `Scotmid Coop 0403`. Sono puliti e
  leggibili, ma senza normalizzazione lo stesso marchio si spezza in decine di merchant diversi e
  nessun abbonamento o ricorrenza verrebbe mai rilevato.

#### Casi reali da usare come test della normalizzazione

Presi dai dati caricati. Servono come banco di prova della Fase 4: se la pipeline non li risolve,
non funziona.

| Varianti osservate                              | Perché è difficile                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Hotel At Booking.com` / `Booking.com Hotel`    | stesse parole, ordine invertito: nessun match esatto le unisce, e sono 1.080 € che non si sommano mai |
| `Anthropic* Claude Sub` / `Anthropic`           | suffisso del prodotto sul nome del marchio                                                            |
| `Starbucks 17831` / `Starbucks 12172`           | numero del punto vendita                                                                              |
| `To EUR MB:b260c88e-…` / `To EUR MB:ef475d8d-…` | identificativo tecnico in coda                                                                        |

#### I giroconti verso conti non collegati — risolti a mano, in `own_counterparties`

Verificato in Fase 3: i movimenti `"To/From Conto deposito senza vincoli"` hanno un
`entry_reference` presente su **un conto solo**. Quel deposito non è fra i conti collegati, quindi
l'altro lato dello spostamento non esiste nei nostri dati e nessun riconoscimento automatico —
né quello strutturale né quello per movimenti speculari — potrà mai vederlo.

La tabella `own_counterparties` è la risposta: l'utente dichiara una volta quali controparti sono
conti propri, e la dichiarazione vale per tutte le occorrenze passate e future. Valeva 5.830 € sul
solo mese di luglio.

**La controparte da confrontare è una sola e dipende dalla direzione**: il creditore su un'uscita,
il debitore su un'entrata. Guardarle entrambe è un errore silenzioso e grave, perché su ogni uscita
il debitore è l'intestatario del conto: dichiarare il proprio nome marcherebbe come giroconto anche
un bonifico a un terzo, cancellando spese reali.

#### Il caso che il rilevamento automatico non può risolvere

I bonifici verso un **proprio conto presso un'altra banca** appaiono come uscite normali: hanno il
nome dell'intestatario come controparte e nessun segnale che li distingua da un bonifico a un terzo.
Nei dati caricati sono la prima voce di spesa per importo.

Non esiste modo di riconoscerli automaticamente finché l'altro conto non è collegato. L'input umano
qui non è una scorciatoia, è l'unica fonte dell'informazione — ed è per questo che sta in
`own_counterparties`, dichiarato una volta e valido per tutte le occorrenze passate e future, e non
in una correzione riga per riga.

### Numeri di chiusura della Fase 3 — luglio 2026, conto `****3513`

Servono da riferimento per ogni verifica futura: se una modifica li sposta, o c'è una ragione
esplicita, o è una regressione.

I totali di storico sono quelli **dopo** la riautorizzazione dell'11 agosto e la riparazione dei
conti duplicati. Fra parentesi i valori precedenti, su tre soli mesi di storico.

| Grandezza                            | Valore          |
| ------------------------------------ | --------------- |
| Storico coperto                      | 23/09/2025 → 11/08/2026 |
| Movimenti normalizzati (storico)     | 1.957 (prima 581) |
| Giroconti riconosciuti (storico)     | 466 = 23,8% (prima 141 = 24,3%) |
| Uscite lorde di luglio               | −12.670,32 €    |
| Uscite di luglio al netto dei pocket | −10.670,32 €    |
| **Spesa reale di luglio**            | **−3.640,32 €** |

**Luglio non si è spostato di un centesimo** quadruplicando lo storico, ed è la verifica che conta:
il backfill ha aggiunto solo passato più vecchio, quindi qualsiasi movimento su luglio sarebbe stato
una regressione. La quota di giroconti è rimasta al 23,8% contro il 24,3% misurato sul campione
piccolo — stabile, mentre con i conti sdoppiati era salita al 59%.

Il vecchio scarico si è rivelato un sottoinsieme esatto del nuovo: tutte e 581 le righe grezze erano
già presenti fra le 1.957, nessuna da spostare. È la conferma indipendente che l'abbinamento dei
conti duplicati era quello giusto.

Le uscite lorde coincidono **al centesimo** con l'app della banca: è la prova che segno, parsing e
aritmetica in centesimi sono corretti. Ogni euro della differenza fino alla spesa reale è
riconducibile a un giroconto specifico — 2.000 € di pocket in valuta, 5.830 € verso il conto
deposito, 1.200 € verso un proprio conto presso un altro istituto — non a un residuo non spiegato.

I tre meccanismi che producono quei 141 giroconti sono indipendenti e non sostituibili l'uno
all'altro:

1. **riferimento condiviso fra due conti collegati** — prova strutturale, non interpreta niente;
2. **causale `To`/`From` + sigla di valuta o nome di un conto proprio** — vede i pocket, di cui
   registriamo un lato solo;
3. **controparte dichiarata in `own_counterparties`** — vede i conti non collegati, che nessuna
   delle prime due può raggiungere.

L'idempotenza è verificata nel modo che conta: due normalizzazioni consecutive sull'intero storico
lasciano 581 righe e nessun inserimento.

## Regole di sicurezza — NON NEGOZIABILI

1. La chiave privata Enable Banking (`.pem`) **non entra mai nel repository**. `.gitignore` la esclude
   dal primo commit. Va in variabile d'ambiente Vercel (base64) o Supabase Vault.
2. Nessun segreto in variabili `NEXT_PUBLIC_*`. Nessun segreto nel bundle client.
3. **Tutte** le chiamate a Enable Banking e all'Anthropic API girano server-side.
4. `SUPABASE_SERVICE_ROLE_KEY` non compare mai in codice client.
5. RLS abilitata su ogni tabella, con policy legata all'unico utente autorizzato. L'allowlist è a
   tre strati, e nessuno dei tre è ridondante: (1) signup pubblico disabilitato su Supabase più
   `shouldCreateUser: false` nella chiamata a `signInWithOtp`; (2) confronto con `ALLOWED_EMAIL`
   lato server; (3) RLS agganciata a `public.app_users` tramite il predicato `public.is_app_user()`.
   Ogni tabella nuova nasce con `enable row level security`, almeno una policy esplicita e i `grant`
   scritti a mano: i privilegi di default per `anon` e `authenticated` sono stati revocati.
6. Ogni route (pagine e API) è protetta dal proxy di autenticazione (`src/proxy.ts`, che in Next 16
   sostituisce la convenzione `middleware.ts`). Nessuna eccezione "temporanea per test": una route
   pubblica va aggiunta esplicitamente a `PUBLIC_PATHS`.
   Unica famiglia esclusa dal controllo di sessione: `/api/cron/*`, che non ha un browser dietro.
   È protetta da `assertCronRequest()`, che verifica l'header `Authorization: Bearer ${CRON_SECRET}`
   inviato in automatico da Vercel Cron quando la variabile è impostata sul progetto.
   **Le route `/api/admin/*` restano invece dietro autenticazione di sessione**: toccano dati
   bancari e le lancia un browser autenticato, quindi non devono dipendere da un segreto condiviso.
7. Gli IBAN si mostrano mascherati in UI (`****1234`) e non si loggano mai per intero.
8. **Sanitizzazione prima di qualsiasi chiamata a un LLM**: si inviano solo nome merchant
   normalizzato, importo, data, categoria, aggregati. Mai IBAN, mai descrizione raw completa, mai
   ultime cifre carta, mai controparti di bonifici privati.
9. In produzione non si loggano payload bancari integrali.

## Regole di correttezza

- Ogni importo è `numeric(14,2)` in Postgres. In TypeScript **mai aritmetica su float**: il tipo
  interno è **intero in centesimi (`bigint`)**, ottenuto parsando la stringa decimale restituita da
  Postgres — **mai `parseFloat`**. La formattazione avviene solo al bordo UI. Un errore di
  arrotondamento in un'app di spese distrugge la fiducia nell'intero prodotto.
- La **conversione FX si esegue una volta sola, in ingestion**, con arrotondamento **half away from
  zero al centesimo**, e il risultato si salva. Non si ricalcola mai a runtime: due schermate che
  arrotondano in momenti diversi producono due numeri diversi per lo stesso movimento.
- Le **aggregazioni si fanno in SQL**, non in TypeScript.
- `booking_date` e `value_date` sono **giorni civili**: colonne `date`, mai `timestamptz`, e **mai**
  soggette a conversione di fuso. Una conversione UTC sposterebbe le transazioni di inizio e fine
  mese nel mese sbagliato, falsando ogni aggregato mensile.
- Fuso applicativo `Europe/Rome`, locale `it-IT`, valuta di riferimento `EUR`.
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
