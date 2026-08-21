import Link from 'next/link';

/**
 * Il controllo segmentato: due o tre scelte, una attiva.
 *
 * Esisteva in due copie scritte in due modi — i modi di `/dove` erano
 * collegamenti pieni d'accento, l'ordinamento di `/da-confermare` bottoni a
 * pastiglia — e due copie dello stesso controllo divergono alla prima
 * modifica (docs/aspetto.md, Fetta 3). Ora la forma sta qui e in
 * `globals.css`, in un posto solo.
 *
 * ---------------------------------------------------------------------------
 * La voce attiva e' sollevata, non riempita d'accento
 * ---------------------------------------------------------------------------
 * L'accento e' la voce dell'applicazione — «tocca qui» — e un controllo che
 * dice «sei gia' qui» non deve gridare con lo stesso colore. La voce attiva
 * e' una pastiglia in rilievo sul solco: si vede al primo sguardo e non
 * compete col bottone principale della schermata.
 *
 * ---------------------------------------------------------------------------
 * Collegamento o bottone lo decide la voce
 * ---------------------------------------------------------------------------
 * Un modo di `/dove` e' un indirizzo (si manda, si torna indietro);
 * l'ordinamento della sera e' uno stato del pannello. Sono la stessa forma con
 * due nature, e la natura la porta la voce: `href` la rende un Link,
 * `onScegli` un bottone. E' un componente server finche' nessuno passa una
 * funzione — e chi la passa e' gia' un componente client.
 */
export type VoceSegmentato = {
  chiave: string;
  testo: string;
  attiva: boolean;
  href?: string;
  onScegli?: () => void;
};

export function Segmentato({
  etichetta,
  voci,
}: {
  /** Cosa sceglie questo controllo: finisce in `aria-label`. */
  etichetta: string;
  voci: readonly VoceSegmentato[];
}) {
  return (
    <div className="segm" role="group" aria-label={etichetta}>
      {voci.map((v) =>
        v.href !== undefined ? (
          <Link
            key={v.chiave}
            href={v.href}
            className="segm-voce"
            aria-current={v.attiva ? 'true' : undefined}
          >
            {v.testo}
          </Link>
        ) : (
          <button
            key={v.chiave}
            type="button"
            onClick={v.onScegli}
            className="segm-voce"
            aria-pressed={v.attiva}
          >
            {v.testo}
          </button>
        ),
      )}
    </div>
  );
}
