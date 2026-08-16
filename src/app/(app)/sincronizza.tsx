'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Aprire l'app scarica i movimenti nuovi.
 *
 * ---------------------------------------------------------------------------
 * Perche' non basta lo scheduler
 * ---------------------------------------------------------------------------
 * Il 16 agosto 2026 i dati erano fermi da tre giorni: `sync_runs` non aveva
 * **nessuna** riga alle 05:00, mai, da quando il cron esiste. Non si era
 * fermato, non era proprio mai partito — e la causa sta in un pannello di
 * Vercel, cioe' fuori da questo repository e invisibile da dentro l'app.
 *
 * Uno scheduler che non si vede e' un pezzo di infrastruttura di cui ci si
 * accorge solo dal danno. Questo componente toglie la dipendenza: **quando
 * apri l'app, i movimenti arrivano**. Se poi il cron funziona, tanto meglio —
 * ma non e' piu' l'unica strada perche' un dato entri nel database.
 *
 * E' anche la mezza decisione gia' scritta in `docs/direzione.md`: «quattro
 * sincronizzazioni al giorno **piu' una a ogni apertura**». Le quattro sono il
 * tetto della PSD2 sugli accessi senza nessuno davanti; questa non ci rientra,
 * perche' il cliente e' presente per definizione — sta guardando lo schermo.
 *
 * ---------------------------------------------------------------------------
 * Quando parte, e quando invece no
 * ---------------------------------------------------------------------------
 * Al montaggio e ogni volta che l'app **torna in primo piano**, che sul
 * telefono e' il gesto con cui la si usa. Non a ogni navigazione: il componente
 * sta nel layout, quindi passare da «Oggi» a «Dove» non lo rimonta.
 *
 * La difesa vera pero' non e' qui: e' nel server, che rifiuta di richiamare la
 * banca se l'ha gia' fatto da meno di dieci minuti. Un contatore nel browser lo
 * si azzera ricaricando, e la protezione di una risorsa non puo' stare dalla
 * parte che chiede.
 *
 * ---------------------------------------------------------------------------
 * Si vede solo se ha portato qualcosa
 * ---------------------------------------------------------------------------
 * Una barra «sto aggiornando» a ogni apertura sarebbe la prima cosa che si vede
 * ogni volta, e dopo tre giorni non la si legge piu': la stessa fine degli
 * avvisi che ci sono sempre. Quindi mentre lavora non dice niente, e parla solo
 * quando ha davvero trovato dei movimenti — che e' l'unico momento in cui
 * l'informazione serve, perche' spiega perche' la schermata e' appena cambiata.
 */

/** Per chi lascia l'app aperta tutto il giorno senza mai chiuderla. */
const INTERVALLO = 30 * 60 * 1000;

/**
 * Freno del browser, deliberatamente piu' corto di quello del server.
 *
 * Serve solo a non sprecare una chiamata che il server rifiuterebbe comunque;
 * il tetto vero e' di la'.
 */
const RIPOSO = 5 * 60 * 1000;

type Esito = { righeNuove?: unknown };

export function Sincronizza() {
  const router = useRouter();
  const [nuovi, setNuovi] = useState(0);
  const ultimo = useRef(0);
  const inCorso = useRef(false);

  const aggiorna = useCallback(async () => {
    if (inCorso.current) return;
    if (Date.now() - ultimo.current < RIPOSO) return;
    inCorso.current = true;
    ultimo.current = Date.now();
    try {
      const risposta = await fetch('/api/admin/quotidiano', { method: 'POST' });
      if (!risposta.ok) return;
      const esito = (await risposta.json()) as Esito;
      const righe = typeof esito.righeNuove === 'number' ? esito.righeNuove : 0;
      if (righe > 0) {
        setNuovi(righe);
        // La pagina e' stata costruita prima che i movimenti arrivassero: senza
        // questo si vedrebbe il numero vecchio e un avviso che dice che ce n'e'
        // uno nuovo.
        router.refresh();
      }
    } catch {
      // Rete assente, sessione scaduta, funzione andata in timeout: si tace.
      // Questo componente non e' il posto dove si scopre che qualcosa non va —
      // per quello c'e' la riga di stato sul cruscotto, che guarda **da quanto**
      // i dati sono fermi invece che com'e' andata l'ultima chiamata.
    } finally {
      inCorso.current = false;
    }
  }, [router]);

  useEffect(() => {
    // Il primo giro passa da un timer e non parte dritto dal corpo
    // dell'effetto, per due ragioni che coincidono. La prima e' che una
    // schermata appena aperta sta ancora costruendo i propri numeri, e una
    // richiesta che dura un minuto lanciata nello stesso istante se li contende
    // sulla rete del telefono. La seconda e' che chiamare qui dentro qualcosa
    // che finisce in `setState` e' esattamente cio' che `set-state-in-effect`
    // vieta — e ha ragione: gli effetti servono a legarsi a un sistema esterno,
    // e il segnale «l'app e' aperta» arriva dal timer e dagli eventi, non dal
    // fatto che React abbia montato un componente.
    //
    // Il montaggio serve comunque, ed e' il caso principale: `visibilitychange`
    // **non scatta** su una pagina che nasce gia' visibile, cioe' proprio
    // quando apri l'app da fredda.
    const primo = window.setTimeout(() => void aggiorna(), 1500);
    const quandoTorna = () => {
      if (document.visibilityState === 'visible') void aggiorna();
    };
    document.addEventListener('visibilitychange', quandoTorna);
    const orologio = window.setInterval(() => void aggiorna(), INTERVALLO);
    return () => {
      window.clearTimeout(primo);
      document.removeEventListener('visibilitychange', quandoTorna);
      window.clearInterval(orologio);
    };
  }, [aggiorna]);

  useEffect(() => {
    if (nuovi === 0) return;
    // Si toglie da solo: e' una notizia, non uno stato.
    const orologio = window.setTimeout(() => setNuovi(0), 8000);
    return () => window.clearTimeout(orologio);
  }, [nuovi]);

  if (nuovi === 0) return null;

  return (
    <div
      className="velato fixed inset-x-0 z-40 border-t border-filo
                 bottom-[calc(4.25rem+env(safe-area-inset-bottom))]"
      role="status"
    >
      <div className="mx-auto max-w-md px-4 py-2 text-[13px]">
        <strong>{nuovi}</strong> {nuovi === 1 ? 'movimento nuovo' : 'movimenti nuovi'} appena
        arrivati dalla banca.
      </div>
    </div>
  );
}
