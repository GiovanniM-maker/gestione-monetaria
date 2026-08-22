/**
 * Chiaro, scuro, o quello che dice il telefono.
 *
 * ---------------------------------------------------------------------------
 * Perche' l'attributo lo scrive sempre uno script, e non il `@media`
 * ---------------------------------------------------------------------------
 * Le tinte scure stavano dentro `@media (prefers-color-scheme: dark)`. Per
 * aggiungere una scelta manuale la strada ovvia sarebbe **duplicare** quel
 * blocco sotto `:root[data-tema='scuro']` — sessanta righe di tinte scritte due
 * volte, che divergono alla prima modifica. E' lo stesso motivo per cui le
 * altezze dei controlli stanno in un file solo.
 *
 * Quindi le tinte scure vivono in **una** copia, sotto `:root[data-tema]`, e a
 * decidere quale valga e' uno script che gira **prima del primo pixel**. La
 * preferenza di sistema non sparisce: e' il valore predefinito, e la si legge
 * qui invece che nel foglio di stile.
 *
 * Il prezzo e' che senza JavaScript la pagina resta chiara. E' un prezzo gia'
 * pagato ovunque: senza JavaScript questa applicazione non naviga, non
 * sincronizza e non apre un foglio.
 */

export type Tema = 'chiaro' | 'scuro' | 'sistema';

/** La chiave in `localStorage`. Sta qui perche' la usano lo script e il componente. */
export const CHIAVE_TEMA = 'tema';

/** Il valore predefinito: quello che dice il telefono. */
export const TEMA_PREDEFINITO: Tema = 'sistema';

/**
 * Cosa c'era scritto in `localStorage`, se e' una delle tre cose che ammettiamo.
 *
 * Fallisce verso `sistema` e non verso `chiaro`: davanti a un valore che non
 * capisce, seguire il telefono e' sempre meno sbagliato che imporre una tinta.
 */
export function leggiTema(grezzo: unknown): Tema {
  return grezzo === 'chiaro' || grezzo === 'scuro' ? grezzo : TEMA_PREDEFINITO;
}

/** Quale delle due tinte vale davvero, data la scelta e cio' che dice il sistema. */
export function risolvi(tema: Tema, sistemaScuro: boolean): 'chiaro' | 'scuro' {
  if (tema === 'sistema') return sistemaScuro ? 'scuro' : 'chiaro';
  return tema;
}

/**
 * Il colore della barra di stato, per `<meta name="theme-color">`.
 *
 * Non e' un dettaglio da desktop: aggiunta alla schermata iniziale l'app si
 * apre a schermo pieno, e quel colore e' la striscia sopra l'orologio. Se
 * restasse bianco con l'app scura si vedrebbe una fascia chiara in cima che
 * non appartiene a niente.
 *
 * Sono gli stessi due valori di `--s0` in `globals.css`. Due copie di un colore
 * sono una in piu' del dovuto, ma il `<meta>` vuole un valore letterale e non
 * legge le variabili CSS: l'alternativa sarebbe leggerlo dal DOM a ogni cambio,
 * cioe' far dipendere una tinta dal momento in cui la si chiede.
 */
export const COLORE_BARRA: Record<'chiaro' | 'scuro', string> = {
  chiaro: '#f2f2f7',
  scuro: '#000000',
};

/** Come si chiamano le tre scelte, nell'ordine in cui si mostrano. */
export const SCELTE_TEMA: readonly { valore: Tema; nome: string }[] = [
  { valore: 'chiaro', nome: 'Chiaro' },
  { valore: 'scuro', nome: 'Scuro' },
  { valore: 'sistema', nome: 'Sistema' },
];

/**
 * Lo script che gira prima del primo pixel, come stringa.
 *
 * Sta qui e non incollato dentro il layout perche' e' **la stessa decisione**
 * di `leggiTema` e `risolvi`, scritta una seconda volta in una forma che deve
 * poter girare senza React. Tenerlo accanto alle due funzioni e' l'unico modo
 * di accorgersi, leggendo, se una delle due cambia e l'altra no.
 *
 * Minuscolo di proposito: e' sincrono e blocca il disegno. Un `try` intorno a
 * `localStorage`, perche' in una finestra privata l'accesso puo' lanciare — e
 * un tema che esplode non deve poter impedire alla pagina di comparire.
 *
 * Scrive **anche** `<meta name="theme-color">`, e non lo lascia al componente:
 * il componente vive dentro `(app)`, quindi sulla pagina di accesso non c'e'
 * nessuno a correggerla, e anche dentro l'app arriverebbe dopo l'idratazione —
 * cioe' una striscia chiara in cima a un'app scura per la durata di un
 * caricamento. Se il `<meta>` non c'e' ancora, se lo crea: l'ordine in cui Next
 * mette in `<head>` i propri tag e questo script non e' garantito, e dipenderne
 * sarebbe un difetto che si vede solo a volte.
 */
export const SCRIPT_TEMA = `(function(){var s=null;try{s=localStorage.getItem(${JSON.stringify(
  CHIAVE_TEMA,
)})}catch(e){}var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s==='scuro'||s==='chiaro'?s:(m?'scuro':'chiaro');document.documentElement.dataset.tema=t;var e=document.querySelector('meta[name="theme-color"]');if(!e){e=document.createElement('meta');e.setAttribute('name','theme-color');document.head.appendChild(e)}e.setAttribute('content',${JSON.stringify(
  COLORE_BARRA,
)}[t])})()`;
