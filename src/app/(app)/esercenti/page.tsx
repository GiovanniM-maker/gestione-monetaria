import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import { CAMPO_PIENO, BOTTONE, BOTTONE_MINORE } from '@/lib/ui/controlli';
import { filtroValido, leggiEsercenti, PER_PAGINA, type Filtro } from '@/lib/tassonomia/esercenti';
import { Interruttore } from './interruttore';
import { SceltaCategoria } from '../scelta-categoria';
import { conta, TestataPagina } from '../testata';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Esercenti' };

/**
 * L'elenco degli esercenti — il CSV, ma dentro l'applicazione.
 *
 * Il giro di andata e ritorno con un foglio di calcolo si fa una volta; questa
 * pagina si usa ogni volta che serve. Ha le stesse colonne che avrebbe avuto il
 * foglio: quanto pesa, com'e' classificato, chi l'ha deciso, e i due flag.
 *
 * Ordinati per **spesa** e non per nome: un elenco alfabetico mette in cima
 * quello che comincia per A, mentre su trecento esercenti i primi cinquanta
 * valgono il 79% degli euro. Chi apre questa pagina vuole sistemare cio' che
 * pesa.
 *
 * I filtri e la ricerca stanno nell'indirizzo, non in uno stato del browser:
 * cosi' la pagina resta un componente server e una selezione si puo' mandare a
 * se' stessi come collegamento.
 */

const FILTRI: { chiave: Filtro; etichetta: string }[] = [
  { chiave: 'tutti', etichetta: 'tutti' },
  { chiave: 'variabili', etichetta: 'variabili' },
  { chiave: 'fissi', etichetta: 'fissi' },
  { chiave: 'da_confermare', etichetta: 'proposti dal modello' },
  { chiave: 'senza_categoria', etichetta: 'senza categoria' },
];

function centesimi(valore: string | null): bigint {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? 0n : totale;
}

function primo(v: string | string[] | undefined): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' && x.trim() !== '' ? x : null;
}

export default async function EsercentiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const filtro = filtroValido(p['filtro']);
  const cerca = primo(p['cerca']);
  const pagina = Math.max(0, Number(primo(p['pagina']) ?? 0) || 0);

  const supabase = await createSupabaseServerClient();
  const [{ righe, totale }, { data: albero }] = await Promise.all([
    leggiEsercenti(filtro, cerca, pagina),
    supabase.from('v_categorie_albero').select('id, percorso').order('percorso'),
  ]);

  const categorie = comeArray<{ id: string; percorso: string }>(albero);

  // Un solo posto costruisce gli indirizzi: filtro, ricerca e pagina viaggiano
  // insieme, e cambiarne uno non deve far perdere gli altri. Stringa vuota =
  // togli quel parametro.
  const indirizzo = (extra: Partial<Record<'filtro' | 'cerca' | 'pagina', string>>): string => {
    const q = new URLSearchParams();
    const valori = {
      filtro: filtro === 'tutti' ? '' : filtro,
      cerca: cerca ?? '',
      pagina: pagina === 0 ? '' : String(pagina),
      ...extra,
    };
    for (const [k, v] of Object.entries(valori)) if (v !== '') q.set(k, v);
    const s = q.toString();
    return s === '' ? '/esercenti' : `/esercenti?${s}`;
  };

  const ultimaPagina = Math.max(0, Math.ceil(totale / PER_PAGINA) - 1);

  return (
    <div className="space-y-5">
      <TestataPagina
        titolo="Esercenti"
        cifra={conta(totale)}
        etichetta={
          filtro === 'tutti' && cerca === null
            ? 'in tutto, dal più caro'
            : 'con questi filtri, dal più caro'
        }
        perche={
          <p>
            Un esercente <strong>fisso</strong> classifica tutte le sue spese allo stesso modo; uno{' '}
            <strong>variabile</strong> le fa decidere una per una. È il caso di un negozio dove
            compri sia un computer per lavorare sia una sciocchezza: nessuna regola sul nome può
            distinguerli, perché l’informazione non è nei dati bancari.
          </p>
        }
      />

      {/* La ricerca e' un form GET: nessun JavaScript, e l'indirizzo resta
          condivisibile. */}
      {/* La ricerca e' un form GET: nessun JavaScript, e l'indirizzo resta
          condivisibile. Il bottone sta **dentro** la riga del campo — a capo da
          solo era un blocco alto quarantaquattro pixel per una parola, e su un
          telefono Invio manda comunque il modulo. */}
      <form action="/esercenti" method="get" className="flex gap-2">
        {filtro !== 'tutti' && <input type="hidden" name="filtro" value={filtro} />}
        <input
          type="search"
          name="cerca"
          defaultValue={cerca ?? ''}
          placeholder="cerca per nome"
          className={`${CAMPO_PIENO} min-w-0 flex-1`}
        />
        <button type="submit" className={`${BOTTONE} shrink-0`}>
          Cerca
        </button>
        {cerca !== null && (
          <Link
            className={`${BOTTONE_MINORE} shrink-0`}
            href={indirizzo({ cerca: '', pagina: '' })}
          >
            azzera
          </Link>
        )}
      </form>

      {/* Le pastiglie **vanno a capo** invece di scorrere di lato: l'ultima
          diceva «sen…» e nessuno scorre una riga che sembra finita. */}
      <div className="flex flex-wrap gap-1.5">
        {FILTRI.map((f) => (
          <Link
            key={f.chiave}
            href={indirizzo({ filtro: f.chiave === 'tutti' ? '' : f.chiave, pagina: '' })}
            className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-[13px] sm:min-h-9 ${
              filtro === f.chiave
                ? 'bg-accento font-medium text-accento-testo'
                : 'bg-s2 text-testo-2'
            }`}
          >
            {f.etichetta}
          </Link>
        ))}
      </div>

      {righe.length === 0 ? (
        <p className="scheda p-6 text-center text-[14px] text-testo-2">
          Nessun esercente con questi filtri.
        </p>
      ) : (
        <ul className="scheda elenco px-4">
          {righe.map((e) => (
            <li key={e.id} className="space-y-1.5 py-2">
              <div className="flex items-start gap-3">
                <Link href={`/esercente/${e.id}`} className="min-w-0 flex-1 py-1">
                  <span className="block truncate text-[15px]">{e.canonical_name}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-testo-3">
                    {e.movimenti} {e.movimenti === 1 ? 'movimento' : 'movimenti'}
                    {e.discretion !== null && ` · ${e.discretion}`}
                    {e.is_subscription && ' · abbonamento'}
                    {e.origine === 'ai' && e.confermato_at === null && ' · proposto dal modello'}
                  </span>
                </Link>
                <span className="cifra shrink-0 pt-1 text-[15px]">
                  {formattaEuro(centesimi(e.totale))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Interruttore id={e.id} variabile={e.classificazione_variabile} compatto />
                {/* La categoria si cambia da qui: entrare nella scheda per
                  cambiarne una costa due navigazioni e un ritorno indietro, ed
                  e' la differenza fra sistemarne venti e sistemarne tre. */}
                <SceltaCategoria
                  ambito={{ tipo: 'esercente', merchantId: e.id }}
                  categoriaId={e.category_id}
                  categorie={categorie}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {ultimaPagina > 0 && (
        <nav className="flex items-center justify-between gap-3 text-sm">
          {pagina > 0 ? (
            <Link className={BOTTONE_MINORE} href={indirizzo({ pagina: String(pagina - 1) })}>
              ← precedenti
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-testo-2">
            pagina {pagina + 1} di {ultimaPagina + 1}
          </span>
          {pagina < ultimaPagina ? (
            <Link className={BOTTONE_MINORE} href={indirizzo({ pagina: String(pagina + 1) })}>
              successivi →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
