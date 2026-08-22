'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { Spiegazione } from './errori';

/**
 * Come si mostra un errore, in un posto solo.
 *
 * Prima ogni schermata lo faceva a modo suo — undici pixel qui, quattordici la',
 * a volte sotto il controllo e a volte in fondo alla pagina — e in tutti i casi
 * il testo era quello del server. Qui la forma e' una, e l'azione sta **dentro**
 * la nota: chi legge «la sessione e' scaduta» ha il modo di rientrare senza
 * doverlo cercare.
 */
export function NotaErrore({
  errore,
  onRiprova,
  compatta = false,
}: {
  errore: Spiegazione | null;
  /** Se c'e', la nota mostra «Riprova» quando ha senso riprovare. */
  onRiprova?: () => void;
  /** Dentro una riga di elenco lo spazio e' poco: solo il titolo e l'azione. */
  compatta?: boolean;
}) {
  const percorso = usePathname();
  const parametri = useSearchParams();

  if (errore === null) return null;

  // Si torna esattamente dov'eravamo: dopo l'accesso, la schermata su cui si e'
  // premuto e non il cruscotto. E' la differenza fra «rientra» e «ricomincia».
  const query = parametri.toString();
  const ritorno = `${percorso}${query === '' ? '' : `?${query}`}`;

  return (
    <div className="nota nota-errore space-y-2" role="alert">
      <p className="text-[14px] font-semibold">{errore.titolo}</p>
      {!compatta && <p className="text-[13px] text-testo-2">{errore.spiegazione}</p>}

      {(errore.rientra || (errore.riprova && onRiprova !== undefined)) && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {errore.rientra && (
            <Link
              href={`/login?ritorno=${encodeURIComponent(ritorno)}`}
              className="inline-flex min-h-11 items-center rounded-full bg-s3 px-4 text-[13px] font-medium sm:min-h-9"
            >
              Rientra
            </Link>
          )}
          {errore.riprova && onRiprova !== undefined && (
            <button
              type="button"
              onClick={onRiprova}
              className="inline-flex min-h-11 items-center rounded-full bg-s3 px-4 text-[13px] font-medium sm:min-h-9"
            >
              Riprova
            </button>
          )}
        </div>
      )}

      {errore.dettaglio !== null && !compatta && (
        <details>
          <summary className="min-h-11 cursor-pointer text-[12px] text-testo-2 sm:min-h-0">
            dettagli tecnici
          </summary>
          <p className="mt-1 font-mono text-[11px] break-words text-testo-2">{errore.dettaglio}</p>
        </details>
      )}
    </div>
  );
}
