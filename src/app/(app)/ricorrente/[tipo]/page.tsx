import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { leggiAspettoCategorie, leggiRicorrente, scegliMese } from '@/lib/cruscotto/letture';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { leggiRipartizioneRicorrente } from '@/lib/dove/leggi';
import { categorieComeNodi } from '@/lib/dove/nodi';
import {
  formattaEuro,
  ordinaPerPeso,
  sommaCosti,
  totalePerTipo,
  type RigaMetrica,
} from '@/lib/abbonamenti/formato';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import { Tessera } from '@/lib/ui/tessera';
import type { Nodo } from '@/lib/dove/nodi';
import { BarraClassi, ordineDelleClassi, tinteDelleClassi } from '../../grafici';
import { Fisarmonica } from '../../dove/fisarmonica';

export const dynamic = 'force-dynamic';

/**
 * La pagina di un tipo di ricorrente: Abbonamenti, o Abitudini.
 *
 * ---------------------------------------------------------------------------
 * La stessa gerarchia della home, ristretta a un tipo
 * ---------------------------------------------------------------------------
 * Le tessere del cruscotto davano un numero che non si poteva aprire, e un
 * numero che non si puo' aprire e' una domanda a cui la schermata rifiuta di
 * rispondere. Qui il numero si scende con la stessa discesa di tutto il resto
 * dell'applicazione — classe → categorie → voci → transazioni — cosi' chi ha
 * imparato la home ha gia' imparato questa.
 *
 * ---------------------------------------------------------------------------
 * Quello che si somma e' un TASSO, e va detto
 * ---------------------------------------------------------------------------
 * Il totale e ogni ramo sono costi **al mese** calcolati su tutto lo storico
 * (`costo_mensile`, la colonna della metrica), non la spesa di un mese: e' la
 * sola unita' in cui la somma dei rami torna col numero della tessera. Il
 * fondo della discesa sono le VOCI — Netflix, Deliveroo — perche' una
 * ricorrenza e' un esercente, e le sue transazioni sono i suoi addebiti.
 *
 * ---------------------------------------------------------------------------
 * Questa pagina legge, /abbonamenti gestisce
 * ---------------------------------------------------------------------------
 * I giudizi d'uso, le disdette e le voci escluse dalla metrica restano su
 * `/abbonamenti`: quella e' manutenzione, questa e' una risposta. Il
 * collegamento in fondo porta al blocco giusto.
 */

const DEFINIZIONI: Record<
  string,
  { titolo: string; sotto: string; illustrazione: string; ancora: string }
> = {
  abbonamento: {
    titolo: 'Abbonamenti',
    sotto: 'Contratti che si rinnovano da soli. Si disdicono, e il risparmio è certo.',
    illustrazione: '/illustrazioni/abbonamenti.webp',
    ancora: '/abbonamenti#abbonamento',
  },
  abitudine: {
    titolo: 'Abitudini',
    sotto: 'Niente da disdire: si ripete perché lo si rifà. Si cambiano, non si chiudono.',
    illustrazione: '/illustrazioni/abitudini.webp',
    ancora: '/abbonamenti#abitudine',
  },
};

export function generateMetadata(): Metadata {
  return { title: 'Ricorrente' };
}

function centesimi(valore: string | null): bigint {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? 0n : totale;
}

/** Le classi per la barra: i contesti si sommano, come sulla home. */
function perLaBarra(righe: readonly RigaMetrica[], ordine: readonly string[]) {
  const somma = (r: readonly RigaMetrica[]) =>
    r.reduce((s, v) => s + centesimi(v.costo_mensile), 0n);
  const note = ordine.map((nome) => ({
    chiave: nome,
    valore: somma(righe.filter((r) => r.discrezionalita === nome)),
  }));
  const resto = righe.filter((r) => !ordine.includes(r.discrezionalita));
  return resto.length === 0
    ? note
    : [...note, { chiave: 'non classificato', valore: somma(resto) }];
}

export default async function RicorrentePage({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const def = DEFINIZIONI[tipo];
  if (def === undefined) notFound();

  const [metrica, definizioni, { mese }, aspetto] = await Promise.all([
    leggiRicorrente(),
    leggiClassi(),
    // Il mese serve solo alla fisarmonica come chiave e parametro di rotta: i
    // numeri di questa pagina sono tassi su tutto lo storico, non un mese.
    scegliMese(null),
    leggiAspettoCategorie(),
  ]);

  const righe = metrica.filter((r) => r.tipo === tipo);
  const dentro = righe.filter((r) => r.nel_ricorrente);
  const fuori = righe.filter((r) => !r.nel_ricorrente);
  const totale = totalePerTipo(ordinaPerPeso(metrica), tipo);
  const tinte = tinteDelleClassi(definizioni);
  const barra = perLaBarra(dentro, ordineDelleClassi(definizioni));

  // Il primo livello sotto ogni classe, prefetto col server come sulla home:
  // il tocco che apre una classe non paga nessun viaggio. `catch` → il ramo
  // resta apribile col viaggio, e un eventuale errore (la 0050 non ancora
  // applicata) compare li' dentro, dove la fisarmonica sa mostrarlo.
  const figliDi = new Map<string, readonly Nodo[]>();
  await Promise.all(
    dentro.map(async (r) => {
      try {
        const sotto = await leggiRipartizioneRicorrente({
          tipo,
          classe: r.discrezionalita,
          contesto: r.contesto,
          categoria: null,
        });
        figliDi.set(
          `${r.discrezionalita}|${r.contesto}`,
          categorieComeNodi(sotto, mese, r.discrezionalita, r.contesto, tipo),
        );
      } catch {
        // Vedi sopra: un prefetch non deve poter rompere la pagina.
      }
    }),
  );

  // Le radici della discesa: una riga per classe e contesto, la piu' pesante
  // prima, il non classificato ultimo e sbiadito — le stesse regole della home.
  const radici: readonly Nodo[] = [...dentro]
    .sort((a, b) => {
      const ca = centesimi(a.costo_mensile);
      const cb = centesimi(b.costo_mensile);
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    })
    .sort(
      (a, b) => Number(a.discrezionalita === a.contesto) - Number(b.discrezionalita === b.contesto),
    )
    .map((r) => {
      const residuale = r.discrezionalita === r.contesto;
      const precaricati = figliDi.get(`${r.discrezionalita}|${r.contesto}`);
      return {
        chiave: `ric|${tipo}|${r.discrezionalita}|${r.contesto}`,
        etichetta: residuale ? r.classe_nome : `${r.classe_nome} · ${r.contesto}`,
        dettaglio: `${r.ricorrenze} ${r.ricorrenze === 1 ? 'voce' : 'voci'} · al mese`,
        importo: r.costo_mensile ?? '0',
        tinta: tinte[r.discrezionalita] ?? 'var(--neutro)',
        tessera: (
          <Tessera slug={r.discrezionalita} tinta={tinte[r.discrezionalita] ?? 'var(--neutro)'} />
        ),
        sbiadito: residuale,
        apertura: {
          tipo: 'categorie' as const,
          ricorrenza: tipo,
          classe: r.discrezionalita,
          contesto: r.contesto,
          categoria: null,
        },
        href: null,
        ...(precaricati === undefined ? {} : { precaricati }),
      };
    });

  return (
    <div className="space-y-8">
      {/* L'eroe senza carta, come sulla home: la gerarchia la danno la taglia
          e lo spazio. */}
      <div className="space-y-3 px-1 pt-1">
        <Link href="/" className="inline-flex min-h-11 items-center text-[13px] text-accento">
          ‹ Oggi
        </Link>
        <div className="flex items-start justify-between gap-3">
          <p className="eti">{def.titolo} · costo al mese</p>
          <img src={def.illustrazione} alt="" width={46} height={46} className="-mt-2 shrink-0" />
        </div>
        <p className="numerone text-[40px] sm:text-[46px]">{formattaEuro(totale)}</p>
        <p className="text-[13px] text-testo-2">{def.sotto}</p>

        {barra.length > 0 && dentro.length > 0 && (
          <BarraClassi
            voci={barra}
            tinte={tinte}
            nomi={Object.fromEntries(definizioni.map((d) => [d.slug, d.nome]))}
          />
        )}
      </div>

      {dentro.length === 0 ? (
        <p className="px-1 text-sm text-testo-2">
          Nessuna voce di questo tipo entra nel costo ricorrente, per ora.
        </p>
      ) : (
        <div className="space-y-3">
          <h2 className="eti px-1">Per classe</h2>
          {/* Tassi su tutto lo storico, non un mese: e' la differenza fra
              questa pagina e la home, e va detta dove si leggono i numeri. */}
          <p className="px-1 text-[13px] text-testo-3">
            Costi al mese, misurati su tutto lo storico. Una classe si apre sulle sue categorie, una
            categoria sulle sue voci, una voce sui suoi addebiti.
          </p>
          <Fisarmonica mese={mese} radici={radici} aspetto={aspetto} tinte={tinte} />
        </div>
      )}

      {/* Sotto la linea: quello che l'utente ha dichiarato di non voler
          togliere. Dirlo e' l'unica cosa che rende onesto il totale. */}
      {fuori.length > 0 && (
        <p className="px-1 text-[13px] text-testo-3">
          Fuori dal totale:{' '}
          <span className="cifra font-medium text-testo-2">
            {formattaEuro(fuori.reduce((s, r) => s + centesimi(r.costo_mensile), 0n))}
          </span>{' '}
          al mese su {fuori.reduce((s, r) => s + r.ricorrenze, 0)} voci di{' '}
          {[...new Set(fuori.map((r) => r.classe_nome))].join(', ')} — ricorrente, ma non da
          togliere.
        </p>
      )}

      <div className="px-1">
        <Link className={BOTTONE_MINORE} href={def.ancora}>
          gestisci le voci — giudizi d&rsquo;uso e disdette ›
        </Link>
      </div>
    </div>
  );
}
