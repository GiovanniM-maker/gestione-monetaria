# Prestazioni — il piano dei rimedi

> Segue `docs/prestazioni.md`, secondo passaggio (22 agosto 2026). Quel documento dice **dove sta
> il lavoro**; questo dice **come toglierlo**, in che ordine, e come accorgersi di averlo rotto.
>
> Ogni passo qui dentro ha quattro parti: **cosa** cambia, **perché** è sicuro farlo, **il codice**,
> e **come si verifica**. Un passo senza la quarta parte non è un passo: è una speranza.

---

## Stato al 22 agosto 2026, sera

| Passo                                        | Stato                       |
| -------------------------------------------- | --------------------------- |
| 1 · migration `0057`                         | **applicata in produzione** |
| 2 · consegna in una chiamata                 | **fatto**                   |
| 3 · finestra sul registro grezzo             | **fatto**                   |
| 4 · invalidazione condizionale               | **fatto**                   |
| 5 · cache sulle letture di pagina            | da fare                     |
| 6 · `loading.tsx` sulle tre pagine           | da fare                     |
| 7 · misurare in produzione, poi la geografia | da fare                     |

Tre cose sono state fatte **in più** rispetto al piano, e vanno sapute:

- **`aLotti` è una funzione a sé con i suoi test** (`tests/tassonomia-lotti.test.ts`). Spezzare i
  gruppi fra più chiamate è logica che sbagliando non dà errore: perde un gruppo, o ne consegna uno
  due volte, e il risultato è una classificazione plausibile e incompleta. L'invariante provato è
  uno: ogni identificativo esce esattamente una volta, con la sua assegnazione.
- **`haScritto` è esportata e provata** (`tests/sync-ha-scritto.test.ts`), compreso il caso che
  conta: `aggiornate` da solo **non** deve bastare a buttare la cache, perché conta le righe
  riscritte e non quelle cambiate.
- **`/api/admin/sync-accounts` forza una normalizzazione completa.** Era un obbligo del §4 e non un
  extra: rinominare un conto cambia il riconoscimento dei giroconti su tutto lo storico, e finché il
  giro veloce rinormalizzava tutto ogni cinque minuti si riparava da solo. Ora si ripara qui,
  subito, invece che fino a quattro ore dopo.

**Verificato in produzione il 22 agosto**, dopo il deploy: i tre invarianti sono **identici** a
prima della fusione — luglio 2026 −3.640,32 €, giroconti 23,9%, ricorrente −2.173,24 €/mese. La
finestra non ha perso nessun giroconto, che era il modo di sbagliare da temere.

Attenzione a come si legge quel «identici»: sarebbero identici **anche se il codice nuovo non avesse
girato**. La prova che ha girato è l'altra, e sta su `/debug/sync`: la riga «righe toccate» a zero
alla seconda esecuzione, e `esaminate` del giro veloce sceso da ~2.000 a qualche decina.

---

## 0. Gli invarianti — i numeri che non si devono muovere

Prima di toccare qualsiasi cosa, questi vanno **presi e scritti**. Sono gli stessi che chiudono le
Fasi 3, 4 e 5, e sono l'unica difesa contro il modo di sbagliare che conta davvero qui: non
l'errore che dà errore, ma quello che produce un numero plausibile e falso.

```sql
select 'spesa reale luglio 2026'      as grandezza, sum(amount_eur)::text as valore
  from v_expenses where booking_date between '2026-07-01' and '2026-07-31'
union all
select 'giroconti, quota su tutto',
       round(100.0 * count(*) filter (where is_transfer) / count(*), 1)::text || '%'
  from transactions
union all
select 'movimenti normalizzati', count(*)::text from transactions
union all
select 'costo ricorrente mensile',
       sum(costo_mensile)::text from v_subscriptions where nella_metrica
union all
select 'copertura in euro',
       round(100.0 * sum(amount_eur) filter (where merchant_id is not null)
                   / nullif(sum(amount_eur), 0), 1)::text || '%'
  from v_expenses;
```

Attesi, al 13 agosto 2026: **−3.640,32 €**, **23,8%**, **1.957** (cresciuto da allora),
**−2.045,75 €/mese**, **94,0%**.

**Se uno di questi si sposta dopo un passo, il passo è sbagliato — non il numero.** Vale in
particolare per la quota di giroconti: è già stata al 59% una volta, per un motivo diverso, e metà
della spesa reale era sparita dalle analisi senza un errore.

---

## 1. L'ordine, e perché è questo

I passi si tengono l'uno con l'altro, e cambiarne l'ordine costa lavoro doppio.

1. **La migration** (`0057`) prepara i due strumenti SQL. Da sola non cambia niente: nessuno la
   chiama ancora. È il passo con rischio zero e va per primo, così i due successivi non devono
   aspettare una finestra di deploy.
2. **La consegna in una chiamata** (`applicaTassonomia`) toglie 166 viaggi. Non dipende da niente
   altro e si verifica confrontando lo stato prima e dopo: o le righe sono identiche o è una
   regressione.
3. **La finestra** (`normalizzaTutto`) toglie i cinque viaggi da 884 kB e la riscrittura completa.
   **Dipende dal passo 1**, perché è il riconoscimento strutturale dei giroconti — che oggi ha
   bisogno di leggere tutto il registro — a impedire la finestra.
4. **L'invalidazione condizionale** toglie il buttare la cache dodici volte all'ora. **Dipende dal
   passo 2 e 3**: senza di loro il segnale «non è cambiato niente» non esiste, perché ogni giro
   riscrive comunque duemila righe.
5. **La cache sulle letture di pagina** ha senso solo dopo il 4: finché la cache viene buttata ogni
   cinque minuti, allargarla non serve.
6. **Misurare in produzione**, e solo dopo parlare di geografia.

---

## 2. Passo 1 — la migration `0057`, già scritta e già provata

**File**: `supabase/migrations/0057_meno_viaggi.sql`. **Verifica**:
`supabase/verifiche/0057_meno_viaggi.sql`, che gira dentro una transazione chiusa da `rollback` e
si può quindi lanciare in produzione senza lasciare traccia.

Contiene due funzioni e un indice.

### `rileva_giroconti_strutturali()`

Marca `is_transfer` dove lo stesso `external_id` compare su due conti nostri diversi. È la prova
strutturale già in uso dalla Fase 3 — oggi calcolata in memoria da `normalizzaTutto`, che per farlo
**deve leggere l'intero registro grezzo**. È l'unica ragione per cui quella funzione non può
lavorare su una finestra, ed è per questo che si sposta.

Due proprietà da tenere a mente:

- **è additiva**: marca, non smarca. Il registro grezzo è immutabile, quindi un riferimento
  condiviso non torna indietro; e togliere un `is_transfer` per errore rimetterebbe migliaia di euro
  di giroconti dentro la spesa;
- **guarda `transactions`, non `raw_transactions`**. È una differenza a favore: una riga grezza che
  non si normalizza non produce nessuna transazione, quindi il suo riferimento non può marcare
  niente di reale.

### `applica_assegnazioni(p_gruppi jsonb, p_da_svuotare uuid[])`

Applica in **una** chiamata le assegnazioni esercente → transazioni che oggi costano una `UPDATE`
per esercente. L'abbinamento fra etichetta ed esercente **resta in TypeScript**, dov'è adesso e dove
deve stare: è logica con dei test, non una query. Cambia solo come si consegna il risultato.

Tre proprietà, in ordine di importanza:

1. **non tocca `manually_categorized`** — il filtro c'è già nel chiamante, qui è ripetuto perché una
   regola che protegge un dato dell'utente deve fallire chiusa anche se il chiamante se ne dimentica;
2. **scrive solo ciò che cambia** (`is distinct from`) — è la differenza fra un giro a vuoto che
   riscrive duemila righe, facendo scattare duemila volte il trigger di `updated_at`, e uno che non
   scrive niente. Su un pendolo che batte ogni cinque minuti è metà del guadagno, ed è anche il
   segnale su cui poggia il passo 4;
3. **restituisce quante righe ha toccato davvero**, distinte fra assegnate e svuotate. Un resoconto
   che dicesse sempre «2.000» non permetterebbe di accorgersi che il giro non sta facendo niente.

### Misurato sulla replica (2.000 movimenti, 166 esercenti)

| Operazione                               | Oggi                            | Con la 0057                           |
| ---------------------------------------- | ------------------------------- | ------------------------------------- |
| assegnare 1.960 righe da zero            | 166 viaggi                      | **1 viaggio, 143,6 ms**               |
| rilanciare senza che sia cambiato niente | 166 viaggi + 58 ms di scritture | **1 viaggio, 5,1 ms, zero scritture** |
| riconoscimento strutturale dei giroconti | 5 viaggi + 884 kB letti in Node | **1 viaggio, 2,4 ms**                 |

### Come si applica

Si incolla nel SQL editor di Supabase. Si applica due volte senza errori — provato. Poi la verifica,
che deve stampare otto controlli tutti con il valore atteso accanto:

```
prima chiamata                                  {"svuotate": 0, "assegnate": 1960}
righe diverse dallo stato di partenza (atteso 0)                                 0
seconda chiamata: assegnate deve essere 0       {"svuotate": 0, "assegnate": 0}
terza chiamata, con una riga protetta e vuota   {"svuotate": 0, "assegnate": 0}
la riga protetta e' rimasta vuota (atteso 1)                                     1
svuotamento chiesto su una riga protetta        {"svuotate": 0, "assegnate": 0}
giroconti strutturali marcati (atteso 2)                                         2
la solitaria NON e' marcata (atteso 0)                                           0
le due condivise sono marcate (atteso 2)                                         2
seconda chiamata: 0 nuove marcature                                              0
```

**Il caso dei giroconti va seminato dentro la verifica**, e lo fa: il database di oggi ha un conto
solo, e con un conto solo nessun riferimento può essere condiviso — una funzione rotta e una
funzione che non ha niente da fare darebbero lo stesso risultato. È la stessa trappola dei
rilevatori alla prima esecuzione, scritta nella Fase 8.

**Rischio**: nullo finché nessuno chiama le due funzioni. **Ritorno indietro**: `drop function`.

---

## 3. Passo 2 — `applicaTassonomia` consegna in una chiamata sola

**File**: `src/lib/tassonomia/applica.ts`.

### Cosa si toglie

```ts
// Una UPDATE per esercente invece di una per riga: gli esercenti sono
// quaranta, le transazioni duemila.
for (const [merchantId, ids] of perAssegnazione) {
  const assegnazione = assegnazioni.get(merchantId);
  if (assegnazione === undefined) continue;
  await aggiornaAScaglioni(supabase, ids, assegnazione);
}

await aggiornaAScaglioni(supabase, daSvuotare, NESSUNA_ASSEGNAZIONE);
```

Il commento diceva «quaranta». Sono **centosessantasei**, e cresceranno.

### Cosa si mette

```ts
// Le assegnazioni partono tutte insieme. La logica di abbinamento resta qui —
// e' codice con dei test, non una query — ma consegnarla un esercente per volta
// costava 166 andate e ritorno per rispondere quasi sempre «non e' cambiato
// niente».
const gruppi = [...perAssegnazione.entries()].flatMap(([merchantId, ids]) => {
  const a = assegnazioni.get(merchantId);
  return a === undefined ? [] : [{ ...a, ids }];
});

const { data: esitoScrittura, error: erroreScrittura } = await supabase.rpc(
  'applica_assegnazioni',
  { p_gruppi: gruppi, p_da_svuotare: daSvuotare },
);

// L'errore si lancia, non si ingoia: `const { data }` da solo trasformerebbe
// una funzione assente in «non ho scritto niente», che e' un guasto travestito
// da risposta. E' la regola pagata provando la 0050.
if (erroreScrittura !== null) {
  throw new Error(`applica_assegnazioni fallita: ${erroreScrittura.message}`);
}

const scritte = (esitoScrittura ?? { assegnate: 0, svuotate: 0 }) as {
  assegnate: number;
  svuotate: number;
};
```

`aggiornaAScaglioni` e `NESSUNA_ASSEGNAZIONE` spariscono con il ciclo.

### Due cose da aggiungere, non facoltative

**`assegnate` e `svuotate` entrano in `EsitoCategorizzazione`.** Non sono cosmesi: sono il segnale
su cui poggia il passo 4, e sono anche l'unico modo di accorgersi che il giro ha smesso di fare
qualcosa. Il resoconto di `/debug/sync` li mostra.

**Un tetto al numero di identificativi per chiamata.** Duemila `uuid` sono ~74 kB di corpo, che va
benissimo; ventimila sarebbero 740 kB, che non va più bene. Il tetto non serve oggi e serve fra due
anni, e costa sei righe:

```ts
/** Oltre questo si spezza: un corpo di richiesta enorme e' l'altro modo di essere lenti. */
const IDS_PER_CHIAMATA = 5_000;
```

Si spezza `gruppi` in pagine da 5.000 identificativi complessivi e si somma quello che tornano. Con
il passo 3 applicato i numeri veri sono di due ordini di grandezza più piccoli, ma un tetto che
esiste solo quando serve non esiste.

### Come si verifica

1. **Prima e dopo devono essere identici.** Prima della modifica:
   ```sql
   create table _prova_tassonomia as
     select id, merchant_id, category_id, discretion, context from transactions;
   ```
   Dopo aver eseguito `4 · Categorizza` da `/debug/sync` con il codice nuovo:
   ```sql
   select count(*) as righe_diverse from _prova_tassonomia p join transactions t using (id)
    where (t.merchant_id, t.category_id, t.discretion, t.context)
          is distinct from (p.merchant_id, p.category_id, p.discretion, p.context);
   ```
   **Deve dire 0.** Poi `drop table _prova_tassonomia`.
2. **Rilanciare**: `assegnate` e `svuotate` devono essere **0**, e la copertura identica. È la
   proprietà nuova, e prima non era osservabile.
3. Gli invarianti del §0.

**Rischio**: medio-basso. La logica di abbinamento non si tocca; cambia solo la consegna.
**Ritorno indietro**: si rimette il ciclo. La 0057 può restare, inerte.

---

## 4. Passo 3 — `normalizzaTutto` guarda solo ciò che è arrivato

**File**: `src/lib/normalize/run.ts`. È il passo che vale di più ed è quello dove si può fare più
danno, quindi va trattato come una migration.

### L'argomento di sicurezza, che è il cuore del passo

Restringere una finestra è pericoloso in generale: **una finestra troppo stretta lascia fuori un
movimento che nessuno vedrà mancare.** Qui però c'è un argomento strutturale, e va scritto perché è
l'unica ragione per cui il passo è difendibile:

1. **`raw_transactions` è immutabile e unica su `(account_id, payload_hash)`.** Una riga grezza non
   cambia mai. Un payload cambiato è una **riga nuova**, con un `fetched_at` nuovo.
2. Quindi, per una riga grezza invariata, `normalizzaMovimento` produce sempre lo stesso risultato —
   **tranne** se cambia una di due cose: il **codice** del normalizzatore (un deploy), oppure
   `nomiContiPropri`, cioè i nomi dei conti e `own_counterparties`.
3. `own_counterparties` **non ha nessun percorso di scrittura nell'applicazione**: si tocca a mano
   sul pannello Supabase. I nomi dei conti li cambia solo `/api/admin/sync-accounts`.
4. Entrambi i casi sono coperti dal profilo **completo**, che gira quattro volte al giorno e
   continua a lavorare su **tutto**.

Ne discendono due obblighi, e vanno fatti insieme al resto o l'argomento non regge:

- **il profilo `completo` non prende nessuna finestra.** Nessuna, mai, nemmeno «una grande».
- **`/api/admin/sync-accounts` forza una normalizzazione completa** dopo aver rinominato dei conti.
  È l'unico caso in cui l'app stessa può invalidare il ragionamento, e costa una riga.

### La finestra

**Quattordici giorni su `fetched_at`**, cioè il doppio della finestra di scarico. Non è prudenza
generica: lo scarico chiede sette giorni indietro, quindi tutto ciò che il giro veloce può aver
portato è entrato nel registro nelle ultime ore. Quattordici giorni coprono anche il caso in cui il
giro completo sia fermo da una settimana — che è successo, per tre giorni, nell'agosto 2026.

L'indice c'è già: `raw_transactions_account_fetched_idx`.

```ts
export type OpzioniNormalizzazione = {
  /**
   * Quanti giorni indietro guardare nel registro grezzo. `null` = tutto.
   *
   * Il profilo `completo` passa `null` e non e' negoziabile: e' lui a coprire
   * i due casi in cui una riga grezza invariata puo' normalizzarsi in modo
   * diverso — un deploy del normalizzatore, e un cambio di `own_counterparties`
   * o dei nomi dei conti. Vedi `docs/prestazioni-rimedi.md` §4.
   */
  giorniIndietro?: number | null;
};

/** Il doppio della finestra di scarico. Generosa di proposito: vedi sopra. */
export const FINESTRA_VELOCE_GIORNI = 14;
```

Nel ciclo di lettura:

```ts
const soglia =
  giorniIndietro === null ? null : new Date(Date.now() - giorniIndietro * 86_400_000).toISOString();

// ...
let query = supabase
  .from('raw_transactions')
  .select('id, account_id, source, payload, fetched_at')
  .order('id', { ascending: true })
  .range(da, da + DIMENSIONE_BLOCCO - 1);

if (soglia !== null) query = query.gte('fetched_at', soglia);

const { data, error } = await query;
```

### Il riconoscimento strutturale se ne va in SQL

È la parte che **abilita** la finestra, e va fatta nello stesso commit o la finestra rompe i
giroconti.

Spariscono `riferimentiVisti`, la chiamata a `riferimentiSuPiuConti` e il termine `|| strutturale`
dentro `daScrivere`. `riferimentiSuPiuConti` resta esportata **con i suoi test**: è la definizione
di cosa sia un riferimento condiviso, ed è quella che la funzione SQL implementa.

Dopo l'`upsert`, accanto a `rileva_giroconti_speculari`:

```ts
// Il fatto e' globale e resta globale, ma costa un viaggio invece di cinque e
// non passa piu' da Node. E' anche cio' che permette alla lettura qui sopra di
// guardare una finestra invece di tutto il registro.
const { data: strutturali, error: erroreStrutturali } = await supabase.rpc(
  'rileva_giroconti_strutturali',
);
if (erroreStrutturali !== null) {
  errori.push(`rileva_giroconti_strutturali: ${erroreStrutturali.message}`);
}
```

`girocontiStrutturali` nell'esito diventa quello che torna la RPC, cioè **quanti ne ha marcati di
nuovi** — che è più utile di oggi, dove conta quanti ne ha visti.

**Una cosa da sapere e non da stupirsi**: durante una normalizzazione completa esiste una finestra
di qualche secondo in cui un giroconto strutturale è `is_transfer = false`, fra l'`upsert` e la RPC.
È un lavoro di sfondo, nessuno sta guardando, e alla fine lo stato è identico. Ma va saputo prima di
vederlo in una query lanciata nel momento sbagliato.

### Il chiamante

In `src/lib/sync/quotidiano.ts`:

```ts
esito.normalizzazione = await normalizzaTutto({
  giorniIndietro: profilo === 'veloce' ? FINESTRA_VELOCE_GIORNI : null,
});
```

### Come si verifica

1. **Il giro completo non deve cambiare niente.** Snapshot di `transactions`, `8 · Sequenza
quotidiana`, confronto: zero righe diverse.
2. **Il giro veloce deve trovare un movimento nuovo.** Il modo onesto di provarlo è aspettare che ne
   arrivi uno; il modo veloce è cancellare **una** riga da `transactions` (non da
   `raw_transactions`, che è immutabile) e lanciare il giro veloce: deve tornare.
3. **I giroconti.** È l'invariante più delicato:
   ```sql
   select round(100.0 * count(*) filter (where is_transfer) / count(*), 1) from transactions;
   ```
   **23,8%.** Se sale, la finestra sta marcando cose che non sono giroconti; se scende, ne sta
   perdendo — ed è il verso peggiore, perché rimette migliaia di euro di spostamenti dentro la spesa.
4. **I viaggi.** Nel resoconto di `/debug/sync`, `esaminate` del giro veloce deve passare da ~2.000
   a qualche decina. È la misura diretta del guadagno.
5. Gli invarianti del §0, tutti.

**Rischio**: il più alto del documento. **Ritorno indietro**: passare `giorniIndietro: null` anche
al profilo veloce — una riga — che rimette il comportamento di oggi lasciando in piedi tutto il
resto. È il motivo per cui la finestra è un **parametro** e non una riscrittura.

---

## 5. Passo 4 — buttare la cache solo se qualcosa è cambiato

**File**: `src/app/api/admin/aggiorna/route.ts`.

Oggi `risposta()` chiama `scadeTutto()` sempre, anche quando il giro non ha trovato niente: dodici
volte all'ora l'intera cache dei dati viene buttata per registrare che non è cambiato nulla.

```ts
/**
 * Se non si e' certi che non sia cambiato niente, si invalida.
 *
 * Il verso in cui fallire non e' simmetrico: una cache buttata per niente costa
 * qualche query, un totale vecchio mostrato come fresco e' il guasto che questa
 * applicazione non si puo' permettere. Quindi ogni «non lo so» — un errore, una
 * normalizzazione che non e' girata, un resoconto senza il campo — vale «si».
 */
function haScritto(esito: EsitoQuotidiano): boolean {
  if (esito.errore !== null) return true;
  if (esito.righeNuove > 0) return true;

  const n = esito.normalizzazione;
  if (n === null) return true;
  if (n.inserite > 0 || n.girocontiStrutturali > 0 || n.girocontiSpeculari > 0) return true;

  // `?? 1` e non `?? 0`: se il campo non c'e', non si sa, e non sapere vale «si».
  return (
    (esito.categorizzazione?.assegnate ?? 1) > 0 || (esito.categorizzazione?.svuotate ?? 1) > 0
  );
}
```

**`aggiornate` non va usato come segnale**, ed è la trappola di questo passo: vale
`daScrivere.length − inserite`, cioè conta le righe **riscritte**, non quelle **cambiate**. Con
l'`upsert` che riscrive anche una riga identica, sarebbe maggiore di zero ogni volta che la finestra
contiene qualcosa — cioè sempre. I tre segnali esatti sono `righeNuove` (dalla banca), `inserite`
(righe davvero nuove) e `assegnate`/`svuotate` (dalla 0057, che confronta prima di scrivere).

**Da non fare**: rendere l'`upsert` stesso condizionale rileggendo le righe per confrontarle. Sarebbe
un viaggio in più per risparmiarne uno, e con la finestra del passo 3 il numero di righe riscritte è
già piccolo.

### Come si verifica

Aprire l'app e lasciarla davanti dieci minuti senza fare niente. Nei log delle funzioni Vercel, i due
giri veloci devono comparire; nella risposta, `righeNuove: 0`. Il modo di vederlo dal di fuori: la
seconda navigazione dopo un giro a vuoto deve essere più rapida della prima, perché la cache è
sopravvissuta.

**Rischio**: basso, e il verso dell'errore è quello giusto per costruzione. **Ritorno indietro**:
`return true` in cima a `haScritto`.

---

## 6. Passo 5 — mettere in cache le letture di pagina che oggi non lo sono

Su **158 letture**, 19 passano da `inCache`. Cinque percorsi valgono la modifica:

| Percorso          | File                     | Chiave                      |
| ----------------- | ------------------------ | --------------------------- |
| `/movimenti`      | `lib/movimenti/cerca.ts` | **tutti** i filtri + pagina |
| `/da-confermare`  | `lib/conferma/leggi.ts`  | il giorno                   |
| `/avvisi`         | `lib/avvisi/leggi.ts`    | lo stato mostrato           |
| `/categoria/[id]` | la pagina                | id + mese                   |
| `/esercente/[id]` | la pagina                | id + mese                   |

**Non** vanno messi in cache `copilota/strumenti.ts` (22 letture) né `copilota/conversazione.ts`
(16): quei dati vanno letti nell'istante in cui il modello li chiede, e una risposta costruita su un
aggregato di un minuto fa sarebbe un numero vecchio raccontato come attuale.

La forma è quella già in uso: la lettura accetta il client come primo argomento e `inCache` glielo
passa.

```ts
export const cercaMovimenti = inCache(
  'movimenti/cerca',
  async (sb: SupabaseClient, filtri: FiltriMovimenti): Promise<RisultatoRicerca> => {
    /* … */
  },
);
```

**Il pericolo di questo passo è uno solo, e non è la lentezza**: una chiave incompleta è il modo di
far comparire i dati di luglio sotto l'intestazione di agosto. Ogni argomento che cambia il
risultato deve stare nella chiave — mese, categoria, esercente, tipo, ricerca, ordine, pagina.

### Come si verifica

Per ogni percorso: aprirlo con due filtri diversi in rapida successione e confrontare i totali con
la stessa query fatta a mano. Poi fare una scrittura (confermare un movimento) e ricaricare: il
numero deve essere cambiato, perché `scadeTutto()` è passato.

**Rischio**: basso in prestazioni, **alto in correttezza** se la chiave è incompleta.
**Ritorno indietro**: togliere `inCache`, la lettura resta identica.

---

## 7. Passo 6 — le pagine senza `loading.tsx`

Il secondo passaggio diceva «sette pagine su ventiquattro». **Il numero è più piccolo di così**, e
va corretto: quattro delle sette sono statiche (`login`, `privacy`, `terms`, `auth/error`) e non
aspettano niente. Ne restano **tre** vere:

- `report/[id]` — l'unica dell'uso quotidiano;
- `debug/eb` e `debug/sync` — diagnostica.

Costa tre file di poche righe e non toglie un millisecondo: toglie la sensazione che il tocco non
sia arrivato, che è metà del problema percepito. **Rischio**: nullo.

---

## 8. Passo 7 — poter misurare in produzione, e solo dopo la geografia

Oggi non esiste un modo di sapere quanto ci mette una pagina davvero. È il debito §4.8 del primo
documento, ancora aperto, e finché resta aperto ogni modifica futura — comprese quelle qui sopra — è
una scommessa verificata solo su una replica.

Servono due cose:

1. **Vercel Speed Insights** sul progetto, che dà TTFB e LCP reali dal dispositivo vero;
2. **un tempo per ondata** nel log delle funzioni: quanto l'autenticazione, quanto le query, quanto
   il render. Tre numeri, non uno: sono tre malattie diverse con tre cure diverse, e curarne una
   sbagliata non fa niente.

**Solo dopo** si torna sulla geografia, leggendo il §12 del secondo passaggio e non il §4.4 del
primo: funzioni e database stanno **entrambi** a Washington, quindi spostare le funzioni in Europa le
avvicinerebbe all'utente e le allontanerebbe dal database. Con i passi 2 e 3 fatti il numero di
viaggi crolla, e a quel punto il conto può girare a favore — ma va deciso su una misura.

Se invece si sposta **il database** in Europa, vincono entrambi. È una migrazione con un fermo e va
pianificata a parte.

---

## 9. Cosa non va fatto

- **Indici, riscritture di viste, materializzazioni.** La query più cara è 11 ms. Sarebbe lavoro su
  un problema che non esiste, e ogni vista materializzata è una copia che può divergere.
- **Togliere il doppio controllo di autenticazione.** È la regola 6 e la difesa contro il giorno in
  cui il matcher del proxy cambia. Si toglie il **costo**, non il controllo — e metà del costo è già
  stata tolta con `cache()`.
- **Mettere le pagine in una cache condivisa.** Sono dati bancari. `inCache` mette il gettone di
  sessione nella chiave proprio per non doverci rinunciare.
- **Far girare la sequenza completa più spesso.** Il punto dei due profili è esattamente questo, e
  con i passi 2 e 3 il profilo veloce diventa quasi gratis: la tentazione di unirli tornerà, e va
  respinta.
- **`next/image` al posto dei nove `<img>`.** Le illustrazioni sono webp da 10-16 kB con `width` e
  `height` espliciti. Non c'è niente da guadagnare.
- **Riscrivere `abbinaMerchant` in SQL.** È logica con dei test, ed è l'unica parte della cascata
  che sbagliando produce un totale plausibile e falso. Sta bene dov'è.

---

## 10. Il riassunto, per chi apre questo file fra sei mesi

| Passo                             | Cosa toglie                                       | Rischio                                   | Dipende da |
| --------------------------------- | ------------------------------------------------- | ----------------------------------------- | ---------- |
| 1 · migration `0057`              | niente, prepara                                   | nullo                                     | —          |
| 2 · consegna in una chiamata      | **166 viaggi** per giro                           | medio-basso                               | 1          |
| 3 · finestra sul registro grezzo  | **~15 viaggi + 884 kB + la riscrittura completa** | **il più alto**                           | 1          |
| 4 · invalidazione condizionale    | la cache buttata 12 volte all'ora                 | basso                                     | 2, 3       |
| 5 · cache sulle letture di pagina | query ripetute sulle 5 schermate più usate        | basso in prestazioni, alto in correttezza | 4          |
| 6 · `loading.tsx`                 | la sensazione che il tocco non arrivi             | nullo                                     | —          |
| 7 · misurare, poi la geografia    | l'ultimo pezzo che resta ignoto                   | —                                         | tutti      |

Da **≈195 andate e ritorno ogni cinque minuti** a una manciata, con la proprietà nuova che quando
non è cambiato niente **non si scrive niente e non si butta niente**.
