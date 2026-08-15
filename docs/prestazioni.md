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
