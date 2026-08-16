import Link from 'next/link';
import { etichettaMese } from '@/lib/cruscotto/mesi';

/**
 * La riga del mese: dove sei, e come ti sposti.
 *
 * Sta in un posto solo perche' la usano due schede — **Oggi** e **Dove** — e
 * due copie di una navigazione divergono alla prima modifica. Ognuna passa il
 * proprio `indirizzo`, cosi' cambiando mese si resta sulla scheda in cui si e'
 * invece di essere rimbalzati sull'altra.
 *
 * La pastiglia «in corso» prende il posto della freccia avanti quando il mese
 * e' quello che stiamo vivendo: una freccia verso un mese che non esiste
 * ancora e' un bersaglio che non fa niente, e un bersaglio che non fa niente
 * si preme lo stesso.
 */
export function SceltaMese({
  mese,
  precedente,
  successivo,
  inCorso,
  indirizzo,
}: {
  mese: string;
  precedente: string | null;
  successivo: string | null;
  inCorso: boolean;
  indirizzo: (mese: string) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[22px] font-bold tracking-[-0.03em] capitalize">{etichettaMese(mese)}</p>
      <nav className="flex items-center gap-1">
        {precedente !== null && (
          <Link
            className="inline-flex size-11 items-center justify-center rounded-full text-testo-2"
            href={indirizzo(precedente)}
            aria-label={`vai a ${etichettaMese(precedente)}`}
          >
            ‹
          </Link>
        )}
        {inCorso ? (
          <span className="rounded-full bg-s2 px-3 py-1 text-[11px] font-medium text-testo-2">
            in corso
          </span>
        ) : (
          successivo !== null && (
            <Link
              className="inline-flex size-11 items-center justify-center rounded-full text-testo-2"
              href={indirizzo(successivo)}
              aria-label={`vai a ${etichettaMese(successivo)}`}
            >
              ›
            </Link>
          )
        )}
      </nav>
    </div>
  );
}
