# Il cruscotto — struttura e funzioni

> Documento di progetto. Descrive **cosa deve essere** il cruscotto, non cosa è oggi.
> La Fase 6 ne ha costruito il primo strato; questo è il disegno completo di cui quello strato
> è una parte, e serve a decidere cosa costruire dopo e in che ordine.

---

## 0. Il metro con cui giudicare ogni schermata

L'applicazione esiste per produrre un numero:

> **Costo ricorrente mensile per classe di discrezionalità.**

Ogni pezzo di cruscotto deve superare uno di questi due esami, e se non ne supera nessuno non va
costruito:

1. **contribuisce al numero** — lo calcola, lo scompone, lo rende azionabile;
2. **contribuisce alla fiducia nel numero** — lo verifica, ne mostra i limiti, ne segnala le
   esclusioni.

Il secondo esame è quello che si dimentica, ed è quello che decide se un cruscotto viene guardato
dopo il primo mese. Un numero che non si può verificare si smette di guardare alla prima cifra che
sorprende.

Un terzo criterio, che non è un esame ma un vincolo: **si guarda dal telefono.** Il flusso previsto
è «faccio il pagamento, mi arriva la notifica, tocco per vedere e confermare». Il desktop è dove
questa applicazione si costruisce, non dove si usa.

---

## 1. Cosa c'è oggi

| Superficie | Cosa risponde | Stato |
| --- | --- | --- |
| `/` cruscotto | quanto ho speso questo mese, in cosa, da chi | costruita in Fase 6 |
| `/abbonamenti` | quanto costa al mese ciò che si ripete | costruita in Fase 5 |
| `/revisione` | quali etichette ed esercenti mancano di classificazione | costruita in Fase 4 |
| `/debug/sync` | la sequenza operativa: scarica, normalizza, categorizza, rileva | costruita in Fase 2–5 |

Quattro superfici, e nessuna delle quattro mostra **una transazione**.

---

## 2. Il buco più grande: non esiste una lista dei movimenti

Ogni discesa dell'applicazione finisce su un aggregato. Dal totale del mese si scende alla classe di
discrezionalità, dalla classe alla categoria, dalla categoria all'esercente — e lì si ferma. Sotto
l'esercente c'è il vuoto.

Non è una mancanza cosmetica. Ne discendono tre impossibilità concrete:

**Non si può verificare.** «Deliveroo, 59 movimenti, −1.108 €» è una cifra che si può solo credere o
non credere. Per confrontarla con l'app della banca servono i 59 movimenti, con la data e l'importo.
Ogni volta che in questo progetto un numero è stato verificato — luglio al centesimo, la
riconciliazione col CSV, i giroconti — è stato scomponendolo fino alla singola riga, e sempre con
una query scritta a mano perché l'applicazione non lo permette.

**Non si può correggere una singola transazione.** Lo schema prevede `discretion`, `context`,
`notes` e `manually_categorized` **per riga**, e il flag blocca ogni sovrascrittura automatica
successiva. Quel meccanismo esiste, è progettato, ed è irraggiungibile: non c'è nessuna schermata da
cui usarlo. È esattamente il caso del computer comprato da Euronics per lavorare — `investimento` e
`business` — contro la sciocchezza comprata nello stesso negozio.

**Non si può fare la conferma di fine giornata.** L'idea registrata in `CLAUDE.md` — a fine giornata
l'app mostra i movimenti nuovi e propone la sua classificazione — è una lista di transazioni con dei
bottoni sopra. Senza la lista, non esiste.

**La lista dei movimenti è il pavimento dell'applicazione.** Tutto il resto è un piano costruito
sopra di essa, e finora è stato costruito senza.

---

## 3. La struttura proposta

Cinque superfici, ognuna con una domanda sola. Se una schermata risponde a due domande, sono due
schermate.

```
Oggi          → cosa devo sapere adesso, e cosa devo confermare
  Mese        → quanto ho speso, e in cosa
    Categoria → dentro un ramo di spesa
      Esercente → tutto quello che è passato da qui
        Movimento → la singola riga, e la sua correzione
  Ricorrente  → quanto torna ogni mese, e cosa si può disdire
  Movimenti   → la lista completa, cercabile e filtrabile
  Revisione   → cosa manca alla macchina per essere affidabile
```

Le prime due righe di questo albero sono la navigazione principale; le altre si raggiungono
toccando. **Ogni aggregato deve essere toccabile e portare a ciò di cui è la somma.** È la regola
che rende un cruscotto verificabile invece che decorativo.

---

## 4. Le superfici, una per una

### 4.1 Oggi — la schermata di apertura

Oggi l'app si apre sul mese corrente. È la scelta sbagliata: il mese corrente è un numero parziale,
e il primo del mese è quasi vuoto. Aprire su un numero parziale insegna a non fidarsi del numero.

**Cosa deve mostrare, in ordine:**

1. **La risposta.** Costo ricorrente mensile per classe: due righe, abbonamenti e abitudini, mai
   sommate. È il numero per cui l'applicazione esiste e va per primo, non dopo tre grafici.
2. **Cosa richiede un gesto.** I movimenti nuovi da confermare, gli esercenti mai visti, le
   proposte del modello non ancora confermate. Con il conteggio, non con un pallino: «7 movimenti
   di ieri da confermare» è un invito, un pallino rosso è un'ansia.
3. **Lo stato del sistema.** *Vedi 5.4: è la cosa che oggi manca e che costa di più.*
4. **Il mese in corso**, ma detto onestamente: non «−996,14 €» accanto a «−72,6% su luglio», bensì
   «−996,14 € nei primi 11 giorni — nello stesso periodo dei tre mesi precedenti: −1.240, −890,
   −1.510». Un confronto fra periodi omogenei è una misura; un confronto fra 11 giorni e 31 è un
   errore di lettura garantito.

### 4.2 Mese — il cruscotto attuale

Quello costruito in Fase 6, con quattro correzioni:

- **Il confronto va fatto con la mediana degli ultimi sei mesi**, non col mese precedente. Un solo
  mese di riferimento è rumore: luglio contro giugno dice −8,7%, che non significa niente. Contro
  la mediana significa qualcosa.
- **Le categorie devono essere toccabili.** Oggi l'albero è una fotografia; deve essere una porta.
- **Gli esercenti anche**, e portano alla scheda esercente (4.5).
- **Il mese in corso va marcato in ogni numero che lo riguarda**, non solo nel titolo.

### 4.3 Ricorrente

Costruita in Fase 5 e sostanzialmente completa. Manca:

- **la storia di un abbonamento**: i suoi addebiti nel tempo, che è come si vede un aumento di
  prezzo prima che lo dica un alert;
- **`cancel_url`**, che è nello schema e non è mai usato. «Non lo uso» dovrebbe portare al posto
  dove si disdice, o il giudizio resta un'annotazione senza conseguenze.

### 4.4 Movimenti — la lista che manca

La superficie nuova più importante. Requisiti:

- **Filtri**: periodo, categoria, esercente, classe di discrezionalità, contesto, conto, e i tre
  interruttori che oggi sono invisibili — giroconti, rimborsi, esclusi dall'analisi.
- **Ricerca** sul nome dell'esercente e sulla causale.
- **Ordinamento** per data e per importo. Per importo è quello che serve: la spesa che conta è in
  cima, non in fondo.
- **Il totale di ciò che è filtrato**, sempre visibile. Una lista filtrata senza il suo totale
  costringe a sommare a mente.
- **Ogni riga mostra**: data, esercente, importo, categoria, classe, e un segno per `pending`,
  `manually_categorized`, `is_transfer`.

**La riga si apre** su una scheda con: la causale grezza, il conto, il codice della banca, il
riferimento, e le correzioni possibili — cambia categoria, cambia discrezionalità, cambia contesto,
scrivi una nota, escludi dall'analisi, marca come giroconto o come rimborso.

Ogni correzione scrive `manually_categorized = true` e da lì la riga è intoccabile
dall'automatismo. **È il patto**: le correzioni dell'utente sono sacre, e questa è la schermata dove
si esercitano.

### 4.5 Le schede di dettaglio

**Esercente**: tutti i movimenti, il totale, l'andamento mensile, la classificazione corrente con la
sua origine (`alias`, `ai`, `manuale`) e la motivazione, e se è una ricorrenza il collegamento alla
sua riga. È la schermata che risponde a «quanto mi costa Deliveroo», che è una domanda che si fa
davvero.

**Categoria**: gli esercenti che la compongono, l'andamento nel tempo, le sottocategorie. Serve a
rispondere a «perché gli alimentari sono saliti».

### 4.6 Revisione

Esiste. Va aggiunta una cosa: **la copertura in cima**. 94,0% in euro e 98,2% in movimenti sono i
numeri che dicono quanto ci si può fidare di tutto il resto, e stanno in una riga di esito che
sparisce al primo ricaricamento.

---

## 5. Le liste che mancano, e perché ognuna serve

### 5.1 I movimenti

Trattata sopra. È la prima cosa da costruire.

### 5.2 I giroconti

Sono il **23,8%** dei movimenti e non sono visibili da nessuna parte. Non è un dettaglio contabile:
il giorno in cui l'`eb_account_uid` è ruotato e i conti si sono sdoppiati, i giroconti sono passati
dal 24% al 59% e **metà della spesa reale è sparita dalle analisi in silenzio**. Nessun errore,
nessun avviso, solo numeri più bassi.

Serve una lista dei movimenti marcati `is_transfer`, con il motivo per cui sono stati marcati:
riferimento condiviso fra due conti, causale `To`/`From`, controparte dichiarata in
`own_counterparties`, o movimento speculare. Il totale di quella lista, guardato una volta al mese,
è l'unica difesa contro il ripetersi di quel guasto.

### 5.3 Le correzioni manuali

Ogni riga con `manually_categorized = true` è una decisione presa da una persona, e le decisioni si
rivedono. Serve poterle elencare — anche solo per accorgersi di averne presa una sbagliata sei mesi
fa e averla dimenticata.

### 5.4 Lo stato del sistema

**È la mancanza che costa di più**, ed è la più economica da colmare.

`bank_connections.valid_until` esiste nello schema e non è mostrato da nessuna parte. Il consenso
Enable Banking scade — 180 giorni sul connettore Revolut — e quando scade **i dati semplicemente
smettono di arrivare**. Il cruscotto continuerebbe a mostrare numeri, sempre più vecchi, senza dire
niente. È il guasto peggiore possibile per un'applicazione che esiste per essere creduta.

Serve, in cima a *Oggi*:

- ultima sincronizzazione riuscita, e quanti giorni fa;
- data dell'ultimo movimento presente (che non è la stessa cosa);
- scadenza del consenso, con un avviso quando mancano meno di trenta giorni;
- l'ultima sincronizzazione fallita, se ce n'è una.

### 5.5 Il confronto omogeneo

Non è una lista ma un modo di calcolare, e va scritto una volta in SQL: **i primi N giorni del mese
in corso contro i primi N giorni dei mesi precedenti.** È una misura, non una proiezione, e risolve
il problema del mese parziale senza estrapolare niente — coerente con la regola già imparata in
Fase 5, dove estrapolare da un intervallo mediano produceva 8.966 €/mese di spesa inventata.

---

## 6. Regole di presentazione dei numeri

Sono vincoli, non stile. Ognuna nasce da un errore già commesso in questo progetto.

**Mai un numero senza il suo denominatore.** «−425,96 €/mese di abbonamenti» va accanto a «su 14
voci, su una spesa mensile media di 2.959 €». Una cifra sola non si sa se è tanto.

**Mai un'esclusione silenziosa.** Ogni vista che filtra deve avere accanto la sua vista di ciò che
ha escluso e quanto vale. `v_ricorrenze_escluse` esiste per questo; la stessa cosa serve per i
giroconti e per i movimenti senza cambio.

**Misurare invece di estrapolare.** Quando una cadenza non c'è, non si assume: si divide ciò che è
uscito per il tempo in cui è uscito. Vale per il costo mensile di un'abitudine e vale per il mese
in corso.

**Un mese parziale non si confronta con un mese intero.** Mai. Se il confronto non può essere
omogeneo, non si mostra.

**Il segno non si perde mai.** Le uscite sono negative in tutta l'applicazione, database compreso.
Nessun `Math.abs()` sparso: si normalizza una volta in ingestion.

**Ogni aggregato è toccabile.** Un numero da cui non si può scendere è un numero che si può solo
credere.

---

## 7. Cosa il cruscotto non deve avere

Elencato perché il modo tipico di rovinare un cruscotto è aggiungerci cose ragionevoli.

- **Grafici decorativi.** Torte, aree, doppi assi. Una barra proporzionale accanto a una cifra basta
  a dare la scala; il resto occupa lo schermo di un telefono senza aggiungere una risposta.
- **Il patrimonio netto.** Richiederebbe i saldi, gli investimenti, i debiti. È un'altra
  applicazione, e non risponde a «dove sto sprecando».
- **Le previsioni.** «A questo ritmo spenderai X» è un'estrapolazione travestita da informazione.
  Il confronto omogeneo fra periodi dà la stessa risposta ed è misurato.
- **Le medie di categoria confrontate con altri utenti.** Non esistono altri utenti.
- **Qualunque numero calcolato in TypeScript.** Le aggregazioni stanno in SQL, sempre — anche
  perché il copilot della Fase 10 potrà usare una vista e non potrà usare un `reduce`.

---

## 8. Le domande aperte

Non hanno una risposta ovvia e cambiano cosa si costruisce.

**Le entrate.** Oggi l'applicazione vede solo le uscite: `v_expenses` filtra `amount < 0`. Senza le
entrate non si può dire «ho risparmiato», si può solo dire «ho speso». Tracciarle apre a un
rapporto spesa/entrate che è la domanda naturale successiva, ma allarga l'oggetto
dell'applicazione.

**I budget.** La tabella `budgets` è nello schema fin dall'inizio e non è mai stata usata. Una
soglia per classe di discrezionalità — «voluttuario ricorrente sotto i 400 €/mese» — trasformerebbe
la metrica da osservazione a obiettivo. Ma un budget sbagliato si ignora dopo due settimane, e
diventa rumore.

**Il momento della conferma.** L'idea di fine giornata è registrata. Va decisa la forma: una
schermata che si visita, oppure una notifica che arriva. La seconda richiede la Fase 7 e un
service worker.

**La granularità della correzione.** Correggere una singola transazione è previsto dallo schema. Ma
quanto spesso serve davvero, rispetto a correggere l'esercente una volta per tutte? Se il caso vero
è raro, la schermata movimento può restare essenziale.

---

## 9. Ordine di costruzione proposto

Ogni riga è un passo che si chiude e si prova da solo.

| # | Cosa | Perché in questa posizione |
| --- | --- | --- |
| 1 | **Stato del sistema** in cima a *Oggi* | costa poco e protegge da un guasto silenzioso |
| 2 | **Lista movimenti** con filtri, ricerca e totale | è il pavimento; senza, niente sopra si verifica |
| 3 | **Scheda movimento** con le correzioni | rende raggiungibile `manually_categorized` |
| 4 | **Aggregati toccabili** — categoria ed esercente aprono | trasforma il cruscotto in qualcosa in cui si scende |
| 5 | **Schede esercente e categoria** | rispondono alle domande che si fanno davvero |
| 6 | **Confronto omogeneo** fra periodi | rende leggibile il mese in corso |
| 7 | **Lista giroconti** | difesa contro il guasto peggiore già visto |
| 8 | **Home *Oggi*** che riordina tutto | ha senso solo quando i pezzi esistono |

I punti 1 e 2 valgono da soli più di tutti gli altri messi insieme.
