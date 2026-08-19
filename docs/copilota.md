# Il copilota, la memoria, e la dashboard che si costruisce da sola

> Analisi di progetto, 19 agosto 2026. **Non è un piano di implementazione**: è la critica del
> concept, il modello concettuale che propongo al suo posto, e una roadmap in tre tempi.
> Va letto insieme a `docs/direzione.md` (le decisioni del 13 agosto) e alla Fase 10 di `CLAUDE.md`.

---

## Da dove si parte, che non è da zero

Prima della critica, l'inventario. Metà delle cose chieste **esistono già**, e progettarle una
seconda volta sarebbe il modo più rapido di ottenere due verità divergenti.

| Chiesto                                      | Cosa c'è già                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Conversazioni separate                       | `chat_messages` + `v_conversazioni`. Manca il **titolo scelto**, la ★ e la scadenza                                                 |
| Il copilota non inventa numeri               | `cifreInventate()`, e diciassette strumenti che leggono viste SQL                                                                   |
| Il copilota non scrive di nascosto           | Le scritture sono **proposte**, applicate con un tocco, rilette dal database                                                        |
| Grafici                                      | `grafico_mensile` + modulo di geometria puro, con lo zero sempre nel dominio                                                        |
| Avvisi con inbox                             | `alerts` con `dedupe_key`, `severity`, `status`, e la schermata `/avvisi`                                                           |
| «Perché?»                                    | `strumenti` su ogni messaggio: i dati esatti che il modello ha ricevuto                                                             |
| Memoria delle correzioni                     | `manually_categorized`, `usage_verdict`, `own_counterparties`, `classificazione_variabile`, `merchants.notes`, `transactions.notes` |
| Discesa per classe → categoria → transazione | La fisarmonica di `/dove`, una schermata sola                                                                                       |

**L'ultima riga della colonna destra è il punto di tutta questa analisi**, e ci torno subito.

---

# Fase 1 — Critica

## C1. Due terzi della «memoria finanziaria» che descrivi non è memoria: è schema mancante

È l'osservazione più importante del documento. Prendo i tuoi sei esempi uno per uno.

| Quello che l'utente dice                 | Cos'è davvero                                                         | Dove va                                |
| ---------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| «Il viaggio di agosto era eccezionale»   | un **fatto sulla transazione** che cambia il calcolo delle ricorrenze | colonna nuova, `episodico`             |
| «Questa spesa la rimborsa l'azienda»     | un **fatto sulla transazione**: quei soldi tornano                    | colonna nuova, `rimborsabile`          |
| «Questo abbonamento mi serve per lavoro» | `usage_verdict = 'usato'` + `context = 'business'`                    | **esiste già**                         |
| «Questa transazione è classificata male» | una correzione                                                        | **esiste già**, `manually_categorized` |
| «Voglio tenere 5.000 € di liquidità»     | un **obiettivo**, non un fatto                                        | tabella nuova, minuscola               |
| «Sto cercando di ridurre i ristoranti»   | un **obiettivo**                                                      | idem                                   |

Quattro su sei sono colonne. Due su sei sono obiettivi. **Nessuno dei sei è testo libero da
ricordare.**

E la ragione per cui questo conta non è l'eleganza. È che una memoria testuale crea una
**seconda verità**:

> Se «il viaggio era eccezionale» vive in una tabella di memoria che solo il copilota legge, allora
> `v_subscriptions` non lo sa. `/abbonamenti` continua a dire che `Booking.com` costa
> **266,50 €/mese**, il cruscotto lo conta nel voluttuario ricorrente, il report mensile lo racconta
> — e il copilota dice «no, quello era eccezionale». Due numeri diversi per lo stesso fatto,
> nella stessa applicazione.

In questo progetto è il guasto peggiore possibile, perché tutta la fiducia sta nel fatto che i
numeri siano gli stessi ovunque li si guardi. Una memoria che il resto dell'app non vede è una
macchina per divergere.

Nota che il caso del viaggio **è già scritto in `CLAUDE.md`** come limite noto, dai numeri di
chiusura della Fase 5:

> «metà del voluttuario abituale sono viaggi: `Booking.com` da solo vale 266,50 €/mese, con 4
> prenotazioni in 3 mesi. Un viaggio non è un'abitudine, è una spesa episodica che capita di essere
> concentrata — e nessun criterio basato sul tempo può distinguerli.»

Il tuo esempio fondamentale, quello con cui apri, **non è un caso d'uso della memoria: è una
colonna mancante che il rilevatore aspetta da luglio.** Aggiungerla ripara insieme il copilota, il
cruscotto, `/abbonamenti`, il report e gli avvisi. Metterla in una memoria testuale riparerebbe
solo la chat.

**Regola che ne discendo:** _un fatto che cambia un numero non va in memoria, va nello schema. In
memoria va solo ciò che non cambia nessun numero_ — cioè le preferenze e gli obiettivi.

## C2. Confidence e risoluzione delle contraddizioni sono over-engineering, qui

Chiedi confidence, datazione, rilevamento contraddizioni. Su un'applicazione **mono-utente** con
fatti tipizzati, quasi niente di tutto ciò serve:

- **La confidence su un fatto detto dall'utente non significa niente.** L'utente _è_ l'autorità.
  Un punteggio 0,8 su «questo abbonamento mi serve per lavoro» è un numero inventato che poi
  qualcuno userà per filtrare, e filtrerà via una cosa vera.
- **La confidence ha senso solo sulle inferenze del modello** — e quelle non vanno salvate affatto,
  vanno **ricalcolate** (è la tua categoria C, ed è giusto che sia effimera).
- **Le contraddizioni si risolvono da sole se il fatto è tipizzato.** Un boolean non può
  contraddirsi: si sovrascrive. Due righe di testo libero «Adobe è per lavoro» / «Adobe non lo uso
  più» sì, e per riconciliarle servirebbe... un modello. Cioè si userebbe un LLM per riparare un
  problema creato dall'aver salvato testo invece di dati.

Quello che serve davvero, e costa tre colonne: **chi l'ha detto** (utente / modello),
**quando**, **su cosa punta** (transazione, esercente, categoria).

## C3. I «monitoraggi» del §9 sono il motore avvisi che hai già costruito

La Fase 8 ha già: rilevamento, `dedupe_key` con indice unico contro le ripetizioni, `severity`,
`status` (`new`/`read`/`dismissed`), la schermata `/avvisi`, e soprattutto una **decisione di
prodotto**: solo due cose meritano un avviso, perché «il rumore in un canale di avvisi non è
neutro: spegne il canale».

Un secondo sistema di monitoraggi vorrebbe dire due inbox. Con due inbox una delle due si guarda
meno, e non si sa quale — quindi non ci si può fidare di nessuna delle due.

**Quello che manca non è un sistema: è una tabella di regole** (`alert_rules`) che il generatore
notturno legge insieme ai suoi controlli fissi. Il copilota propone la regola; il motore esistente
produce l'avviso; l'inbox resta una.

Con un dettaglio che va deciso adesso e non dopo: le regole dell'utente **devono passare dalla
stessa `dedupe_key`**, o «avvisami se supero 400 € nei ristoranti» diventa un avviso ogni notte
per il resto del mese.

## C4. La `/dove` che proponi rimette dentro due cose tolte apposta — e toglie quella che risponde

Il tuo §7 propone ciambella per classe e un grande grafico con metrica selezionabile. Sono
esattamente i due oggetti rimossi ad agosto, e le ragioni sono misurate, non estetiche:

- **la ciambella** rispondeva a «in cosa si divide il mese», che è _letteralmente il primo livello
  della fisarmonica disegnato peggio_: su un telefono una fetta è larga venti pixel e si sbaglia col
  pollice;
- **l'albero** è un inventario, non una risposta.

E soprattutto: **nel tuo layout la fisarmonica non compare.** È la cosa che risponde alla domanda
che dà il nome alla sezione — quanto qui, di cosa è fatto, e si scende fino alla singola riga senza
cambiare pagina. Se `/dove` diventa una pagina di grafici, la discesa non ha più una casa.

## C5. La dashboard di widget ricostruirà il cruscotto da cinque schermate, un widget alla volta

Il cruscotto è passato da **4.063 a 1.645 px** proprio togliendo grafici, e la diagnosi scritta
allora vale identica qui: cinque schermate sono il modo più sicuro di non far leggere niente.

«Aggiungi a Dove» è un bottone che rende **facilissimo aggiungere** e non offre **nessun momento
per togliere**. Il risultato a sei mesi è prevedibile: dodici widget, di cui due guardati.

Non è un argomento contro la funzione — è un argomento per progettarla col freno incorporato, e il
freno va deciso ora perché dopo non si mette più (§ _Come si evita la dashboard piena_).

## C6. Un widget generato dal modello è **una query scritta dal modello**, e sposta il confine

Oggi il confine è netto e ben difeso: il modello sceglie **quale** strumento chiamare, e gli
argomenti sono tipizzati e validati. Non compone la domanda.

Un widget con `"filters": { ... }` libero gli fa comporre la domanda. E la difesa che avete —
`cifreInventate()` — protegge la **prosa**, non una figura: è già scritto che «un grafico può
mentire con numeri veri», e adesso potrebbe mentire anche con i filtri.

Peggio: un widget è **duraturo**. Una frase sbagliata la leggi una volta; un widget con un filtro
sbagliato risponde alla domanda sbagliata ogni volta che apri l'app, per mesi, mostrando numeri
veri.

La soluzione non è vietarlo, è **la grammatica chiusa**: ogni specifica deve risolvere a una vista
o funzione **che esiste già**. Se nessuna risponde, la specifica è invalida — e un grafico nuovo
richiede una vista nuova, scritta da una persona. È la stessa garanzia della Fase 9 detta per le
figure: _la difesa non sono le istruzioni, è che non ha di che sbagliare_.

## C7. «Posso permettermi questa spesa?» oggi non ha risposta, e il copilota risponderebbe lo stesso

Nello schema **non esiste nessun saldo**: `accounts` non ha una colonna per il denaro che c'è.
Senza saldo e senza entrate attese, quella domanda non è rispondibile — e un modello che ci prova
farà esattamente ciò che è già stato misurato in Fase 4: _inventare una motivazione plausibile pur
di averne una_.

Due strade oneste: aggiungere il saldo (Enable Banking lo espone) oppure **rifiutare la domanda
per iscritto** nel prompt, spiegando cosa manca. La terza — lasciare che risponda con la spesa
media — è quella che sembra funzionare ed è la peggiore.

## C8. L'opportunità che non stai considerando: la memoria migliore è già scritta, e il copilota non la legge

Ogni correzione fatta nell'app è memoria durevole, tipizzata, datata, e **già condivisa** con
cruscotto, report e avvisi:

`manually_categorized` · `usage_verdict` + `verdict_updated_at` · `own_counterparties` ·
`classificazione_variabile` · `merchants.notes` · `transactions.notes` · `subscriptions.notes` ·
`merchants.confermato_at`

Il copilota oggi non ne legge quasi nessuna. **Fargliele leggere costa una manciata di righe nella
proiezione e dà la maggior parte dell'effetto «si ricorda», senza nessun sistema di memoria.**

Esempio concreto: hai marcato un abbonamento `non_usato` tre settimane fa. Chiedi «dove posso
risparmiare?». Oggi il copilota lo ripropone come scoperta. Con `usage_verdict` nella proiezione,
dice «questo l'avevi già segnato come non usato, e lo paghi ancora» — che è una frase che _nessuna
memoria conversazionale_ avrebbe potuto produrre, perché quel giudizio non è mai passato da una
chat.

## C9. Un rischio della memoria conversazionale: i risultati vecchi rientrano come se fossero attuali

Nel tuo §A elenchi fra i contenuti della chat «risultati già discussi». Attenzione: un risultato di
tre settimane fa **è sbagliato oggi**. Se rientra nel contesto senza una data, il modello lo tratta
come corrente e ci ragiona sopra.

Regola: la trascrizione conserva **il testo**, e i payload degli strumenti si conservano _come
prova_ (`chat_messages.strumenti`, che è il meccanismo di `/perché`), ma **non si reiniettano mai**
come dati attuali. Se serve di nuovo quel numero, si richiama lo strumento.

---

# Fase 2 — Modello concettuale

Sette entità. La regola che le tiene insieme: **ognuna ha una sola cosa che sa fare, e i numeri
vengono sempre dallo stesso posto.**

```
                    ┌──────────────────────────────────────────┐
                    │  I DATI  — transactions, viste, funzioni  │
                    │  l'unica fonte di ogni cifra              │
                    └───────┬──────────────────────────┬────────┘
                            │ legge                    │ legge
        ┌───────────────────▼────────┐      ┌──────────▼─────────────┐
        │  FATTI TIPIZZATI           │      │  INSIGHT DERIVATI      │
        │  colonne su transactions,  │      │  calcolati, effimeri,  │
        │  merchants, subscriptions  │      │  mai salvati           │
        │  ← li scrive l'utente      │      └──────────┬─────────────┘
        └───────────────┬────────────┘                 │
                        │                              │
        ┌───────────────▼──────────────────────────────▼─────────────┐
        │  COPILOTA — sceglie strumenti, scrive frasi, mai cifre      │
        └───┬───────────────┬────────────────┬───────────────────────┘
            │ propone       │ propone        │ propone
     ┌──────▼─────┐  ┌──────▼──────┐  ┌──────▼────────┐
     │ SCRITTURE  │  │  WIDGET     │  │ REGOLE AVVISO │
     │ (esistono) │  │ (domanda    │  │ → motore      │
     │            │  │  salvata)   │  │   avvisi      │
     └────────────┘  └──────┬──────┘  └──────┬────────┘
                            │                 │
                     ┌──────▼──────┐   ┌──────▼──────┐
                     │   /dove     │   │  /avvisi    │
                     └─────────────┘   │ inbox unica │
                                       └─────────────┘

     ┌─────────────────────────────────────────────────────────┐
     │  CHAT — messaggi, prove, proposte. Scade. Non è memoria. │
     └─────────────────────────────────────────────────────────┘

     ┌─────────────────────────────────────────────────────────┐
     │  OBIETTIVI — preferenze che non cambiano nessun numero  │
     └─────────────────────────────────────────────────────────┘
```

## Le quattro nature dell'informazione, che è la distinzione che chiedevi

| Natura                   | Chi la produce | Dove vive                      | Sopravvive alla chat?    | Cambia i numeri? |
| ------------------------ | -------------- | ------------------------------ | ------------------------ | ---------------- |
| **Fatto**                | la banca       | `transactions`                 | —                        | è il numero      |
| **Contesto dell'utente** | l'utente       | **colonne tipizzate**          | sì, non ci è mai passata | **sì**           |
| **Obiettivo**            | l'utente       | `obiettivi`                    | sì                       | no               |
| **Insight derivato**     | SQL            | da nessuna parte, si ricalcola | n/d                      | no, li legge     |
| **Interpretazione AI**   | il modello     | il messaggio, e basta          | no                       | mai              |

**Il confine che il prodotto deve mostrare** non è quello fra le prime tre — è quello fra le prime
quattro e l'ultima. Un insight derivato è una misura; un'interpretazione è un'opinione. Nella UI
vanno tenute tipograficamente distinte, e il pannello «perché?» deve poter mostrare la misura sotto
l'opinione (§ Fase 3, flusso A).

## Il confine chat / memoria, che è la tua domanda del §10

Semplice, e vale la pena scriverlo in una riga sola:

> **Una chat non contiene mai niente di duraturo. Contiene le tracce di come una cosa duratura è
> nata.**

Quando in chat succede qualcosa che deve sopravvivere — una correzione, un obiettivo, un widget,
una regola — quella cosa viene **copiata fuori**, in una tabella sua, con la sua data. La chat
conserva il _riferimento_ per poterlo mostrare («da qui è nato questo widget»), ma la cosa vive da
sola.

Conseguenza diretta e verificabile: **cancellare una chat non può rompere niente.** Se cancellandola
un widget smette di funzionare, il confine è stato disegnato male.

---

# Fase 3 — I flussi

## Flusso A — «Dove posso risparmiare?»

`dove_tagliare` esiste già e restituisce i pezzi in una chiamata sola (fu costruito proprio perché
il copilota rispondeva con un menu invece che con una risposta). Serve estenderlo, non rifarlo.

1. Il server compone il contesto: strumento `dove_tagliare` **+** i fatti tipizzati che toccano
   quelle voci (`episodico`, `usage_verdict`, `context`) **+** gli obiettivi attivi.
2. Il modello scrive due liste separate — **cosa si disdice** e **cosa si cambia** — perché la
   metrica è divisa in due e un totale unico nasconderebbe quale delle due è possibile.
3. Ogni voce porta **la cifra e il suo nome**: `media_su_tutto_lo_storico`, `ultimo_importo`,
   `media_mensile_recente`. Il difetto di «Anthropic −91,26 €/mese» sotto «risparmio certo» era
   esattamente questo: cifra giusta, domanda sbagliata.
4. Sotto ogni affermazione, un **«perché?»** chiuso che apre le misure:

   ```
   Ristoranti, 460 € questo mese
   └ perché?
     mediana ultimi 6 mesi   310 €     ← dato
     mese corrente           460 €     ← dato
     variazione              +48%      ← dato
     «stai spendendo troppo»           ← interpretazione
   ```

   Le prime tre righe vengono dallo strumento. La quarta è del modello, ed è marcata.

**Il viaggio non compare** fra le voci da tagliare, perché `episodico` lo ha tolto dalla serie —
non perché il modello se lo ricorda.

## Flusso B — «Quella spesa era eccezionale»

Il flusso che dà il senso a tutto il documento.

1. Il modello riconosce l'intento e **propone una scrittura**, non la esegue — come per ogni altra
   scrittura, e per la stessa ragione: questa marca una riga per sempre.
2. La proposta è **tipizzata e concreta**, con la descrizione scritta dal **server** dagli argomenti
   già risolti in nomi:

   > **Segnare come spesa episodica**
   > `Booking.com` · 12 agosto 2026 · −1.200,00 €
   > Non entrerà più nel calcolo delle spese ricorrenti.
   > _Effetto: il costo ricorrente di Booking.com scende da 266,50 a 41,20 €/mese._

   L'ultima riga è il pezzo che rende la proposta valutabile invece che fiduciaria: **si vede cosa
   cambia prima di accettare.**

3. L'utente tocca **Applica**. Da quel momento:
   - `/abbonamenti` mostra il costo nuovo;
   - il cruscotto pure;
   - il report di settembre lo racconta corretto;
   - il copilota, fra due settimane, non lo ripropone — perché **non c'è più nella serie**, non
     perché ricorda la conversazione.
4. Se l'utente dice solo «no, sbagliato» senza specificare, il copilota **chiede quale delle due
   cose intende** (episodica / classificata male): sono due colonne diverse e due effetti diversi,
   e indovinare significherebbe incidere la cosa sbagliata.

## Flusso C — il copilota fa un grafico

1. Il modello sceglie **la forma della domanda**, mai i valori: emette una specifica.
2. Il server la **valida contro la grammatica chiusa** e la risolve su una vista esistente. Se non
   risolve, la rifiuta — non la corregge: una specifica corretta a metà produce un grafico
   plausibile che risponde a un'altra domanda.
3. Il server calcola i punti, compone il **titolo** (non il modello: stessa regola delle proposte
   di scrittura) e restituisce dati + spec.
4. Il client disegna, con lo zero sempre nel dominio.
5. Sotto: **«da dove vengono i numeri»**, che è già la convenzione della Fase 10.

## Flusso D — «Aggiungi a Dove»

1. Il bottone compare **solo su un grafico valido**, e mostra il titolo derivato — così si salva
   ciò che si è letto.
2. Si salva **la specifica, mai i punti**. È il punto centrale della tua idea ed è giusto.
3. Un conflitto da decidere adesso: la specifica dice `ultimi 12 mesi` in modo **relativo**, quindi
   fra un mese la finestra scorre da sola. È quello che vuoi. Ma se la specifica dicesse
   `da gennaio a dicembre 2026` sarebbe fissa. **Entrambe servono**, e la grammatica deve poterle
   distinguere — altrimenti fra tre mesi un widget «anno 2026» mostrerà il 2027.
4. Il widget appare **in fondo** a `/dove`, sotto la fisarmonica, con la data di creazione.
5. Se sei già a sei widget, il sistema **chiede quale togliere** invece di aggiungere il settimo.

## Flusso E — il copilota propone un monitoraggio

1. Solo **dentro una risposta a una domanda**, mai a freddo (§ Fase 1, e la regola per cui gli
   avvisi stanno in fondo al cruscotto).
2. La proposta è una **regola tipizzata**: misura, taglio, condizione, soglia.
3. Applicata, scrive in `alert_rules`. **Non genera niente subito**: la valuta il lavoro notturno
   insieme a tutti gli altri controlli.
4. L'avviso, quando arriva, arriva in `/avvisi` come tutti gli altri, con la sua `dedupe_key` — e
   porta scritto **che è una regola tua**, con un collegamento per spegnerla. Un avviso che non si
   sa da dove viene e non si sa come zittire è un avviso che insegna a ignorare l'inbox.

## Flusso F — una chat scade

| Cosa                                                  | Cosa succede   | Perché                                                 |
| ----------------------------------------------------- | -------------- | ------------------------------------------------------ |
| Messaggi, payload degli strumenti, grafici della chat | **cancellati** | sono la conversazione                                  |
| Proposte **non applicate**                            | cancellate     | non sono mai diventate niente                          |
| Scritture **applicate**                               | restano        | vivono su `transactions` / `merchants`, non nella chat |
| Widget salvati                                        | restano        | sono stati copiati fuori al momento del salvataggio    |
| Regole d'avviso create                                | restano        | idem                                                   |
| Obiettivi confermati                                  | restano        | idem                                                   |

Il widget conserva `nato_da_chat_id` **senza vincolo di integrità**: serve a raccontare («questo
l'hai salvato il 12 agosto»), e quando la chat non c'è più il widget continua a funzionare
mostrando solo la data.

**La ★** sospende la scadenza. Ma va detto che è una funzione minore: se il confine è disegnato
bene, **quasi non serve** — tutto ciò che valeva la pena tenere è già uscito dalla chat. Se ti
accorgi di stellinare spesso, è il segnale che qualcosa che meritava una tabella è rimasto dentro
una conversazione.

---

# Fase 4 — Architettura dati

Ad alto livello. Le entità nuove sono **cinque**, di cui due minuscole.

### Si estende ciò che c'è

```
transactions
  + episodico      boolean default false   -- una tantum: fuori dalle ricorrenze
  + rimborsabile   boolean default false   -- lo rimborsa qualcun altro
```

Due colonne, e la nota di processo che pesa: **entrambe devono arrivare fino agli aggregati**,
quindi impongono di ricreare `v_expenses` e, in ordine e senza `cascade`, le viste che ci stanno
sopra. È la manovra descritta in `CLAUDE.md` che è già costata due migration fallite: vanno fatte
**insieme, una volta sola**, non una per fase.

Dove agiscono:

- `episodico` → escluso dal **detector** delle ricorrenze, ma **dentro** la spesa del mese (i soldi
  sono usciti davvero: toglierli dal totale sarebbe la bugia opposta);
- `rimborsabile` → serve una decisione di prodotto, e la propongo esplicita in Fase 8.

### Entità nuove

```
chat_conversations        una riga per conversazione (oggi sono implicite)
  id · titolo · salvata · created_at · ultima_at · scade_at

obiettivi                 preferenze che NON cambiano nessun numero
  id · testo · tipo · bersaglio · attivo · created_at · origine

widgets                   una domanda salvata
  id · spec jsonb · titolo · ordine · nato_da_chat_id · created_at · ultimo_sguardo_at

alert_rules               una condizione che il motore notturno valuta
  id · spec jsonb · attiva · created_at · ultimo_scatto_at
```

Più `alerts.rule_id` (nullable) per legare un avviso alla regola che l'ha prodotto.

**Cosa NON c'è, di proposito:** nessuna tabella `memoria`, nessun campo `confidence`, nessun
embedding, nessun indice vettoriale. Su un utente solo, con qualche decina di fatti, il retrieval
semantico risolve un problema che non esiste e ne introduce uno vero — il richiamo approssimativo
su fatti che devono essere esatti.

---

# Fase 5 — Architettura AI: cosa va al modello, a ogni richiesta

Il principio della Fase 9 vale identico: **la difesa non sono le istruzioni, è che non abbia i dati
per sbagliare.**

### Il contesto fisso (piccolo, ogni richiesta)

| Blocco               | Grandezza  | Perché                                                               |
| -------------------- | ---------- | -------------------------------------------------------------------- |
| Istruzioni           | ~1k token  | Include le classi vive, che non possono stare in un `enum` congelato |
| Albero categorie     | ~300 token | Con l'albero sotto gli occhi non può inventare un id                 |
| **Obiettivi attivi** | ~100 token | Sono cinque righe. È tutta la «memoria» che serve nel prompt         |
| Forma dei dati       | ~200 token | Cosa vuol dire `nella_metrica`, `nel_ricorrente`, «un privato»       |

**Non entrano nel prompt:** i fatti tipizzati. Entrano nei **risultati degli strumenti**, accanto
alle righe che descrivono — dove sono verificabili e non riassunti. È la stessa ragione per cui
`nel_ricorrente` «arriva nei dati mandati al modello, non nel prompt».

### Il contesto variabile

Solo risultati di strumenti chiamati **in questo turno**. Della conversazione precedente resta il
testo, con le date; **nessun payload vecchio viene reiniettato**.

### Cosa NON si fa mai

- mandare transazioni grezze in blocco;
- mandare `raw_description`, `counterparty_raw`, le note dell'utente, il conto, le cifre della carta
  (la proiezione è un **elenco di campi ammessi**, che fallisce chiuso);
- far calcolare al modello una differenza, una percentuale, una media — nemmeno facile: è proprio su
  una sottrazione facile che il controllo delle cifre lo ha già colto;
- lasciargli scrivere il titolo di un widget o la descrizione di una proposta.

### Retrieval: quello che serve, e non è semantico

La domanda «quali fatti sono rilevanti per questa conversazione» ha una risposta **strutturale**:
sono i fatti **attaccati alle entità che gli strumenti hanno appena restituito**. Se
`dove_tagliare` torna otto esercenti, si allegano i fatti di quegli otto. Zero ambiguità, zero
embedding, e nessun rischio di richiamare il fatto sbagliato perché «assomigliava».

---

# Fase 6 — Widget engine

## Critica della tua struttura

```json
{
  "type": "line_chart",
  "title": "Spesa ristoranti",
  "metric": "expenses",
  "filters": { "category": "restaurants" },
  "time_range": "last_12_months",
  "group_by": "month"
}
```

Cinque problemi, in ordine di gravità:

1. **`filters` è un dizionario aperto.** Il modello ci può mettere qualsiasi cosa, e ciò che il
   server non capisce viene ignorato in silenzio: il widget mostra un insieme più largo di quello
   chiesto, con numeri veri. È il modo peggiore di sbagliare.
2. **`title` lo scrive il modello.** Un widget dura mesi: se il titolo dice «ristoranti» e il filtro
   dice `ristorazione`, vince il titolo nella testa di chi guarda. Il titolo va **derivato dalla
   spec**, dal server — la regola già applicata alle proposte di scrittura.
3. **`time_range: "last_12_months"` non dice cosa fare del mese in corso.** In questo progetto è una
   regola dura: un mese parziale non si confronta con mesi interi. Deve essere esplicito.
4. **Nessuna versione.** La grammatica cambierà; i widget salvati no. Senza `v` non si potrà
   migrarli senza indovinare.
5. **Una forma piatta per sette tipi diversi.** Un KPI non ha `group_by`, una ciambella non ha un
   asse temporale, un confronto ha _due_ finestre. Chiavi opzionali che valgono solo per certi tipi
   producono combinazioni senza senso che qualcuno dovrà validare a mano.

## La struttura che propongo

**Unione discriminata su `tipo`**, con `taglio` a chiavi chiuse. E soprattutto la regola che rende
tutto il resto sicuro:

> **Ogni specifica valida deve risolvere a una vista o funzione SQL che esiste già.** Se nessuna
> risponde, la specifica è invalida. Un grafico nuovo comincia da una vista nuova, scritta da una
> persona.

```jsonc
// Andamento nel tempo
{ "v": 1, "tipo": "andamento",
  "misura": "spesa",                       // spesa | ricorrente | entrate | margine
  "taglio": { "categoria": "<uuid>" },     // chiavi da un elenco chiuso
  "finestra": { "mesi": 12, "includi_mese_corrente": false },
  "passo": "mese" }                        // mese | giorno

// Ripartizione a un istante
{ "v": 1, "tipo": "ripartizione",
  "misura": "spesa",
  "per": "classe",                         // classe | categoria | esercente | contesto
  "taglio": {},
  "finestra": { "mese": "2026-07" } }      // fisso: non scorre

// Un numero solo
{ "v": 1, "tipo": "numero",
  "misura": "ricorrente",
  "taglio": { "tipo_ricorrenza": "abbonamento", "classe": "voluttuario" },
  "finestra": { "mese": "corrente" } }

// Confronto: due finestre, esplicite
{ "v": 1, "tipo": "confronto",
  "misura": "spesa", "taglio": { "categoria": "<uuid>" },
  "finestre": [ { "mesi": 6, "fino_a": "corrente" },
                { "mesi": 6, "fino_a": "-6" } ] }
```

**`taglio` — le sole chiavi ammesse:** `classe`, `contesto`, `categoria`, `esercente`,
`tipo_ricorrenza` (`abbonamento` | `abitudine`), `solo_ricorrenti`, `conto`.

Tre proprietà che ne discendono, e sono quelle che contano:

- una chiave sconosciuta **rifiuta** la spec, non la ignora;
- ogni valore è **verificato contro una riga vera** (lo slug esiste, l'uuid esiste) — così un widget
  non può puntare a una categoria cancellata e mostrare zero per sempre;
- `finestra` **scorrevole** (`{mesi: 12}`) e **fissa** (`{mese: "2026-07"}`) sono forme diverse,
  quindi non si confondono mai.

**`insight card` non è un tipo di widget.** Un insight è una frase generata dal modello: salvarla
significa congelare un'interpretazione che domani sarà falsa, con l'aria di un dato. Se una frase
merita di restare, ciò che va salvato è **la misura che la produce** — cioè un `numero` o un
`confronto` — e la frase si riscrive ogni volta sui valori di oggi.

---

# Fase 7 — Roadmap

## MVP — «il copilota si ricorda» senza costruire una memoria

Ordinato per rapporto valore/rischio.

1. **Le due colonne + la ricostruzione delle viste, in una migration sola.** Sblocca il caso viaggio,
   che è già un difetto noto del rilevatore.
2. **La proposta «segna come episodica»**, con l'effetto mostrato prima di applicare.
3. **I fatti tipizzati nella proiezione degli strumenti.** Il pezzo più economico e più visibile.
4. **`obiettivi`**: cinque righe, scritte solo dall'utente, dentro il prompt.
5. **`chat_conversations`**: titolo, ★, scadenza a 30 giorni.

Dopo il punto 3 il copilota _sembra già ricordare_, e non è stata scritta nessuna memoria.

## V2 — i widget

6. Grammatica chiusa + validatore + risoluzione su viste esistenti (nessuna vista nuova).
7. `grafico_mensile` emette una spec invece di punti sciolti.
8. `widgets` + «Aggiungi a Dove» + il tetto di sei con la richiesta di scambio.
9. Il pannello **«perché?»** sotto le affermazioni: misura e interpretazione separate.

## V3 — i monitoraggi, e non prima

10. `alert_rules` + valutazione nel lavoro notturno + `dedupe_key` per le regole utente.
11. Il copilota le propone dentro una risposta.
12. **Solo qui** la UI «cosa Copilot sa di te», che a questo punto è una schermata piccola: gli
    obiettivi, e un elenco _derivato_ dei fatti tipizzati con il collegamento al posto dove si
    cambiano.

## Quello che non farei mai

Embedding e memoria vettoriale; punteggi di confidence; un secondo canale di notifiche; widget con
filtri liberi; una `/dove` senza fisarmonica.

---

# Fase 8 — Cosa farei io

## Le cinque decisioni, in una riga ciascuna

1. **Non costruire una memoria.** Costruire due colonne, una tabellina di obiettivi, e far leggere
   al copilota le correzioni che l'utente fa già. Un fatto che cambia un numero va nello schema; in
   memoria va solo ciò che non cambia nessun numero.
2. **Widget = domanda salvata**, con grammatica chiusa che risolve su viste esistenti. Il modello
   sceglie la forma della domanda, mai i valori, mai il titolo.
3. **Un solo canale di avvisi.** Le regole dell'utente entrano nel motore della Fase 8, non accanto.
4. **`/dove` resta la fisarmonica**, con i widget **sotto**, al massimo sei. Niente ciambella,
   niente albero: sono già stati tolti per ragioni misurate.
5. **Il copilota propone, non incide.** Vale per le classificazioni, e a maggior ragione per
   `episodico`, che è la cosa più vicina a un'incisione che ci sia.

## Come si evita la dashboard piena — le quattro regole insieme

- **tetto duro a sei.** Il settimo chiede quale togliere. Un limite che si può superare non è un
  limite;
- **si aggiunge solo con un tocco**, mai in automatico. Il copilota può _proporre_;
- **ogni widget porta `ultimo_sguardo_at`.** Uno non aperto da sessanta giorni si offre di andarsene,
  una volta, senza insistere;
- **i widget stanno sotto la fisarmonica**, non sopra. La risposta strutturale viene prima di quella
  personalizzata, ed è la sola che c'è il primo giorno.

Nessuna delle quattro funziona da sola. La prima senza la terza produce sei widget morti; la terza
senza la prima produce venti widget di cui tre vivi.

## Come si rende progressivamente personalizzabile

**L'area dei widget è vuota all'inizio, e vuota vuol dire assente** — nessun riquadro tratteggiato
che dica «nessun widget». Un vuoto dichiarato è un compito; un'assenza no. Compare la prima volta
che ne salvi uno, e da lì cresce.

## La decisione che ti lascio, perché non è tecnica

**`rimborsabile` cambia i numeri, e in che verso lo decidi tu.** Una spesa che l'azienda ti rimborsa
è uscita davvero dal conto — nel mese in cui esce, quei soldi non ce li hai. Tre letture, tutte
difendibili:

- **resta nella spesa** e il rimborso arriva come entrata (fedele alla cassa, ma il voluttuario del
  mese si gonfia di cose che non paghi tu);
- **esce dalla spesa** subito (fedele a «cosa mi costa davvero», ma il totale del mese non torna più
  con l'estratto conto — e la coincidenza al centesimo con l'app della banca è una delle prove su
  cui poggia la fiducia in tutto il resto);
- **resta nella spesa ma esce dal ricorrente**, come `episodico`. È la via di mezzo, e la coerenza
  con l'altra colonna vale qualcosa.

Io sceglierei la terza. Ma è una decisione di prodotto, non di architettura, e per le regole di
questo progetto va chiesta invece che presa in autonomia.

## Cosa risponderei a «Posso permettermi questa spesa?»

Oggi: **«non lo so, e ti dico perché»** — non ho i saldi. È la risposta che merita più fiducia di
qualunque stima, ed è la stessa regola già scritta per le schermate: _ogni risposta «niente» deve
poter distinguere «niente» da «non lo so»_.
