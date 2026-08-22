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
