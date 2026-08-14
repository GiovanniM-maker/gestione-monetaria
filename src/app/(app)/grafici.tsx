import Link from 'next/link';
import { archi, conResto, fette, larghezza, type Voce } from '@/lib/ui/fette';
import { segnoDi, type Variazione } from '@/lib/cruscotto/andamento';
import { formattaEuro } from '@/lib/abbonamenti/formato';

/**
 * Le figure del cruscotto: la freccia, la barra segmentata, la ciambella.
 *
 * Sono componenti server e non client: non c'e' un solo byte di JavaScript da
 * mandare al browser per disegnare una figura i cui valori sono gia' noti al
 * momento della richiesta.
 *
 * **Nessuna libreria**, per la stessa ragione del markdown del report e dei
 * grafici del copilota: per una barra e un anello porterebbe decine di
 * chilobyte e il proprio scalamento degli assi, che e' esattamente il pezzo che
 * si vuole poter provare con degli assert. La geometria sta in `lib/ui/fette`,
 * ed e' provata li'.
 */

/* -------------------------------------------------------------------------- */
/* I colori                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Le quattro classi hanno sempre lo stesso colore, ovunque.
 *
 * E' cio' che rende la barra leggibile senza leggere la legenda: dopo qualche
 * mese il rosa a destra e' «voluttuario» e basta guardarne la larghezza.
 */
export const COLORE_CLASSE: Record<string, string> = {
  essenziale: '#0ea5e9',
  utile: '#f59e0b',
  voluttuario: '#f43f5e',
  investimento: '#10b981',
};
const COLORE_IGNOTO = '#a3a3a3';

/** L'ordine delle classi sulla barra, fisso. Vedi `fette()`. */
export const ORDINE_CLASSI = ['essenziale', 'utile', 'voluttuario', 'investimento'];

/**
 * La tavolozza della ciambella.
 *
 * Sette colori distinguibili, e non uno di piu': oltre, due fette adiacenti
 * finirebbero per somigliarsi e la figura smetterebbe di dire in quale scendere.
 * Le categorie oltre la settima si sommano in una fetta grigia — la ciambella
 * serve a scegliere dove scendere, non a essere un inventario. L'inventario
 * completo e' l'albero, subito sotto.
 */
const TAVOLOZZA = ['#0ea5e9', '#f43f5e', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6'];

/* -------------------------------------------------------------------------- */
/* La freccia                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Il segno accanto a un numero.
 *
 * Il tono segue la **spesa**, non il gradimento: piu' e' ambra, meno e' verde,
 * uguale e' grigio. Non dice se hai fatto bene — un investimento che cresce e'
 * ambra come un voluttuario che cresce, e va benissimo cosi': il giudizio e' di
 * chi guarda.
 */
export function Freccia({ riga }: { riga: Variazione | undefined }) {
  if (riga === undefined) return null;
  const s = segnoDi(riga);
  if (s === null) return null;

  const colore =
    s.tono === 'su'
      ? 'text-amber-600 dark:text-amber-500'
      : s.tono === 'giu'
        ? 'text-emerald-600 dark:text-emerald-500'
        : 'text-neutral-400 dark:text-neutral-500';

  return (
    <span className={`ml-2 text-xs whitespace-nowrap tabular-nums ${colore}`} title={s.descrizione}>
      <span aria-hidden="true">{s.simbolo}</span> {s.testo}
      {/* Il puntino dice «questo confronto poggia su pochi mesi». Non toglie il
          numero, che e' vero: toglie l'enfasi, che sarebbe eccessiva. */}
      {s.parziale && <span aria-hidden="true">*</span>}
      <span className="sr-only"> {s.descrizione}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* La barra segmentata                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Come si divide il mese fra le quattro classi, in una barra sola.
 *
 * Una barra per classe — com'era prima — risponde a «quanto vale questa
 * classe»; questa risponde a «come si divide il mese», che e' la domanda della
 * metrica dell'app. Ha sempre le stesse quattro voci nello stesso ordine,
 * quindi la sua forma si impara e un mese anomalo si riconosce senza leggere un
 * numero.
 *
 * Le classi sono quattro anche quando i contesti sono otto: `personale` e
 * `business` restano distinti nell'elenco sotto, dove c'e' spazio per dirlo.
 */
export function BarraClassi({ voci }: { voci: readonly Voce[] }) {
  const pezzi = fette(voci);
  if (pezzi.every((p) => p.lunghezza === 0)) return null;

  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900"
      role="img"
      aria-label={pezzi
        .filter((p) => p.lunghezza > 0)
        .map((p) => `${p.chiave} ${formattaEuro(p.valore)}`)
        .join(', ')}
    >
      {pezzi
        .filter((p) => p.lunghezza > 0)
        .map((p) => (
          <span
            key={p.chiave}
            className="h-full"
            style={{
              width: larghezza(p),
              backgroundColor: COLORE_CLASSE[p.chiave] ?? COLORE_IGNOTO,
            }}
          />
        ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* La ciambella                                                                */
/* -------------------------------------------------------------------------- */

const RAGGIO = 44;
const SPESSORE = 16;
const LATO = 120;

export type FettaCategoria = Voce & {
  etichetta: string;
  /** Dove porta il tocco. `null` per la fetta che raccoglie il resto. */
  href: string | null;
  variazione?: Variazione;
};

/** La chiave della fetta che raccoglie tutto ciò che non entra nella tavolozza. */
const RESTO = '__resto__';

/**
 * In cosa e' finito il mese.
 *
 * **La figura non e' il bersaglio.** Su un telefono una fetta e' larga venti
 * pixel e si sbaglia col pollice; l'elenco sotto ha righe alte quarantaquattro,
 * ed e' quello che si tocca. L'anello e' `aria-hidden` di conseguenza: chi usa
 * un lettore di schermo non perde niente, perche' tutto quello che dice sta
 * nell'elenco in forma di testo.
 */
export function Ciambella({ voci, totale }: { voci: readonly FettaCategoria[]; totale: bigint }) {
  const pezzi = fette(voci);
  const anello = archi(pezzi, RAGGIO);
  if (pezzi.every((p) => p.lunghezza === 0)) return null;

  const colore = (i: number, chiave: string): string =>
    chiave === RESTO ? COLORE_IGNOTO : (TAVOLOZZA[i] ?? COLORE_IGNOTO);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
      <div className="relative shrink-0">
        <svg viewBox={`0 0 ${LATO} ${LATO}`} className="size-40" aria-hidden="true">
          {/* Ruotato di un quarto di giro: senza, la prima fetta comincerebbe
              alle tre invece che alle dodici, e la figura si leggerebbe da un
              punto di partenza che nessuno si aspetta. */}
          <g transform={`rotate(-90 ${LATO / 2} ${LATO / 2})`}>
            {anello.map((a, i) => (
              <circle
                key={a.chiave}
                cx={LATO / 2}
                cy={LATO / 2}
                r={RAGGIO}
                fill="none"
                strokeWidth={SPESSORE}
                stroke={colore(i, a.chiave)}
                strokeDasharray={`${a.tratto} ${a.vuoto}`}
                strokeDashoffset={a.scostamento}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-semibold tabular-nums">{formattaEuro(totale)}</span>
          <span className="text-[10px] text-neutral-500">in categoria</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 text-sm">
        {pezzi.map((p, i) => {
          const voce = voci[i];
          if (voce === undefined) return null;
          const contenuto = (
            <>
              <span
                className="mt-1.5 size-2.5 shrink-0 self-start rounded-full"
                style={{ backgroundColor: colore(i, p.chiave) }}
              />
              <span className="min-w-0 flex-1 truncate">{voce.etichetta}</span>
              <span className="shrink-0 tabular-nums whitespace-nowrap">
                {formattaEuro(p.valore)}
                <Freccia riga={voce.variazione} />
              </span>
            </>
          );
          return (
            <li key={p.chiave} className="border-b border-neutral-100 dark:border-neutral-900">
              {voce.href === null ? (
                <span className="flex min-h-11 items-center gap-2">{contenuto}</span>
              ) : (
                <Link href={voce.href} className="flex min-h-11 items-center gap-2">
                  {contenuto}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Le prime della tavolozza, piu' una fetta grigia per tutto il resto. */
export function fetteDellaCiambella(voci: readonly FettaCategoria[]): readonly FettaCategoria[] {
  const { teste, resto } = conResto(voci, TAVOLOZZA.length);
  if (resto === null) return teste;
  return [
    ...teste,
    {
      chiave: RESTO,
      etichetta: `altre ${resto.voci} categorie`,
      valore: resto.valore,
      href: null,
    },
  ];
}
