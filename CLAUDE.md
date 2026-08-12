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
| 4     | Tassonomia e categorizzazione a cascata   | **completata** |
| 5     | Detector abbonamenti (SQL puro)           | **completata** |
| 6     | Dashboard                                 | **completata** |
| 6-bis | Il pavimento: movimenti, stato, entrate   | **completata** |
| 7     | Automazione                               | non iniziata   |
| 8     | Motore alert (SQL)                        | non iniziata   |
| 9     | Report periodico AI                       | non iniziata   |
| 10    | Chat copilot                              | non iniziata   |

Aggiornare questa tabella è parte del commit di chiusura di ogni fase.

**La 6-bis nasce da un inventario, non da un piano.** Fatto a fine Fase 6 e scritto in
`docs/cruscotto.md`, ha trovato che **nessuna schermata mostra una transazione**: ogni discesa
finisce su un aggregato. Ne discendono tre impossibilità — verificare un numero scomponendolo,
correggere una singola riga (`manually_categorized` è progettato e irraggiungibile), e fare la
conferma di fine giornata, che è una lista di movimenti con dei bottoni sopra. Più una mancanza che
costa pochissimo colmare e protegge dal guasto peggiore: `bank_connections.valid_until` non è
mostrato da nessuna parte, e quando il consenso scade i dati smettono di arrivare **in silenzio**.

Decisioni prese il 12 agosto 2026, nel dettaglio in `docs/cruscotto.md` §8:
**entrate** sì ma solo come denominatore (i giroconti in entrata non sono entrate);
**apertura** resta il mese corrente; **budget** non ora; **correzione della singola transazione**
da decidere sui dati, quindi la scheda movimento nasce in sola lettura.

**Perché la 2-bis è archiviata e non rimandata.** Esisteva per recuperare il primo anno di storico,
necessario a vedere gli abbonamenti annuali. Quel primo anno **non esiste**: il conto è stato aperto
il 23 settembre 2025, verificato sull'estratto CSV — fonte indipendente dall'API — dove il saldo
implicito prima del primo movimento è 0,00. L'API ha già il 100% dello storico. Gli abbonamenti
annuali diventano visibili da soli il 23 settembre 2026, e nessun import può anticipare quella data.
Da riaprire **solo** se si collega Intesa e serve il suo storico pregresso.

---

## Idee registrate, da valutare quando la fase arriva

Non sono lavoro pianificato. Stanno qui perché il momento in cui vengono in mente non è il
momento in cui vanno fatte, e perché dimenticarle costa più che scriverle.

### L'intento dell'acquisto non sta sull'esercente — chiedere a fine giornata

`discretion` vive sul merchant e si propaga a tutte le sue transazioni. È la scelta che rende
sostenibile la classificazione: si risponde "Deliveroo è voluttuario" una volta invece che su
59 righe.

Ma ha un limite strutturale, notato dall'utente in Fase 4: **lo stesso esercente ospita acquisti
con intenti diversi.** Un computer comprato da Euronics per lavorare è `investimento` e `business`;
una sciocchezza comprata nello stesso negozio è `voluttuario` e `personale`. Il negozio è identico,
la spesa no. Nessuna regola sull'esercente può distinguerli, e nemmeno un LLM può: l'informazione
non è nei dati bancari, è nella testa di chi ha comprato.

**Lo schema regge già il caso**: `transactions` ha `discretion`, `context`, `notes` e
`manually_categorized` per riga, e quest'ultimo blocca ogni sovrascrittura automatica successiva.
Non serve cambiare niente nel database.

Manca il **momento in cui chiedere**. L'idea: a fine giornata l'app mostra i movimenti nuovi e
propone la sua classificazione, che si conferma con un gesto o si corregge. Due ragioni per cui la
sera e non dopo:

1. **La memoria dell'intento decade in fretta.** A un mese di distanza "89 € da Euronics" non si
   ricostruisce più, e la risposta diventa un'ipotesi. La sera è ancora un fatto.
2. **I movimenti di una giornata sono pochi.** È un gesto da trenta secondi, non una sessione di
   riordino — ed è la differenza fra una cosa che si fa e una che si rimanda.

Da collocare fra la Fase 6 (dashboard) e la Fase 7 (automazione): serve una schermata dove mostrarli
e un lavoro schedulato che li raccolga. Se la proposta la scrive un LLM, vale la regola 8: nome
merchant normalizzato, importo, data, categoria — mai la descrizione grezza, mai le controparti dei
bonifici privati.

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
- **AI**: OpenRouter, server-side (`OPENROUTER_API_KEY`, modello scelto con `OPENROUTER_MODEL`)
- **Repo**: GitHub

Non introdurre ORM pesanti, state manager, o librerie UI oltre a quelle strettamente necessarie.
Preferisci SQL esplicito e query tipizzate.

### Ogni operazione dev'essere raggiungibile dal copilot, non solo da un bottone

La Fase 10 prevede di chiedere all'app *"quanto ho speso in ristoranti a marzo"*, ma anche
*"sposta questa transazione in un'altra categoria"* e *"creane una nuova"*. Un copilot può fare
solo ciò che esiste come **operazione nominata**: se la logica vive dentro un gestore di click, per
lui non esiste.

Conseguenza pratica, valida da subito e non dalla Fase 10:

- le **aggregazioni** stanno in viste SQL, mai ricalcolate in TypeScript per una schermata;
- il **rilevamento** (abbonamenti, ricorrenze, anomalie) sta in funzioni SQL, non in un ciclo
  applicativo;
- le **scritture** (assegna esercente, sposta transazione, crea categoria) stanno in funzioni
  esportate con una firma esplicita, e la UI le chiama come le chiamerà il copilot.

Non è anticipare la Fase 10: è non doverla riscrivere. Una vista e una funzione SQL sono già
strumenti che un modello può usare; un `onClick` no.

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

#### Riconciliazione contro l'estratto CSV — luglio 2026

Fatta il 12 agosto 2026 confrontando giorno per giorno il nostro database con l'export ufficiale di
Revolut, che è una fonte indipendente dall'API. Differenza lorda **217,68 €**, interamente
scomposta:

| Voce                                    | Importo    | Chi ha ragione                                          |
| --------------------------------------- | ---------- | ------------------------------------------------------- |
| Movimento del 7–8 luglio                | ±53,00 €   | nessuno dei due: si annulla nel mese                    |
| Movimento del 18–19 luglio              | ±11,99 €   | nessuno dei due: si annulla nel mese                    |
| Canone Premium del 21 luglio            | 9,99 €     | **noi** — il CSV lo nasconde in `Costo`                 |
| `Vercel` annullata del 21 luglio        | −0,44 €    | **noi** — il CSV elenca un'operazione annullata          |
| `Byteplus` del 31 luglio                | 208,13 €   | **il CSV** — vedi sotto                                  |

Le prime quattro voci confermano la pipeline. La quinta è l'unico difetto reale trovato.

#### Il movimento dopo mezzanotte finisce nel mese sbagliato

`Byteplus`, 208,13 €, fatto alle **00:11 del 1° agosto** ora di Roma. L'API lo restituisce con
`booking_date` **31 luglio**: 00:11 a Roma sono le 22:11 UTC del giorno prima. È esattamente la
conversione di fuso che le regole di correttezza vietano — solo che avviene **a monte, dentro
l'ASPSP**, non nel nostro codice, che si limita a salvare la data ricevuta.

Lo stesso scarto di un giorno si vede sui movimenti del 7–8 e del 18–19 luglio, sempre nella stessa
direzione: il nostro `booking_date` è un giorno prima della data che Revolut mostra. Dentro il mese
si annulla; sul confine di mese sposta l'importo nell'aggregato sbagliato.

**Quanto vale**: su tutto lo storico solo **4 movimenti** cadono il primo del mese fra mezzanotte e
le 02:00, per **243,95 €** netti. Su 71 movimenti notturni totali, gli altri 67 restano nel mese
giusto. Non tocca il costo *ricorrente*, che è la metrica principale, quindi non giustifica la
riapertura della Fase 3 — ma va saputo prima di stupirsi di uno scarto su un totale mensile.

### Numeri di chiusura della Fase 4

| Grandezza | Valore |
| --------- | ------ |
| Copertura della spesa reale, in euro | **94,0%** — 31.887,13 su 33.915,37 |
| Copertura in movimenti | 98,2% — 1.294 su 1.318 |
| Categorie / esercenti / alias | 35 / ~160 / ~180 |
| Etichette ancora da assegnare | 24, per 2.028 € |

Delle 24 scoperte, **11 sono nomi di persona** per 2.018 €: non sono un fallimento, sono il confine
della macchina. Solo l'utente sa se un bonifico a un privato è un affitto, un prestito o un
compenso, e la regola 8 vieta comunque di chiederlo a un modello.

La ventiquattresima è `Annual Stamp Duty Tax` — l'imposta di bollo del conto, trattenuta dal filtro
perché quattro parole maiuscole senza nessuna parola di mestiere non si distinguono da un nome
proprio. È un falso positivo previsto: costa un'assegnazione a mano.

### Come funziona la cascata, e perché in quest'ordine

1. **Alias deterministici.** Coprono da soli la quasi totalità dei movimenti ricorrenti.
2. **Proposta del modello**, solo per gli esercenti mai visti. Le proposte nascono con
   `origine = 'ai'` e `confermato_at` nullo: valgono subito per la categorizzazione — una
   classificazione probabile e visibile è più utile di nessuna — ma restano marcate da confermare.
3. **Correzione umana**, che scrive un alias e diventa definitiva.

**Gli alias sono la memoria delle risposte**, ed è ciò che rende l'automatismo sostenibile: senza,
si pagherebbe una chiamata al modello ogni volta che si ordina da Deliveroo. È anche il motivo per
cui il modello restituisce un **frammento** (`canva` per `Canva* I04731-63857386`): la banca cambia
il codice a ogni addebito, e un alias sull'etichetta intera non riconoscerebbe mai il prossimo.

### Le tre lezioni della Fase 4

**La normalizzazione delle stringhe non serve quasi a niente.** Misurata sui 60 esercenti veri: da
60 forme a 58. I casi che contano non sono errori di ortografia — che Claude sia Anthropic, o che
dietro `Paddle.net* N8n Cloud1` ci sia n8n, è un'informazione sul mondo. E un normalizzatore
aggressivo non è neutro: univa `Comet Spa` e `Bruno Spa-modica`. **Fondere due esercenti distinti è
peggio che tenerne uno diviso in due**: il secondo si vede e si corregge, il primo produce un totale
plausibile e sbagliato.

**Cosa può uscire verso un LLM lo decide il tipo di operazione, non la forma del nome.**
`Bovi Laura` e `Panfe Bologna` sono la stessa identica forma: l'informazione non è nella stringa.
Dall'altra parte di un pagamento con carta c'è un esercente per costruzione; dall'altra parte di un
bonifico può esserci chiunque. Per questo `transactions.bank_code` esiste.

**Una regola di sicurezza deve fallire chiusa, e la nostra falliva aperta.** Il filtro chiedeva
"sembra una persona?" e in caso di dubbio inviava. Il 12 agosto ha lasciato uscire
`Massimiliano De Jesus Sarta Naccarata` — cinque parole, fuori dalla finestra di due-quattro che il
riconoscimento prevedeva. Allargare la finestra avrebbe curato il sintomo. La domanda è stata
rovesciata in **"sembra un'azienda?"**, che è un test positivo: forma societaria, parola di
mestiere, dominio, cifre, prefisso di incasso. Senza uno di questi segnali l'etichetta resta dentro.

### Cosa il modello sbaglia, osservato su 100 proposte

Utile alla Fase 9, dove un LLM scriverà i report.

- **Ragiona dall'importo quando il nome non basta.** `Bruno` è stato messo in `casa` /
  `essenziale` perché *"importo alto suggerisce spesa casa"*. Era un negozio di elettronica, e
  `essenziale` è la classe che più distorce la metrica.
- **Inventa una motivazione plausibile pur di averne una.** `Aspit` → *"associazione
  bar/ristorazione in Emilia"*: falso, ed è un'azienda di trasporti.
- **Non è coerente fra un lotto e l'altro.** `Aspit` e `Aspit Campogalliano`, stessi dati,
  classificazioni opposte, perché ogni chiamata non sa cosa ha risposto la precedente.
- **Il flag `sicuro: false` funziona** e compare su quasi tutte le voci discutibili. È la valvola
  che rende il resto accettabile.

### Prova manuale della Fase 4, sotto i 5 minuti

1. `/debug/sync` → **`4 · Categorizza`**. Attesi ≈94% in euro e ≈98% in movimenti.
2. Rilanciare: gli stessi numeri, nessuna riga cambiata. È idempotente.
3. `/revisione`: la lista mostra solo le etichette che tornano almeno due volte, con accanto quante
   ne nasconde e quanto valgono.
4. Assegnare un'etichetta a un esercente: la copertura sale nella riga di esito, e l'etichetta
   sparisce dalla lista.

I tre meccanismi che producono quei 141 giroconti sono indipendenti e non sostituibili l'uno
all'altro:

1. **riferimento condiviso fra due conti collegati** — prova strutturale, non interpreta niente;
2. **causale `To`/`From` + sigla di valuta o nome di un conto proprio** — vede i pocket, di cui
   registriamo un lato solo;
3. **controparte dichiarata in `own_counterparties`** — vede i conti non collegati, che nessuna
   delle prime due può raggiungere.

L'idempotenza è verificata nel modo che conta: due normalizzazioni consecutive sull'intero storico
lasciano 581 righe e nessun inserimento.

### Le decisioni della Fase 5

#### Due numeri, non uno: abbonamenti e abitudini

La metrica principale è divisa in due righe per classe di discrezionalità, e **non si sommano mai**.
Non è una scelta grafica: rispondono a due azioni diverse. Un abbonamento si disdice — è un gesto,
si fa una volta, il risparmio è certo. Un'abitudine si cambia, e cambiare un'abitudine non è un
gesto. Un totale unico nasconderebbe quale delle due è possibile.

Il confine **non lo indovina una statistica**: sta in `merchants.is_subscription`, dichiarato in
Fase 4 e correggibile da `/revisione`. Nessun numero distingue un contratto da una consuetudine —
`Bar Fucsia` e `Netflix` possono avere le stesse identiche statistiche. Un abbonamento nuovo che
nessuno ha ancora marcato finisce fra le abitudini: visibile e contato, non perso.

#### Regolarità nel tempo e stabilità dell'importo sono due domande diverse

La prima versione le moltiplicava in un solo coefficiente e richiedeva entrambe sopra 0,5. Il
risultato è stato che **la metrica escludeva proprio gli abbonamenti più cari**: Anthropic (0,28),
Google Workspace (0,18), OpenRouter (0,11), Google Cloud, Byteplus. Sono servizi a consumo —
fatturati ogni mese, importo variabile — e passavano la prima domanda per essere bocciati dalla
seconda. Anthropic da solo valeva la metà della metrica intera e restava fuori.

Ora sono due colonne (`confidence` = tempo, `amount_stability` = importo), **nessuna delle due
filtra niente**, ed entrambe restano visibili come indicatori di qualità. Quello che filtra è la
presenza: tre mesi civili distinti.

#### Il costo mensile: un'osservazione, non un'estrapolazione

Due formule, e quale si applica dipende da quanto la serie è regolare davvero:

- **canone fisso** (`is_subscription`, cadenza riconosciuta, regolarità ≥ 0,9 e stabilità ≥ 0,95) →
  `importo_tipico × 30,44 / giorni_cadenza`. Netflix deve dire **6,99**: un numero che non si
  riconosce non si crede.
- **tutto il resto** → `totale realmente speso × 30,44 / giorni coperti`. Nessuna cadenza da
  assumere, quindi non si estrapola.

`importo_tipico` è la **mediana**, non l'ultimo importo: un rinnovo con un credito applicato non
deve diventare il prezzo. `expected_amount` resta l'ultimo importo perché risponde a un'altra
domanda — quanto arriverà la prossima volta — ed è il riferimento della Fase 8 per gli aumenti.

#### Estrapolare da un intervallo mediano produce cifre assurde

Il difetto più grave della prima versione, e vale la pena ricordarlo perché è generale.
`Bar Fucsia`: 5 movimenti in 7 mesi, quattro ravvicinati e uno lontano. L'intervallo **mediano** è
7 giorni, quindi la cadenza risultava settimanale e il costo `21,60 × 4,35 = 93,93 €/mese`. Il
valore vero è circa 15. Sommando 45 esercenti così, la vista delle escluse dichiarava
**8.966 €/mese** — più di tutta la spesa mensile reale, che è 3.640.

Due lezioni: la mediana è robusta a un ritardo ma **cieca ai raggruppamenti**, e un tasso mensile
per qualcosa che non copre mesi non esiste. Sotto tre mesi di presenza `costo_mensile` è `null`, e
si mostra `total_amount`, che è misurato.

#### Tre mesi civili possono essere ventinove giorni

La regola «presente in almeno tre mesi civili» voleva dire *"deve aver attraversato tre mesi"*.
Ma **i mesi civili non misurano il tempo**: il 31 gennaio, il 1° febbraio e il 1° marzo sono tre
mesi civili e ventinove giorni.

Sui dati veri `Byteplus` ci è passato attraverso: 10 addebiti, tre mesi civili, **64 giorni**
coperti, e 455 € spesi diventavano 216 €/mese — il 42% di tutto il `utile/business`, proiettato da
due mesi scarsi di osservazione. La regola era scritta nell'unità di misura sbagliata, ed è per
questo che il difetto non si vedeva rileggendola.

Ora servono anche **75 giorni coperti**. Non è una soglia in più: è la stessa, detta in modo che
misuri ciò che intendeva.

Il criterio completo vive in **una colonna sola**, `v_subscriptions.nella_metrica`. Prima era
scritto in tre posti — le due viste e il filtro della schermata — e tre copie della stessa regola
possono divergere senza che niente lo segnali: la schermata mostrerebbe righe che il totale non
conta. La colonna è anche ciò che il copilot della Fase 10 leggerà, invece di reimplementare il
criterio una quarta volta.

### Numeri di chiusura della Fase 5

Misurati il 12 agosto 2026 su tutto lo storico. Servono da riferimento: se una modifica li sposta,
o c'è una ragione esplicita, o è una regressione.

| Grandezza | Valore |
| --------- | ------ |
| Ricorrenze rilevate | 85 |
| Entrano nella metrica | 43 |
| **Abbonamenti** | **−425,96 €/mese** su 14 voci |
| **Abitudini** | **−1.610,17 €/mese** su 29 voci |
| Totale ricorrente | −2.036,13 €/mese |
| Spesa reale media, mesi pieni feb–lug 2026 | −2.959,24 €/mese |
| Quota ricorrente | **68,8%** della media, 51–56% di giugno e luglio |

Escluse: 33 esercenti fermi da tempo (−4.889,66 € spesi in tutto), 7 sotto i tre mesi di presenza
(−218,10 €), 2 sotto i 75 giorni coperti (−480,34 €, cioè Byteplus e un bar).

**La verifica che conta** è l'ultima riga: il costo ricorrente sta dentro la spesa reale con
margine. Il confronto va fatto con i mesi recenti e non con la media di tutto lo storico — un
esercente comparso ad aprile contribuisce col suo tasso pieno anche se a febbraio non esisteva, ed
è il motivo per cui il ricorrente (2.036) supera l'intera spesa di febbraio (1.407) senza che sia
una contraddizione.

#### Cosa dicono i numeri, che è il punto di tutto

**Voluttuario ricorrente: 606,15 €/mese.** Di cui **71,43 in abbonamenti e 534,72 in abitudini**:
sette volte tanto. Disdire tutti e cinque gli abbonamenti voluttuari libererebbe 71 € al mese.
Lo spreco ricorrente non sta lì.

Ma metà del voluttuario abituale sono **viaggi**: `Booking.com` da solo vale 266,50 €/mese, con 4
prenotazioni in 3 mesi. Un viaggio non è un'abitudine, è una spesa episodica che capita di essere
concentrata — e nessun criterio basato sul tempo può distinguerli. Va saputo prima di leggere quel
numero come "spreco".

Tolti i viaggi restano ~245 €/mese, e **metà è `Deliveroo`**: 129,76 €/mese, **59 ordini**,
1.108 € in nove mesi. Quella è un'abitudine vera, ed è la risposta più azionabile che l'app abbia
prodotto. Nessuna disdetta la tocca: è esattamente la ragione per cui i due numeri sono separati.

`Affitto` risulta **abitudine** perché nessuno gli ha messo `is_subscription` — un affitto è il
contratto ricorrente per eccellenza, e marcarlo sposta 358,22 €/mese fra gli abbonamenti. Da
guardare anche il merito: cinque pagamenti in undici mesi, mediana 500 € ma totale 4.160 €.

### Prova manuale della Fase 5, sotto i 5 minuti

1. `/debug/sync` → **`6 · Rileva abbonamenti`**. Attesi 85 rilevate, 43 nella metrica, e i due
   totali qui sopra.
2. Rilanciare: gli stessi numeri. È idempotente — la funzione ricalcola tutto da capo.
3. `/abbonamenti`: due blocchi separati, `Netflix` deve dire **6,99** (se dicesse 6,45 il ramo del
   canone si è rotto), e la casella «mostra anche le escluse» deve far comparire 42 righe.
4. Dare un giudizio d'uso a una riga e marcarne una come disdetta, poi rilanciare il rilevamento:
   `usage_verdict`, `notes` e lo stato `cancelled` devono sopravvivere.

### Le decisioni della Fase 6

#### Gli aggregati usano `amount_eur`, non `amount`

La valuta di riferimento è l'euro, e una somma che mescola valute è sbagliata comunque la si guardi.
Oggi i due coincidono, perché l'unico conto con `include_in_totals` è in euro — ed è **proprio per
questo** che va scritto adesso: il giorno in cui si collega Intesa, o un pocket in valuta entra nei
totali, sommare `amount` produrrebbe un numero plausibile e falso, senza nessun errore.

Dove `amount_eur` è nullo il movimento **non si somma**: sparirebbe dal totale in silenzio. Viene
contato in `v_monthly_totals.senza_cambio` e il cruscotto lo mostra come avviso.

**Resta disallineato il detector della Fase 5**, che somma `amount`. Oggi dà lo stesso numero. Da
allineare, ma non insieme ad altro: sposterebbe i numeri di chiusura appena verificati.

#### Il mese è testo `YYYY-MM`, mai un `Date`

`new Date('2026-07-01')` è mezzanotte UTC, che in `Europe/Rome` d'estate sono le 02:00 del primo:
sottrarre un mese con `setMonth` e rileggere il risultato in ora locale riporta al 30 giugno. È la
stessa conversione che le regole di correttezza vietano su `booking_date`, per la stessa ragione.
Con anno e mese come interi la domanda «qual è il mese prima di luglio 2026» ha una sola risposta.

#### Il roll-up dell'albero ha un limite di profondità

`categories.parent_id` è modificabile, e in Fase 10 lo modificherà un copilot. Un ciclo — anche
creato per sbaglio — farebbe girare la CTE ricorsiva all'infinito. Dieci livelli sono molti più di
quanti ne serva una tassonomia di spese, e il limite è stato provato in locale creando un ciclo
vero.

#### Il mese sta nell'indirizzo, non in uno stato del browser

`/?mese=2026-07`. Così la pagina resta un componente server — nessun aggregato attraversa la rete
per essere ricalcolato in JavaScript — e un mese si può mandare a sé stessi come collegamento.

### Questa applicazione si guarda dal telefono

Non è una preferenza estetica: il flusso previsto è «faccio il pagamento, mi arriva la notifica,
tocco per vedere e confermare». Il desktop è il posto dove la si costruisce, non dove la si usa.

Conseguenze vincolanti, da rispettare in ogni schermata nuova:

- **44 pixel** è l'altezza minima di qualunque cosa si tocchi. È il minimo di iOS e Android, e i
  controlli scritti guardando uno schermo grande finiscono naturalmente a venti: si cliccano
  benissimo col mouse e si sbagliano col pollice. Le misure stanno in `src/lib/ui/controlli.ts`,
  in un posto solo — quattro copie della stessa altezza divergono alla prima modifica, e la
  schermata che resta indietro è sempre quella che si usa meno, cioè quella che nessuno prova.
- **Niente tabelle larghe.** La tabella degli abbonamenti aveva otto colonne, e otto colonne su un
  telefono significano scorrimento laterale: si legge il nome oppure l'importo, mai i due insieme.
  È diventata una scheda che si allarga in griglia dove c'è spazio, invece di chiedere allo schermo
  di adattarsi a una forma pensata per un altro schermo.
- **`env(safe-area-inset-*)` nel layout.** Aggiunta alla schermata iniziale l'app si apre a schermo
  pieno: senza quei margini l'intestazione finisce sotto l'orologio e l'ultima riga sotto la barra
  dei gesti.
- **`overflow-x-hidden` sul `body`.** Un nome lunghissimo non deve poter far scorrere lateralmente
  l'intera pagina.

#### Come si verifica, invece di guardare a occhio

Uno screenshot headless taglia l'immagine e fa sembrare che il contenuto sbordi anche quando non è
vero: è successo, e ha quasi portato a "correggere" un layout corretto. La misura che vale è
`document.documentElement.scrollWidth` confrontato con `window.innerWidth`, più l'altezza di ogni
bersaglio toccabile, su 360, 375 e 414 px. Con Chromium già presente in ambiente bastano
`playwright-core` e venti righe di script.

Stato misurato a fine Fase 6: **nessun elemento sborda** a nessuna delle tre larghezze, e l'unico
bersaglio sotto i 44 px è la casella di spunta, la cui etichetta è alta 44 e toccandola la commuta.

### Le decisioni della Fase 6-bis

#### Righe e totale devono uscire dalla stessa query

`cerca_movimenti()` restituisce le righe **e** i totali dell'intero insieme filtrato, con
`count(*) over ()` e `sum(...) over ()` — che si calcolano dopo il `where` e prima del `limit`.

Due query separate sarebbero due copie della stessa condizione, e potrebbero divergere senza che
niente lo segnali: il sintomo sarebbe una lista che mostra righe che il totale in cima non conta.
È lo stesso ragionamento della colonna `nella_metrica` in Fase 5 — una regola scritta in un posto
solo non può divergere da sé stessa.

#### Ogni riga dice perché non è nella spesa

`fuori_dalla_spesa` vale `giroconto`, `rimborso`, `conto fuori dai totali`, `escluso dall'analisi`,
`entrata`, `importo zero`. È l'informazione che finora si è sempre dovuta cercare con una query
scritta a mano, ed è ciò che rende la lista uno strumento di verifica invece che un elenco.

#### Le RPC vanno dichiarate a `text` sugli importi

PostgREST serializza `numeric` come **numero JSON**, quindi float. Sulle viste il problema si evita
chiedendo `::text` nella select, ma da una funzione il chiamante non può: il cast va nella firma.
Far passare un importo da un float esattamente nell'ultimo trasferimento vanificherebbe tutta la
catena in centesimi.

#### Un mese in corso non si confronta con un mese intero

`−996,14 €` accanto a `−72,6% su luglio` si legge come «ho speso molto meno», ed è falso: sono
undici giorni contro trentuno. La tentazione è proiettare — «a questo ritmo spenderai X» — ma è
un'estrapolazione travestita da informazione, lo stesso errore che in Fase 5 dichiarava
8.966 €/mese di spesa inesistente.

La risposta è `spesa_nei_primi_giorni()`: **la stessa finestra** nei mesi precedenti. Due misure,
non una previsione. Il termine di paragone è la mediana **scelta** (`percentile_disc`, e in
TypeScript la selezione dell'elemento centrale), mai la media: su un numero pari di mesi la media
produrrebbe un valore che non è mai stato speso in nessun mese, e come riferimento serve un numero
vero.

### Prova manuale della Fase 6-bis, sotto i 5 minuti

1. `/` in cima: la riga di stato con i giorni al rinnovo del consenso. Se mancano meno di trenta
   giorni diventa un riquadro arancione, se è scaduto rosso. **È la difesa contro il guasto che
   non si vedrebbe.**
2. Sotto il totale, le entrate e la spesa come loro quota. Se sembra troppo alto c'è un giroconto
   in entrata non marcato: `/movimenti?tipo=giroconti` lo trova.
3. `/movimenti` filtrato su luglio, tipo *spese reali*: **−3.640,32 €** su 132 movimenti, gli
   stessi del cruscotto. Se i due percorsi divergono è una regressione.
4. Toccare una categoria apre `/categoria/[id]` col mese conservato; toccare un esercente apre la
   sua scheda con l'andamento mensile e l'origine della classificazione.
5. Nel mese in corso, al posto della percentuale compare il confronto sugli stessi giorni dei mesi
   precedenti.

### Prova manuale della Fase 6, sotto i 5 minuti

1. `/` si apre sull'**ultimo mese con dati**, non sul mese corrente: il primo del mese un cruscotto
   vuoto sembra rotto.
2. Luglio 2026 deve dire **−3.640,32 €**. È il numero verificato al centesimo contro l'app della
   banca in Fase 3: se si sposta è una regressione.
3. Nell'albero, una categoria padre vale la somma delle figlie più la propria spesa diretta.
4. Dal telefono: nessuna schermata scorre lateralmente, e i tre giudizi d'uso su `/abbonamenti` si
   premono col pollice senza sbagliare.

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
- **Una vista definita con `t.*` congela le colonne alla creazione.** Aggiungere una colonna alla
  tabella non la fa comparire nella vista, e la query che la usa fallisce con
  `column "x" does not exist` — che sembra un errore di battitura e non lo è. Ogni colonna nuova su
  `transactions` che debba arrivare fino agli aggregati impone di ricreare `v_expenses` e tutto ciò
  che ci sta sopra, in ordine di dipendenza e senza `cascade`: `cascade` porterebbe via anche viste
  che la migration non ricrea, e il danno si scoprirebbe solo alla prima query che non trova più
  niente.
- **Una migration si prova prima di mandarla.** Postgres è disponibile in locale: `initdb` in una
  cartella temporanea, gli stub delle tabelle che servono, e la si applica **due volte** — la
  seconda dice se è rieseguibile. Le migration 0007 e 0014 sono fallite sull'ambiente vero per
  difetti che questa prova avrebbe trovato in trenta secondi.
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
