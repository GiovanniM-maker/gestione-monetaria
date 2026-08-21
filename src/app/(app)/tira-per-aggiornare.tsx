'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SOGLIA,
  faScattare,
  rispostaDi,
  rispostaPerErrore,
  scesa,
  type EsitoAggiornamento,
} from '@/lib/ui/tirata';

/**
 * Tirare giu' dall'alto per chiedere alla banca se e' arrivato qualcosa.
 *
 * ---------------------------------------------------------------------------
 * Perche' esiste, se i movimenti arrivano gia' da soli
 * ---------------------------------------------------------------------------
 * `Sincronizza` scarica all'apertura, a ogni ritorno in primo piano, e poi ogni
 * cinque minuti. Tecnicamente questo gesto non porta **nessun dato** che non
 * sarebbe arrivato lo stesso.
 *
 * Porta un'altra cosa, ed e' la ragione per cui vale la pena scriverlo: **la
 * risposta a «e adesso?»**. Uno fa un pagamento, apre l'app e vuole vederlo. Se
 * non c'e', l'unica cosa che puo' fare oggi e' chiudere e riaprire — cioe'
 * indovinare che quello faccia ripartire qualcosa. Il gesto trasforma
 * quell'attesa cieca in una domanda con una risposta.
 *
 * ---------------------------------------------------------------------------
 * Cosa scavalca e cosa no
 * ---------------------------------------------------------------------------
 * Scavalca **il riposo del browser** (i quattro minuti e mezzo di
 * `Sincronizza`), perche' un gesto deliberato non e' un battito di pendolo: chi
 * tira lo sta chiedendo adesso.
 *
 * **Non scavalca il freno del server**, che sono quattro minuti fra due
 * chiamate alla banca. Quella protezione sta dalla parte giusta — «la
 * protezione di una risorsa non puo' stare dalla parte che chiede» — e un gesto
 * non e' un buon motivo per bussare all'ASPSP ogni due secondi.
 *
 * ---------------------------------------------------------------------------
 * Qui il silenzio sarebbe un difetto, e in `Sincronizza` no
 * ---------------------------------------------------------------------------
 * `Sincronizza` tace quando non trova niente, ed e' giusto: e' un automatismo,
 * e una barra «sto aggiornando» a ogni apertura e' la prima cosa che si smette
 * di leggere.
 *
 * Un gesto invece **pretende una risposta**. Tirare e non veder succedere
 * niente si legge come «e' rotto», non come «non c'era niente». Quindi qui si
 * risponde sempre, e le risposte sono quattro cose diverse che non vanno
 * confuse: sono arrivati dei movimenti, non c'era niente, la banca non e' stata
 * chiamata perche' l'abbiamo appena fatto, oppure e' andata male.
 */

type Stato =
  | { fase: 'fermo' }
  | { fase: 'tira'; distanza: number }
  | { fase: 'lavora' }
  | { fase: 'detto'; testo: string };

export function TiraPerAggiornare() {
  const router = useRouter();
  const [stato, setStato] = useState<Stato>({ fase: 'fermo' });
  const inCorso = useRef(false);

  const aggiorna = useCallback(async () => {
    if (inCorso.current) return;
    inCorso.current = true;
    setStato({ fase: 'lavora' });

    try {
      const risposta = await fetch('/api/admin/aggiorna', { method: 'POST' });
      const esito = (await risposta.json()) as EsitoAggiornamento;

      // Quale delle quattro risposte dare lo decide `lib/ui/tirata`, che e'
      // puro e provato: e' la parte che sbaglia in silenzio, perche' una
      // risposta plausibile e falsa si legge come una conferma.
      const detta = risposta.ok ? rispostaDi(esito) : rispostaPerErrore(risposta.status);

      setStato({ fase: 'detto', testo: detta.testo });
      // La pagina e' stata costruita prima che i movimenti arrivassero: senza
      // questo si vedrebbe il numero vecchio sotto un messaggio che dice il
      // contrario.
      if (detta.ricarica) router.refresh();
    } catch {
      setStato({ fase: 'detto', testo: rispostaPerErrore(null).testo });
    } finally {
      inCorso.current = false;
    }
  }, [router]);

  useEffect(() => {
    // Lo stato del gesto sta in variabili locali e non in `useState`: cambia a
    // ogni frame del dito, e passare da React su ogni `touchmove` vorrebbe dire
    // un rendering per ogni pixel. Nello stato React finisce solo la distanza
    // gia' smorzata, che e' cio' che si disegna.
    let partenzaY = 0;
    let tirando = false;
    let distanza = 0;

    const puoPartire = (): boolean => {
      // Solo dalla cima. `scrollY > 0` significa che il gesto e' uno scorrimento.
      if (window.scrollY > 0) return false;
      // Con un foglio o un cassetto aperto, no: `Dialogo` fissa il corpo, quindi
      // `scrollY` e' 0 e il gesto sembrerebbe legittimo mentre l'utente sta
      // scorrendo l'elenco dentro il pannello.
      if (document.querySelector('dialog[open]') !== null) return false;
      return !inCorso.current;
    };

    const inizio = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !puoPartire()) return;
      partenzaY = e.touches[0]?.clientY ?? 0;
      tirando = true;
      distanza = 0;
    };

    const muove = (e: TouchEvent) => {
      if (!tirando) return;
      const y = e.touches[0]?.clientY ?? 0;
      const grezza = y - partenzaY;

      // Verso l'alto non e' questo gesto: si lascia scorrere la pagina.
      if (grezza <= 0) {
        if (distanza > 0) setStato({ fase: 'fermo' });
        tirando = false;
        distanza = 0;
        return;
      }

      // `preventDefault` solo **dopo** aver stabilito che e' una tirata verso
      // il basso dalla cima. Chiamarlo prima romperebbe lo scorrimento normale,
      // ed e' il motivo per cui questo ascoltatore e' registrato non passivo:
      // senza, il browser lo ignorerebbe.
      e.preventDefault();
      distanza = scesa(grezza);
      setStato({ fase: 'tira', distanza });
    };

    const fine = () => {
      if (!tirando) return;
      tirando = false;
      if (faScattare(distanza)) void aggiorna();
      else setStato({ fase: 'fermo' });
      distanza = 0;
    };

    document.addEventListener('touchstart', inizio, { passive: true });
    document.addEventListener('touchmove', muove, { passive: false });
    document.addEventListener('touchend', fine, { passive: true });
    document.addEventListener('touchcancel', fine, { passive: true });
    return () => {
      document.removeEventListener('touchstart', inizio);
      document.removeEventListener('touchmove', muove);
      document.removeEventListener('touchend', fine);
      document.removeEventListener('touchcancel', fine);
    };
  }, [aggiorna]);

  // La risposta si toglie da sola: e' una notizia, non uno stato.
  useEffect(() => {
    if (stato.fase !== 'detto') return;
    const orologio = window.setTimeout(() => setStato({ fase: 'fermo' }), 3500);
    return () => window.clearTimeout(orologio);
  }, [stato]);

  if (stato.fase === 'fermo') return null;

  // Quanto e' sceso l'indicatore adesso. Mentre si tira segue il dito; mentre
  // lavora resta fermo sulla soglia; mentre parla sta appena sopra, cosi' il
  // passaggio fra le due fasi non e' uno scatto.
  const giu =
    stato.fase === 'tira' ? stato.distanza : stato.fase === 'lavora' ? SOGLIA : SOGLIA * 0.9;
  const pronto = stato.fase === 'tira' && faScattare(stato.distanza);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center
                 top-[env(safe-area-inset-top)]"
      style={{
        transform: `translateY(${giu - 40}px)`,
        // Mentre il dito e' giu' non c'e' transizione, o l'indicatore
        // arriverebbe in ritardo sul dito e il gesto sembrerebbe scollegato.
        // Quando il dito si stacca, invece, il ritorno va accompagnato.
        transition: stato.fase === 'tira' ? 'none' : 'transform 220ms ease-out',
      }}
    >
      <div
        className="velato scheda flex items-center gap-2 rounded-full px-3.5 py-2
                   text-[13px] shadow-[var(--ombra)]"
      >
        {stato.fase === 'detto' ? (
          <span>{stato.testo}</span>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="size-3.5 rounded-full border-2 border-current border-t-transparent"
              style={{
                color: pronto || stato.fase === 'lavora' ? 'var(--accento)' : 'var(--testo-3)',
                animation: stato.fase === 'lavora' ? 'gira 700ms linear infinite' : undefined,
                // Mentre si tira, il cerchio ruota col dito invece di girare da
                // solo: il gesto e' ancora dell'utente, e un'animazione partita
                // per conto suo direbbe che il lavoro e' gia' cominciato.
                transform: stato.fase === 'tira' ? `rotate(${giu * 3}deg)` : undefined,
              }}
            />
            <span>
              {stato.fase === 'lavora'
                ? 'Chiedo alla banca…'
                : pronto
                  ? 'Lascia per aggiornare'
                  : 'Tira per aggiornare'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
