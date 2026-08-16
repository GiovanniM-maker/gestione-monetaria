'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Finche' l'app e' aperta, i movimenti arrivano da soli ogni cinque minuti.
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
 * accorge solo dal danno. Questo componente toglie la dipendenza: **mentre
 * guardi l'app, i movimenti arrivano**. Se poi il cron funziona, tanto meglio —
 * ma non e' piu' l'unica strada perche' un dato entri nel database.
 *
 * ---------------------------------------------------------------------------
 * Cinque minuti si puo', e non e' in contrasto col tetto delle quattro
 * ---------------------------------------------------------------------------
 * Il tetto della PSD2 — quattro letture del conto in ventiquattr'ore — vale per
 * gli accessi **senza nessuno davanti**. Qui l'app e' in primo piano e c'e' una
 * sessione valida: il cliente e' presente, e quegli accessi non sono
 * contingentati. E' la stessa distinzione su cui poggia `Origine`.
 *
 * Il pendolo batte **solo a pagina visibile**, e non e' un'ottimizzazione: e'
 * cio' che tiene onesta quella distinzione. Un timer che continuasse con l'app
 * in secondo piano starebbe dichiarando presente un cliente che non c'e'.
 *
 * E chiama il giro **veloce**, non la sequenza intera: scarica, normalizza,
 * applica gli alias. Chiedere al modello di classificare, cercare sul web e
 * ricalcolare tutte le ricorrenze dodici volte all'ora vorrebbe dire pagare
 * dodici volte all'ora per sentirsi rispondere «niente di nuovo».
 *
 * ---------------------------------------------------------------------------
 * Quando parte, e quando invece no
 * ---------------------------------------------------------------------------
 * Al montaggio, ogni volta che l'app **torna in primo piano**, e ogni cinque
 * minuti finche' resta davanti. Non a ogni navigazione: il componente sta nel
 * layout, quindi passare da «Oggi» a «Dove» non lo rimonta.
 *
 * La difesa vera pero' non e' qui: e' nel server, che rifiuta di richiamare la
 * banca se l'ha gia' fatto da meno di quattro minuti. Un contatore nel browser
 * lo si azzera ricaricando, e due schede aperte ne avrebbero due — la
 * protezione di una risorsa non puo' stare dalla parte che chiede.
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

/**
 * Ogni cinque minuti, finche' l'app e' davanti.
 *
 * Non e' un numero scelto per prudenza: e' il piu' fitto che abbia senso. Il
 * giro veloce costa una chiamata alla banca e qualche secondo, e il tetto della
 * PSD2 — quattro letture al giorno — vale per gli accessi **senza nessuno
 * davanti**. Qui l'app e' in primo piano, quindi il cliente e' presente e
 * quegli accessi non sono contingentati.
 */
const INTERVALLO = 5 * 60 * 1000;

/**
 * Freno del browser, un filo piu' corto di quello del server.
 *
 * Serve solo a non sprecare una chiamata che il server rifiuterebbe comunque;
 * il freno vero e' di la', ed e' di quattro minuti. Se qui ci fosse lo stesso
 * numero, un pendolo da cinque minuti lo mancherebbe di un soffio una volta su
 * due e l'aggiornamento arriverebbe ogni dieci.
 */
const RIPOSO = 4.5 * 60 * 1000;

type Esito = { righeNuove?: unknown };

export function Sincronizza() {
  const router = useRouter();
  const [nuovi, setNuovi] = useState(0);
  const ultimo = useRef(0);
  const inCorso = useRef(false);

  const aggiorna = useCallback(async () => {
    if (inCorso.current) return;
    // Con la pagina nascosta non si chiede niente: l'app in secondo piano su un
    // telefono e' l'app che non stai usando, e un pendolo che batte lo stesso
    // trasformerebbe «il cliente e' presente» in una finzione.
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - ultimo.current < RIPOSO) return;
    inCorso.current = true;
    ultimo.current = Date.now();
    try {
      const risposta = await fetch('/api/admin/aggiorna', { method: 'POST' });
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
