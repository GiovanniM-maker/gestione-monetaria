# Audit di qualità — 22 agosto 2026

Un passaggio diverso dai precedenti: non «è bello», ma **«è rotto?»**. L'ipotesi
di partenza è che l'applicazione **non** sia corretta, e che il rifacimento
UX/UI appena fatto abbia introdotto regressioni.

---

## Come è stato fatto — e perché conta

I due audit precedenti leggevano il codice. Questo **usa l'applicazione**, in un
Chromium vero, autenticato, con dati veri. È stato possibile montando un banco
di prova in tre pezzi, tutti fuori dal repository:

1. **Un finto Supabase** (auth + PostgREST, 90 righe in memoria) su
   `127.0.0.1:54999`. Risponde alle stesse chiamate del vero, quindi
   l'applicazione gira **senza modifiche** e senza toccare il database di
   produzione — di cui in ambiente c'è la sola chiave anon.
2. **Le fixture escono dalla replica Postgres locale**, quella già usata per
   provare le migration: schema vero, 2.000 movimenti veri, forme vere. Sono
   dati inventati nei valori ma non nella struttura, ed è la differenza fra
   provare l'applicazione e provare la propria immaginazione.
3. **Playwright** guida il browser e **misura** invece di guardare: nodi del
   DOM, byte di HTML, altezza dei bersagli, `scrollWidth` contro la larghezza
   del **dispositivo**, `layout-shift` dal `PerformanceObserver`, errori di
   console, richieste fallite.

Il login passa dal modulo vero, quindi anche il proxy di autenticazione e la
sessione sono quelli veri.

**Una nota sul banco stesso**, perché è servita: Chromium contro `127.0.0.1`
riceveva 403 sui chunk di Next e l'applicazione non si idratava — un difetto
del livello di rete della sandbox, non dell'applicazione. Su `localhost`
sparisce. Un banco che sbaglia produce difetti che non esistono, e ne ha
prodotto uno prima di essere accorto.

---

## Difetti trovati e corretti

### QA-001 · P1 · Tre errori di idratazione su **ogni** pagina

**Riproduzione** — aprire una pagina qualsiasi con la console aperta.

```
Cannot render a sync or defer <script> outside the main document…
In HTML, <script> cannot be a child of <html>. This will cause a hydration error.
A tree hydrated but some attributes of the server rendered HTML didn't match…
```

**Causa** — lo script del tema stava come figlio **diretto** di `<html>`, che in
HTML non è una posizione valida: il parser lo sposta dentro `<head>` mentre
legge, quindi l'albero del client non è più quello che il server ha scritto. Il
commento accanto diceva «nell'`<head>` di proposito» — ma un `<head>` non c'era.

**Perché conta** — React lo dice esplicitamente: _«This won't be patched up»_.
Un albero che non combacia è la premessa di ogni comportamento inspiegabile a
valle, ed era su ogni schermata.

**Correzione** — un `<head>` esplicito, più `suppressHydrationWarning` sul solo
`<html>` (lo script scrive `data-tema` prima di React: lì il disallineamento è
voluto, e l'attributo non si propaga ai figli).

`async` avrebbe fatto tacere i tre messaggi e rotto il motivo per cui lo script
esiste: girerebbe **dopo** il primo disegno, cioè dopo il lampo bianco.

**Verifica** — console vuota su `/`, `/movimenti`, `/dove`. E il tema regge in
entrambi i versi: `data-tema`, `theme-color` e il fondo del corpo corretti su
chiaro e scuro.

### QA-002 · P2 · Ruotando il telefono, 59 bersagli scendono sotto i 44 px

**Riproduzione** — `/movimenti` su un iPhone, poi girarlo in orizzontale.

| dispositivo                      | controlli sotto 44 px |
| -------------------------------- | --------------------- |
| iPhone verticale (390×844)       | **0**                 |
| iPhone **orizzontale** (844×390) | **59**                |
| iPad mini verticale (744×1133)   | **59**                |

**Causa** — i controlli tornano compatti su `sm:`, che è una domanda sulla
**larghezza**. Un iPhone ruotato è largo 844 px, quindi supera `sm` — ma è
sempre un pollice. Tutti e tre i dispositivi dichiarano `pointer: coarse` e
`hover: none`: l'informazione c'era e non veniva chiesta.

È tanto più evidente perché `globals.css` la domanda giusta la fa **già**, per
il passaggio del mouse: `@media (hover: hover)`. Le altezze erano rimaste
indietro.

**Correzione** — `pointer-fine:` al posto di `sm:` in tutti e 16 i punti,
scheletri compresi (uno scheletro alto quanto il controllo che sostituisce è
metà del motivo per cui esiste).

**Verifica** — 59 → **0** su orizzontale e su iPad. E nessuna regressione col
mouse: a 1280 px con `pointer: fine` i controlli restano a 36/40.

### QA-003 · P2 · L'annulla sopravvive al cambio di schermata

**Riproduzione** — `/da-confermare`, «Va bene» su una riga, poi toccare «Dove»
nella barra in basso. Il riquadro «Confermato · Annulla» arriva **intatto**
sulla schermata nuova, e quel bottone disfa una cosa che non si sta più
guardando.

**Causa** — `useEffect(() => chiudiAvviso, [])`: la pulizia gira allo
**smontaggio**, e `Avvisi` sta nel layout di `(app)`, che l'App Router
**conserva** navigando fra le sue pagine. Non si smontava mai.

**Perché è istruttivo** — la regola era scritta, e nel commento del componente:
_«Sparisce cambiando schermata»_. Il codice era corretto; sbagliato era il
**posto in cui vive**, e un `useEffect` con `[]` non dà nessun segnale.

**Correzione** — la dipendenza è `usePathname()`.

**Verifica** — stessa sequenza: l'avviso ora non c'è più dopo la navigazione, e
compare ancora quando deve.

### QA-004 · P1 · Mezzo megabyte di HTML per cinquanta righe

**Misurato**, non sospettato:

| schermata    | nodi  | `<dialog>` | elementi nascosti | HTML       |
| ------------ | ----- | ---------- | ----------------- | ---------- |
| `/movimenti` | 7.565 | 56         | **3.823**         | **612 kB** |
| `/esercenti` | 4.518 | 31         | 2.236             | 387 kB     |
| `/revisione` | 2.337 | 31         | 1.366             | 255 kB     |

**Causa** — ogni riga porta il proprio selettore di categoria, e il selettore è
un `Foglio` con dentro l'elenco **intero**: trentaquattro percorsi per riga. Con
cinquanta righe sono 1.700 voci consegnate, analizzate e idratate per dei
pannelli che quasi sempre non si aprono.

**Perché non si vedeva** — il difetto **è** ciò che non si vede: nulla appare a
schermo, e nessuna schermata sborda. Si trova solo contando i nodi.

**Correzione** — `Dialogo` disegna testata e contenuto **solo dopo la prima
apertura**. Lo stato scatta e non torna indietro: chiudere e riaprire è il gesto
più comune mentre si cerca qualcosa, e sarebbe il peggior momento per
ricostruire un elenco.

**Dopo:**

| schermata    | nodi                     | HTML                    |
| ------------ | ------------------------ | ----------------------- |
| `/movimenti` | 7.565 → **1.131** (−85%) | 612 → **242 kB** (−60%) |
| `/esercenti` | 4.518 → **758** (−83%)   | 387 → **171 kB** (−56%) |
| `/revisione` | 2.337 → **467** (−80%)   | 255 → **109 kB** (−57%) |

**Verifica** — il foglio si apre col suo contenuto (39 voci, titolo, ricerca) in
167 ms, e si riapre in 84. Il cassetto laterale, che è lo **stesso** componente,
supera ancora l'intero torture test: ESC, fondo, sei apri/chiudi rapidi, doppio
clic, fuoco che torna al bottone, blocco e ripristino dello scorrimento.

### QA-005 · P4 · «Ultimo scarico dalla banca **mai**»

**Riproduzione** — un'installazione nuova, prima di qualunque sincronizzazione.

`daQuanto()` restituisce `'mai'`, e tutte le altre sue risposte sono locuzioni
che seguono bene («3 ore fa», «ieri»). Quella no, e la frase intera diventava
_«Ultimo scarico dalla banca mai: qui manca tutto quello che hai pagato **da
allora**»_ — dove nessun «allora» esiste.

È la prima esecuzione, cioè lo stato in cui l'applicazione si presenta a chi la
installa, ed è la stessa classe di difetto della `0023`.

**Correzione** — le due frasi in prosa (`/da-confermare` e la home) trattano il
caso «mai» separatamente, perché non è lo stesso caso con un valore diverso.

### QA-006 · P2 · Un errore interno di Postgres arriva intero sullo schermo

**Riproduzione** — far fallire una scrittura (qui: il selettore di classe su
`/movimenti`). A schermo compariva, in inglese:

> duplicate key value violates unique constraint
> "merchant_aliases_pattern_match_type_key"

**Causa** — tredici funzioni di scrittura facevano `throw new
XNonValida(error.message)`, e da lì il messaggio diventa un **400** con il testo
dentro, che l'interfaccia mostra come prosa. `lib/ui/errori.ts` esiste
esattamente per impedire che «nessun gettone tecnico raggiunga una schermata» —
ma per un 4xx **con** un messaggio si fida del messaggio, e la falla entrava da
lì.

**Perché non bastava bloccarli tutti** — alcuni messaggi del database sono
scritti _per_ l'utente: `valida_classe` risponde «Discrezionalità non ammessa:
X. Valori validi: …» ed elenca le classi di **adesso**, che è la ragione per cui
quella validazione vive in SQL (0046). Zittirla sarebbe stato un difetto al
posto di un altro.

**Come si distinguono, senza indovinare** — non serve una regola sulla forma del
testo: la differenza sta nei dati. Un `raise exception` nostro, senza `using
errcode`, produce lo SQLSTATE **`P0001`**. Tutto il resto — `23505` chiave
duplicata, `23514` vincolo, `22P02` sintassi, `42501` permesso, i `PGRST…` di
PostgREST — viene dal motore.

`messaggioUtente()` sta in un modulo solo e **fallisce chiusa**: un codice mai
visto, o assente, resta fuori.

**Verifica** — in entrambi i versi, nel browser: con un `23505` compare «Non è
stato possibile classificare questo movimento»; con un `P0001` passa ancora
«Discrezionalità non ammessa: pippo. Valori validi: …». Più nove asserzioni su
sette SQLSTATE reali.

### QA-007 · P4 · 56 collegamenti col cursore a mano, 81 bottoni con la freccia

**Misurato** su `/movimenti` a 1280 px con un mouse vero: `a` → `pointer` (56),
`summary` → `pointer` (1), `button` → `default` (81). Sulla stessa schermata,
due controlli che si somigliano fino all'ultimo pixel rispondono in due modi
diversi, e l'unica differenza è quale tag li disegna — cosa che chi guarda non
può sapere.

Nella stessa regola, l'altra metà dello stesso difetto: un bottone spento e uno
acceso erano indistinguibili col puntatore sopra. Ora `:disabled` prende
`not-allowed`.

Tutto dentro `@media (hover: hover)`, e con `:where()` a specificità zero, così
`cursor-grab` sulla presa del foglio continua a vincere senza `!important`.

**Nota sul metodo** — la prima misura _dopo_ la correzione diceva «invariato», e
sembrava un fix che non funziona. Era il banco: il contesto emulava un
dispositivo **touch**, quindi `@media (hover: hover)` giustamente non si
applicava. È la seconda volta in questo audit che una misura accusa il codice a
torto.

### QA-008 · P4 · Le etichette della barra in basso si selezionano

Quattro parole che sono **bersagli**, non testo: su un telefono un tocco appena
lungo su «Dove» apre la lente di selezione invece di navigare, ed è il gesto più
facile da fare per sbaglio tenendo il telefono con una mano sola.
`user-select: none` sulle sole etichette di navigazione — il contenuto resta
selezionabile, che un importo si copia eccome.

---

## Cosa è stato provato e ha retto

Vale la pena scriverlo: sono i posti in cui **non** c'è un difetto, misurati.

- **Nessuno sbordamento orizzontale** su nessuna delle 16 schermate, a 320, 360,
  390, 414, 430, 600, 768, 1024 e 1280 px, in tema chiaro **e** scuro.
  Il confronto è contro la larghezza del **dispositivo**, non `innerWidth`: su un
  telefono la finestra di layout si allarga da sola per contenere ciò che
  sborda, e la misura ingenua non se ne accorge.
- **`layout-shift` a zero** su 15 schermate su 16 (`/debug/sync` a 0,002, cioè
  niente). Nessun salto, nessuno scheletro di misura diversa dal contenuto.
- **Il cassetto e il foglio** superano il torture test per intero, prima e dopo
  la modifica al componente condiviso.
- **Nessuna race condition sulle pastiglie di classe.** Rallentando il server a
  1,5 s e toccando due classi a 120 ms di distanza: parte **una sola**
  scrittura, il secondo bottone è già disabilitato al primo tocco, e la risposta
  vecchia non sovrascrive niente. Il riscontro è comunque immediato, perché la
  pastiglia si accende prima della richiesta.
- **Gli errori di scrittura non sono silenziosi** e non lasciano uno stato
  falso: con un 500 la pastiglia torna indietro e compare una nota.
- **Parametri assurdi nell'indirizzo** — `?mese=9999-99`, `?mese=abc`,
  `?pagina=-5`, `?pagina=99999`, `?classe=inesistente`, `?da=non-una-data` —
  rispondono tutti **200**, senza eccezioni e senza console sporca.
- **Indietro e avanti del browser** conservano indirizzo, filtri e posizione
  dello scorrimento.
- **Un nome di esercente ostile** (`<script>alert(1)</script>` più cento
  caratteri senza spazi) a 320 px: non esegue niente, non sborda, si tronca con
  i puntini.
- **L'anello del fuoco** tabulando: 2 px, colore dell'accento, 2 px di scarto.
- **Il ripristino dello scorrimento funziona**, ed è stato sul punto di essere
  segnalato come rotto: la prima misura diceva «964 prima, 4 dopo». Era il banco
  — Playwright fa scorrere la pagina in cima per cliccare un bottone che sta
  fuori schermo. Con `dispatchEvent` la posizione viene catturata e restituita
  identica. **Una misura che accusa il codice va rifatta in un altro modo prima
  di crederle.**

---

## Ancora aperto

- Il resto delle fasi: moduli, navigazione avanti/indietro, richieste fuori
  ordine sotto clic rapidissimi, secondo passaggio.
- I bersagli piccoli che restano sono **collegamenti dentro la prosa** (14–15
  px) e le caselle di spunta (16 px, con l'etichetta alta 44 che le commuta):
  entrambi voluti e documentati.
- `/debug/sync` ha quattro controlli sotto misura. È la pagina di diagnostica,
  non si usa col pollice, e non è stata toccata di proposito.
