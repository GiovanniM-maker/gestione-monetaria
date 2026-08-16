'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * La barra in basso: quattro schede, dove arriva il pollice.
 *
 * ---------------------------------------------------------------------------
 * Perche' in basso e non in un menu in alto
 * ---------------------------------------------------------------------------
 * Il menu a tre lineette stava in alto a sinistra, che su un telefono da sei
 * pollici e' il punto **piu' lontano** dal pollice destro — e costava un tocco
 * solo per vedere dove si puo' andare. Una barra in basso costa zero tocchi per
 * essere scoperta, e il gesto piu' frequente dell'applicazione (confermare una
 * spesa, cinque volte al giorno) diventa raggiungibile senza cambiare presa.
 *
 * ---------------------------------------------------------------------------
 * Quattro, e sono domande
 * ---------------------------------------------------------------------------
 * Non sono nomi di tabelle — `movimenti`, `esercenti`, `categorie` lo erano — ma
 * le quattro cose che si vogliono dall'app: come sto andando, cos'e' questa
 * spesa, dove finiscono i soldi, mi spieghi una cosa. Tre o quattro destinazioni
 * si tengono a mente; undici no.
 *
 * Il resto (revisione, categorie, esercenti, report, diagnostica) e'
 * **manutenzione, non uso**, e resta nel menu dell'intestazione. Le due
 * navigazioni non si sovrappongono di proposito: quella in basso e' dove si va,
 * quella in alto e' dove si sistema.
 *
 * ---------------------------------------------------------------------------
 * Il materiale
 * ---------------------------------------------------------------------------
 * Traslucida, non opaca: il contenuto che scorre sotto si intravede e la barra
 * sembra appoggiata sopra la schermata invece che incollata al fondo. Con
 * `env(safe-area-inset-bottom)`, o sui telefoni con la barra dei gesti l'ultima
 * scheda finisce sotto il dito del sistema.
 */

type Scheda = { href: string; nome: string; icona: string; anche?: readonly string[] };

const SCHEDE: readonly Scheda[] = [
  { href: '/', nome: 'Oggi', icona: '◧' },
  { href: '/da-confermare', nome: 'Conferma', icona: '✓' },
  {
    href: '/dove',
    nome: 'Dove',
    icona: '◍',
    // La discesa passa da queste schermate: la scheda resta accesa mentre si
    // scende, o sembrerebbe di essere usciti dalla sezione.
    anche: ['/movimenti', '/categoria', '/esercente', '/abbonamenti'],
  },
  { href: '/copilota', nome: 'Chiedi', icona: '✳' },
];

export function Barra() {
  const percorso = usePathname();

  const attiva = (s: Scheda): boolean =>
    s.href === '/'
      ? percorso === '/'
      : percorso.startsWith(s.href) || (s.anche ?? []).some((p) => percorso.startsWith(p));

  return (
    <nav
      className="velato fixed inset-x-0 bottom-0 z-40 border-t border-(--filo)
                 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      aria-label="Navigazione principale"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {SCHEDE.map((s) => {
          const qui = attiva(s);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={qui ? 'page' : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 pt-2 text-[10px] font-medium
                            ${qui ? 'text-testo' : 'text-testo-3'}`}
              >
                <span aria-hidden="true" className="text-[17px] leading-none">
                  {s.icona}
                </span>
                {s.nome}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
