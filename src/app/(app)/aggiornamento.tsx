'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * «C'e' una versione nuova».
 *
 * ---------------------------------------------------------------------------
 * Il problema che risolve
 * ---------------------------------------------------------------------------
 * Aggiunta alla schermata iniziale, l'applicazione e' una finestra che resta
 * aperta per giorni: la si apre e chiude col gesto, non si ricarica quasi mai,
 * e quella che hai davanti puo' essere la pagina di tre deploy fa senza che
 * nulla lo dica. Non e' un'ipotesi: e' successo con un pulsante che esisteva in
 * produzione e sul telefono non c'era.
 *
 * Un browser normale lo risolve da solo perche' ricarichi di continuo. Un'app
 * sulla schermata iniziale no, ed e' proprio il modo in cui questa si usa.
 *
 * ---------------------------------------------------------------------------
 * Si accorge da solo, e non chiede attenzione
 * ---------------------------------------------------------------------------
 * Il controllo parte **quando l'app torna in primo piano**, che e' il momento
 * in cui ha senso: se la riapri dopo un giorno e nel frattempo e' uscito un
 * deploy, lo scopri subito. Piu' un giro ogni quarto d'ora per chi la lascia
 * aperta.
 *
 * Se non c'e' niente di nuovo **non si vede niente**. La barra compare solo
 * quando la versione del server e' diversa da quella con cui questa pagina e'
 * stata costruita — cioe' solo quando premerla serve davvero. Un avviso che c'e'
 * sempre non e' un avviso, ed e' la stessa regola per cui gli avvisi della
 * Fase 8 sono soltanto due tipi.
 *
 * ---------------------------------------------------------------------------
 * Cosa fa il pulsante, per davvero
 * ---------------------------------------------------------------------------
 * Non basta `location.reload()`: su una finestra aggiunta alla schermata
 * iniziale il browser puo' riservire quel che ha in pancia. Quindi, in ordine:
 * si tolgono gli eventuali service worker (oggi non ce ne sono, ma se un
 * giorno ce ne fosse uno sarebbe **lui** a servire la pagina vecchia), si
 * svuota la Cache Storage, e solo allora si ricarica.
 *
 * Le due API possono non esistere — Safari in navigazione privata, browser
 * vecchi — quindi sono avvolte: un errore qui deve comunque finire nella
 * ricarica, che e' la cosa che l'utente ha chiesto.
 */

/** Ogni quanto si ricontrolla, per chi tiene l'app aperta. */
const INTERVALLO = 15 * 60 * 1000;

export async function ricarica(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrati = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrati.map((r) => r.unregister()));
    }
  } catch {
    /* niente: la ricarica sotto vale comunque */
  }
  try {
    if ('caches' in window) {
      const nomi = await caches.keys();
      await Promise.all(nomi.map((n) => caches.delete(n)));
    }
  } catch {
    /* idem */
  }
  window.location.reload();
}

export function Aggiornamento({ versione }: { versione: string }) {
  const [disponibile, setDisponibile] = useState(false);

  const controlla = useCallback(async () => {
    // In sviluppo non c'e' un deploy a cui riferirsi, e il confronto direbbe
    // sempre «aggiornato». Meglio non chiedere affatto.
    if (versione === 'sviluppo') return;
    try {
      const risposta = await fetch('/api/versione', { cache: 'no-store' });
      if (!risposta.ok) return;
      const dati = (await risposta.json()) as { versione?: unknown };
      if (typeof dati.versione === 'string' && dati.versione !== versione) setDisponibile(true);
    } catch {
      // Rete assente o sessione scaduta: si tace. Un avviso di aggiornamento
      // che compare perche' non c'e' campo sarebbe peggio del silenzio.
    }
  }, [versione]);

  useEffect(() => {
    // **Non si controlla al montaggio**, e non e' per aggirare una regola del
    // linter: una pagina appena caricata e' l'ultima versione per definizione,
    // l'ha appena chiesta al server. Il caso che conta e' l'opposto — la
    // finestra rimasta aperta — e li' arrivano `visibilitychange` e l'orologio.
    const quandoTorna = () => {
      if (document.visibilityState === 'visible') void controlla();
    };
    document.addEventListener('visibilitychange', quandoTorna);
    const orologio = window.setInterval(() => void controlla(), INTERVALLO);
    return () => {
      document.removeEventListener('visibilitychange', quandoTorna);
      window.clearInterval(orologio);
    };
  }, [controlla]);

  /**
   * Mentre la barra c'e', la pagina deve poter scorrere piu' in giu'.
   *
   * Fissata sopra le schede, la barra copre l'ultima riga di ogni schermata:
   * si arriva in fondo e l'ultima carta e' meta' nascosta. Invece di toccare
   * il `padding` del corpo — che il blocco dello scorrimento delle modali usa
   * gia' — si accende una variabile che il `<main>` somma al proprio spazio in
   * fondo, e si spegne quando la barra se ne va.
   */
  useEffect(() => {
    if (!disponibile) return;
    const radice = document.documentElement;
    radice.style.setProperty('--barra-aggiornamento', '3.5rem');
    return () => {
      radice.style.removeProperty('--barra-aggiornamento');
    };
  }, [disponibile]);

  if (!disponibile) return null;

  return (
    // Sopra la barra delle schede, non sotto: li' finirebbe coperta. E non in
    // cima, dove ruberebbe il posto al numero.
    <div
      className="velato fixed inset-x-0 z-50 border-t border-filo
                 bottom-[calc(5rem+env(safe-area-inset-bottom))]"
      role="status"
    >
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-2">
        <span className="min-w-0 flex-1 text-sec">
          <span className="block font-medium">C&rsquo;&egrave; una versione nuova</span>
          <span className="block text-min text-testo-3">questa &egrave; la {versione}</span>
        </span>
        <button
          type="button"
          onClick={() => void ricarica()}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full
                     bg-accento px-4 text-sec font-semibold text-accento-testo"
        >
          Aggiorna
        </button>
      </div>
    </div>
  );
}

/**
 * Il pulsante che c'e' **sempre**, nel menu.
 *
 * L'avviso automatico copre il caso normale, ma non tutti: una versione a meta'
 * — la pagina vecchia e i dati nuovi — o semplicemente il dubbio «sara'
 * aggiornata?» non producono nessun avviso, e restare senza un modo di forzare
 * l'aggiornamento significa disinstallare e rimettere l'app.
 *
 * Accanto c'e' la versione, che e' meta' della risposta: sapere **cosa** stai
 * guardando vale quanto poterlo cambiare, ed e' anche cio' che rende possibile
 * dire «ce l'ho, non funziona» con un'informazione dentro.
 */
export function BottoneAggiorna({ versione }: { versione: string }) {
  return (
    <button
      type="button"
      onClick={() => void ricarica()}
      className="flex min-h-12 w-full items-center gap-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-corpo">Aggiorna l&rsquo;app</span>
        <span className="block text-min text-testo-3">
          scarica l&rsquo;ultima versione · ora la {versione}
        </span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-corpo text-testo-3">
        ⟳
      </span>
    </button>
  );
}
