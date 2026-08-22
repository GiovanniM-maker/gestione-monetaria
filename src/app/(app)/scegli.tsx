'use client';

import { useState } from 'react';
import { Foglio } from './foglio';
import { Icona } from '@/lib/ui/icone';

/**
 * Una scelta fra tante, dentro un modulo che resta un modulo.
 *
 * ---------------------------------------------------------------------------
 * Perche' non un `<select>`
 * ---------------------------------------------------------------------------
 * Su un telefono la tendina nativa e' una colonna di righe alte venti pixel coi
 * nomi troncati, e per arrivare in fondo si scorre alla cieca. Il selettore di
 * categoria l'aveva gia' sostituita con un foglio, per ragioni scritte e
 * giuste — e poi ne erano rimasti **ventisette** altrove, compresi i cinque
 * filtri di `/movimenti`, che sono la schermata dove si filtra davvero.
 *
 * ---------------------------------------------------------------------------
 * Il campo nascosto e' il punto
 * ---------------------------------------------------------------------------
 * I filtri sono un `form method="get"`, e la ragione per cui lo sono va
 * difesa: **la pagina resta un componente server**. Se questo componente
 * navigasse da solo, quella pagina diventerebbe client.
 *
 * Quindi non naviga: tiene il valore scelto in un `<input type="hidden">` con
 * lo stesso `name` che aveva il `<select>`, e il modulo si invia esattamente
 * come prima. L'isola client e' questo controllo, non la schermata.
 *
 * ---------------------------------------------------------------------------
 * La ricerca compare quando serve
 * ---------------------------------------------------------------------------
 * Sopra le otto voci scrivere tre lettere e' sempre piu' veloce che scorrere;
 * sotto, la casella e' un controllo in piu' da guardare per niente.
 */

export type Voce = { valore: string; testo: string };

/** Oltre questo numero di voci compare la ricerca. */
const CON_RICERCA_DA = 8;

export function Scegli({
  nome,
  etichetta,
  valore,
  voci,
}: {
  /** Lo stesso `name` che aveva il `<select>`: il modulo non se ne accorge. */
  nome: string;
  etichetta: string;
  valore: string;
  voci: readonly Voce[];
}) {
  const [scelto, setScelto] = useState(valore);
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState('');

  const attuale = voci.find((v) => v.valore === scelto);
  const ago = cerca.trim().toLowerCase();
  const viste = ago === '' ? voci : voci.filter((v) => v.testo.toLowerCase().includes(ago));

  return (
    <div className="block">
      <span className="text-min text-testo-2">{etichetta}</span>
      <input type="hidden" name={nome} value={scelto} />
      <button
        type="button"
        onClick={() => setAperto(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 w-full items-center gap-2 rounded-full bg-s3 px-4 text-left text-corpo sm:min-h-10"
      >
        <span className="min-w-0 flex-1 truncate">{attuale?.testo ?? '—'}</span>
        <Icona nome="chevron" misura={15} className="shrink-0 rotate-90 text-testo-3" />
      </button>

      <Foglio aperto={aperto} titolo={etichetta} onChiudi={() => setAperto(false)}>
        {voci.length >= CON_RICERCA_DA && (
          <input
            type="search"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder={`cerca fra ${voci.length} voci`}
            className="mb-2 min-h-11 w-full rounded-full bg-s3 px-4 text-corpo placeholder:text-testo-3"
          />
        )}
        <ul className="elenco">
          {viste.map((v) => (
            <li key={v.valore}>
              <button
                type="button"
                onClick={() => {
                  setScelto(v.valore);
                  setCerca('');
                  setAperto(false);
                }}
                className="flex min-h-12 w-full items-center gap-2 py-1.5 text-left text-sec"
              >
                <span className="min-w-0 flex-1">{v.testo}</span>
                {v.valore === scelto && (
                  <Icona nome="spunta" misura={16} className="shrink-0 text-accento" />
                )}
              </button>
            </li>
          ))}
          {viste.length === 0 && (
            <li className="py-3 text-center text-sec text-testo-2">
              Niente contiene &laquo;{cerca.trim()}&raquo;.
            </li>
          )}
        </ul>
      </Foglio>
    </div>
  );
}
