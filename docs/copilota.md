# Il copilota — specifica di prodotto

> Decisioni del 19 agosto 2026, secondo passaggio. **Questa è la direzione definitiva**: da qui si
> implementa, non si ridiscute. Il primo passaggio — la critica lunga da cui escono queste decisioni
> — sta in git al commit `117f8a5`, e va riletto solo se una decisione qui sotto va rimessa in
> discussione.
>
> Va letto insieme a `docs/direzione.md` e alla Fase 10 di `CLAUDE.md`.

---

## A. Decisioni approvate, e stabili

Non si riaprono senza una ragione nuova e misurata.

1. **Un fatto che cambia un numero vive nello schema**, mai in una memoria testuale.
2. **La chat non è memoria.** Contiene le tracce di come una cosa duratura è nata, non la cosa.
3. **I numeri si ricalcolano dai dati correnti.** Nessun payload vecchio rientra come attuale.
4. **Un widget è una domanda salvata**, non un grafico congelato: si salva la spec, mai i punti.
5. **Grammatica chiusa**: ogni spec deve risolvere su una vista o funzione che **esiste già**.
6. **Un solo motore di avvisi.** Le regole dell'utente entrano lì, non accanto.
7. **Il copilota propone, non incide.** Ogni scrittura passa da un tocco dell'utente.
8. **`episodico`** come da §3: resta nella spesa del mese, esce dalle ricorrenze.
9. **`/dove` non diventa una dashboard di grafici**, e la fisarmonica resta il cuore.
10. **Tetto duro di sei widget**, `ultimo_sguardo_at`, nessun inserimento automatico.
11. **«Posso permettermelo?» si rifiuta**, nominando cosa manca. Mai una proxy.

---

## B. Le sette cose che cambierei

### B1. La tua riformulazione della regola sulla memoria apre una scappatoia

Proponi: _«un fatto che può essere modellato strutturalmente non deve essere salvato come memoria
testuale.»_

Il problema è **chi decide** se una cosa «può essere modellata». Quella valutazione si fa nel
momento in cui si sta scrivendo il fatto, cioè nel momento in cui modellarlo costa e salvarlo come
testo non costa niente. La risposta comoda è sempre «questo no», e la regola si svuota da sola nel
giro di tre casi.

La regola giusta non guarda alla forma, guarda a **chi può leggere**:

> **Tutto ciò che il copilota sa, deve poterlo sapere anche il resto dell'applicazione.**

È un invariante verificabile, non un giudizio. E risponde direttamente alla tua preoccupazione:
`context_event` **la passa** — se esiste, `/dove` può mostrare «stai arredando casa» accanto alla
categoria Casa, e il motore avvisi può **spegnere il `category_spike`** su Casa per quei tre mesi.
Anzi: è proprio quel secondo lettore a giustificare la tabella. Un `context_event` che nessuno
legge tranne il copilota sarebbe memoria travestita.

**Quindi la formulazione da adottare, e da mettere in `CLAUDE.md`:**

> Un fatto che cambia un numero vive nello schema. Un fatto che non cambia nessun numero vive in una
> tabella sua, tipizzata. **Niente vive in un posto che solo il copilota legge.**

### B2. Cosa oggi foreclude `context_event` — una cosa sola, ed è evitabile

Hai ragione a volerlo tenere aperto, e la buona notizia è che quasi niente lo chiude: è una tabella
additiva, e arriverà quando serve.

**L'unica decisione che lo ucciderebbe è fare `obiettivi` generico.** Se nasce come sacco
chiave-valore — `{ tipo, testo, meta jsonb }` — allora fra sei mesi `context_event` non avrà una
tabella sua: verrà infilato lì dentro come stringa, perché ci sta. E a quel punto abbiamo
ricostruito la memoria testuale col nome di «obiettivi».

Perciò `obiettivi` nasce **stretto**: colonne esplicite, un `check` sui tipi ammessi, nessun campo
libero oltre a una nota. Scomodo di proposito — quando qualcosa non ci entra, deve _fare male_, così
si guarda se merita una tabella sua.

Nota anche che `context_event` è una **terza natura**, non un obiettivo: non è una cosa che l'utente
vuole, è una cosa che _sta succedendo_ e che spiega una deviazione. Aspettarsi che stia in
`obiettivi` è già il primo passo verso lo schiacciamento.

### B3. I nomi: in italiano, e «Derived Intelligence» dice la cosa sbagliata

Due obiezioni.

**Sono in inglese, e il progetto è in italiano.** Colonne (`discrezionalita`, `esercente`,
`nella_metrica`), funzioni (`riconosciGiroconto`, `cifreInventate`), documentazione, commenti.
Cinque concetti fondanti in inglese creano un vocabolario doppio proprio nello strato che dovrebbe
essere il più condiviso.

**«Derived Intelligence» è un nome sbagliato nel merito.** Quella categoria esiste perché è
_deterministica_: è aritmetica, e il suo pregio è di non essere intelligente. Chiamarla intelligenza
sfuma esattamente il confine con la E, che è il confine più importante dei cinque.

| Tuo nome             | Nome che userei   | La domanda che lo riconosce                                     |
| -------------------- | ----------------- | --------------------------------------------------------------- |
| Financial State      | **Stato**         | «se cambia, cambia un numero?» → sì                             |
| User Intent          | **Obiettivi**     | «l'utente lo _vuole_, o è _vero_?» → lo vuole                   |
| Conversation Context | **Conversazione** | «serve solo a capire il messaggio prima?» → sì                  |
| Derived Intelligence | **Misure**        | «si può ricalcolare da zero adesso?» → sì                       |
| AI Interpretation    | **Letture**       | «due persone ragionevoli potrebbero non essere d'accordo?» → sì |

«Letture» non è un vezzo: è la parola che userà anche il microcopy — _«la lettura del copilota»_ —
quindi il nome interno e quello mostrato coincidono.

Avvertenza di collisione: non chiamare niente `stato` nel codice di quest'area, perché
`v_stato_sistema` è già il consenso bancario e la freschezza dei dati.

### B4. Gli obiettivi invecchiano in silenzio, e nessuno se ne accorge

È il buco del tuo modello, e nessuno dei due l'aveva notato al primo passaggio.

Lo **Stato** si autocorregge: un `episodico` sbagliato si vede subito, perché sposta un numero che
guardi. Un **obiettivo** no. «Spendere meno di 300 €/mese nei ristoranti», messo a gennaio e
dimenticato, ad agosto è ancora lì — e il copilota continua a ottimizzare per un obiettivo che non
hai più, con la stessa serenità di uno che ce l'hai.

Costa poco ripararlo, e va fatto subito perché dopo è invisibile: ogni obiettivo porta una
**`valido_fino_a`**, obbligatoria, con default a sei mesi. Alla scadenza non sparisce: diventa
`scaduto` e il copilota, la prima volta che lo toccherebbe, chiede se vale ancora. Un obiettivo
sopravvive **perché lo confermi**, non perché nessuno l'ha cancellato.

### B5. `rimborsabile` non è un booleano, e la seconda lettura non va nell'MVP

Hai ragione sulla sostanza — le due letture sono entrambe vere — e proprio per questo il booleano
non regge. Tre ragioni, in ordine:

1. **Il rimborso può essere parziale.** Spendi 1.000, l'azienda ne riconosce 800. Un booleano dice
   che la spesa «è rimborsabile» e poi il costo personale è indeterminato.
2. **Ha un ciclo di vita**: _atteso → ricevuto_, con una terza uscita reale, _negato_. Sono tre
   stati e cambiano il numero in modo diverso.
3. **Un rimborso arriva quasi sempre cumulativo**: una nota spese da 740 € che copre sei scontrini.
   Quindi **non** modellare un legame `rimborso_transaction_id`: sarebbe uno-a-uno per un fenomeno
   molti-a-uno, e l'abbinamento automatico è la stessa classe di problema su cui ho già sbagliato
   una diagnosi in questa sessione.

La forma:

```
transactions
  + rimborso_stato    text null       -- atteso | ricevuto | negato   (null = non è il caso)
  + rimborso_importo  numeric(14,2)   -- quanto torna, può essere < |amount|
```

**Cosa entra negli aggregati, oggi e sempre:**

- **`v_expenses` non cambia.** La spesa lorda resta lorda, e la coincidenza al centesimo con
  l'estratto conto — che è una delle poche prove indipendenti su cui poggia la fiducia in tutto il
  resto — non si tocca. Questo risponde alla tua domanda su come non romperla: **non toccandola.**
- **Il costo personale è un secondo numero, mai una sostituzione.** Arriverà come colonna derivata
  (`amount_eur + coalesce(rimborso_importo, 0)`, e la somma è giusta perché le uscite sono negative),
  esposta accanto al lordo, **e solo quando c'è qualcosa da rimborsare**. Un secondo numero sempre
  presente insegna a ignorarne uno dei due.
- **Solo `ricevuto` sconta.** Un rimborso `atteso` conta come costo pieno finché non arriva: è il
  verso giusto in cui fallire, lo stesso della normalizzazione quando manca l'indicatore.

**E l'MVP la lascia a metà, di proposito.** Le due colonne entrano _adesso_, perché viaggiano sulla
stessa ricostruzione di `v_expenses` che `episodico` impone comunque — e quella manovra è già
costata due migration fallite, quindi farla due volte è la cosa da evitare più di ogni altra. Ma il
secondo aggregato, la riconciliazione e la riga «costo personale stimato» **non si costruiscono
finché non c'è un bisogno misurato**: è lo stesso criterio con cui `docs/cruscotto.md` §8 ha tenuto
la scheda movimento in sola lettura finché il caso Apple non l'ha reso necessario. Nell'MVP i due
campi si impostano dalla scheda del movimento e si leggono lì. Nient'altro.

### B6. Il widget `ripartizione` è superfluo. Tagliato.

Te lo eri chiesto: sì. Una ripartizione salvata **è la fisarmonica**, disegnata peggio e senza la
discesa. È letteralmente la ragione per cui la ciambella è stata tolta ad agosto, e reintrodurla
come widget salvabile la fa rientrare dalla finestra.

**MVP: tre tipi.** `andamento`, `numero`, `confronto`.

### B7. L'hero e il mini-grafico giornaliero di `/dove` — uno dei due è di troppo

Due problemi distinti.

**L'hero duplica il cruscotto.** Le quattro schede in basso sono quattro domande, e «quanto» è la
prima. Se `/dove` apre con lo stesso numerone, due schede su quattro rispondono alla stessa domanda
nel primo schermo, e la distinzione che regge tutta la navigazione si sfuma. Su `/dove` il totale
del mese serve come **contesto**, non come risposta: una riga sola, non una scheda —
`Agosto 2026 · −2.430 €`, alta quanto un'intestazione.

**Il mini-grafico giornaliero va tenuto solo se si tocca.** Su 360 px, trentuno giorni sono dieci
pixel l'uno: si vede _che_ c'è un picco, mai _quale_. E la domanda immediata di chi lo guarda è
«cos'era quel giorno». Se toccando il picco si aprono i movimenti di quel giorno, guadagna il suo
spazio; se non è toccabile è decorazione, e vale la regola già scritta — _un tocco che non fa niente
è peggio di un tocco che non c'è_.

Il criterio è quello, non il mio gusto: **toccabile o via.**

---

## C. Architettura finale

```
┌──────────────────────────────────────────────────────────────────┐
│                    STATO — l'unica fonte dei numeri              │
│  transactions · merchants · subscriptions · categories · accounts│
│  + episodico · rimborso_stato · rimborso_importo                 │
│  fatti della banca + correzioni dell'utente, insieme             │
└───────┬──────────────────────────────────────────┬───────────────┘
        │ leggono                                   │ leggono
   ┌────▼──────────────┐                    ┌───────▼──────────────┐
   │ MISURE            │                    │  MOTORE AVVISI       │
   │ viste e funzioni  │                    │  notturno, un solo   │
   │ effimere,         │                    │  generatore          │
   │ ricalcolate       │                    │  ← alert_rules       │
   └────┬──────────────┘                    └───────┬──────────────┘
        │                                            │
        │        ┌──────────────┐                    │
        │        │  OBIETTIVI   │                    │
        │        │  con scadenza│                    │
        │        └──────┬───────┘                    │
        │               │                            │
   ┌────▼───────────────▼────────────────────────┐   │
   │  COPILOTA                                    │   │
   │  sceglie strumenti · scrive frasi            │   │
   │  non possiede nessuna verità                 │   │
   │  produce LETTURE, mai fatti                  │   │
   └──┬───────────┬──────────────┬────────────────┘   │
      │ propone   │ propone      │ propone            │
  ┌───▼─────┐ ┌───▼──────┐ ┌─────▼────────┐           │
  │SCRITTURE│ │ WIDGET   │ │ REGOLE       │───────────┘
  │sullo    │ │ = domanda│ │ d'avviso     │
  │ STATO   │ │  salvata │ └──────────────┘
  └─────────┘ └────┬─────┘
                   │
        ┌──────────▼────────┐        ┌──────────────┐
        │      /dove        │        │   /avvisi    │
        │  fisarmonica +    │        │ inbox unica  │
        │  nel tempo +      │        └──────────────┘
        │  le tue analisi   │
        └───────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │  CONVERSAZIONE — messaggi, prove, proposte. Scade a 30gg. │
  │  Cancellarla non può rompere niente di quanto sopra.      │
  └──────────────────────────────────────────────────────────┘
```

**Le due frecce che contano**, e sono le sole regole di comunicazione da ricordare:

- ogni freccia che **produce un numero** parte dallo Stato e passa dalle Misure. Nessuna parte dal
  copilota;
- ogni freccia che **esce dal copilota** è una _proposta_, e attraversa un tocco dell'utente prima
  di diventare qualcosa.

---

## D. Layout definitivo di `/dove`

**Approvato, con le due correzioni di B7.** In ordine verticale:

| #   | Blocco                        | Note                                                                  | Alt. stimata |
| --- | ----------------------------- | --------------------------------------------------------------------- | ------------ |
| 1   | **Intestazione del mese**     | `Agosto 2026 · −2.430 €` + scelta mese. Una riga, non una scheda      | ~90 px       |
| 2   | **Il mese giorno per giorno** | Solo se toccabile: un giorno → i suoi movimenti. Altrimenti si taglia | ~120 px      |
| 3   | **La fisarmonica**            | Chiusa. Classe → categoria → sottocategoria → transazioni. Il cuore   | ~420 px      |
| 4   | **Nel tempo**                 | **Un solo** grafico, con selettore metrica + finestra                 | ~340 px      |
| 5   | **Le tue analisi**            | Assente finché non c'è un widget. Max sei                             | 0 px         |

Circa **1.000 px con l'area widget vuota**, cioè meno di due schermate — sotto i 1.645 px del
cruscotto. Quindi sì: **il layout preserva il principio**, a tre condizioni che non sono negoziabili
perché sono esattamente ciò che lo faceva saltare la volta scorsa:

1. **la fisarmonica nasce chiusa.** Aperta al primo livello sono già trecento pixel in più, e la
   pagina scivola sotto le due schermate senza che nessuno se ne accorga;
2. **«Nel tempo» è uno.** Non uno per metrica, non uno affiancato. È il patto che rende accettabile
   il selettore;
3. **«Le tue analisi» non ha stato vuoto.** Niente riquadro tratteggiato: quando non ci sono widget
   la sezione non esiste. Un vuoto dichiarato è un compito, un'assenza no.

**Il collegamento fra 3 e 4**, che è la cosa che manca alla tua proposta: dopo aver aperto
«Ristoranti» nella fisarmonica, il grafico sotto parla d'altro, e si scorre oltre un ramo aperto per
arrivare a un grafico scollegato. Ogni riga della fisarmonica porta quindi una piccola azione
**«nel tempo»** che scorre al blocco 4 e ne imposta la metrica. Nessuno stato condiviso, nessuna
sorpresa: il grafico resta indipendente, ma raggiungerlo dal ramo giusto costa un tocco.

---

## E. Il modello definitivo del copilota

> **Il copilota è l'interfaccia in linguaggio naturale verso il modello finanziario
> dell'applicazione. Sceglie cosa chiedere, legge quello che le funzioni gli rispondono, lo
> interpreta e propone azioni. Non calcola, non decide, non ricorda, e non possiede nessuna
> verità.**

Sono d'accordo con la tua definizione. Le implicazioni tecniche, che sono la parte che vincola:

1. **Nessuno strumento del copilota esegue logica propria.** Ogni strumento è una vista o una
   funzione già usata da una schermata. Se una risposta richiede una logica che non esiste in SQL,
   la si scrive in SQL — non nello strumento.
2. **Il corollario nuovo, ed è quello che chiude il cerchio:** _ogni operazione del copilota
   dev'essere raggiungibile anche senza copilota._ La regola della Fase 0 diceva l'inverso — ogni
   operazione dev'essere raggiungibile dal copilota — e insieme dicono che il copilota è **una
   seconda porta, mai la sola**. Se resta l'unica porta a qualcosa, di quella cosa diventa il
   proprietario, ed è precisamente ciò che questa definizione nega.
3. **Il modello non sceglie mai un termine di paragone.** Media contro mediana lo decide la funzione,
   e il nome del campo lo dice (`media_mensile_recente`, non `riferimento`). È il difetto della
   Fase 9 — «ben oltre la media… che era −2829,02 €» su una mediana — e non si ripara con le
   istruzioni.
4. **Le letture non contengono cifre.** Vedi §UI del «perché».

---

## F. MVP — nove interventi, in quest'ordine

1. **Migration unica: `episodico` + `rimborso_stato` + `rimborso_importo`**, con la ricostruzione di
   `v_expenses` e, in ordine e senza `cascade`, delle tredici viste che ci stanno sopra. Una volta
   sola, per tutte e tre le colonne.
2. **`episodico` nel rilevatore di ricorrenze.** Escluso **sia dalla somma sia dall'intervallo di
   date**: tenere l'occorrenza allungando il periodo senza aggiungerne la spesa abbasserebbe il
   costo mensile, ed è lo stesso errore già documentato per i movimenti senza cambio. Escluso anche
   dal `category_spike` del motore avvisi — un mobile da 1.200 € non è un picco da segnalare, è la
   cosa che l'utente ci ha appena detto.
3. **I fatti tipizzati nella proiezione degli strumenti.** `episodico`, `usage_verdict`,
   `manually_categorized`, `context`, `classificazione_variabile`. È il pezzo più economico e più
   visibile: dopo questo il copilota _sembra già ricordare_.
4. **Proposta «segna come episodica»**, con l'effetto mostrato prima di applicare
   (_«il costo ricorrente di Booking.com scende da 266,50 a 41,20 €/mese»_).
5. **`obiettivi`**: tabella stretta, tipizzata, con `valido_fino_a` obbligatoria. Nel prompt.
6. **`chat_conversations`**: titolo, ★, `ultima_at`, scadenza a 30 giorni, cancellazione.
7. **Grammatica dei widget + validatore**, che risolve **solo** su viste esistenti. Tre tipi:
   `andamento`, `numero`, `confronto`.
8. **`/dove` nuova**: intestazione, fisarmonica, «Nel tempo», e l'area analisi vuota (cioè assente).
9. **`widgets` + «Aggiungi a Dove»**, tetto di sei, `ultimo_sguardo_at`, e il pannello **«perché?»**.

Il taglio fra 6 e 7 è netto: **dall'1 al 6 non si tocca nessuna schermata nuova**, e il valore è già
quasi tutto lì. Se il tempo finisce, finisce bene.

---

## G. Cosa si rimanda

**V2** — la seconda lettura dei rimborsi (aggregato del costo personale, riga «costo personale
stimato», stato `ricevuto` che sconta davvero); `context_event`; il grafico giornaliero se non si
riesce a renderlo toccabile subito; `episodico` a livello di esercente.

**V3** — `alert_rules` col motore notturno e la `dedupe_key` per le regole utente; la UI «cosa il
copilota sa di te», che a quel punto è una schermata piccola (gli obiettivi, più un elenco
_derivato_ dei fatti col collegamento a dove si cambiano); il saldo dei conti e «posso
permettermelo».

**Mai** — memoria vettoriale; punteggi di confidence; un secondo canale di notifiche; widget con
filtri liberi; `insight card` salvate; una `/dove` senza fisarmonica.

---

## Le tre specifiche che servono all'implementazione

### I periodi — tre forme che non si possono confondere

Sono **tre chiavi diverse**, non tre valori della stessa: un errore di battitura non può
trasformare una finestra in un'altra.

```jsonc
{ "ultimi_mesi": 12, "incluso_il_corrente": false }   // scorrevole
{ "anno": 2026 }   |   { "mese": "2026-07" }          // fissa
{ "corrente": "mese" }                                 // in corso
```

Tre regole applicate dal server, non dal prompt:

- `incluso_il_corrente` è **obbligatorio** su ogni finestra scorrevole. Niente default: un mese
  parziale dentro una media di mesi interi è il difetto che il cruscotto ha già pagato una volta;
- un **`confronto`** che riceve `{ "corrente": … }` da una parte e una finestra intera dall'altra è
  **rifiutato**, a meno che entrambe passino da `spesa_nei_primi_giorni()`. Undici giorni contro
  trentuno si legge come un crollo;
- una finestra fissa **non scorre mai**. È la garanzia che un widget «anno 2026» non mostri il 2027.

### Il confine fra libertà del modello e autorità del server

| Il modello sceglie                               | Il server decide e verifica                                    |
| ------------------------------------------------ | -------------------------------------------------------------- |
| quale **misura** è pertinente                    | che quella misura **esista** come vista/funzione               |
| quale **entità** guardare                        | che l'entità esista **davvero** (uuid/slug su una riga vera)   |
| quale **periodo**                                | che la forma del periodo sia valida, e le regole sul parziale  |
| quale **rappresentazione** fra quelle supportate | che il tipo regga quella misura                                |
| **se** vale la pena mostrare un grafico          | **i valori**, il **titolo**, l'**unità**, il **formato**       |
| le **parole** intorno                            | il **termine di paragone** (media o mediana, e come si chiama) |

La libertà è ampia — il modello può combinare misura, entità, periodo e forma come vuole — e la
falsità semantica resta impossibile, perché **ogni combinazione valida corrisponde a una query che
una persona ha scritto.** Una spec che non risolve viene **rifiutata, mai corretta**: una spec
aggiustata a metà produce un grafico plausibile che risponde a un'altra domanda.

### «Perché?» — la UI, e la regola che la rende affidabile

```
   Ristoranti · 460 € questo mese
   ▸ perché?

   ─── aperto ───────────────────────────

   Media di 6 mesi                310 €
   Questo mese                    460 €
   Variazione                    +48 %
   ───────────────────────────────────────
   ✳  Copilota
      Sopra il tuo andamento recente.
```

Tre scelte, e la terza è quella che conta:

1. **Sopra la linea, solo coppie nome/valore**, cifre tabulari (`.cifra`), nessuna prosa. Si leggono
   incolonnate senza leggerle;
2. **Sotto la linea, la lettura**, con lo stesso segno usato per il copilota nella barra in basso.
   Nessuna etichetta tipo «generato da AI»: il segno è già il marcatore, e la parola «AI» dentro
   un'app finanziaria personale è rumore;
3. **Sotto la linea non compare nessuna cifra.** Se l'interpretazione ha bisogno di un numero, quel
   numero sta già sopra. È una regola strutturale, verificabile con un test: rende il controllo
   `cifreInventate()` quasi superfluo _in questo pannello_, invece di doversene fidare.

### Il titolo della chat — il modello può scriverlo, e non viola niente

Il principio «la descrizione la scrive il server» esiste perché una descrizione di **un'azione**
deve corrispondere all'azione eseguita, e il titolo di **un widget** alla query che contiene. Il
modo di fallire è: _approvi una cosa e ne succede un'altra._

Il titolo di una conversazione non descrive nessun oggetto strutturato. Il modo di fallire è: _un
titolo un po' storto_. Non è la stessa categoria di rischio, e trattarla come tale sarebbe rigore
applicato dove non serve.

Quindi: **generato dal modello dopo il secondo scambio, poi congelato** — un titolo che si riscrive
a ogni messaggio rende l'elenco illeggibile, perché quello che cerchi ieri oggi si chiama in un
altro modo. Modificabile a mano. Come ripiego, la prima domanda troncata, che è ciò che
`v_conversazioni` fa già.

### Il microcopy della ★

Non spiegare l'architettura da nessuna parte. Dirla **nel momento in cui interessa**, che è quando
si cancella:

- accanto alla stella, e basta: **«Conserva questa conversazione»**
- in cima all'elenco delle chat, una riga grigia: **«Le conversazioni si cancellano dopo 30 giorni.»**
- nella conferma di cancellazione — **questa è quella che fa il lavoro**:

  > **Elimini questa conversazione.**
  > I grafici salvati, le correzioni e i monitoraggi nati qui **restano**.

La terza riga è l'unico posto dove l'utente si sta chiedendo «e se perdo qualcosa?», ed è l'unico
dove la risposta serve. Detta prima sarebbe una spiegazione; detta lì è una rassicurazione.
