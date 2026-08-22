'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icona, type NomeIcona } from '@/lib/ui/icone';

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
 * Dal 19 agosto **galleggia** (il sistema di Revolut, copiato di proposito):
 * una capsula staccata dai bordi, traslucida, con la scheda attiva dentro una
 * pastiglia. Una striscia incollata al fondo e' un pezzo di cornice; una
 * capsula che proietta un'ombra e' un oggetto, e l'occhio la trova prima.
 * Traslucida resta: il contenuto che scorre sotto si intravede. Con
 * `env(safe-area-inset-bottom)`, o sui telefoni con la barra dei gesti la
 * capsula finisce sotto il dito del sistema.
 */

/**
 * Icone vere al posto di `◧ ✓ ◍ ✳`.
 *
 * Quelli non erano icone: erano glifi tipografici, disegnati da chi ha fatto
 * il carattere, con un peso e uno stile che non c'entravano niente col resto.
 * Quattro schede su quattro, in fondo a ogni schermata — la differenza che si
 * nota di piu' senza saperla nominare (docs/aspetto.md, Fetta 1).
 */
type Scheda = { href: string; nome: string; icona: NomeIcona; anche?: readonly string[] };

const SCHEDE: readonly Scheda[] = [
  { href: '/', nome: 'Oggi', icona: 'casa' },
  { href: '/da-confermare', nome: 'Conferma', icona: 'spunta' },
  {
    href: '/dove',
    nome: 'Dove',
    icona: 'strati',
    // La discesa passa da queste schermate: la scheda resta accesa mentre si
    // scende, o sembrerebbe di essere usciti dalla sezione.
    anche: ['/movimenti', '/categoria', '/esercente', '/abbonamenti'],
  },
  { href: '/copilota', nome: 'Chiedi', icona: 'scintilla' },
];

export function Barra() {
  const percorso = usePathname();

  const attiva = (s: Scheda): boolean =>
    s.href === '/'
      ? percorso === '/'
      : percorso.startsWith(s.href) || (s.anche ?? []).some((p) => percorso.startsWith(p));

  return (
    <nav
      className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 px-4"
      aria-label="Navigazione principale"
    >
      <ul className="velato galleggiante mx-auto grid max-w-md grid-cols-4 p-1.5">
        {SCHEDE.map((s) => {
          const qui = attiva(s);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={qui ? 'page' : undefined}
                className={`barra-voce flex min-h-12 flex-col items-center justify-center gap-0.5 text-eti font-medium
                            ${qui ? 'text-accento' : 'text-testo-3'}`}
              >
                <Icona nome={s.icona} misura={21} spessore={qui ? 2 : 1.75} />
                {s.nome}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
