# Audit dell'interfaccia — cosa manca perché sembri finita

> 22 agosto 2026. Nasce da una richiesta di «portare il prodotto al livello di un SaaS maturo».
> Il prototipo interattivo della direzione proposta sta in un Artifact separato; qui c'è il
> ragionamento, che è la parte che sopravvive.
>
> **Non è un documento di gusto.** Ogni difetto qui dentro è un conteggio sul codice o un calcolo
> di contrasto sui token di `globals.css`. Dove non ho potuto misurare, lo dico.

---

## 0. La conclusione, prima di tutto il resto

Questa applicazione **non ha un problema di aspetto**. Ha un sistema di token maturo (quattro
superfici, tre toni, sette tinte con un significato dichiarato), un modello di elevazione che
distingue chiaro e scuro per ragioni fisiche e non estetiche, gesti mobili che funzionano davvero
— foglio trascinabile, blocco dello scorrimento che regge su iOS, aree sicure, `<dialog>` nativo
con annidamento gestito. Molte applicazioni «premium» non arrivano qui.

Quello che le impedisce di sembrare finita sono **quattro difetti misurabili**, e nessuno dei
quattro si risolve ridisegnando qualcosa:

1. un tono di testo che non è leggibile, usato in cento punti;
2. una tavolozza di dati che sul tema chiaro non si vede;
3. nessuna reazione al mouse, e nessun anello del fuoco dichiarato;
4. nessun annulla, nessun avviso passeggero, e un `router.refresh()` dopo ogni gesto.

Le prime due sono accessibilità. La terza è che l'app è stata progettata col pollice — giustamente
— e il mouse è rimasto indietro. La quarta è la ragione per cui **ogni azione sembra lenta anche
quando non lo è**.

---

## 1. Come ho misurato

- **Il codice**, contato: occorrenze di stati, di misure tipografiche, di raggi, di letture, di
  componenti client. Ogni numero di questo documento si rifà con un `grep`.
- **I token**, calcolati: rapporti di contrasto WCAG dai valori esatti di `globals.css`,
  compositando gli alfa sopra ognuna delle tre superfici e prendendo il caso peggiore.
- **Il comportamento**, letto: `foglio.tsx`, `menu.tsx`, `barra.tsx`, `livello.tsx` riga per riga.
- **Le fonti**, verificate: WAI-ARIA APG per il dialogo modale, WCAG 2.2 SC 2.4.13 per l'anello del
  fuoco, NN/g per conferma contro annulla, Material 3 per l'avviso passeggero, Apple HIG per i
  fogli.

**Cosa non ho misurato**: non ho potuto aprire l'applicazione autenticata (manca la chiave anon),
quindi niente misure di layout su schermate vere, niente tempi di interazione reali, niente prova
con un lettore di schermo. Le altezze di pagina e i bersagli sotto i 44 px vengono dalle misure già
in `CLAUDE.md`, non da una nuova sessione.

---

## 2. I difetti, per gravità

### Critici

**2.1 `--testo-3` non è leggibile, ed è il testo più piccolo dell'app.**
`rgb(5 7 10 / .34)` sul chiaro dà **2,28:1**; `rgb(245 245 247 / .36)` sullo scuro dà **2,96:1**.
Il minimo per un testo è 4,5:1; perfino la soglia dei soli elementi grafici, 3:1, non è raggiunta
sul chiaro. Sono **100 usi** di `text-testo-3` più la classe `.eti`, che è la micro-etichetta
maiuscola a 10,5 px sopra **ogni numero grande dell'applicazione**. Il testo più piccolo è anche
quello meno leggibile: i due difetti si moltiplicano invece di compensarsi.

**2.2 Le tinte delle classi spariscono sul tema chiaro.**
La tavolozza è quella di iOS in modalità scura, usata identica sul chiaro. Contro le superfici
chiare: ambra **2,06:1**, verde **2,02:1**, ciano **1,72:1**, bruno 3,08, rosa 3,52, viola 3,52,
blu 3,65. Il colore **è** la codifica della classe di spesa — pallini, barre, tessere, avatar — e
sotto 3:1 un elemento grafico non è percepibile. Sul tema chiaro la dimensione principale dell'app
diventa invisibile, e il ripiego (leggere il nome) funziona solo dove il nome c'è.

**2.3 Un errore del server mostra la pagina di Next.**
Esiste un solo `error.tsx`, su `debug/eb`. Nessun `error.tsx` di radice, nessun `not-found.tsx`. In
ogni altro punto un errore non gestito produce la schermata predefinita del framework: carattere
diverso, lingua inglese, nessuna via d'uscita, nessuna indicazione di cosa resti valido. È il
momento esatto in cui si decide se un prodotto è serio, ed è l'unico schermo dell'applicazione che
non è stato progettato.

### Alti

**2.4 Niente reagisce al mouse.** Un solo `hover:` in tutto il codice sorgente, zero `:hover` nel
CSS. Righe cliccabili, voci di menu, schede, tessere: nulla cambia al passaggio del puntatore. È
coerente con «questa applicazione si guarda dal telefono», ma il desktop è dove la si costruisce e
dove si fanno le sessioni lunghe di classificazione.

**2.5 L'anello del fuoco è quello del browser.** `focus-visible` non compare mai; l'unico anello
dichiarato è `focus:ring-2` sui campi — che per giunta usa `:focus` e non `:focus-visible`, quindi
compare anche al clic del mouse. Su tutto il resto vale l'anello predefinito dell'agente utente,
che sui fondi scuri è spesso invisibile e cambia da browser a browser. WCAG 2.2 SC 2.4.13 chiede
un'area pari a un perimetro di 2 px e 3:1 fra lo stato con e senza fuoco: non è verificabile se
l'anello non è nostro.

**2.6 I fogli compaiono di scatto.** Il `<dialog>` ha una transizione **solo** sul trascinamento:
all'apertura il pannello è già alla posizione di riposo, e il velo non sfuma. È l'unico punto
dell'applicazione in cui il movimento è obbligatorio — un pannello che appare senza salire non dice
da dove viene, e chiudendo sparisce senza dire dove va. Tutto il resto dell'app è giustamente
immobile, e questo lo rende più evidente, non meno.

**2.7 Nessun annulla, nessun avviso passeggero.** Zero `toast`, zero `undo`. Il modello di ogni
azione è `POST` + `router.refresh()`: **28 volte** nel codice, contro **174** stati d'attesa
(`inCorso`) scritti a mano uno per uno. La conseguenza di un gesto è «la pagina si ridisegna», che
a cache appena invalidata è la cosa più lenta che l'applicazione faccia — è il §10 di
`docs/prestazioni.md` visto dal dito.

### Medi

**2.8 L'applicazione contraddice la sua decisione migliore.** Il selettore di categoria è diventato
un foglio con ricerca, per ragioni scritte e giuste. Restano **27 `<select>` nativi**, di cui 7 su
`/revisione` e 5 su `/movimenti`: su un telefono sono colonne di righe da venti pixel coi nomi
troncati.

**2.9 La scala tipografica non è una scala.** **20** misure arbitrarie in pixel più **6** classi
Tailwind. `text-sm` e `text-[14px]` sono la stessa cosa scritta in due modi, **104 volte**;
`text-xs` e `text-[12px]`, **118 volte**. Non si vede a occhio — e infatti nessuno se ne è
accorto — ma rende impossibile cambiare la scala senza toccare ogni file.

**2.10 I moduli non parlano alle tecnologie assistive.** Zero `aria-invalid`, zero
`aria-describedby`, `required` su **2 campi su 42**. Il messaggio di errore è un paragrafo che
compare da qualche parte nella pagina, non collegato al campo che l'ha causato.

### Rifinitura

**2.11 Raggi fuori sistema.** `rounded-md`, `lg`, `2xl`, `t`, `br` accanto ai due token; `.marchietto`
scrive `12px` a mano. Piccolo, ma è il tipo di deriva per cui, se sette raggi convivono, l'ottavo
non lo ferma nessuno.

---

## 3. I principi

Tre li ha già l'applicazione e vanno **difesi**, non inventati:

1. **Il colore dice una cosa sola.** Indaco = «tocca qui». Le sette tinte = la classe di una spesa.
   Rosso, ambra, verde = un giudizio. Un quarto alfabeto renderebbe muti gli altri tre.
2. **«Niente» e «non lo so» sono due risposte diverse.** Una lista vuota perché non c'è nulla da
   fare e una vuota perché lo scarico è fermo si somigliano solo finché tutto funziona.
3. **Il pollice prima del mouse.** 44 px, foglio dal basso, barra galleggiante. Ma «prima» non vuol
   dire «solo».

Quattro sono nuovi, e nascono dai difetti:

4. **Ogni azione ha una conseguenza visibile, e quasi mai una domanda.** Se è reversibile: si fa, si
   dice, si offre l'annulla. La conferma si tiene per ciò che non torna indietro — ed è proprio per
   questo che verrà letta (NN/g).
5. **Il movimento spiega la provenienza.** Un pannello sale da dove è stato chiamato e torna dov'era.
   Ciò che non spiega niente non si anima: l'app deve sembrare veloce, non animata.
6. **Una scala per dimensione, e nessun valore fuori scala.** Se serve un valore che non c'è, si
   discute la scala — non si scrive il valore.
7. **Nessuna informazione vive solo nel colore.** Vale per chi non distingue i colori e per chi
   guarda lo schermo al sole.

---

## 4. Il sistema, corretto

### 4.1 Le sette tinte, sul tema chiaro

Stessa famiglia cromatica, luminosità abbassata finché passano. Le scure restano invariate: erano
già a norma. Il rapporto è il **peggiore** fra le tre superfici.

| Tinta | Ora       | Rapporto | Proposta      | Rapporto |
| ----- | --------- | -------- | ------------- | -------- |
| blu   | `#0a84ff` | 3,65     | **`#0063d8`** | **4,98** |
| ambra | `#ff9f0a` | 2,06     | **`#9a6200`** | **4,57** |
| rosa  | `#ff375f` | 3,52     | **`#d4003c`** | **4,87** |
| verde | `#30d158` | 2,02     | **`#0f7a34`** | **4,88** |
| viola | `#bf5af2` | 3,52     | **`#8f31c7`** | **5,48** |
| ciano | `#64d2ff` | 1,72     | **`#00688f`** | **5,57** |
| bruno | `#ac8e68` | 3,08     | **`#7d6144`** | **5,13** |

Passano tutte **4,5:1**, non solo il 3:1 richiesto agli elementi grafici: così la stessa tinta può
fare da pallino **e** da testo, e non servono due tavolozze per lo stesso significato.

### 4.2 I tre toni del testo

| Ruolo       | Chiaro                    | Scuro                     | Regola                                         |
| ----------- | ------------------------- | ------------------------- | ---------------------------------------------- |
| `--testo`   | `#05070a` · 18,1          | `#f5f5f7` · 15,6          | invariato                                      |
| `--testo-2` | α **.60** (era .56) · 5,0 | α **.62** (era .60) · 6,5 | nessun limite di misura                        |
| `--testo-3` | α **.44** (era .34) · 3,0 | α **.40** (era .36) · 3,3 | **mai sotto i 16 px, mai per un'informazione** |

E `.eti` passa da `--testo-3` a `--testo-2`: è una micro-etichetta a 10,5 px, cioè esattamente il
caso che la regola nuova esclude.

### 4.3 Sette misure di testo invece di ventisei

`eroe` 54/44 · `titolo` 22 · `sezione` 17 · `corpo` 15 · `secondario` 13 · `minuto` 12 ·
`etichetta` 11 (600, +.12em). La regola che tiene la scala è verificabile con un `grep`:
**nessun `text-[..px]` nel codice**.

### 4.4 Il resto

- **Superfici**: quattro, già giuste. La profondità viene dal valore, non da un bordo.
- **Raggi**: due token più la capsula — 22 scheda, 14 controllo, 999 capsula. Spariscono gli altri.
- **Elevazione**: due livelli, appoggiato e galleggiante. Non tre.
- **Spaziatura**: 4 · 8 · 12 · 16 · 24 · 32. Fuori scala solo le aree sicure, che sono misure del
  dispositivo e non del sistema.
- **Movimento**: 120 ms pressione · 170 ramo · 220 velo · 300 foglio, curva unica
  `cubic-bezier(.32,.72,0,1)` per ciò che entra ed esce.

---

## 5. Come si devono comportare i componenti

| Componente               | Oggi                                                                                     | Proposto                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Foglio**               | Esc, fondo, trascinamento, blocco scorrimento, aree sicure, annidamento: tutto corretto. | Sale in 300 ms, il velo sfuma in 220, chiudendo **scende**. Il fuoco lo gestisce già `<dialog>`: non si riscrive.                                                                                                          |
| **Menu a tendina**       | 27 `<select>` nativi.                                                                    | Foglio con ricerca sopra le 8 voci; segmentato sotto le 8. Nessuna tendina sopravvive.                                                                                                                                     |
| **Azione su una riga**   | `POST` + `router.refresh()`.                                                             | Aggiornamento ottimistico: la riga esce subito, l'avviso dice cosa è successo e offre **Annulla** per 6 s. Se il server rifiuta, la riga rientra **dove stava** e l'avviso diventa rosso.                                  |
| **Conferma distruttiva** | Nessuna.                                                                                 | Solo per ciò che non torna indietro. Tutto il resto: annulla.                                                                                                                                                              |
| **Riga di dati**         | Nessuno stato.                                                                           | Hover = velatura d'accento al 10%, **solo** dietro `@media (hover: hover)`. Pressione = stessa velatura, **senza** scala: una lista che rimbalza sotto il pollice è rumore. Fuoco = anello d'accento 2 px, 2 px di stacco. |
| **Campo**                | Superficie profonda, anello sul fuoco.                                                   | Etichetta sempre visibile, mai solo segnaposto. Errore **sotto il campo**, collegato con `aria-describedby`, campo con `aria-invalid`. Validazione all'uscita, mai a ogni tasto.                                           |
| **Attesa**               | 174 `inCorso` a mano.                                                                    | Una primitiva. Sotto **200 ms** non si mostra niente: un lampeggio è peggio dell'attesa.                                                                                                                                   |
| **Vuoto**                | «Sei in pari» è ottimo; le altre dicono «nessun risultato».                              | Cosa dovrebbe esserci, perché non c'è, cosa si può fare.                                                                                                                                                                   |
| **Errore**               | La schermata di Next.                                                                    | `error.tsx` di radice: cosa è successo, **cosa resta vero**, riprova. Più `not-found.tsx`.                                                                                                                                 |

---

## 6. Cosa non faccio, e perché

Otto cose tolte dalla proposta prima di mostrarla. Sette le avevo scritte davvero.

- **Una barra laterale sul desktop.** Sembra maturo in uno screenshot, ma questa app si usa dal
  telefono, e una seconda navigazione è una seconda cosa che può divergere dalla prima — la ragione
  per cui le due navigazioni di oggi non hanno **nessuna** voce in comune.
- **Lo scheletro su ogni caricamento.** L'app già trasmette a blocchi: uno scheletro su un confine
  da 120 ms fa _vedere_ un'attesa che non c'era.
- **Lo swipe per confermare.** Rapido e invisibile: nessuna etichetta, nessuna scoperta, e l'errore
  più costoso dell'applicazione affidato a un gesto involontario.
- **Un colore per ogni categoria.** Trentacinque tinte sono trentacinque colori che non vogliono
  dire niente accanto a tre che vogliono dire qualcosa (già deciso in `aspetto.md` §3.2 e §3.4).
- **Animazioni sull'ingresso delle liste.** Si vedono dieci volte al giorno e rallentano ogni volta.
- **Un pulsante «+» al centro della barra.** Lo chiede la forma, e sarebbe una bugia: qui i
  movimenti li scrive la banca (`aspetto.md` §0).
- **Un onboarding a passi.** Un utente solo, che ha costruito l'applicazione.
- **Il vetro ovunque.** Il materiale traslucido è giusto dov'è — barra e fogli, cioè ciò che
  galleggia **su** qualcosa. Sulle schede toglierebbe leggibilità a un contenuto fatto di cifre.

---

## 7. L'ordine dei lavori

| #   | Intervento                                                            | Costo  | Rischio                                |
| --- | --------------------------------------------------------------------- | ------ | -------------------------------------- |
| 1   | Le sette tinte chiare e i tre toni — **solo valori in `globals.css`** | ~1 h   | nullo                                  |
| 2   | `error.tsx` e `not-found.tsx` di radice                               | ~1 h   | nullo                                  |
| 3   | Hover e `focus-visible` nel sistema                                   | ~2 h   | basso                                  |
| 4   | Entrata e uscita del foglio                                           | ~2 h   | basso, ma va provato col trascinamento |
| 5   | `.eti` passa a `--testo-2`                                            | 10 min | nullo                                  |
| 6   | Avviso passeggero + annulla                                           | ~1 g   | medio                                  |
| 7   | Aggiornamento ottimistico al posto di `router.refresh()`              | ~2 g   | medio-alto, una schermata per volta    |
| 8   | La scala tipografica in sette classi                                  | ~1 g   | basso ma diffuso: da fare da solo      |
| 9   | I 27 `<select>` diventano fogli o segmentati                          | ~2 g   | basso a componente                     |
| 10  | Moduli: etichetta, errore collegato, `aria-invalid`                   | ~1 g   | basso                                  |

**Le prime cinque valgono circa sei ore** e coprono tutti e tre i difetti critici più due dei tre
alti. Se il tempo è poco, sono quelle: il resto è vero, ma non è ciò che fa sembrare l'applicazione
non finita.

---

## 8. Le fonti

- [WAI-ARIA APG — Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): il fuoco
  entra, resta in trappola, esce con Esc e **torna a chi ha aperto**. Il `<dialog>` nativo lo fa
  già: la conferma che appoggiarsi alla piattaforma era la scelta giusta.
- [NN/g — Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/): la conferma
  si tiene per ciò che distrugge lavoro o costa denaro; per tutto il resto serve l'annulla, perché
  una conferma frequente smette di essere letta.
- [WCAG 2.2 — Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html):
  perimetro di 2 px e 3:1 fra stato con e senza fuoco.
- [MDN — `:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible):
  l'anello col Tab, non col clic.
- [Material 3 — Snackbar](https://m3.material.io/components/snackbar/guidelines) e
  [Apple HIG — Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) per la
  forma dell'avviso passeggero e del foglio.
- [Copilot Money](https://envelopebudgeting.com/articles/copilot-money-review) per la coda di
  revisione che **finisce**: conferma che «Conferma» va tenuta una lista che si svuota, non un
  contatore permanente.

---

---

# Secondo passaggio — i dettagli, 22 agosto 2026

> Il primo passaggio ha trovato quattro difetti di **sistema**. Questo cerca le trenta o cinquanta
> decisioni piccole che, sommate, fanno la differenza fra un prodotto curato e uno finito.
>
> Una premessa che cambia il tono: **cercando difetti ho trovato soprattutto risposte già scritte**.
> Il campo importo ha già `inputMode="decimal"` e ripulisce l'input. I 22 `key={i}` sono tutti in
> liste statiche, non in liste che si riordinano. `interruttore.tsx` è già ottimistico, con
> ripristino sull'errore e guardia sul doppio tocco. Il problema quasi mai è che una cosa manchi:
> è che **esiste in un posto solo**.

---

## A. Micro findings

### A.1 Il difetto peggiore: l'utente può leggere «unauthorized»

**22 route** sotto `/api/admin/` rispondono `{ error: 'unauthorized' }` con stato 401.
**13 componenti client** rendono quella stringa alla lettera:

```ts
setErrore(String(esito['error'] ?? risposta.status));
```

Il gettone di sessione dura circa un'ora. Quando scade mentre l'applicazione è aperta — cioè il
caso normale, visto che questa app resta aggiunta alla schermata iniziale per giorni — il primo
tocco su «Va bene» produce un riquadro rosso contenente **una parola inglese**: `unauthorized`.
Nessun percorso client porta al login su un 401: `grep` su `src/app` per `401` insieme a
`login`/`redirect` non trova niente.

Ed è peggio di «Something went wrong», perché il ripiego è `risposta.status`: dove la route non
mette un messaggio, l'utente legge **`500`**.

### A.2 Il bottone che lavora non lo dice, lo tace

`{inCorso === r.id ? '…' : 'Va bene'}` — la scritta viene **sostituita** da un'ellissi.

**Una cosa che avevo scritto qui era sbagliata, e l'ho verificata prima di lasciarla**: pensavo che
il bottone si restringesse, spostando «Correggi» accanto. Non succede: entrambi sono `flex-1`,
quindi la misura è decisa dalla riga e non dal contenuto. Il difetto non è geometrico.

Quello che resta, ed è vero:

- **un lettore di schermo annuncia «puntini di sospensione»**, non «sto confermando». Non ci sono
  né `aria-busy` né `aria-live`;
- `disabled` **toglie il bottone dall'ordine di tabulazione**, quindi chi naviga con la tastiera
  perde il punto in cui era e riparte da capo;
- visivamente «Va bene» che diventa `…` si legge come un bottone **svuotato**, non come un bottone
  che sta lavorando: non c'è nessun movimento, e l'ellissi è ferma.

### A.3 Confermare una riga blocca le altre sei

In `pannello-conferma.tsx` c'è un solo `occupato = inCorso !== null`, e **tutti** i bottoni della
schermata prendono `disabled={occupato}`. Su una coda di sette movimenti, ogni conferma congela la
lista per la durata di un viaggio di rete. È lo stesso `disabled` che toglie il bottone dall'ordine
di tabulazione: chi sta usando la tastiera perde anche il punto in cui era.

### A.4 La tastiera del telefono copre il bottone «Salva»

Il foglio è `max-height: 85dvh` dentro un `<dialog>`, e mentre è aperto il corpo è **fissato**
(`position: fixed`). Su iOS la tastiera ridimensiona solo il _visual viewport_: gli elementi fissi
restano dove sono e finiscono sotto la tastiera. Il `viewport` dell'applicazione non dichiara
`interactiveWidget`, quindi nemmeno Chrome su Android rimpicciolisce il contenuto.

Dove si vede: creare una categoria dal foglio (c'è pure un `autoFocus` che apre la tastiera
**subito**), e scrivere una nota su un movimento.

### A.5 La distinzione più pericolosa dell'app è dentro un `title=`

`SceltaCategoria` mostra accanto al controllo due parole — «tutte le sue» / «solo questa» — e la
frase intera sta in `title={PORTATA[ambito.tipo].intera}`. **Su un telefono `title` non compare
mai.** È la stessa differenza che il commento del componente descrive come _«la cosa più pericolosa
dell'applicazione»_: cambiare una riga o cambiarne trecento.

### A.6 Quindici chevron sono un carattere tipografico

`›` compare come freccia di riga in **quindici punti** (`page.tsx`, `livello.tsx`, `mese.tsx`,
`fisarmonica.tsx`, `revisione`, `da-confermare`, `dove`…). `icone.tsx` contiene un tracciato
`chevron` vero. È esattamente il difetto che `aspetto.md` §1 ha individuato per la barra in basso e
corretto lì: peso e stile decisi da chi ha disegnato il carattere, non da noi, e nessun controllo su
`stroke-width`. Idem `✓` in tre punti e `·` come separatore.

### A.7 Gli stati vuoti dicono cosa manca, non perché

| Dove             | Oggi                                 |
| ---------------- | ------------------------------------ |
| `/movimenti`     | «Nessun movimento in questo mese.»   |
| `/esercenti`     | «Nessun esercente con questo nome.»  |
| foglio categorie | «Niente con questo nome.»            |
| `/debug/eb`      | «Nessun conto registrato.»           |
| `/debug/sync`    | «Nessuna sincronizzazione eseguita.» |

Cinque su cinque dicono **cosa non c'è**. Nessuno dice perché, e nessuno offre l'uscita. L'unico
scritto bene è «Sei in pari», e non è un caso: è l'unico nato da una decisione esplicita.

### A.8 `aria-pressed` manca dove lo stato **è** il contenuto

`interruttore.tsx` disegna due bottoni, «fisso» e «variabile», e colora quello attivo. Non c'è
`aria-pressed` né `role="radiogroup"`: un lettore di schermo annuncia due bottoni indistinguibili.
Lo stesso vale per i due modi di `/dove` quando sono resi come bottoni.

### A.9 Il testo spento è il testo che non si legge

`text-testo-3` (2,28:1, vedi primo passaggio) è usato su **elementi interattivi**: la scritta
«senza categoria» dentro il selettore, l'etichetta del bottone non attivo dell'interruttore, i
chevron. Non è solo un problema di leggibilità: un controllo il cui testo è più spento del testo
secondario si legge come disattivato.

### A.10 Sei altezze per i bersagli

`min-h-11` (44) ×54 · `min-h-12` (48) ×19 · `min-h-14` (56) ×5 · `min-h-10` ×3 · `min-h-9` ×4 ·
`min-h-7` ×1. Le ultime tre sono varianti `sm:` da tastiera e vanno bene. Le prime tre no: 44, 48 e
56 si usano indifferentemente per la stessa cosa — una riga di elenco — e il sistema non ha un nome
per distinguere «controllo» da «riga» da «riga con due piani».

### A.11 Un `<select>` nativo dentro il foglio che esiste per eliminare i `<select>`

Nel modulo di creazione categoria, il campo «dove» è un `<select>` con tutte le categorie —
**dentro** il foglio nato per sostituire proprio quel controllo. È l'unica incoerenza interna al
componente migliore dell'applicazione.

### A.12 `disabled` dove servirebbe `aria-disabled`

Un bottone `disabled` esce dall'ordine di tabulazione e perde il fuoco. Mentre un'azione è in corso
il bottone dovrebbe restare raggiungibile e annunciare che sta lavorando (`aria-disabled="true"` +
`aria-busy`), non sparire dalla navigazione da tastiera.

### A.13 I filtri di `/movimenti` chiedono un invio

Sono un `form method="get"` — decisione documentata e giusta nel suo scopo: **la pagina resta un
componente server**. Ma il commento dice «nessun JavaScript», e quel motivo non è più vero: il
resto dell'applicazione non funziona senza. Il vantaggio da difendere è il primo, non il secondo, e
si può tenere sostituendo i cinque `<select>` con un'isola client — la pagina resta server.

### A.14 Nessun contenitore riferisce cosa è cambiato

Un solo `aria-live` in tutta l'applicazione. Ogni esito — «7 confermati», «categoria creata»,
l'errore — compare visivamente e basta.

### A.15 Le note d'errore restano dove nessuno le guarda

`{errore !== null && <p className="nota nota-errore mt-1 text-[11px]">{errore}</p>}` dentro
`SceltaCategoria`: 11 px, sotto un controllo che sta in una riga di elenco lunga. Se il foglio si è
chiuso, l'errore compare in un punto della pagina che potrebbe essere fuori schermo.

---

## B. Component improvements

Formato: **oggi → problema → riferimento → comportamento proposto.**

### B.1 Bottone che lavora

- **Oggi** — la scritta diventa `…` e tutti gli altri bottoni della schermata si disattivano.
- **Problema** — l'ellissi è ferma e non dice niente; il lettore di schermo annuncia «puntini di
  sospensione»; `disabled` toglie il fuoco dall'ordine di tabulazione. La larghezza invece **non**
  si muove, ed è merito del `flex-1` che c'è già: quella parte del pattern è giusta.
- **Riferimento** — [Primer · Loading](https://primer.style/product/ui-patterns/loading/) tiene
  l'etichetta e affianca l'indicatore; [Bekk · accessible loading button](https://www.bekk.christmas/post/2023/24/accessible-loading-button)
  spiega perché `aria-disabled` batte `disabled` durante l'attesa. La tecnica a griglia sovrapposta
  evita il restringimento perché la misura la decide il figlio più largo.
- **Proposto** — l'etichetta **resta**; l'indicatore entra a sinistra dentro la stessa cella di
  griglia; il bottone tiene la sua larghezza; `aria-disabled` e `aria-busy` invece di `disabled`;
  **sotto i 200 ms non compare niente**. Solo il bottone premuto cambia stato: gli altri restano vivi.

### B.2 Coda di conferma

- **Oggi** — `POST`, attesa, `router.refresh()`, e nel frattempo tutta la schermata è ferma.
- **Problema** — sette conferme sono sette render completi del server, ognuno a cache appena buttata.
- **Riferimento** — Linear e Superhuman rimuovono la riga all'istante e offrono l'annulla;
  [Material 3 · Snackbar](https://m3.material.io/components/snackbar/guidelines) dà la forma: una
  riga, **una sola** azione, in basso, che scompare da sola e non blocca. Il pattern esiste già in
  casa, in `interruttore.tsx`.
- **Proposto** — la riga esce subito con l'animazione di uscita; l'avviso passeggero dice cosa è
  successo e offre **Annulla** per 6 secondi; se il server rifiuta, la riga **rientra al suo posto**
  (indice conservato) e l'avviso diventa rosso con «Riprova». Nessun `refresh`.

### B.3 Foglio con un modulo dentro

- **Oggi** — `85dvh`, corpo fissato, `autoFocus` sul campo, nessuna gestione della tastiera.
- **Problema** — su iOS gli elementi fissi non si spostano quando sale la tastiera: il bottone
  «Crea e scegli» finisce sotto.
- **Riferimento** — [HTMHell · interactive-widget](https://www.htmhell.dev/adventcalendar/2024/4/)
  e l'[explainer di Bram.us](https://github.com/bramus/viewport-resize-behavior/blob/main/explainer.md):
  `interactive-widget=resizes-content` fa rimpicciolire anche il _layout viewport_ su Chromium;
  `dvh` da solo non basta perché non tocca il `position: fixed` di iOS.
- **Proposto** — `interactiveWidget: 'resizes-content'` nel `viewport` di Next; il foglio ascolta
  `visualViewport` e riduce la propria altezza massima; le azioni stanno in un piede **appiccicato**
  che resta sopra la tastiera; l'`autoFocus` si toglie su schermo stretto — la tastiera la apre
  l'utente quando è pronto.

### B.4 Selettore di categoria

- **Oggi** — la portata è due parole più un `title=`; il campo «dove» è un `<select>`; il chevron è
  `›`; «senza categoria» è in `--testo-3`.
- **Problema** — la distinzione fra «una riga» e «trecento righe» non è leggibile su un telefono.
- **Riferimento** — Stripe e Linear scrivono la portata di un'azione **nel bottone stesso**
  («Applica a tutti gli addebiti futuri»), non in un suggerimento al passaggio del mouse.
- **Proposto** — la portata diventa una **pastiglia sempre visibile** sotto il controllo, con la
  frase intera; il `title=` sparisce; il campo «dove» diventa un secondo foglio o un elenco
  gerarchico dentro il primo; il chevron diventa l'icona; «senza categoria» passa a `--testo-2`.

### B.5 Errore di rete e di sessione

- **Oggi** — il testo del server, o il numero di stato, in un riquadro rosso.
- **Problema** — l'utente può leggere `unauthorized` o `500`.
- **Riferimento** — Stripe Dashboard e Vercel distinguono quattro casi (validazione, sessione, rete,
  guasto) e per ognuno dicono **cosa fare**; nessuno mostra il codice di stato come messaggio.
- **Proposto** — una funzione di traduzione unica: `401 → «La sessione è scaduta»` con un bottone
  **Rientra** che porta al login conservando l'indirizzo; `403 → «Questo account non è ammesso»`;
  `5xx / rete → «Non riesco a raggiungere il server»` con **Riprova**, e il dato che si stava per
  scrivere **resta nel campo**. Il testo grezzo del server sopravvive solo in un `<details>`
  «dettagli tecnici», per la diagnostica.

### B.6 Stati vuoti

- **Riferimento** — l'unico buono ce l'abbiamo già in casa: «Sei in pari» dice cosa vuol dire, perché
  è così e cosa si può guardare invece.
- **Proposto** — tre righe sempre. Esempio per `/movimenti`:
  > **Nessun movimento con questi filtri.**
  > Il mese è luglio e il tipo è «spese reali», che esclude i giroconti.
  > [Togli i filtri] · [Guarda tutto luglio]

---

## C. Interaction specification

| Elemento              | Regola                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Foglio**            | Entra in 300 ms `cubic-bezier(.32,.72,0,1)`, velo 220 ms. Esce con la stessa curva. Presa trascinabile; oltre ¼ dell'altezza o 550 px/s se ne va. Esc, fondo, X. Il fuoco entra sul primo elemento, torna a chi ha aperto (lo fa `<dialog>`). Piede appiccicato sopra la tastiera. Con modifiche non salvate: chiedere **solo** se qualcosa è stato scritto. |
| **Cassetto**          | Come il foglio, da destra. Su schermo ≥ 768 px resta un cassetto: non diventa una barra laterale fissa.                                                                                                                                                                                                                                                      |
| **Avviso passeggero** | Uno alla volta, in basso sopra la barra, 6 s con azione, 2,5 s senza. Una sola azione. Non blocca. Si può scorrere via. Sparisce se si naviga.                                                                                                                                                                                                               |
| **Bottone**           | L'etichetta non cambia mai durante l'attesa. `aria-disabled` + `aria-busy`, non `disabled`. Indicatore dopo 200 ms. Un'azione primaria per schermata.                                                                                                                                                                                                        |
| **Riga**              | Hover = velatura accento 10% dietro `@media (hover: hover)`. Premuta = stessa velatura, **senza scala**. Fuoco = anello accento 2 px. Uscita animata solo quando la riga esce per un motivo.                                                                                                                                                                 |
| **Campo**             | Etichetta visibile, non solo segnaposto. `inputMode` corretto. Validazione all'uscita dal campo. Errore sotto, con `aria-describedby` e `aria-invalid`. Il testo scritto **non si perde mai** su errore.                                                                                                                                                     |
| **Selezione**         | Spento ≠ disattivato ≠ non disponibile. Spento è pieno e leggibile; disattivato è opaco e dice perché; non disponibile non c'è. `aria-pressed` o `radiogroup` sempre.                                                                                                                                                                                        |
| **Attesa**            | Sotto 200 ms niente. Contenuto già a schermo **non sparisce**: si mostra vecchio con un indicatore. Scheletro solo al primo caricamento di un blocco.                                                                                                                                                                                                        |
| **Errore**            | Quattro famiglie: validazione (nel campo), sessione (con «Rientra»), rete (con «Riprova»), guasto (con `error.tsx`). Mai un numero di stato come messaggio.                                                                                                                                                                                                  |

---

## D. Polish backlog

> **Stato al 22 agosto, sera.** Tutte le voci «Must fix» e le prime quattro «High
> impact» sono **implementate**, insieme alle cinque voci «subito» del primo
> passaggio. Restano l'aggiornamento ottimistico con annulla (la voce piu'
> grossa), e le cinque «Nice polish».
>
> Due cose sono state trovate **mentre** si implementava, e nessuna delle due era
> nell'audit:
>
> - in quattro punti il corpo della risposta era gia' stato letto prima di
>   passarlo al traduttore, e `json()` si consuma una volta sola: il messaggio
>   utile del server sarebbe sparito in silenzio. Ora quei punti usano
>   `spiegaErrore(stato, corpo)`, e il rischio e' scritto nel commento;
> - `CAMPO` faceva `outline-none` piu' un `ring`: l'applicazione aveva **due**
>   linguaggi del fuoco, e il secondo non era in nessun elenco perche' guardavo
>   i componenti, non i due file dove le classi sono definite.

### Must fix

1. ~~**Il 401 non deve mai essere un testo.**~~ **fatto** Traduzione degli errori + rientro al login. _(A.1, B.5)_
2. ~~**Tastiera che copre le azioni.**~~ **fatto** `interactiveWidget` + piede appiccicato + via l'`autoFocus` su
   schermo stretto. _(A.4, B.3)_
3. ~~**La portata del cambio categoria fuori dal `title=`.**~~ **fatto** _(A.5, B.4)_
4. ~~**`aria-pressed` sui gruppi a due scelte.**~~ **fatto** _(A.8)_

### High impact

5. ~~Bottone che disattiva **solo sé stesso**.~~ **fatto** — cinque pannelli, vedi sotto _(A.2, A.3, B.1)_
6. Aggiornamento ottimistico + annulla sulla coda. _(B.2)_
7. ~~I quindici `›` diventano l'icona che esiste già.~~ **fatto** — dodici sono icone, quattro restano punteggiatura _(A.6)_
8. ~~Gli stati vuoti riscritti in tre righe.~~ **fatto** _(A.7, B.6)_
9. ~~Il testo spento fuori dai controlli.~~ **fatto** _(A.9)_

### Nice polish

10. Tre nomi per le altezze di riga invece di tre numeri usati a caso. _(A.10)_
11. Il `<select>` «dove» dentro il foglio. _(A.11)_
12. `aria-disabled` al posto di `disabled` durante l'attesa. _(A.12)_
13. I filtri di `/movimenti` come isola client. _(A.13)_
14. Un contenitore `aria-live` per gli esiti. _(A.14)_

---

## Terzo passaggio — 22 agosto, dai difetti trovati usando l'app

Tre segnalazioni dall'uso, non dalla revisione. Due erano difetti veri e uno
era un vincolo che non era stato scritto da nessuna parte.

### L'ambra non era gialla, ed era colpa del secondo passaggio

Il secondo passaggio ha abbassato le sette tinte finche' passavano **4,5:1**
sulle superfici chiare, e ha fatto bene: erano a 2,06 e il colore _e'_ la
codifica della classe. Ma l'ha fatto abbassando la **luminosita'** senza
guardare la **tonalita'**, e per l'ambra le due cose non sono separabili:
`#9a6200` sta a 38°, cioe' e' un **arancio bruno**. Il numero era giusto, il
colore no.

Ora `#9c7a00`, 47°: un oro. Piu' giallo di prima, e piu' in la' non si va —
**un giallo vivo sta a 1,4:1 sul bianco**, quindi un pallino giallo su una
scheda chiara semplicemente non c'e'. Sul **nero** il vincolo non esiste e il
giallo e' giallo davvero: `#ffd60a`, 12:1.

Questo e' il limite, e vale la pena scriverlo perche' tornera': **il giallo e'
l'unica tinta la cui identita' sta nella luminosita'.** Il blu scuro resta blu,
il verde scuro resta verde; il giallo scuro e' oro, poi ocra, poi oliva. Su un
fondo chiaro non esiste un giallo leggibile — esiste un oro.

**Piu' due cose che il colore da solo non copriva.**

`--allarme`, `--attenzione` e `--conferma` erano `var(--classe-rosa)` e
compagnia. La 0043 li aveva creati **proprio** per separare i due mestieri, e
l'alias rimetteva insieme quello che aveva separato: ingiallire l'ambra
ingialliva anche le note d'avviso. Ora portano un valore proprio, in tutti e due
i temi.

E `tests/tinte-contrasto.test.ts` legge i token da `globals.css` e misura. Non
e' zelo: il difetto di partenza era **una misura che nessuno rifa'** mentre
sceglie un colore, e l'ha appena rifatto ricomparire. Sette tinte × due temi,
piu' il neutro, piu' i tre mestieri semantici a 4,5:1 perche' sono testo.
Rimettendo il vecchio `#ffb340` la prova dice `ambra = #ffb340 contro #f4f4f7:
1.62:1`.

### Il cassetto laterale non era un foglio ruotato

`Dialogo` serve i due pannelli con una durata e una curva sole. Sbagliato per
due ragioni misurabili:

- **il tragitto e' diverso.** Il foglio sale per la propria altezza; il cassetto
  attraversa l'80% della larghezza, tutto, sempre. Stessa durata su piu' strada
  = coda piu' lunga, cioe' «lento e molliccio»;
- **la curva `0.32, 0.72, 0, 1` e' quella dei fogli di sistema**, che frenano
  tardi perche' devono sembrare pesanti. Un cassetto scivola.

Ora 240 ms con `0.2, 0, 0, 1` contro i 300 del foglio.

Ma la ragione per cui **scattava** era un'altra, e non e' la durata: il pannello
ha un'ombra da 40 px e si porta dietro delle schede che ne hanno tre ciascuna, e
senza un livello suo ogni fotogramma le ridisegna. `will-change: transform` lo
promuove, e il costo di memoria non e' un problema perche' il pannello esiste
solo mentre e' aperto. Piu' `overflow-hidden` sul `<dialog>`: durante l'entrata
e il trascinamento il pannello sta per meta' fuori, e senza clip quel fuori
diventa un'area scorrevole dentro il dialogo.

Nella stessa passata, un difetto d'accessibilita' che era li' dall'inizio:
**chi chiede meno movimento riceveva lo scivolamento lo stesso.** La chiusura
gia' non aspettava — `Dialogo` legge `prefers-reduced-motion` — ma l'entrata
era una transizione nello stile in linea, dove la preferenza non arrivava. Ora
la regola sta in `globals.css` su `[data-pannello]`, e sta li' e non in
JavaScript per una ragione che si vede solo provandola: **una lettura in
JavaScript resta ferma al montaggio**, e la preferenza si puo' cambiare a
pannello aperto.

### Il difetto che non era di aspetto

«Ci sono dei movimenti in NON classificato, di ristoranti e bar, e persone.»
Non era la UI: erano tre funzioni SQL. Sta in `CLAUDE.md` e nella **0058**.

### Un'attesa che ferma la riga, non la schermata — 22 agosto

Cinque pannelli tenevano `inCorso` come **una stringa sola**, e da lì veniva
`disabled={inCorso !== null}` su ogni controllo: scrivere una riga spegneva
tutte le altre.

Non era prudenza mal riposta, era una domanda sbagliata. `inCorso` rispondeva a
«qualcuno sta scrivendo?» mentre ogni bottone chiede «sto scrivendo **io**?», e
le due coincidono solo finché c'è una riga. Le scritture sono indipendenti —
esercenti diversi, avvisi diversi, obiettivi diversi — quindi non c'era niente
da proteggere: il blocco costava un'attesa a vuoto e basta, proprio sulle
schermate che esistono per smaltire decine di righe a raffica.

Ora è un `Set`, e non per eleganza: con due scritture in volo una stringa sola
si fa sovrascrivere dalla seconda, e la prima riga smette di mostrare l'attesa
mentre sta ancora scrivendo — che è peggio del blocco, perché sembra finita.

| pannello         | cosa bloccava                                             | ora                                                          |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| `/revisione`     | assegnare un esercente spegneva le 313 azioni della lista | la sua riga                                                  |
| `/da-confermare` | salvare una correzione spegneva «Va bene» sulle altre sei | la sua riga; «va bene tutte» resta globale                   |
| `/avvisi`        | chiudere un avviso spegneva «Fatto» e «Ignora» su tutti   | il suo avviso                                                |
| `/abbonamenti`   | un giudizio d'uso spegneva i tre bottoni di ogni scheda   | la sua scheda                                                |
| `/obiettivi`     | rinnovare uno spegneva i bottoni degli altri              | la sua riga; il **modulo** di creazione resta un blocco solo |

L'unica eccezione tenuta apposta è il modulo di creazione degli obiettivi: lì
non ci sono righe indipendenti ma **un** oggetto che si sta scrivendo, e mezzi
campi vivi mentre l'altra metà è già partita sarebbero una forma diversa da
quella spedita. Stessa ragione per «va bene tutte» su `/da-confermare`:
approvare in blocco mentre si sta incidendo una riga è una sovrapposizione che
non si spiega.
