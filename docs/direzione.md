# La direzione dell'applicazione

> Scritto il 13 agosto 2026, dopo il primo vero uso del copilota e del cruscotto.
> Non è un piano di lavoro: è il documento su cui decidere **cosa** costruire e **perché**,
> prima di scrivere una riga. L'ordine di costruzione sta in fondo, ed è la parte meno
> importante.

---

## 0. Perché questo documento

Le prime dieci fasi hanno costruito una macchina che **legge la banca e dice la verità**: 1.323
movimenti, copertura al 94% in euro, un costo ricorrente verificato al centesimo contro l'app della
banca. Quella parte funziona.

Ma usata per davvero, per rispondere alla domanda per cui esiste — «come faccio a spendere meno» —
si è rotta in tre punti, tutti trovati in uso e non in revisione:

1. **La classificazione non regge il mondo reale.** `apple.com/bill` contiene un canone da 2,99 e un
   acquisto da 296. `Bruno Spa Modica` è un negozio di elettronica e la macchina non lo sa. Cinque
   ristoranti su sei si chiamavano «un privato».
2. **Il cruscotto mostra i numeri giusti nel modo sbagliato.** Sono tabelle e liste. La domanda
   «come sto andando questo mese» richiede di leggere, non di guardare.
3. **Il consiglio è povero.** «Disdici Anthropic» non è un consiglio: è un elenco. Il consiglio vero
   è «continua a mangiare fuori ma con Too Good To Go», e per darlo serve sapere cose che nei dati
   bancari non ci sono.

Questo documento affronta i tre punti insieme, perché sono lo stesso punto visto da tre lati: **la
qualità della risposta dipende dalla qualità di ciò che l'app sa di ogni spesa.**

---

## 1. Cosa è cambiato nell'obiettivo

`CLAUDE.md` dice, e resta vero:

> La metrica che l'app esiste per produrre è una sola: **costo ricorrente mensile per classe di
> discrezionalità.**

Quello che si aggiunge è **come si agisce su quel numero**. Finora l'unica leva prevista era
tagliare: disdici, riduci, smetti. Il brief dice un'altra cosa, ed è giusta:

> «Risparmiare non significa necessariamente tagliare delle cose, può significare anche utilizzare
> delle agevolazioni che ci sono nel mondo odierno.»

Quindi le leve diventano **tre**, e vanno tenute distinte perché richiedono azioni diverse e
producono risparmi di affidabilità diversa:

| Leva                        | Esempio                                      | Risparmio              | Costo per te        |
| --------------------------- | -------------------------------------------- | ---------------------- | ------------------- |
| **Disdire**                 | Un abbonamento che non usi                   | Certo, misurato        | Un gesto, una volta |
| **Cambiare abitudine**      | Meno Deliveroo                               | Incerto, dipende da te | Continuo            |
| **Stessa vita, meno costo** | Deliveroo Plus, Too Good To Go, Revolut Plus | Stimato, verificabile  | Un gesto, poi zero  |

La terza è nuova ed è quella che il brief chiede con più insistenza. È anche la più pericolosa:
richiede che l'app sappia cose sul mondo, e ogni cosa che sa sul mondo può essere **falsa o
vecchia**. Ci torniamo al §5.2.

**Conseguenza per la metrica**: non cambia. Il costo ricorrente resta il numero. Ma accanto nasce
una seconda misura, `risparmio_attivabile`, che è la somma di ciò che si può ottenere **senza
cambiare comportamento** — ed è l'unica che si può promettere senza mentire.

---

## 2. Il problema centrale: la classificazione

### 2.1 Perché è difficile davvero

Il brief dice: «avevo comprato che non fosse così difficile categorizzare delle cose». È una
osservazione giusta e vale la pena spiegare esattamente dove si rompe, perché i tre casi hanno tre
cure diverse e confonderli fa costruire la cosa sbagliata.

**Caso A — l'etichetta è muta, ma il mondo la conosce.**
`Bruno Spa Modica`, `Aspit Campogalliano`, `Panfe Bologna`. Un umano con un motore di ricerca
risolve in dieci secondi: è un negozio di elettronica, è un'azienda di trasporti, è una panetteria.
L'informazione **esiste fuori** e l'app non la va a prendere. Oggi il modello tira a indovinare, e
in Fase 4 è stato misurato: su `Aspit` ha risposto _«associazione bar/ristorazione in Emilia»_, che
è inventato di sana pianta.
→ **Cura: cercare davvero.** §2.2, strato 2.

**Caso B — l'esercente è giusto ma ospita cose diverse.**
`apple.com/bill` = iCloud 2,99 **e** un acquisto da 296,61 **e** campagne TikTok. `Amazon` =
qualsiasi cosa. La banca scrive la stessa identica stringa, e nessuna quantità di intelligenza può
separarle: l'informazione **non esiste nei dati**, sta nella testa di chi ha comprato.
→ **Cura: chiedere, al momento giusto.** §2.3.

**Caso C — l'intento non è nell'acquisto.**
Il computer da Euronics comprato per lavorare. Stesso negozio, stesso importo, stessa causale di una
sciocchezza. Nemmeno la ricerca web aiuta.
→ **Cura: chiedere, e ricordare per sempre** (`manually_categorized`). Già fatto.

I tre casi hanno proporzioni molto diverse. Sui dati attuali: **A è la maggioranza** delle 24
etichette scoperte, **B sono una manciata di esercenti ma valgono tanto** (Apple da sola distorceva
42 €/mese sulla metrica principale), **C è raro ma incorreggibile senza input umano**.

### 2.2 I quattro strati, in ordine di costo

Oggi ce ne sono tre (alias → LLM → correzione umana). Il quarto è nuovo e va **in mezzo**.

**1. Alias deterministici** — invariato. Coprono la quasi totalità dei movimenti ricorrenti, costano
zero, non sbagliano mai. Restano il primo strato.

**2. Ricerca del mondo reale** _(nuovo)_. Per un esercente mai visto, prima di chiedere al modello
di indovinare, si **cerca cosa sia**. Il risultato della ricerca entra nel contesto della proposta,
così il modello classifica da un fatto invece che da una somiglianza di suono.

La differenza è tutta qui:

> _Senza ricerca_: «Bruno Spa» → importo alto → suggerisce spesa casa → `casa`/`essenziale`. **Falso,
> ed è la classe che più distorce la metrica.**
>
> _Con ricerca_: «Bruno Spa Modica: rivenditore di elettronica ed elettrodomestici, Modica (RG)» →
> `Shopping > Elettronica`. **Vero, e verificabile.**

Il risultato della ricerca si **salva su `merchants`** (`descrizione_trovata`, `fonte`,
`cercato_at`): si paga una volta per esercente, non a ogni classificazione, ed è consultabile quando
un anno dopo ci si chiede perché quella spesa sta lì.

**3. Conferma umana al momento giusto** — §2.3.

**4. Correzione, che diventa memoria** — invariato, e già solido: alias per l'esercente,
`manually_categorized` per la riga, `sposta_movimento` per la riga che appartiene altrove.

### 2.3 Il ciclo di conferma, e il vincolo che nessuno può aggirare

Il brief chiede: «appena io faccio una transazione mi arriva la notifica e mi dice, io te l'ho
clusterizzata come questo, tu come la vuoi clusterizzare? Ma deve essere subito.»

**La parte "subito" non è ottenibile, e non per pigrizia.** La PSD2 concede a un AISP **4 accessi al
giorno** ai dati del conto quando il cliente non è presente. Revolut riesce a notificarti in un
secondo perché il conto è suo: legge la propria autorizzazione, non un'API di terzi. Un'app che
legge il conto tramite open banking non può, e nessuna lo fa.

**Deciso: 4 sincronizzazioni al giorno, più una a ogni apertura dell'app.** Ritardo medio circa tre
ore, massimo sei. Quando apri l'app la sincronizzazione parte subito e senza limiti — quindi se hai
appena pagato e vuoi classificare adesso, apri l'app e c'è.

Perché il ritardo conta meno di quanto sembri: la ragione per cui il brief vuole «subito» è che
_«non me lo scordo, lo faccio, è questione di due secondi»_. Il nemico è l'**arretrato**, non il
ritardo. Tre ore dopo l'acquisto ricordi ancora perfettamente cosa hai comprato; tre settimane dopo
no. Quattro notifiche al giorno da due movimenti l'una si smaltiscono; una notifica settimanale da
quaranta movimenti si chiude.

**Cosa serve costruire:**

- **Web Push** su PWA. Su iOS funziona solo se l'app è aggiunta alla schermata iniziale (già
  supportata: `env(safe-area-inset-*)` c'è dalla Fase 6). Serve `service-worker.js`, le chiavi VAPID
  fra i segreti, una tabella `push_subscriptions`.
- **Il cron passa da 1 a 4 esecuzioni** (`0 7,13,19,23 * * *`), e **notifica solo se c'è qualcosa**.
  Una notifica che dice «0 movimenti» insegna a ignorarle, ed è lo stesso principio degli avvisi
  della Fase 8.
- **La sincronizzazione all'apertura**: un accesso "customer present" non conta nel limite di 4.
- **La schermata di conferma diventa l'atterraggio della notifica**, e deve fare tutto con un
  pollice: la categoria proposta, un tocco per accettarla, un tocco per cambiarla fra le tre più
  probabili, e solo in fondo la ricerca libera.

### 2.4 L'algoritmo deve imparare, e cosa vuol dire davvero

Il brief: «deve essere recettivo, deve capire questa cosa qui». Vale la pena essere precisi su cosa
è realistico, perché «impara» può voler dire due cose molto diverse.

**Quello che si può fare, ed è quasi tutto il valore:** ogni correzione scrive una **regola
esplicita** — un alias, un `manually_categorized`, un `own_counterparty`. Non è statistica: è
memoria. Correggi `Bar Fucsia` una volta e non te lo richiede mai più, per sempre, con certezza. È
già così, e la Fase 4 ha misurato che gli alias coprono la quasi totalità dei ricorrenti.

**Quello che si può aggiungere:** le correzioni diventano **esempi** nel contesto della prossima
proposta. Se hai messo tre negozi di ferramenta in `Casa > Arredamento`, il modello vede quelle tre
scelte quando classifica il quarto. Costa poche centinaia di token e cattura le tue preferenze senza
nessun addestramento.

**Quello che NON si deve fare:** un modello che "impara le tue abitudini" in modo implicito e
opaco. Su un'app di spese, un classificatore che cambia idea da solo produce numeri che si muovono
senza che nessuno abbia toccato niente — ed è il guasto peggiore possibile, perché è invisibile.
Ogni cosa che l'app "ha imparato" dev'essere una riga leggibile che si può cancellare.

---

## 3. Il cruscotto

### 3.1 Le due domande dei primi tre secondi

Aprendo l'app, prima di toccare qualsiasi cosa, si deve poter rispondere a:

1. **Quanto ho speso questo mese, e sto andando peggio o meglio del solito?**
2. **Dov'è finito, e cosa è cambiato rispetto al solito?**

Tutto il resto è discesa, e la discesa si fa col dito.

### 3.2 La struttura, dall'alto in basso

```
┌─────────────────────────────────────┐
│  agosto 2026                    ⚙   │
│                                     │
│         −1.842,50 €                 │  ← il numerone
│    ▲ 12% sui primi 13 giorni        │  ← confronto OMOGENEO (§3.4)
│    di luglio (−1.644,60 €)          │
│                                     │
│  ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░   │  ← barra piena, segmentata per classe
│  essenz. utile voluttuario invest.  │
│                                     │
│  ● essenziale    −742  ▬  0%        │  ← delta per classe, con la freccia
│  ● utile         −512  ▲ 15%        │
│  ● voluttuario   −488  ▲ 31%        │
│  ● investimento  −100  ▼ 40%        │
├─────────────────────────────────────┤
│  ⚠ Mangiare fuori: 312 € questo     │  ← avviso di buon senso, §4
│    mese contro 180 € del tipico.    │
│    [ spiega perché ]  [ ignora ]    │
├─────────────────────────────────────┤
│         ◕ ciambella per categoria    │  ← si tocca una fetta
│                                     │
│  Ristorazione   −312   ▲ 73%        │
│  Alimentari     −280   ▬  2%        │
│  Casa           −520   ▬  0%        │
│  …                                  │
├─────────────────────────────────────┤
│  Ricorrente: −435 abbonamenti ·     │  ← la metrica, sempre visibile
│              −1.610 abitudini       │
└─────────────────────────────────────┘
```

**Perché la barra segmentata E la ciambella.** Rispondono a due domande diverse. La barra dice
_«come si divide la mia spesa fra le quattro classi»_, che è la metrica dell'app e ha sempre le
stesse quattro voci — quindi la sua forma si impara e un mese anomalo si riconosce a colpo d'occhio.
La ciambella dice _«in cosa»_, ha trenta voci possibili e cambia ogni mese: serve a scegliere dove
scendere, non a essere memorizzata.

**Le frecce ▲▼▬ sono il cuore della schermata.** Il brief lo dice bene: «abbonamenti stabile, quindi
0%; voluttuario +15%». Un numero da solo non dice niente; un numero con la sua variazione dice se
c'è qualcosa da guardare. La soglia sotto cui si mostra ▬ («stabile») è una decisione aperta —
proposta: **±5%**, sotto è rumore.

### 3.3 La discesa

```
classe                    tocchi «voluttuario»
  └── categoria           tocchi «Ristorazione»
        └── sotto-categoria   tocchi «Delivery»
              └── esercente       tocchi «Deliveroo»
                    └── movimento     → la scheda, dove si corregge
```

Quattro livelli, ognuno con lo stesso identico modo di funzionare: un totale in cima, un confronto
col tipico, un elenco ordinato per importo, ogni riga tocca il livello sotto. **Una schermata
sola, parametrizzata**, non quattro pagine diverse — o divergeranno, come diverge sempre tutto ciò
che è scritto due volte.

**A ogni livello si può correggere**, ed è la richiesta esplicita del brief. Le correzioni
disponibili cambiano col livello, e non è un dettaglio:

| Dove      | Cosa cambi                                    | Portata                              |
| --------- | --------------------------------------------- | ------------------------------------ |
| Movimento | categoria, discrezionalità, esercente         | Solo questa riga, per sempre         |
| Esercente | categoria, discrezionalità, abbonamento sì/no | Tutte le sue spese, passate e future |
| Categoria | nome, genitore, discrezionalità predefinita   | La tassonomia                        |

Oggi queste tre cose vivono in tre schermate diverse (`/da-confermare`, `/revisione`,
`/movimenti/[id]`), e trovarle è un rompicapo. **Vanno portate dove si guarda il numero**, con
scritto sopra fin dove arriva l'effetto.

### 3.4 Le regole sui numeri, che non si negoziano

Queste valgono già e vanno riportate qui perché il cruscotto nuovo le può rompere senza accorgersene:

- **Il mese in corso non si confronta con un mese intero.** Tredici giorni contro trentuno si
  leggono come un crollo. Il confronto è sempre **la stessa finestra** nei mesi precedenti
  (`spesa_nei_primi_giorni`, già costruita). Vale anche per le percentuali per classe: servirà
  l'equivalente per classe e per categoria.
- **Il riferimento è la mediana scelta, mai la media.** Un mese realmente osservato. E si chiama
  «il mese tipico», mai «la media» — in Fase 9 il modello ha reso falsa una frase con un numero
  giusto proprio chiamandola male.
- **Lo zero è sempre nel dominio dei grafici.** Già imposto in `lib/copilota/grafico.ts`.
- **Nessuna aritmetica in TypeScript sul denaro**, e nessuna nel modello. Le percentuali di
  variazione sono aritmetica: **vanno calcolate in SQL**, in una vista, non in un componente.
- **Ogni numero deve poter essere scomposto** fino alle righe che lo compongono. È la ragione per
  cui la discesa arriva fino al movimento.

### 3.5 Cosa il cruscotto non deve avere

- **Nessun budget.** Deciso in Fase 6-bis e confermato: un budget che si sfora ogni mese diventa
  rumore, e questa app misura, non prescrive.
- **Nessuna proiezione.** «A questo ritmo spenderai X» è un'estrapolazione travestita da
  informazione. In Fase 5 lo stesso errore dichiarava 8.966 €/mese di spesa inesistente.
- **Nessun punteggio di salute finanziaria.** Un numero composito nasconde da cosa è composto, e
  questa app esiste per il motivo opposto.
- **Niente scorrimento laterale**, niente tabelle larghe: si guarda dal telefono (§6).

---

## 4. Gli avvisi di buon senso, e le spiegazioni

Gli avvisi della Fase 8 sono **meccanici**: prezzo salito, abbonamento nuovo, doppio addebito. Il
brief ne chiede un altro tipo:

> «Guarda che tu non vuoi spendere tutti i soldi per mangiare fuori, no? C'è qualcosa che non va.»

È un avviso **sull'abitudine**, non sull'evento, e regge solo se ha due proprietà.

**Deve essere raro.** Un'app che commenta ogni spesa diventa un'app che si silenzia. Proposta: al
massimo **un avviso di buon senso alla settimana**, quello con lo scarto più grande dal tipico, e
solo sopra una soglia in euro che lo renda degno di attenzione.

**Deve accettare una risposta.** Ed è la parte più originale del brief:

> «Nell'alert posso anche mettere una nota tipo "viaggio di Amburgo", e a fine anno mi rendo conto
> del perché ho speso quei soldi.»

Questa è una funzione che non esiste in nessuna app di spese che io conosca, ed è giusta. Una
categoria che sfora ha **sempre** una causa; se la causa la scrivi nel momento in cui te la chiedono,
a fine anno il grafico non ha buchi inspiegabili. Se non la scrivi, a dicembre guardi «aprile: 900 €
in ristoranti» e non sai più se era un problema o un matrimonio.

**Progettazione: una tabella `spiegazioni`.**

```
spiegazioni
  id, periodo_inizio, periodo_fine
  categoria_id | discrezionalita | merchant_id   (uno dei tre: cosa spieghi)
  testo         -- "viaggio ad Amburgo, 4 giorni"
  created_at
```

Le conseguenze sono più grandi della tabella:

- l'anomalia spiegata **non viene più segnalata** — l'avviso non torna a chiedere la stessa cosa;
- il **report della Fase 9** legge le spiegazioni e le racconta: «aprile è alto ma l'avevi spiegato:
  viaggio ad Amburgo»;
- il **copilota** le ha fra i suoi dati, quindi «perché ad aprile ho speso tanto?» ha una risposta
  vera invece di un'ipotesi — ed è esattamente il modo di sbagliare misurato in Fase 4;
- sul cruscotto, un mese spiegato porta un segno che lo dice.

---

## 5. Il copilota

### 5.1 I grafici su richiesta

Esiste già (`grafico_mensile`), e va allargato a ciò che il brief chiede: **il grafico di una
categoria, di una classe, di un esercente**, e il confronto fra due periodi.

Il vincolo che non cambia: **il modello sceglie cosa disegnare, mai cosa c'è dentro.** I punti
escono da una query. Un grafico i cui valori li scrivesse lui sarebbe la cosa più pericolosa
dell'applicazione, perché una figura si guarda e non si ricontrolla.

Il grafico per esercente ha un problema suo: metà delle etichette diventerebbero «un privato». Con
la garanzia della carta (§5.2) il problema si riduce molto, ma resta: **su un grafico per esercente
si mostrano solo i nomi garantiti**, e gli altri si raggruppano in «altri».

### 5.2 I consigli ricercati — l'architettura, e le tre difese

**Deciso: ricerca web al momento, con verifica.** È la scelta che rende possibile metà del brief, ed
è anche la più rischiosa dell'intera applicazione. In Fase 4, su cento proposte, il modello ha
inventato una motivazione plausibile pur di averne una. Qui inventerebbe **uno sconto**, e un
consiglio finanziario falso è peggio di nessun consiglio.

Tre difese, in ordine di forza.

**Difesa 1 — il consiglio nasce da un fatto tuo, non da un'idea.**
Il copilota non cerca «come risparmiare». Parte da una spesa misurata: `Deliveroo, 59 ordini,
129,76 €/mese`. Poi cerca **quella cosa lì**. Un consiglio che non è agganciato a una riga dei tuoi
dati non si mostra.

**Difesa 2 — ogni cifra esterna è marcata come esterna.**
Il controllo delle cifre della Fase 10 confronta ciò che il modello scrive con i dati ricevuti.
Le cifre trovate in rete non sono nei tuoi dati, quindi verrebbero **tutte** segnalate — il che
renderebbe l'avviso inutile. Quindi cambia forma: le cifre esterne restano permesse ma nascono
**visibilmente separate**, con la fonte accanto:

> **Deliveroo Plus** — 4,49 €/mese _(deliveroo.it, letto il 13/08/2026)_
> Con 59 ordini in nove mesi eviteresti la commissione di consegna. **Quanto risparmieresti non lo
> so**: dipende dalla commissione dei tuoi ordini, che nei dati bancari non compare.

Quell'ultima frase è la parte che conta. Il modello **deve** dire cosa non sa. Un consiglio che
promette «risparmi 1,50 € a transazione» senza avere il dato è esattamente l'errore che questo
progetto combatte da dieci fasi.

**Difesa 3 — la ricerca ha un perimetro, e la regola 8 si estende.**
**Deciso: escono solo i nomi garantiti dalla carta.** `v_esercenti_da_carta` già esiste ed è la
garanzia che viene dai dati e non da un'inferenza. Un bonifico a un privato non finisce mai in un
motore di ricerca — e a differenza di una chiamata a un LLM, una query di ricerca finisce in log che
non controlliamo e non si cancellano.

La regola 8 va quindi riscritta con un **secondo livello**:

> 8a. Verso un LLM: nome esercente normalizzato, importo, data, categoria, aggregati.
> 8b. **Verso un motore di ricerca: solo il nome dell'esercente, e solo se garantito da carta.
> Mai un importo, mai una data, mai insieme ad altro.** Che io abbia speso 300 € da un negozio è un
> fatto che non deve uscire nemmeno quando il negozio può.

**Cosa serve costruire**: uno strumento `cerca_sul_mondo(esercente | domanda)` che filtra
l'interrogazione, chiama la ricerca, ne conserva l'esito con data e fonte, e lo restituisce
marcato come **esterno e non verificato**.

### 5.3 Le chat

Tre cose, tutte piccole e tutte giuste:

- **Più conversazioni**, non una sola. L'elenco esiste già (`v_conversazioni`); manca la schermata
  che le mostra come schermata principale del copilota invece che come menu a tendina.
- **Scadenza a 30 giorni.** Le conversazioni sono quasi sempre usa-e-getta e ricostruibili. Un
  archivio infinito è un archivio che non si cerca.
- **Il segnalibro salva dalla scadenza.** Una colonna `salvata_at`, e le salvate non scadono mai.

Nota su cosa si cancella: i **dati che il modello ha ricevuto** (`strumenti`) sono la prova che
serve a distinguere un errore del modello da un errore della query. Proposta: alla scadenza si
cancella la conversazione **intera**, prova compresa — se dopo trenta giorni nessuno ha guardato una
frase sospetta, non la guarderà più, e tenere dati bancari in giro «per sicurezza» è il contrario
della sicurezza.

### 5.4 Le query proposte

**Deciso: il copilota può scrivere query, ma le approvi tu.** Vale la pena scrivere perché è la
scelta giusta anche se sembra la più scomoda.

Una query SQL su questo database può leggere `raw_description` e `counterparty_raw`, cioè
esattamente i nomi e gli IBAN che la regola 8 esiste per proteggere. Con l'approvazione, la query
la **leggi prima** che venga eseguita: è la stessa forma delle scritture, e per la stessa ragione —
ciò che succede dev'essere ciò che hai visto.

Due dettagli che la rendono sopportabile:

- **si esegue in sola lettura**, con un ruolo che non ha `insert`/`update`/`delete`, e in
  transazione con timeout. Anche approvando distrattamente, il danno possibile è zero;
- **il risultato passa comunque dalla regola 8** prima di tornare al modello. L'approvazione non è
  un permesso di vedere tutto: è un permesso di **chiedere** tutto.

Quando una query si rivela utile due volte, **diventa un'operazione nominata**. Le query proposte
sono l'esplorazione; le operazioni nominate sono ciò che resta.

---

## 6. La grafica

Il giudizio del brief — «non mi piace molto, mi piacerebbe una cosa più alla Revolut» — è corretto e
la causa è precisa: l'interfaccia attuale è fatta di **testo allineato**, e Revolut è fatta di
**oggetti**. Cosa cambia concretamente:

- **Il numero è l'elemento grafico principale.** Grande, cifre tabulari, la valuta piccola accanto.
  Oggi il totale del mese ha la stessa dimensione di un titolo.
- **Ogni cosa è una scheda** con un bordo morbido e uno stacco dal fondo, non una riga in un elenco.
  Una scheda dichiara «questo si tocca».
- **Il colore ha un significato e uno solo**: la classe di discrezionalità. Quattro colori, sempre
  gli stessi, sul cruscotto e nei grafici e nelle liste. Non decorazione — un codice.
- **Fondo scuro come predefinito.** È l'aspetto che il brief richiama, e su un telefono di sera è
  anche l'unico leggibile.
- **Il movimento è informazione**: una barra che cresce, un numero che sale. Non transizioni per
  fare scena.
- Restano i vincoli della Fase 6: **44 px** per ogni bersaglio toccabile, `env(safe-area-inset-*)`,
  niente scorrimento laterale, e la verifica con `scrollWidth` a 360/375/414 px — non a occhio, che
  una volta ha già quasi portato a "correggere" un layout corretto.

**Serve una libreria di grafici?** Propendo per no, e la ragione non è il peso: il pezzo di un
grafico che può sbagliare in silenzio è **lo scalamento degli assi**, e in `lib/copilota/grafico.ts`
è provato con tredici assert. Una libreria porterebbe il proprio, con lo zero fuori dal dominio
come impostazione predefinita — cioè il difetto che abbiamo eliminato. Ciambella e barre segmentate
sono geometria elementare. **Decisione aperta**: se servisse interazione ricca (trascinare,
zoomare), si rivaluta.

---

## 7. Infrastruttura

### 7.1 Accesso al database durante lo sviluppo

**Da fare subito, e sblocca tutto il resto.** Oggi ogni verifica sui dati veri costa un giro:
scrivo una query, la esegui, incolli il risultato. La diagnosi di Apple ha richiesto **quattro
scambi** per una cosa che con l'accesso diretto sarebbe stata una.

Due strade, entrambe da dieci minuti: il **server MCP di Supabase**, oppure la stringa di
connessione del pooler in una variabile d'ambiente, e uso `psql`. In entrambi i casi con un ruolo
di **sola lettura** — lo sviluppo non ha bisogno di scrivere, e un ruolo che non può scrivere non
può sbagliare.

### 7.2 Cosa cambia nel cron

Da uno a quattro giri (`0 7,13,19,23 * * *`). Il giro pesante — proposte AI, rilevamento ricorrenze,
avvisi — resta **una volta sola** al giorno: gli altri tre scaricano, normalizzano, categorizzano
con gli alias e notificano se c'è qualcosa. Costo quasi invariato, ritardo diviso per quattro.

### 7.3 I limiti da non dimenticare

| Limite                    | Valore                     | Conseguenza                               |
| ------------------------- | -------------------------- | ----------------------------------------- |
| Accessi PSD2 senza utente | 4 al giorno                | Nessuna notifica in tempo reale           |
| Consenso Revolut          | 180 giorni                 | Va rinnovato via SCA, l'avviso c'è già    |
| Web Push su iOS           | Solo da schermata iniziale | Va spiegato all'utente al primo avvio     |
| Durata funzione Vercel    | 300 s                      | I giri lunghi restano a fette con cursore |

---

## 8. Le decisioni prese

| Tema                     | Decisione                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Consigli                 | **Ricerca web con verifica**, ogni cifra esterna marcata con fonte e data             |
| Regola 8 verso l'esterno | **Solo esercenti garantiti da carta**, e solo il nome — mai importi né date           |
| Notifiche                | **4 sincronizzazioni al giorno + a ogni apertura**. Notifica solo se c'è qualcosa     |
| SQL del copilota         | **Query proposte, eseguite dopo approvazione**, in sola lettura, risultato sanificato |
| Metrica                  | Invariata. Si aggiunge `risparmio_attivabile`, la leva «stessa vita, meno costo»      |
| Grafici                  | Scritti a mano, per non perdere il controllo dello scalamento                         |

---

## 9. Le domande ancora aperte

Nessuna di queste blocca l'inizio, ma tutte cambiano il risultato.

**Sul cruscotto**

1. All'apertura: **il mese corrente** o l'ultimo mese completo? Oggi è l'ultimo con dati. Il mese
   corrente è più vivo ma il primo del mese è quasi vuoto.
2. La soglia sotto cui una variazione è «stabile»: **±5%** basta?
3. Le **entrate** stanno nella prima schermata o solo nella discesa? Oggi sono un denominatore.
4. Il conto **business** e quello **personale** vanno separati in cima, o restano una dimensione
   della discesa?

**Sulla classificazione**

5. Quando la ricerca web trova qualcosa, la classificazione risultante è **automatica** o resta da
   confermare? (Proposta: automatica ma marcata, come già fa `origine = 'ai'`.)
6. Le **sotto-categorie** attuali sono 11 su 34 voci. Il brief parla di «micro-categorie»: serve un
   terzo livello, o bastano più foglie sul secondo?
7. Quanto indietro si va a **riclassificare** quando una regola nuova migliora il passato? Tutto lo
   storico ogni volta, o solo da una data?

**Sui consigli**

8. Il copilota può **proporre di sottoscrivere** qualcosa, o solo informare? (Proposta: informare, e
   il collegamento lo apri tu — un'app che spinge ad abbonarsi a qualcosa ha un conflitto di
   interessi anche quando non ce l'ha.)
9. Le offerte trovate si **salvano** e si ricontrollano nel tempo, o si cercano ogni volta?

**Sulla privacy**

10. La ricerca passa da un motore generico o da un servizio che non conserva le interrogazioni? La
    differenza costa qualcosa ed è l'unica difesa che non dipende da noi.

---

## 10. Ordine di costruzione

Ogni riga è indipendente dalle successive e lascia l'app in uno stato migliore. Il criterio non è la
difficoltà: è **quanta della prossima cosa dipende da questa**.

| #   | Cosa                                                                             | Perché prima                                            |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **Accesso al DB in sviluppo**                                                    | Ogni verifica successiva costa un quarto                |
| 2   | **Ricerca del mondo reale** nella classificazione                                | La qualità di tutto il resto dipende da qui             |
| 3   | **Le variazioni in SQL** (per classe, categoria, esercente, a finestra omogenea) | Il cruscotto nuovo non esiste senza                     |
| 4   | **Il cruscotto**: numerone, barra, ciambella, discesa, correzione a ogni livello | È la schermata che si apre                              |
| 5   | **Notifiche e 4 sincronizzazioni**                                               | Chiude il ciclo di conferma                             |
| 6   | **Spiegazioni** e avvisi di buon senso                                           | Rende comprensibile il passato                          |
| 7   | **Consigli ricercati** nel copilota                                              | Il più rischioso: per ultimo, quando le difese esistono |
| 8   | **Chat multiple, scadenza, segnalibro**                                          | Indipendente, si può infilare ovunque                   |

**Il punto 2 prima del 4** è la scelta che conta. Un cruscotto bellissimo su una classificazione che
mette un negozio di elettronica in `casa/essenziale` è un modo elegante di guardare un numero
sbagliato — e questa applicazione esiste per il motivo opposto.
