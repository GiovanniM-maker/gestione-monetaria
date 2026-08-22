import type { Metadata } from 'next';
import Link from 'next/link';
import { aiConfigurata } from '@/lib/ai/modello';
import {
  giorniAllaScadenza,
  leggiConversazione,
  leggiConversazioni,
  nuovaConversazione,
  quando,
  type RigaConversazione,
} from '@/lib/copilota/conversazione';
import type { MessaggioSalvato } from '@/lib/copilota/messaggi';
import { BOTTONE } from '@/lib/ui/controlli';
import { MenuConversazione, NotaScadenza, Stella } from './gestione';
import { PannelloCopilota } from './pannello-copilota';
import { Icona } from '@/lib/ui/icone';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Copilota' };

/**
 * Il copilota e' un elenco di conversazioni, non una chat infinita.
 *
 * ---------------------------------------------------------------------------
 * Due schermate in un indirizzo
 * ---------------------------------------------------------------------------
 * `/copilota` e' l'elenco — salvate in cima, poi le recenti — e
 * `/copilota?c=<uuid>` e' una conversazione. Lo stato sta nell'indirizzo come
 * il mese del cruscotto: la pagina resta un componente server, una chat si
 * puo' riaprire, mandarsi, ritrovare domani dal telefono.
 *
 * ---------------------------------------------------------------------------
 * Il ciclo di vita
 * ---------------------------------------------------------------------------
 * Una conversazione non salvata vive 30 giorni dall'ultimo messaggio, poi la
 * pulizia notturna la elimina. La stella la salva per sempre. La scadenza NON
 * si ripete su ogni riga — sarebbe rumore che insegna a non leggere: vive nel
 * foglio di gestione, e compare in vista solo sotto i quattro giorni, col
 * gesto che la risolve accanto.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CopilotaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  const grezzo = typeof parametri['c'] === 'string' ? parametri['c'] : null;
  // Un identificativo malformato non arriva a una query: si torna all'elenco.
  const richiesta = grezzo !== null && UUID.test(grezzo) ? grezzo : null;

  const conversazioni = await leggiConversazioni();

  if (richiesta === null) return <Elenco conversazioni={conversazioni} />;

  const conversazione = conversazioni.find((c) => c.conversazione_id === richiesta) ?? null;
  const messaggi: readonly MessaggioSalvato[] =
    conversazione === null ? [] : await leggiConversazione(richiesta);
  const scadenza = conversazione === null ? null : giorniAllaScadenza(conversazione);

  return (
    <div className="space-y-4">
      {/* La testata della chat: indietro, il titolo, la stella, il menu.
          La stella sta fuori dal menu perche' e' l'unico controllo che decide
          se un dato sopravvive: un gesto cosi' non si nasconde dietro un
          altro gesto. */}
      <div className="flex items-center gap-2">
        <Link href="/copilota" className="tondo shrink-0">
          <span className="sr-only">Tutte le conversazioni</span>
          <Icona nome="chevron" misura={18} className="rotate-180 text-testo-2" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-corpo font-semibold tracking-[-0.02em]">
          {conversazione?.titolo ?? 'Nuova conversazione'}
        </h1>
        <Stella id={richiesta} salvata={conversazione?.salvata ?? false} />
        <MenuConversazione
          id={richiesta}
          titolo={conversazione?.titolo ?? null}
          salvata={conversazione?.salvata ?? false}
          giorniAllaScadenza={scadenza}
        />
      </div>

      {scadenza !== null && <NotaScadenza id={richiesta} giorni={scadenza} />}

      {!aiConfigurata() && (
        <p className="nota nota-avviso text-sec">
          <code>OPENROUTER_API_KEY</code> non è impostata su questo ambiente: il copilota non può
          rispondere. I numeri restano tutti visibili dal cruscotto.
        </p>
      )}

      <PannelloCopilota conversazioneId={richiesta} iniziali={messaggi} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* L'elenco                                                                    */
/* -------------------------------------------------------------------------- */

function Elenco({ conversazioni }: { conversazioni: readonly RigaConversazione[] }) {
  const salvate = conversazioni.filter((c) => c.salvata);
  const recenti = conversazioni.filter((c) => !c.salvata);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-titolo font-bold tracking-[-0.03em]">
          <img
            src="/illustrazioni/chiedi.webp"
            alt=""
            width={30}
            height={30}
            className="drop-shadow-[0_4px_10px_rgb(90_80_224/0.35)]"
          />
          Copilota
        </h1>
      </div>

      {!aiConfigurata() && (
        <p className="nota nota-avviso text-sec">
          <code>OPENROUTER_API_KEY</code> non è impostata su questo ambiente: il copilota non può
          rispondere. I numeri restano tutti visibili dal cruscotto.
        </p>
      )}

      {/* Un uuid nuovo a ogni disegno della pagina: aprirlo E' creare la
          conversazione, che esistera' davvero solo al primo messaggio. */}
      <Link className={BOTTONE} href={`/copilota?c=${nuovaConversazione()}`}>
        + Nuova conversazione
      </Link>

      <details className="text-sec text-testo-2">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-medium text-accento">
          di che cosa si pu&ograve; fidare?
        </summary>
        <p className="pb-2">
          Chiedi un numero e lo va a <strong>prendere</strong> dal database: non ne calcola nessuno,
          e le cifre che non risultano dai dati letti compaiono marcate sotto il messaggio. Le
          modifiche le <strong>prepara</strong>, e le applichi tu con un tocco — così ogni scrittura
          resta attribuibile a chi l&rsquo;ha voluta.
        </p>
      </details>

      {conversazioni.length === 0 && (
        <p className="px-1 text-sec text-testo-2">
          Nessuna conversazione, per ora. Le non salvate vivono 30 giorni dall&rsquo;ultimo
          messaggio; quelle con la stella restano per sempre.
        </p>
      )}

      {salvate.length > 0 && <Gruppo titolo="Salvate" righe={salvate} />}
      {recenti.length > 0 && (
        <Gruppo titolo={salvate.length > 0 ? 'Recenti' : undefined} righe={recenti} />
      )}
    </div>
  );
}

function Gruppo({
  titolo,
  righe,
}: {
  titolo?: string | undefined;
  righe: readonly RigaConversazione[];
}) {
  return (
    <section className="space-y-3">
      {titolo !== undefined && <h2 className="eti px-1">{titolo}</h2>}
      <div className="scheda px-4">
        <ul className="elenco">
          {righe.map((c) => (
            <li key={c.conversazione_id} className="flex items-center gap-1">
              <Link
                href={`/copilota?c=${c.conversazione_id}`}
                className="flex min-h-14 min-w-0 flex-1 flex-col justify-center py-2"
              >
                <span className="truncate text-corpo">{c.titolo ?? 'Conversazione vuota'}</span>
                <span className="text-min text-testo-2">
                  {quando(c.ultima_at)} · {c.messaggi} {c.messaggi === 1 ? 'messaggio' : 'messaggi'}
                </span>
              </Link>
              {/* La stella sulla riga: salvare non deve costare l'apertura. */}
              <Stella id={c.conversazione_id} salvata={c.salvata} compatta />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
