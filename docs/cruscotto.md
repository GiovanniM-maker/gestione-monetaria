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

| Superficie        | Cosa risponde                                                            | Stato                     |
| ----------------- | ------------------------------------------------------------------------ | ------------------------- |
| `/` cruscotto     | quanto ho speso questo mese, in cosa, da chi                             | Fase 6, ampliata in 6-bis |
| `/movimenti`      | la lista completa, filtrabile e cercabile, col totale del filtro         | **Fase 6-bis**            |
| `/movimenti/[id]` | la singola riga, in sola lettura                                         | **Fase 6-bis**            |
| `/esercente/[id]` | quanto mi costa questo esercente, e da dove viene la sua classificazione | **Fase 6-bis**            |
| `/categoria/[id]` | cosa c'è dentro questo ramo, e come si muove                             | **Fase 6-bis**            |
| `/abbonamenti`    | quanto costa al mese ciò che si ripete                                   | Fase 5                    |
| `/revisione`      | quali etichette ed esercenti mancano di classificazione                  | Fase 4                    |
| `/debug/sync`     | la sequenza operativa: scarica, normalizza, categorizza, rileva          | Fase 2–5                  |

**Il buco descritto nella sezione 2 è colmato.** Il testo resta perché la
lezione vale oltre il caso: ogni aggregato deve poter essere sceso fino alla
riga, o si può solo credere.

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
Mese          → quanto ho speso, e in cosa          ← la schermata di apertura
  Categoria   → dentro un ramo di spesa
    Esercente → tutto quello che è passato da qui
      Movimento → la singola riga
Ricorrente    → quanto torna ogni mese, e cosa si può disdire
Movimenti     → la lista completa, cercabile e filtrabile
Revisione     → cosa manca alla macchina per essere affidabile
```

Le quattro voci a sinistra sono la navigazione principale; le rientrate si raggiungono
toccando. **Ogni aggregato deve essere toccabile e portare a ciò di cui è la somma.** È la regola
che rende un cruscotto verificabile invece che decorativo.

---

## 4. Le superfici, una per una

### 4.1 La schermata di apertura resta il mese

**Deciso**: l'app continua ad aprirsi sul cruscotto del mese corrente, non su una schermata _Oggi_
separata. La domanda quotidiana è «quanto ho speso finora», e metterla dietro un tocco per
guadagnare una schermata di riepilogo sarebbe un peggioramento.

Le tre cose che una schermata _Oggi_ avrebbe portato vanno quindi **in cima al cruscotto del mese**,
sopra il totale:

1. **Lo stato del sistema.** Una riga sola quando va tutto bene, un avviso quando no.
   _Vedi 5.4: è la cosa che oggi manca e che costa di più._
2. **Cosa richiede un gesto**, quando c'è: «7 movimenti di ieri da confermare». Con il conteggio e
   non con un pallino — un numero è un invito, un pallino rosso è un'ansia.
3. **Il costo ricorrente** resta dov'è, secondo blocco, perché risponde a una domanda diversa da
   quella del mese e non va confuso con essa.

Il mese in corso va marcato in **ogni numero che lo riguarda**, non solo nel titolo. Oggi
`−996,14 €` sta accanto a `−72,6% su luglio`, e quel confronto si legge come «ho speso molto meno»,
che è falso: sono undici giorni contro trentuno. Finché il confronto non è omogeneo (5.6), va tolto
o riscritto.

### 4.2 Mese — il cruscotto attuale

Quello costruito in Fase 6, con tre correzioni oltre a quelle di 4.1:

- **Il confronto va fatto con la mediana degli ultimi sei mesi**, non col mese precedente. Un solo
  mese di riferimento è rumore: luglio contro giugno dice −8,7%, che non significa niente. Contro
  la mediana significa qualcosa.
- **Le categorie devono essere toccabili.** Oggi l'albero è una fotografia; deve essere una porta.
- **Gli esercenti anche**, e portano alla scheda esercente (4.5).

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

**La riga si apre** su una scheda che mostra ciò che l'aggregato nasconde: la causale grezza, il
conto, il codice della banca (`CARD_PAYMENT`, `TRANSFER`, …), il riferimento, lo stato
`pending`/`booked`, e come è stata classificata — per alias, dal modello, o a mano.

La scheda nasce **in sola lettura** (decisione in 8). Quando le correzioni arriveranno, ognuna
scriverà `manually_categorized = true` e da lì la riga sarà intoccabile dall'automatismo: è il
patto già scritto nelle regole di correttezza, e questa sarà la schermata dove si esercita.

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

Serve, in cima a _Oggi_:

- ultima sincronizzazione riuscita, e quanti giorni fa;
- data dell'ultimo movimento presente (che non è la stessa cosa);
- scadenza del consenso, con un avviso quando mancano meno di trenta giorni;
- l'ultima sincronizzazione fallita, se ce n'è una.

### 5.5 Le entrate, come contesto

**Deciso**: si tracciano, ma come **denominatore e non come oggetto**. Non cambiano la metrica
principale — l'app continua a rispondere a «dove sto sprecando» e non a «quanto risparmio».

Serve una riga sul cruscotto: entrate del mese, e la spesa come quota di esse. La ragione è che
«606 €/mese di voluttuario ricorrente» significa cose molto diverse su entrate da 2.000 o da 6.000,
e senza il denominatore quel numero non si sa se è tanto — che è la prima delle regole di
presentazione qui sotto.

Costa poco: i movimenti positivi sono già nel database, esclusi solo da `v_expenses`. Serve una
vista compagna, `v_monthly_income`, con la stessa struttura e gli stessi filtri al contrario, e
attenzione a un punto: **i giroconti in entrata non sono entrate.** Un rientro dal conto deposito
sarebbe contato come reddito, e il denominatore diventerebbe falso proprio come lo era la classifica
delle uscite prima di `is_transfer`.

### 5.6 Il confronto omogeneo

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

## 8. Le decisioni prese

Prese il 12 agosto 2026, dopo il primo inventario.

| Domanda                                  | Decisione                  | Conseguenza                                                                                                                                  |
| ---------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entrate**                              | sì, ma **come contesto**   | una riga sul cruscotto e una vista `v_monthly_income`; la metrica principale non cambia                                                      |
| **Schermata di apertura**                | resta **il mese corrente** | stato del sistema e cose da confermare vanno in cima al cruscotto, non su una schermata nuova                                                |
| **Budget**                               | **non ora**                | `budgets` resta nello schema inutilizzata; da riprendere quando i numeri veri saranno noti da qualche mese                                   |
| **Correzione della singola transazione** | **da decidere sui dati**   | la lista dei movimenti si costruisce lo stesso; la scheda nasce **in sola lettura**, e le correzioni si aggiungono quando il bisogno si vede |

L'ultima riga merita una nota, perché è una decisione di metodo e non di prodotto. La scheda
movimento in sola lettura serve già a due cose su tre — verificare un numero scomponendolo, e
guardare la causale grezza di un movimento che non si riconosce. La terza, correggere, ha un costo
di progettazione alto (quali campi, cosa blocca `manually_categorized`, come si annulla) e un
bisogno ancora misurato a zero. Costruirla adesso significherebbe indovinare; costruirla dopo aver
visto quante volte si vorrebbe usarla significa saperlo.

**Resta aperta una sola domanda**, e non è per l'utente: il momento della conferma di fine giornata
— una schermata che si visita, oppure una notifica che arriva. La seconda richiede la Fase 7 e un
service worker, quindi si decide lì.

## 9. Ordine di costruzione

Ogni riga è un passo che si chiude e si prova da solo.

| #   | Cosa                                                    | Perché in questa posizione                  |
| --- | ------------------------------------------------------- | ------------------------------------------- |
| 1   | **Stato del sistema** in cima al cruscotto              | ✅ 0020                                     |
| 2   | **Entrate come contesto** — vista e riga sul cruscotto  | ✅ 0020                                     |
| 3   | **Lista movimenti** con filtri, ricerca e totale        | ✅ 0020                                     |
| 4   | **Scheda movimento in sola lettura**                    | ✅ 0020                                     |
| 5   | **Aggregati toccabili** — categoria ed esercente aprono | ✅                                          |
| 6   | **Schede esercente e categoria**                        | ✅                                          |
| 7   | **Confronto omogeneo** fra periodi                      | ✅ 0021                                     |
| 8   | **Lista giroconti**                                     | ✅ come filtro: `/movimenti?tipo=giroconti` |

Le correzioni sulla scheda movimento restano fuori finché non si sa se servono (vedi 8).

### Cosa resta, dopo la 6-bis

Non è lavoro pianificato, è ciò che l'inventario ha lasciato indietro di proposito.

- **Il motivo di ogni giroconto.** La lista esiste come filtro, ma non dice _perché_ una riga è
  marcata `is_transfer` — riferimento condiviso, causale `To`/`From`, controparte dichiarata, o
  movimento speculare. Con quel motivo accanto, la revisione mensile dei giroconti diventa
  verificabile invece che un atto di fede.
- **`cancel_url` sugli abbonamenti.** È nello schema e non è mai usato: «non lo uso» dovrebbe
  portare dove si disdice, o il giudizio resta un'annotazione senza conseguenze.
- **La copertura della classificazione in cima a `/revisione`.** 94,0% in euro e 98,2% in
  movimenti dicono quanto ci si può fidare di tutto il resto, e stanno in una riga di esito che
  sparisce al primo ricaricamento.
- **L'allineamento della Fase 5 su `amount_eur`.** Il detector somma `amount`; oggi coincidono
  perché l'unico conto nei totali è in euro. Da fare prima di collegare Intesa.
