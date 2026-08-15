import Link from 'next/link';
import { formattaEuro } from '@/lib/abbonamenti/formato';
import { etichettaBreve, quotaPercentuale } from '@/lib/cruscotto/mesi';
import type { Variazione } from '@/lib/cruscotto/andamento';
import { Freccia } from './grafici';

/**
 * «Dove»: i pezzi di cui sono fatti tutti e quattro i livelli della discesa.
 *
 * ---------------------------------------------------------------------------
 * Perche' una schermata sola e non quattro
 * ---------------------------------------------------------------------------
 * Scendere dal totale del mese a un singolo movimento passa per quattro
 * schermate — classe, categoria, esercente, movimento — che rispondono tutte
 * alla **stessa domanda**: quanto qui, com'e' cambiato, di cosa e' fatto, e
 * dove si tocca per scendere ancora. Erano scritte quattro volte, e lo si
 * vedeva: il numerone aveva tre dimensioni diverse, «mese per mese» esisteva in
 * tre copie con tre altezze di barra, e l'elenco delle sottocategorie e quello
 * degli esercenti erano lo stesso codice con due nomi.
 *
 * Quattro copie della stessa cosa divergono alla prima modifica, e la schermata
 * che resta indietro e' sempre quella che si usa meno — cioe' quella che nessuno
 * prova. E' la stessa ragione per cui le altezze dei controlli stanno in
 * `lib/ui/controlli.ts` e le tinte in `globals.css`.
 *
 * ---------------------------------------------------------------------------
 * Sono componenti server
 * ---------------------------------------------------------------------------
 * Nessun byte di JavaScript per una discesa: i valori sono gia' noti quando la
 * pagina si costruisce. Chi chiama passa i **centesimi**, non le stringhe: la
 * conversione si fa una volta sola in cima alla pagina, dove si sa anche cosa
 * fare di un importo che non si legge.
 */

/* -------------------------------------------------------------------------- */
/* La testata                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Il cappello di un livello: da dove si torna, dove si e', quanto.
 *
 * L'importo e' un `.numerone` a 34 px in tutti e quattro i livelli. Prima erano
 * `text-3xl` qui, `text-2xl` la', `text-xl` altrove: scendendo, il numero
 * cambiava taglia a ogni tocco, e la stessa cifra sembrava contare di meno.
 */
export function TestataLivello({
  ritorno,
  titolo,
  sottotitolo,
  importo,
  variazione,
  nota,
  tinta,
  azioni,
}: {
  ritorno: { href: string; testo: string };
  titolo: string;
  sottotitolo?: string | null;
  importo: bigint;
  variazione?: Variazione | undefined;
  /** Cosa misura l'importo: «in agosto», «in tutto lo storico». */
  nota?: string | null;
  /** La classe che tinge appena la scheda, se il livello ne ha una. */
  tinta?: string | null;
  azioni?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Link
        href={ritorno.href}
        className="inline-flex min-h-11 items-center text-[13px] text-essenziale"
      >
        ‹ {ritorno.testo}
      </Link>

      <div
        className="scheda space-y-1.5 p-5"
        style={
          tinta === null || tinta === undefined
            ? undefined
            : {
                backgroundImage: `radial-gradient(24rem 12rem at 8% 0%, color-mix(in oklab, ${tinta} 26%, transparent), transparent 70%)`,
              }
        }
      >
        <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{titolo}</h1>
        {sottotitolo !== null && sottotitolo !== undefined && (
          <p className="text-[13px] text-testo-2">{sottotitolo}</p>
        )}
        <p className="numerone pt-1 text-[34px]">
          {formattaEuro(importo)}
          <Freccia riga={variazione} />
        </p>
        {nota !== null && nota !== undefined && <p className="text-[13px] text-testo-3">{nota}</p>}
      </div>

      {azioni !== undefined && <div className="flex flex-wrap gap-2">{azioni}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* La ripartizione                                                             */
/* -------------------------------------------------------------------------- */

export type VoceLivello = {
  chiave: string;
  etichetta: string;
  /** La riga piccola sotto il nome: quanti movimenti, che classe. */
  dettaglio?: string | null;
  valore: bigint;
  /** Dove porta il tocco. `null` per una voce che non si puo' aprire. */
  href: string | null;
  variazione?: Variazione | undefined;
};

/**
 * Di cosa e' fatto questo livello.
 *
 * Una voce senza `href` resta una riga di testo invece di diventare un
 * collegamento morto: i movimenti senza esercente non hanno una scheda dove
 * andare, e un tocco che non fa niente e' peggio di un tocco che non c'e'.
 */
export function Ripartizione({
  titolo,
  nota,
  voci,
}: {
  titolo: string;
  nota?: React.ReactNode;
  voci: readonly VoceLivello[];
}) {
  if (voci.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{titolo}</h2>
      {nota !== undefined && <p className="text-[13px] text-testo-3">{nota}</p>}
      <div className="scheda px-4">
        <ul className="elenco text-[15px]">
          {voci.map((v) => {
            const dentro = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{v.etichetta}</span>
                  {v.dettaglio !== null && v.dettaglio !== undefined && (
                    <span className="block truncate text-[12px] text-testo-3">{v.dettaglio}</span>
                  )}
                </span>
                <span className="cifra shrink-0 whitespace-nowrap">
                  {formattaEuro(v.valore)}
                  <Freccia riga={v.variazione} />
                </span>
              </>
            );
            return (
              <li key={v.chiave}>
                {v.href === null ? (
                  <span className="flex min-h-12 items-center gap-3">{dentro}</span>
                ) : (
                  <Link href={v.href} className="flex min-h-12 items-center gap-3">
                    {dentro}
                    <span aria-hidden="true" className="shrink-0 text-testo-3">
                      ›
                    </span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Mese per mese                                                               */
/* -------------------------------------------------------------------------- */

export type RigaMensile = { mese: string; valore: bigint };

/**
 * L'andamento nel tempo, uguale ovunque.
 *
 * Il massimo si calcola qui e non lo passa chi chiama: e' il piu' **negativo**
 * della serie, e ogni copia che se lo ricavava da sola era un'occasione per
 * confondere il minimo col massimo su numeri che sono tutti sotto zero.
 *
 * Tutta la riga e' il bersaglio, non la sola etichetta del mese: quattro
 * caratteri alti sedici pixel si sbagliano col pollice.
 */
export function MesePerMese({
  righe,
  corrente,
  href,
  titolo = 'Mese per mese',
}: {
  righe: readonly RigaMensile[];
  corrente?: string | null;
  href: (mese: string) => string;
  titolo?: string;
}) {
  if (righe.length < 2) return null;
  const massimo = righe.reduce((max, r) => (r.valore < max ? r.valore : max), 0n);

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{titolo}</h2>
      <div className="scheda px-4">
        <ul className="elenco">
          {righe.map((r) => {
            const qui = r.mese === corrente;
            return (
              <li key={r.mese}>
                <Link href={href(r.mese)} className="flex min-h-12 items-center gap-3">
                  {/* `whitespace-nowrap`: «ago 26» a tredici pixel non ci sta in
                      quarantotto, e andando a capo alza la riga di un piano. */}
                  <span
                    className={`w-14 shrink-0 text-[13px] whitespace-nowrap sm:w-16 ${
                      qui ? 'font-semibold text-testo' : 'text-testo-2'
                    }`}
                  >
                    {etichettaBreve(r.mese)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-s3">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${quotaPercentuale(r.valore, massimo)}%`,
                        background: qui ? 'var(--testo)' : 'var(--testo-3)',
                      }}
                    />
                  </span>
                  <span
                    className={`cifra w-24 shrink-0 text-right text-[13px] sm:w-28 ${
                      qui ? 'font-semibold' : 'text-testo-2'
                    }`}
                  >
                    {formattaEuro(r.valore)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
