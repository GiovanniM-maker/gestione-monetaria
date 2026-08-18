# L'aspetto — dai mockup al codice

> Nasce da tre schermate mostrate il 17 agosto 2026. Non descrive quello che l'applicazione
> **è**: descrive quello che deve diventare, e perché ogni pezzo va fatto in un certo modo.
> Chi implementa legga prima le decisioni, poi l'ordine di costruzione.

---

## 0. Cosa sono i mockup, davvero

Tre schermate: **Panoramica**, **In cosa**, **Da confermare**. I dati dentro sono i nostri —
«Voluttuario», «Quanto torna ogni mese», «perché due numeri e non uno?» sono frasi di questa
applicazione, non di un'altra.

Ma **la prima e la seconda portano la barra di navigazione di Revolut**: cinque voci, il logo
`R` a sinistra, il pulsante `+` viola al centro. La terza porta la nostra: Oggi, Conferma, Dove,
Chiedi.

Da qui discendono due cose che **non** si copiano, e non è una questione di gusto:

- **il logo `R` e il marchio.** È il marchio di qualcun altro. Nella nostra applicazione al suo
  posto non ci va niente: la barra in basso ha quattro schede e nessuna insegna;
- **il pulsante `+` al centro.** Promette di aggiungere un movimento a mano. Questa applicazione
  **non** inserisce movimenti: legge un conto bancario, e ogni riga esiste perché la banca l'ha
  contabilizzata. Un pulsante che promette una cosa che non esiste è peggio di un pulsante
  mancante — si preme una volta, non succede niente di quel che ci si aspettava, e da lì in poi
  non ci si fida più nemmeno degli altri.

Tutto il resto del linguaggio visivo si prende, ed è quasi tutto.

---

## 1. L'inventario delle differenze

| Nel mockup                                            | Oggi nel codice                               | Cosa costa colmarlo                        |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| Riquadri-icona colorati con glifo bianco              | niente: solo `›`, `✓`, `▲`, `▼`               | un insieme di icone + un componente        |
| Avatar circolare dell'esercente (`R`)                 | niente                                        | un componente, zero rete                   |
| Illustrazioni 3D nelle schede principali              | niente                                        | disegni da produrre, e il modo di servirli |
| Micro-etichette maiuscole spaziate                    | testo normale a 13 px                         | una classe CSS                             |
| Pastiglia di stato («Da confermare»)                  | niente                                        | una classe CSS                             |
| Controllo segmentato (Panoramica / Analisi)           | scritto a mano due volte, in due modi diversi | un componente                              |
| Mese come menu a tendina con `⌄`                      | due frecce `‹ ›` e un'etichetta               | ripensare `SceltaMese`                     |
| Bottoni tondi in testata                              | niente                                        | un componente                              |
| Legenda sotto la barra: pallino, nome, importo, quota | la barra c'è, la legenda no                   | poche righe                                |
| Icone della barra in basso                            | **caratteri Unicode**: `◧ ✓ ◍ ✳`              | le stesse icone di sopra                   |

L'ultima riga è la differenza che si nota di più senza saperla nominare. `◧` e `◍` non sono
icone: sono glifi tipografici, disegnati da chi ha fatto il carattere, con un peso e uno stile
che non c'entrano niente col resto. Quattro schede su quattro, in fondo a ogni schermata.

---

## 2. Le sei primitive che mancano

Vanno scritte una volta e usate ovunque, come `.scheda` e `lib/ui/controlli.ts`. Quattro copie
della stessa cosa divergono alla prima modifica, e la schermata che resta indietro è sempre
quella che si usa meno — cioè quella che nessuno prova.

1. **`Icona`** — un `<svg>` da un insieme chiuso, con `currentColor` e tratto uniforme.
2. **`Tessera`** — il riquadro arrotondato colorato che contiene un'icona. È la primitiva che
   cambia di più l'aspetto: compare su ogni riga di classe, di categoria, di sezione.
3. **`Avatar`** — il cerchio con l'iniziale dell'esercente.
4. **`Etichetta`** — la micro-etichetta maiuscola sopra un numero grande.
5. **`Pastiglia`** — lo stato in una riga («Da confermare», «archiviata», «proposta dal modello»).
6. **`Segmentato`** — il controllo a due o tre scelte, che oggi esiste in due copie diverse
   (i modi di `/dove` e l'ordinamento di `/da-confermare`).

---

## 3. Le decisioni

### 3.1 L'icona non sostituisce mai il numero

Il mockup è bello perché è **denso e ordinato**, non perché è illustrato. Su ogni riga
l'informazione resta il nome e l'importo; la tessera colorata serve a farli trovare più in
fretta, non a dirli.

Conseguenza pratica: nessuna schermata deve diventare leggibile _solo_ con le icone, e nessuna
icona deve essere l'unico posto in cui compare un'informazione. Se domani le immagini non
caricano, la schermata deve restare usabile — e visto che questa applicazione si apre dal
telefono in giro, quel domani è oggi pomeriggio in ascensore.

### 3.2 Il colore continua a voler dire una cosa sola

La regola è già scritta e va difesa proprio adesso, perché aggiungere trenta tessere colorate è
il modo più rapido di romperla.

- **l'accento indaco** è la voce dell'applicazione: si tocca qui. Non è mai un dato;
- **le sette tinte di classe** sono dati: la classe di una spesa, e basta;
- **rosso, ambra, verde** (`--allarme`, `--attenzione`, `--conferma`) sono giudizi: attenzione,
  guarda, fatto.

Una tessera di categoria **non può** prendere un colore a caso da una quarta tavolozza: sarebbe
un colore che non significa niente accanto a tre che significano qualcosa, e a quel punto
nessuno dei quattro significa più. Vedi 3.4.

### 3.3 `categories.icon` e `categories.color` esistono dalla `0008` e non li usa nessuno

Due colonne, scritte nello schema della tassonomia mesi fa, mai popolate e mai lette. Non è una
svista da rimuovere: è il posto giusto dove mettere questa informazione, ed era già stato
previsto.

Quindi l'icona di una categoria **sta nel database**, non in una mappa dentro un componente.
Ragione concreta: le categorie si creano dall'applicazione — e dal copilota — e una mappa in
TypeScript non saprebbe mai niente di «Pizzerie» creata ieri sera. Con la colonna, una categoria
nuova nasce senza icona e si vede che le manca, invece di prendere silenziosamente quella di
qualcun'altra.

Il valore è **una chiave** (`viaggi`, `ristorazione`, `casa`), non un pezzo di SVG: il disegno
sta nel codice, in un posto solo, e cambiarlo non richiede di riscrivere trentacinque righe di
database.

### 3.4 Il colore della tessera si deriva, non si sceglie

`categories.color` esiste, e la tentazione è farlo scegliere a mano. Non si fa, per la ragione
di 3.2: trentacinque colori scelti uno per uno sono trentacinque colori che non vogliono dire
niente.

**La tessera di una categoria prende la tinta della sua discrezionalità predefinita**
(`default_discretion`), con una velatura invece del pieno. Così il colore continua a dire
l'unica cosa che il colore dice in questa applicazione — che tipo di spesa è — e la schermata
«In cosa» diventa leggibile in una seconda dimensione senza aggiungere un alfabeto nuovo:
tutte le tessere ambra sono spese utili, tutte le rosa sono voluttuarie.

Dove `default_discretion` è nullo, la tessera è neutra. È vero e si vede.

`categories.color` resta la valvola per il caso che oggi non conosciamo: un'eccezione dichiarata,
non la regola.

### 3.5 Nessuna chiamata di rete per i loghi degli esercenti

La tentazione ovvia è prendere la favicon dal dominio, o un servizio di loghi. Non si fa:

- manderebbe **i nomi degli esercenti a un terzo**, a ogni apertura. La regola 8 parla di LLM, ma
  la ragione per cui esiste — i nostri movimenti non escono da qui — non cambia col destinatario;
- l'applicazione si apre in metropolitana, e un avatar che a volte c'è e a volte no fa sembrare
  rotta una lista che è perfetta.

L'avatar è **deterministico e locale**: l'iniziale del nome canonico su una velatura della tinta
della classe dell'esercente. Stesso esercente, sempre lo stesso avatar, anche offline.

### 3.6 Le illustrazioni: poche, grandi, e mai portatrici di significato

Nel mockup ce ne sono tre: il segno di spunta di «Da confermare», il portafogli degli
abbonamenti, la casa delle abitudini. Sono il pezzo che fa sembrare l'applicazione un prodotto
invece che un pannello.

Tre regole:

1. **stanno solo sulle schede di testata**, una per schermata al massimo. Un'illustrazione per
   riga sarebbe un catalogo;
2. **non dicono niente che non sia già scritto.** Chi non le vede — perché non hanno caricato,
   perché usa un lettore di schermo — non perde un'informazione. Vanno con `alt=""`, sono
   decorazione dichiarata;
3. **non ritardano il numero.** Stanno dentro schede che già arrivano in streaming, e si caricano
   pigramente. Il tempo prima di vedere il numerone è la cosa che si percepisce come velocità, ed
   è già stato pagato una volta spezzando il cruscotto in blocchi.

Peso: **≤ 40 KB l'una**, WebP con trasparenza. Otto illustrazioni a 40 KB sono 320 KB che il
telefono scarica una volta e tiene; a 300 KB l'una sarebbero 2,4 MB, cioè la ragione per cui la
gente disinstalla le applicazioni.

### 3.7 Un disegno solo per due temi, se possibile

Il tema scuro è il caso normale — l'applicazione si apre dopo cena — ma il chiaro esiste. Un
oggetto vetroso viola su fondo trasparente funziona su entrambi se ha **un contorno chiaro** e
non affida il contrasto al fondo.

Dove non funziona si fanno due file e si sceglie con `<picture>` e
`prefers-color-scheme`. Due file sono ottanta chilobyte: si paga, non si discute.

---

## 4. Dove il mockup sbaglia, e cosa facciamo meglio

Copiarlo com'è porterebbe dentro quattro errori. Tre sono di sostanza.

### 4.1 La legenda somma due dimensioni diverse

Nella prima schermata, sotto la barra: **Personale −1.371,82 · Business −330,43 · Essenziali
−121,15 · Altro −190,05**.

`Personale` e `Business` sono **contesti**. `Essenziali` è una **classe**. Sono due dimensioni
indipendenti — una spesa è personale _e_ essenziale — e quella legenda le mette in fila come se
fossero quattro fette dello stesso taglio. Le percentuali sommano a 100 e la figura sembra
giusta: è il tipo di numero plausibile e falso che questa applicazione esiste per non produrre.

**Cosa facciamo**: la barra e la sua legenda mostrano **una** dimensione, e sopra c'è
l'interruttore per scegliere quale — per classe o per contesto. È lo stesso interruttore già
esistente in `/dove`, e diventa una primitiva (`Segmentato`, §2).

### 4.2 «I movimenti senza categoria non vengono inclusi nei tuoi budget e nei report»

I budget **non esistono** in questa applicazione: `budgets` è una tabella nello schema che
nessuna schermata usa, e la Fase 8 ha deciso esplicitamente di non implementare
`budget_exceeded` perché i budget non ci sono.

E la frase è anche falsa nel merito: un movimento senza categoria **è** nel totale — è
precisamente il motivo per cui la `0042` lo mette in quella lista. Il testo giusto ce l'abbiamo
già, ed è quello che c'è nel codice oggi.

Lezione generale: **il testo dei mockup non si copia**. È scritto per sembrare un'applicazione,
non per essere vero su questi dati.

### 4.3 «Non classificato ↑592%»

Una variazione a tre cifre su «non classificato» non è un'informazione: è il rumore di una
categoria residuale che si riempie e si svuota mentre si classifica. Messa accanto a una spesa
vera con la stessa grafica, insegna che le frecce non vogliono dire niente.

**Cosa facciamo**: la riga «non classificato» mostra l'importo e non la variazione. Sta lì per
dire _quanto non sappiamo_, e quel numero si legge da solo.

### 4.4 Le percentuali colorate sotto la legenda

Nel mockup sono piccole e nel colore della fetta: il 6% azzurro su fondo nero e il 10% grigio
stanno sotto il rapporto di contrasto minimo. Il colore della fetta lo porta già il pallino.

**Cosa facciamo**: la percentuale in `--testo-2`, il colore resta al pallino e alla barra.

---

## 5. Come si costruisce, in ordine

Quattro fette. Ognuna si può fermare e lasciare l'applicazione in uno stato coerente.

### Fetta 1 — le icone, e la barra in basso

`src/lib/ui/icone.tsx`: un componente `Icona` e un insieme chiuso di percorsi SVG, **copiati nel
repository**, non una dipendenza.

Non è avarizia: una libreria di icone porta migliaia di disegni per usarne trenta, e lo stack
vieta le librerie non strettamente necessarie. Trenta `<path>` sono circa sei chilobyte e li
vediamo tutti. Da un insieme coerente (Lucide, Phosphor: licenza MIT) si prendono i percorsi
delle sole icone che servono, e si annota da dove vengono.

Tratto **1,75 px** su una griglia da 24, terminali arrotondati, `currentColor`. Uniforme: due
pesi diversi nello stesso elenco si notano prima del contenuto.

Le icone che servono, minimo:

`casa · carrello · ristorante · treno · aereo · valigia · borsa · maschere · cuore ·
carta-di-credito · portafogli · persona · lavoro · stella · grafico · ripetizione · pi-mento ·
freccia-su · freccia-giu · spunta · chevron · filtro · piu · matita · cestino · avviso ·
informazione · ricerca · calendario · scintilla`

Prima cosa che ne beneficia: `barra.tsx`, dove `◧ ✓ ◍ ✳` diventano quattro icone vere. È il
cambiamento più visibile per la minor quantità di lavoro dell'intero documento.

### Fetta 2 — le tessere e la tassonomia che si disegna

- migration: popola `categories.icon` con la chiave dell'icona per le categorie che ci sono;
- `Tessera` legge la chiave e la tinta derivata da `default_discretion` (§3.4);
- `/categorie` e il foglio di creazione guadagnano un selettore d'icona;
- `Avatar` per gli esercenti, su `/da-confermare`, `/movimenti`, `/esercenti`.

Il selettore d'icona nel foglio «nuova categoria» non è un accessorio: senza, ogni categoria
creata dall'applicazione nasce grigia per sempre, e in tre mesi metà della tassonomia è grigia.

### Fetta 3 — le testate

`Etichetta`, `Pastiglia`, i bottoni tondi, il mese come menu a tendina, la legenda sotto la
barra, `Segmentato`. Tocca `testata.tsx`, `mese.tsx`, `grafici.tsx`, e le due copie del controllo
segmentato spariscono dentro la primitiva.

### Fetta 4 — le illustrazioni

Si producono (§6), si ottimizzano, si mettono nelle testate di Oggi, Conferma, Dove, Chiedi,
Abbonamenti, Report, e nello stato «Sei in pari».

**Per ultima, di proposito.** È la fetta che si vede di più e vale di meno: senza le prime tre
sarebbe un disegno bello sopra una schermata che non è cambiata.

---

## 6. I prompt per generare le illustrazioni

Da usare con ChatGPT (GPT-4o / DALL·E) o con qualunque generatore che accetti prompt lunghi.

### 6.1 Prima di tutto: cosa NON generare così

**Le icone no.** Trenta glifi generati uno per uno non condivideranno mai lo stesso peso di
tratto, la stessa griglia, lo stesso raggio degli angoli — e l'incoerenza fra icone è
precisamente ciò che fa sembrare fatta in casa un'interfaccia. Le icone si prendono da un insieme
disegnato insieme (§5, fetta 1).

Si genera solo ciò che è **unico e grande**: le otto illustrazioni delle testate.

### 6.2 Il blocco di stile, da mettere in coda a ogni prompt

```
Stile: oggetto 3D singolo, materiale vetro smerigliato traslucido con bordi netti e
un sottile contorno luminoso. Vista di tre quarti, leggermente dall'alto.
Palette: indaco e viola (#5a50e0, #8f8aff) con riflessi freddi; nessun altro colore
dominante. Illuminazione morbida da sopra-sinistra, riflesso speculare stretto,
ombra assente.
Sfondo COMPLETAMENTE TRASPARENTE. Nessun testo, nessuna lettera, nessun numero,
nessun logo, nessuna interfaccia intorno.
Composizione centrata con margine, l'oggetto occupa circa il 70% del quadrato.
Formato quadrato 1024×1024, PNG con canale alfa.
Deve restare leggibile sia su fondo nero sia su fondo bianco: il contrasto lo dà il
contorno dell'oggetto, non lo sfondo.
```

### 6.3 Gli otto soggetti

**1. Conferma — «movimenti da confermare»**

```
Un grande segno di spunta stilizzato dentro un quadrato con angoli molto arrotondati,
in vetro smerigliato viola. Il segno di spunta è in rilievo, più luminoso del quadrato
che lo contiene.
```

**2. Abbonamenti — «si disdicono, il risparmio è certo»**

```
Due o tre carte di pagamento impilate a ventaglio, in vetro smerigliato viola, con gli
angoli arrotondati e i bordi luminosi. Nessun numero, nessun logo, nessuna banda
magnetica: superfici lisce.
```

**3. Abitudini — «niente da disdire: si ripete perché lo si rifà»**

```
Una casa molto semplificata, quasi un'icona solida: corpo squadrato e tetto a due
falde, in vetro smerigliato azzurro-verde freddo. Nessuna finestra, nessuna porta,
nessun dettaglio architettonico.
```

**4. Oggi — la scheda del totale del mese**

```
Una sfera di vetro smerigliato viola con dentro, in rilievo luminoso, una linea
spezzata da elettrocardiogramma che l'attraversa orizzontalmente. La linea è l'unico
elemento acceso.
```

**5. Dove — la discesa nella spesa**

```
Tre lastre quadrate di vetro smerigliato viola sovrapposte e sfalsate, come strati di
una mappa vista di tre quarti. Quella in cima è la più piccola e la più luminosa.
```

**6. Chiedi — il copilota**

```
Una scintilla a quattro punte, spigolosa e allungata, in vetro smerigliato viola molto
luminoso, con una seconda scintilla più piccola accanto in basso a destra.
```

**7. «Sei in pari» — lo stato vuoto della conferma**

```
Un segno di spunta in vetro smerigliato verde acqua dentro un cerchio sottile dello
stesso materiale, con un alone morbido intorno. Sereno, non trionfale: nessun raggio,
nessun coriandolo, nessuna esplosione.
```

**8. Report — il racconto del mese**

```
Un foglio di carta in vetro smerigliato viola, leggermente curvato come se fosse
appena stato posato, con tre righe orizzontali in rilievo luminoso a suggerire del
testo. Le righe non devono formare lettere leggibili.
```

### 6.4 Cosa fare con i file che escono

1. **scarta quelli con del testo dentro.** I generatori ne infilano quasi sempre; una lettera
   storta dentro un'illustrazione è la cosa che si nota per prima;
2. **controlla la trasparenza vera.** Spesso lo sfondo è bianco e non trasparente: aprilo su
   fondo nero e guarda;
3. **converti in WebP** e stai sotto i 40 KB (`cwebp -q 82 -alpha_q 90`);
4. **provali su tutti e due i temi** prima di metterli. Un oggetto che sul chiaro sparisce va
   rifatto col contorno più marcato, non tenuto perché sul nero era bello;
5. mettili in `public/illustrazioni/`, con il nome del soggetto: `conferma.webp`,
   `abbonamenti.webp`, …

### 6.5 Il prompt di riserva, se lo stile vetroso non convince

```
Stile alternativo: illustrazione 3D in argilla morbida (clay render), superfici opache
e leggermente ruvide, angoli molto arrotondati, palette indaco e viola con una seconda
tinta calda solo come accento. Illuminazione da studio a tre punti, ombra di contatto
morbida sotto l'oggetto. Sfondo trasparente, nessun testo.
```

Vale la pena generare **un** soggetto in entrambi gli stili e decidere guardandoli accanto, prima
di produrne otto in uno stile che poi non piace.

---

## 7. Come si verifica

Le misure che questa applicazione usa già, e che restano le stesse:

- **nessuna schermata sborda** a 320, 375, 390, 430, 768 e 1280 px. Il confronto va fatto contro
  la larghezza del **dispositivo**, non contro `window.innerWidth`: su un telefono la finestra di
  layout si allarga da sola per contenere ciò che sborda, e il controllo direbbe sempre di no;
- **nessun bersaglio sotto i 44 px.** Le tessere sono decorazione: se una tessera è toccabile,
  il bersaglio è la riga intera;
- **entrambi i temi**, sempre;
- **l'altezza delle schermate non cresce.** Il cruscotto sta in 1.645 px ed è costato tre
  sessioni arrivarci. Le tessere aggiungono altezza a ogni riga: se «In cosa» passa da nove righe
  in due schermate a nove righe in tre, il guadagno estetico si è mangiato quello di lettura.

E una prova che non è una misura: **aprire l'app e trovare una spesa di venti giorni fa.** Se
con le icone ci si mette meno, hanno funzionato. Se ci si mette uguale e la schermata è più
bella, è comunque un guadagno — ma va detto che è quello, invece di raccontarsi che è più usabile.
