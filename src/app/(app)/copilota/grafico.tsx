'use client';

import { ALTEZZA, LARGHEZZA, disegna, larghezzaBarra, spezzata } from '@/lib/copilota/grafico';
import type { Grafico } from '@/lib/copilota/messaggi';

/**
 * Un grafico, in SVG scritto a mano.
 *
 * Niente libreria: lo stack vieta le dipendenze non strettamente necessarie, e
 * per una spezzata e qualche barra una libreria di grafici porterebbe con sé
 * decine di chilobyte, un tema da riconciliare e — la parte che costa davvero —
 * il proprio scalamento degli assi. Quello sta in `lib/copilota/grafico.ts`,
 * dove si può provare con degli assert invece che guardandolo.
 *
 * L'SVG ha un `viewBox` fisso e larghezza `100%`: si adatta a qualunque schermo
 * senza misurare niente in JavaScript, e su 360 pixel resta della stessa forma
 * che ha su un monitor. È lo stesso motivo per cui le altezze dei controlli
 * stanno in un posto solo.
 *
 * **Lo zero è disegnato**, sempre. Un grafico di spese che parte dal minimo
 * osservato fa sembrare un crollo una variazione del 3%, ed è il modo più
 * comune di mentire con dei numeri veri.
 */

/**
 * I colori delle serie.
 *
 * Due bastano — «entrate e spesa» è l'unico grafico a due serie — e sono scelti
 * per restare leggibili su fondo chiaro e su fondo scuro senza due palette. Il
 * terzo esiste solo perché una serie in più non deve far sparire una linea.
 */
const COLORI = ['#0ea5e9', '#f97316', '#a855f7'] as const;

export function GraficoCopilota({ grafico }: { grafico: Grafico }) {
  const disegno = disegna(grafico);

  // Meno di due punti non è un grafico, è un numero: si legge meglio scritto,
  // e il modello lo ha comunque nei dati.
  if (disegno === null) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-neutral-500 dark:border-neutral-700">
        Non ci sono abbastanza mesi per disegnare {grafico.titolo.toLowerCase()}.
      </p>
    );
  }

  const barre = grafico.tipo === 'barre';
  const larghezza = larghezzaBarra(disegno.serie[0]?.punti.length ?? 1);

  return (
    <figure className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <figcaption className="mb-2 text-xs font-medium">{grafico.titolo}</figcaption>

      <svg
        viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`}
        className="h-auto w-full"
        role="img"
        aria-label={grafico.titolo}
      >
        {/* Le tacche, sotto tutto. */}
        {disegno.tacche.map((t, i) => (
          <g key={i}>
            <line
              x1={0}
              x2={LARGHEZZA}
              y1={t.y}
              y2={t.y}
              className="stroke-neutral-200 dark:stroke-neutral-800"
              strokeWidth={0.5}
            />
            <text
              x={2}
              y={t.y - 2}
              className="fill-neutral-400"
              style={{ fontSize: 7 }}
              textAnchor="start"
            >
              {t.testo}
            </text>
          </g>
        ))}

        {/* Lo zero, più marcato: è il riferimento rispetto a cui si legge tutto. */}
        <line
          x1={0}
          x2={LARGHEZZA}
          y1={disegno.zeroY}
          y2={disegno.zeroY}
          className="stroke-neutral-400 dark:stroke-neutral-600"
          strokeWidth={0.8}
        />

        {disegno.serie.map((serie) =>
          barre ? (
            <g key={serie.nome}>
              {serie.punti.map((p, i) => (
                <rect
                  key={i}
                  x={p.x - larghezza / 2}
                  y={Math.min(p.y, disegno.zeroY)}
                  width={larghezza}
                  height={Math.max(1, Math.abs(disegno.zeroY - p.y))}
                  fill={COLORI[serie.indice % COLORI.length]}
                  opacity={0.85}
                >
                  <title>{`${p.etichetta}: ${p.testo}`}</title>
                </rect>
              ))}
            </g>
          ) : (
            <g key={serie.nome}>
              <polyline
                points={spezzata(serie.punti)}
                fill="none"
                stroke={COLORI[serie.indice % COLORI.length]}
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {serie.punti.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={1.8}
                  fill={COLORI[serie.indice % COLORI.length]}
                >
                  <title>{`${p.etichetta}: ${p.testo}`}</title>
                </circle>
              ))}
            </g>
          ),
        )}

        {/* Tre etichette e non una per mese: dodici, su un telefono, diventano
            una riga grigia illeggibile. */}
        {disegno.etichetteX.map((e, i) => (
          <text
            key={i}
            x={e.x}
            y={ALTEZZA - 6}
            className="fill-neutral-400"
            style={{ fontSize: 7 }}
            textAnchor={i === 0 ? 'start' : i === disegno.etichetteX.length - 1 ? 'end' : 'middle'}
          >
            {e.testo}
          </text>
        ))}
      </svg>

      {disegno.serie.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
          {disegno.serie.map((s) => (
            <li key={s.nome} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: COLORI[s.indice % COLORI.length] }}
              />
              {s.nome}
            </li>
          ))}
        </ul>
      )}

      {/* Cosa il grafico non dice. Un importo illeggibile o un mese assente
          cambiano la forma della figura, e una figura che tace un buco è
          peggio di una che lo dichiara. */}
      {(grafico.nota !== undefined || disegno.nonLetti > 0) && (
        <p className="mt-2 text-xs text-neutral-500">
          {grafico.nota}
          {disegno.nonLetti > 0 &&
            ` ${disegno.nonLetti} ${disegno.nonLetti === 1 ? 'importo non è' : 'importi non sono'} leggibile e non compare.`}
        </p>
      )}
    </figure>
  );
}
