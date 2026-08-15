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
 * Una sola forma, anche sullo schermo grande
 * ---------------------------------------------------------------------------
 * Nessuna barra alternativa da `sm` in su. Due navigazioni sono due cose da
 * tenere allineate, e quella che si aggiorna per ultima e' sempre quella che si
 * usa meno — cioe' quella che nessuno prova. Questa applicazione si guarda dal
 * telefono: il desktop e' il posto dove la si costruisce, non dove la si usa.
 *
 * ---------------------------------------------------------------------------
 * I gruppi sono verbi, non argomenti
 * ---------------------------------------------------------------------------
 * «Guardare», «Sistemare», «Chiedere». Un elenco di undici nomi si rilegge ogni
 * volta da capo; tre gruppi si imparano una volta. E la divisione dice anche
 * qualcosa di vero sull'applicazione: le pagine che mostrano numeri e quelle
 * che li correggono sono due mestieri diversi.
 */

type Voce = { href: string; nome: string; nota?: string };

const GRUPPI: { titolo: string; voci: Voce[] }[] = [
  {
    titolo: 'Guardare',
    voci: [
      { href: '/', nome: 'Cruscotto', nota: 'il mese, per classe e categoria' },
      { href: '/movimenti', nome: 'Movimenti', nota: 'ogni singola spesa, filtrabile' },
      { href: '/abbonamenti', nome: 'Ricorrente', nota: 'abbonamenti e abitudini' },
      { href: '/report', nome: 'Report' },
      { href: '/avvisi', nome: 'Avvisi' },
    ],
  },
  {
    titolo: 'Sistemare',
    voci: [
      { href: '/da-confermare', nome: 'Da confermare', nota: 'le spese nuove' },
      { href: '/esercenti', nome: 'Esercenti', nota: 'fissi e variabili' },
      { href: '/categorie', nome: 'Categorie', nota: 'l’albero: aggiungi ed elimina' },
      { href: '/revisione', nome: 'Revisione', nota: 'le etichette senza esercente' },
    ],
  },
  {
    titolo: 'Chiedere',
    voci: [{ href: '/copilota', nome: 'Copilota' }],
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
                   text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
      >
        <span className="sr-only">{aperto ? 'Chiudi il menu' : 'Apri il menu'}</span>
        <span aria-hidden="true" className="text-xl leading-none">
          {aperto ? '✕' : '☰'}
        </span>
      </button>

      {aperto && (
        <nav
          id="menu-principale"
          className="order-last w-full border-t border-neutral-200 py-2 dark:border-neutral-800"
        >
          {GRUPPI.map((g) => (
            <div key={g.titolo} className="py-1">
              <p className="px-2 pt-2 pb-1 text-xs tracking-wide text-neutral-500 uppercase">
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
                          qui
                            ? 'bg-neutral-100 font-medium dark:bg-neutral-900'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/50'
                        }`}
                      >
                        <span className="text-sm">{v.nome}</span>
                        {v.nota !== undefined && (
                          <span className="text-xs text-neutral-500">{v.nota}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {email !== null && (
            <p className="border-t border-neutral-200 px-2 pt-3 text-xs text-neutral-500 dark:border-neutral-800">
              {email}
            </p>
          )}
        </nav>
      )}
    </>
  );
}
