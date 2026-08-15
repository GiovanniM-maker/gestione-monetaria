'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Il menu.
 *
 * Prima le pagine stavano tutte su una barra che scorreva di lato. Con otto
 * voci su 360 pixel se ne vedevano tre: le altre esistevano solo per chi
 * sapeva che c'erano e si ricordava di trascinare. Una navigazione che si deve
 * scoprire non e' una navigazione.
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
      { href: '/esercenti', nome: 'Esercenti', nota: 'fissi e variabili' },
      { href: '/categorie', nome: 'Categorie', nota: 'l\u2019albero: aggiungi ed elimina' },
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

export function Menu({ email }: { email: string | null }) {
  const percorso = usePathname();

  /**
   * Lo stato non e' «aperto», e' **da quale pagina** e' stato aperto.
   *
   * Cosi' il menu si chiude da solo quando si naviga — se il percorso non e'
   * piu' quello, non e' piu' aperto — senza un effetto che chiami `setState`
   * dopo il disegno. Un effetto del genere fa comparire il pannello sulla
   * pagina nuova per un istante prima di sparire, ed e' anche cio' che la
   * regola `react-hooks/set-state-in-effect` esiste per impedire.
   */
  const [apertoDa, setApertoDa] = useState<string | null>(null);
  const aperto = apertoDa === percorso;
  const setAperto = (v: boolean) => setApertoDa(v ? percorso : null);

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(!aperto)}
        aria-expanded={aperto}
        aria-controls="menu-principale"
        className="inline-flex size-11 items-center justify-center rounded-md
                   text-testo-2 hover:bg-s3"
      >
        <span className="sr-only">{aperto ? 'Chiudi il menu' : 'Apri il menu'}</span>
        <span aria-hidden="true" className="text-xl leading-none">
          {aperto ? '✕' : '☰'}
        </span>
      </button>

      {aperto && (
        <nav id="menu-principale" className="order-last w-full border-t border-filo py-2">
          {GRUPPI.map((g) => (
            <div key={g.titolo} className="py-1">
              <p className="px-2 pt-2 pb-1 text-xs tracking-wide text-testo-2 uppercase">
                {g.titolo}
              </p>
              <ul>
                {g.voci.map((v) => {
                  const qui = v.href === '/' ? percorso === '/' : percorso.startsWith(v.href);
                  return (
                    <li key={v.href}>
                      <Link
                        href={v.href}
                        aria-current={qui ? 'page' : undefined}
                        className={`flex min-h-11 flex-col justify-center rounded-md px-2 py-1 ${
                          qui ? 'bg-s3 font-medium' : 'hover:bg-s3'
                        }`}
                      >
                        <span className="text-sm">{v.nome}</span>
                        {v.nota !== undefined && (
                          <span className="text-xs text-testo-2">{v.nota}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {email !== null && (
            <p className="border-t border-filo px-2 pt-3 text-xs text-testo-2">{email}</p>
          )}
        </nav>
      )}
    </>
  );
}
