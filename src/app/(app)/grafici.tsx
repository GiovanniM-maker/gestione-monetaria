import Link from 'next/link';
import { archi, conResto, fette, larghezza, type Voce } from '@/lib/ui/fette';
import { segnoDi, type Variazione } from '@/lib/cruscotto/andamento';
import { formattaEuro } from '@/lib/abbonamenti/formato';
import { Icona } from '@/lib/ui/icone';

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
 * Le sette tinte fra cui una classe puo' scegliere.
 *
 * Dalla chiave salvata in `discretion_classes.colore` al token CSS. E' l'unico
 * punto in cui le due cose si incontrano: il database conosce `rosa` e non
 * `#ff375f`, cosi' la tinta vera resta in `globals.css` con le sue due varianti
 * chiaro e scuro, e cambiarla e' una riga in un posto solo.
 */
export const TAVOLOZZA_CLASSI: Record<string, string> = {
  blu: 'var(--classe-blu)',
  ambra: 'var(--classe-ambra)',
  rosa: 'var(--classe-rosa)',
  verde: 'var(--classe-verde)',
  viola: 'var(--classe-viola)',
  ciano: 'var(--classe-ciano)',
  bruno: 'var(--classe-bruno)',
};
const COLORE_IGNOTO = 'var(--neutro)';

/**
 * Dallo slug della classe al suo colore.
 *
 * Era un oggetto costante con quattro voci. Non puo' piu' esserlo: le classi
 * si creano e cambiano colore, quindi la mappa si costruisce da cio' che c'e'
 * nel database — e chi disegna la riceve, invece di conoscerla.
 *
 * Quello che **non** e' cambiato e' che il colore di una classe sia lo stesso
 * ovunque: e' cio' che rende la barra leggibile senza leggere la legenda, dopo
 * qualche mese si guarda la larghezza del rosa e basta.
 */
export type Tinte = Record<string, string>;

export function tinteDelleClassi(classi: readonly { slug: string; colore: string }[]): Tinte {
  const m: Tinte = {};
  for (const c of classi) m[c.slug] = TAVOLOZZA_CLASSI[c.colore] ?? COLORE_IGNOTO;
  return m;
}

/**
 * L'ordine delle classi sulla barra.
 *
 * Dichiarato in `sort_order`, non alfabetico: e' cio' che rende la forma della
 * barra riconoscibile a colpo d'occhio, e un mese anomalo visibile senza
 * leggere un numero. Vedi `fette()`, che rispetta l'ordine ricevuto.
 */
export function ordineDelleClassi(classi: readonly { slug: string }[]): readonly string[] {
  return classi.map((c) => c.slug);
}

/**
 * La tavolozza della ciambella.
 *
 * Sette colori distinguibili, e non uno di piu': oltre, due fette adiacenti
 * finirebbero per somigliarsi e la figura smetterebbe di dire in quale scendere.
 * Le categorie oltre la settima si sommano in una fetta grigia — la ciambella
 * serve a scegliere dove scendere, non a essere un inventario. L'inventario
 * completo e' l'albero, subito sotto.
 *
 * E' la stessa tavolozza delle classi, nell'ordine in cui sette tinte si
 * distinguono meglio l'una dall'altra: due tavolozze diverse nella stessa
 * schermata insegnerebbero che il colore non vuol dire niente.
 */
const TAVOLOZZA = [
  TAVOLOZZA_CLASSI['blu'],
  TAVOLOZZA_CLASSI['rosa'],
  TAVOLOZZA_CLASSI['ambra'],
  TAVOLOZZA_CLASSI['verde'],
  TAVOLOZZA_CLASSI['viola'],
  TAVOLOZZA_CLASSI['ciano'],
  TAVOLOZZA_CLASSI['bruno'],
] as string[];

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
export function Freccia({
  riga,
  sotto = false,
}: {
  riga: Variazione | undefined;
  /**
   * Sotto l'importo invece che accanto. Negli elenchi la colonna destra e' su
   * due piani — importo sopra, delta sotto — cosi' il nome si allinea
   * all'importo e la riga piccola (contesto, movimenti) alla percentuale.
   */
  sotto?: boolean;
}) {
  if (riga === undefined) return null;
  const s = segnoDi(riga);
  if (s === null) return null;

  const colore =
    s.tono === 'su' ? 'text-attenzione' : s.tono === 'giu' ? 'text-conferma' : 'text-testo-3';

  return (
    <span
      className={`cifra whitespace-nowrap ${sotto ? 'block text-[12px]' : 'ml-2 text-xs'} ${colore}`}
      title={s.descrizione}
    >
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
 * Come si divide il mese fra le classi, in una barra sola.
 *
 * Una barra per classe — com'era prima — risponde a «quanto vale questa
 * classe»; questa risponde a «come si divide il mese», che e' la domanda della
 * metrica dell'app. Ha sempre le stesse voci nello stesso ordine — quello
 * dichiarato in `sort_order` — quindi la sua forma si impara e un mese anomalo
 * si riconosce senza leggere un numero.
 *
 * Le voci restano quelle anche quando i contesti le raddoppiano: `personale` e
 * `business` restano distinti nell'elenco sotto, dove c'e' spazio per dirlo.
 */
export function BarraClassi({
  voci,
  tinte,
  nomi,
}: {
  voci: readonly Voce[];
  tinte: Tinte;
  /**
   * Da slug a nome mostrato, per la legenda. Senza, la barra resta muta come
   * prima: la legenda e' un'aggiunta della Fetta 3, non un obbligo di chi
   * disegna una barra in un angolo stretto.
   */
  nomi?: Readonly<Record<string, string>>;
}) {
  const pezzi = fette(voci);
  if (pezzi.every((p) => p.lunghezza === 0)) return null;
  const visibili = pezzi.filter((p) => p.lunghezza > 0);
  const totale = visibili.reduce((s, p) => s + (p.valore < 0n ? -p.valore : p.valore), 0n);

  return (
    <div>
      <div
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={visibili.map((p) => `${p.chiave} ${formattaEuro(p.valore)}`).join(', ')}
      >
        {visibili.map((p) => (
          <span
            key={p.chiave}
            className="h-full rounded-full"
            style={{
              width: larghezza(p),
              background: tinte[p.chiave] ?? COLORE_IGNOTO,
            }}
          />
        ))}
      </div>

      {/* La legenda sotto la barra (Fetta 3): pallino, nome, quota. Gli
          importi NON ci sono — stanno nell'elenco subito sotto, e ripeterli
          qui a corpo undici sarebbe la copia che diverge. La percentuale e'
          in grigio, non nel colore della fetta: un 6% azzurrino su nero sta
          sotto il contrasto minimo, e il colore lo porta gia' il pallino
          (docs/aspetto.md §4.4). */}
      {nomi !== undefined && (
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {visibili.map((p) => {
            const peso = p.valore < 0n ? -p.valore : p.valore;
            const quota = totale === 0n ? 0 : Number((peso * 100n) / totale);
            return (
              <li key={p.chiave} className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
                <span
                  aria-hidden="true"
                  className="size-[7px] shrink-0 rounded-full"
                  style={{ background: tinte[p.chiave] ?? COLORE_IGNOTO }}
                />
                {/* Il non classificato non ha una riga in `discretion_classes`,
                    quindi nessuna mappa lo nomina: senza questo ripiego la
                    legenda lo scriveva minuscolo in mezzo a nomi propri. */}
                <span className="min-w-0 flex-1 truncate">
                  {nomi[p.chiave] ??
                    (p.chiave === 'non classificato' ? 'Non classificato' : p.chiave)}
                </span>
                <span className="cifra shrink-0 text-testo-3">{quota}%</span>
              </li>
            );
          })}
        </ul>
      )}
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
          <span className="cifra text-sm font-semibold">{formattaEuro(totale)}</span>
          <span className="text-[10px] text-testo-3">in categoria</span>
        </div>
      </div>

      <ul className="elenco w-full min-w-0 flex-1 text-sm">
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
              <span className="cifra shrink-0 whitespace-nowrap">
                {formattaEuro(p.valore)}
                <Freccia riga={voce.variazione} />
              </span>
              <Icona nome="chevron" misura={16} className="shrink-0 text-testo-3" />
            </>
          );
          return (
            <li key={p.chiave}>
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
