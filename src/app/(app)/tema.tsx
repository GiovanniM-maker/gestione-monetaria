'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  CHIAVE_TEMA,
  COLORE_BARRA,
  leggiTema,
  risolvi,
  SCELTE_TEMA,
  TEMA_PREDEFINITO,
  type Tema,
} from '@/lib/ui/tema';

/**
 * La scelta del tema, e chi la tiene viva.
 *
 * ---------------------------------------------------------------------------
 * Tre scelte e non un interruttore
 * ---------------------------------------------------------------------------
 * Un interruttore chiaro/scuro ha due valori e ne servono tre: la terza e'
 * «fai come dice il telefono», che e' anche il valore di partenza. Senza,
 * chi ha il telefono impostato per passare allo scuro al tramonto perde quel
 * comportamento nel momento stesso in cui tocca l'interruttore una volta — e
 * non ha piu' modo di riaverlo.
 *
 * ---------------------------------------------------------------------------
 * Perche' sta nel menu
 * ---------------------------------------------------------------------------
 * Le quattro schede in basso sono le domande che si fanno all'applicazione;
 * il menu in alto e' manutenzione e preferenze. Il tema e' una preferenza: si
 * tocca una volta e poi mai piu'.
 */

/** Scrive l'attributo e il colore della barra di stato. */
function applica(tema: Tema, sistemaScuro: boolean): void {
  const effettivo = risolvi(tema, sistemaScuro);
  document.documentElement.dataset['tema'] = effettivo;

  // Aggiunta alla schermata iniziale, l'app si apre a schermo pieno e questo e'
  // il colore della striscia sopra l'orologio. Lasciarlo indietro vorrebbe dire
  // una fascia chiara in cima a un'app scura.
  let meta = document.querySelector('meta[name="theme-color"]');
  if (meta === null) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', COLORE_BARRA[effettivo]);
}

function sistemaEScuro(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * La scelta e' **stato del browser**, non stato di React: vive in
 * `localStorage`, sopravvive alla pagina, e la puo' cambiare anche un'altra
 * scheda. `useSyncExternalStore` e' il modo previsto di leggerla senza
 * inventarsi un `useState` che il server non puo' conoscere — e senza il
 * lampeggio di un valore finto sostituito subito dopo il montaggio.
 */
const ascoltatori = new Set<() => void>();

function sottoscrivi(avvisa: () => void): () => void {
  ascoltatori.add(avvisa);
  // L'evento `storage` arriva solo dalle **altre** schede: quella che scrive
  // non lo riceve. Per la propria si avvisa a mano, in `scegli`.
  window.addEventListener('storage', avvisa);
  return () => {
    ascoltatori.delete(avvisa);
    window.removeEventListener('storage', avvisa);
  };
}

function istantanea(): Tema {
  try {
    return leggiTema(window.localStorage.getItem(CHIAVE_TEMA));
  } catch {
    // Finestra privata, o memoria del sito bloccata: si segue il telefono, che
    // e' anche cio' che lo script iniziale ha gia' applicato.
    return 'sistema';
  }
}

/**
 * Sul server non c'e' `localStorage`, quindi non c'e' scelta da conoscere.
 * `sistema` e' l'unica risposta onesta, ed e' anche il valore predefinito:
 * l'HTML servito non dichiara nessuna preferenza che poi debba essere smentita.
 */
function istantaneaServer(): Tema {
  return TEMA_PREDEFINITO;
}

export function SceltaTema() {
  const tema = useSyncExternalStore(sottoscrivi, istantanea, istantaneaServer);

  // Con «sistema» il tema deve seguire il telefono **mentre l'app e' aperta**,
  // non solo alla prossima ricarica: su un telefono che passa allo scuro al
  // tramonto, l'app resterebbe chiara per tutta la sera.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const segui = () => applica(tema, media.matches);
    segui();
    if (tema !== 'sistema') return;
    media.addEventListener('change', segui);
    return () => media.removeEventListener('change', segui);
  }, [tema]);

  const scegli = useCallback((nuovo: Tema) => {
    applica(nuovo, sistemaEScuro());
    try {
      window.localStorage.setItem(CHIAVE_TEMA, nuovo);
    } catch {
      // La scelta vale per questa sessione e non sopravvive alla chiusura.
      // Meglio che rifiutarla: l'utente ha appena visto il tema cambiare.
    }
    for (const avvisa of ascoltatori) avvisa();
  }, []);

  return (
    <div>
      <p className="px-1 pb-1 text-eti font-medium tracking-wide text-testo-2 uppercase">Aspetto</p>
      {/* Una barra segmentata e non tre bottoni: la scelta e' una fra tre, e
          tre capsule separate direbbero «puoi premerne piu' d'una». */}
      <div role="group" aria-label="Tema" className="flex gap-1 rounded-full bg-s3 p-1">
        {SCELTE_TEMA.map((s) => {
          const attiva = tema === s.valore;
          return (
            <button
              key={s.valore}
              type="button"
              onClick={() => scegli(s.valore)}
              aria-pressed={attiva}
              className={
                'min-h-11 flex-1 rounded-full text-sec font-medium transition-colors ' +
                (attiva ? 'bg-accento text-accento-testo' : 'text-testo-2')
              }
            >
              {s.nome}
            </button>
          );
        })}
      </div>
    </div>
  );
}
