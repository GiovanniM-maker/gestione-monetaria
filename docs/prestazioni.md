# Perché l'app è lenta, e cosa fare

> Scritto il 15 agosto 2026, dopo la segnalazione «l'app è lentissima e non ho capito perché».
> È un documento di **misure**, non di ipotesi: ogni numero qui dentro è stato preso, e dove non
> ho potuto misurare lo dico.

---

## 0. La risposta in una riga

**Non è il database.** Risponde fra i 2 e i 17 millisecondi su ogni query che le schermate fanno.
È l'architettura che gli sta intorno: **troppe andate e ritorno in fila**, un **oceano** in mezzo, e
**nessuna pagina che si possa riusare** perché sono tutte e trentotto `force-dynamic`.

---

## 1. Come ho misurato

Da questo container, contro il database di produzione, via PostgREST. Due numeri per ogni query:

- `x-envoy-upstream-service-time`: **quanto ci mette il database**, misurato dentro Supabase;
- il tempo totale del `curl`: quello, più la rete.

Il primo è il dato pulito. Il secondo dipende da dove sto io, quindi non è il tempo che vedi tu —
ma la **differenza** fra i due dice quanto pesa la rete, che è esattamente il punto.

Il resto viene dalla lettura del codice: quante chiamate parte ogni pagina, e soprattutto **quante
di queste devono aspettare la precedente**.

---

## 2. Cosa ho trovato

### 2.1 Il database non c'entra

| Query                                    | Tempo del database |
| ---------------------------------------- | ------------------ |
| `v_monthly_totals`                       | 17 ms              |
| `v_monthly_by_discretion`                | 16 ms              |
| `v_merchant_totals` (300 righe)          | 9 ms               |
| `v_monthly_by_category` (CTE ricorsiva)  | 5 ms               |
| `v_monthly_by_merchant`                  | 5 ms               |
| `v_stato_sistema`                        | 5 ms               |
| `v_subscriptions`                        | 4 ms               |
| `v_recurring_monthly_cost_by_discretion` | 3 ms               |
| `v_avvisi`                               | 2 ms               |
| `v_expenses` (una riga)                  | 2 ms               |

Gli indici ci sono e sono quelli giusti (`transactions` su `booking_date`, `merchant_id`,
`category_id`, `account_id+booking_date`). Su 1.323 movimenti e 300 esercenti non c'è niente da
ottimizzare: **ogni idea di "mettere un indice" o "riscrivere una vista" sarebbe lavoro sprecato.**

### 2.2 Il problema è il numero di andate e ritorno, non il loro peso

La stessa query, misurata da qui: **330 ms totali** contro **17 ms di database**. Il resto è rete e
TLS. Il rapporto è quello che conta: **ogni giro di rete costa venti volte il lavoro che fa fare**.

Aprendo il cruscotto, prima di questa modifica, i giri erano in fila così:

```
1. proxy            auth.getUser()           ← rete
2. layout           auth.getUser()           ← rete, di nuovo lo stesso
3. leggiCruscotto   v_monthly_totals         ← rete
4.                  ultimo giorno con dati   ← rete   (aspetta il 3)
5.                  9 query in parallelo     ← rete   (aspettano il 4)
6.                  2 query in parallelo     ← rete   (aspettano il 5, senza motivo)
7.                  confronto                ← rete   (aspetta il 6, senza motivo)
```

**Sette ondate in fila.** Il lavoro totale del database è circa 60 ms; il tempo che passa è sette
volte una latenza di rete più il rendering. Le ondate 6 e 7 non dipendevano da niente: erano in
fila per come era scritto il codice, non per una dipendenza vera.

### 2.3 L'oceano

Il database è a **Washington** (`cf-ray: …-IAD`). Vercel, senza una chiave `regions` in
`vercel.json`, esegue le funzioni nella sua regione predefinita, che è **anche lei Washington**.

Il che è la cosa giusta per il rapporto funzione↔database — stanno vicini — ma significa che
**ogni singola schermata che apri dall'Italia fa un viaggio Italia → Washington → Italia**, e non
può essere servita dalla cache perché non c'è niente in cache.

Non ho potuto misurare questa tratta da qui (non conosco l'indirizzo del deployment, e comunque
la misura andrebbe fatta dal tuo telefono). È il numero più importante che manca a questo
documento, ed è misurabile in trenta secondi: vedi §5.

### 2.4 Trentotto pagine su trentotto sono `force-dynamic`

Nessuna pagina viene mai riusata, nemmeno per un secondo, nemmeno fra due tocchi consecutivi sullo
stesso mese. È una scelta prudente e giusta di partenza — sono dati bancari e non devono finire in
una cache condivisa — ma **prudenza e immutabilità non sono la stessa cosa**: una pagina può essere
privata e comunque non doversi ricostruire da zero due volte in dieci secondi.

### 2.5 L'autenticazione si paga due volte

Il proxy chiama `supabase.auth.getUser()`, che è una **chiamata di rete** al server di auth. Poi il
layout chiama `requireUser()`, che chiama di nuovo `getUser()`. Due giri di rete prima che una
qualsiasi query sui dati sia partita.

Il commento in `session.ts` dice che «costa una chiamata già presente in cache di richiesta».
**Non è vero**: non c'è nessuna `cache()` intorno a `getCurrentUser`, e le due chiamate girano
comunque in due runtime diversi (proxy e server component), che non condividono niente.

Il doppio controllo **è voluto e va tenuto** — è la seconda serratura della regola 6, e serve
esattamente al caso in cui il matcher del proxy cambi. Quello che va tolto è il _costo_, non il
controllo. Vedi §4.3.

### 2.6 Qualche scaricamento più grosso del necessario

| Cosa           | Peso              | Perché                                                                                     |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| `/categorie`   | **57 KB** + 17 KB | scarica 1.323 righe di `v_expenses` e 300 di `merchants` **solo per contarle**             |
| `/esercenti`   | 47 KB             | 60 righe complete, di cui `descrizione_trovata` (fino a 300 caratteri l'una) non si mostra |
| `/abbonamenti` | 51 KB             | `v_subscriptions` interamente, comprese le colonne che la schermata non legge              |

Non sono la causa principale — su una connessione mobile decente sono decimi di secondo — ma sono
lavoro gratuito da togliere, e il primo è proprio brutto: contare righe scaricandole tutte.

---

## 3. La sicurezza, guardata nella stessa occasione

Non ho trovato falle nel codice. Ho trovato **tre cose da chiudere che stanno fuori dal codice**, e
due debiti.

### 3.1 Da fare adesso

1. **Ruotare la chiave `service_role` di Supabase.** È passata in questa conversazione. Finché non
   è ruotata, chiunque abbia accesso alla cronologia ha accesso completo al database **scavalcando
   RLS**. È la cosa più grave dell'intero documento.
2. **Ruotare la chiave Brave Search.** Stessa ragione, danno molto minore (quota).
3. **Togliere `SUPABASE_SERVICE_ROLE_KEY` da Vercel** se c'è ancora: l'applicazione usa la chiave
   anon e RLS, e una chiave che non serve a nessuno è solo superficie d'attacco.

Nota per il futuro, e vale più delle tre righe qui sopra: **un segreto incollato in una chat è un
segreto bruciato.** Non c'è modo di "toglierlo dopo".

### 3.2 Quello che invece è a posto

- Le funzioni nuove (`variazioni_*`, `aggiorna_categoria`, `elimina_categoria`,
  `categorizza_movimento`, `imposta_esercente_variabile`) sono tutte `security invoker` con
  `search_path = ''`: girano con i permessi di chi chiama, quindi **RLS si applica**. Una
  `security definer` avrebbe scavalcato tutto.
- `revoke all … from public` e `grant execute … to authenticated` su ognuna: nessuna è raggiungibile
  da `anon`.
- Le route nuove (`/api/admin/categorie`, `/api/admin/esercenti`,
  `/api/admin/movimenti/classifica`) stanno tutte sotto `/api/admin/*`, quindi dietro sessione e non
  dietro un segreto condiviso, come vuole la regola 6.
- `elimina_categoria` non scollega mai niente in silenzio: su una radice con del contenuto si ferma.
  È una difesa contro la perdita di dati, non solo una comodità.

### 3.3 I due debiti, che restano aperti

- **MFA TOTP.** In `CLAUDE.md` c'è scritto di rivalutarlo «quando ci saranno movimenti reali». Ci
  sono: 1.323. Oggi l'unica difesa è una password, su un'applicazione che espone undici mesi di
  estratto conto.
- **`SUPABASE_DB_URL` nell'ambiente di sviluppo.** Contiene una password in chiaro e non serve a
  niente: la porta 5432 non è raggiungibile da qui, ed è per questo che si è passati a PostgREST.

---

## 4. Il piano

In ordine di **quanto tempo si guadagna per quanto lavoro costa**. Le prime due le ho già fatte
insieme a questo documento; le altre no.

### 4.1 Collassare la cascata del cruscotto — **fatto**

Da sette ondate a **tre** (auth, poi tutto ciò che non dipende da niente, poi le variazioni che
hanno bisogno della finestra). Solo due letture dipendevano davvero da qualcosa; le altre erano in
fila per come era scritto il codice.

Guadagno atteso: quattro giri di rete in meno per ogni apertura del cruscotto.

### 4.2 La categoria si cambia dalle liste — **fatto**

Non è una modifica di prestazioni ma di tempo speso: cambiare una categoria costava due navigazioni
e un ritorno indietro, cioè tre round trip completi. Ora è un tocco sulla riga.

### 4.3 Non pagare due volte l'autenticazione — **~1 ora, guadagno grosso**

Il controllo resta doppio; la **chiamata di rete** diventa una. Due strade, in ordine di preferenza:

1. verificare il JWT **localmente** nel layout (firma asimmetrica) invece di chiedere al server di
   auth. Il proxy continua a rivalidare contro il server, quindi la seconda serratura resta una
   serratura vera;
2. avvolgere `getCurrentUser` in `cache()` di React: elimina il doppione **dentro** un render, non
   fra proxy e render. Metà del guadagno, un decimo del lavoro.

**Da non fare**: togliere il controllo del layout. È la regola 6, ed è la difesa contro il giorno in
cui il matcher del proxy cambia.

### 4.4 Avvicinare le funzioni a chi le usa — **~15 minuti, guadagno da misurare prima**

`"regions": ["fra1"]` in `vercel.json` avvicina le funzioni all'Italia di ~90 ms per richiesta, ma
**allontana ogni query dal database di altrettanto** — e le query sono tante. Con tre ondate
rimaste il conto potrebbe girare a favore, con sette girava contro.

**Non farlo alla cieca**: prima la misura di §5, poi si decide. Se invece si sposta anche il
database in Europa (`eu-central-1`), allora vincono tutti e due — ma è una migrazione con un fermo,
e va pianificata a parte.

### 4.5 Smettere di scaricare per contare — **~1 ora**

`/categorie` scarica 74 KB per fare due `count`. Serve una vista `v_categorie_uso` che conti in SQL
e restituisca trentatré righe. Stessa medicina per le colonne inutilizzate di `/esercenti` e
`/abbonamenti`: chiedere le colonne che si mostrano e basta.

### 4.6 Rendere le schermate riusabili senza renderle pubbliche — **~2-3 ore, guadagno il più grosso di tutti**

È il punto che cambia la sensazione d'uso più di ogni altro, e anche il più delicato.

- I dati aggregati di un **mese chiuso** non cambiano mai più. Luglio 2026 è luglio 2026: può essere
  ricostruito una volta e riusato, con invalidazione esplicita quando la sincronizzazione notturna
  tocca qualcosa (`revalidateTag`).
- Il **mese in corso** cambia quattro volte al giorno, quanto le sincronizzazioni. Una finestra di
  riuso di pochi minuti è indistinguibile dal vero e toglie il grosso del lavoro ripetuto.
- La cache deve restare **privata**: `Cache-Control: private`, mai su CDN condivisa. È un vincolo,
  non un dettaglio.

### 4.7 Far sembrare veloce ciò che veloce non può essere — **~2 ore**

Con `loading.tsx` e `<Suspense>`, la struttura della pagina arriva subito e i blocchi si riempiono
mentre arrivano. Il tempo totale non cambia; **il tempo prima di vedere qualcosa** crolla, ed è
quello che si percepisce come «lenta».

Ordine naturale: prima il numerone, poi le classi, poi la ciambella, poi gli esercenti — che è già
l'ordine delle domande della schermata.

### 4.8 Poter misurare invece di indovinare — **~1 ora**

Oggi non esiste un modo di sapere quanto ci mette una pagina in produzione. Servono Vercel
Analytics (Speed Insights) e una riga di log per richiesta con il tempo di ciascuna ondata. Senza,
ogni modifica futura è una scommessa — e questo documento ha dovuto misurare da fuori proprio per
questo.

---

## 5. La misura che manca, e che costa trenta secondi

Dal **telefono**, sulla rete che usi davvero:

1. apri l'app e guarda quanto passa fino al primo pixel;
2. da desktop, strumenti per sviluppatori → rete → ricarica il cruscotto, e guarda **Time to First
   Byte** del documento HTML.

Con quel numero si decide §4.4 e si dà una scala a tutto il resto:

- **TTFB alto (> 1,5 s) e stabile** → è la cascata di round trip e la geografia: §4.3, §4.4, §4.6.
- **TTFB alto solo la prima volta e poi basso** → sono le partenze a freddo delle funzioni: la cura
  è §4.6 e ridurre il peso del server bundle.
- **TTFB basso ma la pagina compare tardi** → è il rendering e il JavaScript del client: la cura è
  §4.7.

Sono tre malattie diverse con tre cure diverse, e **curarne una sbagliata non fa niente**. È il
motivo per cui questo documento si ferma qui invece di continuare a ottimizzare: le prossime mosse
vanno scelte su un numero, non su un'impressione.

---

## 6. Cosa **non** va fatto

- **Indici, riscritture di viste, materializzazioni.** Il database risponde in 2-17 ms. Sarebbe
  lavoro su un problema che non esiste, e ogni vista materializzata è una copia che può divergere.
- **Togliere il doppio controllo di autenticazione.** Vedi §4.3.
- **Mettere le pagine in una cache condivisa.** Sono dati bancari.
- **Cambiare regione a occhio.** Vedi §4.4: senza la misura può peggiorare.

---

---

# Secondo passaggio — 22 agosto 2026

> Sette giorni dopo, la stessa segnalazione: «mi sembra che l'app sia particolarmente lenta».
> Questo passaggio **non rifà** il precedente: ne verifica le conclusioni, dice cosa nel frattempo
> è stato fatto, e trova la cosa che il 15 agosto **non poteva** trovare — perché non esisteva
> ancora.

## 7. Cosa è cambiato dal 15 agosto

Tre delle mosse del §4 sono state fatte, e vanno tolte dall'elenco delle cose da fare:

- **§4.3, seconda strada — fatta.** `getCurrentUser` è ora avvolto in `cache()` di React. Il
  doppione _dentro_ un render è sparito; restano le due chiamate fra proxy e componenti server, che
  sono due runtime diversi e sono volute.
- **§4.7 — fatta, e più di quanto chiedesse.** Ci sono **17 `loading.tsx` su 24 pagine**, e le
  pagine sono composte a `<Suspense>` con `Promise.all` dentro ogni blocco.
- **§4.1 — fatta**, ed è dentro la struttura attuale del cruscotto.

E una cosa nuova è **arrivata il 16 agosto**, cioè il giorno dopo quel documento: il pendolo di
`Sincronizza`, che chiama il giro **veloce** ogni cinque minuti mentre l'app è aperta. È il
soggetto del §9, ed è il motivo per cui questo secondo passaggio esiste.

## 8. Le misure, rifatte su una replica

Il 15 agosto si misurava **contro il database di produzione** via PostgREST. Da questo ambiente non
si può: non c'è la chiave anon e la porta 5432 è chiusa. Quindi la replica: `initdb` in una cartella
temporanea, **tutte** le migration applicate in ordine, e un seme di volume realistico —
**2.000 transazioni, 2.000 payload grezzi (884 kB), 166 esercenti, 226 alias**.

Non è la stessa misura e non va confusa: qui non c'è né rete né PostgREST, c'è **solo il tempo di
Postgres**. Serve a rispondere a una domanda sola — _il database ha smesso di essere innocente
mentre i dati crescevano?_ — e la risposta è no.

| Query                                      | Tempo   |
| ------------------------------------------ | ------- |
| `cerca_movimenti` senza filtri, limite 50  | 11,1 ms |
| `cerca_movimenti(mese, limite 50)`         | 6,4 ms  |
| `ripartizione_dove(mese)` — la fisarmonica | 5,5 ms  |
| `v_monthly_totals` — il numerone           | 4,4 ms  |
| lettura integrale di `raw_transactions`    | 6,6 ms  |
| `spesa_giornaliera(mese)`                  | 1,5 ms  |
| `v_subscriptions` — il rilevatore intero   | 1,4 ms  |
| `v_recurring_monthly_cost_by_discretion`   | 0,9 ms  |

**Niente supera gli 11 ms**, e la più cara è quella senza filtri, che è anche la più rara. Il §2.1
regge dopo una settimana e mezzo di dati e sette funzioni SQL in più. **Indici e riscritture
restano lavoro sprecato.**

## 9. Il difetto nuovo: il giro «veloce» rilegge e riscrive tutto l'archivio

`Sincronizza` chiama `POST /api/admin/aggiorna` **ogni cinque minuti** mentre l'app è in primo
piano, più al montaggio del layout, più a ogni tirata per aggiornare. La route esegue il profilo
`veloce`, descritto come _«scarica sette giorni, normalizza, applica gli alias che ci sono già»_ e
come **«i soli passi che non costano niente oltre alla chiamata alla banca»**.

Quella frase non è vera, ed è il difetto principale di oggi. `normalizzaTutto()` e
`applicaTassonomia()` **non guardano cosa è arrivato**: rileggono e riscrivono l'intero archivio,
identiche a come girano nel profilo completo.

### Il conto dei viaggi

Ogni lettura e ogni scrittura è una richiesta HTTP a PostgREST, e nei due cicli sono quasi tutte
**in fila**. A 2.000 movimenti e 166 esercenti:

| Passo                                                             | Viaggi   |
| ----------------------------------------------------------------- | -------- |
| `normalizzaTutto` — conti, controparti                            | 2        |
| — registro grezzo a blocchi di 500 (**884 kB di JSON**)           | 5        |
| — chiavi protette, conteggio prima, conteggio dopo, RPC speculari | 4        |
| — `upsert` di **tutte** le 2.000 righe, a lotti di 200            | 10       |
| `applicaTassonomia` — esercenti, alias, categorie (in parallelo)  | 3        |
| — conteggio protette                                              | 1        |
| — transazioni a blocchi di 1.000                                  | 3        |
| — **una `UPDATE` per esercente**, in un `for … await`             | **166**  |
| — svuotamento delle non abbinate                                  | ~1–4     |
| **Totale**                                                        | **≈195** |

**Centonovantacinque andate e ritorno in fila, ogni cinque minuti, per rispondere quasi sempre
«niente di nuovo».** È esattamente la malattia diagnosticata al §2.2 — _ogni giro di rete costa
venti volte il lavoro che fa fare_ — solo che lì erano sette ondate su una pagina, e qui sono
centonovantacinque su un pendolo che batte da solo.

Il lavoro del database resta piccolo: la riscrittura completa delle 2.000 righe costa **58 ms** di
esecuzione, trigger `set_updated_at` compresi. **Il tempo non sta nel calcolo, sta nell'andare e
tornare** — di nuovo, la stessa frase.

Il freno del server — quattro minuti fra due chiamate alla banca — protegge **la banca**, non
questo lavoro: `normalizzaTutto` e `applicaTassonomia` girano lo stesso, anche quando lo scarico
viene saltato.

### Perché è un difetto e non una scelta

L'idempotenza per ricalcolo è **giusta** e va tenuta: una riga che non corrisponde più a nessun
alias dev'essere svuotata, non lasciata com'era, o togliere un alias sbagliato non ne disferebbe
l'effetto.

Ma «ricalcolare tutto» è la semantica corretta della funzione **completa**, non la frequenza
corretta per un pendolo da cinque minuti. Quando il profilo `veloce` è nato si è scelto _quali
passi_ saltare, non _su quante righe_ farli girare — e la differenza fra le due cose non si vede
finché l'archivio è piccolo.

**È l'unico numero di questo documento che peggiora da solo**: oggi 2.000 movimenti, e il conto è
stato aperto meno di un anno fa.

## 10. Ogni clic costa due viaggi, e il secondo parte a cache fredda

Nel codice ci sono **28 `await fetch(...)` nei componenti client e 28 `router.refresh()`**: è il
modello di ogni azione. Un tocco su «va bene» in `/da-confermare` costa, in ordine:

1. **`POST /api/admin/conferma`** → proxy `getUser()` (rete), route `getAuthorizedUser()` (rete),
   scrittura, e **`scadeTutto()`**;
2. **`router.refresh()`** → proxy `getUser()`, layout `requireUser()` + `leggiClassi()`, e **tutte**
   le query della pagina — che a questo punto **non possono essere in cache**, perché il passo 1
   l'ha appena buttata.

Quattro chiamate di autenticazione e un render completo per un tocco che cambia una riga.
`scadeTutto()` è **corretto** — un totale vecchio mostrato come fresco è il guasto che questa
applicazione non si può permettere — ma il suo prezzo sulla latenza percepita è questo, e va
scritto invece di essere riscoperto ogni volta.

C'è un caso in cui il prezzo si paga per niente: **il giro veloce chiama `scadeTutto()` anche
quando non ha trovato nulla.** Ogni cinque minuti l'intera cache dei dati viene buttata per
registrare che non è cambiato niente.

## 11. La cache dei dati esiste, e fa centro molto meno di quanto sembri

`inCache` (`src/lib/supabase/cache.ts`) è la risposta al §4.6, ed è costruito bene: il gettone di
sessione sta nella **chiave**, quindi RLS continua a valere riga per riga e la `service_role` non
serve a nessuno. Il problema non è com'è fatto, è **quanto copre e quanto dura**.

**Copertura.** Su **158 letture** verso il database in tutto il codice, **19 passano da `inCache`**.

| Modulo                              | Letture | In cache |
| ----------------------------------- | ------- | -------- |
| `copilota/strumenti.ts`             | 22      | 0        |
| `copilota/conversazione.ts`         | 16      | 0        |
| `tassonomia/categorie.ts`           | 9       | 0        |
| `conferma/leggi.ts`                 | 6       | 0        |
| `avvisi/leggi.ts`                   | 5       | 0        |
| `movimenti/cerca.ts`                | 3       | 0        |
| `categoria/[id]` + `esercente/[id]` | 4 + 4   | 0        |

Per gli strumenti del copilota è **giusto**: quei dati vanno letti nel momento in cui il modello li
chiede. Per `/movimenti`, `/da-confermare`, `/avvisi` e le due schede non c'è una ragione — è solo
che non è stato fatto.

**Durata.** `SECONDI = 60`. Una persona che guarda una schermata, pensa e ne apre un'altra impiega
più di un minuto: **la cache scade prima del secondo tocco**. Serve nei rimbalzi rapidi — cambiare
mese avanti e indietro, un `router.refresh()` — e in poco altro. Non è sbagliato: sessanta secondi
sono la rete di sicurezza per una scrittura fatta a mano sul pannello Supabase. Ma spiega perché il
beneficio si sente poco.

## 12. La geografia, ripresa dal §2.3

Il 15 agosto era stato accertato che **il database è a Washington** (`cf-ray: …-IAD`) e che Vercel,
senza `regions` in `vercel.json`, esegue le funzioni **anche lei a Washington**. `vercel.json` oggi
contiene i due cron e **ancora nessun campo `regions`**: quindi la situazione è invariata, funzione
e database sono vicini, e **ogni schermata aperta dall'Italia fa un viaggio Italia → Washington →
Italia**.

Questo cambia il verso della raccomandazione del §4.4, e vale la pena dirlo esplicitamente perché è
controintuitivo: **spostare le funzioni in Europa non è la mossa ovvia**. Le avvicinerebbe di ~90 ms
all'utente e le allontanerebbe di altrettanto dal database — e il §9 ha appena mostrato che il
numero di viaggi funzione↔database non è sette, in almeno un percorso è **centonovantacinque**.
Finché quel numero non scende, moltiplicarlo per una latenza transatlantica sarebbe il modo più
efficace di peggiorare le cose.

**L'ordine giusto è: prima il §9, poi la geografia.** E se la geografia si tocca, la mossa che fa
vincere entrambi è spostare **il database** in Europa, non le funzioni in Europa — che però è una
migrazione con un fermo e va pianificata a parte.

## 13. Il peso del client: non è lì

Misurato sul build vero.

| Grandezza                                  | Valore                                     |
| ------------------------------------------ | ------------------------------------------ |
| JavaScript client, tutti i percorsi        | **779 kB** non compressi, **~250 kB** gzip |
| Chunk più grosso (React + runtime Next)    | 224 kB                                     |
| Bundle del proxy                           | 4 kB                                       |
| Immagini in `public/`                      | **276 kB in tutto**                        |
| La più pesante (`icona-512.png`, manifest) | 76,7 kB                                    |
| Le illustrazioni                           | webp da 10 a 16 kB l'una                   |
| Componenti client (`'use client'`)         | 30 su 82                                   |
| `<Link>`, quindi con prefetch              | 71, contro **un solo** `router.push`       |

Sono numeri sani per Next 16 + React 19 senza librerie UI — che è quello che lo stack impone. Le
illustrazioni sono già webp con `width` e `height` espliciti, quindi niente salti di layout. Ci sono
**9 `<img>` grezzi e un solo `next/image`**: su file da 15 kB non cambia niente, e non vale una
modifica.

**Se l'app sembra lenta, non è perché scarica troppo.** Sembra lenta perché ogni schermata aspetta
il server, e il server aspetta la rete verso il database.

## 14. Clic, modali, gesti

È la parte messa meglio, ed è anche l'unica già misurata sul campo — rifacimento UX di agosto 2026,
dettagli in `CLAUDE.md`:

- **nessuna schermata sborda** a 320, 375, 390, 430, 768 e 1280 px;
- **tre bersagli** in tutta l'applicazione sotto i 44 px (erano 313 sulla sola `/revisione`);
- i pannelli sono `<dialog>` con `showModal()`: fuoco intrappolato, Esc, resto della pagina inerte,
  nessuna gara di `z-index`;
- il corpo si **fissa** con `position: fixed` mentre una modale è aperta — non `overflow: hidden`,
  che su iOS lascia scorrere lo stesso;
- foglio e cassetto si trascinano via dalla testata intera, con soglia a un quarto della misura o
  strappo a 550 px/s.

Il difetto residuo **non è nel gesto, è in cosa succede dopo**: `router.refresh()` ridisegna tutto
il ramo server della rotta, layout compreso, su una pagina `force-dynamic` con la cache appena
invalidata. È il §10, visto dal dito.

Restano **sette pagine su ventiquattro senza `loading.tsx`**: sono le uniche in cui un tocco può
sembrare ignorato, perché Next tiene a schermo la pagina vecchia per tutto il viaggio.

## 15. Cosa fare, in ordine di guadagno diviso rischio

> **I passi, scritti per esteso, stanno in `docs/prestazioni-rimedi.md`**: cosa cambia, perché è
> sicuro, il codice, come si verifica e come si torna indietro, passo per passo. Qui restano le
> mosse e il loro ordine. La migration che serve ai primi due passi — `0057_meno_viaggi.sql` — è
> già scritta e già provata sulla replica.

**1 · Il giro veloce deve guardare solo ciò che è arrivato (§9).** È la mossa che vale di più, ed è
anche quella dove si fa più danno, quindi va trattata come una migration:

- `normalizzaTutto` accetta una finestra — i grezzi con `fetched_at` recente, o gli `id` sopra un
  cursore — e il profilo `veloce` la passa; il profilo **completo** continua a fare tutto, quattro
  volte al giorno, come oggi;
- `applicaTassonomia` accetta l'insieme di transazioni su cui girare;
- **l'idempotenza per ricalcolo non si tocca**: la garantisce il giro completo, ed è lì che va
  provata — due esecuzioni consecutive, zero righe cambiate;
- il modo di sbagliare da temere è **silenzioso**: una finestra troppo stretta lascia fuori un
  movimento che nessuno vedrà mancare. Quindi la finestra dev'essere **generosa**, come i sette
  giorni dello scarico e per la stessa ragione.

**2 · Le 166 `UPDATE` in fila diventano una chiamata (§9).** Una funzione SQL che riceve le coppie
`(transazione, esercente)` e le applica in un colpo. Da 166 viaggi a uno, ed è verificabile
diffando `transactions` prima e dopo: stesso stato finale o è una regressione.

**3 · `scadeTutto()` solo se qualcosa è cambiato (§10).** Nel giro veloce, invalidare solo quando
lo scarico o la normalizzazione hanno scritto davvero. Il verso in cui fallire resta quello di
oggi: nel dubbio, invalidare.

**4 · Mettere in cache le letture di pagina che oggi non lo sono (§11).** `/movimenti`,
`/da-confermare`, `/avvisi`, `/categoria/[id]`, `/esercente/[id]`. La chiave deve contenere
**tutto** ciò che cambia il risultato — mese, filtro, pagina — o si mostrano i dati di luglio sotto
l'intestazione di agosto, che è molto peggio della lentezza.

**5 · `loading.tsx` sulle sette pagine che non l'hanno (§14).** Non toglie un millisecondo: toglie
la sensazione che il tocco non sia arrivato, che è metà del problema percepito.

**6 · La geografia, ma solo dopo (§12).** E leggendo il §12, non il §4.4: il verso della
raccomandazione è cambiato.

Restano validi e non fatti anche il **§4.5** (smettere di scaricare per contare) e il **§4.8**
(Speed Insights, senza cui ogni modifica futura resta una scommessa) — e per intero il **§3.1**, che
non è una questione di prestazioni ma è la cosa più grave scritta in questo file.

**Cosa continua a non andare fatto**: il §6 per intero. A 11 ms per la query più cara, indici,
riscritture e materializzazioni sono lavoro su un problema che non esiste.

## 16. Come rimisurare

1. **Replica locale**: `initdb` in una cartella temporanea, gli stub Supabase (ruoli, schema `auth`,
   `auth.uid()`, pgcrypto), tutte le migration in ordine, seme a 2.000 movimenti. Poi `\timing` sulle
   otto query del §8. **Se una supera i 50 ms, è una regressione.**
2. **Viaggi di rete**: contare i `.from(` / `.rpc(` sul percorso, e soprattutto i cicli `for … await`
   che ne fanno uno per elemento. Il numero del §9 si rifà a mano in cinque minuti.
3. **Peso del client**: `pnpm build`, poi la somma di `.next/static/chunks/*.js`. **Se supera 1 MB
   non compresso, è entrata una libreria.**
4. **Dal telefono**, l'unica misura che conta davvero e che qui continua a mancare: aprire l'app,
   toccare «va bene» su un movimento, e contare quanto passa fra il dito e il numero aggiornato. È
   il §10, ed è il numero da far scendere.

## Appendice — un difetto trovato mentre si misurava, e già corretto

Ricostruendo lo schema da zero per la replica, la migration
`0056_via_il_ciclo_di_vita_doppio.sql` **si è fermata**:

```
ERROR: column "scade_at" of relation "public.chat_conversations" does not exist
```

Su un database ricostruito da zero quelle tre colonne non sono mai esistite — le aggiungeva una
migration parallela poi cancellata — e `comment on column` su una colonna assente è un **errore**,
non un no-op. In produzione la 0056 è passata perché lì le colonne c'erano, quindi il guasto era
invisibile da dove si guarda di solito.

Non è un difetto di prestazioni, ma è esattamente il tipo di cosa che si scopre nel momento
peggiore: quando si prova a ricostruire lo schema. I tre `comment` ora stanno dentro un
`do … if exists`. Verificato: si applica due volte su uno schema vergine.
