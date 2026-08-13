/**
 * Il controllo che il modello non abbia scritto una cifra che non aveva.
 *
 * ---------------------------------------------------------------------------
 * Perché non basta scriverglielo nelle istruzioni
 * ---------------------------------------------------------------------------
 * Nel report della Fase 9 le istruzioni dicevano, in maiuscolo, «NON calcolare,
 * stimare o dedurre nessun numero». Il modello ha copiato correttamente
 * `-2829.02` e l'ha chiamata «la **media** dei sei mesi precedenti». È una
 * mediana — `percentile_disc`, scelta apposta perché una media produce un
 * valore che non è mai stato speso in nessun mese. Il numero era giusto e la
 * frase era falsa.
 *
 * Quello era un errore di *nome*. In una chat, dove il modello sceglie da solo
 * cosa chiedere, arriva anche l'errore di *valore*: se la risposta che ha in
 * mano non contiene la cifra che l'utente ha chiesto, la calcola. Una
 * percentuale, una differenza fra due mesi, un «circa». Le istruzioni non lo
 * impediscono, perché non c'è niente che le faccia rispettare.
 *
 * Questo modulo è la cosa che le fa rispettare: prende la risposta scritta e
 * l'insieme dei dati che il modello ha davvero ricevuto, e dice quali cifre
 * della risposta **non erano nei dati**. Non censura niente — la risposta si
 * legge lo stesso — ma la cifra inventata compare marcata sotto il messaggio,
 * ed è la differenza fra un numero di cui fidarsi e uno di cui no.
 *
 * ---------------------------------------------------------------------------
 * Cosa si controlla, e perché non tutto
 * ---------------------------------------------------------------------------
 * Si controllano gli **importi** (hanno una parte decimale, oppure valgono
 * mille o più) e le **percentuali**. Sono le cifre che portano una decisione e
 * che nessuno ricontrolla.
 *
 * Non si controllano gli interi piccoli e nudi: «due o tre voci», «gli ultimi
 * 6 mesi», «59 ordini». Contare gli elementi di un elenco ricevuto è l'unica
 * aritmetica che si può concedere, e segnalarla riempirebbe di avvisi ogni
 * risposta — finché un avviso è raro si guarda, quando diventa costante si
 * ignora, e a quel punto non protegge più niente.
 *
 * ---------------------------------------------------------------------------
 * Il confronto è tollerante, di proposito
 * ---------------------------------------------------------------------------
 * `-3640.32` nei dati e «3.640,32 €» nel testo sono lo stesso numero: cambiano
 * il segno, il separatore e le migliaia. Anche «3.640 €» lo è, arrotondato per
 * leggibilità. Un controllo severo li segnalerebbe tutti e tre, e un avviso che
 * grida sempre non lo legge nessuno.
 *
 * Quindi: si confronta il valore assoluto, si accettano le forme arrotondate a
 * zero e a un decimale, e un token ambiguo (`1.234`, che in italiano è
 * milleduecentotrentaquattro e in inglese uno-virgola-due-tre-quattro) passa se
 * **una** delle sue letture sta nei dati. L'errore che si vuole prendere non è
 * l'arrotondamento: è la cifra che nei dati non c'è affatto.
 */

/** Una cifra scritta nella risposta, con le sue letture possibili. */
export type CifraScritta = {
  /** Come compare nel testo, per poterla mostrare all'utente. */
  testo: string;
  /** Le letture ammissibili, in forma canonica. Basta che una sia nei dati. */
  letture: readonly string[];
};

/**
 * Riduce una stringa decimale alla sua forma canonica: niente segno, niente
 * zeri inutili. `-3640.320` e `3640.32` diventano la stessa chiave.
 */
function canonica(interi: string, decimali: string): string {
  const parteIntera = interi.replace(/^0+(?=\d)/, '');
  const parteDecimale = decimali.replace(/0+$/, '');
  return parteDecimale === '' ? parteIntera : `${parteIntera}.${parteDecimale}`;
}

/**
 * Arrotonda una forma canonica a N decimali, **half away from zero**.
 *
 * Lavora sulle cifre come testo e non su un float, per la stessa ragione per
 * cui tutto il resto dell'applicazione lo evita: qui si sta decidendo se una
 * cifra mostrata all'utente è attendibile, e sarebbe assurdo deciderlo con
 * un'aritmetica che sbaglia già su `0.1 + 0.2`.
 */
function arrotonda(valore: string, decimali: number): string {
  const punto = valore.indexOf('.');
  if (punto === -1) return valore;

  const interi = valore.slice(0, punto);
  const frazione = valore.slice(punto + 1);
  if (frazione.length <= decimali) return canonica(interi, frazione);

  const tenute = frazione.slice(0, decimali);
  const prima = frazione.charCodeAt(decimali) - 48;

  // Sotto il cinque si taglia e basta.
  if (prima < 5) return canonica(interi, tenute);

  // Sopra, si somma un'unità all'ultima posizione tenuta. La somma è su
  // interi, quindi esatta.
  const scalato = BigInt(`${interi}${tenute}`) + 1n;
  const testo = scalato.toString().padStart(decimali + 1, '0');
  const taglio = testo.length - decimali;
  return canonica(testo.slice(0, taglio), testo.slice(taglio));
}

/**
 * Le letture possibili di un token numerico scritto a mano.
 *
 * L'ambiguità è reale e non si può risolvere: in `1.234` il punto separa le
 * migliaia se chi scrive è italiano e i decimali se è inglese, e il modello
 * scrive in italiano parole che ha letto in dati formattati all'inglese. Si
 * restituiscono entrambe le letture, e ne basta una.
 */
export function letture(token: string): readonly string[] {
  const cifre = token.replace(/[^\d.,]/g, '').replace(/^[.,]+|[.,]+$/g, '');
  if (cifre === '' || !/\d/.test(cifre)) return [];

  const punti = (cifre.match(/\./g) ?? []).length;
  const virgole = (cifre.match(/,/g) ?? []).length;

  if (punti + virgole === 0) return [canonica(cifre, '')];

  const ultimo = Math.max(cifre.lastIndexOf('.'), cifre.lastIndexOf(','));
  const coda = cifre.length - ultimo - 1;
  const soloCifre = (s: string) => s.replace(/[.,]/g, '');

  // Due tipi di separatore insieme: l'ultimo è il decimale, non c'è dubbio.
  // `1.234,56` e `1,234.56` sono la stessa cifra scritta in due paesi.
  if (punti > 0 && virgole > 0) {
    return [canonica(soloCifre(cifre.slice(0, ultimo)), soloCifre(cifre.slice(ultimo + 1)))];
  }

  // Lo stesso separatore ripetuto può solo essere quello delle migliaia:
  // `1.234.567` non ha due parti decimali.
  if (punti + virgole > 1) return [canonica(soloCifre(cifre), '')];

  const testa = soloCifre(cifre.slice(0, ultimo));
  const resto = cifre.slice(ultimo + 1);

  // Un separatore solo, con tre cifre dopo: è il caso ambiguo.
  if (coda === 3) return [canonica(testa + resto, ''), canonica(testa, resto)];

  return [canonica(testa, resto)];
}

/**
 * `true` se questo token merita il controllo.
 *
 * Il criterio è «costerebbe una decisione se fosse inventato»: un importo o una
 * percentuale sì, un conteggio piccolo no.
 */
function daControllare(token: string, percentuale: boolean, valuta: boolean): boolean {
  if (percentuale || valuta) return true;

  const l = letture(token);
  return l.some((v) => {
    const punto = v.indexOf('.');
    // Ha una parte decimale di una o due cifre: è scritto come un importo.
    if (punto !== -1 && v.length - punto - 1 <= 2) return true;
    // Vale mille o più: è un ordine di grandezza che nessuno verifica a mente.
    return (punto === -1 ? v : v.slice(0, punto)).replace(/^0+/, '').length >= 4;
  });
}

/**
 * Un numero preceduto o seguito da un simbolo di valuta, o seguito da `%`.
 *
 * Il gruppo 1 cattura anche il `-` iniziale, che poi viene buttato: il segno
 * non si confronta. Il modello scrive «hai speso 3.640,32 €» per un dato che
 * nei nostri numeri vale `-3640.32`, e ha ragione lui — in italiano una spesa
 * si dice positiva.
 */
const TOKEN = /(?:(€)\s*)?(-?\d[\d.,]*)\s*(%|€|euro\b)?/gi;

/** Le date scritte per esteso non sono cifre da controllare. */
const DATA = /\b\d{4}-\d{2}(?:-\d{2})?\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;

export function cifreScritte(testo: string): readonly CifraScritta[] {
  // Le date si tolgono prima: `2026-07-31` altrimenti si legge come tre numeri,
  // e `2026` supererebbe la soglia delle quattro cifre.
  const senzaDate = testo.replace(DATA, ' ');

  const trovate: CifraScritta[] = [];
  for (const m of senzaDate.matchAll(TOKEN)) {
    const token = m[2] ?? '';
    if (token === '') continue;

    const suffisso = (m[3] ?? '').toLowerCase();
    const percentuale = suffisso === '%';
    const valuta = m[1] !== undefined || suffisso === '€' || suffisso === 'euro';

    if (!daControllare(token, percentuale, valuta)) continue;

    const l = letture(token);
    if (l.length === 0) continue;

    trovate.push({ testo: `${token}${percentuale ? '%' : valuta ? ' €' : ''}`, letture: l });
  }

  return trovate;
}

/**
 * Tutte le cifre presenti nei dati che il modello ha ricevuto, nelle forme in
 * cui è lecito riscriverle.
 *
 * Cammina l'intera struttura invece di conoscerne la forma, come fa
 * `sanificaMetriche`: uno strumento nuovo è coperto da subito, mentre un elenco
 * di percorsi da leggere andrebbe aggiornato a mano — e il giorno in cui
 * qualcuno se ne dimentica il controllo comincia a gridare al lupo.
 */
export function cifreDisponibili(dati: unknown): ReadonlySet<string> {
  const chiavi = new Set<string>();

  const aggiungi = (grezzo: string) => {
    for (const lettura of letture(grezzo)) {
      chiavi.add(lettura);
      chiavi.add(arrotonda(lettura, 0));
      chiavi.add(arrotonda(lettura, 1));
    }
  };

  const cammina = (valore: unknown): void => {
    if (valore === null || valore === undefined) return;
    if (typeof valore === 'number') {
      if (Number.isFinite(valore)) aggiungi(Math.abs(valore).toString());
      return;
    }
    if (typeof valore === 'string') {
      // Una stringa può contenere più numeri (una data, una frase): si prendono
      // tutti, perché una cifra che l'utente ha visto è una cifra disponibile.
      for (const m of valore.matchAll(/-?\d[\d.,]*/g)) aggiungi(m[0]);
      return;
    }
    if (Array.isArray(valore)) {
      for (const v of valore) cammina(v);
      return;
    }
    if (typeof valore === 'object') {
      for (const v of Object.values(valore as Record<string, unknown>)) cammina(v);
    }
  };

  cammina(dati);
  return chiavi;
}

/**
 * Le cifre della risposta che non stanno nei dati.
 *
 * Vuoto è la risposta normale. Non vuoto non significa «il modello ha mentito»:
 * significa «questa cifra non l'ha letta da nessuna parte», che è esattamente
 * ciò che va mostrato a chi legge, lasciando a lui il giudizio.
 */
export function cifreInventate(risposta: string, dati: unknown): readonly string[] {
  const disponibili = cifreDisponibili(dati);
  const fuori: string[] = [];

  for (const cifra of cifreScritte(risposta)) {
    if (cifra.letture.some((l) => disponibili.has(l))) continue;
    if (!fuori.includes(cifra.testo)) fuori.push(cifra.testo);
  }

  return fuori;
}
