'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from './sign-out-button';
import { Dialogo } from './foglio';
import { BottoneAggiorna } from './aggiornamento';
import { SceltaTema } from './tema';

/**
 * Il menu, come cassetto che entra da destra.
 *
 * ---------------------------------------------------------------------------
 * A destra, perche' la mano e' li'
 * ---------------------------------------------------------------------------
 * Stava in alto a sinistra, che su un telefono da sei pollici tenuto con la
 * destra e' l'angolo piu' lontano dal pollice — si raggiunge cambiando presa,
 * e cambiare presa e' il gesto che fa cadere i telefoni. A destra e' un
 * movimento solo.
 *
 * ---------------------------------------------------------------------------
 * Un cassetto, non un pannello che spinge
 * ---------------------------------------------------------------------------
 * Prima il menu si apriva **dentro l'intestazione**, allargandola: la pagina
 * scendeva di trecento pixel e il contenuto che si stava guardando spariva. Un
 * cassetto passa **sopra**, largo l'80% dello schermo e non tutto: la striscia
 * di pagina che resta visibile a sinistra dice da sola «questo si chiude», e
 * si chiude toccandola.
 *
 * E' un `<dialog>` come il foglio dal basso — stessa ragione: fuoco dentro,
 * Esc che chiude, resto della pagina inerte, nessuna gara di `z-index` con la
 * barra. Quello che cambia e' da dove entra.
 *
 * ---------------------------------------------------------------------------
 * Qui c'e' solo cio' che NON sta nella barra in basso
 * ---------------------------------------------------------------------------
 * Le quattro destinazioni che si usano ogni giorno stanno in basso, dove arriva
 * il pollice. Qui resta la **manutenzione**: sistemare la tassonomia, leggere un
 * report, guardare la sincronizzazione. Nessuna voce compare in tutte e due, ed
 * e' esattamente il motivo per cui le due navigazioni non possono divergere.
 */

type Voce = { href: string; nome: string; nota?: string };

const GRUPPI: { titolo: string; voci: Voce[] }[] = [
  {
    titolo: 'Sistemare',
    voci: [
      { href: '/categorie', nome: 'Categorie', nota: 'crea, rinomina, elimina' },
      { href: '/classi', nome: 'Classi', nota: 'essenziale, utile, voluttuario…' },
      { href: '/esercenti', nome: 'Esercenti', nota: 'fissi e variabili' },
      { href: '/obiettivi', nome: 'Obiettivi', nota: 'cosa vuoi ottenere' },
      { href: '/revisione', nome: 'Revisione', nota: 'le etichette senza esercente' },
    ],
  },
  {
    titolo: 'Leggere',
    voci: [
      { href: '/abbonamenti', nome: 'Ricorrente', nota: 'abbonamenti e abitudini' },
      { href: '/avvisi', nome: 'Avvisi' },
      { href: '/report', nome: 'Report' },
    ],
  },
  {
    titolo: 'Manutenzione',
    voci: [
      { href: '/debug/sync', nome: 'Sincronizzazione' },
      { href: '/debug/eb', nome: 'Connessione banca' },
    ],
  },
];

export function Menu({ email, versione }: { email: string | null; versione: string }) {
  const percorso = usePathname();

  /**
   * Lo stato non e' «aperto», e' **da quale pagina** e' stato aperto.
   *
   * Cosi' il cassetto si chiude da solo quando si naviga — se il percorso non
   * e' piu' quello, non e' piu' aperto — senza un effetto che chiami
   * `setState` dopo il disegno. Un effetto del genere fa comparire il pannello
   * sulla pagina nuova per un istante prima di sparire, ed e' anche cio' che la
   * regola `react-hooks/set-state-in-effect` esiste per impedire.
   */
  const [apertoDa, setApertoDa] = useState<string | null>(null);
  const aperto = apertoDa === percorso;

  return (
    <>
      <button
        type="button"
        onClick={() => setApertoDa(percorso)}
        aria-expanded={aperto}
        aria-controls="menu-principale"
        // Il bottone tondo di testata (Fetta 3): una superficie sollevata, non
        // un glifo nudo che fluttua nell'angolo.
        className="tondo -mr-1"
      >
        <span className="sr-only">Apri il menu</span>
        <span aria-hidden="true" className="text-sez leading-none text-testo-2">
          ☰
        </span>
      </button>

      <Cassetto aperto={aperto} onChiudi={() => setApertoDa(null)}>
        <nav id="menu-principale" className="space-y-5">
          {GRUPPI.map((g) => (
            <div key={g.titolo}>
              <p className="px-1 pb-1 text-eti font-medium tracking-wide text-testo-2 uppercase">
                {g.titolo}
              </p>
              <ul className="scheda elenco px-3">
                {g.voci.map((v) => {
                  const qui = v.href === '/' ? percorso === '/' : percorso.startsWith(v.href);
                  return (
                    <li key={v.href}>
                      <Link
                        href={v.href}
                        aria-current={qui ? 'page' : undefined}
                        className="flex min-h-12 flex-col justify-center py-1.5"
                      >
                        <span className={`text-corpo ${qui ? 'font-semibold' : ''}`}>{v.nome}</span>
                        {v.nota !== undefined && (
                          <span className="text-min text-testo-2">{v.nota}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <SceltaTema />

          {/* Aggiungendo l'app alla schermata iniziale la pagina puo' restare
              quella di tre deploy fa: questo e' il modo di forzarla, e sta nel
              menu perche' e' manutenzione come tutto il resto qui dentro. */}
          <div className="scheda px-3">
            <BottoneAggiorna versione={versione} />
          </div>

          {/* Uscire e' l'azione piu' rara dell'applicazione, e stava nell'angolo
              piu' visibile della schermata. Qui accanto all'indirizzo, che e'
              anche il solo posto dove serve sapere con chi si e' entrati. */}
          <div className="flex items-center justify-between gap-3 border-t border-filo pt-4">
            <span className="min-w-0 truncate text-min text-testo-2">{email ?? ''}</span>
            <SignOutButton />
          </div>
        </nav>
      </Cassetto>
    </>
  );
}

/**
 * Il cassetto.
 *
 * Foglio e cassetto condividono tutto cio' che e' difficile — il `<dialog>`, il
 * fondo che chiude solo se il gesto comincia e finisce fuori, il blocco dello
 * scorrimento dietro, il trascinamento per mandarli via — e differiscono per
 * una cosa sola: da che parte entrano. Quella cosa e' un parametro di
 * `Dialogo`; il resto sarebbe stato scritto due volte, e le due copie
 * sarebbero divergute alla prima correzione.
 */
function Cassetto({
  aperto,
  onChiudi,
  children,
}: {
  aperto: boolean;
  onChiudi: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialogo
      aperto={aperto}
      etichetta="Menu"
      verso="destra"
      onChiudi={onChiudi}
      /* Si spinge via a destra dalla riga in cima. Il gesto e' lo stesso del
         foglio, ruotato: e' `Dialogo` a saperlo fare, e i due pannelli gli
         dicono solo da che parte se ne vanno. */
      testata={
        <div className="mb-4 flex items-center justify-between px-4">
          <span className="text-sec font-medium text-testo-2">Gestione monetaria</span>
          <button
            type="button"
            onClick={onChiudi}
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-testo-2"
          >
            <span className="sr-only">Chiudi il menu</span>
            <span aria-hidden="true" className="text-sez leading-none">
              ✕
            </span>
          </button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
    </Dialogo>
  );
}
